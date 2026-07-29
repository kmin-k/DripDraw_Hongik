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

## Phase 0 — 기반 세팅 (현재 단계)

- [x] `dev` 브랜치, `.gitignore`, `.editorconfig`, `.gitattributes`
- [x] 협업 가이드 · 아키텍처 · BLE 프로토콜 · Rule Table 문서화
- [ ] `frontend/` 스캐폴딩 — Vite + React + TS, Tailwind, Recharts, Zustand, react-router-dom
- [ ] `backend/` 스캐폴딩 — FastAPI + SQLAlchemy, `/health`, CORS
- [ ] SQLAlchemy 모델 초안 — `Bean`, `Recipe`, `Brew`, `Feedback`
- [ ] GitHub `main` 브랜치 보호 설정

**완료 기준**: 프론트 `npm run dev`에서 라우팅 동작 + 백엔드 `uvicorn` 실행 시 `/docs` Swagger 노출

## Phase 1 — 저울 연동 ★최대 리스크

- [ ] `frontend/src/ble/felicita.ts` — 연결, notify 구독, `parseWeight()`, `tare/start/stop`, 자동 재연결
- [ ] 최소 테스트 UI (연결 버튼 + 무게 숫자)
- [ ] **실측 검증**: 100 g 기준물 → 화면 100.0
- [ ] raw 패킷 hex 로그 캡처 → [`scale-protocol.md`](scale-protocol.md) 갱신
- [ ] 저울 없이도 개발 가능하도록 **시뮬레이션 모드** 유지

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

- [ ] 입력 정규화 → 물 온도 → 총 물량 → Bloom → 주수 배분 → 유량 → 타이밍 → Target Curve
- [ ] `POST /api/recipe/generate`
- [ ] 프론트 하드코딩 곡선을 API 호출로 교체
- [ ] RecipeSetup 화면 (입력 → 곡선 미리보기)
- [ ] **pytest 회귀 테스트** — [`rule-table.md` §7 검증 예시](rule-table.md#7-검증-예시-회귀-테스트-기준값)를 기준값으로 고정
- [ ] `rule-table.md` §8 미확정 항목 선결

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
| BLE 연결 끊김 | 자동 재연결 + 시뮬레이션 모드 상시 유지 |
| iOS는 Web Bluetooth 미지원 | 노트북 Chrome 시연으로 고정 |
| Vision에 시간 과소모 | P5 고정, 설계 문서 대체 허용 |
| 라이브 시연 실패 | **사전 녹화 영상 백업 필수** |

---

## 기존 실험 코드

`feature/bluetooth-test` 브랜치에 중간발표용 프로토타입이 있습니다.

- `BLE.html` — Web Bluetooth 연결 시도 + Chart.js 그래프 + RMSE 계산 (`acceptAllDevices`, GATT 특성 연결은 미구현)
- `brew_simulation.html` — 4차 추출 시뮬레이션

Phase 1·2의 참고 자료로만 쓰고, 정식 구현은 `frontend/src/`에 TypeScript로 새로 작성합니다.
