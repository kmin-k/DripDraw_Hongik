"""Rule Engine — docs/rule-table.md를 코드화한 단일 구현.

프론트에 같은 계산을 복제하지 않습니다. 곡선 계산이 두 곳에 존재하면 반드시 불일치가 생깁니다.

계산 순서 (rule-table.md 3절~6절):
    입력 검증 → 물 온도 → 총 물량 → Bloom → 유량 → 주수 배분 → 타이밍 → Target Curve

**타이밍 모델** (8-8절): 주수는 로스팅별로 정해진 간격마다 시작합니다.
대기 시간은 간격에서 푸어 시간을 뺀 나머지로 자연히 정해집니다.
이전에는 대기를 총 시간에서 역산했는데, 그러면 유량을 올릴수록 대기가 길어져
실제 추출과 반대로 움직였습니다.

상수는 전부 constants.py에서 가져옵니다 (8-7절). 이 파일에 숫자 리터럴을 두지 마세요.
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.services import constants as C


class RuleViolation(ValueError):
    """입력이 규칙의 유효 범위를 벗어난 경우. 라우터가 400으로 변환합니다."""


@dataclass(frozen=True)
class Pour:
    phase: str  # BLOOM | SECOND | THIRD | FOURTH
    water_g: int
    start_sec: int
    end_sec: int


@dataclass(frozen=True)
class GeneratedRecipe:
    water_temp_c: int
    total_water_g: int
    ratio: float
    flow_rate_gps: float
    bloom_water_g: int
    bloom_wait_sec: int
    #: 주수를 시작하는 간격. 대기 시간은 여기서 푸어 시간을 뺀 값입니다.
    pour_interval_sec: int
    #: 마지막 주수 시작 + 드립다운. 물이 다 빠지는 시점입니다.
    total_time_sec: int
    grind_guide: str
    ice_message: str | None
    pours: list[Pour]
    target_curve: list[list[int]]


def _round_half_up(value: float) -> int:
    """엑셀 ROUND와 같은 반올림.

    파이썬 기본 round()는 은행가 반올림(0.5를 짝수로)이라 엑셀과 어긋납니다.
    원본이 엑셀이므로 half-up으로 맞춥니다 (8-3절).
    """
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _validate(dose_g: int, drink_type: str, roast_level: str, region: str, process: str) -> None:
    if not C.DOSE_MIN_G <= dose_g <= C.DOSE_MAX_G:
        raise RuleViolation(
            f"doseG must be between {C.DOSE_MIN_G} and {C.DOSE_MAX_G} (got {dose_g})"
        )
    if drink_type not in C.RATIO:
        raise RuleViolation(f"unknown drinkType: {drink_type}")
    if roast_level not in C.BASE_TEMP_C:
        raise RuleViolation(f"unknown roastLevel: {roast_level}")
    if region not in C.REGION_TEMP_ADJ:
        raise RuleViolation(f"unknown region: {region}")
    if process not in C.PROCESS_TEMP_ADJ:
        raise RuleViolation(f"unknown process: {process}")


def _water_temp(roast_level: str, region: str, process: str) -> int:
    """3절: 기본값(로스팅) + 지역 보정 + 가공방식 보정."""
    return (
        C.BASE_TEMP_C[roast_level]
        + C.REGION_TEMP_ADJ[region][roast_level]
        + C.PROCESS_TEMP_ADJ[process]
    )


def _flow_rate(roast_level: str, region: str, drink_type: str, d50_um: float) -> float:
    """5절: clamp(기본값 + 지역 보정 + D50 보정, FLOW_MIN, FLOW_MAX)."""
    low, high = C.D50_RANGE[drink_type]
    if d50_um < low:
        d50_adj = C.D50_FLOW_ADJ_FINE
    elif d50_um > high:
        d50_adj = C.D50_FLOW_ADJ_COARSE
    else:
        d50_adj = 0.0

    raw = C.BASE_FLOW_GPS[roast_level] + C.REGION_FLOW_ADJ[region] + d50_adj
    return max(C.FLOW_MIN, min(C.FLOW_MAX, raw))


def _grind_guide(drink_type: str, d50_um: float) -> str:
    """8-5절: 1단계 = 50 μm. 상대 안내 텍스트만 출력하고 누적 저장하지 않습니다."""
    low, high = C.D50_RANGE[drink_type]
    if d50_um < low:
        steps = _round_half_up((low - d50_um) / C.GRIND_STEP_UM)
        return f"{steps}단계 굵게" if steps else "현재 분쇄도 유지"
    if d50_um > high:
        steps = _round_half_up((d50_um - high) / C.GRIND_STEP_UM)
        return f"{steps}단계 곱게" if steps else "현재 분쇄도 유지"
    return "현재 분쇄도 유지"


def generate_recipe(
    *,
    dose_g: int,
    drink_type: str,
    roast_level: str,
    region: str,
    process: str,
    d50_um: float,
    ratio_override: float | None = None,
) -> GeneratedRecipe:
    """입력 조건으로 Target Curve를 생성합니다.

    ratio_override는 Phase 4 피드백 보정용입니다. 기본 Ratio 대신 조정된 값을 넣습니다.
    이때 한 번에 부을 물량이 늘어 푸어가 간격을 넘길 수 있으므로 아래 검사가 필요합니다 (8-4절).
    """
    _validate(dose_g, drink_type, roast_level, region, process)

    ratio = ratio_override if ratio_override is not None else C.RATIO[drink_type]

    # --- 물량 (4절, 6절) ---
    total_water = _round_half_up(dose_g * ratio)
    bloom_water = _round_half_up(dose_g * C.BLOOM_MULTIPLIER[roast_level])
    remaining = total_water - bloom_water

    second = _round_half_up(remaining * C.POUR_SPLIT[0])
    third = _round_half_up(remaining * C.POUR_SPLIT[1])
    fourth = remaining - second - third  # 잔량. 반올림 오차를 흡수합니다 (8-3절).

    # --- 유량과 타이밍 (5절, 6절) ---
    flow = _flow_rate(roast_level, region, drink_type, d50_um)
    interval = C.POUR_INTERVAL_SEC[roast_level]

    # 8-1절: 한 번에 붓는 양이 많고 유량이 낮으면 푸어가 다음 주수 시작 시각을 넘겨
    # 타임라인이 역행하고 곡선이 깨집니다. 가장 많이 붓는 2차가 기준입니다.
    longest_pour_sec = second / flow
    if longest_pour_sec > interval:
        raise RuleViolation(
            f"한 번에 붓는 시간({longest_pour_sec:.1f}초)이 주수 간격({interval}초)을 넘습니다. "
            f"현재 원두량 {dose_g} g에서는 물을 더 늘릴 수 없습니다."
        )

    # 주수는 간격마다 시작합니다. 대기는 간격에서 푸어 시간을 뺀 나머지입니다.
    starts = [0.0, float(interval), float(interval * 2), float(interval * 3)]
    amounts = [bloom_water, second, third, fourth]
    phases = ["BLOOM", "SECOND", "THIRD", "FOURTH"]

    pours: list[Pour] = []
    for phase, amount, start in zip(phases, amounts, starts, strict=True):
        # Bloom은 물량과 무관하게 10초 동안 붓습니다.
        duration = C.BLOOM_POUR_SEC if phase == "BLOOM" else amount / flow
        pours.append(Pour(phase, amount, _round_half_up(start), _round_half_up(start + duration)))

    # 마지막 주수를 시작한 뒤 물이 다 빠질 때까지가 총 추출 시간입니다.
    total_time = _round_half_up(starts[-1] + C.DRAWDOWN_SEC)

    # --- Target Curve (6절) ---
    # 주수마다 (시작, 직전까지 누적) → (종료, 그 주수까지 누적) 두 점.
    # 대기 구간은 두 점 사이의 수평선으로 자연히 표현됩니다.
    curve: list[list[int]] = []
    cumulative = 0
    for pour in pours:
        curve.append([pour.start_sec, cumulative])
        cumulative += pour.water_g
        curve.append([pour.end_sec, cumulative])

    # 드립다운 구간. 물을 붓지 않으므로 수평이며, 화면에 "이제 기다리세요"가 보입니다.
    if total_time > curve[-1][0]:
        curve.append([total_time, cumulative])

    return GeneratedRecipe(
        water_temp_c=_water_temp(roast_level, region, process),
        total_water_g=total_water,
        ratio=ratio,
        flow_rate_gps=flow,
        bloom_water_g=bloom_water,
        bloom_wait_sec=interval - C.BLOOM_POUR_SEC,
        pour_interval_sec=interval,
        total_time_sec=total_time,
        grind_guide=_grind_guide(drink_type, d50_um),
        ice_message=("얼음이 가득 담긴 컵에 부어 드세요!" if drink_type == "ICE" else None),
        pours=pours,
        target_curve=curve,
    )
