"""RMSE 회귀 테스트 — docs/api.md "RMSE 정의"

⚠️ frontend/src/lib/rmse.test.ts에 **같은 케이스가 같은 값으로** 존재합니다.
프론트와 서버가 다른 값을 내면 사용자는 어느 쪽을 믿어야 할지 모릅니다.
한쪽을 고치면 반드시 양쪽을 함께 고치세요.
"""

from math import sqrt

import pytest

from app.services.rmse import calculate_rmse, interpolate_at

# rule-table.md 7절 검증 예시의 목표 곡선
GOLDEN_TARGET = [
    [0, 0],
    [10, 60],
    [45, 60],
    [77, 156],
    [117, 156],
    [143, 235],
    [183, 235],
    [205, 300],
]


class TestInterpolate:
    def test_returns_exact_value_at_a_point(self):
        assert interpolate_at([[0, 0], [10, 100]], 10) == 100

    def test_interpolates_between_points(self):
        assert interpolate_at([[0, 0], [10, 100]], 5) == 50

    def test_holds_flat_during_wait(self):
        """대기 구간은 누적 물량이 유지되는 수평선입니다."""
        assert interpolate_at(GOLDEN_TARGET, 20) == 60
        assert interpolate_at(GOLDEN_TARGET, 44) == 60

    def test_holds_last_value_past_the_end(self):
        """205초를 넘겨도 목표는 총 물량 300 g으로 유지됩니다."""
        assert interpolate_at(GOLDEN_TARGET, 300) == 300

    def test_holds_first_value_before_the_start(self):
        assert interpolate_at(GOLDEN_TARGET, -5) == 0

    def test_rejects_empty_curve(self):
        with pytest.raises(ValueError):
            interpolate_at([], 0)


class TestRmse:
    def test_perfect_follow_is_zero(self):
        actual = [[0, 0], [5, 50], [10, 100]]
        assert calculate_rmse([[0, 0], [10, 100]], actual) == 0

    def test_constant_offset_equals_that_offset(self):
        """모든 시점에서 10 g씩 더 부었다면 RMSE는 10입니다."""
        actual = [[0, 10], [5, 60], [10, 110]]
        assert calculate_rmse([[0, 0], [10, 100]], actual) == 10

    def test_mixed_error_uses_root_mean_square(self):
        """오차 0과 10이 섞이면 단순 평균 5가 아니라 sqrt(50)입니다."""
        actual = [[0, 0], [10, 110]]
        assert calculate_rmse([[0, 0], [10, 100]], actual) == pytest.approx(sqrt(50))

    def test_large_error_weighs_more_than_many_small_ones(self):
        """제곱하므로 순간적인 과주수가 잔오차보다 크게 반영됩니다."""
        target = [[0, 0], [10, 100]]
        one_big = calculate_rmse(target, [[0, 0], [5, 50], [10, 130]])
        many_small = calculate_rmse(target, [[0, 10], [5, 60], [10, 110]])
        assert one_big > many_small

    def test_early_finish_has_no_penalty(self):
        """목표보다 일찍 끝내도 그때까지 잘 따라왔으면 오차가 없습니다."""
        actual = [[0, 0], [5, 50]]
        assert calculate_rmse([[0, 0], [100, 1000]], actual) == 0

    def test_overtime_compares_against_last_target_value(self):
        actual = [[220, 300], [240, 300]]
        assert calculate_rmse(GOLDEN_TARGET, actual) == 0

    def test_golden_curve_followed_exactly(self):
        """검증 예시 곡선을 그대로 따라가면 0입니다."""
        assert calculate_rmse(GOLDEN_TARGET, GOLDEN_TARGET) == 0

    def test_no_measurement_is_none_not_zero(self):
        assert calculate_rmse(GOLDEN_TARGET, []) is None
        assert calculate_rmse([], [[0, 0]]) is None


# ⚠️ 아래 입력과 기대값은 frontend/src/lib/rmse.test.ts와 **완전히 동일**합니다.
# 두 구현이 갈라지는 순간 양쪽 중 하나가 깨지도록 고정해 둔 것입니다.
SHARED_ACTUAL = [
    [0, 0],
    [7.3, 41.9],
    [10, 55],
    [45, 62],
    [77, 150],
    [99.5, 157.2],
    [117, 158],
    [143, 240],
    [183, 236],
    [205, 297],
    [212.4, 300.1],
]
SHARED_EXPECTED_RMSE = 3.1487371205842911


def test_matches_frontend_implementation():
    """프론트와 서버가 같은 입력에 같은 값을 내야 합니다.

    실시간 표시는 브라우저가, 저장은 서버가 계산합니다.
    두 숫자가 다르면 사용자는 어느 쪽을 믿어야 할지 알 수 없습니다.
    """
    assert calculate_rmse(GOLDEN_TARGET, SHARED_ACTUAL) == SHARED_EXPECTED_RMSE
