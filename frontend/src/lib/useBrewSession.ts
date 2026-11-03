import { useCallback, useEffect, useRef, useState } from "react";

import type { ScaleSource } from "../ble/types";
import { createRmseAccumulator, interpolateAt, type Curve, type CurvePoint } from "./rmse";

/**
 * 추출 세션 — 저울 패킷을 곡선으로 쌓고 정확도를 실시간으로 냅니다.
 *
 * 설계 요지
 * - **적재와 렌더링을 분리합니다.** 패킷마다 그래프를 다시 그리면 205초 × 9.3Hz ≈ 1,900점에서
 *   화면이 버벅입니다. 데이터는 ref에 쌓고 그래프는 CHART_HZ로 묶어 갱신합니다.
 * - **시계를 타이머로 돌리지 않습니다.** setInterval은 백그라운드 탭에서 1초로 강제되므로,
 *   패킷이 도착한 시각으로 경과 시간을 계산합니다.
 * - **무게는 시작 시점을 기준으로 뺍니다.** 저울은 드리퍼·필터·원두를 함께 재기 때문에
 *   빼지 않으면 곡선이 통째로 위로 밀립니다.
 */

export type BrewPhase = "IDLE" | "RUNNING" | "PAUSED" | "FINISHED";

/**
 * 지금까지의 최고 무게보다 이만큼 떨어지면 추출이 끝난 것으로 봅니다 (g).
 *
 * 부은 물은 줄지 않으므로 큰 하락은 드리퍼를 들어올렸거나 저울 영점을 누른 것입니다.
 * 둘 다 기준 무게를 잃어 **그 뒤** 값은 믿을 수 없지만, 그 전까지는 온전한 기록입니다.
 * 드리퍼를 드는 건 보통 추출을 마쳤다는 뜻이라 거기서 끝내고 저장합니다.
 *
 * 직전 패킷이 아니라 최고 무게와 비교합니다. 천천히 들어올리면 한 패킷 사이 하락은 작아서
 * 직전 값과 비교하면 끝까지 못 잡고 곡선이 바닥까지 끌려 내려갑니다.
 * 저울 진동은 ±1 g 안이라 30 g이면 넉넉히 구분됩니다.
 */
export const DROP_END_G = 30;

/** 들어올리는 동안 쌓인 꼬리를 잘라낼 기준 (g). 물 줄기가 끊길 때의 흔들림보다 크게 잡습니다. */
const TAIL_TRIM_G = 5;

/** 최고 무게 대비 이번 무게가 크게 떨어졌는지. 첫 패킷(peak가 없음)은 판단하지 않습니다. */
export function isWeightDropped(peakG: number | null, currentG: number): boolean {
  return peakG !== null && peakG - currentG >= DROP_END_G;
}

/**
 * 드리퍼를 들어올리는 동안 기록된 내리막을 잘라냅니다.
 *
 * 감지 문턱(30 g)에 닿기 전 패킷 몇 개는 이미 곡선에 들어가 있어, 두면 끝이 아래로 꺾입니다.
 * 최고 무게보다 TAIL_TRIM_G 넘게 낮은 끝 점들을 버립니다. 원점은 항상 남깁니다.
 */
export function trimDropTail(samples: CurvePoint[], peakPouredG: number): CurvePoint[] {
  let end = samples.length;
  while (end > 1 && samples[end - 1][1] < peakPouredG - TAIL_TRIM_G) end--;
  return samples.slice(0, end);
}

/** 그래프 갱신 주기(ms). 숫자 표시는 매 패킷, 그래프만 묶어서 그립니다. */
const CHART_INTERVAL_MS = 200;
/** 화면에 그릴 최대 점 개수. 저장은 항상 원본 전체입니다. */
const CHART_MAX_POINTS = 200;

export interface ChartRow {
  sec: number;
  actual: number | null;
  target: number | null;
}

