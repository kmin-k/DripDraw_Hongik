"""SQLAlchemy 엔진·세션·Base.

테이블은 여기서 만들지 않습니다. Alembic 마이그레이션이 만듭니다 (app/migrate.py).
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# SQLite는 기본적으로 다른 스레드에서의 접근을 막습니다.
# FastAPI는 요청을 스레드풀에서 처리하므로 이 옵션이 필요합니다.
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
