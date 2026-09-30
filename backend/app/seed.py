"""데모용 시드 데이터.

    python -m app.seed

**기존 데이터를 전부 지우고 새로 채웁니다.** 몇 번을 돌려도 같은 결과가 되도록
난수 시드를 고정했습니다. 발표 직전에 깨끗한 상태를 만들 때 씁니다.

곡선은 **회차를 거듭할수록 목표에 가까워지도록** 만듭니다. 이 프로젝트의 주제가
추출 재현성이라, 히스토리의 정확도 추이가 내려가는 것이 곧 주제의 증거입니다.
값을 예쁘게 꾸미려는 것이 아니라, **연습하면 나아진다는 실제 양상**을 재현한 것입니다.

레시피·보정은 규칙 엔진과 라우터를 그대로 호출합니다. 시드가 따로 계산하면
실제 동작과 어긋난 데이터가 만들어집니다.
"""

import random
from dataclasses import asdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.models import Bean, Brew, Feedback, GrindAnalysis, Recipe
from app.routers.feedback import adjust_recipe
from app.schemas import RecipeAdjustRequest
from app.services.rmse import calculate_rmse, interpolate_at
from app.services.rule_engine import generate_recipe

#: 저울 전송 주기. 실측 평균 9.3 Hz (docs/scale-protocol.md).
SAMPLE_INTERVAL_SEC = 0.107

BEANS = [
    {
        "name": "에티오피아 무라고",
        "roaster": "모모스커피",
        "region": "AFRICA",
        "process": "NATURAL",
        "roast_level": "LIGHT",
        "memo": "베리·플로럴",
    },
    {
        "name": "코스타리카 산타테레사",
        "roaster": "프릳츠",
        "region": "CENTRAL_AMERICA",
        "process": "WASHED",
        "roast_level": "MEDIUM",
        "memo": "견과·카라멜",
    },
]

#: 회차별 서투름. 앞 회차일수록 늦게 붓고(lag) 양이 어긋나고(gain) 손이 떨립니다(noise).
ATTEMPTS = [
    {"lag_sec": 3.0, "gain": 0.045, "noise_g": 1.3},
    {"lag_sec": 2.1, "gain": 0.030, "noise_g": 1.0},
    {"lag_sec": 1.3, "gain": 0.018, "noise_g": 0.8},
    {"lag_sec": 0.7, "gain": 0.009, "noise_g": 0.6},
    {"lag_sec": 0.3, "gain": 0.004, "noise_g": 0.5},
]


def simulate_brew(
    target: list[list[int]], *, lag_sec: float, gain: float, noise_g: float, seed: int
) -> list[list[float]]:
    """목표 곡선을 따라 부은 실측 곡선을 만듭니다.

    어긋나는 방식이 세 가지입니다.
    - **lag**: 부어야 할 때보다 늦게 붓습니다. 곡선이 가파른 주수 구간에서 오차가 가장 큽니다
    - **gain**: 전체적으로 조금 더/덜 붓습니다
    - **noise**: 저울 진동과 손떨림
    """
    rng = random.Random(seed)
    end_sec = float(target[-1][0])

    points: list[list[float]] = []
    t = 0.0
    while t <= end_sec:
        base = interpolate_at(target, max(0.0, t - lag_sec))
        weight = base * (1 + gain) + rng.uniform(-noise_g, noise_g)
        points.append([round(t, 3), round(max(0.0, weight), 2)])
        t += SAMPLE_INTERVAL_SEC

    # 마지막 점은 실제로 다 부은 양에 맞춥니다. 종료 버튼을 누른 시점의 값입니다.
    points[-1] = [round(end_sec, 3), round(float(target[-1][1]) * (1 + gain), 2)]
    return points


def clear_all(db: Session) -> None:
    """참조하는 쪽부터 지웁니다. 순서를 바꾸면 외래 키가 걸립니다."""
    for model in (Feedback, Brew, GrindAnalysis, Recipe, Bean):
        db.execute(delete(model))
    db.commit()


