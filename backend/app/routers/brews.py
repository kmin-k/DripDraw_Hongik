"""추출 기록 저장·조회 (Phase 2)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Bean, Brew, Recipe
from app.routers.recipes import recipe_out
from app.schemas import (
    BrewCreate,
    BrewDetail,
    BrewList,
    BrewListItem,
    BrewOut,
    FeedbackDetail,
    RecipeOut,
    SaveAsRecipeRequest,
)
from app.services.curve_shaping import shape_target_curve
from app.services.rmse import calculate_rmse

router = APIRouter(prefix="/api/brews", tags=["brews"])

DbSession = Annotated[Session, Depends(get_db)]


def _saved_recipe_of(brew: Brew, db: Session) -> Recipe | None:
    """이 기록을 목표로 저장해 만든 레시피. 없으면 None."""
    return db.scalar(select(Recipe).where(Recipe.source_brew_id == brew.id))


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


@router.get("", response_model=BrewList)
def list_brews(db: DbSession, limit: Annotated[int, Query(ge=1, le=200)] = 50) -> BrewList:
    """최근 추출부터 나열합니다.

    목록에는 곡선을 담지 않습니다. 곡선 하나가 2,000점이라 몇 건만 모여도 응답이 커지고,
    훑어보는 화면에는 필요하지 않습니다.
    """
    # 화면에 보여주는 값(추출 시각)으로 정렬합니다. 저장 순서(id)로 정렬하면
    # 둘이 어긋날 때 목록이 뒤죽박죽으로 보입니다. id는 같은 시각일 때의 기준입니다.
    # 항목마다 레시피·원두·평가를 따로 물으면 50건에 151번 묻습니다 (N+1).
    # 관계마다 한꺼번에 가져와 항목 수와 무관하게 4번으로 끝냅니다 (tests/test_query_count.py).
    brews = db.scalars(
        select(Brew)
        .options(
            selectinload(Brew.recipe).selectinload(Recipe.bean),
            selectinload(Brew.feedback),
        )
        .order_by(Brew.started_at.desc(), Brew.id.desc())
        .limit(limit)
    ).all()

    items = []
    for brew in brews:
        recipe = brew.recipe
        bean = recipe.bean if recipe else None
        items.append(
            BrewListItem(
                brew_id=brew.id,
                brewed_at=brew.started_at,
                rmse=brew.rmse,
                duration_sec=brew.duration_sec,
                final_weight_g=brew.final_weight_g,
                recipe_id=brew.recipe_id,
                recipe_name=recipe.name if recipe else None,
                bean_name=bean.name if bean else None,
                dose_g=recipe.dose_g if recipe else None,
                total_water_g=recipe.total_water_g if recipe else None,
                free_mode=recipe is None,
                has_feedback=brew.feedback is not None,
            )
        )
    return BrewList(items=items)


@router.delete("/{brew_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brew(brew_id: int, db: DbSession) -> None:
    """기록 삭제. 맛 평가는 기록에 딸린 것이라 함께 지웁니다.

    이 기록으로 만든 레시피(목표로 저장·피드백 보정)는 남깁니다. 레시피는 기록을
    가리키지 않는 독립된 산출물이고, 이미 그 레시피로 내린 다른 기록이 있을 수 있습니다.
    """
    brew = db.get(Brew, brew_id)
    if brew is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"brew_id {brew_id} not found")

    if brew.feedback is not None:
        db.delete(brew.feedback)
    # 이 기록에서 만든 레시피는 남기되, 사라진 기록을 가리키지 않게 합니다.
    db.execute(update(Recipe).where(Recipe.source_brew_id == brew_id).values(source_brew_id=None))
    db.delete(brew)
    db.commit()


@router.get("/{brew_id}", response_model=BrewDetail)
def get_brew(brew_id: int, db: DbSession) -> BrewDetail:
    """추출 하나의 전부. 곡선을 다시 그리고 여기서 바로 다시 내릴 수 있어야 합니다."""
    brew = db.get(Brew, brew_id)
    if brew is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"brew_id {brew_id} not found")

    recipe = brew.recipe
    feedback = brew.feedback
    saved = _saved_recipe_of(brew, db)

    return BrewDetail(
        saved_recipe_id=saved.id if saved else None,
        saved_recipe_name=saved.name if saved else None,
        brew_id=brew.id,
        brewed_at=brew.started_at,
        rmse=brew.rmse,
        duration_sec=brew.duration_sec,
        final_weight_g=brew.final_weight_g,
        actual_curve=brew.actual_curve,
        bean_name=recipe.bean.name if recipe and recipe.bean else None,
        recipe=recipe_out(recipe) if recipe else None,
        feedback=(
            FeedbackDetail(
                feedback_id=feedback.id,
                acidity=feedback.acidity,
                bitterness=feedback.bitterness,
                strength=feedback.strength,
                suggested_recipe_id=feedback.suggested_recipe_id,
                applied=feedback.applied,
            )
            if feedback
            else None
        ),
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

    # 같은 기록을 두 번 저장하면 곡선이 같은 레시피가 둘이 됩니다. 이미 있으면 그쪽을 가리킵니다.
    existing = _saved_recipe_of(brew, db)
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"이 기록은 이미 레시피 #{existing.id}로 저장했습니다.",
        )

    if payload.bean_id is not None and db.get(Bean, payload.bean_id) is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"bean_id {payload.bean_id} not found"
        )

    # 곡선을 먼저 검사합니다. 실패하면 원두를 만들지 않아야 빈 원두가 남지 않습니다.
    target_curve = shape_target_curve(brew.actual_curve)
    if not target_curve:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="주수 구간을 찾지 못했습니다. 물을 부은 기록이 있어야 저장할 수 있습니다.",
        )

    # 원두를 먼저 등록하지 않고 내린 경우, 저장하면서 그 자리에서 등록합니다.
    # 이렇게 만든 원두도 원두 목록과 레시피 화면의 선택지에 똑같이 나옵니다.
    bean_id = payload.bean_id
    if payload.new_bean is not None:
        bean = Bean(**payload.new_bean.model_dump())
        db.add(bean)
        db.flush()  # id가 필요합니다. 레시피와 같은 트랜잭션으로 묶입니다.
        bean_id = bean.id

    # RECORDED 레시피에는 Rule Engine이 계산하는 값(물 온도·유량·주수 배분)이 존재하지 않습니다.
    # 사용자가 손으로 부은 곡선에는 그런 규칙이 없기 때문입니다 (docs/erd.md).
    recipe = Recipe(
        bean_id=bean_id,
        source="RECORDED",
        source_brew_id=brew.id,
        name=payload.name.strip() if payload.name else None,
        dose_g=payload.dose_g,
        drink_type=payload.drink_type,
        total_water_g=target_curve[-1][1],
        total_time_sec=target_curve[-1][0],
        target_curve=target_curve,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)

    return recipe_out(recipe)
