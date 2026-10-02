# 화면 이미지. 두 단계로 나눕니다.
#
# 1) Node로 빌드해 정적 파일(dist/)을 만들고
# 2) 그 결과물만 Caddy에 담습니다. Node와 node_modules는 최종 이미지에 들어가지 않습니다.
#
# Caddy가 화면 파일을 내주고, /api는 백엔드로 넘기고, HTTPS 인증서까지 맡습니다 (deploy/Caddyfile).

FROM node:24-alpine AS build
WORKDIR /app

# 의존성 먼저. package-lock.json 그대로 설치해 로컬과 같은 버전이 됩니다.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM caddy:2-alpine
COPY --from=build /app/dist /srv
