"""애플리케이션 설정.

우선순위는 환경 변수 > `backend/.env` 파일 > 아래 기본값입니다.
설정 없이도 기본값으로 그대로 실행되므로 `.env`는 선택입니다 — 바꿀 것이 있을 때만 만드세요.
사용 가능한 항목은 `backend/.env.example` 참고.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # env_file 경로는 실행 위치(backend/) 기준입니다.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dripdraw.db"

    # 프론트 개발 서버(Vite). CONTRIBUTING.md "실행 포트" 참고.
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
