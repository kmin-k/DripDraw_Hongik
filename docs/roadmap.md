# 개발 로드맵

팀 전체가 같은 순서와 완료 기준을 공유하기 위한 문서입니다. 세부 일정은 팀 합의 후 각 Phase에 적습니다.

## 우선순위

| 순위 | 항목 | 발표 비중 |
|---|---|---|
| P1 | 저울 연동 + 실시간 화면 + RMSE | ★★★★★ |
| P2 | Rule Engine (Target Curve 자동 생성) | ★★★★★ |
| P3 | Feedback Loop | ★★★★ |
| P4 | 서비스 화면 | ★★ |
| P5 | Vision (확장) | ★ |

시간이 부족하면 **아래 순위부터** 잘라냅니다. Vision은 설계 문서 + 데모 이미지로 대체 가능합니다.

---

## 데모 시나리오 (모든 작업의 기준)

최종 발표에서 보여줄 5분짜리 시연을 먼저 고정하고, **여기에 등장하지 않는 기능은 만들지 않습니다.**

| # | 화면 | 보여줄 것 | 필요 Phase |
|---|---|---|---|
| 1 | 원두 등록 | 지역·가공·로스팅 입력 | 0 |
| 2 | 레시피 생성 | 원두량 20 g 입력 → **Target Curve가 즉시 그려짐**. 로스팅을 다크로 바꾸면 곡선 모양이 눈에 띄게 달라짐 | 3 |
| 3 | 추출 | 저울 연결 → 물을 부으면 실선이 점선을 따라 올라감. **RMSE 실시간 표시**, 페이스 인디케이터 | 1, 2 |
| 4 | 맛 평가 | "쓴맛 강함 / 농도 연함" 선택 → **무엇이 왜 바뀌었는지 표로** + 이전 곡선 위에 신규 곡선 겹쳐 표시 | 4 |
| 5 | 히스토리 | 추출 기록 목록, RMSE 추이, "이 레시피로 다시 내리기" | 5 |

시연 성공의 판정 기준은 **3번 화면 하나**입니다. 나머지가 거칠어도 3번이 살아있으면 발표는 성립하고, 3번이 죽으면 나머지가 완벽해도 성립하지 않습니다.

**백업 원칙**

- 데모용 시드 데이터(원두 2~3종, 과거 추출 기록 5건 이상)를 미리 넣어 히스토리 화면이 비어 보이지 않게 합니다.
- **사전 녹화 영상을 반드시 준비**합니다. 라이브 실패 시 즉시 전환.

> **시뮬레이션 모드는 만들지 않습니다.** 시연에서 가짜 데이터를 실측처럼 보여주지 않기 위해서입니다.
> 그 대가로 **라이브 실패 시 대비책이 사전 녹화 영상 하나뿐**이므로, 영상 준비가 선택이 아니라 필수입니다.
> 저울 연동이 끝내 안 되면 그때 시뮬레이션 도입을 다시 논의합니다.

---

## Phase 0 — 기반 세팅 (현재 단계)

- [x] `dev` 브랜치, `.gitignore`, `.editorconfig`, `.gitattributes`
- [x] 협업 가이드 · 아키텍처 · BLE 프로토콜 · Rule Table 문서화
- [x] [ERD](erd.md) · [API 명세](api.md) 초안
- [ ] 데모 시나리오 확정 (아래 참고) — 이후 모든 작업의 완료 기준이 됨
- [x] `frontend/` 스캐폴딩 — Vite + React + TS, Tailwind, Recharts, react-router-dom
- [x] `backend/` 스캐폴딩 — FastAPI + SQLAlchemy, `/health`, `/api/beans`, CORS
- [x] SQLAlchemy 모델 — [ERD](erd.md) 그대로 구현
- [x] GitHub `main` 브랜치 보호 설정
- [x] [패킷 덤프 도구](../tools/hex-dump.html) — 저울 도착 전 준비 완료

**완료 기준**: 프론트 `npm run dev`에서 라우팅 동작 + 백엔드 `uvicorn` 실행 시 `/docs` Swagger 노출 — **충족**

상태 관리는 Zustand 대신 `useState`로 시작합니다. 화면이 3개뿐이라 공유 상태가 거의 없고, 필요해지면 그때 도입합니다.

## Phase 1 — 저울 연동 ★최대 리스크

- [ ] `frontend/src/ble/felicita.ts` — 연결, notify 구독, `parseWeight()`, `tare/start/stop`, 자동 재연결
- [ ] 최소 테스트 UI (연결 버튼 + 무게 숫자)
- [ ] **실측 검증**: 100 g 기준물 → 화면 100.0
- [ ] raw 패킷 hex 로그 캡처 → [`scale-protocol.md`](scale-protocol.md) 갱신

