# DripDraw 협업 가이드

## 시작 전 확인

이 프로젝트의 통합 브랜치는 `dev`입니다. `main`은 마일스톤 단위 릴리스용 보호 브랜치이며 직접 작업하거나 직접 push 금지.

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
4. PR 대상은 `dev`로 지정합니다. 코드 변경은 팀원 1명 이상의 리뷰를 받고, 리뷰어가 없거나 문서·설정 변경이면 작성자가 직접 머지합니다.
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

## 개발 환경

**버전은 팀 전원이 동일하게 맞춥니다.** 다르면 잠금 파일이 계속 충돌합니다.

| 항목 | 버전 | 고정 방법 |
|---|---|---|
| Node.js | **22 LTS** | `.nvmrc` |
| Python | **3.12** | `backend/.python-version` |

Node 24 LTS도 동작하지만 올리려면 **팀 전원이 동시에** 바꿉니다.
Python 3.13은 `opencv-contrib-python` 휠 제공이 늦을 수 있어 3.12로 고정합니다.

### 패키지 매니저

| | 도구 | 잠금 파일 |
|---|---|---|
| frontend | **npm** | `package-lock.json` — **커밋함** |
| backend | **venv + pip** | `requirements.txt`, `requirements-dev.txt` — **커밋함** |

npm은 Node에 기본 포함되어 팀원이 따로 설치할 게 없습니다. pnpm·yarn·uv·poetry는 쓰지 않습니다 — 3인 졸업작품 규모에서 얻는 이득보다 환경 차이로 잃는 시간이 큽니다.

### 린터 · 포매터 · 테스트

```bash
# frontend
npm run lint          # ESLint
npm run format        # Prettier
npm run test          # Vitest

# backend
ruff check .          # 린트
ruff format .         # 포맷 (black 대신 ruff 단일 도구)
pytest                # 테스트
```

`ruff`는 린터와 포매터를 겸하므로 `black`·`isort`·`flake8`을 따로 두지 않습니다.

### 실행 포트

| | 포트 | 비고 |
|---|---|---|
| frontend (Vite) | `5173` | |
| backend (uvicorn) | `8000` | Swagger는 `/docs` |

백엔드 CORS 허용 origin은 `http://localhost:5173`입니다.

## Rule Table 원본 관리

**[`docs/rule-table.md`](docs/rule-table.md)가 단일 기준입니다.** 엑셀 원본(`BrewIQ_RuleTable_v0.1.xlsx`)은 팀장 로컬 보관 참고 자료이며, 레포에 넣지 않습니다.

규칙을 바꾸려면:

1. `docs/rule-table.md`를 수정하는 PR을 올린다
2. 7절 회귀 테스트 기준값에 영향이 있으면 **`pytest` 기준값도 같은 PR에서 갱신**한다
3. 팀원 1명 이상 리뷰 후 머지한다

코드와 문서가 어긋나면 **문서가 아니라 둘 다 고칩니다.** 엑셀과 문서가 다르면 팀에 알리고 양쪽을 함께 수정합니다.

