"""Rule Table 상수 — docs/rule-table.md 2절.

8-7절 결정: 모든 상수는 이 파일 하나에 모읍니다.
코드 곳곳에 리터럴로 흩뿌리지 마세요.

**출처**: 2026-08 국내 로스터리 브루잉 가이드 15종을 대조해 정한 값입니다(8-8절).
초기 문헌값은 유량이 실제의 1/2 수준이고 대기가 과도하게 길어 실사용과 맞지 않았습니다.
"""

# --- 고정 상수 (2절) ---
BLOOM_POUR_SEC = 10  # Bloom 푸어 시간, 모든 레시피 동일
POUR_COUNT = 4  # Bloom 포함 (Bloom·2차·3차·4차)

# rule_engine은 4회 주수를 명시적으로 구성하므로 이 값을 읽지는 않습니다.
# rule-table.md 2절과의 대조용으로 남겨 둡니다. 주수 횟수를 바꾸려면 여기와 엔진을 함께 고칩니다.

RATIO = {"HOT": 15.0, "ICE": 10.0}  # 1 : N. 참고 레시피는 핫 1:15~17, 아이스 1:9.5~11.5
D50_RANGE = {"HOT": (950, 1250), "ICE": (900, 1100)}  # μm. 참고 레시피 900~1350μm
FLOW_MIN, FLOW_MAX = 5.0, 12.0  # g/sec 클램핑
DOSE_MIN_G, DOSE_MAX_G = 10, 30  # 원두량 입력 범위 (8-1절, 8-2절)

# --- 물 온도 (3절) ---
# 참고 레시피는 전부 93~95℃입니다. 로스팅에 따른 차이는 크지 않습니다.
BASE_TEMP_C = {"LIGHT": 94, "MEDIUM": 93, "DARK": 92}
REGION_TEMP_ADJ = {
    "AFRICA": {"LIGHT": 2, "MEDIUM": 2, "DARK": 1},
    "CENTRAL_AMERICA": {"LIGHT": 0, "MEDIUM": 0, "DARK": 0},
    "SOUTH_AMERICA": {"LIGHT": -1, "MEDIUM": -1, "DARK": -1},
    "ASIA_PACIFIC": {"LIGHT": 0, "MEDIUM": 0, "DARK": 0},
}
PROCESS_TEMP_ADJ = {"WASHED": 0, "NATURAL": -1}

# --- Bloom (4절) ---
# 참고 레시피의 뜸 물량은 원두량의 2.0~3.5배, 핫 기준 평균 2.9배입니다.
BLOOM_MULTIPLIER = {"LIGHT": 2.8, "MEDIUM": 2.5, "DARK": 2.2}

# --- 유량 (5절) ---
BASE_FLOW_GPS = {"LIGHT": 7.0, "MEDIUM": 8.0, "DARK": 9.0}
REGION_FLOW_ADJ = {
    "AFRICA": -1.0,
    "CENTRAL_AMERICA": 0.0,
    "SOUTH_AMERICA": 1.0,
    "ASIA_PACIFIC": 0.0,
}
D50_FLOW_ADJ_FINE = 1.0  # D50 < 하한 (곱게)
D50_FLOW_ADJ_COARSE = -1.0  # D50 > 상한 (굵게)

# --- 주수 타이밍 (6절) ---
POUR_SPLIT = (0.40, 0.33)  # 2차, 3차. 4차는 잔량 (8-3절)

# 주수는 일정한 간격으로 시작합니다. 참고 레시피 15종 중 13종이 30초 간격이었습니다.
# 대기 시간을 총 시간에서 역산하던 이전 모델은 유량을 올릴수록 대기가 길어지는 문제가 있었습니다.
POUR_INTERVAL_SEC = {"LIGHT": 35, "MEDIUM": 30, "DARK": 25}

# 마지막 주수를 시작한 뒤 물이 다 빠질 때까지의 시간.
# 참고 레시피에서 "마지막 주수 시작 → 추출 종료"가 평균 60초였습니다.
DRAWDOWN_SEC = 60

# --- 피드백 조정 (8-4절, 8-5절, 8-6절) ---
RATIO_STEP = 1.0
RATIO_RANGE = {"HOT": (12.0, 18.0), "ICE": (7.0, 13.0)}  # 기본값 ±3
GRIND_STEP_UM = 50
TEMP_STEP_C = 1
FLOW_STEP_GPS = 0.5
TEMP_RANGE = (85, 96)
