PAYLOAD = {
    "name": "Ethiopia Yirgacheffe",
    "roaster": "OO로스터리",
    "region": "AFRICA",
    "process": "WASHED",
    "roastLevel": "LIGHT",
    "roastedAt": "2026-07-25",
    "memo": "자몽, 홍차",
}


def test_create_and_list_bean(client):
    res = client.post("/api/beans", json=PAYLOAD)
    assert res.status_code == 201
    body = res.json()
    assert body["id"] > 0
    # ENUM은 영어 대문자로 저장하고 한글 라벨은 프론트에서 매핑합니다 (erd.md).
    assert body["roastLevel"] == "LIGHT"

    items = client.get("/api/beans").json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == PAYLOAD["name"]


def test_reject_unknown_enum(client):
    res = client.post("/api/beans", json={**PAYLOAD, "region": "EUROPE"})
    assert res.status_code == 422
