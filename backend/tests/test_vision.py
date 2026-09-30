"""분쇄도 분석 API 테스트 — docs/api.md `POST /api/vision/grind`.

실제 원두 사진 대신 **정답을 아는 합성 이미지**로 검증합니다.
로그정규 분포로 입자를 뿌리고 원근 왜곡과 조명 불균일까지 넣어 만들기 때문에,
측정 파이프라인 전체(마커 검출 → 원근 보정 → 입자 분리 → 통계)를 한 번에 확인합니다.
생성기는 `tools/make_synthetic.py`와 같은 로직입니다.

카메라·조명·인쇄 마커가 필요한 실사 검증은 자동화할 수 없어 여기서 다루지 않습니다.
절대 정확도는 체 분리(sieve) 대조로 따로 교정해야 합니다.
`architecture.md`가 "절대 입자 크기 검증은 범위 제외"로 정한 부분입니다.
"""

import cv2
import numpy as np
import pytest
from fastapi import status

from app.services import constants as C
from app.services.grind_analyzer import (
    AnalysisConfig,
    AnalysisError,
    analyze_grind_image,
    confidence_level,
)

#: 합성 이미지의 정답. make_synthetic 의 기본값과 같습니다.
TRUTH_D50_UM = 752.0
TRUTH_DV50_UM = 958.0
TRUTH_COUNT = 600

#: 합성 이미지는 10 mm 마커를 씁니다. 4032x3024 안에 20 mm 마커를 넣으면
#: 마커가 화면 대부분을 덮어 입자를 뿌릴 자리가 없습니다.
SYNTHETIC_MARKER_MM = 10.0


def _make_synthetic(
    um_per_px: float = 8.4,
    marker_mm: float = SYNTHETIC_MARKER_MM,
    mean_um: float = 800.0,
    n: int = TRUTH_COUNT,
    seed: int = 7,
) -> np.ndarray:
    """정답을 아는 원두 가루 사진을 만듭니다."""
    rng = np.random.default_rng(seed)
    w, h = 4032, 3024
    img = np.full((h, w, 3), 245, np.uint8)

    side = int(round(marker_mm * 1000 / um_per_px))
    quiet = side // 6
    marker = cv2.aruco.generateImageMarker(
        cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50), 0, side
    )
    canvas = np.full((side + 2 * quiet, side + 2 * quiet), 255, np.uint8)
    canvas[quiet : quiet + side, quiet : quiet + side] = marker
    img[80 : 80 + canvas.shape[0], 80 : 80 + canvas.shape[1]] = canvas[:, :, None]
    mx, my, ms = 80 + quiet, 80 + quiet, side

    placed: list[tuple[float, float, float]] = []
    tries = 0
    while len(placed) < n and tries < n * 60:
        tries += 1
        dia_um = float(rng.lognormal(np.log(mean_um), 0.30))
        if not 120 < dia_um < 2200:
            continue
        r = dia_um / um_per_px / 2.0
        cx = rng.uniform(r + 5, w - r - 5)
        cy = rng.uniform(r + 5, h - r - 5)
        if mx - r - 40 < cx < mx + ms + r + 40 and my - r - 40 < cy < my + ms + r + 40:
            continue
        # 살짝 겹치도록 허용합니다. 붙은 입자를 분리하지 못하면 크기가 크게 부풀려집니다.
        if any((cx - px) ** 2 + (cy - py) ** 2 < (r + pr) ** 2 * 0.55 for px, py, pr in placed):
            continue
        placed.append((cx, cy, r))
        ax = r * rng.uniform(0.85, 1.15)
        cv2.ellipse(
            img,
            (int(cx), int(cy)),
            (int(round(ax)), int(round(r * r / ax))),
            rng.uniform(0, 180),
            0,
            360,
            (int(rng.integers(25, 60)),) * 3,
            -1,
            cv2.LINE_AA,
        )

    # 비네팅. 전역 임계값만 쓰면 여기서 배경이 입자로 잡힙니다.
    yy, xx = np.mgrid[0:h, 0:w]
    v = 1.0 - 0.35 * (((xx - w * 0.4) / w) ** 2 + ((yy - h * 0.55) / h) ** 2) * 3.2
    img = np.clip(img.astype(np.float32) * np.clip(v, 0.55, 1.0)[..., None], 0, 255).astype(
        np.uint8
    )

    # 원근 왜곡. 호모그래피로 펴지 못하면 화면 위치마다 μm/px가 달라집니다.
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[0, 60], [w, 0], [w - 110, h], [140, h - 70]])
    return cv2.warpPerspective(
        img, cv2.getPerspectiveTransform(src, dst), (w, h), borderValue=(245, 245, 245)
    )


@pytest.fixture(scope="module")
def synthetic_image() -> np.ndarray:
    return _make_synthetic()


@pytest.fixture(scope="module")
def synthetic_jpeg(synthetic_image) -> bytes:
    ok, buf = cv2.imencode(".jpg", synthetic_image, [cv2.IMWRITE_JPEG_QUALITY, 95])
    assert ok
    return buf.tobytes()


@pytest.fixture(scope="module")
def analysis(synthetic_image):
    return analyze_grind_image(
        synthetic_image, AnalysisConfig(marker_length_mm=SYNTHETIC_MARKER_MM)
    )


