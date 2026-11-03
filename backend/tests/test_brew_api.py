"""POST /api/brews — 추출 기록 저장.

핵심은 **RMSE를 서버가 다시 계산한다**는 것입니다.
프론트가 보낸 값을 그대로 저장하면 두 곳의 계산이 갈라졌을 때 알 수 없습니다.
"""

from app.services.constants import MAX_CURVE_POINTS

RECIPE_BODY = {
    "doseG": 20,
    "drinkType": "HOT",
    "region": "AFRICA",
    "process": "WASHED",
    "roastLevel": "LIGHT",
    "d50Um": 950,
}

TIMES = {"startedAt": "2026-08-09T09:12:03Z", "endedAt": "2026-08-09T09:15:31Z"}


def make_recipe(client) -> dict:
    return client.post("/api/recipe/generate", json=RECIPE_BODY).json()


def test_perfect_follow_scores_zero(client):
    """목표 곡선을 그대로 따라갔다면 정확도가 0이어야 합니다."""
    recipe = make_recipe(client)

    res = client.post(
        "/api/brews",
        json={"recipeId": recipe["recipeId"], "actualCurve": recipe["targetCurve"], **TIMES},
    )
    assert res.status_code == 201
    body = res.json()

    assert body["rmse"] == 0
    assert body["brewId"] > 0
    # 소요 시간과 최종 물량은 클라이언트 주장이 아니라 측정값에서 뽑습니다.
    assert body["durationSec"] == 165
    assert body["finalWeightG"] == 300


def test_server_recalculates_rmse(client):
    """모든 시점에서 10 g씩 더 부었다면 RMSE는 10입니다."""
    recipe = make_recipe(client)
    off_by_ten = [[t, w + 10] for t, w in recipe["targetCurve"]]

    body = client.post(
        "/api/brews",
        json={"recipeId": recipe["recipeId"], "actualCurve": off_by_ten, **TIMES},
    ).json()

    assert body["rmse"] == 10


def test_free_mode_has_no_recipe_and_no_rmse(client):
    """자유 모드는 따라간 목표가 없어 정확도를 낼 수 없습니다. 0이 아니라 null입니다."""
    body = client.post(
        "/api/brews",
        json={"actualCurve": [[0, 0], [30, 120], [90, 300]], **TIMES},
    ).json()

    assert body["rmse"] is None
    assert body["durationSec"] == 90
    assert body["finalWeightG"] == 300


def test_unknown_recipe_returns_404(client):
    res = client.post(
        "/api/brews",
        json={"recipeId": 9999, "actualCurve": [[0, 0], [10, 50]], **TIMES},
    )
    assert res.status_code == 404


def test_empty_curve_is_rejected(client):
    """측정값이 없는 기록은 저장할 이유가 없습니다."""
    res = client.post("/api/brews", json={"actualCurve": [], **TIMES})
    assert res.status_code == 422


def test_malformed_curve_point_is_rejected(client):
    res = client.post("/api/brews", json={"actualCurve": [[0, 0, 0]], **TIMES})
    assert res.status_code == 422


class TestCurveValidation:
    """잘못된 곡선은 500이 아니라 422로 돌려보냅니다."""

    def post(self, client, curve, **times):
        return client.post("/api/brews", json={"actualCurve": curve, **TIMES, **times})

    def test_nan_is_rejected(self, client):
        # 표준 JSON에는 NaN이 없지만 파이썬·JS 직렬화기는 NaN 토큰을 내보낼 수 있습니다.
        res = client.post(
            "/api/brews",
            content='{"actualCurve": [[0, 0], [1, NaN]], "startedAt": "2026-08-09T09:12:03Z",'
            ' "endedAt": "2026-08-09T09:15:31Z"}',
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 422

    def test_infinity_is_rejected(self, client):
        res = client.post(
            "/api/brews",
            content='{"actualCurve": [[0, 0], [Infinity, 10]], "startedAt": "2026-08-09T09:12:03Z",'
            ' "endedAt": "2026-08-09T09:15:31Z"}',
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 422

    def test_negative_time_is_rejected(self, client):
        assert self.post(client, [[-1, 0], [10, 50]]).status_code == 422

    def test_time_going_backwards_is_rejected(self, client):
        assert self.post(client, [[0, 0], [20, 80], [10, 90]]).status_code == 422

    def test_repeated_time_is_allowed(self, client):
        # 패킷 두 개가 같은 시각으로 찍힐 수 있습니다.
        assert self.post(client, [[0, 0], [10, 50], [10, 51]]).status_code == 201

    def test_small_negative_weight_is_allowed(self, client):
        # 빈 저울은 -0.04 g 같은 값을 보냅니다.
        assert self.post(client, [[0, -0.04], [10, 50]]).status_code == 201

    def test_too_many_points_is_rejected(self, client):
        curve = [[i * 0.1, 0] for i in range(MAX_CURVE_POINTS + 1)]
        assert self.post(client, curve).status_code == 422

    def test_end_before_start_is_rejected(self, client):
        res = self.post(client, [[0, 0], [10, 50]], endedAt="2026-08-09T09:00:00Z")
        assert res.status_code == 422


def test_accepts_a_full_length_curve(client):
    """실제 추출은 205초 × 9.3Hz ≈ 1,900점입니다. 다운샘플링 없이 그대로 받아야 합니다."""
    recipe = make_recipe(client)
    dense = [[round(i * 0.107, 3), i * 0.16] for i in range(1900)]

    body = client.post(
        "/api/brews",
        json={"recipeId": recipe["recipeId"], "actualCurve": dense, **TIMES},
    ).json()

    assert body["brewId"] > 0
    # 마지막 측정점에서 뽑았는지 확인 — 중간에 잘렸다면 값이 달라집니다.
    assert body["durationSec"] == round(dense[-1][0])
    assert body["finalWeightG"] == dense[-1][1]
