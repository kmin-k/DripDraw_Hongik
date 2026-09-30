"""GET /api/brews · GET /api/brews/{id} — 히스토리 (Phase 5).

기록이 남아야 "재현성"이 말이 됩니다. 한 번 내리고 끝나면 비교할 대상이 없습니다.
"""

from tests.test_curve_shaping import TYPICAL, brew_curve

TIMES = {"startedAt": "2026-08-13T09:12:03Z", "endedAt": "2026-08-13T09:15:31Z"}
GOLDEN = {
    "doseG": 20,
    "drinkType": "HOT",
    "roastLevel": "LIGHT",
    "region": "AFRICA",
    "process": "WASHED",
    "d50Um": 950,
}
BEAN = {
    "name": "Ethiopia Yirgacheffe",
    "region": "AFRICA",
    "process": "WASHED",
    "roastLevel": "LIGHT",
}


def guided_brew(client, bean_id: int | None = None) -> int:
    body = {**GOLDEN, **({"beanId": bean_id} if bean_id else {})}
    recipe = client.post("/api/recipe/generate", json=body).json()
    curve = brew_curve(TYPICAL, total_sec=150, noise_g=1.0)
    return client.post(
        "/api/brews", json={"recipeId": recipe["recipeId"], "actualCurve": curve, **TIMES}
    ).json()["brewId"]


def free_brew(client) -> int:
    curve = brew_curve(TYPICAL, total_sec=150)
    return client.post("/api/brews", json={"actualCurve": curve, **TIMES}).json()["brewId"]


class TestList:
    def test_empty_at_first(self, client):
        assert client.get("/api/brews").json()["items"] == []

    def test_newest_first(self, client):
        """최근 것부터 봅니다. 오래된 기록을 먼저 보여줄 이유가 없습니다."""
        first = guided_brew(client)
        second = guided_brew(client)

        ids = [item["brewId"] for item in client.get("/api/brews").json()["items"]]
        assert ids == [second, first]

    def test_sorted_by_brew_time_not_insertion_order(self, client):
        """화면에 보여주는 값(추출 시각)으로 정렬해야 합니다.

        저장 순서로 정렬하면 나중에 저장한 오래된 추출이 맨 위로 올라가,
        사용자에게는 목록이 뒤죽박죽으로 보입니다.
        """
        curve = brew_curve(TYPICAL, total_sec=150)

        def save(started: str) -> int:
            return client.post(
                "/api/brews",
                json={
                    "actualCurve": curve,
                    "startedAt": f"{started}T09:00:00Z",
                    "endedAt": f"{started}T09:03:00Z",
                },
            ).json()["brewId"]

        # 최근 추출을 **먼저** 저장하고, 오래된 추출을 나중에 저장합니다.
        # 저장 순서로 정렬하면 오래된 쪽이 위로 올라와 틀린 순서가 됩니다.
        newer = save("2026-08-20")
        older = save("2026-08-01")
        assert older > newer  # 저장 순서는 반대

        ids = [item["brewId"] for item in client.get("/api/brews").json()["items"]]
        assert ids == [newer, older]

    def test_carries_the_bean_name(self, client):
        bean_id = client.post("/api/beans", json=BEAN).json()["id"]
        guided_brew(client, bean_id)

        assert client.get("/api/brews").json()["items"][0]["beanName"] == "Ethiopia Yirgacheffe"

    def test_free_mode_is_marked_and_has_no_accuracy(self, client):
        """자유 모드는 비교할 목표가 없습니다. 0점이 아니라 '측정하지 않음'입니다."""
        free_brew(client)
        item = client.get("/api/brews").json()["items"][0]

        assert item["freeMode"] is True
        assert item["rmse"] is None
        assert item["doseG"] is None

    def test_carries_the_recipe_id_for_grouping(self, client):
        """같은 레시피끼리 묶어 정확도 추이를 보려면 목록에 레시피 id가 있어야 합니다.

        레시피가 다르면 조건이 달라 정확도를 나란히 비교할 수 없습니다.
        """
        recipe = client.post("/api/recipe/generate", json=GOLDEN).json()
        curve = brew_curve(TYPICAL, total_sec=150, noise_g=1.0)
        for _ in range(2):
            client.post(
                "/api/brews", json={"recipeId": recipe["recipeId"], "actualCurve": curve, **TIMES}
            )

        items = client.get("/api/brews").json()["items"]
        assert [item["recipeId"] for item in items] == [recipe["recipeId"]] * 2

    def test_free_mode_has_no_recipe_id(self, client):
        free_brew(client)
        assert client.get("/api/brews").json()["items"][0]["recipeId"] is None

    def test_guided_brew_has_accuracy(self, client):
        guided_brew(client)
        item = client.get("/api/brews").json()["items"][0]

        assert item["freeMode"] is False
        assert item["rmse"] is not None
        assert item["totalWaterG"] == 300

    def test_shows_whether_it_was_already_rated(self, client):
        """평가는 추출당 하나뿐이라, 목록에서 재진입을 막을 수 있어야 합니다."""
        brew_id = guided_brew(client)
        assert client.get("/api/brews").json()["items"][0]["hasFeedback"] is False

        client.post(
            "/api/recipe/adjust",
            json={"brewId": brew_id, "acidity": "OK", "bitterness": "OK", "strength": "THIN"},
        )
        assert client.get("/api/brews").json()["items"][0]["hasFeedback"] is True

    def test_omits_curves(self, client):
        """곡선 하나가 2,000점입니다. 목록에 담으면 몇 건만 모여도 응답이 커집니다."""
        guided_brew(client)
        item = client.get("/api/brews").json()["items"][0]

        assert "actualCurve" not in item
        assert "targetCurve" not in item

    def test_limit_is_capped(self, client):
        assert client.get("/api/brews?limit=0").status_code == 422
        assert client.get("/api/brews?limit=500").status_code == 422


