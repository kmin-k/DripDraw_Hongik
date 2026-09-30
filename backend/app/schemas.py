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


class RecipeSource(StrEnum):
    RULE_ENGINE = "RULE_ENGINE"  # 규칙으로 생성
    ADJUSTED = "ADJUSTED"  # 맛 평가로 보정
    RECORDED = "RECORDED"  # 사용자의 추출을 목표로 저장


class RecipePreview(CamelModel):
    """계산 결과만. `POST /api/recipe/preview`가 돌려주며 DB에 남지 않아 recipeId가 없습니다."""

    total_water_g: int
    target_curve: list[list[int]]

    # 아래는 Rule Engine이 계산한 부가 정보입니다.
    # 사용자의 추출을 그대로 저장한 RECORDED 레시피에는 존재하지 않습니다 (docs/erd.md).
    water_temp_c: int | None = None
    ratio: float | None = None
    flow_rate_gps: float | None = None
    grind_guide: str | None = None
    ice_message: str | None = None
    pours: list[PourOut] = []


class RecipeOut(RecipePreview):
    """저장된 레시피. 추출 화면은 이 객체를 통째로 받아 목표로 씁니다."""

    recipe_id: int
    source: RecipeSource = RecipeSource.RULE_ENGINE
    dose_g: int | None = None
    drink_type: DrinkType | None = None
    #: 사용자가 붙인 이름. 자유 추출을 저장할 때만 생기고 규칙 레시피는 null입니다.
    name: str | None = None
    #: 연결된 원두. 저장할 때 새로 등록한 원두도 여기로 옵니다.
    bean_id: int | None = None
    bean_name: str | None = None


class RecipeListItem(CamelModel):
    """레시피 목록 한 줄. 곡선은 담지 않습니다 — 상세에서 가져옵니다."""

    recipe_id: int
    name: str | None
    source: RecipeSource
    bean_id: int | None
    bean_name: str | None
    dose_g: int
    drink_type: DrinkType
    total_water_g: int
    created_at: datetime
    #: 이 레시피로 내린 횟수. 0이면 만들어만 두고 쓰지 않은 레시피입니다.
    brew_count: int
    #: 가장 최근 추출의 정확도. 한 번도 안 내렸으면 null.
    last_rmse: float | None
    last_brewed_at: datetime | None


class RecipeList(CamelModel):
    items: list[RecipeListItem]


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


class BrewListItem(CamelModel):
    """히스토리 한 줄. 목록에는 곡선을 담지 않습니다.

    곡선 하나가 2,000점(약 45 KB)이라, 20건만 나열해도 응답이 1 MB에 가까워집니다.
    목록은 훑어보는 화면이므로 요약만 보내고 곡선은 상세에서 가져갑니다.
    """

    brew_id: int
    brewed_at: datetime
    #: 자유 모드는 비교할 목표가 없어 null입니다. 0과 다릅니다.
    rmse: float | None
    duration_sec: int
    final_weight_g: float
    #: 따라간 목표 레시피. **같은 레시피끼리 묶어 정확도 추이를 보는 데 씁니다.**
    #: 레시피가 다르면 조건이 달라 정확도를 나란히 비교할 수 없습니다.
    recipe_id: int | None
    #: 사용자가 붙인 레시피 이름. 자유 추출을 저장한 것에만 있습니다.
    recipe_name: str | None
    #: 원두를 등록하지 않고 만든 레시피, 자유 모드 추출은 null입니다.
    bean_name: str | None
    dose_g: int | None
    total_water_g: float | None
    #: 자유 모드 추출인지. 화면에서 정확도 칸을 "—"로 둘지 정하는 데 씁니다.
    free_mode: bool
    #: 이미 평가한 추출인지. 평가는 추출당 하나뿐이라 재진입을 막아야 합니다.
    has_feedback: bool


class BrewList(CamelModel):
    items: list[BrewListItem]


class FeedbackDetail(CamelModel):
    feedback_id: int
    acidity: str
    bitterness: str
    strength: str
    suggested_recipe_id: int | None
    applied: bool | None


