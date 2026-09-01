# API 명세 (초안 v0.1)

Base URL: `http://localhost:8000`
모든 요청·응답은 `application/json` (Vision 업로드만 `multipart/form-data`).
FastAPI가 `/docs`에 Swagger를 자동 생성하므로, **이 문서는 계약 합의용**이고 실제 스키마는 Pydantic 모델이 기준입니다.

데모 범위이므로 인증·페이지네이션·정렬 옵션은 넣지 않습니다.

## 공통 규칙

- 시간 단위는 **초**, 무게 단위는 **g**, 온도는 **℃**.
- 곡선은 `[[time, weight], ...]` 형태의 배열. 시간 오름차순, 구간 선형 보간.
- 에러는 FastAPI 기본 형식을 따릅니다.

```json
{ "detail": "bean_id 1 not found" }
```

| 상태 | 사용 |
|---|---|
| 400 | **규칙 위반** — 스키마로는 표현할 수 없는 계산 결과 위반 (예: Ratio가 올라 주수 간 대기가 음수) |
| 404 | 참조한 리소스 없음 |
| 422 | **스키마·범위 위반** (Pydantic 자동) — 원두량 10~30 밖, ENUM 오타 등 |
| 500 | 그 외 |

400과 422의 경계는 **"필드 하나만 보고 판단할 수 있는가"**입니다. 원두량 상한처럼 필드 제약으로 표현되는 것은 Pydantic이 422로 먼저 거르고, 여러 값을 조합해 계산해야 드러나는 위반만 라우터가 400으로 냅니다.

---

## 엔드포인트 목록

| Method | Path | Phase |
|---|---|---|
| `GET` | `/health` | 0 |
| `POST` | `/api/beans` | 0 |
| `GET` | `/api/beans` | 0 |
| `POST` | `/api/recipe/generate` | 3 |
| `POST` | `/api/recipe/adjust` | 4 |
| `PATCH` | `/api/feedback/{id}` | 4 |
| `POST` | `/api/brews` | 2 |
| `POST` | `/api/brews/{id}/save-as-recipe` | 2 |
| `GET` | `/api/brews` | 2 |
| `GET` | `/api/brews/{id}` | 5 |
| `POST` | `/api/vision/grind` | 6 |

---

## `GET /health`

```json
{ "status": "ok" }
```

---

## `POST /api/beans` — 원두 등록

```json
{
  "name": "Ethiopia Yirgacheffe",
  "roaster": "OO로스터리",
  "region": "AFRICA",
  "process": "WASHED",
  "roastLevel": "LIGHT",
  "memo": "자몽, 홍차"
}
```

응답 `201` — 생성된 원두 객체 (`id` 포함).

## `GET /api/beans` — 원두 목록

```json
{ "items": [ { "id": 1, "name": "Ethiopia Yirgacheffe", "region": "AFRICA", "roastLevel": "LIGHT", "process": "WASHED" } ] }
```

---

## `POST /api/recipe/generate` ★Rule Engine

입력 조건으로 Target Curve를 생성합니다. 계산 규칙은 [`rule-table.md`](rule-table.md).

**요청**

```json
{
  "beanId": 1,
  "doseG": 20,
  "drinkType": "HOT",
  "d50Um": 950
}
```

`beanId`로 지역·가공방식·로스팅 레벨을 조회합니다. 원두를 등록하지 않고 즉석 계산할 경우 `beanId` 대신 `region`·`process`·`roastLevel`을 직접 보내는 것도 허용합니다(데모 편의).

**응답 `201`**

```json
{
  "recipeId": 12,
  "waterTempC": 96,
  "totalWaterG": 300,
  "ratio": 15,
  "flowRateGps": 6.0,
  "grindGuide": "현재 분쇄도 유지",
  "iceMessage": null,
  "pours": [
    { "phase": "BLOOM",  "waterG": 56, "startSec": 0,   "endSec": 10  },
    { "phase": "SECOND", "waterG": 98, "startSec": 35,  "endSec": 51  },
    { "phase": "THIRD",  "waterG": 81, "startSec": 70,  "endSec": 84  },
    { "phase": "FOURTH", "waterG": 65, "startSec": 105, "endSec": 116 }
  ],
  "targetCurve": [[0,0],[10,56],[35,56],[51,154],[70,154],[84,235],[105,235],[116,300],[165,300]]
}
```

> 위 값은 [`rule-table.md` 7절 검증 예시](rule-table.md)와 동일합니다. pytest 회귀 테스트의 기준으로 그대로 씁니다.
>
> `targetCurve`의 마지막 점(165초)은 **드립다운** 구간입니다. 물을 붓지 않으므로 물량이 유지되며,
> 화면에서 "이제 기다리세요"로 보입니다.

