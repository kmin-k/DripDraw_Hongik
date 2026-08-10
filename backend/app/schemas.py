"""Pydantic 스키마 — docs/api.md 계약.

api.md는 계약 합의용 문서이고, 실제 기준은 이 파일입니다(FastAPI가 /docs에 자동 노출).
JSON은 camelCase, 파이썬은 snake_case로 두고 alias로 연결합니다.
"""

from datetime import datetime
from enum import StrEnum
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.services import constants as C


class Region(StrEnum):
    AFRICA = "AFRICA"
    CENTRAL_AMERICA = "CENTRAL_AMERICA"
    SOUTH_AMERICA = "SOUTH_AMERICA"
    ASIA_PACIFIC = "ASIA_PACIFIC"


class Process(StrEnum):
    WASHED = "WASHED"
    NATURAL = "NATURAL"


class RoastLevel(StrEnum):
    LIGHT = "LIGHT"
    MEDIUM = "MEDIUM"
    DARK = "DARK"


class DrinkType(StrEnum):
    HOT = "HOT"
    ICE = "ICE"


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class BeanCreate(CamelModel):
    name: str = Field(max_length=100)
    roaster: str | None = Field(default=None, max_length=100)
    region: Region
    process: Process
    roast_level: RoastLevel
    memo: str | None = Field(default=None, max_length=300)


class BeanOut(CamelModel):
    id: int
    name: str
    roaster: str | None
    region: Region
    process: Process
    roast_level: RoastLevel
    memo: str | None
    created_at: datetime


class BeanList(CamelModel):
    items: list[BeanOut]


# --- Rule Engine (Phase 3) ---


class RecipeGenerateRequest(CamelModel):
    """beanId로 원두 속성을 조회하거나, 등록 없이 직접 보낼 수도 있습니다 (api.md)."""

    bean_id: int | None = None
    region: Region | None = None
    process: Process | None = None
    roast_level: RoastLevel | None = None

    # 상한 근거는 rule-table.md 8-1절(주수 간 대기 음수), 하한은 8-2절.
    dose_g: int = Field(ge=C.DOSE_MIN_G, le=C.DOSE_MAX_G)
    drink_type: DrinkType
    d50_um: float = Field(gt=0)

    @model_validator(mode="after")
    def require_bean_or_attributes(self) -> Self:
        if self.bean_id is None and not (self.region and self.process and self.roast_level):
            raise ValueError("beanId 또는 region·process·roastLevel을 모두 보내야 합니다")
        return self


class PourOut(CamelModel):
    phase: str
    water_g: int
    start_sec: int
    end_sec: int


class RecipeOut(CamelModel):
    recipe_id: int
    water_temp_c: int
    total_water_g: int
    ratio: float
    flow_rate_gps: float
    grind_guide: str
    ice_message: str | None
    pours: list[PourOut]
    target_curve: list[list[int]]


# --- 추출 기록 (Phase 2) ---


class BrewCreate(CamelModel):
    """추출 종료 시 프론트가 수집한 실측 곡선을 그대로 보냅니다.

    RMSE는 보내지 않습니다. 서버가 목표 곡선과 대조해 직접 계산합니다(단일 진실 공급원).
    """

    #: 자유 모드는 따라간 목표가 없어 null입니다.
    recipe_id: int | None = None
    started_at: datetime
    ended_at: datetime
    #: [[경과 시간(초), 누적 물량(g)], ...] — 다운샘플링하지 않은 원본
    actual_curve: list[list[float]] = Field(min_length=1)

    @model_validator(mode="after")
    def check_curve_shape(self) -> Self:
        for point in self.actual_curve:
            if len(point) != 2:
                raise ValueError("actualCurve의 각 점은 [시간, 무게] 두 값이어야 합니다")
        return self


class BrewOut(CamelModel):
    brew_id: int
    #: 자유 모드는 비교할 목표가 없어 null입니다. 0과 다릅니다.
    rmse: float | None
    duration_sec: int
    final_weight_g: float