/** 화면용으로만 솎아냅니다. 마지막 점은 항상 남겨 현재 위치가 보이게 합니다. */
export function downsample(samples: CurvePoint[], max: number): CurvePoint[] {
  if (samples.length <= max) return samples;
  const stride = Math.ceil(samples.length / max);
  const out = samples.filter((_, i) => i % stride === 0);
  const last = samples[samples.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export interface SampleContext {
  /** 시작 직후 첫 패킷의 무게. 드리퍼·필터·원두 무게를 상쇄합니다. */
  baselineG: number;
  /** 시작 버튼을 누른 시각 (performance.now 기준) */
  startedAtMs: number;
  /** 일시정지로 흘려보낸 시간의 합 */
  pausedTotalMs: number;
}

/**
 * 저울 패킷 하나를 곡선 위의 점으로 바꿉니다.
 *
 * 두 가지를 동시에 처리합니다.
 * - **무게**: 저울은 드리퍼·필터·원두를 함께 잽니다. 기준점을 빼야 "부은 물의 양"이 됩니다.
 * - **시간**: 저울 타임스탬프는 브라우저 기동 이후 값이라, 시작 시각과 정지 시간을 빼야
 *   추출 경과 시간이 됩니다.
 *
 * 시작 이전 패킷은 null입니다.
 */
export function toSample(
  grams: number,
  timestampMs: number,
  ctx: SampleContext,
): CurvePoint | null {
  const elapsedSec = (timestampMs - ctx.startedAtMs - ctx.pausedTotalMs) / 1000;
  if (elapsedSec < 0) return null;
  return [elapsedSec, grams - ctx.baselineG];
}

export function useBrewSession(source: ScaleSource, target: Curve) {
  const [phase, setPhase] = useState<BrewPhase>("IDLE");
  // 매 패킷 갱신 — 텍스트라 비용이 작습니다.
  // 측정 개수도 여기 둡니다. 렌더 중에 ref를 읽으면 값이 어긋날 수 있습니다.
  const [live, setLive] = useState({
    elapsedSec: 0,
    weightG: 0,
    rmse: null as number | null,
    sampleCount: 0,
  });
  // CHART_INTERVAL_MS마다 갱신 — 그리기 비용이 큰 쪽.
  const [chartSamples, setChartSamples] = useState<CurvePoint[]>([]);
  /** 무게가 크게 빠져 저절로 끝났는지. 화면이 그 사실을 알려야 합니다. */
  const [endedByDrop, setEndedByDrop] = useState(false);

  const phaseRef = useRef<BrewPhase>("IDLE");
  const samplesRef = useRef<CurvePoint[]>([]);
  const accRef = useRef(createRmseAccumulator(target));
  const startedAtMsRef = useRef(0);
  const pausedTotalMsRef = useRef(0);
  const pauseStartedMsRef = useRef(0);
  // 서버에 보낼 실제 시각. 곡선의 x축은 performance.now 기반 상대 시간이라 별개입니다.
  const startedAtIsoRef = useRef<string | null>(null);
  const endedAtIsoRef = useRef<string | null>(null);
  /** 시작 직후 첫 패킷의 무게. 이후 모든 무게에서 뺍니다. */
  const baselineRef = useRef<number | null>(null);
  /** 지금까지의 최고 원본 무게(기준을 빼기 전). 급락 감지용. */
  const peakRawGRef = useRef<number | null>(null);
  /** 저절로 끝났을 때 화면이 할 일(저울 타이머 정지·저장). 패킷 콜백 안에서 부르므로 ref로 둡니다. */
  const onDropEndRef = useRef<(() => void) | null>(null);
  const chartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const changePhase = useCallback((next: BrewPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // 목표가 바뀌면 누적기도 새 목표로 갈아끼웁니다. 단 추출 중에는 바꾸지 않습니다 —
  // 바꾸면 그때까지 쌓은 정확도가 사라지고 앞부분은 옛 목표, 뒷부분은 새 목표로 계산됩니다.
  // 새 목표는 다음 시작(start) 때 적용됩니다.
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
    if (phaseRef.current === "RUNNING" || phaseRef.current === "PAUSED") return;
    accRef.current = createRmseAccumulator(target);
  }, [target]);

  const flushChart = useCallback(() => {
    chartTimerRef.current = null;
    setChartSamples(downsample(samplesRef.current, CHART_MAX_POINTS));
  }, []);

  const scheduleChart = useCallback(() => {
    if (chartTimerRef.current) return;
    chartTimerRef.current = setTimeout(flushChart, CHART_INTERVAL_MS);
  }, [flushChart]);

  /** 무게가 크게 빠졌을 때 — 내리막 꼬리를 잘라내고 거기서 끝냅니다. */
  const endByDrop = useCallback(
    (peakPouredG: number) => {
      const kept = trimDropTail(samplesRef.current, peakPouredG);
      samplesRef.current = kept;
      // 잘라낸 점이 이미 정확도에 들어가 있으니 남은 점으로 다시 셉니다. 2,000점 안팎이라 가볍습니다.
      accRef.current.reset();
      for (const [sec, gram] of kept) accRef.current.add(sec, gram);

      const [elapsedSec, poured] = kept[kept.length - 1];
      setLive({
        elapsedSec,
        weightG: poured,
        rmse: accRef.current.value,
        sampleCount: kept.length,
      });
      endedAtIsoRef.current = new Date().toISOString();
      setEndedByDrop(true);
      changePhase("FINISHED");
      flushChart();
      onDropEndRef.current?.();
    },
    [changePhase, flushChart],
  );

  // 저울 패킷을 직접 구독합니다. state를 거치면 배칭 과정에서 패킷이 유실될 수 있습니다.
  useEffect(() => {
    return source.onWeight((grams, timestampMs) => {
      if (phaseRef.current !== "RUNNING") return;

      if (baselineRef.current === null) baselineRef.current = grams;

      // 드리퍼를 들거나 영점을 누르면 기준 무게를 잃습니다. 그 전까지만 기록으로 남기고
      // 여기서 끝냅니다. 자동으로 기준을 다시 잡아 이어가지 않습니다 — 그러면 곡선이 그
      // 시점부터 통째로 밀려 정확도가 뜻을 잃는데, 화면은 멀쩡해 보여 더 위험합니다.
      if (isWeightDropped(peakRawGRef.current, grams)) {
        const peakPoured = (peakRawGRef.current ?? grams) - baselineRef.current;
        peakRawGRef.current = null;
        endByDrop(peakPoured);
        return;
      }
      peakRawGRef.current = Math.max(peakRawGRef.current ?? grams, grams);

      const sample = toSample(grams, timestampMs, {
        baselineG: baselineRef.current,
        startedAtMs: startedAtMsRef.current,
        pausedTotalMs: pausedTotalMsRef.current,
      });
      if (!sample) return;

      const [elapsedSec, poured] = sample;
      samplesRef.current.push(sample);
      accRef.current.add(elapsedSec, poured);

      setLive({
        elapsedSec,
        weightG: poured,
        rmse: accRef.current.value,
        sampleCount: samplesRef.current.length,
      });
      scheduleChart();
    });
  }, [source, scheduleChart, endByDrop]);

  useEffect(() => {
    return () => {
      if (chartTimerRef.current) clearTimeout(chartTimerRef.current);
    };
  }, []);

  const start = useCallback(() => {
    // 원점을 미리 심습니다. 첫 패킷은 최대 한 주기(약 107ms) 뒤에 오고,
    // 시작 버튼을 누른 뒤 주전자를 잡는 몇 초가 더 걸리기도 합니다.
    // 심지 않으면 목표는 (0,0)에서 시작하는데 실측만 뒤에서 시작해 곡선이 어긋나 보이고,
    // 그 빈 구간이 정확도 계산에서도 빠집니다.
    samplesRef.current = [[0, 0]];
    accRef.current = createRmseAccumulator(targetRef.current);
    accRef.current.add(0, 0);
    baselineRef.current = null;
    peakRawGRef.current = null;
    setEndedByDrop(false);
    startedAtMsRef.current = performance.now();
    startedAtIsoRef.current = new Date().toISOString();
    endedAtIsoRef.current = null;
    pausedTotalMsRef.current = 0;
    setLive({ elapsedSec: 0, weightG: 0, rmse: 0, sampleCount: 1 });
    setChartSamples(samplesRef.current);
    changePhase("RUNNING");
  }, [changePhase]);

  const pause = useCallback(() => {
    if (phaseRef.current !== "RUNNING") return;
    pauseStartedMsRef.current = performance.now();
    changePhase("PAUSED");
  }, [changePhase]);

  const resume = useCallback(() => {
    if (phaseRef.current !== "PAUSED") return;
    // 멈춰 있던 만큼을 빼야 시간축이 실제 추출 시간을 유지합니다.
    pausedTotalMsRef.current += performance.now() - pauseStartedMsRef.current;
    changePhase("RUNNING");
  }, [changePhase]);

  const finish = useCallback(() => {
    endedAtIsoRef.current = new Date().toISOString();
    changePhase("FINISHED");
    flushChart();
  }, [changePhase, flushChart]);

  const reset = useCallback(() => {
    samplesRef.current = [];
    accRef.current.reset();
    baselineRef.current = null;
    peakRawGRef.current = null;
    setEndedByDrop(false);
    pausedTotalMsRef.current = 0;
    setLive({ elapsedSec: 0, weightG: 0, rmse: null, sampleCount: 0 });
    setChartSamples([]);
    changePhase("IDLE");
  }, [changePhase]);

  /** 무게가 빠져 저절로 끝났을 때 부를 콜백을 등록합니다. 화면이 타이머를 멈추고 저장하는 데 씁니다. */
  const onDropEnd = useCallback((callback: (() => void) | null) => {
    onDropEndRef.current = callback;
  }, []);

  /** 저장용 원본. 호출 시점에 읽으므로 렌더 중 ref 접근이 아닙니다. */
  const getSamples = useCallback(() => samplesRef.current, []);

  /** 서버에 보낼 기록. 실제 측정이 없으면(원점만 있으면) null입니다. */
  const getRecord = useCallback(() => {
    const samples = samplesRef.current;
    if (samples.length < 2 || !startedAtIsoRef.current) return null;
    return {
      startedAt: startedAtIsoRef.current,
      endedAt: endedAtIsoRef.current ?? new Date().toISOString(),
      actualCurve: samples,
    };
  }, []);

  // 목표선은 실측이 없는 구간에도 보여야 하므로 목표 꼭짓점을 함께 넣습니다.
  const chartData: ChartRow[] = [
    ...chartSamples.map(([sec, actual]) => ({
      sec,
      actual,
      target: target.length ? interpolateAt(target, sec) : null,
    })),
    ...target.map(([sec, gram]) => ({ sec, actual: null, target: gram })),
  ].sort((a, b) => a.sec - b.sec);

  return {
    phase,
    elapsedSec: live.elapsedSec,
    weightG: live.weightG,
    rmse: live.rmse,
    sampleCount: live.sampleCount,
    chartData,
    /** 저장용 원본. 다운샘플링하지 않습니다 (docs/api.md). */
    getSamples,
    getRecord,
    hasTarget: target.length > 0,
    endedByDrop,
    onDropEnd,
    start,
    pause,
    resume,
    finish,
    reset,
  };
}
