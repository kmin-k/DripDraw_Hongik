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

> ⚠️ **모델(`app/models.py`)을 바꾸면 `backend/dripdraw.db`를 지우고 다시 실행하세요.**
> 마이그레이션 도구가 없어 `create_all()`이 기존 테이블을 변경하지 않습니다. 테스트는 매번 새 DB를 쓰므로
> **테스트는 통과하는데 서버만 500이 나는** 형태로 드러납니다. 개발용 DB라 지워도 됩니다.

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
