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


# --- 이름과 원두 (Phase 5 이후 추가) ---

NEW_BEAN = {
    "name": "에티오피아 무라고",
    "roaster": "모모스커피",
    "region": "AFRICA",
    "process": "NATURAL",
    "roastLevel": "LIGHT",
}


class TestNaming:
    def test_saves_a_name(self, client):
        """자유 추출은 규칙이 없어 이름이 유일한 식별자입니다."""
        brew_id = free_brew(client)
        body = client.post(
            f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "name": "아침용 연하게"}
        ).json()

        assert body["name"] == "아침용 연하게"

    def test_name_is_optional(self, client):
        brew_id = free_brew(client)
        body = client.post(f"/api/brews/{brew_id}/save-as-recipe", json=SAVE_BODY).json()
        assert body["name"] is None

    def test_blank_name_is_rejected(self, client):
        # 공백만 있는 이름은 없는 것과 같습니다. 저장해봐야 화면에 빈칸만 남습니다.
        brew_id = free_brew(client)
        res = client.post(f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "name": "   "})
        assert res.status_code == 422

    def test_name_is_trimmed(self, client):
        brew_id = free_brew(client)
        body = client.post(
            f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "name": "  연하게  "}
        ).json()
        assert body["name"] == "연하게"

    def test_name_shows_in_history(self, client):
        """이름을 붙였으면 기록 목록에서 보여야 합니다. 안 보이면 붙인 의미가 없습니다."""
        brew_id = free_brew(client)
        recipe = client.post(
            f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "name": "주말 레시피"}
        ).json()

        curve = brew_curve(TYPICAL, total_sec=150)
        client.post(
            "/api/brews", json={"recipeId": recipe["recipeId"], "actualCurve": curve, **TIMES}
        )

        latest = client.get("/api/brews").json()["items"][0]
        assert latest["recipeName"] == "주말 레시피"


class TestNewBean:
    def test_registers_a_bean_while_saving(self, client):
        """원두를 먼저 등록하지 않고 내렸어도, 저장하면서 그 자리에서 등록할 수 있어야 합니다."""
        brew_id = free_brew(client)
        body = client.post(
            f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "newBean": NEW_BEAN}
        ).json()

        assert body["beanId"] is not None
        assert body["beanName"] == "에티오피아 무라고"

    def test_new_bean_appears_in_bean_list(self, client):
        """저장하면서 만든 원두는 원두 목록과 레시피 화면의 선택지에 똑같이 나와야 합니다."""
        brew_id = free_brew(client)
        client.post(f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "newBean": NEW_BEAN})

        names = [bean["name"] for bean in client.get("/api/beans").json()["items"]]
        assert "에티오피아 무라고" in names

    def test_new_bean_can_be_used_by_rule_engine(self, client):
        """그 자리에서 만든 원두도 지역·가공·로스팅이 있어 규칙 레시피를 만들 수 있어야 합니다."""
        brew_id = free_brew(client)
        bean_id = client.post(
            f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "newBean": NEW_BEAN}
        ).json()["beanId"]

        res = client.post(
            "/api/recipe/generate",
            json={"beanId": bean_id, "doseG": 20, "drinkType": "HOT", "d50Um": 1000},
        )
        assert res.status_code == 201

    def test_cannot_send_both_bean_id_and_new_bean(self, client):
        # 둘 다 오면 어느 원두에 연결할지 알 수 없습니다.
        bean_id = client.post("/api/beans", json=NEW_BEAN).json()["id"]
        brew_id = free_brew(client)
        res = client.post(
            f"/api/brews/{brew_id}/save-as-recipe",
            json={**SAVE_BODY, "beanId": bean_id, "newBean": NEW_BEAN},
        )
        assert res.status_code == 422

    def test_no_bean_is_created_when_curve_is_rejected(self, client):
        """곡선이 거절되면 원두도 만들면 안 됩니다. 빈 원두가 목록에 남게 됩니다."""
        flat = [[i / 9.3, 0.0] for i in range(200)]
        brew_id = client.post("/api/brews", json={"actualCurve": flat, **TIMES}).json()["brewId"]

        res = client.post(
            f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "newBean": NEW_BEAN}
        )
        assert res.status_code == 400
        assert client.get("/api/beans").json()["items"] == []

    def test_existing_bean_still_works(self, client):
        bean_id = client.post("/api/beans", json=NEW_BEAN).json()["id"]
        brew_id = free_brew(client)
        body = client.post(
            f"/api/brews/{brew_id}/save-as-recipe", json={**SAVE_BODY, "beanId": bean_id}
        ).json()

        assert body["beanId"] == bean_id
        assert body["beanName"] == "에티오피아 무라고"
