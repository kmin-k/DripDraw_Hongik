import { vi } from "vitest";

import type { ScaleSource, ScaleStatus, TimerState } from "../ble/types";

/**
 * 테스트 전용 저울. 앱 코드는 이 파일을 불러오지 않아 빌드에 들어가지 않습니다.
 * 화면에서 고를 수 있는 시뮬레이션 모드가 아닙니다 (docs/roadmap.md "백업 원칙").
 */
export class FakeScale implements ScaleSource {
  readonly kind = "FELICITA_ARC";
  status: ScaleStatus = "CONNECTED";

  private weightListeners = new Set<(grams: number, timestampMs: number) => void>();
  private statusListeners = new Set<(status: ScaleStatus) => void>();
  private timerListeners = new Set<(state: TimerState) => void>();

  connect = vi.fn(async () => {});
  disconnect = vi.fn(async () => {});
  tare = vi.fn(async () => {});
  startTimer = vi.fn(async () => {});
  stopTimer = vi.fn(async () => {});
  resetTimer = vi.fn(async () => {});

  onWeight(callback: (grams: number, timestampMs: number) => void) {
    this.weightListeners.add(callback);
    return () => void this.weightListeners.delete(callback);
  }

  onStatusChange(callback: (status: ScaleStatus) => void) {
    this.statusListeners.add(callback);
    return () => void this.statusListeners.delete(callback);
  }

  onTimerState(callback: (state: TimerState) => void) {
    this.timerListeners.add(callback);
    return () => void this.timerListeners.delete(callback);
  }

  /** 패킷 하나. 시각은 시계(performance.now)를 고정해 둔 값 기준의 밀리초입니다. */
  emit(grams: number, timestampMs: number) {
    this.weightListeners.forEach((listener) => listener(grams, timestampMs));
  }

  setStatus(status: ScaleStatus) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  setTimerState(state: TimerState) {
    this.timerListeners.forEach((listener) => listener(state));
  }
}