class TestAnalyzerAccuracy:
    """정답을 아는 이미지에서 측정값이 얼마나 벗어나는지 고정합니다."""

    def test_detects_the_reference_marker(self, analysis):
        assert analysis.marker_id == 0

    def test_particle_count_is_close_to_truth(self, analysis):
        # 경계에 걸린 입자를 제외하고 붙은 입자를 분리한 결과입니다.
        assert abs(analysis.particle_count - TRUTH_COUNT) / TRUTH_COUNT < 0.10

    def test_d50_within_five_percent(self, analysis):
        assert abs(analysis.d50_um - TRUTH_D50_UM) / TRUTH_D50_UM < 0.05

    def test_volume_weighted_d50_within_five_percent(self, analysis):
        # API가 실제로 내보내는 값입니다.
        assert abs(analysis.dv50_um - TRUTH_DV50_UM) / TRUTH_DV50_UM < 0.05

    def test_percentiles_are_ordered(self, analysis):
        assert analysis.d10_um < analysis.d50_um < analysis.d90_um
        assert analysis.dv10_um < analysis.dv50_um < analysis.dv90_um


class TestWatershedSeparation:
    """붙어 있는 입자를 분리하지 않으면 결과가 통째로 어긋납니다.

    윤곽선만 찾으면 서로 닿은 가루가 하나의 큰 입자로 잡혀 평균이 크게 부풀려집니다.
    이 테스트가 깨지면 분리 로직이 동작하지 않는 것입니다.
    """

    def test_separation_changes_the_result_materially(self, synthetic_image):
        cfg = AnalysisConfig(marker_length_mm=SYNTHETIC_MARKER_MM, watershed=False)
        merged = analyze_grind_image(synthetic_image, cfg)
        assert merged.particle_count < TRUTH_COUNT * 0.7
        assert merged.dv50_um > TRUTH_DV50_UM * 1.3


class TestGuards:
    """촬영이 잘못된 경우. 라우터가 400으로 변환합니다."""

    def test_rejects_image_without_marker(self):
        blank = np.full((1200, 1600, 3), 240, np.uint8)
        with pytest.raises(AnalysisError, match="마커"):
            analyze_grind_image(blank, AnalysisConfig())

    def test_rejects_insufficient_resolution(self, synthetic_image):
        """멀리서 찍으면 입자가 몇 픽셀 안 되어 측정이 무의미합니다.

        그럴듯하지만 틀린 값을 내보내는 것보다 거절하는 편이 낫습니다.
        """
        small = cv2.resize(synthetic_image, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
        with pytest.raises(AnalysisError, match="해상도"):
            analyze_grind_image(small, AnalysisConfig(marker_length_mm=SYNTHETIC_MARKER_MM))

    def test_rejects_image_with_marker_but_no_grounds(self):
        marker = cv2.aruco.generateImageMarker(
            cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50), 3, 1200
        )
        img = np.full((2000, 2600, 3), 245, np.uint8)
        img[200:1400, 200:1400] = marker[:, :, None]
        with pytest.raises(AnalysisError, match="입자"):
            analyze_grind_image(img, AnalysisConfig(marker_length_mm=SYNTHETIC_MARKER_MM))


class TestConfidence:
    def test_clean_capture_is_not_low(self, analysis):
        assert confidence_level(analysis, AnalysisConfig()) in {"HIGH", "MEDIUM"}

    def test_few_particles_lowers_confidence(self, analysis):
        # 표본이 적으면 분포 통계를 믿을 수 없습니다.
        strict = AnalysisConfig(min_particle_count=analysis.particle_count + 1)
        assert confidence_level(analysis, strict) == "LOW"


class TestGrindGuideIntegration:
    """안내 문구는 rule_engine이 만듭니다. 같은 계산을 복제하지 않습니다."""

    def test_measured_d50_maps_to_a_guide(self, analysis):
        from app.services.rule_engine import grind_guide

        guide = grind_guide("HOT", analysis.dv50_um)
        assert isinstance(guide, str) and guide

    def test_measured_value_is_below_the_hot_range(self, analysis):
        # 합성 이미지의 Dv50(약 940 μm)은 핫 기준 하한 950 바로 아래입니다.
        low, _ = C.D50_RANGE["HOT"]
        assert analysis.dv50_um < low


class TestApi:
    def test_returns_camel_case_contract(self, client, synthetic_jpeg, monkeypatch):
        from app.routers import vision

        # 합성 이미지는 10 mm 마커를 씁니다. 실사용 기본값은 20 mm입니다.
        monkeypatch.setattr(vision, "MARKER_LENGTH_MM", SYNTHETIC_MARKER_MM)

        res = client.post(
            "/api/vision/grind",
            files={"file": ("grind.jpg", synthetic_jpeg, "image/jpeg")},
        )
        assert res.status_code == status.HTTP_200_OK

        body = res.json()
        assert set(body) == {"d50Um", "guide", "confidence"}
        assert body["d50Um"] == pytest.approx(TRUTH_DV50_UM, rel=0.05)
        assert body["confidence"] in {"HIGH", "MEDIUM", "LOW"}

    def test_rejects_non_image(self, client):
        res = client.post(
            "/api/vision/grind",
            files={"file": ("notes.txt", b"not an image", "text/plain")},
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_rejects_image_without_marker(self, client):
        blank = np.full((600, 800, 3), 240, np.uint8)
        ok, buf = cv2.imencode(".jpg", blank)
        assert ok
        res = client.post(
            "/api/vision/grind",
            files={"file": ("blank.jpg", buf.tobytes(), "image/jpeg")},
        )
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        assert "마커" in res.json()["detail"]

    def test_unknown_bean_id_is_404(self, client, synthetic_jpeg):
        res = client.post(
            "/api/vision/grind",
            files={"file": ("grind.jpg", synthetic_jpeg, "image/jpeg")},
            data={"beanId": "999999"},
        )
        assert res.status_code == status.HTTP_404_NOT_FOUND
