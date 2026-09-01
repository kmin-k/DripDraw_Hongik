"""
DripDraw - 원두 분쇄도 분석 코어 모듈
=====================================

jgagneastro/coffeegrindsize 의 분석 접근법(기준 물체 기반 스케일링 →
배경 보정 → 이진화 → 뭉친 입자 분리 → 부피 가중 입도 분포)을 참고하여
OpenCV 만으로 재구현한 서버용 모듈.

파이프라인
----------
1. ArUco 마커 검출 (서브픽셀 코너 보정)
2. 호모그래피로 원근 왜곡 제거 → 전체 이미지에서 µm/px 가 균일해짐
3. 해상도 검증 (µm/px 가 너무 크면 측정 불가로 판정하고 중단)
4. 마커 영역 제거 + 모폴로지 배경 추정으로 조명 불균일(flat-field) 보정
5. Otsu / adaptive 이진화
6. distance transform + local peak + watershed 로 붙어 있는 입자 분리
7. 경계에 걸린 입자 및 물리 단위 기준 필터링
8. 개수 가중 / 부피 가중 입도 분포 통계 산출

이 모듈은 GUI 에 의존하지 않으며(headless), 순수 함수로 동작한다.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

import cv2
import numpy as np

__all__ = [
    "AnalysisConfig",
    "AnalysisError",
    "GrindAnalysisResult",
    "analyze_grind_image",
]


# --------------------------------------------------------------------------- #
# 설정
# --------------------------------------------------------------------------- #
@dataclass
class AnalysisConfig:
    """분석 파라미터. 촬영 프로토콜을 바꾸면 이 값들을 함께 조정한다."""

    # --- 기준 마커 ---
    marker_dict: int = cv2.aruco.DICT_4X4_50
    marker_length_mm: float = 20.0          # 인쇄한 마커 한 변의 실제 길이

    # --- 해상도 요구조건 ---
    # µm/px 가 이 값보다 크면(= 너무 멀리서 찍으면) 입자가 몇 픽셀 안 되어
    # 측정 자체가 무의미하므로 에러로 처리한다.
    max_um_per_px: float = 30.0
    # 이 값보다 크면 경고만 남긴다 (측정은 하되 신뢰도 낮음)
    warn_um_per_px: float = 20.0

    # --- 입자 크기 필터 (물리 단위. 픽셀 단위로 하드코딩하지 않는다) ---
    min_diameter_um: float = 50.0
    max_diameter_um: float = 2500.0
    # 등가 직경이 이 픽셀 수보다 작으면 형상 오차가 커서 통계에서 제외
    min_diameter_px: float = 5.0

    # --- 전처리 ---
    threshold_mode: str = "otsu"            # "otsu" | "adaptive"
    blur_ksize: int = 3                     # 3 권장. 5 이상은 미분(fines)을 뭉갬
    flatfield: bool = True

    # --- watershed 분리 ---
    watershed: bool = True
    # 서로 다른 입자의 중심으로 인정할 최소 간격
    peak_min_distance_um: float = 120.0

    # --- 캔버스 상한 (원근 보정 시 캔버스가 폭주하는 것 방지) ---
    max_canvas_px: int = 6000

    # --- 신뢰도 판정 ---
    min_particle_count: int = 200           # 통계적으로 유의미한 최소 입자 수


class AnalysisError(Exception):
    """사용자에게 그대로 보여줘도 되는(내부 정보 미포함) 분석 실패."""

    def __init__(self, message: str, code: str = "analysis_failed"):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class GrindAnalysisResult:
    marker_id: int
    um_per_px: float
    particle_count: int
    # 개수 가중 통계
    d10_um: float
    d50_um: float
    d90_um: float
    mean_um: float
    std_um: float
    # 부피 가중 통계 (레이저 회절 장비 수치와 비교 가능한 표준 지표)
    dv10_um: float
    dv50_um: float
    dv90_um: float
    span: float
    # 분류 및 품질
    grind_label: str
    histogram: dict[str, Any]
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# --------------------------------------------------------------------------- #
# 1~2단계 : 마커 검출 & 원근 보정
# --------------------------------------------------------------------------- #
def _build_detector(cfg: AnalysisConfig) -> "cv2.aruco.ArucoDetector":
    aruco_dict = cv2.aruco.getPredefinedDictionary(cfg.marker_dict)
    params = cv2.aruco.DetectorParameters()
    # 서브픽셀 코너 보정: 스케일 정확도가 곧 측정 정확도이므로 필수
    params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    params.cornerRefinementWinSize = 5
    params.cornerRefinementMaxIterations = 50
    params.cornerRefinementMinAccuracy = 0.01
    return cv2.aruco.ArucoDetector(aruco_dict, params)


def _detect_marker(img: np.ndarray, cfg: AnalysisConfig) -> tuple[np.ndarray, int]:
    """가장 큰 마커 하나를 찾아 (4x2 코너, id) 를 반환."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    detector = _build_detector(cfg)
    corners, ids, _ = detector.detectMarkers(gray)

    if ids is None or len(ids) == 0:
        raise AnalysisError(
            "기준 마커(ArUco)를 찾지 못했습니다. 마커가 원두 가루와 같은 평면에, "
            "흰 여백과 함께 잘리지 않게 나오도록 다시 촬영해 주세요.",
            code="marker_not_found",
        )

    # 여러 개면 화면에서 가장 큰 것을 기준으로 (가장 정확한 스케일을 줌)
    areas = [abs(cv2.contourArea(c.reshape(-1, 2).astype(np.float32))) for c in corners]
    best = int(np.argmax(areas))
    quad = corners[best].reshape(4, 2).astype(np.float32)
    marker_id = int(np.asarray(ids).flatten()[best])
    return quad, marker_id


