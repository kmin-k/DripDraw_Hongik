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

### 구성 (2026-10 배포)

| 항목 | 값 | 이유 |
|---|---|---|
| 리전 | **시드니 (ap-southeast-2)** | 무료 플랜 계정이 이 리전만 허용. 실시간 경로가 서버를 안 거쳐 거리 영향이 거의 없음 |
| 서버 | EC2 **t3.micro** (x86, 1GB) · Ubuntu 24.04 | 가장 작은 사양 |
| 디스크 | 20 GiB **gp3** | 8 GiB는 Docker 이미지·빌드 캐시로 부족 |
| DB | **EC2 안 PostgreSQL 컨테이너** | RDS는 월 비용이 2배 넘게 늘어 쓰지 않음 |
| 주소 | **탄력적 IP** + 가비아 DNS A 레코드 (`@`, `www`) | 껐다 켜도 IP 유지 |
| HTTPS | Caddy가 Let's Encrypt로 자동 발급·갱신 | Web Bluetooth는 HTTPS 필수 |
| 스왑 | 2 GB | 1GB 메모리로는 빌드 중 멈출 수 있음 |

**쓰지 않는 것** — RDS · 로드밸런서 · NAT 게이트웨이 · Route 53. 전부 이 규모에 비해 비쌉니다.

**인스턴스 생성 시 반드시** — 고급 세부 정보에서 **종료 방지 활성화**, **크레딧 사양 표준(Standard)**.
t3 기본값 "무제한"은 CPU를 많이 쓰면 추가 요금이 붙습니다.

**비용** — 24시간 켜두면 월 약 $15 (서버 + 공인 IP + 디스크). 무료 플랜 크레딧에서 차감됩니다.

### 처음 세팅 (서버를 새로 만들 때)

노트북에서 접속 — 키 파일은 `C:\Users\<사용자>\.ssh\`에 두고 본인만 읽게 잠급니다
(Windows SSH는 다른 계정이 읽을 수 있는 키를 거부합니다).

```bash
icacls $HOME\.ssh\dripdraw.pem /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i $HOME\.ssh\dripdraw.pem ubuntu@<탄력적 IP>
```

서버에서:

```bash
# 스왑 2GB
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu        # 적용하려면 exit 후 다시 접속

# 코드와 설정
git clone https://github.com/kmin-k/DripDraw_Hongik.git
cd DripDraw_Hongik && git switch dev
echo "DB_PASSWORD=$(openssl rand -hex 16)" > .env
echo "SITE_ADDRESS=dripdraw.store, www.dripdraw.store" >> .env

docker compose up -d --build
```

DB 비밀번호는 서버의 `.env`에만 있고 사람이 칠 일이 없습니다. **`.env`를 지우거나 바꾸면 backend가
DB에 못 들어갑니다** — DB는 처음 켜질 때 정한 비밀번호를 기억합니다.

### 평소 운영

```bash
ssh -i $HOME\.ssh\dripdraw.pem ubuntu@54.206.58.63
cd ~/DripDraw_Hongik
```

| 하려는 것 | 명령 |
|---|---|
| **새 코드 반영** (push 후) | `git pull && docker compose up -d --build` |
| 상태 | `docker compose ps` |
| 백엔드 로그 | `docker compose logs -f backend` |
| 데모 데이터 넣기 (**기존 데이터 삭제**) | `docker compose exec backend python -m app.seed` |
| 디스크 정리 (옛 이미지) | `docker image prune -f` |

DB 구조가 바뀐 코드를 반영해도 따로 할 일이 없습니다. backend가 켜질 때 마이그레이션을 적용합니다.

### SSH 접속이 안 될 때

| 증상 | 원인 | 해결 |
|---|---|---|
| `Connection timed out` | 보안 그룹 SSH가 "내 IP"로 묶였는데 **와이파이가 바뀜** | EC2 → 보안 그룹 → 인바운드 규칙 편집 → SSH 출처를 **내 IP**로 다시 저장 |
| `Permission denied (publickey)` | 키 파일 경로가 틀렸거나 잠금이 안 됨 | 위 `icacls` 다시, 경로 확인 |

사이트 접속(80·443)은 어디서나 열려 있어 와이파이와 무관합니다.

### 끄고 켜기

EC2 콘솔 → 인스턴스 → `dripdraw`

| 버튼 | 의미 |
|---|---|
| **인스턴스 중지** | 끄기. 데이터 유지, 비용은 디스크·IP만 (월 약 $6) |
| **인스턴스 시작** | 1~2분 뒤 사이트 복구. 컨테이너가 자동으로 다시 뜸 |
| ⚠️ **인스턴스 종료** | **삭제.** 디스크까지 영구 삭제. 종료 방지가 켜져 있어 그냥은 안 눌림 |

### 발표 후 정리

크레딧은 무료 플랜이라 소진돼도 과금되지 않지만, 남겨두면 계속 차감됩니다.
**학교 구글 계정으로 로그인하므로 졸업 전에** 정리합니다.

1. 필요하면 데이터 백업 — `docker compose exec db pg_dump -U dripdraw dripdraw > backup.sql`
2. 인스턴스 → 작업 → 인스턴스 설정 → **종료 방지 비활성화** → **인스턴스 종료**
3. **탄력적 IP → 릴리스** (연결된 인스턴스가 없어도 IP는 요금이 나갑니다)
4. EC2 → 볼륨에 남은 것이 없는지 확인
5. 가비아 도메인은 자동 연장을 꺼두었으므로 기간이 끝나면 만료됩니다
