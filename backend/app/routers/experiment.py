"""사용자 실험 기록 조회·판정·내보내기.

시행은 추출 기록 저장(`POST /api/brews`의 `experiment`)과 함께 만들어집니다.
여기서는 만들지 않습니다.
통계 분석은 앱 밖에서 하므로 CSV로 내보냅니다 (docs/api.md "사용자 실험").
"""

import csv
import io
from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Brew, ExperimentTrial
from app.schemas import (
    ExperimentStudy,
    ExperimentTrialList,
    ExperimentTrialOut,
    ExperimentTrialUpdate,
)

router = APIRouter(prefix="/api/experiment", tags=["experiment"])

DbSession = Annotated[Session, Depends(get_db)]


def _trial_out(trial: ExperimentTrial) -> ExperimentTrialOut:
    brew = trial.brew
    return ExperimentTrialOut(
        trial_id=trial.id,
        brew_id=trial.brew_id,
        study=trial.study,
        participant_code=trial.participant_code,
        stage=trial.stage,
        condition=trial.condition,
        trial_no=trial.trial_no,
        valid=trial.valid,
        note=trial.note,
        started_at=brew.started_at,
        rmse=brew.rmse,
        duration_sec=brew.duration_sec,
        final_weight_g=brew.final_weight_g,
    )


def _trials_query(study: ExperimentStudy, participant: str | None = None) -> Select:
    """시행을 진행 순서(저장 순서)대로. 같은 시행을 다시 한 경우도 순서로 구분됩니다."""
    query = select(ExperimentTrial).where(ExperimentTrial.study == study)
    if participant is not None:
        query = query.where(ExperimentTrial.participant_code == participant)
    return query.order_by(ExperimentTrial.participant_code, ExperimentTrial.id)


@router.get("/trials", response_model=ExperimentTrialList)
def list_trials(
    db: DbSession,
    study: ExperimentStudy,
    participant: Annotated[str | None, Query(pattern=r"^[A-Z][0-9]{2,3}$")] = None,
) -> ExperimentTrialList:
    """진행 화면이 "어디까지 했는지"를 서버 기록으로 판단합니다. 새로고침해도 이어서 진행됩니다.

    곡선은 읽지 않습니다. 참가자 한 명이 11회면 곡선만 수십 KB입니다.
    """
    trials = db.scalars(
        _trials_query(study, participant).options(
            joinedload(ExperimentTrial.brew).defer(Brew.actual_curve, raiseload=True)
        )
    ).all()
    return ExperimentTrialList(items=[_trial_out(t) for t in trials])


@router.patch("/trials/{trial_id}", response_model=ExperimentTrialOut)
def update_trial(
    trial_id: int, payload: ExperimentTrialUpdate, db: DbSession
) -> ExperimentTrialOut:
    """무효 표시와 사유. 기록은 지우지 않습니다.

    왜 뺐는지까지 남아야 분석에서 설명할 수 있습니다.
    """
    trial = db.get(ExperimentTrial, trial_id)
    if trial is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"trial_id {trial_id} not found")

    if payload.valid is not None:
        trial.valid = payload.valid
    if "note" in payload.model_fields_set:
        trial.note = payload.note.strip() if payload.note else None
    db.commit()
    db.refresh(trial)
    return _trial_out(trial)


SUMMARY_COLUMNS = [
    "trial_id",
    "study",
    "participant_code",
    "stage",
    "condition",
    "trial_no",
    "valid",
    "note",
    "brew_id",
    "recipe_id",
    "started_at",
    "duration_sec",
    "final_weight_g",
    "rmse",
]

CURVE_COLUMNS = [
    "trial_id",
    "participant_code",
    "stage",
    "condition",
    "trial_no",
    "valid",
    "t_sec",
    "weight_g",
]


def _csv(columns: list[str], rows: Iterator[list]) -> Iterator[str]:
    """한 줄씩 내보냅니다. 곡선 CSV는 시행 100건이면 20만 줄이라 통째로 만들지 않습니다.

    맨 앞 BOM은 엑셀이 한글(무효 사유)을 깨뜨리지 않고 UTF-8로 읽게 합니다.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")

    def flush() -> str:
        text = buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        return text

    writer.writerow(columns)
    yield "﻿" + flush()
    for row in rows:
        writer.writerow(row)
        yield flush()


def _download(name: str, body: Iterator[str]) -> StreamingResponse:
    return StreamingResponse(
        body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/export/summary.csv")
def export_summary(db: DbSession, study: ExperimentStudy) -> StreamingResponse:
    """시행 한 건에 한 줄. 무효 시행도 그대로 내보냅니다 — 빼는 것은 분석 쪽에서 정합니다."""
    trials = db.scalars(
        _trials_query(study).options(
            joinedload(ExperimentTrial.brew).defer(Brew.actual_curve, raiseload=True)
        )
    ).all()

    def rows() -> Iterator[list]:
        for t in trials:
            brew = t.brew
            yield [
                t.id,
                t.study,
                t.participant_code,
                t.stage,
                t.condition,
                t.trial_no,
                int(t.valid),
                t.note or "",
                brew.id,
                brew.recipe_id,
                brew.started_at.isoformat() + "Z",
                brew.duration_sec,
                brew.final_weight_g,
                "" if brew.rmse is None else brew.rmse,
            ]

    return _download(f"experiment_{study.lower()}_summary.csv", _csv(SUMMARY_COLUMNS, rows()))


@router.get("/export/curves.csv")
def export_curves(db: DbSession, study: ExperimentStudy) -> StreamingResponse:
    """실측 곡선을 긴 형식으로. 점 하나가 한 줄입니다 (재현성·DTW 분석용)."""
    trials = db.scalars(_trials_query(study).options(joinedload(ExperimentTrial.brew))).all()

    def rows() -> Iterator[list]:
        for t in trials:
            for sec, gram in t.brew.actual_curve:
                yield [
                    t.id,
                    t.participant_code,
                    t.stage,
                    t.condition,
                    t.trial_no,
                    int(t.valid),
                    sec,
                    gram,
                ]

    return _download(f"experiment_{study.lower()}_curves.csv", _csv(CURVE_COLUMNS, rows()))
