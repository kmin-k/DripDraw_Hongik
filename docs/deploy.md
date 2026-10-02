# 배포

> 구성 결정의 근거는 [`roadmap.md`](roadmap.md) "배포" 절. 이 문서는 **절차**입니다.

```
            인터넷  https://dripdraw.store
                      │ 80·443
          ┌───────────▼───────────┐
          │ web (Caddy)           │  HTTPS 인증서 자동 발급·갱신
          │  /api /health /docs → backend
          │  그 밖             → 화면 (빌드된 정적 파일)
          └───────────┬───────────┘
          ┌───────────▼───────────┐
          │ backend (FastAPI)     │  켜질 때 마이그레이션 자동 적용
          └───────────┬───────────┘
          ┌───────────▼───────────┐
          │ db (PostgreSQL 17)    │  밖으로 포트를 열지 않음
          └───────────────────────┘
```

| 파일 | 역할 |
|---|---|
| [`docker-compose.yml`](../docker-compose.yml) | 세 컨테이너를 묶어 한 번에 켜기 |
| [`backend/Dockerfile`](../backend/Dockerfile) | Python 3.13 + 백엔드 |
| [`frontend/Dockerfile`](../frontend/Dockerfile) | Node로 빌드 → 결과물만 Caddy에 |
| [`deploy/Caddyfile`](../deploy/Caddyfile) | 주소별로 어디로 보낼지, 캐시 규칙 |
| `.env` (커밋 안 함) | DB 비밀번호, 접속 주소. [`.env.example`](../.env.example) 참고 |

## 로컬에서 배포판 그대로 띄우기

AWS에 올리기 전에 이 구성을 노트북에서 확인합니다. Docker Desktop이 켜져 있어야 합니다.

```bash
copy .env.example .env        # DB_PASSWORD 채우기 (영문·숫자만)
docker compose up -d --build
docker compose exec backend python -m app.seed
```

http://localhost 로 접속합니다. 개발 서버(5180)와 달리 **빌드된 화면**이 Caddy를 거쳐 나옵니다.

```bash
docker compose logs -f backend   # 로그
docker compose down              # 끄기 — DB 데이터는 볼륨에 남음
docker compose down -v           # 끄고 DB까지 지우기
```

> 개발할 때는 지금처럼 `uvicorn` + `npm run dev`를 씁니다. Docker 구성은 배포 확인용입니다.

## 개발 서버와 다른 점

개발 서버에서는 Vite가 해주던 일을 배포에서는 Caddy가 합니다. 처음 띄울 때 실제로 걸린 것들입니다.

| | 개발 서버 | 배포 |
|---|---|---|
| `/api` 요청 | Vite 프록시가 8000으로 | Caddy가 backend로 |
| `/history/3`에서 새로고침 | Vite가 알아서 처리 | 그런 파일이 없어 404 → **모든 화면 경로에 `index.html`** |
| CORS | 5180 → 8000이라 필요 | 화면과 API가 같은 주소라 **불필요** |
| 캐시 | 없음 | `assets/`만 1년, 나머지는 캐시 금지 — 안 그러면 재배포해도 옛 화면 |
| DB | SQLite 파일 | PostgreSQL. 구조는 마이그레이션이 맞춤 |

캐시 규칙을 처음에 "`/index.html`이면 금지"로 썼다가, `/history/3`처럼 **깊은 주소로 받은 첫 화면에는
적용되지 않는 것**을 로컬 확인에서 발견해 "`assets/`가 아니면 금지"로 바꿨습니다.

## AWS

(EC2 생성 단계에서 채웁니다.)
