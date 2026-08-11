"""추출 기록 저장·조회 (Phase 2)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bean, Brew, Recipe
from app.schemas import BrewCreate, BrewOut, RecipeOut, SaveAsRecipeRequest
from app.services.curve_shaping import shape_target_curve
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


@router.post(
    "/{brew_id}/save-as-recipe", response_model=RecipeOut, status_code=status.HTTP_201_CREATED
)
def save_as_recipe(brew_id: int, payload: SaveAsRecipeRequest, db: DbSession) -> RecipeOut:
    """마음에 들었던 추출을 다음 목표로 저장합니다 (source=RECORDED).

    실측 곡선을 그대로 목표로 쓰지 않습니다. 손떨림과 저울 진동이 섞여 있어
    "내가 흔들린 것까지 따라 하라"가 되기 때문입니다. 주수 구간만 뽑아
    규칙 엔진과 같은 구조로 다시 그립니다 (services/curve_shaping.py).
    """
    brew = db.get(Brew, brew_id)
    if brew is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"brew_id {brew_id} not found")

    if payload.bean_id is not None and db.get(Bean, payload.bean_id) is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"bean_id {payload.bean_id} not found"
        )

    target_curve = shape_target_curve(brew.actual_curve)
    if not target_curve:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="주수 구간을 찾지 못했습니다. 물을 부은 기록이 있어야 저장할 수 있습니다.",
        )

    # RECORDED 레시피에는 Rule Engine이 계산하는 값(물 온도·유량·주수 배분)이 존재하지 않습니다.
    # 사용자가 손으로 부은 곡선에는 그런 규칙이 없기 때문입니다 (docs/erd.md).
    recipe = Recipe(
        bean_id=payload.bean_id,
        source="RECORDED",
        dose_g=payload.dose_g,
        drink_type=payload.drink_type,
        total_water_g=target_curve[-1][1],
        total_time_sec=target_curve[-1][0],
        target_curve=target_curve,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)

    return RecipeOut(
        recipe_id=recipe.id,
        water_temp_c=None,
        total_water_g=recipe.total_water_g,
        ratio=None,
        flow_rate_gps=None,
        grind_guide=None,
        ice_message=None,
        pours=[],
        target_curve=target_curve,
    )
