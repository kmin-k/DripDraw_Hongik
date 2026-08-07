import { useCallback, useEffect, useMemo, useState } from "react";

import { FelicitaArcSource } from "./felicita";
import type { ScaleStatus } from "./types";

/**
 * 저울을 React 화면에 붙이는 훅.
 *
 * 무게는 초당 약 9.3회 들어옵니다(실측). 그대로 state에 넣어도 React가 감당하는 빈도라
 * 별도 스로틀링을 두지 않았습니다. Phase 2에서 곡선을 그릴 때는 여기가 아니라
 * 곡선 데이터 적재 쪽에서 샘플링 간격을 다룹니다.
 */
export function useScale() {
  const source = useMemo(() => new FelicitaArcSource(), []);

  const [status, setStatus] = useState<ScaleStatus>(source.status);
  const [weight, setWeight] = useState<number | null>(null);
  const [packetCount, setPacketCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offWeight = source.onWeight((grams) => {
      setWeight(grams);
      setPacketCount((n) => n + 1);
    });
    const offStatus = source.onStatusChange(setStatus);
    return () => {
      offWeight();
      offStatus();
    };
  }, [source]);

  // 화면을 떠나면 연결을 정리합니다. 남겨두면 다른 화면에서 다시 연결할 때 충돌합니다.
  useEffect(() => {
    return () => {
      void source.disconnect();
    };
  }, [source]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      await source.connect();
    } catch (err) {
      // 사용자가 기기 선택창을 닫은 경우도 여기로 옵니다. 오류로 취급하지 않습니다.
      const message = err instanceof Error ? err.message : String(err);
      setError(/cancel|User cancelled|NotFoundError/i.test(message) ? null : message);
    }
  }, [source]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return {
    /** 추출 세션이 패킷을 직접 구독하기 위해 노출합니다. state를 거치면 패킷이 유실될 수 있습니다. */
    source,
    status,
    weight,
    packetCount,
    error,
    isSupported: typeof navigator !== "undefined" && !!navigator.bluetooth,
    connect,
    disconnect: () => run(() => source.disconnect()),
    tare: () => run(() => source.tare()),
    startTimer: () => run(() => source.startTimer()),
    stopTimer: () => run(() => source.stopTimer()),
    resetTimer: () => run(() => source.resetTimer()),
  };
}
