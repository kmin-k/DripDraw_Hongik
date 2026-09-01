"""
정확한 실물 크기로 인쇄할 수 있는 ArUco 기준 마커를 만든다.
스케일 정확도가 곧 측정 정확도이므로, 반드시 '실제 크기(100%)'로 인쇄하고
인쇄 후 자로 한 변을 재서 --mm 값과 일치하는지 확인할 것.

사용법:
    python tools/make_marker.py --mm 20 --id 0 --dpi 600
"""

from __future__ import annotations

import argparse

import cv2
import numpy as np


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
    canvas[quiet:quiet + side, quiet:quiet + side] = marker

    label = f"DripDraw  ID={args.id}  {args.mm:g}mm  (print at 100%)"
    canvas = cv2.copyMakeBorder(canvas, 0, int(quiet * 0.9), 0, 0,
                                cv2.BORDER_CONSTANT, value=255)
    cv2.putText(canvas, label, (quiet // 2, canvas.shape[0] - quiet // 3),
                cv2.FONT_HERSHEY_SIMPLEX, side / 900.0, 0, max(1, side // 300),
                cv2.LINE_AA)

    cv2.imwrite(args.out, canvas)
    print(f"저장: {args.out}  ({canvas.shape[1]}x{canvas.shape[0]} px @ {args.dpi}dpi)")
    print(f"인쇄 후 마커 한 변이 {args.mm:g}mm 인지 자로 확인하세요.")
    print("무광 용지에 인쇄하고, 원두 가루와 같은 평면에 놓아야 합니다.")


if __name__ == "__main__":
    main()
