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
| 400 | 입력값 범위 위반 (예: 원두량 상한 초과) |
| 404 | 참조한 리소스 없음 |
| 422 | 스키마 불일치 (FastAPI 자동) |
| 500 | 그 외 |

---

## 엔드포인트 목록

| Method | Path | Phase |
|---|---|---|
| `GET` | `/health` | 0 |
| `POST` | `/api/beans` | 0 |
| `GET` | `/api/beans` | 0 |
| `POST` | `/api/recipe/generate` | 3 |
| `POST` | `/api/recipe/adjust` | 4 |
| `POST` | `/api/brews` | 2 |
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
  "roastedAt": "2026-07-25",
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
  "flowRateGps": 3.0,
  "grindGuide": "현재 분쇄도 유지",
  "iceMessage": null,
  "pours": [
    { "phase": "BLOOM", "waterG": 60, "startSec": 0,   "endSec": 10  },
    { "phase": "SECOND", "waterG": 96, "startSec": 45,  "endSec": 77  },
    { "phase": "THIRD",  "waterG": 79, "startSec": 117, "endSec": 143 },
    { "phase": "FOURTH", "waterG": 65, "startSec": 183, "endSec": 205 }
  ],
  "targetCurve": [[0,0],[10,60],[45,60],[77,156],[117,156],[143,235],[183,235],[205,300]]
}
```

> 위 값은 [`rule-table.md` §7 검증 예시](rule-table.md)와 동일합니다. pytest 회귀 테스트의 기준으로 그대로 씁니다.

`drinkType`이 `ICE`면 `iceMessage`에 `"얼음이 가득 담긴 컵에 부어 드세요!"`가 들어갑니다.

**입력 제약**

| 필드 | 제약 |
|---|---|
| `doseG` | 정수, **10 ~ 30** (`ge=10, le=30`). 30 초과 시 주수 간 대기가 음수가 되어 곡선이 깨집니다 → [`rule-table.md` §8-1, §8-2](rule-table.md) |
| `d50Um` | 실수 (μm) |
| `drinkType` | `HOT` \| `ICE` |

**400 응답 예시** — 원두량 상한 초과

```json
{ "detail": "doseG must be between 10 and 30 (got 40)" }
```

---

## `POST /api/brews` — 추출 기록 저장

추출 종료 시 프론트가 수집한 실측 곡선을 그대로 보냅니다. RMSE는 프론트가 이미 계산했지만, **서버에서 재계산해 저장**합니다(단일 진실 공급원).

**요청**

```json
{
  "recipeId": 12,
  "startedAt": "2026-07-31T09:12:03Z",
  "endedAt": "2026-07-31T09:15:31Z",
  "isSimulated": false,
  "actualCurve": [[0,0],[0.1,1.2],[0.2,3.4]]
}
```

**응답 `201`**

```json
{ "brewId": 34, "rmse": 4.71, "durationSec": 208, "finalWeightG": 298.4 }
```

## `GET /api/brews` — 히스토리

```json
{
  "items": [
    { "brewId": 34, "beanName": "Ethiopia Yirgacheffe", "brewedAt": "2026-07-31T09:12:03Z",
      "rmse": 4.71, "doseG": 20, "totalWaterG": 300, "hasFeedback": true }
  ]
}
```

## `GET /api/brews/{id}` — 상세

`targetCurve`, `actualCurve`, `pours`, 레시피 파라미터 전체, `feedback`을 함께 반환합니다.
"이 레시피로 다시 내리기"는 응답의 `recipeId`를 그대로 재사용하면 됩니다.

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
    { "field": "ratio",      "before": 15,  "after": 14,  "reason": "농도 연함" },
    { "field": "flowRateGps","before": 3.0, "after": 3.5, "reason": "쓴맛 강함" },
    { "field": "waterTempC", "before": 96,  "after": 95,  "reason": "쓴맛 강함" }
  ],
  "targetCurve": [[0,0]]
}
```

`changes` 배열이 **발표의 핵심**입니다. "왜 이렇게 바뀌었는지"를 화면에 그대로 보여줄 수 있어야 합니다.
충돌 우선순위는 `농도 > 균형감(신맛·쓴맛) > 단맛`. 조정 폭은 [`rule-table.md` §8-3, §8-4](rule-table.md)에서 결정 후 확정합니다.

적용 여부 기록:

```
PATCH /api/feedback/{id}   { "applied": true }
```

---

## `POST /api/vision/grind` — 분쇄도 분석 (P5)

`multipart/form-data`, 필드 `file`, 선택 필드 `beanId`.

```json
{ "d50Um": 1180, "guide": "2단계 곱게", "confidence": "LOW" }
```

절대 입자 크기를 보장하지 않습니다. **상대 가이드 용도**임을 응답과 UI에 명시합니다.

---

## 미확정

- `recipe/adjust`의 조정 폭 수치 — Rule Table v0.2에서 확정
- 곡선 샘플링 간격(100 ms 제안)과 저장 시 다운샘플링 여부
