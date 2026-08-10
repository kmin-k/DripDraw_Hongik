"""POST /api/brews — 추출 기록 저장.

핵심은 **RMSE를 서버가 다시 계산한다**는 것입니다.
프론트가 보낸 값을 그대로 저장하면 두 곳의 계산이 갈라졌을 때 알 수 없습니다.
"""

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