class TestDetail:
    def test_returns_both_curves(self, client):
        """상세는 그때의 목표와 실측을 다시 겹쳐 그릴 수 있어야 합니다."""
        brew_id = guided_brew(client)
        body = client.get(f"/api/brews/{brew_id}").json()

        assert len(body["actualCurve"]) > 1000
        assert len(body["recipe"]["targetCurve"]) == 9
        assert body["recipe"]["waterTempC"] == 96

    def test_recipe_id_allows_brewing_again(self, client):
        """'이 레시피로 다시 내리기'는 응답의 recipeId를 그대로 재사용합니다."""
        brew_id = guided_brew(client)
        recipe_id = client.get(f"/api/brews/{brew_id}").json()["recipe"]["recipeId"]

        curve = brew_curve(TYPICAL, total_sec=150)
        res = client.post("/api/brews", json={"recipeId": recipe_id, "actualCurve": curve, **TIMES})
        assert res.status_code == 201

    def test_free_mode_has_no_recipe(self, client):
        brew_id = free_brew(client)
        body = client.get(f"/api/brews/{brew_id}").json()

        assert body["recipe"] is None
        assert body["rmse"] is None
        assert len(body["actualCurve"]) > 1000

    def test_includes_feedback_when_rated(self, client):
        brew_id = guided_brew(client)
        adjusted = client.post(
            "/api/recipe/adjust",
            json={"brewId": brew_id, "acidity": "OK", "bitterness": "STRONG", "strength": "OK"},
        ).json()
        client.patch(f"/api/feedback/{adjusted['feedbackId']}", json={"applied": True})

        feedback = client.get(f"/api/brews/{brew_id}").json()["feedback"]
        assert feedback["bitterness"] == "STRONG"
        assert feedback["suggestedRecipeId"] == adjusted["suggestedRecipeId"]
        assert feedback["applied"] is True

    def test_feedback_is_null_when_not_rated(self, client):
        brew_id = guided_brew(client)
        assert client.get(f"/api/brews/{brew_id}").json()["feedback"] is None

    def test_recorded_recipe_detail_has_no_rule_fields(self, client):
        """직접 부은 곡선을 목표로 저장한 경우 — 규칙 필드가 존재하지 않습니다."""
        free_id = free_brew(client)
        recorded = client.post(
            f"/api/brews/{free_id}/save-as-recipe", json={"doseG": 20, "drinkType": "HOT"}
        ).json()["recipeId"]
        curve = brew_curve(TYPICAL, total_sec=150)
        brew_id = client.post(
            "/api/brews", json={"recipeId": recorded, "actualCurve": curve, **TIMES}
        ).json()["brewId"]

        recipe = client.get(f"/api/brews/{brew_id}").json()["recipe"]
        assert recipe["waterTempC"] is None
        assert recipe["pours"] == []
        assert len(recipe["targetCurve"]) == 9

    def test_unknown_brew_is_404(self, client):
        assert client.get("/api/brews/9999").status_code == 404
