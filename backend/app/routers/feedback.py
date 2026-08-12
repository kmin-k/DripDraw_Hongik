"""피드백 루프 (Phase 4) — 맛 평가를 받아 다음 레시피를 보정합니다.

**원본 레시피를 덮어쓰지 않습니다.** 새 레시피를 만들고 parent_recipe_id로 원본을 가리켜,
"이전 → 이후" 비교와 되돌리기가 항상 가능하게 둡니다 (docs/erd.md).

경로가 둘로 나뉘어 있어(`/api/recipe/adjust`, `/api/feedback/{id}`) prefix 없이 전체 경로를 씁니다.
"""

from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Brew, Feedback, Recipe
from app.schemas import (
    ChangeOut,
    FeedbackOut,
    FeedbackUpdate,
    RecipeAdjustRequest,
    RecipeAdjustResponse,
    RecipeOut,
)
from app.services import constants as C
from app.services.feedback import Adjustment, adjust_parameters
from app.services.rule_engine import PourPlan, RuleViolation, build_pour_plan, round_half_up

router = APIRouter(tags=["feedback"])

DbSession = Annotated[Session, Depends(get_db)]

#: 8-4절. Ratio를 올렸는데 푸어가 주수 간격을 넘을 때.
RATIO_BLOCKED_NOTICE = "현재 원두량에서는 물을 더 늘릴 수 없어요"
#: 유량을 낮추면 같은 물량을 붓는 데 더 오래 걸려, 역시 간격을 넘길 수 있습니다.
FLOW_BLOCKED_NOTICE = "현재 원두량에서는 유량을 더 낮출 수 없어요"


def _rebuild_curve(
    recipe: Recipe, adjustment: Adjustment
) -> tuple[PourPlan, float, float, list[str]]:
    """보정된 파라미터로 곡선을 다시 그립니다. 실패하면 문제되는 조정을 하나씩 뺍니다.

    **8-4절 필수 가드**: 상한 30 g은 Ratio 15 기준으로 잡은 값입니다.
    피드백으로 Ratio가 오르면 한 번에 붓는 양이 늘어 임계값이 내려가고,
    유량이 내려가면 같은 양을 붓는 시간이 늘어납니다. 둘 다 푸어가 간격을 넘길 수 있습니다.

    원본 레시피는 생성 시점에 이미 통과한 조합이므로 마지막 후보는 반드시 성공합니다.
    """
    # 원두량이 그대로라 Bloom 물량과 주수 간격은 원본을 그대로 씁니다.
    bloom_water_g = round_half_up(recipe.bloom_water_g)
    interval_sec = recipe.bloom_wait_sec + C.BLOOM_POUR_SEC

    # 조정을 많이 살리는 순서로 시도합니다.
    candidates = [
        (adjustment.ratio, adjustment.flow_rate_gps, []),
        (recipe.ratio, adjustment.flow_rate_gps, [RATIO_BLOCKED_NOTICE]),
        (adjustment.ratio, recipe.flow_rate, [FLOW_BLOCKED_NOTICE]),
        (recipe.ratio, recipe.flow_rate, [RATIO_BLOCKED_NOTICE, FLOW_BLOCKED_NOTICE]),
    ]

    for ratio, flow, notices in candidates:
        try:
            plan = build_pour_plan(
                dose_g=recipe.dose_g,
                total_water_g=round_half_up(recipe.dose_g * ratio),
                bloom_water_g=bloom_water_g,
                flow_gps=flow,
                interval_sec=interval_sec,
            )
        except RuleViolation:
            continue
        # 되돌린 조정만 안내합니다. 애초에 바뀌지 않은 값은 안내할 것이 없습니다.
        blocked = [
            notice
            for notice in notices
            if (notice == RATIO_BLOCKED_NOTICE and adjustment.ratio != recipe.ratio)
            or (notice == FLOW_BLOCKED_NOTICE and adjustment.flow_rate_gps != recipe.flow_rate)
        ]
        return plan, ratio, flow, blocked

    # 원본 조합조차 실패하면 데이터가 깨진 것입니다. 조용히 넘기지 않습니다.
    raise HTTPException(
        status.HTTP_400_BAD_REQUEST,
        detail="원본 레시피의 주수 배분을 다시 계산할 수 없습니다.",
    )


