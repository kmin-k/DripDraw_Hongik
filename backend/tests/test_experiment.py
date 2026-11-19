"""사용자 실험 — 시행 저장·판정·내보내기 (docs/api.md "사용자 실험").

실험 시행은 일반 추출과 **같은 저장·RMSE 경로**를 탑니다. 실험에서 잰 정확도와 실제 사용의
정확도가 같은 정의여야 논문의 지표가 앱의 지표와 같은 것을 가리키기 때문입니다.
"""

import csv
import io

RECIPE_BODY = {
    "doseG": 20,
    "drinkType": "HOT",
    "region": "AFRICA",
    "process": "WASHED",
    "roastLevel": "LIGHT",
    "d50Um": 950,
}

TIMES = {"startedAt": "2026-11-20T05:00:00Z", "endedAt": "2026-11-20T05:02:45Z"}


def tag(**overrides) -> dict:
    return {
        "study": "PILOT",
        "participantCode": "P01",
        "stage": "WATER",
        "condition": 3,
        "trialNo": 1,
        **overrides,
    }


def save_trial(client, recipe, curve=None, **overrides) -> dict:
    res = client.post(
        "/api/brews",
        json={
            "recipeId": recipe["recipeId"],
            "actualCurve": curve or recipe["targetCurve"],
            "experiment": tag(**overrides),
            **TIMES,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def make_recipe(client) -> dict:
    return client.post("/api/recipe/generate", json=RECIPE_BODY).json()


def read_csv(res) -> list[dict]:
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    text = res.content.decode("utf-8-sig")  # 엑셀용 BOM을 떼고 읽습니다.
    return list(csv.DictReader(io.StringIO(text)))


def test_trial_is_saved_with_the_brew_and_rmse_is_server_side(client):
    recipe = make_recipe(client)
    off_by_ten = [[t, w + 10] for t, w in recipe["targetCurve"]]

    saved = save_trial(client, recipe, curve=off_by_ten)

    assert saved["trialId"] > 0
    assert saved["rmse"] == 10

    items = client.get("/api/experiment/trials", params={"study": "PILOT"}).json()["items"]
    assert len(items) == 1
    trial = items[0]
    assert trial["brewId"] == saved["brewId"]
    assert trial["participantCode"] == "P01"
    assert trial["stage"] == "WATER"
    assert trial["condition"] == 3
    assert trial["trialNo"] == 1
    assert trial["valid"] is True
    assert trial["rmse"] == 10


def test_normal_brew_has_no_trial(client):
    recipe = make_recipe(client)
    body = client.post(
        "/api/brews", json={"recipeId": recipe["recipeId"], "actualCurve": [[0, 0]], **TIMES}
    ).json()
    assert body["trialId"] is None


def test_trial_needs_a_target_recipe(client):
    """종속변수가 목표 대비 RMSE라서, 목표 없는 시행은 저장할 수 없습니다."""
    res = client.post(
        "/api/brews",
        json={"actualCurve": [[0, 0], [10, 60]], "experiment": tag(), **TIMES},
    )
    assert res.status_code == 422


def test_participant_code_rejects_names(client):
    """이름 같은 개인정보가 저장되지 않게 코드 형식만 받습니다."""
    recipe = make_recipe(client)
    for bad in ["홍길동", "p01", "P1", "PARTICIPANT"]:
        res = client.post(
            "/api/brews",
            json={
                "recipeId": recipe["recipeId"],
                "actualCurve": recipe["targetCurve"],
                "experiment": tag(participantCode=bad),
                **TIMES,
            },
        )
        assert res.status_code == 422, bad


def test_condition_must_be_one_of_four(client):
    recipe = make_recipe(client)
    for bad in [0, 5]:
        res = client.post(
            "/api/brews",
            json={
                "recipeId": recipe["recipeId"],
                "actualCurve": recipe["targetCurve"],
                "experiment": tag(condition=bad),
                **TIMES,
            },
        )
        assert res.status_code == 422


def test_experiment_brews_stay_out_of_history(client):
    """참가자의 시행이 앱 사용자의 기록 목록에 섞이면 안 됩니다."""
    recipe = make_recipe(client)
    save_trial(client, recipe)
    normal = client.post(
        "/api/brews",
        json={"recipeId": recipe["recipeId"], "actualCurve": recipe["targetCurve"], **TIMES},
    ).json()

    history = client.get("/api/brews").json()["items"]
    assert [b["brewId"] for b in history] == [normal["brewId"]]


def test_list_filters_by_participant_and_study(client):
    recipe = make_recipe(client)
    save_trial(client, recipe, participantCode="P01")
    save_trial(client, recipe, participantCode="P02")
    save_trial(client, recipe, study="MAIN", participantCode="M001", stage="PRE", condition=1)

    p01 = client.get("/api/experiment/trials", params={"study": "PILOT", "participant": "P01"})
    assert [t["participantCode"] for t in p01.json()["items"]] == ["P01"]

    main = client.get("/api/experiment/trials", params={"study": "MAIN"}).json()["items"]
    assert [t["participantCode"] for t in main] == ["M001"]


def test_mark_invalid_keeps_the_record(client):
    """무효 처리는 지우지 않고 표시만 합니다. 왜 뺐는지까지 남아야 합니다."""
    recipe = make_recipe(client)
    saved = save_trial(client, recipe)

    res = client.patch(
        f"/api/experiment/trials/{saved['trialId']}",
        json={"valid": False, "note": " 저울 연결 끊김 "},
    )
    assert res.status_code == 200
    assert res.json()["valid"] is False
    assert res.json()["note"] == "저울 연결 끊김"

    # 사유만 고쳐도 판정은 그대로입니다.
    res = client.patch(
        f"/api/experiment/trials/{saved['trialId']}", json={"note": "물 넘침"}
    ).json()
    assert res["valid"] is False
    assert res["note"] == "물 넘침"

    assert client.get(f"/api/brews/{saved['brewId']}").status_code == 200


def test_update_unknown_trial_is_404(client):
    assert client.patch("/api/experiment/trials/999", json={"valid": False}).status_code == 404


def test_deleting_the_brew_removes_its_trial(client):
    recipe = make_recipe(client)
    saved = save_trial(client, recipe)

    assert client.delete(f"/api/brews/{saved['brewId']}").status_code == 204
    items = client.get("/api/experiment/trials", params={"study": "PILOT"}).json()["items"]
    assert items == []


def test_summary_csv_has_one_row_per_trial(client):
    recipe = make_recipe(client)
    first = save_trial(client, recipe, condition=1)
    save_trial(client, recipe, condition=4, trialNo=2)
    client.patch(
        f"/api/experiment/trials/{first['trialId']}", json={"valid": False, "note": "물 넘침"}
    )

    rows = read_csv(client.get("/api/experiment/export/summary.csv", params={"study": "PILOT"}))

    assert len(rows) == 2
    assert rows[0]["condition"] == "1"
    assert rows[0]["valid"] == "0"
    assert rows[0]["note"] == "물 넘침"
    assert rows[0]["recipe_id"] == str(recipe["recipeId"])
    assert float(rows[0]["rmse"]) == 0
    assert rows[1]["trial_no"] == "2"
    assert rows[1]["valid"] == "1"


def test_curves_csv_is_long_format(client):
    recipe = make_recipe(client)
    saved = save_trial(client, recipe)

    rows = read_csv(client.get("/api/experiment/export/curves.csv", params={"study": "PILOT"}))

    assert len(rows) == len(recipe["targetCurve"])
    assert {r["trial_id"] for r in rows} == {str(saved["trialId"])}
    assert [[float(r["t_sec"]), float(r["weight_g"])] for r in rows] == recipe["targetCurve"]


def test_export_of_empty_study_has_only_the_header(client):
    rows = read_csv(client.get("/api/experiment/export/summary.csv", params={"study": "MAIN"}))
    assert rows == []