class BrewDetail(CamelModel):
    """추출 하나의 전부. 곡선을 다시 그리고 여기서 바로 다시 내릴 수 있어야 합니다."""

    brew_id: int
    brewed_at: datetime
    rmse: float | None
    duration_sec: int
    final_weight_g: float
    actual_curve: list[list[float]]
    bean_name: str | None
    #: 따라간 목표. 자유 모드는 null이고 화면은 실측 한 줄만 그립니다.
    recipe: RecipeOut | None
    feedback: FeedbackDetail | None
    #: 이 기록을 목표로 저장해 만든 레시피. 있으면 화면은 "목표로 저장" 대신 링크를 보여줍니다.
    saved_recipe_id: int | None = None
    saved_recipe_name: str | None = None


class Acidity(StrEnum):
    STRONG = "STRONG"
    OK = "OK"
    WEAK = "WEAK"


class Bitterness(StrEnum):
    STRONG = "STRONG"
    OK = "OK"
    WEAK = "WEAK"


class Strength(StrEnum):
    THICK = "THICK"
    OK = "OK"
    THIN = "THIN"


class RecipeAdjustRequest(CamelModel):
    """맛 평가. 어떤 추출(brew)에 대한 평가인지로 원본 레시피를 찾습니다."""

    brew_id: int
    acidity: Acidity
    bitterness: Bitterness
    strength: Strength


class ChangeOut(CamelModel):
    """무엇이 왜 바뀌었는지 한 줄. 이 표가 화면에 그대로 나갑니다 (docs/api.md)."""

    field: str
    before: float | str
    after: float | str
    reason: str


class RecipeAdjustResponse(CamelModel):
    feedback_id: int
    suggested_recipe_id: int
    parent_recipe_id: int
    changes: list[ChangeOut]
    #: 조정하지 못한 이유. 상쇄·클램프·물량 한계가 동시에 걸릴 수 있어 목록입니다.
    notices: list[str] = []
    #: 보정 결과 레시피. 이전 곡선과 겹쳐 그리려면 원본 레시피를 따로 조회합니다.
    recipe: RecipeOut


class FeedbackUpdate(CamelModel):
    """제안을 수락했는지 기록합니다. 나중에 개인화 모델의 학습 신호가 됩니다."""

    applied: bool


class FeedbackOut(CamelModel):
    feedback_id: int
    applied: bool | None


class SaveAsRecipeRequest(CamelModel):
    """마음에 든 추출을 다음 목표로 저장합니다.

    자유 모드는 원두량·음용 방식을 받지 않으므로 저장 시점에 물어봅니다.

    원두는 **기존 것을 고르거나(bean_id) 그 자리에서 새로 등록(new_bean)**할 수 있습니다.
    원두를 먼저 등록하지 않고 내린 뒤에 저장하는 경우를 위해서입니다. 둘을 함께 보내면 400.
    """

    dose_g: int = Field(ge=C.DOSE_MIN_G, le=C.DOSE_MAX_G)
    drink_type: DrinkType
    #: 레시피 이름. 비워 두면 히스토리에 원두 이름이나 "자유 모드"로 보입니다.
    name: str | None = Field(default=None, max_length=100)
    bean_id: int | None = None
    new_bean: BeanCreate | None = None

    @model_validator(mode="after")
    def bean_is_one_or_the_other(self) -> Self:
        if self.bean_id is not None and self.new_bean is not None:
            raise ValueError("beanId와 newBean은 함께 보낼 수 없습니다")
        if self.name is not None and not self.name.strip():
            raise ValueError("name은 비어 있을 수 없습니다")
        return self


class GrindConfidence(StrEnum):
    """측정 신뢰도. 해상도와 검출 입자 수로 판단합니다 (app/services/grind_analyzer.py)."""

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class GrindAnalysisOut(CamelModel):
    """분쇄도 측정 결과 (docs/api.md `POST /api/vision/grind`).

    절대 입자 크기를 보장하지 않습니다. 촬영 조건에 따라 값이 달라지므로
    confidence를 함께 내고 화면에도 상대 가이드임을 명시합니다.
    """

    #: 부피 가중 D50. recipe/generate의 d50Um 입력에 그대로 넣을 수 있습니다.
    d50_um: float = Field(gt=0)
    #: rule_engine.grind_guide가 만든 안내 문구. 예: "2단계 곱게"
    guide: str
    confidence: GrindConfidence
