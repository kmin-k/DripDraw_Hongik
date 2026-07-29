# DripDraw

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
| Frontend | React, TypeScript, Vite, Tailwind CSS, Recharts, Zustand |
| BLE | Web Bluetooth API |
| Backend | FastAPI, Python, SQLAlchemy, SQLite |
| Vision | OpenCV (`opencv-contrib`) |

## 현재 상태

현재 `dev` 브랜치에서 초기 협업 환경을 정리한 단계입니다. 애플리케이션 스캐폴딩과 의존성 설치는 아직 진행하지 않았습니다.

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

## 문서

- [협업 가이드](CONTRIBUTING.md) — 브랜치, 커밋, PR
- [개발 로드맵](docs/roadmap.md) — Phase별 작업과 완료 기준
- [시스템 아키텍처](docs/architecture.md) — 책임 분리와 API 계약
- [Felicita Arc BLE 프로토콜](docs/scale-protocol.md) — 패킷·명령·검증 체크리스트
- [Rule Table](docs/rule-table.md) — Target Curve 계산 규칙

## 팀

- 김강민
- 성지훈
- 정회진