`drinkType`이 `ICE`면 `iceMessage`에 `"얼음이 가득 담긴 컵에 부어 드세요!"`가 들어갑니다.

**입력 제약**

| 필드 | 제약 |
|---|---|
| `doseG` | 정수, **10 ~ 30** (`ge=10, le=30`). 30 초과 시 주수 간 대기가 음수가 되어 곡선이 깨집니다 → [`rule-table.md` 8-1절, 8-2절](rule-table.md) |
| `d50Um` | 실수 (μm) |
| `drinkType` | `HOT` \| `ICE` |

`beanId`를 보내면 `region`·`process`·`roastLevel`은 생략합니다. 둘 다 없으면 `422`입니다.

**422 응답** — 원두량이 범위 밖 (Pydantic이 필드 단위로 거름)

```json
{ "detail": [{ "loc": ["body", "doseG"], "msg": "Input should be less than or equal to 30" }] }
```

**400 응답** — 계산 결과가 규칙을 위반 (Phase 4에서 Ratio 보정 시 발생)

```json
{ "detail": "주수 간 대기가 음수입니다 (-10.0초). 현재 원두량 30 g에서는 물을 더 늘릴 수 없습니다." }
```

---

## `POST /api/brews` — 추출 기록 저장

추출 종료 시 프론트가 수집한 실측 곡선을 그대로 보냅니다. RMSE는 프론트가 이미 계산했지만, **서버에서 재계산해 저장**합니다(단일 진실 공급원).

### RMSE 정의 ★프론트·서버 동일 구현 필수

Target Curve는 8개 점의 구간 선형 곡선이고 Actual Curve는 100 ms 샘플링(205초 기준 약 2,050점)이라 **점의 개수와 시각이 다릅니다.** 아래 방식으로 정렬합니다.

**실측 각 시각 `t_i`에서 Target을 선형 보간해 대응값을 만듭니다.**

```
RMSE = sqrt( mean( (actual_i − interpolate(Target, t_i))² ) )
```

Target이 구간 선형이므로 보간이 근사가 아니라 **정확**하고, 실측 해상도를 손실 없이 사용합니다.

| 경계 상황 | 처리 |
|---|---|
| 실측이 Target 끝(예: 205초)을 **초과** | Target의 마지막 값(총 물량)을 유지해 계속 비교 |
| 실측이 Target보다 **일찍 종료** | 종료 시점까지만 계산. 남은 구간에 페널티를 주지 않음 |
| 실시간 표시 | 시작부터 현재까지의 **누적 RMSE** |

**공통 격자 리샘플링**은 실측을 10분의 1로 버려 순간적 과주수를 놓치고, **DTW**는 시간 왜곡을 허용해 늦게 부어도 점수가 잘 나오므로 채택하지 않습니다. 타이밍 정확도가 곧 평가 대상이기 때문입니다.

> 프론트(실시간)와 서버(저장 시)가 **같은 값을 내야 합니다.** 두 구현이 갈라지면 [`architecture.md`](architecture.md)의 "Rule Engine 단일 구현" 원칙이 여기서 새게 됩니다. 경계 처리까지 이 정의를 그대로 따르세요.

**요청**

```json
{
  "recipeId": 12,
  "startedAt": "2026-07-31T09:12:03Z",
  "endedAt": "2026-07-31T09:15:31Z",
  "actualCurve": [[0,0],[0.1,1.2],[0.2,3.4]]
}
```

**응답 `201`**

```json
{ "brewId": 34, "rmse": 4.71, "durationSec": 208, "finalWeightG": 298.4 }
```

## `POST /api/brews/{id}/save-as-recipe` — 추출을 목표로 저장

자유 모드로 내린 추출이 마음에 들었을 때, 그 곡선을 다음 목표로 삼습니다.
Rule Engine 없이도 **"내가 만든 레시피"를 재현**할 수 있게 하는 경로입니다.

**요청** — 자유 모드는 원두량·음용 방식을 받지 않으므로 여기서 함께 보냅니다.

```json
{ "doseG": 20, "drinkType": "HOT", "beanId": null }
```

**응답 `201`** — `source`가 `RECORDED`인 레시피

```json
{
  "recipeId": 5,
  "totalWaterG": 302,
  "targetCurve": [[0,0],[10,53],[28,53],[42,153],[58,153],[70,243],[88,243],[98,302],[150,302]],
  "waterTempC": null,
  "ratio": null,
  "flowRateGps": null,
  "grindGuide": null,
  "pours": []
}
```

