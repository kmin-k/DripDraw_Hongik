"""POST /api/recipe/adjust · PATCH /api/feedback/{id} — 피드백 루프 (Phase 4).

닫는 고리: 레시피 생성 → 추출 → 맛 평가 → 보정된 레시피 → 다시 추출.
"""

from tests.test_curve_shaping import TYPICAL, brew_curve

TIMES = {"startedAt": "2026-08-12T09:12:03Z", "endedAt": "2026-08-12T09:15:31Z"}
GOLDEN = {
    "doseG": 20,
    "drinkType": "HOT",
    "roastLevel": "LIGHT",
    "region": "AFRICA",
    "process": "WASHED",
    "d50Um": 950,
}
NEUTRAL = {"acidity": "OK", "bitterness": "OK", "strength": "OK"}


def brewed(client, **recipe_overrides) -> tuple[int, dict]:
    """레시피를 만들고 그걸로 한 번 추출한 상태를 만듭니다."""
    recipe = client.post("/api/recipe/generate", json={**GOLDEN, **recipe_overrides}).json()
    curve = brew_curve(TYPICAL, total_sec=150, noise_g=1.0)
    brew = client.post(
        "/api/brews", json={"recipeId": recipe["recipeId"], "actualCurve": curve, **TIMES}
    ).json()
    return brew["brewId"], recipe


def adjust(client, brew_id: int, **taste):
    return client.post("/api/recipe/adjust", json={"brewId": brew_id, **NEUTRAL, **taste})


class TestAdjust:
    def test_creates_a_new_recipe_pointing_at_the_original(self, client):
        """원본을 덮어쓰지 않습니다. 되돌리기와 비교가 항상 가능해야 합니다."""
        brew_id, recipe = brewed(client)

        res = adjust(client, brew_id, strength="THIN")
        assert res.status_code == 201
        body = res.json()

        assert body["parentRecipeId"] == recipe["recipeId"]
        assert body["suggestedRecipeId"] != recipe["recipeId"]
        assert body["feedbackId"] > 0

    def test_thin_feedback_reduces_total_water(self, client):
        """연하다 → Ratio↓ → 총 물량이 줄어 진해집니다."""
        brew_id, recipe = brewed(client)
        body = adjust(client, brew_id, strength="THIN").json()

        assert recipe["totalWaterG"] == 300
        assert body["recipe"]["totalWaterG"] == 280  # 20 g × 14

    def test_changes_table_explains_every_adjustment(self, client):
        """`changes`가 발표의 핵심입니다. 무엇이 왜 바뀌었는지 전부 있어야 합니다."""
        brew_id, _ = brewed(client)
        body = adjust(client, brew_id, strength="THIN", bitterness="STRONG").json()

        by_field = {c["field"]: c for c in body["changes"]}
        assert set(by_field) == {"ratio", "waterTempC", "flowRateGps", "grindGuide"}
        assert by_field["ratio"]["reason"] == "농도 연함"
        assert by_field["waterTempC"]["reason"] == "쓴맛 강함"
        assert all(c["before"] != c["after"] for c in body["changes"])

    def test_neutral_feedback_changes_nothing(self, client):
        """전부 만족이면 곡선이 그대로여야 합니다. 괜히 흔들지 않습니다."""
        brew_id, recipe = brewed(client)
        body = adjust(client, brew_id).json()

        assert body["changes"] == []
        assert body["recipe"]["targetCurve"] == recipe["targetCurve"]

    def test_adjusted_curve_has_the_same_shape_as_a_rule_recipe(self, client):
        """보정 곡선도 규칙 엔진과 같은 함수로 그립니다. 화면과 RMSE가 그대로 동작해야 합니다."""
        brew_id, recipe = brewed(client)
        body = adjust(client, brew_id, strength="THIN").json()

        assert len(body["recipe"]["targetCurve"]) == len(recipe["targetCurve"])
        assert len(body["recipe"]["pours"]) == 4

    def test_suggested_recipe_can_be_brewed_again(self, client):
        """고리가 닫혀야 합니다 — 보정 레시피로 바로 다시 내릴 수 있어야 합니다."""
        brew_id, _ = brewed(client)
        suggested = adjust(client, brew_id, strength="THIN").json()["suggestedRecipeId"]

        curve = brew_curve(TYPICAL, total_sec=150)
        res = client.post("/api/brews", json={"recipeId": suggested, "actualCurve": curve, **TIMES})
        assert res.status_code == 201
        assert res.json()["rmse"] is not None

    def test_opposite_signals_only_produce_a_notice(self, client):
        """신맛·쓴맛이 함께 강하면 조정 없이 분쇄 균일성을 안내합니다 (8-6절)."""
        brew_id, _ = brewed(client)
        body = adjust(client, brew_id, acidity="STRONG", bitterness="STRONG").json()

        assert body["changes"] == []
        assert any("균일성" in notice for notice in body["notices"])


