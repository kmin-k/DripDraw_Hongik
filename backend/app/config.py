"""애플리케이션 설정. 환경 변수로 덮어쓸 수 있습니다."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./dripdraw.db"

    # 프론트 개발 서버(Vite). CONTRIBUTING.md "실행 포트" 참고.
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