> **실측 곡선을 그대로 목표로 쓰지 않습니다.** 초당 9.3회 측정된 1,900여 점에는 손떨림과
> 저울 진동이 섞여 있어, 그대로 쓰면 *"내가 흔들린 것까지 따라 하라"*가 됩니다.
> 주수 구간만 찾아내 **규칙 엔진과 같은 구조**(붓기 → 대기 → 붓기 …)로 다시 그립니다.
> 구현은 `backend/app/services/curve_shaping.py`.

**Rule Engine 필드는 전부 `null`입니다.** 사용자가 손으로 부은 곡선에는 물 온도·유량 같은 규칙이
애초에 존재하지 않습니다 ([`erd.md`](erd.md)).

| 상태 | 조건 |
|---|---|
| 400 | 주수 구간을 찾지 못함 (저울만 켜두고 붓지 않은 기록) |
| 404 | `brewId` 또는 `beanId` 없음 |
| 422 | 원두량이 10~30 밖 |

---

## `GET /api/brews` — 히스토리

최근 추출부터. 선택 파라미터 `limit` (1~200, 기본 50).

```json
{
  "items": [
    { "brewId": 34, "brewedAt": "2026-08-13T09:12:03Z", "rmse": 4.71,
      "durationSec": 205, "finalWeightG": 300.4,
      "beanName": "Ethiopia Yirgacheffe", "doseG": 20, "totalWaterG": 300,
      "freeMode": false, "hasFeedback": true }
  ]
}
```

**목록에는 곡선을 담지 않습니다.** 곡선 하나가 약 2,000점(45 KB)이라 몇 건만 모여도 응답이 커지고, 훑어보는 화면에는 필요하지 않습니다. 곡선은 상세에서 가져갑니다.

- `freeMode`가 `true`면 따라간 목표가 없어 `rmse`·`doseG`·`totalWaterG`가 전부 `null`입니다
- `beanName`은 원두를 등록하지 않고 만든 레시피에서도 `null`입니다
- `hasFeedback`으로 이미 평가한 추출을 구분합니다. 평가는 추출당 하나뿐입니다

## `GET /api/brews/{id}` — 상세

```json
{
  "brewId": 34, "brewedAt": "2026-08-13T09:12:03Z", "rmse": 4.71,
  "durationSec": 205, "finalWeightG": 300.4,
  "actualCurve": [[0, 0]],
  "beanName": "Ethiopia Yirgacheffe",
  "recipe": { "recipeId": 12, "targetCurve": [[0, 0]] },
  "feedback": { "feedbackId": 8, "acidity": "OK", "bitterness": "STRONG",
                "strength": "THIN", "suggestedRecipeId": 13, "applied": true }
}
```

`recipe`는 `POST /api/recipe/generate`와 같은 형식입니다. **"이 레시피로 다시 내리기"는 `recipe`를 그대로 추출 화면에 넘기면 됩니다.**

- 자유 모드 추출은 `recipe`가 `null`입니다. 화면은 실측 한 줄만 그립니다
- 평가하지 않았으면 `feedback`이 `null`입니다

---

## `POST /api/recipe/adjust` ★Feedback Loop

맛 평가를 받아 **보정된 새 레시피를 생성**합니다. 원본 레시피는 수정하지 않고, 새 레시피가 `parentRecipeId`로 원본을 가리킵니다.

**요청**

```json
{
  "brewId": 34,
  "acidity": "OK",
  "bitterness": "STRONG",
  "strength": "THIN"
}
```

**응답 `201`**

```json
{
  "feedbackId": 8,
  "suggestedRecipeId": 13,
  "parentRecipeId": 12,
  "changes": [
    { "field": "ratio",       "before": 15,  "after": 14,  "reason": "농도 연함" },
    { "field": "waterTempC",  "before": 96,  "after": 95,  "reason": "쓴맛 강함" },
    { "field": "flowRateGps", "before": 6.0, "after": 6.5, "reason": "쓴맛 강함" },
    { "field": "grindGuide",  "before": "현재 분쇄도 유지", "after": "1단계 굵게", "reason": "쓴맛 강함" }
  ],
  "notices": [],
  "recipe": { "recipeId": 13, "totalWaterG": 280, "targetCurve": [[0,0]] }
}
```

