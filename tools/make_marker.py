"""
정확한 실물 크기로 인쇄할 수 있는 ArUco 기준 마커를 만든다.
스케일 정확도가 곧 측정 정확도이므로, 반드시 '실제 크기(100%)'로 인쇄하고
인쇄 후 자로 한 변을 재서 --mm 값과 일치하는지 확인할 것.

사용법:
    python tools/make_marker.py --mm 20 --id 0 --dpi 600
    python tools/make_marker.py --out marker.pdf      # A4 PDF, 실제 크기로 고정

PNG는 이미지에 실제 크기 정보가 없어 프린터가 '페이지에 맞춤'으로 키우거나 줄입니다.
PDF는 A4 한 장에 실제 크기로 박아 두므로 '실제 크기(100%)'로만 인쇄하면 20mm가 나옵니다.
앱의 분쇄도 화면이 내려받게 하는 파일이 이것입니다 (frontend/public/marker-20mm.pdf).
"""

from __future__ import annotations

import argparse

import cv2
import numpy as np


def _save_a4_pdf(marker: np.ndarray, dpi: int, mm: float, path: str) -> None:
    """A4 한 장 위쪽 가운데에 마커 한 장을 실제 크기로 배치합니다.

    PDF 페이지 크기를 픽셀 수 ÷ dpi로 정하므로, 100%로 인쇄하면 마커가 정확히 mm 크기가 됩니다.
    측정에는 마커가 한 장만 필요해 여러 장을 넣지 않습니다.
    """
    from PIL import Image

    px_per_mm = dpi / 25.4
    page_w, page_h = round(210 * px_per_mm), round(297 * px_per_mm)
    page = np.full((page_h, page_w), 255, np.uint8)

    # 안내 문구. OpenCV 글꼴은 한글을 못 써서 영어로 둡니다.
    # 페이지 아래쪽에 둡니다. 마커 옆에 글씨가 있으면 획이 원두 입자로 잡히기 때문입니다.
    lines = [
        "DripDraw grind marker - PRINT AT 100% (Actual size). Do NOT 'fit to page'.",
        f"Check with a ruler: the black square must be exactly {mm:g} mm wide.",
        "Sprinkle the grounds on this sheet next to the marker. Shoot from straight above.",
    ]
    scale = page_w / 2600
    for i, text in enumerate(lines):
        y = round((265 + i * 7) * px_per_mm)
        cv2.putText(
            page,
            text,
            (round(15 * px_per_mm), y),
            cv2.FONT_HERSHEY_SIMPLEX,
            scale,
            0,
            max(1, round(scale * 2)),
            cv2.LINE_AA,
        )

    h, w = marker.shape
    left = (page_w - w) // 2
    top = round(45 * px_per_mm)
    page[top : top + h, left : left + w] = marker

    Image.fromarray(page).convert("1").save(path, resolution=dpi)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mm", type=float, default=20.0, help="마커 한 변 실제 길이(mm)")
    ap.add_argument("--id", type=int, default=0, help="마커 ID (0~49)")
    ap.add_argument("--dpi", type=int, default=600)
    ap.add_argument("--out", default="aruco_marker.png")
    args = ap.parse_args()

    px_per_mm = args.dpi / 25.4
    side = int(round(args.mm * px_per_mm))
    quiet = int(round(side / 4))  # 흰 여백(quiet zone). 없으면 검출률이 급락한다.

    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    marker = cv2.aruco.generateImageMarker(d, args.id, side)

    canvas = np.full((side + quiet * 2, side + quiet * 2), 255, np.uint8)
    canvas[quiet : quiet + side, quiet : quiet + side] = marker

    if args.out.lower().endswith(".pdf"):
        # PDF에는 마커 아래 라벨을 붙이지 않습니다. 마커 옆 글씨는 획이 원두 입자로 잡힙니다.
        # 안내 문구는 페이지 아래쪽에 따로 들어갑니다.
        _save_a4_pdf(canvas, args.dpi, args.mm, args.out)
        print(f"저장: {args.out}  (A4, 마커 {args.mm:g}mm × 1장)")
    else:
        label = f"DripDraw  ID={args.id}  {args.mm:g}mm  (print at 100%)"
        canvas = cv2.copyMakeBorder(
            canvas, 0, int(quiet * 0.9), 0, 0, cv2.BORDER_CONSTANT, value=255
        )
        cv2.putText(
            canvas,
            label,
            (quiet // 2, canvas.shape[0] - quiet // 3),
            cv2.FONT_HERSHEY_SIMPLEX,
            side / 900.0,
            0,
            max(1, side // 300),
            cv2.LINE_AA,
        )
        cv2.imwrite(args.out, canvas)
        print(f"저장: {args.out}  ({canvas.shape[1]}x{canvas.shape[0]} px @ {args.dpi}dpi)")
    print(f"인쇄 후 마커 한 변이 {args.mm:g}mm 인지 자로 확인하세요.")
    print("무광 용지에 인쇄하고, 원두 가루와 같은 평면에 놓아야 합니다.")


if __name__ == "__main__":
    main()
