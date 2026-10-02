"""테스트용 앱·DB 픽스처.

실제 dripdraw.db를 건드리지 않도록 테스트마다 새 DB를 씁니다.

기본은 임시 SQLite 파일입니다. **배포용 PostgreSQL에서도 통과하는지** 보려면
`TEST_DATABASE_URL`을 지정하세요 — 그 DB의 테이블을 테스트마다 비우고 다시 만듭니다.

    $env:TEST_DATABASE_URL = "postgresql+psycopg://postgres:test@localhost:5433/postgres"
    pytest

SQLite에서만 되고 PostgreSQL에서 안 되는 것(타입·정렬·제약)은 서버에 올리기 전에 여기서 드러납니다.
"""

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


def _fresh_engine(tmp_path, name: str) -> Engine:
    """테이블이 빈 상태의 엔진. 테스트끼리 데이터가 섞이지 않게 매번 새로 만듭니다."""
    if TEST_DATABASE_URL:
        engine = create_engine(TEST_DATABASE_URL)
        Base.metadata.drop_all(bind=engine)
    else:
        engine = create_engine(
            f"sqlite:///{tmp_path / name}",
            connect_args={"check_same_thread": False},
        )
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture
def db(tmp_path):
    """모델을 직접 다루는 테스트용 세션. 라우터를 거치지 않습니다."""
    engine = _fresh_engine(tmp_path, "model.db")
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def client(tmp_path):
    engine = _fresh_engine(tmp_path, "test.db")
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()
