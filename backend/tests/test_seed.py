"""시드 데이터 검증.

시드는 발표에서 그대로 보여줄 데이터라, **정확도가 회차마다 좋아진다**는 성질이
깨지면 안 됩니다. 그 성질이 곧 이 프로젝트가 주장하는 바입니다.
"""

from datetime import UTC, datetime

from app.models import Bean, Brew, Feedback, Recipe
from app.seed import seed, simulate_brew

GOLDEN_TARGET = [
    [0, 0],
    [10, 56],
    [35, 56],
    [51, 154],
    [70, 154],
    [84, 235],
    [105, 235],
    [116, 300],
    [165, 300],
]


class TestSimulateBrew:
    def test_follows_the_target(self):
        """어긋남을 거의 주지 않으면 목표와 사실상 같아야 합니다."""
        curve = simulate_brew(GOLDEN_TARGET, lag_sec=0, gain=0, noise_g=0, seed=1)

        assert curve[0][0] == 0
        assert abs(curve[-1][1] - 300) < 1

    def test_lag_pushes_the_curve_later(self):
        """늦게 부으면 같은 시각의 누적 물량이 목표보다 적습니다."""
        prompt = simulate_brew(GOLDEN_TARGET, lag_sec=0, gain=0, noise_g=0, seed=1)
        late = simulate_brew(GOLDEN_TARGET, lag_sec=3, gain=0, noise_g=0, seed=1)

        # 주수가 한창인 구간에서 비교합니다.
        index = int(45 / 0.107)
        assert late[index][1] < prompt[index][1]

    def test_never_goes_negative(self):
        """저울 노이즈가 커도 부은 물이 음수가 될 수는 없습니다."""
        curve = simulate_brew(GOLDEN_TARGET, lag_sec=1, gain=0, noise_g=5, seed=3)
        assert all(weight >= 0 for _, weight in curve)

    def test_is_reproducible(self):
        """같은 시드는 같은 곡선. 발표 직전에 다시 채워도 화면이 달라지지 않아야 합니다."""
        first = simulate_brew(GOLDEN_TARGET, lag_sec=1, gain=0.01, noise_g=1, seed=42)
        second = simulate_brew(GOLDEN_TARGET, lag_sec=1, gain=0.01, noise_g=1, seed=42)
        assert first == second


class TestSeed:
    def test_creates_the_demo_set(self, db):
        seed(db)

        assert db.query(Bean).count() == 2
        # 규칙 레시피 2개 + 맛 평가로 생긴 보정 레시피 1개
        assert db.query(Recipe).count() == 3
        # 가이드 추출 5 + 3, 자유 모드 1
        assert db.query(Brew).count() == 9

    def test_accuracy_improves_with_each_attempt(self, db):
        """★ 시드의 핵심 — 같은 레시피를 반복할수록 정확도가 좋아져야 합니다."""
        seed(db)

        for recipe in db.query(Recipe).filter(Recipe.source == "RULE_ENGINE").all():
            brews = (
                db.query(Brew).filter(Brew.recipe_id == recipe.id).order_by(Brew.started_at).all()
            )
            rmses = [brew.rmse for brew in brews]

            assert len(rmses) >= 3
            assert all(r is not None for r in rmses)
            # RMSE는 작을수록 목표에 가깝습니다. 계속 줄어야 합니다.
            assert rmses == sorted(rmses, reverse=True), rmses

    def test_no_brew_is_dated_in_the_future(self, db):
        """지난 기록이라면서 내일 날짜가 찍히면 안 됩니다.

        회차 수에서 역산하지 않고 고정 일수로 빼면, 회차를 늘렸을 때 마지막이 미래가 됩니다.
        """
        seed(db)

        now = datetime.now(UTC).replace(tzinfo=None)
        latest = max(brew.started_at for brew in db.query(Brew).all())
        assert latest <= now

    def test_brews_span_the_recent_past(self, db):
        """전부 같은 날이면 추이가 시간에 따른 변화로 읽히지 않습니다."""
        seed(db)

        dates = sorted({brew.started_at.date() for brew in db.query(Brew).all()})
        assert len(dates) >= 5

    def test_free_mode_brew_has_no_accuracy(self, db):
        seed(db)

        free = db.query(Brew).filter(Brew.recipe_id.is_(None)).all()
        assert len(free) == 1
        assert free[0].rmse is None

    def test_one_brew_has_feedback(self, db):
        """맛 평가가 달린 기록이 하나 있어야 히스토리의 '평가' 열을 보여줄 수 있습니다."""
        seed(db)

        feedbacks = db.query(Feedback).all()
        assert len(feedbacks) == 1
        # 라우터를 그대로 불러 만들었으므로 보정 레시피가 실제로 생깁니다.
        assert feedbacks[0].suggested_recipe_id is not None

    def test_running_twice_replaces_instead_of_piling_up(self, db):
        """몇 번을 돌려도 같은 결과. 발표 직전에 깨끗한 상태를 만들 수 있어야 합니다."""
        seed(db)
        first = [brew.rmse for brew in db.query(Brew).order_by(Brew.started_at).all()]

        seed(db)
        second = [brew.rmse for brew in db.query(Brew).order_by(Brew.started_at).all()]

        assert db.query(Brew).count() == 9
        assert first == second
