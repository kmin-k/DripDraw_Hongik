"""DB를 최신 구조로 맞춥니다 (Alembic `upgrade head`).

예전에는 서버가 켜질 때 `create_all()`로 테이블을 만들었습니다. 그 방식은 **없는 테이블만**
만들고 기존 테이블에 컬럼을 더하지 못해, 모델을 바꿀 때마다 DB 파일을 지워야 했습니다.
서버 DB는 지울 수 없으므로 변경 이력(`migrations/versions/`)을 순서대로 적용합니다.

이미 최신이면 아무 일도 하지 않으므로 서버가 켜질 때마다 불러도 안전합니다.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config

from app.config import settings

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def alembic_config(url: str | None = None) -> Config:
    """실행 위치와 무관하게 backend/alembic.ini를 찾습니다."""
    cfg = Config(str(ALEMBIC_INI))
    cfg.attributes["url"] = url or settings.database_url
    cfg.attributes["configure_logger"] = False
    return cfg


def upgrade_to_head(url: str | None = None) -> None:
    command.upgrade(alembic_config(url), "head")