class TestRatioGuard:
    """8-4절 필수 가드 — 상한 30 g은 Ratio 15 기준으로 잡은 값입니다.

    Ratio가 오르면 한 번에 붓는 양이 늘어 임계 원두량이 내려갑니다.

    **한 번의 피드백(15 → 16)으로는 어떤 조합에서도 간격을 넘지 않습니다.**
    "진하다"를 두 번 연속 받아 17이 되어야 걸리므로, 아래 테스트는 보정을 두 번 겁니다.
    """

    #: 유량이 가장 낮게 나오는 조합(아프리카 + 굵은 분쇄)에 원두량·간격이 가장 빡빡한 다크.
    TIGHT = {"doseG": 30, "d50Um": 3000, "roastLevel": "DARK"}

    def test_blocks_a_ratio_increase_that_overruns_the_interval(self, client):
        """원두량이 많으면 물을 더 늘릴 수 없습니다. 조정을 빼고 이유를 알립니다."""
        brew_id, _ = brewed(client, **self.TIGHT)

        # 1회차: 15 → 16. 아직 여유가 있습니다.
        first = adjust(client, brew_id, strength="THICK").json()
        assert first["recipe"]["ratio"] == 16.0
        assert first["notices"] == []

        # 2회차: 16 → 17이면 2차 주수가 주수 간격을 넘습니다.
        curve = brew_curve(TYPICAL, total_sec=150)
        again = client.post(
            "/api/brews",
            json={"recipeId": first["suggestedRecipeId"], "actualCurve": curve, **TIMES},
        ).json()["brewId"]
        body = adjust(client, again, strength="THICK").json()

        assert any("늘릴 수 없" in notice for notice in body["notices"])
        # 표에도 남으면 안 됩니다. 안 바뀐 값을 바뀌었다고 보여주는 셈이 됩니다.
        assert all(c["field"] != "ratio" for c in body["changes"])
        assert body["recipe"]["ratio"] == 16.0
        assert body["recipe"]["totalWaterG"] == first["recipe"]["totalWaterG"]

    def test_a_ratio_decrease_is_always_safe(self, client):
        """물을 줄이는 방향은 푸어 시간이 짧아지므로 막을 이유가 없습니다."""
        brew_id, _ = brewed(client, **self.TIGHT)
        body = adjust(client, brew_id, strength="THIN").json()

        assert body["notices"] == []
        assert any(c["field"] == "ratio" for c in body["changes"])

    def test_blocks_a_flow_decrease_that_overruns_the_interval(self, client):
        """유량을 낮추면 같은 양을 붓는 데 더 오래 걸려 역시 간격을 넘길 수 있습니다.

        Ratio와 달리 이쪽은 문서에 없던 경로입니다. 대칭이라 같은 가드를 적용합니다.
        """
        brew_id, _ = brewed(client, **self.TIGHT)

        first = adjust(client, brew_id, acidity="STRONG").json()  # 유량 7.0 → 6.5
        assert first["recipe"]["flowRateGps"] == 6.5

        curve = brew_curve(TYPICAL, total_sec=150)
        again = client.post(
            "/api/brews",
            json={"recipeId": first["suggestedRecipeId"], "actualCurve": curve, **TIMES},
        ).json()["brewId"]
        body = adjust(client, again, acidity="STRONG").json()  # 6.0이면 간격 초과

        assert any("유량" in notice for notice in body["notices"])
        assert all(c["field"] != "flowRateGps" for c in body["changes"])
        assert body["recipe"]["flowRateGps"] == 6.5
        # 막힌 것은 유량뿐입니다. 나머지 조정은 그대로 살아 있어야 합니다.
        assert any(c["field"] == "waterTempC" for c in body["changes"])

    def test_normal_dose_is_unaffected_by_the_guard(self, client):
        brew_id, _ = brewed(client)
        body = adjust(client, brew_id, strength="THICK").json()

        assert body["notices"] == []
        assert body["recipe"]["ratio"] == 16.0


