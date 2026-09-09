"""정답을 아는 합성 이미지를 만들어 분석기 정확도를 검증한다."""

import cv2
import numpy as np


def make(
    path="synthetic.jpg",
    um_per_px=8.4,
    marker_mm=10.0,
    mean_um=800.0,
    sigma=0.30,
    n=600,
    perspective=True,
    seed=7,
):
    rng = np.random.default_rng(seed)
    W, H = 4032, 3024
    img = np.full((H, W, 3), 245, np.uint8)

    # 마커
    side = int(round(marker_mm * 1000 / um_per_px))
    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    m = cv2.aruco.generateImageMarker(d, 0, side)
    q = side // 6
    canvas = np.full((side + 2 * q, side + 2 * q), 255, np.uint8)
    canvas[q : q + side, q : q + side] = m
    img[80 : 80 + canvas.shape[0], 80 : 80 + canvas.shape[1]] = canvas[:, :, None]
    marker_box = (80 + q, 80 + q, side)

    # 입자 (로그정규 분포)
    truth = []
    placed = []
    tries = 0
    while len(truth) < n and tries < n * 60:
        tries += 1
        dia_um = float(rng.lognormal(np.log(mean_um), sigma))
        if not (120 < dia_um < 2200):
            continue
        r = dia_um / um_per_px / 2.0
        cx = rng.uniform(r + 5, W - r - 5)
        cy = rng.uniform(r + 5, H - r - 5)
        mx, my, ms = marker_box
        if mx - r - 40 < cx < mx + ms + r + 40 and my - r - 40 < cy < my + ms + r + 40:
            continue
        # 살짝 겹치도록 허용 -> watershed 분리 성능 검증
        if any((cx - px) ** 2 + (cy - py) ** 2 < (r + pr) ** 2 * 0.55 for px, py, pr in placed):
            continue
        placed.append((cx, cy, r))
        ang = rng.uniform(0, 180)
        ax = r * rng.uniform(0.85, 1.15)
        by = r * r / ax
        cv2.ellipse(
            img,
            (int(cx), int(cy)),
            (int(round(ax)), int(round(by))),
            ang,
            0,
            360,
            (int(rng.integers(25, 60)),) * 3,
            -1,
            cv2.LINE_AA,
        )
        truth.append(dia_um)

    # 비네팅(조명 불균일)
    yy, xx = np.mgrid[0:H, 0:W]
    v = 1.0 - 0.35 * (((xx - W * 0.4) / W) ** 2 + ((yy - H * 0.55) / H) ** 2) * 3.2
    img = np.clip(img.astype(np.float32) * np.clip(v, 0.55, 1.0)[..., None], 0, 255).astype(
        np.uint8
    )

    if perspective:
        src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
        dst = np.float32([[0, 60], [W, 0], [W - 110, H], [140, H - 70]])
        img = cv2.warpPerspective(
            img, cv2.getPerspectiveTransform(src, dst), (W, H), borderValue=(245, 245, 245)
        )

    img = np.clip(img.astype(np.int16) + rng.normal(0, 3, img.shape), 0, 255).astype(np.uint8)
    cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])

    t = np.sort(np.array(truth))
    vw = t**3
    o = np.argsort(t)
    cw = np.cumsum(vw[o])
    cw = cw / cw[-1]
    print(
        f"[정답] n={t.size}  D50={np.percentile(t, 50):.0f}µm  "
        f"D10={np.percentile(t, 10):.0f}  D90={np.percentile(t, 90):.0f}  "
        f"Dv50={np.interp(0.5, cw, t[o]):.0f}µm"
    )
    return path


if __name__ == "__main__":
    make()
