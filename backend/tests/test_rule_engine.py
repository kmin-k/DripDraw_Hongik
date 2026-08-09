"""Rule Engine 회귀 테스트.

기준값은 docs/rule-table.md 7절 검증 예시입니다.
기준값의 근거는 **국내 로스터리 브루잉 가이드 15종**입니다(8-8절).
초기 문헌값은 유량이 실제의 절반 수준이고 대기가 과도해 실사용과 맞지 않아 교체했습니다.

규칙을 바꾸면 이 파일도 같은 PR에서 갱신합니다 (CONTRIBUTING.md "Rule Table 원본 관리").
"""

import pytest

from app.services import constants as C
from app.services.rule_engine import RuleViolation, generate_recipe

# 7절 검증 예시: 원두량 20 g / 핫 / 라이트 / 아프리카 / 워시드 / D50 950 μm
GOLDEN_INPUT = dict(
    dose_g=20,
    drink_type="HOT",
    roast_level="LIGHT",
    region="AFRICA",
    process="WASHED",
    d50_um=950,
)


@pytest.fixture
def golden():
    return generate_recipe(**GOLDEN_INPUT)


class TestGoldenExample:
    """7절 표의 모든 항목을 하나씩 고정합니다."""

    def test_water_temp(self, golden):
        assert golden.water_temp_c == 96  # 94 + 2(아프리카) + 0(워시드)

    def test_total_water(self, golden):
        assert golden.total_water_g == 300  # 20 × 15

    def test_bloom_water(self, golden):
        assert golden.bloom_water_g == 56  # 20 × 2.8

    def test_flow_rate(self, golden):
        assert golden.flow_rate_gps == 6.0  # 7.0 − 1.0(아프리카) + 0

    def test_pour_amounts(self, golden):
        amounts = [p.water_g for p in golden.pours]
        assert amounts == [56, 98, 81, 65]  # Bloom / 2차 / 3차 / 4차(잔량)

    def test_pours_start_on_a_fixed_cadence(self, golden):
        """주수는 간격마다 시작합니다. 대기는 간격에서 푸어 시간을 뺀 나머지입니다."""
        assert golden.pour_interval_sec == 35
        assert [p.start_sec for p in golden.pours] == [0, 35, 70, 105]

    def test_total_time_is_last_pour_plus_drawdown(self, golden):
        """마지막 주수 시작(105초) + 드립다운 60초 = 165초."""
        assert golden.total_time_sec == 165

    def test_target_curve(self, golden):
        """★ 최종 산출물. 좌표가 전부 일치해야 합니다."""
        assert golden.target_curve == [
            [0, 0],
            [10, 56],
            [35, 56],
            [51, 154],
            [70, 154],
            [84, 235],
            [105, 235],
            [116, 300],
            [165, 300],  # 드립다운 — 물을 붓지 않는 구간
        ]

    def test_grind_guide_in_range(self, golden):
        # D50 950은 핫 기준 범위 950~1250 안
        assert golden.grind_guide == "현재 분쇄도 유지"

    def test_no_ice_message_for_hot(self, golden):
        assert golden.ice_message is None


class TestInvariants:
    """입력이 바뀌어도 항상 성립해야 하는 성질."""

    @pytest.mark.parametrize("dose", [10, 15, 20, 25, 30])
    @pytest.mark.parametrize("roast", ["LIGHT", "MEDIUM", "DARK"])
    @pytest.mark.parametrize("drink", ["HOT", "ICE"])
    def test_pour_amounts_sum_to_total(self, dose, roast, drink):
        """4차를 잔량으로 계산하므로 반올림 오차가 총합을 깨뜨리면 안 됩니다 (8-3절)."""
        r = generate_recipe(
            dose_g=dose,
            drink_type=drink,
            roast_level=roast,
            region="CENTRAL_AMERICA",
            process="WASHED",
            d50_um=1000,
        )
        assert sum(p.water_g for p in r.pours) == r.total_water_g

    @pytest.mark.parametrize("dose", [10, 20, 30])
    @pytest.mark.parametrize("roast", ["LIGHT", "MEDIUM", "DARK"])
    def test_pour_never_overruns_the_interval(self, dose, roast):
        """8-1절: 원두량 10~30 g에서는 최악 조합(유량 최저)에서도 푸어가 간격을 넘지 않습니다.

        넘으면 다음 주수가 이전 주수보다 먼저 시작해 시간축이 역행합니다.
        """
        r = generate_recipe(
            dose_g=dose,
            drink_type="HOT",
            roast_level=roast,
            region="AFRICA",
            process="WASHED",
            d50_um=3000,  # 굵음 → 유량 최저
        )
        for pour in r.pours:
            assert pour.end_sec - pour.start_sec <= r.pour_interval_sec

    @pytest.mark.parametrize("dose", [10, 20, 30])
    def test_curve_is_monotonic(self, dose):
        """시간과 누적 물량 모두 감소하지 않아야 합니다. 시간축 역행 = 곡선 붕괴."""
        r = generate_recipe(
            dose_g=dose,
            drink_type="HOT",
            roast_level="LIGHT",
            region="AFRICA",
            process="WASHED",
            d50_um=3000,
        )
        times = [p[0] for p in r.target_curve]
        weights = [p[1] for p in r.target_curve]
        assert times == sorted(times)
        assert weights == sorted(weights)

    def test_curve_has_nine_points(self, golden):
        """4회 주수 × (시작, 종료) = 8점 + 드립다운 끝점 1개."""
        assert len(golden.target_curve) == 9

    def test_curve_ends_at_total_water_and_total_time(self, golden):
        assert golden.target_curve[-1] == [golden.total_time_sec, golden.total_water_g]

    @pytest.mark.parametrize("roast", ["LIGHT", "MEDIUM", "DARK"])
    def test_pouring_finishes_about_a_minute_before_the_end(self, roast):
        """참고 레시피의 공통 패턴 — 마지막 주수 시작이 종료 60초 전입니다."""
        r = generate_recipe(**{**GOLDEN_INPUT, "roast_level": roast})
        assert r.total_time_sec - r.pours[-1].start_sec == C.DRAWDOWN_SEC


