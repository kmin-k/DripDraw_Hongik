"""POST /api/brews/{id}/save-as-recipe — 마음에 든 추출을 다음 목표로 저장.

Rule Engine 없이도 "내가 만든 레시피"를 재현할 수 있게 하는 경로입니다.
"""

from tests.test_curve_shaping import TYPICAL, brew_curve

TIMES = {"startedAt": "2026-08-09T09:12:03Z", "endedAt": "2026-08-09T09:15:31Z"}
SAVE_BODY = {"doseG": 20, "drinkType": "HOT"}


def free_brew(client, noise_g: float = 2.0) -> int:
    """자유 모드로 추출한 기록을 하나 만들고 id를 돌려줍니다."""
    curve = brew_curve(TYPICAL, total_sec=150, noise_g=noise_g)
    return client.post("/api/brews", json={"actualCurve": curve, **TIMES}).json()["brewId"]


def test_saves_a_followable_curve(client):
    brew_id = free_brew(client)

    res = client.post(f"/api/brews/{brew_id}/save-as-recipe", json=SAVE_BODY)
    assert res.status_code == 201
    body = res.json()

    # 실측 1,300여 점이 규칙 레시피와 같은 크기로 줄어야 합니다.
    assert len(body["targetCurve"]) == 9
    assert body["recipeId"] > 0


def test_recorded_recipe_has_no_rule_engine_fields(client):
    """사용자가 손으로 부은 곡선에는 물 온도·유량 같은 규칙이 존재하지 않습니다."""
    brew_id = free_brew(client)
    body = client.post(f"/api/brews/{brew_id}/save-as-recipe", json=SAVE_BODY).json()

    assert body["waterTempC"] is None
    assert body["flowRateGps"] is None
    assert body["ratio"] is None
    assert body["pours"] == []


def test_saved_curve_is_monotonic(client):
    brew_id = free_brew(client, noise_g=3.0)
    body = client.post(f"/api/brews/{brew_id}/save-as-recipe", json=SAVE_BODY).json()
    curve = body["targetCurve"]

    times = [p[0] for p in curve]
    weights = [p[1] for p in curve]
    assert times == sorted(times)
    assert weights == sorted(weights)


def test_saved_recipe_can_be_followed_again(client):
    """저장한 목표로 다시 추출하면 정확도가 계산돼야 합니다. 루프가 닫히는 지점입니다."""
    brew_id = free_brew(client)
    recipe = client.post(f"/api/brews/{brew_id}/save-as-recipe", json=SAVE_BODY).json()

    # 저장된 목표를 그대로 따라간 추출
    body = client.post(
        "/api/brews",
        json={"recipeId": recipe["recipeId"], "actualCurve": recipe["targetCurve"], **TIMES},
    ).json()

    assert body["rmse"] == 0


def test_rejects_a_brew_with_no_pouring(client):
    """저울만 켜두고 아무것도 안 부은 기록은 목표가 될 수 없습니다."""
    flat = [[i / 9.3, 0.0] for i in range(200)]
    brew_id = client.post("/api/brews", json={"actualCurve": flat, **TIMES}).json()["brewId"]

    res = client.post(f"/api/brews/{brew_id}/save-as-recipe", json=SAVE_BODY)
    assert res.status_code == 400
    assert "주수" in res.json()["detail"]


def test_unknown_brew_returns_404(client):
    assert client.post("/api/brews/9999/save-as-recipe", json=SAVE_BODY).status_code == 404


def test_unknown_bean_returns_404(client):
    brew_id = free_brew(client)
    res = client.post(f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "beanId": 9999})
    assert res.status_code == 404


def test_dose_outside_limits_is_rejected(client):
    brew_id = free_brew(client)
    res = client.post(f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "doseG": 40})
    assert res.status_code == 422
