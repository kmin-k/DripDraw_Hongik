"""맛 피드백 → 레시피 보정 (Phase 4).

docs/rule-table.md 8-4절·8-6절을 코드화했습니다.

**이 파일은 파라미터만 계산하고 곡선은 그리지 않습니다.** 곡선은 rule_engine.build_pour_plan이
규칙 레시피와 똑같이 그립니다. 보정 쪽에 곡선 계산을 복제하면 두 곡선이 서서히 어긋납니다.

조정 방향의 근거:

- 농도(strength)는 **Ratio만** 건드립니다. 연하면 물을 줄이고, 진하면 물을 늘립니다.
- 균형감(신맛·쓴맛)은 **물 온도·유량·분쇄도만** 건드립니다.
  신맛이 강하거나 쓴맛이 약하면 과소추출 → 더 뽑아냅니다(온도↑·유량↓·곱게).
  쓴맛이 강하거나 신맛이 약하면 과다추출 → 덜 뽑아냅니다(온도↓·유량↑·굵게).

두 축이 서로 다른 파라미터를 쓰기 때문에 충돌이 없습니다 (8-6절).

**한계**: 8-6절의 조정 폭은 문헌 근거가 없는 휴리스틱입니다. 실측 후 튜닝을 전제로 합니다.
"""

from dataclasses import dataclass

from app.services import constants as C

#: 과소추출 신호. 더 뽑아내는 방향으로 조정합니다.
UNDER_EXTRACTED = {"acidity": "STRONG", "bitterness": "WEAK"}
#: 과다추출 신호. 덜 뽑아내는 방향으로 조정합니다.
OVER_EXTRACTED = {"acidity": "WEAK", "bitterness": "STRONG"}

LABELS = {
    ("acidity", "STRONG"): "신맛 강함",
    ("acidity", "WEAK"): "신맛 약함",
    ("bitterness", "STRONG"): "쓴맛 강함",
    ("bitterness", "WEAK"): "쓴맛 약함",
    ("strength", "THICK"): "농도 진함",
    ("strength", "THIN"): "농도 연함",
}

#: 신맛·쓴맛이 서로 반대 방향을 가리키면 파라미터가 아니라
#: 분쇄 균일성 문제일 가능성이 큽니다 (8-6절).
UNEVEN_GRIND_NOTICE = "신맛과 쓴맛이 함께 강합니다. 분쇄도 균일성을 확인해 보세요"


@dataclass(frozen=True)
class Change:
    """`changes` 표 한 줄. **발표의 핵심**이라 이유를 반드시 함께 남깁니다 (docs/api.md)."""

    field: str
    before: float | str
    after: float | str
    reason: str


@dataclass(frozen=True)
class Adjustment:
    ratio: float
    water_temp_c: int
    flow_rate_gps: float
    grind_guide: str
    changes: list[Change]
    #: 조정하지 못한 이유. 여러 건이 동시에 생길 수 있어 목록입니다.
    notices: list[str]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _balance_direction(acidity: str, bitterness: str) -> tuple[int, str, bool]:
    """신맛·쓴맛 → (방향, 이유 라벨, 상쇄 여부).

    방향은 과소추출 +1 / 과다추출 -1 / 없음 0입니다.

    같은 방향 신호가 둘이어도 **1회만 적용**합니다. 신호가 둘이라고 ±2℃가 되지 않습니다 (8-6절).
    """
    tastes = {"acidity": acidity, "bitterness": bitterness}
    under = [LABELS[(k, v)] for k, v in tastes.items() if UNDER_EXTRACTED.get(k) == v]
    over = [LABELS[(k, v)] for k, v in tastes.items() if OVER_EXTRACTED.get(k) == v]

    if under and over:
        # 과소·과다 신호가 공존하면 상쇄하고 조정하지 않습니다.
        return 0, "", True
    if under:
        return 1, " · ".join(under), False
    if over:
        return -1, " · ".join(over), False
    return 0, "", False


def adjust_parameters(
    *,
    ratio: float,
    water_temp_c: int,
    flow_rate_gps: float,
    grind_guide: str | None,
    drink_type: str,
    acidity: str,
    bitterness: str,
    strength: str,
) -> Adjustment:
    """현재 레시피 파라미터와 맛 평가를 받아 보정된 파라미터를 돌려줍니다.

    조정 폭은 8-4절·8-6절 — Ratio ±1.0, 물 온도 ±1℃, 유량 ±0.5 g/s, 분쇄도 ±1단계.
    모든 값은 마지막에 상·하한으로 클램프합니다. 반복 피드백으로 값이 발산하는 것을 막습니다.
    """
    changes: list[Change] = []
    notices: list[str] = []

    # --- 농도 → Ratio (8-4절) ---
    new_ratio = ratio
    if strength in ("THIN", "THICK"):
        # 연하면 물을 줄이고(Ratio↓), 진하면 늘립니다(Ratio↑). 만족(OK)은 dead zone입니다.
        step = -C.RATIO_STEP if strength == "THIN" else C.RATIO_STEP
        low, high = C.RATIO_RANGE[drink_type]
        new_ratio = _clamp(ratio + step, low, high)
        if new_ratio == ratio:
            notices.append(f"물 비율이 한계({low:g}~{high:g})에 도달해 더 조정할 수 없습니다")
        else:
            changes.append(Change("ratio", ratio, new_ratio, LABELS[("strength", strength)]))

    # --- 균형감 → 물 온도·유량·분쇄도 (8-6절) ---
    direction, reason, cancelled = _balance_direction(acidity, bitterness)
    if cancelled:
        notices.append(UNEVEN_GRIND_NOTICE)

    new_temp = water_temp_c
    new_flow = flow_rate_gps
    new_grind = grind_guide or "현재 분쇄도 유지"

    if direction != 0:
        # 과소추출(+1)이면 온도를 올리고 유량을 낮추고 곱게, 과다추출(-1)이면 반대입니다.
        new_temp = int(_clamp(water_temp_c + direction * C.TEMP_STEP_C, *C.TEMP_RANGE))
        new_flow = _clamp(flow_rate_gps - direction * C.FLOW_STEP_GPS, C.FLOW_MIN, C.FLOW_MAX)
        # 분쇄도는 누적 상태로 저장하지 않고 안내 텍스트만 냅니다 (8-5절).
        new_grind = "1단계 곱게" if direction > 0 else "1단계 굵게"

        if new_temp != water_temp_c:
            changes.append(Change("waterTempC", water_temp_c, new_temp, reason))
        else:
            notices.append(
                f"물 온도가 한계({C.TEMP_RANGE[0]}~{C.TEMP_RANGE[1]}℃)에 도달해 "
                "더 조정할 수 없습니다"
            )
        if new_flow != flow_rate_gps:
            changes.append(Change("flowRateGps", flow_rate_gps, new_flow, reason))
        else:
            notices.append(
                f"유량이 한계({C.FLOW_MIN:g}~{C.FLOW_MAX:g} g/s)에 도달해 더 조정할 수 없습니다"
            )
        changes.append(Change("grindGuide", grind_guide or "현재 분쇄도 유지", new_grind, reason))

    return Adjustment(
        ratio=new_ratio,
        water_temp_c=new_temp,
        flow_rate_gps=new_flow,
        grind_guide=new_grind,
        changes=changes,
        notices=notices,
    )
