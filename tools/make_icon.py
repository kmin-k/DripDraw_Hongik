"""앱 아이콘 생성 — 드립 포트가 나선을 그리며 물을 붓는 모습.

    python tools/make_icon.py

frontend/public/icon-192.png · icon-512.png를 다시 만듭니다.
opencv-python이 필요합니다 (backend 가상환경에 들어 있습니다).

**나선인 이유** — 핸드드립은 물을 원을 그리며 붓습니다. 위에서 내려다본 물줄기의 자취가
나선이라, 이 앱이 다루는 동작이 아이콘 안에 그대로 들어갑니다.

작게 줄여도 읽히도록 요소를 셋으로 제한합니다: 포트 / 물줄기 / 나선.
좌표는 전부 0~1이라 크기를 바꿔도 비율이 유지됩니다.
"""

import math
from pathlib import Path

import cv2
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "frontend" / "public"

# BGR 순서입니다. 화면 색과 맞추려면 RGB를 뒤집어 적으세요.
BG = (233, 241, 246)  # #f6f1e9 — 따뜻한 미색. 검정 배경은 홈 화면에서 무겁습니다.
INK = (42, 23, 15)  # #0f172a — 앱 헤더와 같은 색
AMBER = (60, 146, 251)  # #fb923c


def bezier(p0, p1, p2, p3, n=90):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.array(p, float) for p in (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t**2 * p2 + t**3 * p3


def spiral(cx, cy, turns, r0, r1, flatten, n=360):
    """위에서 내려다본 나선. flatten으로 세로를 눌러 비스듬히 본 느낌을 냅니다."""
    a = np.linspace(0, turns * 2 * math.pi, n)
    r = np.linspace(r0, r1, n)
    return np.stack([cx + r * np.cos(a), cy + r * flatten * np.sin(a)], axis=1)


def draw(size: int) -> np.ndarray:
    # 4배로 그린 뒤 축소합니다. cv2 안티에일리어싱만으로는 곡선 가장자리가 거칩니다.
    ss = 4
    s = size * ss
    img = np.full((s, s, 3), BG, np.uint8)

    def P(x, y):
        return (round(x * s), round(y * s))

    def T(w):
        return max(1, round(w * s))

    def stroke(points, color, width, round_caps=True):
        cv2.polylines(img, [np.array([P(*p) for p in points], np.int32)], False, color,
                      T(width), cv2.LINE_AA)
        if round_caps:
            # polylines는 끝을 각지게 남깁니다. 원을 얹어 둥글게 만듭니다.
            for p in (points[0], points[-1]):
                cv2.circle(img, P(*p), T(width) // 2, color, -1, cv2.LINE_AA)

    # ── 나선 ─────────────────────────────────────────────────
    # 안에서 밖으로 감깁니다. 물을 가운데부터 바깥으로 붓는 실제 순서와 같습니다.
    sx, sy = 0.545, 0.735
    stroke(spiral(sx, sy, turns=2.15, r0=0.012, r1=0.275, flatten=0.40), INK, 0.030)

    # ── 포트 몸통 ────────────────────────────────────────────
    # 가로로 퍼지면 둔해 보입니다. 세로를 살리고 어깨를 좁혀 날렵하게 둡니다.
    bx, by = 0.315, 0.300
    # 아래로 크게 벌어지면 양동이처럼 보입니다. 거의 곧은 옆선에 어깨만 살짝 좁힙니다.
    body = np.array(
        [
            P(bx - 0.082, by - 0.128),
            P(bx + 0.082, by - 0.128),
            P(bx + 0.096, by + 0.105),
            P(bx - 0.096, by + 0.105),
        ],
        np.int32,
    )
    cv2.fillPoly(img, [body], INK, cv2.LINE_AA)
    # 외곽선을 얇게 둘러 모서리만 둥글립니다. 두꺼우면 형태가 뭉툭해집니다.
    cv2.polylines(img, [body], True, INK, T(0.042), cv2.LINE_AA)

    # 뚜껑 꼭지
    cv2.circle(img, P(bx, by - 0.172), T(0.024), INK, -1, cv2.LINE_AA)

    # ── 손잡이 ───────────────────────────────────────────────
    stroke(
        bezier(
            (bx - 0.090, by - 0.090),
            (bx - 0.255, by - 0.060),
            (bx - 0.255, by + 0.100),
            (bx - 0.088, by + 0.088),
        ),
        INK,
        0.030,
    )

    # ── 주둥이 (구스넥) ──────────────────────────────────────
    # 얇고 길게. 짧고 두꺼우면 몸통에 붙은 혹처럼 보입니다.
    spout_tip = (sx - 0.010, 0.452)
    stroke(
        bezier(
            (bx + 0.070, by - 0.090),
            (bx + 0.155, by - 0.200),
            (spout_tip[0] + 0.055, 0.205),
            spout_tip,
        ),
        INK,
        0.030,
    )

    # ── 물줄기 ───────────────────────────────────────────────
    # 나선이 시작되는 가운데로 떨어집니다.
    stroke(
        bezier(
            (spout_tip[0], spout_tip[1] + 0.018),
            (spout_tip[0] + 0.010, 0.560),
            (sx - 0.008, 0.630),
            (sx, sy - 0.028),
        ),
        AMBER,
        0.024,
    )

    return cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)


for n in (192, 512):
    cv2.imwrite(str(OUT / f"icon-{n}.png"), draw(n))
print("생성 완료")
