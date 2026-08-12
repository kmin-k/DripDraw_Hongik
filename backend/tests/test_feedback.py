"""맛 피드백 → 파라미터 조정 규칙 (rule-table.md 8-4절, 8-6절).

곡선을 그리지 않는 순수 계산 부분만 봅니다. API와 가드는 test_feedback_api.py에 있습니다.
"""

from app.services import constants as C
from app.services.feedback import UNEVEN_GRIND_NOTICE, adjust_parameters

#: 조정 여지가 양쪽에 남아 있는 파라미터.
#: 기준값 레시피의 96℃는 상한과 같아, 그대로 쓰면 "올리는" 조정을 확인할 수 없습니다.
BASE = {
    "ratio": 15.0,
    "water_temp_c": 94,
    "flow_rate_gps": 6.0,
    "grind_guide": "현재 분쇄도 유지",
    "drink_type": "HOT",
}
NEUTRAL = {"acidity": "OK", "bitterness": "OK", "strength": "OK"}


def adjust(**taste):
    return adjust_parameters(**BASE, **{**NEUTRAL, **taste})


def fields(result) -> dict[str, tuple]:
    return {c.field: (c.before, c.after) for c in result.changes}


class TestStrength:
    """농도는 Ratio만 건드립니다 (8-4절)."""

    def test_thin_lowers_ratio(self):
        """연하다 → 물을 줄여 진하게 만듭니다."""
        result = adjust(strength="THIN")
        assert result.ratio == 14.0
        assert fields(result)["ratio"] == (15.0, 14.0)

    def test_thick_raises_ratio(self):
        result = adjust(strength="THICK")
        assert result.ratio == 16.0

    def test_ok_changes_nothing(self):
        """만족은 dead zone입니다. 진동을 막습니다."""
        result = adjust()
        assert result.changes == []
        assert result.ratio == 15.0

    def test_ratio_is_clamped(self):
        """반복 피드백으로 Ratio가 무한 발산하지 않아야 합니다."""
        low, high = C.RATIO_RANGE["HOT"]
        result = adjust_parameters(**{**BASE, "ratio": high}, **{**NEUTRAL, "strength": "THICK"})
        assert result.ratio == high
        assert result.changes == []
        assert result.notices  # 왜 안 바뀌었는지 알려야 합니다.

        result = adjust_parameters(**{**BASE, "ratio": low}, **{**NEUTRAL, "strength": "THIN"})
        assert result.ratio == low

    def test_strength_does_not_touch_balance_parameters(self):
        """농도와 균형감은 서로 다른 파라미터를 씁니다 (8-6절)."""
        result = adjust(strength="THIN")
        assert result.water_temp_c == 94
        assert result.flow_rate_gps == 6.0


class TestBalance:
    """신맛·쓴맛은 물 온도·유량·분쇄도만 건드립니다 (8-6절)."""

    def test_bitter_means_over_extracted(self):
        """쓴맛 강함 → 덜 뽑아냅니다. 온도↓ 유량↑ 굵게."""
        result = adjust(bitterness="STRONG")
        assert result.water_temp_c == 93
        assert result.flow_rate_gps == 6.5
        assert result.grind_guide == "1단계 굵게"

    def test_weak_acidity_means_over_extracted_too(self):
        assert adjust(acidity="WEAK").water_temp_c == 93

    def test_sour_means_under_extracted(self):
        """신맛 강함 → 더 뽑아냅니다. 온도↑ 유량↓ 곱게."""
        result = adjust(acidity="STRONG")
        assert result.water_temp_c == 95
        assert result.flow_rate_gps == 5.5
        assert result.grind_guide == "1단계 곱게"

    def test_weak_bitterness_means_under_extracted_too(self):
        assert adjust(bitterness="WEAK").grind_guide == "1단계 곱게"

    def test_same_direction_signals_apply_only_once(self):
        """신호가 둘이라고 ±2℃가 되지 않습니다 (8-6절)."""
        one = adjust(bitterness="STRONG")
        two = adjust(bitterness="STRONG", acidity="WEAK")
        assert one.water_temp_c == two.water_temp_c == 93
        assert one.flow_rate_gps == two.flow_rate_gps

    def test_reason_names_every_signal(self):
        """무엇 때문에 바뀌었는지 표에 그대로 나가야 합니다."""
        result = adjust(bitterness="STRONG", acidity="WEAK")
        reason = next(c.reason for c in result.changes if c.field == "waterTempC")
        assert "쓴맛 강함" in reason and "신맛 약함" in reason

    def test_opposite_signals_cancel_out(self):
        """신맛·쓴맛이 함께 강하면 파라미터가 아니라 분쇄 균일성 문제입니다 (8-6절)."""
        result = adjust(acidity="STRONG", bitterness="STRONG")
        assert result.changes == []
        assert result.water_temp_c == 94
        assert UNEVEN_GRIND_NOTICE in result.notices

    def test_both_weak_also_cancels(self):
        result = adjust(acidity="WEAK", bitterness="WEAK")
        assert result.changes == []
        assert UNEVEN_GRIND_NOTICE in result.notices

    def test_cancelling_still_allows_strength_adjustment(self):
        """균형감이 상쇄돼도 농도는 별개 축이라 그대로 적용됩니다."""
        result = adjust(acidity="STRONG", bitterness="STRONG", strength="THIN")
        assert result.ratio == 14.0
        assert fields(result)["ratio"] == (15.0, 14.0)

    def test_temperature_is_clamped(self):
        result = adjust_parameters(
            **{**BASE, "water_temp_c": C.TEMP_RANGE[1]},
            **{**NEUTRAL, "acidity": "STRONG"},
        )
        assert result.water_temp_c == C.TEMP_RANGE[1]
        assert "waterTempC" not in fields(result)
        assert result.notices

    def test_flow_is_clamped(self):
        result = adjust_parameters(
            **{**BASE, "flow_rate_gps": C.FLOW_MIN},
            **{**NEUTRAL, "acidity": "STRONG"},
        )
        assert result.flow_rate_gps == C.FLOW_MIN
        assert "flowRateGps" not in fields(result)


class TestBothAxes:
    def test_strength_and_balance_do_not_collide(self):
        """농도는 Ratio, 균형감은 온도·유량·분쇄도. 겹치는 파라미터가 없습니다."""
        result = adjust(strength="THIN", bitterness="STRONG")
        changed = fields(result)
        assert changed["ratio"] == (15.0, 14.0)
        assert changed["waterTempC"] == (94, 93)
        assert changed["flowRateGps"] == (6.0, 6.5)
        assert result.notices == []
