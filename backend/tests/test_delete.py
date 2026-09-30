"""DELETE /api/brews/{id} · DELETE /api/beans/{id}.

지울 때 무엇이 같이 사라지고 무엇이 남는지가 전부입니다.
- 기록을 지우면 맛 평가는 같이 사라지고, 그 기록으로 만든 레시피는 남습니다.
- 원두를 지우면 레시피·기록은 남고 원두 연결만 끊깁니다.
"""

from tests.test_brew_history import BEAN, GOLDEN, free_brew, guided_brew
from tests.test_feedback_api import adjust


class TestDeleteBrew:
    def test_removes_the_brew(self, client):
        brew_id = guided_brew(client)

        assert client.delete(f"/api/brews/{brew_id}").status_code == 204
        assert client.get(f"/api/brews/{brew_id}").status_code == 404
        assert client.get("/api/brews").json()["items"] == []

    def test_feedback_goes_with_it(self, client):
        """맛 평가는 기록에 딸린 것입니다. 기록 없는 평가는 의미가 없습니다."""
        brew_id = guided_brew(client)
        feedback_id = adjust(client, brew_id, acidity="STRONG").json()["feedbackId"]

        client.delete(f"/api/brews/{brew_id}")

        assert (
            client.patch(f"/api/feedback/{feedback_id}", json={"applied": True}).status_code == 404
        )

    def test_recipes_made_from_it_survive(self, client):
        """목표로 저장한 레시피와 보정 레시피는 독립된 산출물입니다.

        이미 그 레시피로 다른 커피를 내렸을 수 있어, 원본 기록을 지웠다고 같이 지우면
        멀쩡한 기록이 목표를 잃습니다.
        """
        free_id = free_brew(client)
        recorded = client.post(
            f"/api/brews/{free_id}/save-as-recipe", json={"doseG": 20, "drinkType": "HOT"}
        ).json()
        guided_id = guided_brew(client)
        adjusted = adjust(client, guided_id, strength="THICK").json()["suggestedRecipeId"]

        client.delete(f"/api/brews/{free_id}")
        client.delete(f"/api/brews/{guided_id}")

        # 두 레시피 모두 여전히 목표로 쓸 수 있습니다.
        for recipe_id in (recorded["recipeId"], adjusted):
            res = client.post(
                "/api/brews",
                json={
                    "recipeId": recipe_id,
                    "actualCurve": [[0, 0], [10, 50], [150, 300]],
                    "startedAt": "2026-08-14T09:00:00Z",
                    "endedAt": "2026-08-14T09:02:30Z",
                },
            )
            assert res.status_code == 201

    def test_unknown_id_is_404(self, client):
        assert client.delete("/api/brews/9999").status_code == 404

    def test_other_brews_are_untouched(self, client):
        keep = guided_brew(client)
        gone = guided_brew(client)

        client.delete(f"/api/brews/{gone}")

        ids = [item["brewId"] for item in client.get("/api/brews").json()["items"]]
        assert ids == [keep]


class TestDeleteBean:
    def test_removes_the_bean(self, client):
        bean_id = client.post("/api/beans", json=BEAN).json()["id"]

        assert client.delete(f"/api/beans/{bean_id}").status_code == 204
        assert client.get("/api/beans").json()["items"] == []

    def test_history_survives_without_the_bean_name(self, client):
        """★ 원두를 정리해도 내린 커피의 기록은 남아야 합니다. 이름만 빠집니다."""
        bean_id = client.post("/api/beans", json=BEAN).json()["id"]
        brew_id = guided_brew(client, bean_id)

        client.delete(f"/api/beans/{bean_id}")

        items = client.get("/api/brews").json()["items"]
        assert [item["brewId"] for item in items] == [brew_id]
        assert items[0]["beanName"] is None
        assert items[0]["rmse"] is not None  # 정확도는 그대로

        detail = client.get(f"/api/brews/{brew_id}").json()
        assert detail["recipe"]["beanId"] is None
        assert detail["recipe"]["beanName"] is None

    def test_recipe_still_works_as_a_target(self, client):
        """연결이 끊긴 레시피로도 다시 내릴 수 있어야 합니다. 곡선은 레시피가 갖고 있습니다."""
        bean_id = client.post("/api/beans", json=BEAN).json()["id"]
        recipe_id = client.post("/api/recipe/generate", json={**GOLDEN, "beanId": bean_id}).json()[
            "recipeId"
        ]

        client.delete(f"/api/beans/{bean_id}")

        res = client.post(
            "/api/brews",
            json={
                "recipeId": recipe_id,
                "actualCurve": [[0, 0], [10, 50], [150, 300]],
                "startedAt": "2026-08-14T09:00:00Z",
                "endedAt": "2026-08-14T09:02:30Z",
            },
        )
        assert res.status_code == 201

    def test_unknown_id_is_404(self, client):
        assert client.delete("/api/beans/9999").status_code == 404

    def test_other_beans_are_untouched(self, client):
        keep = client.post("/api/beans", json=BEAN).json()["id"]
        gone = client.post("/api/beans", json={**BEAN, "name": "Kenya AA"}).json()["id"]

        client.delete(f"/api/beans/{gone}")

        assert [b["id"] for b in client.get("/api/beans").json()["items"]] == [keep]
