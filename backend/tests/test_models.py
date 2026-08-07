"""스키마가 두 가지 추출 모드를 담을 수 있는지 확인합니다 (docs/erd.md).

가이드 모드: 목표 레시피를 따라 추출하고 정확도를 측정
자유 모드:   목표 없이 내 추출만 기록 → recipe_id·rmse가 NULL
"""

from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Brew, Recipe

CURVE = [[0, 0], [10, 60], [45, 60], [205, 300]]


def test_free_mode_brew_has_no_recipe_or_rmse(db):
    """자유 모드는 비교할 목표가 없습니다. 0이 아니라 NULL이어야 합니다."""
    brew = Brew(
        started_at=datetime(2026, 8, 6, 9, 0),
        ended_at=datetime(2026, 8, 6, 9, 3),
        duration_sec=180,
        final_weight_g=298.4,
        actual_curve=CURVE,
    )
    db.add(brew)
    db.commit()

    assert brew.recipe_id is None
    assert brew.rmse is None


def test_recorded_recipe_needs_only_curve_essentials(db):
    """사용자 추출을 목표로 저장한 레시피. Rule Engine 부가 정보가 없습니다."""
    recipe = Recipe(
        source="RECORDED",
        dose_g=20,
        drink_type="HOT",
        total_water_g=300,
        total_time_sec=205,
        target_curve=CURVE,
    )
    db.add(recipe)
    db.commit()

    assert recipe.id > 0
    assert recipe.water_temp_c is None
    assert recipe.flow_rate is None
    assert recipe.pour_plan is None


def test_curve_essentials_are_still_required(db):
    """곡선을 재현할 수 없는 레시피는 저장되면 안 됩니다."""
    db.add(Recipe(source="RECORDED", dose_g=20, drink_type="HOT"))
    with pytest.raises(IntegrityError):
        db.commit()