**완료 기준**: 물을 부으면 화면 숫자가 실시간으로 따라 올라감

## Phase 2 — 실시간 추출 화면 ★시연 핵심

- [ ] `{time, weight}[]` 100 ms 샘플링
- [ ] Recharts 이중 라인 (Target 점선 / Actual 실선)
- [ ] Target Curve는 우선 **하드코딩** — Phase 3에서 API로 교체 (교체 시점을 주석에 명시)
- [ ] RMSE 실시간 계산·표시, 페이스 인디케이터
- [ ] 컨트롤: 시작·일시정지·종료·리셋·영점
- [ ] (백엔드 병행) `POST /api/brews` — 종료 시 기록 저장

**완료 기준**: 실제 추출 중 목표 곡선 추종이 화면에 보이고, 종료 시 DB에 기록이 남음

## Phase 3 — Rule Engine ★알고리즘 성과

[`rule-table.md`](rule-table.md)를 `backend/app/services/rule_engine.py`로 코드화합니다.

- [x] 입력 정규화 → 물 온도 → 총 물량 → Bloom → 주수 배분 → 유량 → 타이밍 → Target Curve
- [x] `POST /api/recipe/generate`
- [x] **pytest 회귀 테스트** — [`rule-table.md` 7절 검증 예시](rule-table.md#7-검증-예시-회귀-테스트-기준값)를 기준값으로 고정 (66개)
- [x] `rule-table.md` 8절 규칙 확정 완료 — 9절은 실측 후 재검토 대상
- [ ] RecipeSetup 화면 (입력 → 곡선 미리보기)
- [ ] 프론트 하드코딩 곡선을 API 호출로 교체

**완료 기준**: 입력값을 바꾸면 Target Curve 모양이 즉시 달라짐

## Phase 4 — Feedback Loop ★닫힌 루프

- [ ] Feedback 화면 — 슬라이더 3개(신맛·쓴맛·농도), 중립 Dead Zone
- [ ] `backend/app/services/feedback.py` — 충돌 우선순위 `농도 > 균형감 > 단맛`
- [ ] `POST /api/recipe/adjust`
- [ ] 이전 vs 신규 Target Curve 겹쳐 보기 → [유지] / [적용] 선택, 선택 결과도 저장
- [ ] 콜드스타트는 1단계(표준 레시피)만 구현. Bayesian 단계는 설계로만 발표

**완료 기준**: 추출 → 맛 평가 → 다음 레시피 변경까지 한 사이클 시연

## Phase 5 — 서비스 화면

- [ ] 온보딩(선호 맛) / 홈(최근 추출·CTA·주간 요약) / 원두 등록 / 히스토리(상세 + "이 레시피로 다시 내리기") / 설정

## Phase 6 — Vision (선택, 범위 고정)

- [ ] ArUco 마커 4점 인식 → Perspective Warp
- [ ] Contour 기반 입자 크기 분포 추정 → **상대 가이드**로만 출력
- [ ] `POST /api/vision/grind`

**하지 않을 것**: CNN 분류기 학습, 절대 입자 크기 검증, 그라인더 눈금 DB, 시프터 정밀 검증

---

## 리스크

| 리스크 | 대응 |
|---|---|
| Arc 패킷 오프셋이 문서와 다름 | Phase 1에서 hex 덤프로 조기 검증 |
| BLE 연결 끊김 | 자동 재연결. 시연 중 복구 실패 시 녹화 영상으로 전환 |
| iOS는 Web Bluetooth 미지원 | 노트북 Chrome 시연으로 고정 |
| Vision에 시간 과소모 | P5 고정, 설계 문서 대체 허용 |
| 라이브 시연 실패 | **사전 녹화 영상 백업 필수** |

---

## 기존 실험 코드

중간발표용 프로토타입(`BLE.html`, `brew_simulation.html`)이 있던 `feature/bluetooth-test` 브랜치는 **삭제했습니다.**

Web Bluetooth 연결 시도와 Chart.js 그래프까지는 동작했으나 GATT 특성 연결이 미구현이었고, 정식 구현은 `frontend/src/`에 TypeScript로 새로 작성하기로 했으므로 참고 가치가 낮다고 판단했습니다.
BLE 연결 방식은 [`scale-protocol.md`](scale-protocol.md)의 검증된 명세를 기준으로 합니다.
