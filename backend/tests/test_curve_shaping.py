"""실측 곡선 → 목표 곡선 변환 테스트.

핵심은 **손떨림을 따라 하지 않는 것**입니다.
실측을 그대로 목표로 쓰면 "내가 흔들린 것까지 따라 하라"가 됩니다.
"""

import random

from app.services.curve_shaping import detect_pours, shape_target_curve


def brew_curve(
    pours: list[tuple[float, float, float]],
    total_sec: float,
    noise_g: float = 0.0,
    hz: float = 9.3,
) -> list[list[float]]:
    """실제 추출을 흉내낸 곡선을 만듭니다.

    pours: [(시작 초, 지속 초, 물량 g), ...]
    noise_g: 손떨림·저울 진동 크기
    """
    random.seed(42)
    step = 1 / hz
    points: list[list[float]] = []
    t = 0.0
    while t <= total_sec:
        weight = 0.0
        for start, duration, amount in pours:
            if t >= start + duration:
                weight += amount
            elif t > start:
                weight += amount * (t - start) / duration
        points.append([round(t, 3), round(weight + random.uniform(-noise_g, noise_g), 2)])
        t += step
    return points


# 참고 레시피 형태 — 30초 간격 4회 주수
TYPICAL = [(0.0, 10.0, 50.0), (30.0, 12.0, 100.0), (60.0, 10.0, 90.0), (90.0, 8.0, 60.0)]


class TestDetectPours:
    def test_finds_every_pour(self):
        pours = detect_pours(brew_curve(TYPICAL, total_sec=150))
        assert len(pours) == 4

    def test_finds_pours_through_noise(self):
        """손떨림이 섞여도 주수 횟수를 정확히 세야 합니다."""
        pours = detect_pours(brew_curve(TYPICAL, total_sec=150, noise_g=2.0))
        assert len(pours) == 4

    def test_pour_amounts_are_close_to_reality(self):
        pours = detect_pours(brew_curve(TYPICAL, total_sec=150, noise_g=1.5))
        amounts = [p.water_g for p in pours]
        for measured, expected in zip(amounts, [50, 100, 90, 60], strict=True):
            assert abs(measured - expected) < 10

    def test_pour_starts_are_close_to_reality(self):
        pours = detect_pours(brew_curve(TYPICAL, total_sec=150, noise_g=1.5))
        for pour, expected in zip(pours, [0, 30, 60, 90], strict=True):
            assert abs(pour.start_sec - expected) <= 2

    def test_ignores_tiny_bumps(self):
        """한 방울 떨어지거나 드리퍼를 건드린 정도는 주수가 아닙니다."""
        curve = brew_curve([(0.0, 10.0, 50.0), (40.0, 0.5, 3.0)], total_sec=60)
        assert len(detect_pours(curve)) == 1

    def test_empty_curve_yields_nothing(self):
        assert detect_pours([]) == []

    def test_pours_closer_than_the_merge_gap_count_as_one(self):
        """MERGE_GAP_SEC보다 촘촘히 부으면 한 번의 주수로 봅니다.

        노이즈로 쪼개진 조각을 잇기 위한 규칙이라 생기는 한계입니다.
        참고 레시피의 실제 대기는 15~25초라 충분히 떨어져 있습니다.
        """
        rapid = [(0.0, 3.0, 50.0), (7.0, 3.0, 50.0)]  # 4초 간격
        assert len(detect_pours(brew_curve(rapid, total_sec=30))) == 1

        spaced = [(0.0, 3.0, 50.0), (20.0, 3.0, 50.0)]  # 17초 간격
        assert len(detect_pours(brew_curve(spaced, total_sec=40))) == 2


class TestShapeTargetCurve:
    def test_result_is_short_enough_to_follow(self):
        """2,000점짜리 실측이 규칙 레시피와 같은 크기로 줄어야 합니다."""
        raw = brew_curve(TYPICAL, total_sec=150, noise_g=2.0)
        assert len(raw) > 1000

        shaped = shape_target_curve(raw)
        # 주수 4회 × (시작, 종료) + 드립다운 = 9점. 규칙 엔진이 만드는 곡선과 같은 크기입니다.
        assert len(shaped) == 9

    def test_starts_at_origin(self):
        shaped = shape_target_curve(brew_curve(TYPICAL, total_sec=150, noise_g=2.0))
        assert shaped[0] == [0, 0]

    def test_is_monotonic(self):
        """시간과 누적 물량 모두 줄면 안 됩니다. 줄면 곡선이 접힙니다."""
        shaped = shape_target_curve(brew_curve(TYPICAL, total_sec=150, noise_g=3.0))
        times = [p[0] for p in shaped]
        weights = [p[1] for p in shaped]
        assert times == sorted(times)
        assert weights == sorted(weights)

    def test_smooths_out_hand_tremor(self):
        """노이즈가 커도 결과 곡선의 점 개수가 늘지 않아야 합니다."""
        quiet = shape_target_curve(brew_curve(TYPICAL, total_sec=150, noise_g=0.0))
        shaky = shape_target_curve(brew_curve(TYPICAL, total_sec=150, noise_g=3.0))
        assert len(quiet) == len(shaky)

    def test_recovers_from_lifting_the_dripper(self):
        """추출 중 드리퍼를 들면 무게가 잠깐 내려갑니다. 목표 곡선은 줄면 안 됩니다."""
        raw = brew_curve(TYPICAL, total_sec=150)
        for i in range(400, 420):  # 중간에 무게가 뚝 떨어지는 구간
            raw[i][1] -= 40

        shaped = shape_target_curve(raw)
        weights = [p[1] for p in shaped]
        assert weights == sorted(weights)

    def test_total_matches_what_was_actually_poured(self):
        """마지막 주수가 잔량을 흡수해 총량이 실측 최종 무게와 맞아야 합니다."""
        raw = brew_curve(TYPICAL, total_sec=150, noise_g=1.5)
        shaped = shape_target_curve(raw)
        assert abs(shaped[-1][1] - 300) <= 2

    def test_origin_is_not_duplicated(self):
        """첫 주수가 0초에 시작하면 원점이 두 번 들어가면 안 됩니다."""
        shaped = shape_target_curve(brew_curve(TYPICAL, total_sec=150, noise_g=1.5))
        assert shaped[0] == [0, 0]
        assert shaped[1] != [0, 0]

    def test_origin_is_added_when_pouring_starts_late(self):
        """시작 버튼을 누르고 몇 초 뒤에 부었다면 그 구간이 수평선으로 보여야 합니다."""
        late = [(12.0, 10.0, 50.0), (40.0, 12.0, 100.0)]
        shaped = shape_target_curve(brew_curve(late, total_sec=100))
        assert shaped[0] == [0, 0]
        assert shaped[1][0] > 5 and shaped[1][1] == 0

    def test_ends_at_the_measured_end_time(self):
        shaped = shape_target_curve(brew_curve(TYPICAL, total_sec=150, noise_g=1.5))
        assert abs(shaped[-1][0] - 150) <= 1

    def test_curve_without_any_pour_yields_nothing(self):
        """저울만 켜두고 아무것도 안 부은 기록은 목표가 될 수 없습니다."""
        assert shape_target_curve([[t / 9.3, 0.0] for t in range(200)]) == []
