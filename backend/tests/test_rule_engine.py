"""Rule Engine 회귀 테스트.

기준값은 docs/rule-table.md 7절 검증 예시입니다.
이 값은 엑셀 원본과 전 항목 일치가 확인된 **정답**이므로, 구현이 이 테스트를 따라와야 합니다.
반대로 테스트를 구현에 맞추면 검증 근거가 사라집니다.

규칙을 바꾸면 이 파일도 같은 PR에서 갱신합니다 (CONTRIBUTING.md "Rule Table 원본 관리").
"""

import pytest

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
        assert golden.water_temp_c == 96  # 94 + 2 + 0

    def test_total_water(self, golden):
        assert golden.total_water_g == 300  # 20 × 15

    def test_bloom_water(self, golden):
        assert golden.bloom_water_g == 60  # 20 × 3.0

    def test_flow_rate(self, golden):
        assert golden.flow_rate_gps == 3.0  # 4.0 − 1.0 + 0

    def test_pour_amounts(self, golden):
        amounts = [p.water_g for p in golden.pours]
        assert amounts == [60, 96, 79, 65]  # Bloom / 2차 / 3차 / 4차(잔량)

    def test_pour_time_sum(self, golden):
        # 푸어 시간 합 = 남은 물량 240 ÷ 유량 3.0 = 80초
        pour_seconds = sum(p.end_sec - p.start_sec for p in golden.pours[1:])
        assert pour_seconds == 80

    def test_between_pour_wait(self, golden):
        assert golden.between_pour_wait_sec == 40  # (205 − 10 − 35 − 80) ÷ 2

    def test_target_curve(self, golden):
        """★ 최종 산출물. 8개 좌표가 전부 일치해야 합니다."""
        assert golden.target_curve == [
            [0, 0],
            [10, 60],
            [45, 60],
            [77, 156],
            [117, 156],
            [143, 235],
            [183, 235],
            [205, 300],
        ]

    def test_grind_guide_in_range(self, golden):
        # D50 950은 핫 기준 범위 900~1100 안
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
    def test_wait_never_negative_within_dose_limits(self, dose, roast):
        """8-1절: 원두량 10~30 g에서는 최악 조합(유량 최저)에서도 대기가 음수가 아님."""
        r = generate_recipe(
            dose_g=dose,
            drink_type="HOT",
            roast_level=roast,
            region="AFRICA",
            process="WASHED",
            d50_um=2000,  # 굵음 → 유량 최저
        )
        assert r.between_pour_wait_sec >= 0

    @pytest.mark.parametrize("dose", [10, 20, 30])
    def test_curve_is_monotonic(self, dose):
        """시간과 누적 물량 모두 감소하지 않아야 합니다. 시간축 역행 = 곡선 붕괴."""
        r = generate_recipe(
            dose_g=dose,
            drink_type="HOT",
            roast_level="LIGHT",
            region="AFRICA",
            process="WASHED",
            d50_um=2000,
        )
        times = [p[0] for p in r.target_curve]
        weights = [p[1] for p in r.target_curve]
        assert times == sorted(times)
        assert weights == sorted(weights)

    def test_curve_has_eight_points(self, golden):
        """4회 주수 × (시작, 종료) = 8점 구간 선형 곡선 (6절)."""
        assert len(golden.target_curve) == 8

    def test_curve_ends_at_total_water(self, golden):
        assert golden.target_curve[-1][1] == golden.total_water_g


class TestParameterEffects:
    """데모 시나리오 2번: 입력을 바꾸면 곡선이 눈에 띄게 달라져야 합니다."""

    def test_dark_roast_differs_from_light(self, golden):
        dark = generate_recipe(**{**GOLDEN_INPUT, "roast_level": "DARK"})
        assert dark.water_temp_c == 89  # 88 + 1(아프리카·다크) + 0
        assert dark.total_time_sec == 155
        assert dark.target_curve != golden.target_curve

    def test_ice_uses_smaller_ratio(self):
        ice = generate_recipe(**{**GOLDEN_INPUT, "drink_type": "ICE"})
        assert ice.total_water_g == 200  # 20 × 10
        assert ice.ice_message == "얼음이 가득 담긴 컵에 부어 드세요!"

    def test_region_shifts_temp_and_flow(self):
        south = generate_recipe(**{**GOLDEN_INPUT, "region": "SOUTH_AMERICA"})
        assert south.water_temp_c == 93  # 94 − 1
        assert south.flow_rate_gps == 5.0  # 4.0 + 1.0

    def test_natural_process_lowers_temp(self):
        natural = generate_recipe(**{**GOLDEN_INPUT, "process": "NATURAL"})
        assert natural.water_temp_c == 95  # 96 − 1


class TestFlowClamp:
    def test_flow_clamped_at_minimum(self):
        """라이트 4.0 − 1.0(아프리카) − 1.0(굵음) = 2.0 → 하한 2.5로 클램프 (5절)."""
        r = generate_recipe(**{**GOLDEN_INPUT, "d50_um": 2000})
        assert r.flow_rate_gps == 2.5

    def test_flow_clamped_at_maximum(self):
        """다크 7.0 + 1.0(남미) + 1.0(곱음) = 9.0 → 상한 8.5로 클램프."""
        r = generate_recipe(
            dose_g=20,
            drink_type="HOT",
            roast_level="DARK",
            region="SOUTH_AMERICA",
            process="WASHED",
            d50_um=100,
        )
        assert r.flow_rate_gps == 8.5


class TestGrindGuide:
    """8-5절: 1단계 = 50 μm. 안내 텍스트만 내고 상태로 누적하지 않습니다."""

    def test_too_coarse_suggests_finer(self):
        # 핫 상한 1100. 1250은 150 μm 초과 → 3단계 곱게
        r = generate_recipe(**{**GOLDEN_INPUT, "d50_um": 1250})
        assert r.grind_guide == "3단계 곱게"

    def test_too_fine_suggests_coarser(self):
        # 핫 하한 900. 800은 100 μm 미만 → 2단계 굵게
        r = generate_recipe(**{**GOLDEN_INPUT, "d50_um": 800})
        assert r.grind_guide == "2단계 굵게"


class TestGuards:
    def test_rejects_dose_over_limit(self):
        """8-1절 상한. 라우터가 400으로 변환합니다."""
        with pytest.raises(RuleViolation):
            generate_recipe(**{**GOLDEN_INPUT, "dose_g": 40})

    def test_rejects_dose_under_limit(self):
        with pytest.raises(RuleViolation):
            generate_recipe(**{**GOLDEN_INPUT, "dose_g": 5})

    def test_rejects_ratio_that_makes_wait_negative(self):
        """8-4절: 피드백으로 Ratio가 오르면 30 g에서도 대기가 음수가 될 수 있습니다."""
        with pytest.raises(RuleViolation, match="대기"):
            generate_recipe(
                dose_g=30,
                drink_type="HOT",
                roast_level="LIGHT",
                region="AFRICA",
                process="WASHED",
                d50_um=2000,
                ratio_override=18.0,
            )

    def test_rejects_unknown_enum(self):
        with pytest.raises(RuleViolation):
            generate_recipe(**{**GOLDEN_INPUT, "region": "EUROPE"})
