/**
 * 저울 데이터 소스 인터페이스.
 *
 * 실제 저울(FelicitaArcSource)과 시뮬레이션(SimulatedSource)이 같은 인터페이스를 구현합니다.
 * 화면은 어느 쪽인지 모른 채 동작하므로, 저울이 없어도 실시간 화면 전체를 완성할 수 있고
 * 시연 중 연결이 실패해도 즉시 전환할 수 있습니다.
 */
export interface ScaleSource {
  readonly kind: "FELICITA_ARC" | "SIMULATED";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** 무게(g)와 수신 시각(ms, performance.now 기준)을 전달합니다. */
  onWeight(callback: (grams: number, timestampMs: number) => void): void;
  tare(): Promise<void>;
  startTimer(): Promise<void>;
  stopTimer(): Promise<void>;
}
