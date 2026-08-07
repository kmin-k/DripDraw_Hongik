"""추출 정확도(RMSE) 계산 — docs/api.md "RMSE 정의"

목표 곡선은 8개 점의 구간 선형 곡선이고 실측은 100 ms 샘플링이라 **점의 개수와 시각이 다릅니다.**
실측 각 시각에서 목표를 선형 보간해 대응값을 만든 뒤 비교합니다.

⚠️ 이 로직은 프론트엔드(frontend/src/lib/rmse.ts)에도 같은 내용으로 존재합니다.
실시간 표시는 브라우저가, 저장은 서버가 계산하는데 두 값이 다르면 안 됩니다.
**한쪽을 고치면 반드시 다른 쪽과 양쪽 테스트를 함께 고치세요.**
"""

from collections.abc import Sequence
from math import sqrt

Curve = Sequence[Sequence[float]]  # [[time, weight], ...] 시간 오름차순


def interpolate_at(curve: Curve, t: float) -> float:
    """구간 선형 보간. 곡선 범위를 벗어나면 양 끝값을 유지합니다.

    끝을 넘긴 구간에 페널티를 주지 않는 이유는, 추출이 목표 시간보다 길어지는 것 자체는
    오차가 아니고 그 시점의 물량 차이만 오차이기 때문입니다.
    """
    if not curve:
        raise ValueError("빈 곡선은 보간할 수 없습니다")

    if t <= curve[0][0]:
        return float(curve[0][1])
    if t >= curve[-1][0]:
        return float(curve[-1][1])

    for i in range(1, len(curve)):
        t1, w1 = curve[i][0], curve[i][1]
        if t <= t1:
            t0, w0 = curve[i - 1][0], curve[i - 1][1]
            span = t1 - t0
            # 같은 시각에 두 점이 있으면(수직 구간) 나중 값을 씁니다.
            if span == 0:
                return float(w1)
            return float(w0 + (w1 - w0) * (t - t0) / span)

    return float(curve[-1][1])


def calculate_rmse(target: Curve, actual: Curve) -> float | None:
    """실측이 목표에서 얼마나 벗어났는지. 단위는 g.

    실측이 없으면 None입니다. 0이 아닌 이유는 "측정하지 않음"과 "오차 0"이 다르기 때문입니다.
    """
    if not actual or not target:
        return None

    total = 0.0
    for point in actual:
        diff = float(point[1]) - interpolate_at(target, float(point[0]))
        total += diff * diff

    return sqrt(total / len(actual))
