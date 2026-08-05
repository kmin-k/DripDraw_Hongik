"""SQLAlchemy 모델 — docs/erd.md 그대로 구현.

설계 원칙 (erd.md "설계 근거"):
- 곡선은 정규화하지 않고 JSON 컬럼에 통째로 저장합니다. 항상 전체 단위로 읽고 씁니다.
- ENUM 값은 영어 대문자 문자열로 저장하고 한글 라벨은 프론트에서 매핑합니다.
- RECIPE는 Rule Engine의 계산 결과를 전부 저장합니다. 상수가 나중에 바뀌어도
  과거 추출을 그대로 재현할 수 있어야 하기 때문입니다.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Bean(Base):
    __tablename__ = "beans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    roaster: Mapped[str | None] = mapped_column(String(100), default=None)
    # AFRICA | CENTRAL_AMERICA | SOUTH_AMERICA | ASIA_PACIFIC
    region: Mapped[str] = mapped_column(String(20))
    process: Mapped[str] = mapped_column(String(10))  # WASHED|NATURAL
    roast_level: Mapped[str] = mapped_column(String(10))  # LIGHT|MEDIUM|DARK
    memo: Mapped[str | None] = mapped_column(String(300), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    recipes: Mapped[list["Recipe"]] = relationship(back_populates="bean")


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # 원두를 등록하지 않고 즉석 계산하는 경우가 있어 nullable입니다 (api.md, 데모 편의).
    bean_id: Mapped[int | None] = mapped_column(ForeignKey("beans.id"), default=None)
    # 보정 레시피는 원본을 덮어쓰지 않고 새 행으로 쌓아 부모를 가리킵니다.
    parent_recipe_id: Mapped[int | None] = mapped_column(ForeignKey("recipes.id"), default=None)
    source: Mapped[str] = mapped_column(String(20), default="RULE_ENGINE")  # RULE_ENGINE|ADJUSTED

    # 입력
    dose_g: Mapped[int] = mapped_column(Integer)
    drink_type: Mapped[str] = mapped_column(String(10))  # HOT|ICE
    ratio: Mapped[float] = mapped_column(Float)
    d50_um: Mapped[float | None] = mapped_column(Float, default=None)

    # Rule Engine 계산 결과
    water_temp_c: Mapped[int] = mapped_column(Integer)
    total_water_g: Mapped[float] = mapped_column(Float)
    bloom_water_g: Mapped[float] = mapped_column(Float)
    bloom_wait_sec: Mapped[int] = mapped_column(Integer)
    flow_rate: Mapped[float] = mapped_column(Float)
    total_time_sec: Mapped[int] = mapped_column(Integer)
    target_curve: Mapped[list] = mapped_column(JSON)  # [[time, weight], ...]
    pour_plan: Mapped[list] = mapped_column(JSON)  # 구간별 물량·시작·종료
    grind_guide: Mapped[str | None] = mapped_column(String(50), default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    bean: Mapped["Bean | None"] = relationship(back_populates="recipes")
    brews: Mapped[list["Brew"]] = relationship(back_populates="recipe")


class Brew(Base):
    __tablename__ = "brews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recipe_id: Mapped[int] = mapped_column(ForeignKey("recipes.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime] = mapped_column(DateTime)
    duration_sec: Mapped[int] = mapped_column(Integer)
    final_weight_g: Mapped[float] = mapped_column(Float)
    # RMSE 정의는 docs/api.md "POST /api/brews". 프론트 값을 믿지 않고 서버에서 재계산합니다.
    rmse: Mapped[float] = mapped_column(Float)
    actual_curve: Mapped[list] = mapped_column(JSON)  # [[time, weight], ...]
    # created_at은 두지 않습니다. started_at과 사실상 같은 값이라 정보가 겹칩니다.
    # is_simulated도 없습니다. 시뮬레이션 모드를 만들지 않기로 해서 모든 기록이 실측입니다.

    recipe: Mapped["Recipe"] = relationship(back_populates="brews")
    feedback: Mapped["Feedback | None"] = relationship(back_populates="brew")


class Feedback(Base):
    __tablename__ = "feedbacks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    brew_id: Mapped[int] = mapped_column(ForeignKey("brews.id"), unique=True)
    acidity: Mapped[str] = mapped_column(String(10))  # STRONG|OK|WEAK
    bitterness: Mapped[str] = mapped_column(String(10))  # STRONG|OK|WEAK
    strength: Mapped[str] = mapped_column(String(10))  # THICK|OK|THIN
    suggested_recipe_id: Mapped[int | None] = mapped_column(ForeignKey("recipes.id"), default=None)
    # 제안 수락 여부. 나중에 개인화 모델의 학습 신호가 됩니다.
    applied: Mapped[bool | None] = mapped_column(Boolean, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    brew: Mapped["Brew"] = relationship(back_populates="feedback")


class GrindAnalysis(Base):
    """Vision(P5). 드랍해도 나머지 스키마에 영향이 없도록 분리했습니다."""

    __tablename__ = "grind_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bean_id: Mapped[int | None] = mapped_column(ForeignKey("beans.id"), default=None)
    image_path: Mapped[str] = mapped_column(String(300))
    d50_um: Mapped[float] = mapped_column(Float)
    guide_text: Mapped[str | None] = mapped_column(String(50), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
