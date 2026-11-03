import { describe, expect, it } from "vitest";

import type { CurvePoint } from "./rmse";
import { DROP_END_G, downsample, isWeightDropped, toSample, trimDropTail } from "./useBrewSession";

describe("toSample — 저울 패킷을 곡선 위의 점으로", () => {
  const START = 10_000; // performance.now 기준 시작 시각

  it("드리퍼 무게를 빼서 '부은 물의 양'만 남긴다", () => {
    // 드리퍼·필터·원두가 350 g. 물 100 g을 부어 저울은 450 g.
    const sample = toSample(450, START + 5000, {
      baselineG: 350,
      startedAtMs: START,
      pausedTotalMs: 0,
    });
    // 빼지 않으면 목표 100 g에 대해 450이 찍혀 RMSE가 통째로 망가집니다.
    expect(sample).toEqual([5, 100]);
  });

  it("영점을 눌러 기준점이 0이면 그대로 통과한다", () => {
    expect(
      toSample(100, START + 1000, { baselineG: 0, startedAtMs: START, pausedTotalMs: 0 }),
    ).toEqual([1, 100]);
  });

  it("시작 시각을 빼서 경과 시간으로 바꾼다", () => {
    const [sec] = toSample(0, START + 77_000, {
      baselineG: 0,
      startedAtMs: START,
      pausedTotalMs: 0,
    })!;
    expect(sec).toBe(77);
  });

  it("일시정지한 시간만큼 시간축이 밀리지 않는다", () => {
    // 시작 후 60초 지점에서 30초 멈췄다가 재개 → 실제 경과는 60초여야 합니다.
    const [sec] = toSample(0, START + 90_000, {
      baselineG: 0,
      startedAtMs: START,
      pausedTotalMs: 30_000,
    })!;
    expect(sec).toBe(60);
  });

  it("음수 무게도 그대로 전달한다", () => {
    // 추출 중 드리퍼를 살짝 들면 음수가 됩니다. 걸러내면 곡선에 구멍이 생깁니다.
    expect(
      toSample(340, START + 1000, { baselineG: 350, startedAtMs: START, pausedTotalMs: 0 }),
    ).toEqual([1, -10]);
  });

  it("시작 이전 패킷은 버린다", () => {
    expect(
      toSample(0, START - 500, { baselineG: 0, startedAtMs: START, pausedTotalMs: 0 }),
    ).toBeNull();
  });
});

describe("downsample — 화면용 솎아내기", () => {
  const make = (n: number): CurvePoint[] =>
    Array.from({ length: n }, (_, i) => [i * 0.1, i] as CurvePoint);

  it("한도 이하면 원본을 그대로 쓴다", () => {
    const samples = make(50);
    expect(downsample(samples, 200)).toBe(samples);
  });

  it("한도를 넘으면 줄인다", () => {
    // 205초 × 9.3Hz ≈ 1,900점. 매 패킷 그리면 화면이 버벅입니다.
    expect(downsample(make(1900), 200).length).toBeLessThanOrEqual(201);
  });

  it("마지막 점은 반드시 남긴다", () => {
    const samples = make(1900);
    const out = downsample(samples, 200);
    // 현재 위치가 안 보이면 곡선이 뒤처져 보입니다.
    expect(out[out.length - 1]).toBe(samples[samples.length - 1]);
  });

  it("첫 점도 남긴다", () => {
    const samples = make(1900);
    expect(downsample(samples, 200)[0]).toBe(samples[0]);
  });

  it("시간 순서를 유지한다", () => {
    const times = downsample(make(1900), 200).map(([t]) => t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe("isWeightDropped — 드리퍼 들어올림·저울 영점 감지", () => {
  it("첫 패킷은 비교 대상이 없어 판단하지 않는다", () => {
    expect(isWeightDropped(null, 0)).toBe(false);
  });

  it("★ 드리퍼를 들면 무게가 통째로 빠진다", () => {
    // 드리퍼 350 g + 물 300 g = 650 g에서 들어올림 → 저울에는 서버만 남습니다.
    expect(isWeightDropped(650, 200)).toBe(true);
  });

  it("영점을 눌러도 같은 이유로 끝낸다", () => {
    expect(isWeightDropped(470, 0.3)).toBe(true);
  });

  it("저울 진동 정도의 흔들림은 넘어간다", () => {
    // 주전자를 올려놓거나 손이 닿으면 ±1~2 g 정도 흔들립니다.
    expect(isWeightDropped(470, 468.5)).toBe(false);
  });

  it("문턱 바로 아래는 통과, 문턱부터 종료", () => {
    expect(isWeightDropped(100, 100 - DROP_END_G + 0.1)).toBe(false);
    expect(isWeightDropped(100, 100 - DROP_END_G)).toBe(true);
  });

  it("무게가 늘어나는 것은 언제나 정상이다", () => {
    expect(isWeightDropped(100, 400)).toBe(false);
  });
});

describe("trimDropTail — 들어올리는 동안의 내리막 제거", () => {
  it("★ 최고점 뒤로 꺾여 내려간 점을 버린다", () => {
    // 300 g에서 천천히 들어올려 280·255까지 기록된 뒤 감지된 경우
    const samples: CurvePoint[] = [
      [0, 0],
      [100, 299.5],
      [150, 300],
      [150.1, 280],
      [150.2, 255],
    ];
    expect(trimDropTail(samples, 300)).toEqual([
      [0, 0],
      [100, 299.5],
      [150, 300],
    ]);
  });

  it("물이 빠지는 동안의 작은 흔들림은 남긴다", () => {
    const samples: CurvePoint[] = [
      [0, 0],
      [150, 300],
      [160, 298.2],
    ];
    expect(trimDropTail(samples, 300)).toEqual(samples);
  });

  it("원점은 항상 남는다", () => {
    expect(trimDropTail([[0, 0]], 300)).toEqual([[0, 0]]);
  });
});
