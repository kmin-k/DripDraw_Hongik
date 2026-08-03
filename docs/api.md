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
| `PATCH` | `/api/feedback/{id}` | 4 |
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
조정 폭은 [`rule-table.md` §8-4, §8-6](rule-table.md)에 확정돼 있습니다 — Ratio ±1.0, 물 온도 ±1℃, 유량 ±0.5 g/s, 분쇄도 ±1단계(50 μm).

조정이 일부 또는 전부 적용되지 못하면 `notice`로 이유를 알립니다 ([`rule-table.md` §8-4, §8-6](rule-table.md)의 충돌·클램프 규칙).

```json
{ "changes": [], "notice": "분쇄도 균일성을 확인해 보세요" }
```

- 신맛·쓴맛이 서로 반대 방향(둘 다 강함, 둘 다 약함)이면 상쇄 — 조정 없이 위 안내
- Ratio 증가로 주수 간 대기가 음수가 되면 해당 조정 제외 — `"현재 원두량에서는 물을 더 늘릴 수 없어요"`

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

## 확정된 사항

- `recipe/adjust`의 조정 폭 — [`rule-table.md` §8-4, §8-6](rule-table.md)
- **곡선 샘플링 100 ms 고정, 저장 시 다운샘플링 하지 않음.** 205초 기준 약 2,050점(JSON 약 45 KB)으로 데모 범위에서 문제없습니다. 히스토리 목록이 느려지면 그때 요약본(1 Hz) 컬럼을 별도로 추가합니다 — 미리 최적화하지 않습니다.
- RMSE 정렬 방식 — 위 `POST /api/brews` 참고
