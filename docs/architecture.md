# 시스템 아키텍처

## 목표

DripDraw는 단순한 BLE 저울 연결 앱이 아니라 추출 재현성을 확보하는 소프트웨어 시스템을 목표로 합니다.

## 책임 분리

```text
Client (React + TypeScript)
├─ BLE Layer: Felicita Arc 연결, 패킷 수신·파싱
├─ Realtime View: Target/Actual 곡선 표시
├─ Sampling: 추출 데이터 수집
└─ RMSE: 실시간 정확도 계산

Server (FastAPI)
├─ Rule Engine: 입력 조건으로 Target Curve 생성
├─ Feedback Engine: 맛 평가로 다음 레시피 보정
├─ Brew Records: 추출 기록 CRUD
└─ Vision Service: ArUco 기반 분쇄도 상대 분석

Persistence
└─ SQLite + SQLAlchemy
```

## 데이터 경로

### 실시간 경로

```text
Felicita Arc ──Web Bluetooth──> React ──> 그래프와 RMSE
```

고빈도 무게 데이터는 서버를 경유하지 않습니다. 브라우저에서 직접 수신하고 시각화하여 지연과 장애 지점을 줄입니다.

### 저빈도 경로

```text
React ──HTTP/REST──> FastAPI ──> SQLite
```

레시피 생성, 보정, 추출 기록 저장, Vision 분석은 서버가 담당합니다.

## API 계약

엔드포인트 목록과 요청·응답 스키마는 [`api.md`](api.md)가 기준입니다. 구현 후에는 FastAPI가 생성하는 OpenAPI(`/docs`)를 함께 참조합니다.

## 권장 모노레포 구조

```text
frontend/
  src/
    ble/
    components/
    lib/
    pages/
    store/
    styles/
backend/
  app/
    routers/
    services/
docs/
```

빈 디렉터리를 미리 만들기보다 각 스캐폴딩 도구가 생성한 구조를 기준으로 확장합니다.

## 범위와 우선순위

- P1: 저울 연동, 실시간 화면, RMSE
- P2: Rule Engine과 Target Curve
- P3: Feedback Loop
- P4: 서비스 화면
- P5: Vision

Vision은 ArUco 마커와 contour 기반의 상대 가이드까지만 구현합니다. CNN 학습이나 절대 입자 크기 검증은 현재 범위에서 제외합니다.

