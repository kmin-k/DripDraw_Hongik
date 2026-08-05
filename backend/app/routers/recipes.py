"""레시피 생성 (Phase 3) — Rule Engine을 HTTP로 노출합니다."""

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bean, Recipe
from app.schemas import RecipeGenerateRequest, RecipeOut
from app.services.rule_engine import RuleViolation, generate_recipe

router = APIRouter(prefix="/api/recipe", tags=["recipe"])

DbSession = Annotated[Session, Depends(get_db)]


@router.post("/generate", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def generate(payload: RecipeGenerateRequest, db: DbSession) -> RecipeOut:
    region, process, roast_level = payload.region, payload.process, payload.roast_level

    if payload.bean_id is not None:
        bean = db.get(Bean, payload.bean_id)
        if bean is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"bean_id {payload.bean_id} not found",
            )
        region, process, roast_level = bean.region, bean.process, bean.roast_level

    try:
        result = generate_recipe(
            dose_g=payload.dose_g,
            drink_type=payload.drink_type,
            roast_level=roast_level,
            region=region,
            process=process,
            d50_um=payload.d50_um,
        )
    except RuleViolation as err:
        # 규칙 위반은 스키마 오류(422)가 아니라 값 범위 위반(400)입니다.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(err)) from err

    # 규칙 상수가 나중에 바뀌어도 과거 추출을 재현할 수 있도록 계산 결과를 전부 저장합니다.
    recipe = Recipe(
        bean_id=payload.bean_id,
        source="RULE_ENGINE",
        dose_g=payload.dose_g,
        drink_type=payload.drink_type,
        ratio=result.ratio,
        d50_um=payload.d50_um,
        water_temp_c=result.water_temp_c,
        total_water_g=result.total_water_g,
        bloom_water_g=result.bloom_water_g,
        bloom_wait_sec=result.bloom_wait_sec,
        flow_rate=result.flow_rate_gps,
        total_time_sec=result.total_time_sec,
        target_curve=result.target_curve,
        pour_plan=[asdict(p) for p in result.pours],
        grind_guide=result.grind_guide,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)

    return RecipeOut(
        recipe_id=recipe.id,
        water_temp_c=result.water_temp_c,
        total_water_g=result.total_water_g,
        ratio=result.ratio,
        flow_rate_gps=result.flow_rate_gps,
        grind_guide=result.grind_guide,
        ice_message=result.ice_message,
        pours=[asdict(p) for p in result.pours],
        target_curve=result.target_curve,
    )
