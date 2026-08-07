/**
 * Felicita Arc 저울 연동 — docs/scale-protocol.md (2026-08-06 실물 검증)
 *
 * 무게 데이터는 서버를 거치지 않고 브라우저에서 바로 화면으로 갑니다.
 * 서버 왕복 지연이 곡선에 그대로 드러나고, 서버 장애가 곧 시연 실패가 되기 때문입니다.
 * (docs/architecture.md "데이터 경로")
 */

import { parseWeight } from "./parseWeight";
import type { ScaleSource, ScaleStatus } from "./types";

const SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

/** 1바이트 제어 명령. 5종 모두 실물에서 동작을 확인했습니다. */
const COMMAND = {
  TARE: 0x54, // 'T'
  TIMER_START: 0x52, // 'R'
  TIMER_STOP: 0x53, // 'S'
  TIMER_RESET: 0x43, // 'C'
} as const;

/** 재연결 대기 시간(ms). 마지막 값에 도달하면 그 간격으로 계속 시도합니다. */
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

type DeviceRequester = () => Promise<BluetoothDevice>;

function requestFelicitaDevice(): Promise<BluetoothDevice> {
  if (!navigator.bluetooth) {
    throw new Error("이 브라우저는 Web Bluetooth를 지원하지 않습니다 (Chrome·Edge 필요)");
  }
  // 광고 패킷에 서비스 UUID를 싣지 않는 개체가 있어 이름 접두사도 함께 받습니다.
  return navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }, { namePrefix: "FELICITA" }],
    optionalServices: [SERVICE_UUID],
  });
}

export class FelicitaArcSource implements ScaleSource {
  readonly kind = "FELICITA_ARC" as const;

  #status: ScaleStatus = "DISCONNECTED";
  #device: BluetoothDevice | null = null;
  #characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  #weightListeners = new Set<(grams: number, timestampMs: number) => void>();
  #statusListeners = new Set<(status: ScaleStatus) => void>();

  /** 사용자가 직접 끊었는지. true면 재연결하지 않습니다. */
  #intentionalDisconnect = false;
  #retryIndex = 0;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;

  #requestDevice: DeviceRequester;

  /** 테스트에서 가짜 기기를 넣기 위해 주입 지점을 열어 둡니다. */
  constructor(requestDevice: DeviceRequester = requestFelicitaDevice) {
    this.#requestDevice = requestDevice;
  }

  get status(): ScaleStatus {
    return this.#status;
  }

  onWeight(callback: (grams: number, timestampMs: number) => void): () => void {
    this.#weightListeners.add(callback);
    return () => this.#weightListeners.delete(callback);
  }

  onStatusChange(callback: (status: ScaleStatus) => void): () => void {
    this.#statusListeners.add(callback);
    return () => this.#statusListeners.delete(callback);
  }

  async connect(): Promise<void> {
    this.#intentionalDisconnect = false;
    this.#setStatus("CONNECTING");

    try {
      this.#device = await this.#requestDevice();
      this.#device.addEventListener("gattserverdisconnected", this.#handleDisconnect);
      await this.#openGatt();
      this.#retryIndex = 0;
    } catch (error) {
      this.#setStatus("DISCONNECTED");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.#intentionalDisconnect = true;
    this.#clearRetry();
    if (this.#device?.gatt?.connected) this.#device.gatt.disconnect();
    this.#characteristic = null;
    this.#setStatus("DISCONNECTED");
  }

  tare(): Promise<void> {
    return this.#send(COMMAND.TARE);
  }

  startTimer(): Promise<void> {
    return this.#send(COMMAND.TIMER_START);
  }

  stopTimer(): Promise<void> {
    return this.#send(COMMAND.TIMER_STOP);
  }

  resetTimer(): Promise<void> {
    return this.#send(COMMAND.TIMER_RESET);
  }

  // --- 내부 ---

  async #openGatt(): Promise<void> {
    const gatt = this.#device?.gatt;
    if (!gatt) throw new Error("GATT를 사용할 수 없는 기기입니다");

    const server = await gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(CHAR_UUID);

    await characteristic.startNotifications();
    characteristic.addEventListener("characteristicvaluechanged", this.#handleNotification);

    this.#characteristic = characteristic;
    this.#setStatus("CONNECTED");
  }

  #handleNotification = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;

    const grams = parseWeight(value);
    // 저울은 같은 채널로 타이머·모드 패킷도 보냅니다. parseWeight가 헤더로 걸러 NaN을 냅니다.
    if (Number.isNaN(grams)) return;

    // 시각은 수신 시점 기준. 곡선의 x축이 되므로 벽시계가 아니라 단조 증가하는 값을 씁니다.
    const timestampMs = performance.now();
    for (const listener of this.#weightListeners) listener(grams, timestampMs);
  };

  #handleDisconnect = (): void => {
    this.#characteristic = null;
    if (this.#intentionalDisconnect) return;

    this.#setStatus("RECONNECTING");
    this.#scheduleRetry();
  };

  #scheduleRetry(): void {
    this.#clearRetry();
    const delay = RETRY_DELAYS_MS[Math.min(this.#retryIndex, RETRY_DELAYS_MS.length - 1)];
    this.#retryIndex += 1;

    this.#retryTimer = setTimeout(async () => {
      if (this.#intentionalDisconnect) return;
      try {
        // 기기 선택창 없이 다시 붙습니다. 사용자 제스처가 필요한 것은 최초 연결뿐입니다.
        await this.#openGatt();
        this.#retryIndex = 0;
      } catch {
        this.#scheduleRetry();
      }
    }, delay);
  }

  #clearRetry(): void {
    if (this.#retryTimer === null) return;
    clearTimeout(this.#retryTimer);
    this.#retryTimer = null;
  }

  async #send(code: number): Promise<void> {
    const characteristic = this.#characteristic;
    if (!characteristic) throw new Error("저울이 연결되어 있지 않습니다");

    const payload = new Uint8Array([code]);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(payload);
    } else {
      await characteristic.writeValue(payload);
    }
  }

  #setStatus(status: ScaleStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    for (const listener of this.#statusListeners) listener(status);
  }
}
