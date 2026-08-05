/**
 * 저울 데이터 소스 인터페이스.
 *
 * 화면이 저울 구현에 직접 의존하지 않도록 한 겹 분리합니다.
 * 지금은 구현체가 FelicitaArcSource 하나뿐입니다 — 시뮬레이션 모드는 만들지 않기로 했습니다
 * (docs/roadmap.md "백업 원칙"). 저울 연동이 끝내 실패해 시뮬레이션이 필요해지면
 * 이 인터페이스를 구현하는 클래스를 추가하는 것으로 끝납니다.
 */
export interface ScaleSource {
  readonly kind: "FELICITA_ARC";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** 무게(g)와 수신 시각(ms, performance.now 기준)을 전달합니다. */
  onWeight(callback: (grams: number, timestampMs: number) => void): void;
  tare(): Promise<void>;
  startTimer(): Promise<void>;
  stopTimer(): Promise<void>;
}
