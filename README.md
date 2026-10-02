# DripDraw

[![CI](https://github.com/kmin-k/DripDraw_Hongik/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/kmin-k/DripDraw_Hongik/actions/workflows/ci.yml)

사용자 입력으로 목표 추출 곡선(Target Curve)을 만들고, Felicita Arc의 실시간 무게 곡선과 비교해 브루잉 재현성을 높이는 3인 졸업 프로젝트입니다.

## 핵심 가치

- 목표 곡선과 실제 추출 곡선을 실시간으로 비교
- RMSE로 추출 정확도를 수치화
- 맛 피드백을 다음 레시피 보정에 반영
- 공식 API가 없는 상용 저울의 BLE 프로토콜을 직접 분석·연동

## 시스템 구성

```text
Felicita Arc ──BLE──> React ──> 실시간 그래프·RMSE
                            │
                            └──REST──> FastAPI
                                       ├─ Rule Engine
                                       ├─ Feedback Engine
                                       ├─ Brew Records
                                       └─ Vision Service
```

실시간 무게 데이터는 지연과 장애 지점을 줄이기 위해 서버를 거치지 않습니다. 레시피 생성, 기록 저장, 피드백 보정, Vision 분석만 FastAPI가 담당합니다.

## 기술 스택

| 영역 | 기술 |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS, Recharts |
| BLE | Web Bluetooth API |
| Backend | FastAPI, Python, SQLAlchemy, SQLite |
| Vision | OpenCV (`opencv-contrib`) |

## 현재 상태

Phase 0 완료. 프론트·백엔드 스캐폴딩과 DB 모델이 올라가 있고, 다음은 Rule Engine(Phase 3)입니다.

우선순위는 다음과 같습니다.

1. Felicita Arc 연결과 실시간 추출 화면
2. Rule Engine과 Target Curve 생성
3. 맛 피드백 기반 레시피 보정
4. 서비스 화면
5. Vision 기능

## 처음 참여한다면

1. [협업 가이드](CONTRIBUTING.md)에서 브랜치·커밋·PR 규칙을 확인합니다.
2. [개발 로드맵](docs/roadmap.md)에서 현재 Phase와 남은 작업을 봅니다.
3. 자기 작업 영역의 문서를 읽습니다. 저울은 [BLE 프로토콜](docs/scale-protocol.md), 알고리즘은 [Rule Table](docs/rule-table.md), 전체 구조는 [아키텍처](docs/architecture.md).
4. `dev`에서 분기해 작업하고 PR을 `dev`로 보냅니다. `main`은 직접 건드리지 않습니다.

```bash
git clone https://github.com/kmin-k/DripDraw_Hongik.git
cd DripDraw_Hongik
git switch dev
git switch -c feature/<작업명>
```

## 실행

버전은 [협업 가이드](CONTRIBUTING.md)의 "개발 환경"을 따릅니다 (Node 24 / Python 3.13).

**백엔드** — http://localhost:8000/docs 에서 Swagger 확인

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

**프론트엔드** — http://localhost:5180

```bash
cd frontend
npm install
npm run dev
```

`/api`와 `/health` 요청은 Vite가 8000번으로 프록시하므로 두 서버를 함께 띄우면 됩니다.

> 두 서버 모두 터미널을 붙잡고 계속 돌아갑니다. **터미널을 닫으면 서버가 꺼집니다.**

**앱으로 설치해서 쓰기 (PWA)**

위 두 서버를 띄운 상태에서 `http://localhost:5180`을 열고, 안드로이드 크롬은 주소창 메뉴의
**앱 설치**, 데스크톱 크롬은 주소창 오른쪽 설치 아이콘을 누르면 홈 화면·시작 메뉴에 추가되고
주소창 없이 전체화면으로 열립니다.

> 설치한 앱은 **설치한 주소에 고정**됩니다. 5180에서 설치했으면 앱을 열 때마다 두 서버가
> 켜져 있어야 하고, 다른 포트(예: `npm run preview`의 4173)에서 설치한 앱은 5180으로 열리지 않습니다.

> 오프라인은 지원하지 않습니다. 화면 대부분이 서버 데이터에 의존해 캐시해도 할 수 있는 일이
> 없고, 낡은 버전이 남는 위험만 생깁니다 ([`public/sw.js`](frontend/public/sw.js)).

**데모 데이터 채우기**

```bash
cd backend && python -m app.seed
```

원두 2종과 추출 기록 9건을 넣습니다. **기존 데이터를 전부 지우고 새로 채우므로** 몇 번을 돌려도 같은 상태가 됩니다.
같은 레시피를 반복할수록 정확도가 좋아지도록 만들어져, 히스토리의 정확도 추이를 그대로 볼 수 있습니다.

**검증**

```bash
cd backend && pytest && ruff check .
cd frontend && npm test && npm run lint
```

> DB 구조는 **Alembic 마이그레이션**으로 관리합니다. 서버가 켜질 때 자동으로 최신 구조로 맞추므로
> 평소에는 신경 쓸 것이 없습니다. 모델(`app/models.py`)을 바꿀 때만 마이그레이션 파일을 함께 만듭니다 —
> [협업 가이드](CONTRIBUTING.md) "DB 구조 바꾸기". 빠뜨리면 `tests/test_migrations.py`가 실패합니다.
>
> 마이그레이션 도입 전에 만든 `dripdraw.db`가 있으면 서버가 켜지지 않습니다. 지우고 시드를 다시 넣으세요.

## 문서

- [협업 가이드](CONTRIBUTING.md) — 브랜치, 커밋, PR
- [개발 로드맵](docs/roadmap.md) — Phase별 작업과 완료 기준
- [시스템 아키텍처](docs/architecture.md) — 책임 분리와 API 계약
- [Felicita Arc BLE 프로토콜](docs/scale-protocol.md) — 패킷·명령·검증 체크리스트
- [Rule Table](docs/rule-table.md) — Target Curve 계산 규칙
- [데이터 모델 (ERD)](docs/erd.md) — 테이블과 설계 근거
- [API 명세](docs/api.md) — 엔드포인트별 요청·응답

## 팀

- 김강민
- 성지훈
- 정회진
