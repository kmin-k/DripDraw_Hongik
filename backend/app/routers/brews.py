"""추출 기록 저장·조회 (Phase 2)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Brew, Recipe
from app.schemas import BrewCreate, BrewOut
from app.services.rmse import calculate_rmse

router = APIRouter(prefix="/api/brews", tags=["brews"])

DbSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=BrewOut, status_code=status.HTTP_201_CREATED)
def create_brew(payload: BrewCreate, db: DbSession) -> BrewOut:
    recipe: Recipe | None = None
    if payload.recipe_id is not None:
        recipe = db.get(Recipe, payload.recipe_id)
        if recipe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"recipe_id {payload.recipe_id} not found",
            )

    # 정확도는 프론트가 보낸 값을 믿지 않고 여기서 다시 계산합니다.
    # 실시간 표시는 브라우저가 하지만, 저장되는 값의 기준은 서버입니다 (docs/api.md).
    # 자유 모드는 비교할 목표가 없어 None이 됩니다.
    rmse = calculate_rmse(recipe.target_curve, payload.actual_curve) if recipe else None

    # 소요 시간과 최종 물량도 클라이언트 주장이 아니라 측정값에서 뽑습니다.
    last_time, last_weight = payload.actual_curve[-1]

    brew = Brew(
        recipe_id=payload.recipe_id,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        duration_sec=round(last_time),
        final_weight_g=last_weight,
        rmse=rmse,
        actual_curve=payload.actual_curve,
    )
    db.add(brew)
    db.commit()
    db.refresh(brew)

    return BrewOut(
        brew_id=brew.id,
        rmse=brew.rmse,
        duration_sec=brew.duration_sec,
        final_weight_g=brew.final_weight_g,
    )
