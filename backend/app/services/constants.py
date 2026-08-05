"""Rule Table 상수 — docs/rule-table.md 2절.

8-7절 결정: 모든 상수는 이 파일 하나에 모읍니다.
초기값이 문헌 기반이라 Phase 1 실측 후 보정이 예정돼 있고, 변경 지점을 하나로 유지해야 합니다.
코드 곳곳에 리터럴로 흩뿌리지 마세요.
"""

# --- 고정 상수 (2절) ---
BLOOM_POUR_SEC = 10  # Bloom 푸어 시간, 모든 레시피 동일
# rule_engine은 4회 주수를 명시적으로 구성하므로 이 값을 읽지는 않습니다.
# rule-table.md 2절과의 대조용으로 남겨 둡니다. 주수 횟수를 바꾸려면 여기와 엔진을 함께 고칩니다.
POUR_COUNT = 4  # Bloom 포함 (Bloom·2차·3차·4차)

RATIO = {"HOT": 15.0, "ICE": 10.0}  # 1 : N
D50_RANGE = {"HOT": (900, 1100), "ICE": (800, 1000)}  # μm
FLOW_MIN, FLOW_MAX = 2.5, 8.5  # g/sec 클램핑
DOSE_MIN_G, DOSE_MAX_G = 10, 30  # 원두량 입력 범위 (8-1절, 8-2절)

# --- 물 온도 (3절) ---
BASE_TEMP_C = {"LIGHT": 94, "MEDIUM": 91, "DARK": 88}
REGION_TEMP_ADJ = {
    "AFRICA": {"LIGHT": 2, "MEDIUM": 2, "DARK": 1},
    "CENTRAL_AMERICA": {"LIGHT": 0, "MEDIUM": 0, "DARK": 0},
    "SOUTH_AMERICA": {"LIGHT": -1, "MEDIUM": -1, "DARK": -1},
    "ASIA_PACIFIC": {"LIGHT": 0, "MEDIUM": 0, "DARK": 0},
}
PROCESS_TEMP_ADJ = {"WASHED": 0, "NATURAL": -1}

# --- Bloom (4절) ---
BLOOM_MULTIPLIER = {"LIGHT": 3.0, "MEDIUM": 2.5, "DARK": 2.0}
BLOOM_WAIT_SEC = {"LIGHT": 35, "MEDIUM": 30, "DARK": 25}

# --- 유량 (5절) ---
BASE_FLOW_GPS = {"LIGHT": 4.0, "MEDIUM": 5.5, "DARK": 7.0}
REGION_FLOW_ADJ = {
    "AFRICA": -1.0,
    "CENTRAL_AMERICA": 0.0,
    "SOUTH_AMERICA": 1.0,
    "ASIA_PACIFIC": 0.0,
}
D50_FLOW_ADJ_FINE = 1.0  # D50 < 하한 (곱게)
D50_FLOW_ADJ_COARSE = -1.0  # D50 > 상한 (굵게)

# --- 주수 배분과 타이밍 (6절) ---
POUR_SPLIT = (0.40, 0.33)  # 2차, 3차. 4차는 잔량 (8-3절)
TOTAL_TIME_SEC = {"LIGHT": 205, "MEDIUM": 185, "DARK": 155}

# --- 피드백 조정 (8-4절, 8-5절, 8-6절) ---
RATIO_STEP = 1.0
RATIO_RANGE = {"HOT": (12.0, 18.0), "ICE": (7.0, 13.0)}  # 기본값 ±3
GRIND_STEP_UM = 50
TEMP_STEP_C = 1
FLOW_STEP_GPS = 0.5
TEMP_RANGE = (85, 96)
