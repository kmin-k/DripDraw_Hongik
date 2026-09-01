"""분쇄도 분석 (Phase 6) — docs/api.md `POST /api/vision/grind`.

카메라로 찍은 원두 가루 사진에서 입도 분포를 측정해 `recipe/generate`의
`d50Um` 입력을 대신 채웁니다. 사용자가 그라인더 눈금을 μm로 환산하지 않아도
되게 하는 것이 목적입니다.

**절대 입자 크기를 보장하지 않습니다.** 촬영 조건에 따라 값이 달라지므로
`confidence`를 함께 내고, 화면에도 상대 가이드임을 명시합니다 (api.md).

분석 로직은 `app/services/grind_analyzer.py`에 있고, 분쇄도 안내 문구는
`rule_engine.grind_guide`를 그대로 씁니다. 같은 계산을 두 곳에 두면
constants.py를 고쳤을 때 한쪽만 반영됩니다 (rule-table.md 8-7절).
"""

import logging
from typing import Annotated

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Bean
from app.schemas import GrindAnalysisOut
from app.services.grind_analyzer import (
    AnalysisConfig,
    AnalysisError,
    analyze_grind_image,
    confidence_level,
)
from app.services.rule_engine import grind_guide

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vision", tags=["vision"])

DbSession = Annotated[Session, Depends(get_db)]

#: 업로드 상한. 최근 스마트폰 원본 사진이 10 MB 내외입니다.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

#: 인쇄한 ArUco 마커 한 변의 실제 길이. `tools/make_marker.py --mm 20`과 맞춰야 합니다.
#: 이 값이 실물과 다르면 측정값 전체가 그 비율만큼 어긋납니다.
MARKER_LENGTH_MM = 20.0

#: 분쇄도 안내를 계산할 기준. 촬영 시점에는 음용 방식을 모르므로 핫으로 고정합니다.
#: 아이스 기준(900~1100)은 `recipe/generate`가 실제 drinkType으로 다시 판단합니다.
GUIDE_DRINK_TYPE = "HOT"


def _analyze(raw: bytes) -> tuple[float, str]:
    """스레드풀에서 도는 동기 작업. (d50_um, confidence)를 돌려줍니다."""
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise AnalysisError("이미지를 읽을 수 없습니다. JPG 또는 PNG 파일을 올려주세요.")

    cfg = AnalysisConfig(marker_length_mm=MARKER_LENGTH_MM)
    result = analyze_grind_image(img, cfg)

    # 부피 가중 Dv50을 씁니다. 체 분리·레이저 회절 장비가 쓰는 기준이라
    # 그라인더 제조사 표기나 rule-table.md의 D50 범위(950~1250)와 비교 가능합니다.
    # 개수 가중 D50은 미분(fines)이 많을수록 값을 끌어내려 더 곱게 나온 것처럼 보입니다.
    return result.dv50_um, confidence_level(result, cfg)


@router.post("/grind", response_model=GrindAnalysisOut)
async def analyze_grind(
    db: DbSession,
    file: Annotated[UploadFile, File()],
    bean_id: Annotated[int | None, Form(alias="beanId")] = None,
) -> GrindAnalysisOut:
    """원두 가루 사진에서 D50을 측정하고 분쇄도 조정 방향을 안내합니다.

    사진에는 기준 크기를 알 수 있는 ArUco 마커가 가루와 같은 평면에 있어야 합니다.
    마커가 없으면 픽셀을 μm로 환산할 방법이 없어 400을 냅니다.
    """
    if bean_id is not None and db.get(Bean, bean_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"bean_id {bean_id} not found")

    if file.content_type and file.content_type.lower() not in ALLOWED_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="JPG, PNG, WEBP 이미지만 올릴 수 있습니다."
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="빈 파일입니다.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="이미지 용량이 너무 큽니다. (최대 25 MB)"
        )

    try:
        # OpenCV 연산이 수 초 걸립니다. 이벤트 루프에서 돌리면 그동안 다른 요청이 막힙니다.
        d50_um, confidence = await run_in_threadpool(_analyze, raw)
    except AnalysisError as exc:
        # 촬영 방법을 바꾸면 해결되는 실패입니다. 여러 픽셀을 계산해봐야 드러나므로
        # 필드 단위로 거를 수 없어 422가 아닌 400입니다 (api.md "400과 422의 경계").
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.message) from exc
    except Exception as exc:  # noqa: BLE001
        # 내부 예외 문자열에는 파일 경로가 섞이므로 로그에만 남깁니다.
        logger.exception("분쇄도 분석 중 예기치 못한 오류")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
        ) from exc

    return GrindAnalysisOut(
        d50_um=round(d50_um, 1),
        guide=grind_guide(GUIDE_DRINK_TYPE, d50_um),
        confidence=confidence,
    )
