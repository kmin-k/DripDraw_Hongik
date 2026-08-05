"""Pydantic 스키마 — docs/api.md 계약.

api.md는 계약 합의용 문서이고, 실제 기준은 이 파일입니다(FastAPI가 /docs에 자동 노출).
JSON은 camelCase, 파이썬은 snake_case로 두고 alias로 연결합니다.
"""

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


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
    roasted_at: date | None = None
    memo: str | None = Field(default=None, max_length=300)


class BeanOut(CamelModel):
    id: int
    name: str
    roaster: str | None
    region: Region
    process: Process
    roast_level: RoastLevel
    roasted_at: date | None
    memo: str | None
    created_at: datetime


class BeanList(CamelModel):
    items: list[BeanOut]