`changes` 배열이 **발표의 핵심**입니다. "왜 이렇게 바뀌었는지"를 화면에 그대로 보여줄 수 있어야 합니다.
`before`와 `after`가 같은 항목은 넣지 않습니다 — 안 바뀐 값을 바뀌었다고 보여주는 셈이 됩니다.
조정 폭은 [`rule-table.md` 8-4절, 8-6절](rule-table.md)에 확정돼 있습니다 — Ratio ±1.0, 물 온도 ±1℃, 유량 ±0.5 g/s, 분쇄도 ±1단계(50 μm).

`recipe`는 `POST /api/recipe/generate`와 같은 형식이라, 보정 결과를 그대로 추출 화면에 넘길 수 있습니다.
이전 곡선과 겹쳐 그리려면 `parentRecipeId`로 원본을 따로 조회합니다.

조정이 일부 또는 전부 적용되지 못하면 `notices`로 이유를 알립니다 ([`rule-table.md` 8-4절, 8-6절](rule-table.md)의 충돌·클램프 규칙). 여러 건이 동시에 걸릴 수 있어 **배열**입니다.

```json
{ "changes": [], "notices": ["신맛과 쓴맛이 함께 강합니다. 분쇄도 균일성을 확인해 보세요"] }
```

- 신맛·쓴맛이 서로 반대 방향(둘 다 강함, 둘 다 약함)이면 상쇄 — 조정 없이 위 안내
- Ratio 증가로 푸어가 주수 간격을 넘으면 해당 조정 제외 — `"현재 원두량에서는 물을 더 늘릴 수 없어요"`
- 같은 이유로 유량을 낮추는 조정도 막힐 수 있습니다 — `"현재 원두량에서는 유량을 더 낮출 수 없어요"`
- 파라미터가 상·하한에 도달해 더 못 움직이면 그 사실을 알립니다

**거절**

| 상황 | 코드 |
|---|---|
| 자유 모드 추출(`recipeId` 없음) | `400` — 보정할 원본이 없습니다 |
| `RECORDED` 레시피로 한 추출 | `400` — 조정할 파라미터(온도·유량·Ratio)가 없습니다 |
| 이미 평가한 추출 | `409` — 한 추출에 평가는 하나입니다 |

적용 여부 기록:

```
PATCH /api/feedback/{id}   { "applied": true }
```

보정을 **만드는 것**과 **받아들이는 것**은 다른 사건이라 따로 남깁니다. "제안했지만 쓰지 않은" 기록이 나중에 학습 신호가 됩니다.

---

## `POST /api/vision/grind` — 분쇄도 분석 (P5)

`multipart/form-data`, 필드 `file`, 선택 필드 `beanId`.

```json
{ "d50Um": 1400, "guide": "3단계 곱게", "confidence": "MEDIUM" }
```

절대 입자 크기를 보장하지 않습니다. **상대 가이드 용도**임을 응답과 UI에 명시합니다.

`d50Um`은 **부피 가중 D50**입니다. 체 분리·레이저 회절 장비가 쓰는 기준이라
`rule-table.md`의 D50 범위와 비교할 수 있습니다.

`guide`는 **핫 기준**(950~1250 μm)으로 계산합니다. 촬영 시점에는 음용 방식을 모르므로,
아이스는 `recipe/generate`가 실제 `drinkType`으로 다시 판단합니다.

`confidence`는 촬영 해상도(μm/픽셀)와 검출된 입자 수로 정합니다.
`LOW`면 값을 참고만 하고 다시 촬영하도록 안내합니다.

사진에는 크기 기준이 되는 **ArUco 마커**(`DICT_4X4_50`, 한 변 20 mm)가
가루와 같은 평면에 있어야 합니다. `tools/make_marker.py`로 인쇄용 이미지를 만듭니다.

| 상태 | 조건 |
|---|---|
| 400 | 마커를 찾지 못함 / 해상도 부족 / 입자를 찾지 못함 / 이미지 형식·용량 오류 |
| 404 | `beanId` 없음 |

> 측정 결과를 `GRIND_ANALYSIS`에 저장하는 것은 아직 구현하지 않았습니다.
> 이미지 보관 위치와 정리 정책을 팀에서 정한 뒤 별도 PR로 진행합니다.
---

## 확정된 사항

- `recipe/adjust`의 조정 폭 — [`rule-table.md` 8-4절, 8-6절](rule-table.md)
- **곡선 샘플링 100 ms 고정, 저장 시 다운샘플링 하지 않음.** 205초 기준 약 2,050점(JSON 약 45 KB)으로 데모 범위에서 문제없습니다. 히스토리 목록이 느려지면 그때 요약본(1 Hz) 컬럼을 별도로 추가합니다 — 미리 최적화하지 않습니다.
- RMSE 정렬 방식 — 위 `POST /api/brews` 참고
