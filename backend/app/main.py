"""FastAPI 진입점.

실행:  uvicorn app.main:app --reload
문서:  http://localhost:8000/docs
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import beans, recipes


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 마이그레이션 도구 없이 create_all로 시작합니다 (erd.md "데모 범위에서 뺀 것").
    # models를 import해야 Base.metadata에 테이블이 등록됩니다.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="DripDraw API",
    description="추출 재현성을 확보하는 브루잉 가이드 시스템",
    version="0.1.0",
    lifespan=lifespan,
)

# 실시간 무게 데이터는 서버를 거치지 않습니다. 이 API는 레시피 생성·기록 저장·보정만 담당합니다.
# (docs/architecture.md "데이터 경로")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(beans.router)
app.include_router(recipes.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
