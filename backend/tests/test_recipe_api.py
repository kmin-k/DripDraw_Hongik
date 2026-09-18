"""POST /api/recipe/generate — 계약이 docs/api.md와 일치하는지 확인합니다."""

GOLDEN_BODY = {
    "doseG": 20,
    "drinkType": "HOT",
    "region": "AFRICA",
    "process": "WASHED",
    "roastLevel": "LIGHT",
    "d50Um": 950,
}


def test_generate_matches_api_doc_example(client):
    res = client.post("/api/recipe/generate", json=GOLDEN_BODY)
    assert res.status_code == 201
    body = res.json()

    assert body["waterTempC"] == 96
    assert body["totalWaterG"] == 300
    assert body["flowRateGps"] == 6.0
    assert body["grindGuide"] == "현재 분쇄도 유지"
    assert body["iceMessage"] is None
    assert body["targetCurve"] == [
        [0, 0],
        [10, 60],
        [35, 60],
        [52, 160],
        [70, 160],
        [83, 240],
        [105, 240],
        [115, 300],
        [165, 300],  # 드립다운
    ]
    assert body["pours"] == [
        {"phase": "BLOOM", "waterG": 60, "startSec": 0, "endSec": 10},
        {"phase": "SECOND", "waterG": 100, "startSec": 35, "endSec": 52},
        {"phase": "THIRD", "waterG": 80, "startSec": 70, "endSec": 83},
        {"phase": "FOURTH", "waterG": 60, "startSec": 105, "endSec": 115},
    ]


def test_generate_from_bean_id(client):
    bean = client.post(
        "/api/beans",
        json={
            "name": "Ethiopia Yirgacheffe",
            "region": "AFRICA",
            "process": "WASHED",
            "roastLevel": "LIGHT",
        },
    ).json()

    res = client.post(
        "/api/recipe/generate",
        json={"beanId": bean["id"], "doseG": 20, "drinkType": "HOT", "d50Um": 950},
    )
    assert res.status_code == 201
    # 원두 속성으로 계산해도 같은 결과가 나와야 합니다.
    assert res.json()["waterTempC"] == 96


def test_recipe_is_persisted(client):
    first = client.post("/api/recipe/generate", json=GOLDEN_BODY).json()
    second = client.post("/api/recipe/generate", json=GOLDEN_BODY).json()
    assert second["recipeId"] != first["recipeId"]


def test_unknown_bean_returns_404(client):
    res = client.post(
        "/api/recipe/generate",
        json={"beanId": 999, "doseG": 20, "drinkType": "HOT", "d50Um": 950},
    )
    assert res.status_code == 404


def test_dose_over_limit_rejected(client):
    res = client.post("/api/recipe/generate", json={**GOLDEN_BODY, "doseG": 40})
    assert res.status_code == 422  # Pydantic이 먼저 거릅니다
    assert "doseG" in res.text or "dose_g" in res.text


def test_missing_bean_and_attributes_rejected(client):
    res = client.post(
        "/api/recipe/generate",
        json={"doseG": 20, "drinkType": "HOT", "d50Um": 950},
    )
    assert res.status_code == 422


def test_ice_returns_message(client):
    body = client.post("/api/recipe/generate", json={**GOLDEN_BODY, "drinkType": "ICE"}).json()
    assert body["totalWaterG"] == 200
    assert body["iceMessage"] == "얼음이 가득 담긴 컵에 부어 드세요!"
