/**
 * 저울 데이터 소스 인터페이스.
 *
 * 화면이 저울 구현에 직접 의존하지 않도록 한 겹 분리합니다.
 * 지금은 구현체가 FelicitaArcSource 하나뿐입니다 — 시뮬레이션 모드는 만들지 않기로 했습니다
 * (docs/roadmap.md "백업 원칙"). 저울 연동이 끝내 실패해 시뮬레이션이 필요해지면
 * 이 인터페이스를 구현하는 클래스를 추가하는 것으로 끝납니다.
 */

export type ScaleStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  /** 연결이 끊겨 자동 재연결을 시도하는 중. 시연 중 이 상태를 화면에 보여줘야 합니다. */
  | "RECONNECTING";

export interface ScaleSource {
  readonly kind: "FELICITA_ARC";
  readonly status: ScaleStatus;

  /** 브라우저 기기 선택창을 띄웁니다. 반드시 사용자 클릭 안에서 호출해야 합니다. */
  connect(): Promise<void>;
  /** 의도적 종료. 이후 자동 재연결하지 않습니다. */
  disconnect(): Promise<void>;

  /** 구독 해제 함수를 돌려줍니다. React에서 언마운트 시 호출하세요. */
  onWeight(callback: (grams: number, timestampMs: number) => void): () => void;
  onStatusChange(callback: (status: ScaleStatus) => void): () => void;

  tare(): Promise<void>;
  startTimer(): Promise<void>;
  stopTimer(): Promise<void>;
  resetTimer(): Promise<void>;
}