class TestParameterEffects:
    """데모 시나리오 2번: 입력을 바꾸면 곡선이 눈에 띄게 달라져야 합니다."""

    def test_dark_roast_pours_faster_and_finishes_sooner(self, golden):
        dark = generate_recipe(**{**GOLDEN_INPUT, "roast_level": "DARK"})
        assert dark.water_temp_c == 93  # 92 + 1(아프리카·다크)
        assert dark.flow_rate_gps == 8.0  # 9.0 − 1.0
        assert dark.pour_interval_sec == 25
        assert dark.total_time_sec == 135
        assert dark.target_curve != golden.target_curve

    def test_ice_uses_smaller_ratio(self):
        ice = generate_recipe(**{**GOLDEN_INPUT, "drink_type": "ICE"})
        assert ice.total_water_g == 200  # 20 × 10
        assert ice.ice_message == "얼음이 가득 담긴 컵에 부어 드세요!"

    def test_region_shifts_temp_and_flow(self):
        south = generate_recipe(**{**GOLDEN_INPUT, "region": "SOUTH_AMERICA"})
        assert south.water_temp_c == 93  # 94 − 1
        assert south.flow_rate_gps == 8.0  # 7.0 + 1.0

    def test_natural_process_lowers_temp(self):
        natural = generate_recipe(**{**GOLDEN_INPUT, "process": "NATURAL"})
        assert natural.water_temp_c == 95  # 96 − 1


class TestFlowRate:
    """참고 레시피 기준으로 유량을 재조정했습니다 (8-8절). 이전 문헌값의 약 2배입니다."""

    def test_slowest_combination(self):
        """라이트 7.0 − 1.0(아프리카) − 1.0(굵음) = 5.0 — 하한과 같습니다."""
        r = generate_recipe(**{**GOLDEN_INPUT, "d50_um": 3000})
        assert r.flow_rate_gps == 5.0

    def test_fastest_combination(self):
        """다크 9.0 + 1.0(남미) + 1.0(곱음) = 11.0 — 상한 12.0 안입니다."""
        r = generate_recipe(
            dose_g=20,
            drink_type="HOT",
            roast_level="DARK",
            region="SOUTH_AMERICA",
            process="WASHED",
            d50_um=500,
        )
        assert r.flow_rate_gps == 11.0

    def test_clamps_are_only_reachable_through_feedback(self):
        """규칙만으로는 5.0~11.0입니다. 클램프는 피드백 누적 조정을 위한 안전장치입니다."""
        assert C.FLOW_MIN <= 5.0
        assert C.FLOW_MAX >= 11.0


class TestGrindGuide:
    """8-5절: 1단계 = 50 μm. 안내 텍스트만 내고 상태로 누적하지 않습니다."""

    def test_too_coarse_suggests_finer(self):
        # 핫 상한 1250. 1400은 150 μm 초과 → 3단계 곱게
        r = generate_recipe(**{**GOLDEN_INPUT, "d50_um": 1400})
        assert r.grind_guide == "3단계 곱게"

    def test_too_fine_suggests_coarser(self):
        # 핫 하한 950. 850은 100 μm 미만 → 2단계 굵게
        r = generate_recipe(**{**GOLDEN_INPUT, "d50_um": 850})
        assert r.grind_guide == "2단계 굵게"

    def test_reference_range_covers_roastery_recipes(self):
        """참고 레시피의 분쇄도는 900~1350 μm였습니다."""
        low, high = C.D50_RANGE["HOT"]
        assert low <= 1000 and high >= 1200


class TestGuards:
    def test_rejects_dose_over_limit(self):
        """8-1절 상한. 라우터가 400으로 변환합니다."""
        with pytest.raises(RuleViolation):
            generate_recipe(**{**GOLDEN_INPUT, "dose_g": 40})

    def test_rejects_dose_under_limit(self):
        with pytest.raises(RuleViolation):
            generate_recipe(**{**GOLDEN_INPUT, "dose_g": 5})

    def test_rejects_ratio_that_overruns_the_interval(self):
        """8-4절: 피드백으로 Ratio가 오르면 한 번에 붓는 양이 간격을 넘길 수 있습니다."""
        with pytest.raises(RuleViolation, match="간격"):
            generate_recipe(
                dose_g=30,
                drink_type="HOT",
                roast_level="LIGHT",
                region="AFRICA",
                process="WASHED",
                d50_um=3000,
                ratio_override=18.0,
            )

    def test_rejects_unknown_enum(self):
        with pytest.raises(RuleViolation):
            generate_recipe(**{**GOLDEN_INPUT, "region": "EUROPE"})
