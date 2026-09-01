"""
로컬 검증용 CLI. cv2.imshow 대신 디버그 이미지를 파일로 저장하므로
headless 환경(서버/컨테이너)에서도 그대로 동작한다.

사용법:
    python tools/check_grind.py sample.jpg
    python tools/check_grind.py sample.jpg --marker-mm 10 --debug out.jpg
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2

# tools/ 안에서 실행해도 app 패키지를 찾을 수 있도록 backend 루트를 경로에 추가
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.services.grind_analyzer import (  # noqa: E402
    AnalysisConfig,
    AnalysisError,
    analyze_grind_image,
)


def main() -> int:
    ap = argparse.ArgumentParser(description="원두 분쇄도 분석 테스트")
    ap.add_argument("image", nargs="?", default="sample.jpg")
    ap.add_argument(
        "--marker-mm",
        type=float,
        default=20.0,
        help="인쇄한 마커 한 변의 실제 길이(mm)",
    )
    ap.add_argument("--threshold", choices=["otsu", "adaptive"], default="otsu")
    ap.add_argument("--no-watershed", action="store_true", help="입자 분리를 끄고 비교해 본다")
    ap.add_argument(
        "--debug",
        default="debug_result.jpg",
        help="검출 결과를 색칠한 이미지 저장 경로",
    )
    args = ap.parse_args()

    img = cv2.imread(args.image, cv2.IMREAD_COLOR)
    if img is None:
        print(f"[X] 이미지를 찾을 수 없습니다: {args.image}")
        return 1
    print(f"[O] 이미지 로드 성공: {args.image}  ({img.shape[1]}x{img.shape[0]})")

    cfg = AnalysisConfig(
        marker_length_mm=args.marker_mm,
        threshold_mode=args.threshold,
        watershed=not args.no_watershed,
    )

    t0 = time.time()
    try:
        result = analyze_grind_image(img, cfg, debug_path=args.debug)
    except AnalysisError as exc:
        print(f"[X] {exc.code}: {exc.message}")
        return 2
    elapsed = time.time() - t0

    print(f"[O] 마커 ID {result.marker_id} / 스케일 {result.um_per_px:.2f} µm per pixel")
    print(f"[O] 분석 소요 {elapsed:.2f}s, 입자 {result.particle_count}개")
    print()
    print(
        f"  개수 가중   D10 {result.d10_um:7.1f}   "
        f"D50 {result.d50_um:7.1f}   D90 {result.d90_um:7.1f} µm"
    )
    print(
        f"  부피 가중  Dv10 {result.dv10_um:7.1f}  "
        f"Dv50 {result.dv50_um:7.1f}  Dv90 {result.dv90_um:7.1f} µm"
    )
    print(f"  균일도(span) {result.span:.3f}   |   추정 구간: {result.grind_label}")

    for w in result.warnings:
        print(f"  [!] {w}")

    print(f"\n[O] 디버그 이미지 저장: {args.debug}")

    with open("last_result.json", "w", encoding="utf-8") as fp:
        json.dump(result.to_dict(), fp, ensure_ascii=False, indent=2)
    print("[O] 전체 결과(히스토그램 포함): last_result.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