@router.post(
    "/api/recipe/adjust",
    response_model=RecipeAdjustResponse,
    status_code=status.HTTP_201_CREATED,
)
def adjust_recipe(payload: RecipeAdjustRequest, db: DbSession) -> RecipeAdjustResponse:
    brew = db.get(Brew, payload.brew_id)
    if brew is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"brew_id {payload.brew_id} not found"
        )
    if brew.recipe_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="자유 모드 추출은 보정할 원본 레시피가 없습니다. 먼저 목표로 저장하세요.",
        )
    if brew.feedback is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"brew_id {payload.brew_id}에는 이미 평가가 있습니다.",
        )

    recipe = db.get(Recipe, brew.recipe_id)
    if recipe is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"recipe_id {brew.recipe_id} not found"
        )

    # 자유 추출을 저장한 RECORDED 레시피에는 조정할 파라미터 자체가 없습니다 (docs/erd.md).
    if None in (recipe.ratio, recipe.water_temp_c, recipe.flow_rate, recipe.bloom_water_g):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="직접 부은 기록으로 만든 레시피는 조정할 파라미터가 없어 보정할 수 없습니다.",
        )

    adjustment = adjust_parameters(
        ratio=recipe.ratio,
        water_temp_c=recipe.water_temp_c,
        flow_rate_gps=recipe.flow_rate,
        grind_guide=recipe.grind_guide,
        drink_type=recipe.drink_type,
        acidity=payload.acidity,
        bitterness=payload.bitterness,
        strength=payload.strength,
    )

    plan, ratio, flow, blocked = _rebuild_curve(recipe, adjustment)
    notices = adjustment.notices + blocked

    # 되돌려진 조정은 changes에서도 빼야 표와 곡선이 어긋나지 않습니다.
    changes = [
        change
        for change in adjustment.changes
        if not (change.field == "ratio" and ratio == recipe.ratio)
        and not (change.field == "flowRateGps" and flow == recipe.flow_rate)
    ]

    suggested = Recipe(
        bean_id=recipe.bean_id,
        parent_recipe_id=recipe.id,
        source="ADJUSTED",
        dose_g=recipe.dose_g,
        drink_type=recipe.drink_type,
        d50_um=recipe.d50_um,
        ratio=ratio,
        water_temp_c=adjustment.water_temp_c,
        total_water_g=plan.target_curve[-1][1],
        bloom_water_g=recipe.bloom_water_g,
        bloom_wait_sec=recipe.bloom_wait_sec,
        flow_rate=flow,
        total_time_sec=plan.total_time_sec,
        target_curve=plan.target_curve,
        pour_plan=[asdict(pour) for pour in plan.pours],
        grind_guide=adjustment.grind_guide,
    )
    db.add(suggested)
    db.flush()  # id를 피드백에 넣어야 해서 먼저 확정합니다.

    feedback = Feedback(
        brew_id=brew.id,
        acidity=payload.acidity,
        bitterness=payload.bitterness,
        strength=payload.strength,
        suggested_recipe_id=suggested.id,
    )
    db.add(feedback)
    db.commit()
    db.refresh(suggested)
    db.refresh(feedback)

    return RecipeAdjustResponse(
        feedback_id=feedback.id,
        suggested_recipe_id=suggested.id,
        parent_recipe_id=recipe.id,
        changes=[ChangeOut(**asdict(change)) for change in changes],
        notices=notices,
        recipe=RecipeOut(
            recipe_id=suggested.id,
            water_temp_c=suggested.water_temp_c,
            total_water_g=suggested.total_water_g,
            ratio=suggested.ratio,
            flow_rate_gps=suggested.flow_rate,
            grind_guide=suggested.grind_guide,
            ice_message=(
                "얼음이 가득 담긴 컵에 부어 드세요!" if suggested.drink_type == "ICE" else None
            ),
            pours=suggested.pour_plan,
            target_curve=suggested.target_curve,
        ),
    )


@router.patch("/api/feedback/{feedback_id}", response_model=FeedbackOut)
def update_feedback(feedback_id: int, payload: FeedbackUpdate, db: DbSession) -> FeedbackOut:
    """제안을 실제로 받아들였는지 기록합니다.

    보정을 만드는 것과 받아들이는 것은 다른 사건입니다. 나중에 개인화 모델을 학습시킬 때
    "제안했지만 쓰지 않은" 기록이 필요해 따로 남깁니다.
    """
    feedback = db.get(Feedback, feedback_id)
    if feedback is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"feedback_id {feedback_id} not found"
        )

    feedback.applied = payload.applied
    db.commit()
    db.refresh(feedback)

    return FeedbackOut(feedback_id=feedback.id, applied=feedback.applied)