def seed(db: Session) -> None:
    clear_all(db)

    beans = [Bean(**data) for data in BEANS]
    db.add_all(beans)
    db.commit()
    for bean in beans:
        db.refresh(bean)

    # 가장 최근 추출이 오늘이 되도록 뒤에서부터 날짜를 채웁니다.
    # **미래 날짜가 나오면 안 됩니다.** 총 회차 수에서 역산해 마지막이 오늘이 되게 합니다.
    now = datetime.now(UTC).replace(microsecond=0)
    attempt_counts = (5, 3)
    total_guided = sum(attempt_counts)
    day_offset = 0
    brew_ids: list[int] = []

    for bean, attempt_count in zip(beans, attempt_counts, strict=True):
        result = generate_recipe(
            dose_g=20,
            drink_type="HOT",
            roast_level=bean.roast_level,
            region=bean.region,
            process=bean.process,
            d50_um=1000,
        )
        recipe = Recipe(
            bean_id=bean.id,
            source="RULE_ENGINE",
            dose_g=20,
            drink_type="HOT",
            ratio=result.ratio,
            d50_um=1000,
            water_temp_c=result.water_temp_c,
            total_water_g=result.total_water_g,
            bloom_water_g=result.bloom_water_g,
            bloom_wait_sec=result.bloom_wait_sec,
            flow_rate=result.flow_rate_gps,
            total_time_sec=result.total_time_sec,
            target_curve=result.target_curve,
            pour_plan=[asdict(pour) for pour in result.pours],
            grind_guide=result.grind_guide,
        )
        db.add(recipe)
        db.commit()
        db.refresh(recipe)

        # 오래된 회차부터 넣습니다. 뒤로 갈수록 최근이고, 정확도가 좋아집니다.
        for attempt_index in range(attempt_count):
            params = ATTEMPTS[attempt_index]
            curve = simulate_brew(
                recipe.target_curve, **params, seed=recipe.id * 100 + attempt_index
            )
            started = now - timedelta(days=(total_guided - 1 - day_offset) * 2, hours=1)
            day_offset += 1

            brew = Brew(
                recipe_id=recipe.id,
                started_at=started,
                ended_at=started + timedelta(seconds=recipe.total_time_sec),
                duration_sec=round(curve[-1][0]),
                final_weight_g=curve[-1][1],
                rmse=calculate_rmse(recipe.target_curve, curve),
                actual_curve=curve,
            )
            db.add(brew)
            db.commit()
            db.refresh(brew)
            brew_ids.append(brew.id)

    # 목표 없이 기록만 남긴 추출 하나. 히스토리에서 "정확도 —"가 어떻게 보이는지 확인용입니다.
    free_curve = simulate_brew(
        [[0, 0], [10, 50], [30, 50], [42, 150], [65, 150], [78, 250], [150, 250]],
        lag_sec=0.4,
        gain=0.01,
        noise_g=0.9,
        seed=7,
    )
    free_started = now - timedelta(days=4, hours=3)
    db.add(
        Brew(
            recipe_id=None,
            started_at=free_started,
            ended_at=free_started + timedelta(seconds=150),
            duration_sec=round(free_curve[-1][0]),
            final_weight_g=free_curve[-1][1],
            rmse=None,
            actual_curve=free_curve,
        )
    )
    db.commit()

    # 첫 회차(가장 서툴렀던 추출)에 맛 평가를 답니다. 라우터를 그대로 불러
    # 실제 보정 경로와 같은 데이터가 남게 합니다.
    adjust_recipe(
        RecipeAdjustRequest(
            brew_id=brew_ids[0], acidity="OK", bitterness="STRONG", strength="THIN"
        ),
        db,
    )


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed(db)
        # 윈도우 콘솔(cp949)에서 깨지지 않도록 출력에는 ASCII 기호만 씁니다.
        print(
            f"시드 완료: 원두 {db.query(Bean).count()}종, "
            f"레시피 {db.query(Recipe).count()}개, 추출 {db.query(Brew).count()}건"
        )
        for brew in db.query(Brew).order_by(Brew.started_at).all():
            accuracy = "(목표 없음)" if brew.rmse is None else f"{brew.rmse:5.2f} g"
            recipe_label = str(brew.recipe_id) if brew.recipe_id else "자유"
            print(f"  brew {brew.id:>2}  recipe {recipe_label:>4}  정확도 {accuracy}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
