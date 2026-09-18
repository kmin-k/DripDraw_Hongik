"""레시피 조회·삭제와 미리보기 (Phase 5).

레시피는 만들어지기만 하고 조회되지 않았습니다. 보정 레시피를 다음 날 다시 쓰려면
목록이 있어야 하고, 미리보기가 저장을 남기지 않아야 목록이 쓰레기로 차지 않습니다.
"""

from tests.test_brew_history import BEAN, GOLDEN, free_brew, guided_brew
from tests.test_curve_shaping import TYPICAL, brew_curve
from tests.test_feedback_api import adjust


class TestPreview:
    def test_same_numbers_as_generate_but_no_id(self, client):
        """미리보기는 계산 결과가 같고 recipeId만 없습니다."""
        preview = client.post("/api/recipe/preview", json=GOLDEN)
        stored = client.post("/api/recipe/generate", json=GOLDEN)

        assert preview.status_code == 200
        body = preview.json()
        assert "recipeId" not in body
        assert body["targetCurve"] == stored.json()["targetCurve"]
        assert body["pours"] == stored.json()["pours"]

    def test_leaves_nothing_in_the_database(self, client):
        """★ 슬라이더를 끌 때마다 부르므로 저장되면 안 됩니다."""
        for dose in (10, 15, 20, 25, 30):
            client.post("/api/recipe/preview", json={**GOLDEN, "doseG": dose})

        assert client.get("/api/recipes").json()["items"] == []

    def test_rule_violation_is_400(self, client):
        res = client.post(
            "/api/recipe/preview", json={**GOLDEN, "doseG": 30, "d50Um": 3000, "roastLevel": "DARK"}
        )
        # 30 g 다크·굵은 분쇄는 규칙 안이라 통과합니다. 범위 밖 원두량은 422(스키마).
        assert res.status_code == 200
        assert client.post("/api/recipe/preview", json={**GOLDEN, "doseG": 40}).status_code == 422


class TestList:
    def test_empty_at_first(self, client):
        assert client.get("/api/recipes").json()["items"] == []

    def test_newest_first_with_source(self, client):
        first = client.post("/api/recipe/generate", json=GOLDEN).json()["recipeId"]
        second = client.post("/api/recipe/generate", json=GOLDEN).json()["recipeId"]

        items = client.get("/api/recipes").json()["items"]
        assert [item["recipeId"] for item in items] == [second, first]
        assert items[0]["source"] == "RULE_ENGINE"
        assert items[0]["doseG"] == 20
        assert items[0]["drinkType"] == "HOT"

    def test_counts_brews_and_reports_the_latest_accuracy(self, client):
        """★ "쓴 적 없는 레시피"를 화면이 접을 수 있어야 하고, 마지막 정확도가 보여야 합니다."""
        brew_id = guided_brew(client)
        recipe_id = client.get(f"/api/brews/{brew_id}").json()["recipe"]["recipeId"]
        unused = client.post("/api/recipe/generate", json=GOLDEN).json()["recipeId"]

        # 같은 레시피로 한 번 더, 더 나중 시각으로.
        later = client.post(
            "/api/brews",
            json={
                "recipeId": recipe_id,
                "actualCurve": brew_curve(TYPICAL, total_sec=150),
                "startedAt": "2026-08-20T09:00:00Z",
                "endedAt": "2026-08-20T09:02:30Z",
            },
        ).json()

        by_id = {item["recipeId"]: item for item in client.get("/api/recipes").json()["items"]}
        assert by_id[recipe_id]["brewCount"] == 2
        assert by_id[recipe_id]["lastRmse"] == later["rmse"]
        assert by_id[recipe_id]["lastBrewedAt"].startswith("2026-08-20")
        assert by_id[unused]["brewCount"] == 0
        assert by_id[unused]["lastRmse"] is None

    def test_carries_name_bean_and_source_for_recorded_and_adjusted(self, client):
        free_id = free_brew(client)
        recorded = client.post(
            f"/api/brews/{free_id}/save-as-recipe",
            json={"doseG": 20, "drinkType": "HOT", "name": "주말 아침용", "newBean": BEAN},
        ).json()
        guided_id = guided_brew(client)
        adjusted = adjust(client, guided_id, strength="THICK").json()["suggestedRecipeId"]

        by_id = {item["recipeId"]: item for item in client.get("/api/recipes").json()["items"]}
        assert by_id[recorded["recipeId"]]["source"] == "RECORDED"
        assert by_id[recorded["recipeId"]]["name"] == "주말 아침용"
        assert by_id[recorded["recipeId"]]["beanName"] == BEAN["name"]
        assert by_id[adjusted]["source"] == "ADJUSTED"


