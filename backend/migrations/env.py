"""Alembic 실행 환경.

DB 주소는 두 곳에서 옵니다.
- 앱·테스트가 코드로 부를 때 (`app/migrate.py`): 넘겨준 주소
- 터미널에서 `alembic ...`을 칠 때: `app/config.py`의 DATABASE_URL (`.env`·환경 변수)

비교 대상은 `app/models.py`의 모델입니다. `--autogenerate`는 모델과 DB의 차이를 찾아
마이그레이션 초안을 만들어 줍니다. **초안은 반드시 열어 확인하고 커밋합니다.**
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app import models  # noqa: F401  — import해야 Base.metadata에 테이블이 등록됩니다.
from app.config import settings
from app.database import Base

config = context.config

# 터미널에서 실행할 때만 alembic.ini의 로그 설정을 씁니다.
# 서버 시작 중에 부르면 uvicorn 로그 설정을 덮어써 버립니다.
if config.config_file_name and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _url() -> str:
    return config.attributes.get("url") or settings.database_url


def run_migrations_offline() -> None:
    """DB에 접속하지 않고 SQL만 출력합니다 (`alembic upgrade head --sql`)."""
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_url())
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite는 컬럼 변경(ALTER COLUMN)을 지원하지 않습니다. batch 모드는 테이블을
            # 새로 만들어 옮기는 방식으로 우회합니다. PostgreSQL에서는 평소처럼 ALTER합니다.
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
