"""FastAPI 진입점.

실행:  uvicorn app.main:app --reload
문서:  http://localhost:8000/docs
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.migrate import upgrade_to_head
from app.routers import beans, brews, feedback, recipes, vision


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 켜질 때 DB를 최신 구조로 맞춥니다. 이미 최신이면 아무 일도 하지 않습니다.
    # create_all과 달리 기존 테이블에 컬럼을 더할 수 있어 서버 DB를 지우지 않아도 됩니다.
    if settings.auto_migrate:
        upgrade_to_head()
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
app.include_router(recipes.stored)
app.include_router(brews.router)
app.include_router(feedback.router)
app.include_router(vision.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
