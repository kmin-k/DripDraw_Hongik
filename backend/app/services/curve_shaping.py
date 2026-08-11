"""실측 곡선을 따라 하기 쉬운 목표 곡선으로 다듬습니다.

자유 모드로 내린 추출이 마음에 들었을 때 그 곡선을 다음 목표로 삼는 기능(6단계)에 씁니다.

**실측을 그대로 목표로 쓰면 안 됩니다.** 초당 9.3회 측정된 2,000여 점에는 손떨림과
저울 진동이 그대로 들어 있어, 그걸 목표로 삼으면 "내가 흔들린 것까지 따라 하라"가 됩니다.

대신 **주수 구간만 찾아내 규칙 엔진과 같은 구조**(붓기 → 대기 → 붓기 …)로 다시 그립니다.
결과 곡선은 Rule Engine이 만든 것과 형태가 같아 화면과 RMSE 계산이 그대로 동작합니다.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from app.services.rmse import interpolate_at

Curve = Sequence[Sequence[float]]

#: 이보다 빠르게 무게가 늘면 "붓는 중"으로 봅니다. 실제 주수는 5~12 g/s입니다.
POURING_FLOW_GPS = 1.5
#: 이보다 짧은 구간은 노이즈로 보고 버립니다.
MIN_POUR_SEC = 1.5
#: 이보다 적게 늘어난 구간도 버립니다. 실제 주수는 한 번에 40~100 g입니다.
MIN_POUR_GAIN_G = 10.0
#: 판정용 격자 간격. 점마다 기울기를 재면 노이즈에 그대로 흔들립니다.
GRID_SEC = 0.5
#: 기울기를 재기 전에 이 길이로 평균을 냅니다. 노이즈를 미분하면 값이 폭주합니다.
SMOOTH_SEC = 3.0
#: 기울기를 재는 구간 길이. 이웃한 두 점만 보면 작은 흔들림에도 판정이 뒤집힙니다.
RATE_WINDOW_SEC = 2.0
#: 이보다 짧게 끊긴 구간은 같은 주수로 봅니다. 실제 대기는 15~25초라 여유가 있습니다.
#: **한계**: 이보다 촘촘히 부으면 한 번의 주수로 인식됩니다.
MERGE_GAP_SEC = 6.0


@dataclass(frozen=True)
class DetectedPour:
    start_sec: float
    end_sec: float
    water_g: float


def _clean(curve: Curve) -> list[tuple[float, float]]:
    """시간 오름차순 정렬 + 누적 물량이 줄지 않도록 정리.

    추출 중 드리퍼를 살짝 들면 무게가 잠깐 내려갑니다. 실측 기록으로는 남겨야 하지만
    **목표 곡선으로는 부적절**하므로 여기서 단조 증가로 만듭니다.
    """
    points = sorted(((float(t), float(w)) for t, w in curve), key=lambda p: p[0])
    out: list[tuple[float, float]] = []
    peak = float("-inf")
    for t, w in points:
        peak = max(peak, w)
        out.append((t, peak))
    return out


def _resample(points: list[tuple[float, float]], step: float) -> list[tuple[float, float]]:
    """일정 간격 격자로 다시 찍습니다. 기울기 판정을 안정시키기 위해서입니다."""
    if len(points) < 2:
        return points

    end = points[-1][0]
    grid: list[tuple[float, float]] = []
    index = 0
    t = points[0][0]
    while t <= end + 1e-9:
        while index + 1 < len(points) and points[index + 1][0] < t:
            index += 1
        if index + 1 >= len(points):
            grid.append((t, points[-1][1]))
        else:
            (t0, w0), (t1, w1) = points[index], points[index + 1]
            span = t1 - t0
            weight = w1 if span <= 0 else w0 + (w1 - w0) * (t - t0) / span
            grid.append((t, weight))
        t += step
    return grid


def _smooth(points: list[tuple[float, float]], window_sec: float) -> list[tuple[float, float]]:
    """이동 평균. 노이즈가 섞인 값을 그대로 미분하면 기울기가 폭주합니다."""
    half = max(1, int(window_sec / GRID_SEC / 2))
    smoothed: list[tuple[float, float]] = []
    for i, (t, _) in enumerate(points):
        lo, hi = max(0, i - half), min(len(points), i + half + 1)
        window = points[lo:hi]
        smoothed.append((t, sum(w for _, w in window) / len(window)))
    return smoothed


def _merge_close(pours: list[DetectedPour], gap_sec: float) -> list[DetectedPour]:
    """짧게 끊긴 구간을 한 번의 주수로 잇습니다.

    노이즈 때문에 붓는 도중 기울기가 잠깐 기준 아래로 떨어지면 한 번의 주수가 여러 조각이 됩니다.
    실제 대기는 15~25초라, 몇 초짜리 틈은 같은 주수로 보는 것이 맞습니다.
    """
    if not pours:
        return []

    merged = [pours[0]]
    for pour in pours[1:]:
        last = merged[-1]
        if pour.start_sec - last.end_sec <= gap_sec:
            merged[-1] = DetectedPour(last.start_sec, pour.end_sec, last.water_g + pour.water_g)
        else:
            merged.append(pour)
    return merged


def detect_pours(curve: Curve) -> list[DetectedPour]:
    """실측 곡선에서 주수 구간을 찾아냅니다.

    무게가 빠르게 느는 구간이 주수, 평평한 구간이 대기입니다.
    평활화 → 기울기 판정 → 짧은 틈 잇기 → 작은 조각 버리기 순으로 처리합니다.
    """
    points = _smooth(_resample(_clean(curve), GRID_SEC), SMOOTH_SEC)
    if len(points) < 2:
        return []

    # 이웃한 두 점이 아니라 일정 길이 구간의 기울기를 봅니다.
    span = max(1, int(RATE_WINDOW_SEC / GRID_SEC))
    pouring: list[bool] = []
    for i in range(len(points) - 1):
        j = min(i + span, len(points) - 1)
        elapsed = points[j][0] - points[i][0]
        rate = (points[j][1] - points[i][1]) / elapsed if elapsed > 0 else 0.0
        pouring.append(rate >= POURING_FLOW_GPS)

    raw: list[DetectedPour] = []
    start_index: int | None = None
    for i, is_pouring in enumerate([*pouring, False]):
        if is_pouring and start_index is None:
            start_index = i
        elif not is_pouring and start_index is not None:
            start, end = points[start_index], points[i]
            raw.append(DetectedPour(start[0], end[0], end[1] - start[1]))
            start_index = None

    # 노이즈로 생긴 짧고 작은 구간은 버립니다.
    return [
        pour
        for pour in _merge_close(raw, MERGE_GAP_SEC)
        if pour.end_sec - pour.start_sec >= MIN_POUR_SEC and pour.water_g >= MIN_POUR_GAIN_G
    ]


def shape_target_curve(curve: Curve) -> list[list[int]]:
    """실측 곡선 → 따라 하기 쉬운 목표 곡선.

    주수마다 (시작, 직전 누적) → (종료, 이후 누적) 두 점만 남깁니다.
    대기 구간은 두 점 사이의 수평선이 되어, 규칙 엔진이 만든 곡선과 같은 구조가 됩니다.
    """
    pours = detect_pours(curve)
    if not pours:
        return []

    cleaned = _clean(curve)
    final_weight = cleaned[-1][1]

    # 물량은 평활화 전 곡선에서 잽니다. 평활화한 값으로 재면 주수 앞뒤 끝이 깎여 총량이 모자랍니다.
    amounts = [
        interpolate_at(cleaned, pour.end_sec) - interpolate_at(cleaned, pour.start_sec)
        for pour in pours
    ]
    # 마지막 주수가 잔량을 흡수해 총량이 실제로 부은 양과 맞도록 합니다.
    # 규칙 엔진에서 4차를 잔량으로 계산하는 것과 같은 이유입니다 (rule-table.md 8-3절).
    amounts[-1] += final_weight - sum(amounts)

    shaped: list[list[int]] = []
    cumulative = 0.0
    for pour, amount in zip(pours, amounts, strict=True):
        shaped.append([round(pour.start_sec), round(cumulative)])
        cumulative += amount
        shaped.append([round(pour.end_sec), round(cumulative)])

    # 첫 주수가 0초에 시작하지 않으면 원점을 앞에 붙입니다.
    if shaped[0][0] > 0:
        shaped.insert(0, [0, 0])

    # 마지막 주수 이후 물이 빠지는 구간. 실측이 끝난 시점까지 수평으로 잇습니다.
    last_time = round(cleaned[-1][0])
    if last_time > shaped[-1][0]:
        shaped.append([last_time, shaped[-1][1]])

    return shaped
