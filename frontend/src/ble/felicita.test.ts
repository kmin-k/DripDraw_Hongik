import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FelicitaArcSource } from "./felicita";

/** 실측 캡처 패킷 (docs/scale-protocol.md) */
const PACKET_398_9 = [
  0x01, 0x02, 0x2b, 0x30, 0x33, 0x39, 0x38, 0x39, 0x30,
  0x20, 0x67, 0x43, 0x68, 0x4d, 0x22, 0x89, 0x0d, 0x0a,
];
/** 헤더가 01 02가 아닌 패킷. 저울이 타이머·모드 전환 때 보냅니다. */
const PACKET_NOT_WEIGHT = [0x03, 0x0a, ...PACKET_398_9.slice(2)];

class FakeCharacteristic {
  properties = { writeWithoutResponse: true };
  value: DataView | undefined;
  written: number[] = [];
  listeners: ((event: Event) => void)[] = [];

  startNotifications = vi.fn(async () => this);

  addEventListener(type: string, cb: (event: Event) => void) {
    if (type === "characteristicvaluechanged") this.listeners.push(cb);
  }

  async writeValueWithoutResponse(data: Uint8Array) {
    this.written.push(data[0]);
  }
  async writeValue(data: Uint8Array) {
    this.written.push(data[0]);
  }

  emit(bytes: number[]) {
    this.value = new DataView(new Uint8Array(bytes).buffer);
    for (const cb of this.listeners) cb({ target: this } as unknown as Event);
  }
}

class FakeDevice {
  name = "FELICITA";
  characteristic = new FakeCharacteristic();
  connectCalls = 0;
  failNextConnect = false;
  #disconnectListeners: (() => void)[] = [];

  gatt = {
    connected: false,
    connect: async () => {
      this.connectCalls += 1;
      if (this.failNextConnect) {
        this.failNextConnect = false;
        throw new Error("connect failed");
      }
      this.gatt.connected = true;
      return {
        getPrimaryService: async () => ({
          getCharacteristic: async () => this.characteristic,
        }),
      };
    },
    disconnect: () => {
      this.gatt.connected = false;
    },
  };

  addEventListener(type: string, cb: () => void) {
    if (type === "gattserverdisconnected") this.#disconnectListeners.push(cb);
  }

  /** 저울 전원이 꺼지거나 통신 범위를 벗어난 상황 */
  dropConnection() {
    this.gatt.connected = false;
    for (const cb of this.#disconnectListeners) cb();
  }
}

function createSource() {
  const device = new FakeDevice();
  const source = new FelicitaArcSource(async () => device as unknown as BluetoothDevice);
  return { device, source };
}

describe("FelicitaArcSource", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("연결하면 상태가 CONNECTED가 되고 notify를 구독한다", async () => {
    const { device, source } = createSource();
    expect(source.status).toBe("DISCONNECTED");

    await source.connect();

    expect(source.status).toBe("CONNECTED");
    expect(device.characteristic.startNotifications).toHaveBeenCalled();
  });

  it("무게 패킷을 g 단위로 전달한다", async () => {
    const { device, source } = createSource();
    const seen: number[] = [];
    source.onWeight((grams) => seen.push(grams));

    await source.connect();
    device.characteristic.emit(PACKET_398_9);

    expect(seen).toEqual([398.9]);
  });

  it("무게가 아닌 패킷은 전달하지 않는다", async () => {
    const { device, source } = createSource();
    const seen: number[] = [];
    source.onWeight((grams) => seen.push(grams));

    await source.connect();
    device.characteristic.emit(PACKET_NOT_WEIGHT);

    // 걸러내지 않으면 곡선에 이상값이 찍힙니다.
    expect(seen).toEqual([]);
  });

  it("구독을 해제하면 더 이상 받지 않는다", async () => {
    const { device, source } = createSource();
    const seen: number[] = [];
    const unsubscribe = source.onWeight((grams) => seen.push(grams));

    await source.connect();
    device.characteristic.emit(PACKET_398_9);
    unsubscribe();
    device.characteristic.emit(PACKET_398_9);

    expect(seen).toHaveLength(1);
  });

  it("명령 5종이 약속된 바이트를 보낸다", async () => {
    const { device, source } = createSource();
    await source.connect();

    await source.tare();
    await source.startTimer();
    await source.stopTimer();
    await source.resetTimer();

    // 'T' 'R' 'S' 'C'
    expect(device.characteristic.written).toEqual([0x54, 0x52, 0x53, 0x43]);
  });

  it("연결 전에 명령을 보내면 거부한다", async () => {
    const { source } = createSource();
    await expect(source.tare()).rejects.toThrow("연결되어 있지 않습니다");
  });

  describe("자동 재연결", () => {
    it("예기치 않게 끊기면 RECONNECTING 후 다시 붙는다", async () => {
      const { device, source } = createSource();
      const statuses: string[] = [];
      source.onStatusChange((s) => statuses.push(s));

      await source.connect();
      device.dropConnection();

      expect(source.status).toBe("RECONNECTING");

      await vi.advanceTimersByTimeAsync(500);

      expect(source.status).toBe("CONNECTED");
      expect(statuses).toEqual(["CONNECTING", "CONNECTED", "RECONNECTING", "CONNECTED"]);
    });

    it("재연결에 실패하면 간격을 늘려 다시 시도한다", async () => {
      const { device, source } = createSource();
      await source.connect();
      const callsAfterConnect = device.connectCalls;

      device.failNextConnect = true;
      device.dropConnection();

      await vi.advanceTimersByTimeAsync(500); // 1차 시도 → 실패
      expect(source.status).toBe("RECONNECTING");

      await vi.advanceTimersByTimeAsync(1000); // 2차 시도 → 성공
      expect(source.status).toBe("CONNECTED");
      expect(device.connectCalls).toBe(callsAfterConnect + 2);
    });

    it("사용자가 직접 끊으면 재연결하지 않는다", async () => {
      const { device, source } = createSource();
      await source.connect();
      const callsAfterConnect = device.connectCalls;

      await source.disconnect();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(source.status).toBe("DISCONNECTED");
      expect(device.connectCalls).toBe(callsAfterConnect);
    });
  });
});
