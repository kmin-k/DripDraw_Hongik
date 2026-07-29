# DripDraw 협업 가이드

## 시작 전 확인

이 프로젝트의 통합 브랜치는 `dev`입니다. `main`은 마일스톤 단위 릴리스용 보호 브랜치이며 직접 작업하거나 직접 push하지 않습니다.

```bash
git switch dev
git pull --ff-only origin dev
git switch -c feature/<작업명>
```

브랜치 예시:

- `feature/ble-felicita`
- `feature/brewing-screen`
- `feature/rule-engine`
- `fix/weight-parser`
- `docs/api-spec`

## 작업 흐름

1. 작업 시작 전에 담당 범위와 API 또는 데이터 구조를 팀에 공유합니다.
2. 하나의 브랜치에서는 하나의 목적만 다룹니다.
3. 작은 단위로 실행·검증하고 커밋합니다.
4. PR 대상은 `dev`로 지정하고 팀원 1명 이상의 리뷰를 받습니다.
5. `main` 반영은 마일스톤 완료 시 팀 합의 후 진행합니다.

## 커밋 메시지

```text
feat: 사용자 기능 추가
fix: 버그 수정
docs: 문서 변경
test: 테스트 추가 또는 수정
refactor: 동작 변경 없는 구조 개선
chore: 빌드·설정·도구 변경
```

예시:

```text
feat: add Felicita Arc weight parser
test: cover negative weight packets
docs: document BLE packet offsets
```

## 팀 공통 원칙

- 실시간 BLE 데이터 경로는 `저울 → 브라우저 → 화면`으로 유지합니다.
- Target Curve와 피드백 보정 규칙은 백엔드의 단일 구현을 기준으로 합니다.
- BLE 패킷 오프셋은 커뮤니티 자료만 믿지 않고 실물 hex dump로 검증합니다.
- 하드코딩한 임시 데이터에는 교체 시점과 이슈를 주석으로 남깁니다.
- `.env`, DB 파일, 빌드 결과물, 개인 IDE 설정은 커밋하지 않습니다.
- API 또는 저장 스키마 변경 시 관련 문서와 테스트를 함께 갱신합니다.

## PR 체크리스트

- [ ] PR 대상이 `dev`다.
- [ ] 변경 목적과 검증 방법을 설명했다.
- [ ] 관련 테스트 또는 수동 검증을 완료했다.
- [ ] 새 환경 변수와 실행 방법을 문서화했다.
- [ ] 로그, 비밀값, 로컬 DB, 빌드 결과물이 포함되지 않았다.
- [ ] BLE/API/DB 계약 변경을 팀에 공유했다.

## 아직 팀에서 확정할 항목

- Node.js 및 Python 지원 버전
- 패키지 매니저와 잠금 파일 정책
- 포매터·린터·테스트 명령
- 팀원별 1차 담당 영역
- Rule Table 미확정 항목 — [`docs/rule-table.md` §8](docs/rule-table.md) 참고. Phase 3 착수 전에 결정해야 합니다.

애플리케이션 스캐폴딩 시 위 항목을 확정하고 이 문서를 업데이트합니다.

