"""원두 등록·조회 (Phase 0)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bean, GrindAnalysis, Recipe
from app.schemas import BeanCreate, BeanList, BeanOut

router = APIRouter(prefix="/api/beans", tags=["beans"])

# FastAPI 권장 형태. 인자 기본값에 Depends()를 직접 쓰지 않습니다.
DbSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=BeanOut, status_code=status.HTTP_201_CREATED)
def create_bean(payload: BeanCreate, db: DbSession) -> Bean:
    bean = Bean(**payload.model_dump())
    db.add(bean)
    db.commit()
    db.refresh(bean)
    return bean


@router.get("", response_model=BeanList)
def list_beans(db: DbSession) -> dict:
    beans = db.scalars(select(Bean).order_by(Bean.id.desc())).all()
    return {"items": beans}


@router.delete("/{bean_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bean(bean_id: int, db: DbSession) -> None:
    """원두 삭제. 그 원두로 만든 레시피와 추출 기록은 **남기고 연결만 끊습니다.**

    원두는 레시피의 입력 조건일 뿐이고, 기록은 실제로 내린 커피입니다. 원두를 정리했다고
    기록이 사라지면 정확도 추이가 끊깁니다. 연결이 끊긴 레시피는 원두 이름 없이 표시됩니다.

    SQLite는 기본으로 외래키를 강제하지 않아 명시적으로 풀어야 고아 참조가 남지 않습니다.
    """
    bean = db.get(Bean, bean_id)
    if bean is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"bean_id {bean_id} not found")

    db.execute(update(Recipe).where(Recipe.bean_id == bean_id).values(bean_id=None))
    db.execute(update(GrindAnalysis).where(GrindAnalysis.bean_id == bean_id).values(bean_id=None))
    db.delete(bean)
    db.commit()
