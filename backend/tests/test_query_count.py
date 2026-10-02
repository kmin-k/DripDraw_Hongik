"""목록 API가 DB에 묻는 횟수 (N+1 문제).

목록을 그릴 때 항목마다 연결된 레시피·원두·평가를 따로 물으면 질문 수가 **1 + 항목 수 × 3**으로
늘어납니다. 기록 50건이면 151번입니다. 관련된 것을 한꺼번에 가져오면 항목 수와 무관하게 일정합니다.

정확한 횟수보다 **"항목이 늘어도 질문 수가 그대로인가"**를 봅니다. 그게 N+1이 없다는 뜻입니다.
"""

from contextlib import contextmanager

from sqlalchemy import event
from sqlalchemy.engine import Engine

from tests.test_brew_history import BEAN, guided_brew
from tests.test_feedback_api import adjust


@contextmanager
def count_queries():
    """이 블록 안에서 실행된 SQL 개수를 셉니다."""
    queries: list[str] = []

    def record(conn, cursor, statement, *args):
        queries.append(statement)

    event.listen(Engine, "before_cursor_execute", record)
    try:
        yield queries
    finally:
        event.remove(Engine, "before_cursor_execute", record)


def _brews_with_beans_and_feedback(client, count: int) -> None:
    """원두·레시피·맛 평가가 모두 붙은 기록 count건. 관계가 많을수록 N+1이 잘 드러납니다."""
    bean_id = client.post("/api/beans", json=BEAN).json()["id"]
    for _ in range(count):
        brew_id = guided_brew(client, bean_id)
        adjust(client, brew_id, strength="THICK")


def _queries_for(client, path: str) -> int:
    with count_queries() as queries:
        assert client.get(path).status_code == 200
    return len(queries)


class TestBrewList:
    def test_query_count_does_not_grow_with_brews(self, client):
        """★ 기록이 3건이든 9건이든 같은 횟수로 가져와야 합니다."""
        _brews_with_beans_and_feedback(client, 3)
        few = _queries_for(client, "/api/brews")

        _brews_with_beans_and_feedback(client, 6)
        many = _queries_for(client, "/api/brews")

        assert many == few

    def test_stays_small(self, client):
        """기록 + 레시피 + 원두 + 평가 — 관계마다 한 번씩입니다."""
        _brews_with_beans_and_feedback(client, 5)
        assert _queries_for(client, "/api/brews") <= 5


class TestRecipeList:
    def test_query_count_does_not_grow_with_recipes(self, client):
        """레시피마다 원두 이름을 따로 묻지 않아야 합니다."""
        _brews_with_beans_and_feedback(client, 2)
        few = _queries_for(client, "/api/recipes")

        _brews_with_beans_and_feedback(client, 5)
        many = _queries_for(client, "/api/recipes")

        assert many == few
