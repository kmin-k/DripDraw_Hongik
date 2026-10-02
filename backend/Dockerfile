# 백엔드 이미지. 루트의 docker-compose.yml이 빌드합니다.
#
# Python 버전을 이미지가 정합니다. 서버(Ubuntu)의 기본 Python은 3.12라
# 직접 설치하면 개발 환경(3.13)과 어긋납니다.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# 패키지를 먼저 설치합니다. 코드만 바뀌면 이 층은 캐시를 써서 다시 빌드가 빠릅니다.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# root로 돌리지 않습니다. 앱에 구멍이 나도 컨테이너 안에서 할 수 있는 일이 줄어듭니다.
RUN useradd --create-home app && chown -R app /app
USER app

EXPOSE 8000

# Caddy 뒤에서 돕니다. 실제 접속자 IP·https 여부를 Caddy가 넘겨주는 헤더로 받습니다.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
