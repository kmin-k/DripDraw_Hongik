"""모델(app/models.py)과 마이그레이션(migrations/versions/)이 같은 DB를 만드는지.

다른 테스트는 속도를 위해 모델에서 바로 테이블을 만듭니다(create_all). 서버는 마이그레이션으로
만듭니다. 둘이 어긋나면 **테스트는 통과하는데 서버는 500**이 납니다 — 예전에 겪은 그 함정입니다.

모델에 컬럼을 추가하고 마이그레이션을 만들지 않으면 여기서 실패합니다. 고치는 법:

    cd backend
    alembic revision --autogenerate -m "무엇을 바꿨는지"

생성된 파일을 열어 확인하고 함께 커밋합니다.
"""

import os

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from app import models  # noqa: F401  — Base.metadata에 테이블을 등록합니다.
from app.database import Base
from app.migrate import alembic_config, upgrade_to_head

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture
def empty_db_url(tmp_path):
    """테이블이 하나도 없는 DB 주소. PostgreSQL이면 기존 테이블과 이력까지 비웁니다."""
    if not TEST_DATABASE_URL:
        return f"sqlite:///{tmp_path / 'migrations.db'}"

    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
    engine.dispose()
    return TEST_DATABASE_URL


def _diff(url: str) -> list:
    engine = create_engine(url)
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    engine.dispose()
    return diff


def test_migrations_build_the_same_schema_as_the_models(empty_db_url):
    """★ 모델을 바꾸고 마이그레이션을 빠뜨리면 여기서 걸립니다."""
    upgrade_to_head(empty_db_url)

    assert _diff(empty_db_url) == []


def test_upgrade_is_safe_to_repeat(empty_db_url):
    """서버는 켜질 때마다 upgrade를 부릅니다. 이미 최신이면 아무 일도 없어야 합니다."""
    upgrade_to_head(empty_db_url)
    upgrade_to_head(empty_db_url)

    tables = set(inspect(create_engine(empty_db_url)).get_table_names())
    assert {"beans", "recipes", "brews", "feedbacks", "alembic_version"} <= tables


def test_downgrade_then_upgrade_round_trips(empty_db_url):
    """되돌리기도 동작해야 잘못 올린 변경을 서버에서 물릴 수 있습니다."""
    cfg = alembic_config(empty_db_url)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")

    remaining = set(inspect(create_engine(empty_db_url)).get_table_names()) - {"alembic_version"}
    assert remaining == set()

    command.upgrade(cfg, "head")
    assert _diff(empty_db_url) == []
