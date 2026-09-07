"""앱 아이콘 생성 — 드립 포트가 목표 곡선 위에 물을 붓는 모습.

    python tools/make_icon.py

frontend/public/icon-192.png · icon-512.png를 다시 만듭니다.
opencv-python이 필요합니다 (backend 가상환경에 들어 있습니다).

작게 줄여도 읽히도록 요소를 넷으로 제한합니다: 몸통 / 주둥이 / 손잡이 / 물줄기 + 곡선.

물줄기는 곡선의 **오르막이 시작되는 지점**에 떨어집니다.
"물을 부으면 누적 물량이 오른다"는 이 앱의 동작이 아이콘 안에 들어갑니다.
"""

from pathlib import Path

import cv2
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public"

BG = (26, 23, 15)  # BGR — #0f172a
WHITE = (250, 250, 250)
AMBER = (60, 158, 251)  # BGR — #fb9e3c

CURVE = [
    (0, 0),
    (10, 56),
    (35, 56),
    (51, 154),
    (70, 154),
    (84, 235),
    (105, 235),
    (116, 300),
]
POUR_START_T = 70  # 물줄기가 떨어질 지점 = 3차 주수가 시작되는 시각

CX0, CX1 = 0.12, 0.88  # 곡선이 차지하는 가로 범위
CY_BOT, CY_TOP = 0.90, 0.62


def bezier(p0, p1, p2, p3, n=80):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.array(p, float) for p in (p0, p1, p2, p3))
    return (
        (1 - t) ** 3 * p0
        + 3 * (1 - t) ** 2 * t * p1
        + 3 * (1 - t) * t**2 * p2
        + t**3 * p3
    )


def curve_xy(t: float, w: float) -> tuple[float, float]:
    max_t, max_w = CURVE[-1]
    return (
        CX0 + (t / max_t) * (CX1 - CX0),
        CY_BOT - (w / max_w) * (CY_BOT - CY_TOP),
    )


def draw(size: int) -> np.ndarray:
    # 4배로 그린 뒤 축소합니다. cv2 안티에일리어싱만으로는 곡선 가장자리가 거칩니다.
    ss = 4
    s = size * ss
    img = np.full((s, s, 3), BG, np.uint8)

    def P(x, y):
        return (round(x * s), round(y * s))

    def T(w):
        return max(1, round(w * s))

    def stroke(points, color, width):
        pts = np.array([P(*p) for p in points], np.int32)
        cv2.polylines(img, [pts], False, color, T(width), cv2.LINE_AA)
        # polylines는 끝을 각지게 남깁니다. 원을 얹어 둥글게 만듭니다.
        for p in (points[0], points[-1]):
            cv2.circle(img, P(*p), T(width) // 2, color, -1, cv2.LINE_AA)

    # ── 목표 곡선 ────────────────────────────────────────────
    stroke([curve_xy(t, w) for t, w in CURVE], WHITE, 0.050)

    # ── 물줄기가 떨어지는 지점 ──────────────────────────────
    land_x, land_y = curve_xy(POUR_START_T, 154)

    # ── 포트 몸통 ────────────────────────────────────────────
    # 위가 좁고 아래가 넓은 사다리꼴. 두꺼운 외곽선으로 모서리를 둥글립니다.
    bx, by = land_x - 0.245, 0.325
    body = np.array(
        [
            P(bx - 0.095, by - 0.100),
            P(bx + 0.095, by - 0.100),
            P(bx + 0.125, by + 0.090),
            P(bx - 0.125, by + 0.090),
        ],
        np.int32,
    )
    cv2.fillPoly(img, [body], WHITE, cv2.LINE_AA)
    cv2.polylines(img, [body], True, WHITE, T(0.075), cv2.LINE_AA)

    # 뚜껑 꼭지 — 몸통에 닿게 둡니다. 띄우면 따로 떠 있는 점처럼 보입니다.
    cv2.circle(img, P(bx, by - 0.168), T(0.032), WHITE, -1, cv2.LINE_AA)

    # ── 손잡이 ───────────────────────────────────────────────
    # 시작·끝을 몸통 안쪽에 두어 붙어 보이게 하고, 바깥으로 적당히만 부풀립니다.
    stroke(
        bezier(
            (bx - 0.105, by - 0.075),
            (bx - 0.335, by - 0.045),
            (bx - 0.335, by + 0.120),
            (bx - 0.100, by + 0.082),
        ),
        WHITE,
        0.044,
    )

    # ── 주둥이 (구스넥) ──────────────────────────────────────
    # 몸통에서 나와 위로 솟았다가 크게 넘어와 아래를 향합니다.
    # 짧게 그리면 몸통에 붙은 혹처럼 보여 주둥이로 읽히지 않습니다.
    spout_tip = (land_x, 0.462)
    stroke(
        bezier(
            (bx + 0.080, by - 0.055),
            (bx + 0.175, by - 0.160),
            (land_x + 0.032, 0.215),
            spout_tip,
        ),
        WHITE,
        0.042,
    )

    # ── 물줄기 ───────────────────────────────────────────────
    # 곡선에 닿기 직전에 끊습니다. 겹쳐 그리면 선을 뚫고 지나간 것처럼 보입니다.
    stroke(
        bezier(
            (land_x, spout_tip[1] + 0.022),
            (land_x + 0.007, 0.530),
            (land_x - 0.007, 0.590),
            (land_x, land_y - 0.042),
        ),
        AMBER,
        0.028,
    )

    return cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)


for n in (192, 512):
    cv2.imwrite(str(OUT / f"icon-{n}.png"), draw(n))
print("생성 완료")
