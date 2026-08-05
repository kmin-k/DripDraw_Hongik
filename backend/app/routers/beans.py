"""원두 등록·조회 (Phase 0)."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bean
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