def _estimate_um_per_px(quad: np.ndarray, cfg: AnalysisConfig) -> float:
    """마커 사각형의 면적으로부터 대표 µm/px 를 추정."""
    area_px = abs(cv2.contourArea(quad))
    if area_px <= 1.0:
        raise AnalysisError(
            "기준 마커가 너무 작게 찍혔습니다. 더 가까이에서 촬영해 주세요.",
            code="marker_too_small",
        )
    side_px = math.sqrt(area_px)
    return (cfg.marker_length_mm * 1000.0) / side_px


def _warp_to_flat(
    img: np.ndarray, quad: np.ndarray, um_per_px: float, cfg: AnalysisConfig
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    마커 평면을 정사영으로 펴서 이미지 전체의 µm/px 를 균일하게 만든다.

    Returns
    -------
    warped      : 보정된 BGR 이미지
    valid_mask  : 원본 픽셀이 실제로 존재하는 영역 (uint8 0/255)
    marker_mask : 보정 좌표계에서 마커가 차지하는 영역 (uint8 0/255)
    """
    side_px = (cfg.marker_length_mm * 1000.0) / um_per_px  # 확대/축소 없이 등배
    dst = np.array(
        [[0, 0], [side_px, 0], [side_px, side_px], [0, side_px]], dtype=np.float32
    )
    H = cv2.getPerspectiveTransform(quad, dst)

    h, w = img.shape[:2]
    src_corners = np.array(
        [[0, 0], [w, 0], [w, h], [0, h]], dtype=np.float32
    ).reshape(-1, 1, 2)
    dst_corners = cv2.perspectiveTransform(src_corners, H).reshape(-1, 2)

    x0, y0 = dst_corners.min(axis=0)
    x1, y1 = dst_corners.max(axis=0)

    # 원근 보정 시 소실점 방향으로 캔버스가 폭주할 수 있으므로,
    # 마커 중심 기준 일정 범위로 잘라낸다 (해상도는 유지, 화각만 제한).
    cx, cy = side_px / 2.0, side_px / 2.0
    limit = side_px * 25.0
    x0 = max(x0, cx - limit)
    y0 = max(y0, cy - limit)
    x1 = min(x1, cx + limit)
    y1 = min(y1, cy + limit)

    out_w = int(round(min(x1 - x0, cfg.max_canvas_px)))
    out_h = int(round(min(y1 - y0, cfg.max_canvas_px)))
    if out_w < 10 or out_h < 10:
        raise AnalysisError(
            "원근 보정에 실패했습니다. 카메라를 종이와 최대한 수직으로 두고 다시 촬영해 주세요.",
            code="warp_failed",
        )

    T = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], dtype=np.float64)
    M = T @ H

    warped = cv2.warpPerspective(
        img, M, (out_w, out_h), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0)
    )
    valid_mask = cv2.warpPerspective(
        np.full((h, w), 255, np.uint8), M, (out_w, out_h), flags=cv2.INTER_NEAREST
    )
    # 보간 경계의 검은 테두리가 입자로 잡히지 않도록 안쪽으로 깎아낸다
    valid_mask = cv2.erode(valid_mask, np.ones((9, 9), np.uint8))

    marker_quad = cv2.perspectiveTransform(
        dst.reshape(-1, 1, 2), T.astype(np.float32)
    ).reshape(-1, 2)
    marker_mask = np.zeros((out_h, out_w), np.uint8)
    cv2.fillPoly(marker_mask, [np.round(marker_quad).astype(np.int32)], 255)
    # 마커 검은 테두리 잔여물 + 흰 여백 경계까지 넉넉히 제외
    pad = max(9, int(round(side_px * 0.08))) | 1
    marker_mask = cv2.dilate(marker_mask, np.ones((pad, pad), np.uint8))

    return warped, valid_mask, marker_mask


# --------------------------------------------------------------------------- #
# 4~5단계 : 배경 보정 & 이진화
# --------------------------------------------------------------------------- #
def _segment(
    warped: np.ndarray,
    valid_mask: np.ndarray,
    marker_mask: np.ndarray,
    um_per_px: float,
    cfg: AnalysisConfig,
) -> np.ndarray:
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    analysis_mask = cv2.bitwise_and(valid_mask, cv2.bitwise_not(marker_mask))
    if cv2.countNonZero(analysis_mask) < 1000:
        raise AnalysisError(
            "분석할 영역이 거의 없습니다. 마커와 원두 가루가 함께 나오도록 촬영해 주세요.",
            code="empty_region",
        )

    # 마커/무효 영역을 주변 배경 밝기로 덮어 배경 추정과 임계값 계산을 오염시키지 않는다
    bg_level = int(np.median(gray[analysis_mask > 0]))
    work = gray.copy()
    work[analysis_mask == 0] = bg_level

    if cfg.flatfield:
        # 밝은 배경 위 어두운 입자 → grayscale closing 이 입자를 지우고 조명 성분만 남긴다
        max_diam_px = cfg.max_diameter_um / um_per_px
        k = int(max_diam_px * 2.5) | 1
        k = int(np.clip(k, 15, 151))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
        background = cv2.morphologyEx(work, cv2.MORPH_CLOSE, kernel)
        background = cv2.GaussianBlur(background, (0, 0), sigmaX=k / 3.0)
        bg_f = background.astype(np.float32) + 1.0
        work = np.clip(
            work.astype(np.float32) / bg_f * float(bg_f.mean()), 0, 255
        ).astype(np.uint8)

    kb = max(1, cfg.blur_ksize) | 1
    if kb > 1:
        work = cv2.GaussianBlur(work, (kb, kb), 0)

    if cfg.threshold_mode == "adaptive":
        block = int(max(31, (200.0 / um_per_px))) | 1
        binary = cv2.adaptiveThreshold(
            work, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block, 5
        )
    else:
        _, binary = cv2.threshold(
            work, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )

    binary = cv2.bitwise_and(binary, analysis_mask)
    # 소금 노이즈 제거 (열기). 3x3 1회면 충분하며 그 이상은 미분을 지운다.
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return binary


# --------------------------------------------------------------------------- #
# 6단계 : 뭉친 입자 분리
# --------------------------------------------------------------------------- #
def _split_particles(
    warped: np.ndarray, binary: np.ndarray, um_per_px: float, cfg: AnalysisConfig
) -> np.ndarray:
    """watershed 로 라벨맵 생성. 배경=1, 입자=2.., 경계=-1."""
    if not cfg.watershed:
        n, labels = cv2.connectedComponents(binary)
        return labels + 1

    dist = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
    dist = cv2.GaussianBlur(dist, (5, 5), 0)

    min_radius_px = max(1.0, (cfg.min_diameter_um / um_per_px) / 2.0)
    k = int(round(cfg.peak_min_distance_um / um_per_px)) | 1
    k = int(np.clip(k, 3, 51))

    local_max = cv2.dilate(dist, np.ones((k, k), np.uint8))
    peaks = ((dist >= local_max - 1e-4) & (dist > min_radius_px)).astype(np.uint8) * 255
    # 평평한 정점이 여러 화소로 흩어지는 것을 하나로 모음
    peaks = cv2.dilate(peaks, np.ones((3, 3), np.uint8))

    if cv2.countNonZero(peaks) == 0:
        n, labels = cv2.connectedComponents(binary)
        return labels + 1

    sure_bg = cv2.dilate(binary, np.ones((3, 3), np.uint8), iterations=3)
    unknown = cv2.subtract(sure_bg, peaks)

    _, markers = cv2.connectedComponents(peaks)
    markers = markers + 1
    markers[unknown == 255] = 0
    markers = cv2.watershed(warped, markers.astype(np.int32))
    return markers


# --------------------------------------------------------------------------- #
# 7단계 : 라벨 → 입자 직경
# --------------------------------------------------------------------------- #
def _measure(
    markers: np.ndarray,
    binary: np.ndarray,
    valid_mask: np.ndarray,
    marker_mask: np.ndarray,
    um_per_px: float,
    cfg: AnalysisConfig,
) -> tuple[np.ndarray, int]:
    """유효 입자의 등가 직경(µm) 배열과 '경계에 걸려 버려진 개수'를 반환."""
    labels = markers.copy()
    labels[labels < 0] = 0              # watershed 경계선
    labels[binary == 0] = 0             # 임계값 밖으로 번진 영역 제거

    # 이미지 가장자리 / 무효 영역 / 마커에 닿은 입자는 잘려 있으므로 통계에서 제외
    excluded = cv2.bitwise_or(cv2.bitwise_not(valid_mask), marker_mask)
    excluded = cv2.dilate(excluded, np.ones((3, 3), np.uint8))
    excluded[0, :] = 255
    excluded[-1, :] = 255
    excluded[:, 0] = 255
    excluded[:, -1] = 255

    max_label = int(labels.max())
    if max_label < 2:
        return np.empty(0, dtype=np.float64), 0

    counts = np.bincount(labels.ravel(), minlength=max_label + 1).astype(np.float64)
    bad = np.unique(labels[excluded > 0])
    bad = bad[bad >= 2]

    keep = np.ones(max_label + 1, dtype=bool)
    keep[0] = keep[1] = False           # 0=제외, 1=배경
    keep[bad] = False

    areas_px = counts[keep]
    truncated = int(len(bad))
    if areas_px.size == 0:
        return np.empty(0, dtype=np.float64), truncated

    diam_px = np.sqrt(4.0 * areas_px / math.pi)
    diam_um = diam_px * um_per_px

    ok = (
        (diam_px >= cfg.min_diameter_px)
        & (diam_um >= cfg.min_diameter_um)
        & (diam_um <= cfg.max_diameter_um)
    )
    return diam_um[ok], truncated


# --------------------------------------------------------------------------- #
# 8단계 : 통계
# --------------------------------------------------------------------------- #
def _weighted_percentile(values: np.ndarray, weights: np.ndarray, q: float) -> float:
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cw = np.cumsum(w)
    cw /= cw[-1]
    return float(np.interp(q, cw, v))


def _classify(dv50: float) -> str:
    # 통상적으로 통용되는 대략적 구간. 장비 교정 전에는 참고용으로만 사용할 것.
    if dv50 < 300:
        return "터키식 / 극세 분쇄"
    if dv50 < 450:
        return "에스프레소 (가는 분쇄)"
    if dv50 < 700:
        return "모카포트 / 에어로프레스"
    if dv50 < 1000:
        return "핸드드립 / 드립 (중간 분쇄)"
    if dv50 < 1300:
        return "케멕스 / 중간-굵은 분쇄"
    return "프렌치프레스 / 콜드브루 (굵은 분쇄)"


def _build_stats(
    diam_um: np.ndarray, um_per_px: float, marker_id: int, warnings: list[str],
    cfg: AnalysisConfig,
) -> GrindAnalysisResult:
    d = np.sort(diam_um)
    n = d.size

    d10, d50, d90 = (float(x) for x in np.percentile(d, [10, 50, 90]))
    vol_w = d ** 3  # 구 가정 부피 가중
    dv10 = _weighted_percentile(d, vol_w, 0.10)
    dv50 = _weighted_percentile(d, vol_w, 0.50)
    dv90 = _weighted_percentile(d, vol_w, 0.90)
    span = (dv90 - dv10) / dv50 if dv50 > 0 else 0.0

    edges = np.linspace(cfg.min_diameter_um, min(cfg.max_diameter_um, d.max() * 1.05), 25)
    counts, _ = np.histogram(d, bins=edges)
    vol_counts, _ = np.histogram(d, bins=edges, weights=vol_w)
    vol_total = vol_counts.sum()

    histogram = {
        "bin_edges_um": [round(float(e), 1) for e in edges],
        "count": [int(c) for c in counts],
        "volume_percent": [
            round(float(v) / float(vol_total) * 100.0, 3) if vol_total > 0 else 0.0
            for v in vol_counts
        ],
    }

    if n < cfg.min_particle_count:
        warnings.append(
            f"검출된 입자가 {n}개로 적어 통계 신뢰도가 낮습니다. "
            "가루를 더 넓게 한 겹으로 펴서 다시 촬영해 주세요."
        )

    return GrindAnalysisResult(
        marker_id=marker_id,
        um_per_px=round(um_per_px, 3),
        particle_count=n,
        d10_um=round(d10, 1),
        d50_um=round(d50, 1),
        d90_um=round(d90, 1),
        mean_um=round(float(d.mean()), 1),
        std_um=round(float(d.std(ddof=1)) if n > 1 else 0.0, 1),
        dv10_um=round(dv10, 1),
        dv50_um=round(dv50, 1),
        dv90_um=round(dv90, 1),
        span=round(span, 3),
        grind_label=_classify(dv50),
        histogram=histogram,
        warnings=warnings,
    )


# --------------------------------------------------------------------------- #
# 공개 API
# --------------------------------------------------------------------------- #
def analyze_grind_image(
    img: np.ndarray,
    cfg: Optional[AnalysisConfig] = None,
    debug_path: Optional[str] = None,
) -> GrindAnalysisResult:
    """
    BGR 이미지를 받아 분쇄도 분석 결과를 반환한다.

    Raises
    ------
    AnalysisError : 사용자에게 그대로 노출 가능한 실패 사유
    """
    cfg = cfg or AnalysisConfig()
    warnings: list[str] = []

    if img is None or img.size == 0:
        raise AnalysisError("이미지를 읽을 수 없습니다.", code="bad_image")
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    quad, marker_id = _detect_marker(img, cfg)
    um_per_px = _estimate_um_per_px(quad, cfg)

    # --- 해상도 검증: 여기서 막지 않으면 '그럴듯하지만 틀린 숫자'가 나간다 ---
    if um_per_px > cfg.max_um_per_px:
        raise AnalysisError(
            f"해상도가 부족합니다 (현재 약 {um_per_px:.0f}µm/픽셀, "
            f"필요 {cfg.max_um_per_px:.0f}µm/픽셀 이하). "
            "마커와 가루가 화면을 가득 채우도록 더 가까이에서 접사로 촬영해 주세요.",
            code="insufficient_resolution",
        )
    if um_per_px > cfg.warn_um_per_px:
        warnings.append(
            f"해상도가 다소 낮습니다({um_per_px:.1f}µm/픽셀). "
            "미분(fines) 측정 오차가 커질 수 있습니다."
        )

    warped, valid_mask, marker_mask = _warp_to_flat(img, quad, um_per_px, cfg)
    binary = _segment(warped, valid_mask, marker_mask, um_per_px, cfg)
    markers = _split_particles(warped, binary, um_per_px, cfg)
    diam_um, truncated = _measure(
        markers, binary, valid_mask, marker_mask, um_per_px, cfg
    )

    if diam_um.size == 0:
        raise AnalysisError(
            "유효한 원두 입자를 찾지 못했습니다. 흰 무광 종이 위에 가루를 "
            "한 겹으로 펴고 그림자가 지지 않는 확산광에서 촬영해 주세요.",
            code="no_particles",
        )

    if truncated > diam_um.size * 0.3:
        warnings.append(
            "가장자리에 걸려 제외된 입자가 많습니다. 가루를 화면 안쪽에 모아 촬영하면 정확도가 올라갑니다."
        )

    if debug_path:
        _save_debug(warped, binary, markers, debug_path)

    return _build_stats(diam_um, um_per_px, marker_id, warnings, cfg)


def _save_debug(
    warped: np.ndarray, binary: np.ndarray, markers: np.ndarray, path: str
) -> None:
    """검출 결과를 색으로 칠한 디버그 이미지를 저장 (imshow 대신 사용)."""
    vis = warped.copy()
    max_label = int(markers.max())
    if max_label >= 2:
        rng = np.random.default_rng(42)
        palette = rng.integers(60, 255, size=(max_label + 1, 3), dtype=np.uint8)
        palette[0] = palette[1] = 0
        lab = markers.copy()
        lab[lab < 0] = 0
        lab[binary == 0] = 0
        colored = palette[lab]
        mask = lab >= 2
        vis[mask] = cv2.addWeighted(vis, 0.35, colored, 0.65, 0)[mask]
    vis[markers == -1] = (0, 0, 255)
    cv2.imwrite(path, vis)
