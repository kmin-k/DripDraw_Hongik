// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeScale } from "../test/fakeScale";
import { createRmseAccumulator, type Curve } from "./rmse";
import { useBrewSession } from "./useBrewSession";

const CLOCK_MS = 1000;
const TARGET: Curve = [
  [0, 0],
  [10, 100],
  [60, 100],
];
const DRIPPER_G = 350;

describe("추출 세션 시나리오", () => {
  let scale: FakeScale;
  let now: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scale = new FakeScale();
    now = vi.spyOn(performance, "now").mockReturnValue(CLOCK_MS);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function setup(target: Curve = TARGET) {
    return renderHook(({ curve }) => useBrewSession(scale, curve), {
      initialProps: { curve: target },
    });
  }

  /** 시작 후 sec초에 저울이 grams를 보냅니다. */
  function packet(sec: number, grams: number) {
    act(() => scale.emit(grams, CLOCK_MS + sec * 1000));
  }

  function pourTo100() {
    packet(0.1, DRIPPER_G);
    packet(5, DRIPPER_G + 50);
    packet(10, DRIPPER_G + 100);
    packet(30, DRIPPER_G + 100);
  }

  function savedCurve(session: { getRecord: () => { actualCurve: Curve } | null }) {
    return session.getRecord()?.actualCurve;
  }

  it("드리퍼 무게를 빼고 부은 물만 기록한다", () => {
    const { result } = setup();
    act(() => result.current.start());
    pourTo100();

    expect(result.current.weightG).toBe(100);
    expect(savedCurve(result.current)?.at(-1)).toEqual([30, 100]);
  });

  describe("드리퍼 들기", () => {
    it("★ 무게가 빠지면 끝나고, 그 직전까지 저장할 수 있다", () => {
      const { result } = setup();
      const onDropEnd = vi.fn();
      result.current.onDropEnd(onDropEnd);

      act(() => result.current.start());
      pourTo100();
      packet(31, 20);

      expect(result.current.phase).toBe("FINISHED");
      expect(result.current.endedByDrop).toBe(true);
      expect(onDropEnd).toHaveBeenCalledOnce();
      expect(savedCurve(result.current)?.at(-1)).toEqual([30, 100]);
    });

    it("★ 천천히 들어도 잡고, 내려가는 꼬리는 기록에 남기지 않는다", () => {
      const { result } = setup();
      act(() => result.current.start());
      pourTo100();

      // 패킷 하나당 10 g씩. 직전 패킷과 비교했다면 끝까지 못 잡습니다.
      packet(31, DRIPPER_G + 90);
      packet(31.1, DRIPPER_G + 80);
      packet(31.2, DRIPPER_G + 70);

      expect(result.current.phase).toBe("FINISHED");
      expect(savedCurve(result.current)?.at(-1)).toEqual([30, 100]);
    });

    it("정확도를 잘라낸 곡선 기준으로 다시 계산한다", () => {
      const { result } = setup();
      act(() => result.current.start());
      pourTo100();
      packet(31, DRIPPER_G + 80);
      packet(31.1, DRIPPER_G + 60);

      const expected = createRmseAccumulator(TARGET);
      for (const [sec, gram] of savedCurve(result.current) ?? []) expected.add(sec, gram);
      expect(result.current.rmse).toBeCloseTo(expected.value ?? NaN, 10);
    });

    it("끝난 뒤의 패킷은 무시한다", () => {
      const { result } = setup();
      act(() => result.current.start());
      pourTo100();
      packet(31, 20);
      const length = savedCurve(result.current)?.length;

      packet(32, DRIPPER_G + 100);

      expect(savedCurve(result.current)?.length).toBe(length);
    });

    it("다시 시작하면 표시와 기준 무게가 초기화된다", () => {
      const { result } = setup();
      act(() => result.current.start());
      pourTo100();
      packet(31, 20);

      act(() => result.current.reset());
      act(() => result.current.start());
      // 저울에 드리퍼를 다시 올린 무게가 지난번 최고 무게보다 낮아도 끝나면 안 됩니다.
      packet(0.1, DRIPPER_G - 100);

      expect(result.current.phase).toBe("RUNNING");
      expect(result.current.endedByDrop).toBe(false);
      expect(result.current.weightG).toBe(0);
    });
  });

  it("물을 붓다 멈춘 정도의 흔들림으로는 끝나지 않는다", () => {
    const { result } = setup();
    act(() => result.current.start());
    pourTo100();
    packet(31, DRIPPER_G + 97);

    expect(result.current.phase).toBe("RUNNING");
    expect(savedCurve(result.current)?.at(-1)).toEqual([31, 97]);
  });

  it("일시정지한 시간은 경과 시간에서 빠진다", () => {
    const { result } = setup();
    act(() => result.current.start());
    packet(0.1, DRIPPER_G);
    packet(10, DRIPPER_G + 100);

    now.mockReturnValue(CLOCK_MS + 10_000);
    act(() => result.current.pause());
    packet(15, DRIPPER_G + 999); // 멈춘 동안의 패킷은 기록하지 않습니다.
    now.mockReturnValue(CLOCK_MS + 30_000);
    act(() => result.current.resume());
    packet(31, DRIPPER_G + 100);

    expect(savedCurve(result.current)?.at(-1)).toEqual([11, 100]);
  });

  it("★ 저울이 끊겼다 다시 붙으면 같은 추출에 이어서 기록한다", () => {
    const { result } = setup();
    act(() => result.current.start());
    packet(0.1, DRIPPER_G);
    packet(5, DRIPPER_G + 50);

    act(() => scale.setStatus("RECONNECTING"));
    act(() => scale.setStatus("CONNECTED"));
    packet(20, DRIPPER_G + 100);

    // 끊긴 동안도 시간은 흐른 것으로 잡고, 기준 무게도 유지합니다.
    expect(result.current.phase).toBe("RUNNING");
    expect(savedCurve(result.current)?.at(-1)).toEqual([20, 100]);
  });

  it("추출 중 목표가 바뀌어도 정확도를 유지하고, 다음 시작부터 새 목표를 쓴다", () => {
    const { result, rerender } = setup();
    act(() => result.current.start());
    pourTo100();
    const before = result.current.rmse;

    const other: Curve = [
      [0, 0],
      [10, 500],
    ];
    rerender({ curve: other });
    expect(result.current.rmse).toBe(before);

    act(() => result.current.reset());
    act(() => result.current.start());
    packet(0.1, DRIPPER_G);
    packet(10, DRIPPER_G + 100);

    const expected = createRmseAccumulator(other);
    for (const [sec, gram] of savedCurve(result.current) ?? []) expected.add(sec, gram);
    expect(result.current.rmse).toBeCloseTo(expected.value ?? NaN, 10);
  });
});
