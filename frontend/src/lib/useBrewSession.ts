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

  const phaseRef = useRef<BrewPhase>("IDLE");
  const samplesRef = useRef<CurvePoint[]>([]);
  const accRef = useRef(createRmseAccumulator(target));
  const startedAtMsRef = useRef(0);
  const pausedTotalMsRef = useRef(0);
  const pauseStartedMsRef = useRef(0);
  /** 시작 직후 첫 패킷의 무게. 이후 모든 무게에서 뺍니다. */
  const baselineRef = useRef<number | null>(null);
  const chartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 목표가 바뀌면 누적기도 새 목표로 갈아끼웁니다.
  useEffect(() => {
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

  // 저울 패킷을 직접 구독합니다. state를 거치면 배칭 과정에서 패킷이 유실될 수 있습니다.
  useEffect(() => {
    return source.onWeight((grams, timestampMs) => {
      if (phaseRef.current !== "RUNNING") return;

      if (baselineRef.current === null) baselineRef.current = grams;

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
  }, [source, scheduleChart]);

  useEffect(() => {
    return () => {
      if (chartTimerRef.current) clearTimeout(chartTimerRef.current);
    };
  }, []);

  const changePhase = useCallback((next: BrewPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const start = useCallback(() => {
    samplesRef.current = [];
    accRef.current.reset();
    baselineRef.current = null;
    startedAtMsRef.current = performance.now();
    pausedTotalMsRef.current = 0;
    setLive({ elapsedSec: 0, weightG: 0, rmse: null, sampleCount: 0 });
    setChartSamples([]);
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
    changePhase("FINISHED");
    flushChart();
  }, [changePhase, flushChart]);

  const reset = useCallback(() => {
    samplesRef.current = [];
    accRef.current.reset();
    baselineRef.current = null;
    pausedTotalMsRef.current = 0;
    setLive({ elapsedSec: 0, weightG: 0, rmse: null, sampleCount: 0 });
    setChartSamples([]);
    changePhase("IDLE");
  }, [changePhase]);

  /** 저장용 원본. 호출 시점에 읽으므로 렌더 중 ref 접근이 아닙니다. */
  const getSamples = useCallback(() => samplesRef.current, []);

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
    hasTarget: target.length > 0,
    start,
    pause,
    resume,
    finish,
    reset,
  };
}