class TestRejections:
    def test_free_mode_brew_cannot_be_adjusted(self, client):
        """자유 모드 추출에는 보정할 원본 레시피가 없습니다."""
        curve = brew_curve(TYPICAL, total_sec=150)
        brew_id = client.post("/api/brews", json={"actualCurve": curve, **TIMES}).json()["brewId"]

        res = adjust(client, brew_id, strength="THIN")
        assert res.status_code == 400

    def test_recorded_recipe_cannot_be_adjusted(self, client):
        """손으로 부은 곡선에는 조정할 파라미터(온도·유량·Ratio) 자체가 없습니다."""
        curve = brew_curve(TYPICAL, total_sec=150)
        free_id = client.post("/api/brews", json={"actualCurve": curve, **TIMES}).json()["brewId"]
        recorded = client.post(
            f"/api/brews/{free_id}/save-as-recipe", json={"doseG": 20, "drinkType": "HOT"}
        ).json()["recipeId"]

        brew_id = client.post(
            "/api/brews", json={"recipeId": recorded, "actualCurve": curve, **TIMES}
        ).json()["brewId"]

        res = adjust(client, brew_id, strength="THIN")
        assert res.status_code == 400

    def test_unknown_brew_is_404(self, client):
        assert adjust(client, 9999, strength="THIN").status_code == 404

    def test_one_feedback_per_brew(self, client):
        """같은 추출을 두 번 평가하면 어느 쪽이 진짜인지 알 수 없습니다."""
        brew_id, _ = brewed(client)
        assert adjust(client, brew_id, strength="THIN").status_code == 201
        assert adjust(client, brew_id, strength="THICK").status_code == 409

    def test_invalid_taste_value_is_422(self, client):
        brew_id, _ = brewed(client)
        res = client.post(
            "/api/recipe/adjust", json={"brewId": brew_id, **NEUTRAL, "strength": "SPICY"}
        )
        assert res.status_code == 422


class TestApplied:
    """제안을 만드는 것과 받아들이는 것은 다른 사건입니다."""

    def test_applied_starts_unset(self, client):
        brew_id, _ = brewed(client)
        body = adjust(client, brew_id, strength="THIN").json()

        res = client.patch(f"/api/feedback/{body['feedbackId']}", json={"applied": True})
        assert res.status_code == 200
        assert res.json()["applied"] is True

    def test_can_record_a_rejection(self, client):
        """쓰지 않은 제안도 기록해야 나중에 학습 신호가 됩니다."""
        brew_id, _ = brewed(client)
        feedback_id = adjust(client, brew_id, strength="THIN").json()["feedbackId"]

        res = client.patch(f"/api/feedback/{feedback_id}", json={"applied": False})
        assert res.json()["applied"] is False

    def test_unknown_feedback_is_404(self, client):
        assert client.patch("/api/feedback/9999", json={"applied": True}).status_code == 404