class TestDetail:
    def test_same_shape_as_generate(self, client):
        """추출 화면이 그대로 받아 목표로 쓸 수 있어야 합니다."""
        created = client.post("/api/recipe/generate", json=GOLDEN).json()

        res = client.get(f"/api/recipes/{created['recipeId']}")

        assert res.status_code == 200
        assert res.json() == created

    def test_unknown_is_404(self, client):
        assert client.get("/api/recipes/9999").status_code == 404


class TestDelete:
    def test_removes_an_unused_recipe(self, client):
        recipe_id = client.post("/api/recipe/generate", json=GOLDEN).json()["recipeId"]

        assert client.delete(f"/api/recipes/{recipe_id}").status_code == 204
        assert client.get(f"/api/recipes/{recipe_id}").status_code == 404

    def test_refuses_when_brews_exist(self, client):
        """★ 기록의 정확도는 이 곡선 대비 값이라, 레시피가 사라지면 뜻을 잃습니다."""
        brew_id = guided_brew(client)
        recipe_id = client.get(f"/api/brews/{brew_id}").json()["recipe"]["recipeId"]

        res = client.delete(f"/api/recipes/{recipe_id}")

        assert res.status_code == 409
        assert "1건" in res.json()["detail"]
        assert client.get(f"/api/recipes/{recipe_id}").status_code == 200

    def test_allowed_after_the_brews_are_gone(self, client):
        brew_id = guided_brew(client)
        recipe_id = client.get(f"/api/brews/{brew_id}").json()["recipe"]["recipeId"]

        client.delete(f"/api/brews/{brew_id}")

        assert client.delete(f"/api/recipes/{recipe_id}").status_code == 204

    def test_unlinks_children_and_feedback(self, client):
        """보정 레시피가 부모를 잃어도 남고, 맛 평가는 제안 연결만 끊깁니다."""
        brew_id = guided_brew(client)
        body = adjust(client, brew_id, strength="THICK").json()
        suggested = body["suggestedRecipeId"]

        # 제안 레시피는 아직 내린 적이 없어 지울 수 있습니다.
        assert client.delete(f"/api/recipes/{suggested}").status_code == 204

        detail = client.get(f"/api/brews/{brew_id}").json()
        assert detail["feedback"]["suggestedRecipeId"] is None
        assert detail["recipe"]["recipeId"] == body["parentRecipeId"]

    def test_unknown_is_404(self, client):
        assert client.delete("/api/recipes/9999").status_code == 404


class TestSourceBrew:
    """자유 추출을 목표로 저장한 사실을 기록이 기억합니다."""

    def test_detail_points_at_the_saved_recipe(self, client):
        free_id = free_brew(client)
        assert client.get(f"/api/brews/{free_id}").json()["savedRecipeId"] is None

        recipe = client.post(
            f"/api/brews/{free_id}/save-as-recipe",
            json={"doseG": 20, "drinkType": "HOT", "name": "주말 아침용"},
        ).json()

        detail = client.get(f"/api/brews/{free_id}").json()
        assert detail["savedRecipeId"] == recipe["recipeId"]
        assert detail["savedRecipeName"] == "주말 아침용"

    def test_saving_twice_is_409(self, client):
        """★ 같은 기록에서 곡선이 같은 레시피가 둘 생기면 안 됩니다."""
        free_id = free_brew(client)
        body = {"doseG": 20, "drinkType": "HOT"}
        first = client.post(f"/api/brews/{free_id}/save-as-recipe", json=body).json()

        res = client.post(f"/api/brews/{free_id}/save-as-recipe", json=body)

        assert res.status_code == 409
        assert f"#{first['recipeId']}" in res.json()["detail"]

    def test_recipe_survives_when_the_brew_is_deleted(self, client):
        free_id = free_brew(client)
        recipe = client.post(
            f"/api/brews/{free_id}/save-as-recipe", json={"doseG": 20, "drinkType": "HOT"}
        ).json()

        client.delete(f"/api/brews/{free_id}")

        assert client.get(f"/api/recipes/{recipe['recipeId']}").status_code == 200

    def test_adjust_response_matches_detail(self, client):
        """보정 응답의 레시피와 상세 조회가 같은 모양이어야 화면이 둘을 섞어 쓸 수 있습니다."""
        brew_id = guided_brew(client)
        body = adjust(client, brew_id, strength="THICK").json()

        assert client.get(f"/api/recipes/{body['suggestedRecipeId']}").json() == body["recipe"]
