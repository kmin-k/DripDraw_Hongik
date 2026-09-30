"""레시피 — 생성(Phase 3)과 조회·삭제(Phase 5).

두 라우터가 있습니다.
- `/api/recipe/*`  계산: `preview`(저장 안 함) · `generate`(저장) · `adjust`(feedback.py)
- `/api/recipes/*` 저장된 것: 목록 · 상세 · 삭제

**preview와 generate를 나눈 이유** — 레시피 화면은 입력이 바뀔 때마다 곡선을 다시 그립니다.
그때마다 저장하면 슬라이더 한 번에 레시피가 서너 개 생기고, 실제로 내린 건 하나입니다.
미리보기는 계산만 하고, "이 레시피로 추출하기"를 누르는 순간에만 저장합니다.
"""

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bean, Brew, Feedback, Recipe
from app.schemas import (
    RecipeGenerateRequest,
    RecipeList,
    RecipeListItem,
    RecipeOut,
    RecipePreview,
)
from app.services.rule_engine import GeneratedRecipe, RuleViolation, generate_recipe

router = APIRouter(prefix="/api/recipe", tags=["recipe"])
stored = APIRouter(prefix="/api/recipes", tags=["recipes"])

DbSession = Annotated[Session, Depends(get_db)]


def recipe_out(recipe: Recipe) -> RecipeOut:
    """저장된 레시피를 응답 형태로. RECORDED 레시피는 규칙 필드가 전부 None입니다.

    기록 상세·레시피 상세·저장 응답이 전부 이 함수를 씁니다. 추출 화면은 이 객체를
    통째로 받아 목표로 쓰므로 어디서 왔든 같은 모양이어야 합니다.
    """
    return RecipeOut(
        recipe_id=recipe.id,
        source=recipe.source,
        dose_g=recipe.dose_g,
        drink_type=recipe.drink_type,
        name=recipe.name,
        bean_id=recipe.bean_id,
        bean_name=recipe.bean.name if recipe.bean else None,
        water_temp_c=recipe.water_temp_c,
        total_water_g=int(recipe.total_water_g),
        ratio=recipe.ratio,
        flow_rate_gps=recipe.flow_rate,
        grind_guide=recipe.grind_guide,
        ice_message=("얼음이 가득 담긴 컵에 부어 드세요!" if recipe.drink_type == "ICE" else None),
        pours=recipe.pour_plan or [],
        target_curve=recipe.target_curve,
    )


def _calculate(payload: RecipeGenerateRequest, db: Session) -> GeneratedRecipe:
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
        return generate_recipe(
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


def _preview_out(result: GeneratedRecipe) -> dict:
    return dict(
        water_temp_c=result.water_temp_c,
        total_water_g=result.total_water_g,
        ratio=result.ratio,
        flow_rate_gps=result.flow_rate_gps,
        grind_guide=result.grind_guide,
        ice_message=result.ice_message,
        pours=[asdict(p) for p in result.pours],
        target_curve=result.target_curve,
    )


@router.post("/preview", response_model=RecipePreview)
def preview(payload: RecipeGenerateRequest, db: DbSession) -> RecipePreview:
    """계산만 합니다. DB에 아무것도 남기지 않으므로 recipeId가 없습니다."""
    return RecipePreview(**_preview_out(_calculate(payload, db)))


@router.post("/generate", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
def generate(payload: RecipeGenerateRequest, db: DbSession) -> RecipeOut:
    """계산하고 저장합니다. 추출 화면으로 넘어갈 때 부릅니다."""
    result = _calculate(payload, db)

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

    return recipe_out(recipe)


@stored.get("", response_model=RecipeList)
def list_recipes(db: DbSession) -> RecipeList:
    """저장된 레시피 전부, 최신순. 내린 횟수와 마지막 정확도를 같이 줍니다.

    "쓴 적 없는 레시피"를 화면이 접을 수 있도록 brewCount를 줍니다. 서버가 걸러 버리면
    사용자는 자기가 만든 레시피가 어디 갔는지 모릅니다.
    """
    # 레시피마다 기록을 세는 쿼리를 따로 날리지 않고 한 번에 묶습니다.
    stats = dict(
        db.execute(
            select(Brew.recipe_id, func.count(Brew.id))
            .where(Brew.recipe_id.is_not(None))
            .group_by(Brew.recipe_id)
        ).all()
    )
    latest: dict[int, Brew] = {}
    for brew in db.scalars(
        select(Brew).where(Brew.recipe_id.is_not(None)).order_by(Brew.started_at.desc())
    ):
        latest.setdefault(brew.recipe_id, brew)

    recipes = db.scalars(select(Recipe).order_by(Recipe.id.desc())).all()
    items = []
    for recipe in recipes:
        last = latest.get(recipe.id)
        items.append(
            RecipeListItem(
                recipe_id=recipe.id,
                name=recipe.name,
                source=recipe.source,
                bean_id=recipe.bean_id,
                bean_name=recipe.bean.name if recipe.bean else None,
                dose_g=recipe.dose_g,
                drink_type=recipe.drink_type,
                total_water_g=int(recipe.total_water_g),
                created_at=recipe.created_at,
                brew_count=stats.get(recipe.id, 0),
                last_rmse=last.rmse if last else None,
                last_brewed_at=last.started_at if last else None,
            )
        )
    return RecipeList(items=items)


@stored.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: int, db: DbSession) -> RecipeOut:
    """추출 화면에 그대로 넘길 수 있는 형태. "이 레시피로 내리기"가 이걸 받습니다."""
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"recipe_id {recipe_id} not found")
    return recipe_out(recipe)


@stored.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: int, db: DbSession) -> None:
    """레시피 삭제. **내린 기록이 있으면 거절합니다 (409).**

    기록의 정확도는 그 레시피의 곡선 대비 값이라, 레시피가 사라지면 숫자만 남고 뜻을 잃습니다.
    기록을 먼저 지우면 지울 수 있습니다.

    이 레시피를 부모로 둔 보정 레시피와, 이 레시피를 제안한 맛 평가는 연결만 끊습니다.
    """
    recipe = db.get(Recipe, recipe_id)
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"recipe_id {recipe_id} not found")

    brew_count = db.scalar(select(func.count(Brew.id)).where(Brew.recipe_id == recipe_id)) or 0
    if brew_count:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"이 레시피로 내린 기록이 {brew_count}건 있어 지울 수 없습니다.",
        )

    db.execute(
        update(Recipe).where(Recipe.parent_recipe_id == recipe_id).values(parent_recipe_id=None)
    )
    db.execute(
        update(Feedback)
        .where(Feedback.suggested_recipe_id == recipe_id)
        .values(suggested_recipe_id=None)
    )
    db.delete(recipe)
    db.commit()
