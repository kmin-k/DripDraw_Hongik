"""응답 시각에 UTC가 붙는지.

DB 컬럼에 시간대가 없어 그대로 내보내면 "Z"가 빠지고, 브라우저가 한국 시각으로 읽어
09:12 추출이 00:12로 보였습니다.
"""

from datetime import datetime

from tests.test_brew_history import TIMES, guided_brew


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_brewed_at_carries_utc(client):
    brew_id = guided_brew(client)

    detail = client.get(f"/api/brews/{brew_id}").json()
    listed = client.get("/api/brews").json()["items"][0]

    for value in (detail["brewedAt"], listed["brewedAt"]):
        assert parse(value).utcoffset() is not None
        assert parse(value) == parse(TIMES["startedAt"])


def test_other_offsets_are_stored_as_utc(client):
    """+09:00으로 보내도 같은 순간으로 저장됩니다."""
    body = {
        "actualCurve": [[0, 0], [10, 50]],
        "startedAt": "2026-08-13T18:12:03+09:00",
        "endedAt": "2026-08-13T18:15:31+09:00",
    }
    brew_id = client.post("/api/brews", json=body).json()["brewId"]

    brewed_at = parse(client.get(f"/api/brews/{brew_id}").json()["brewedAt"])
    assert brewed_at == parse("2026-08-13T09:12:03Z")


def test_created_at_carries_utc(client):
    guided_brew(client)
    bean = client.post(
        "/api/beans",
        json={"name": "Kenya", "region": "AFRICA", "process": "WASHED", "roastLevel": "LIGHT"},
    ).json()
    assert parse(bean["createdAt"]).utcoffset() is not None

    [recipe] = client.get("/api/recipes").json()["items"]
    assert parse(recipe["createdAt"]).utcoffset() is not None
    assert parse(recipe["lastBrewedAt"]).utcoffset() is not None
