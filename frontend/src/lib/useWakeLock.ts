import { useEffect } from "react";

/**
 * 추출 중 화면 꺼짐 방지.
 *
 * 폰 화면이 꺼지면 Chrome이 백그라운드로 가서 저울 연결이 끊길 수 있습니다. 3분 추출 동안
 * 손은 주전자를 잡고 있어 화면을 건드리지 않으므로, 절전 시간이 짧으면 실제로 일어납니다.
 *
 * 실패해도 추출에는 지장이 없어 오류를 띄우지 않습니다. 지원하지 않는 브라우저,
 * 배터리 절약 모드, HTTPS가 아닌 접속에서는 그냥 평소처럼 동작합니다.
 */

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockApi {
  request(type: "screen"): Promise<Sentinel>;
}

export interface WakeLockKeeper {
  acquire(): Promise<void>;
  release(): void;
}

export function createWakeLockKeeper(api: WakeLockApi | undefined): WakeLockKeeper {
  let wanted = false;
  let requesting = false;
  let sentinel: Sentinel | null = null;

  return {
    async acquire() {
      wanted = true;
      // 탭이 가려지면 브라우저가 알아서 풀기 때문에, 이미 풀린 것은 다시 요청합니다.
      if (!api || requesting || (sentinel && !sentinel.released)) return;

      requesting = true;
      try {
        const acquired = await api.request("screen");
        // 요청이 도는 사이 추출이 끝났으면 받자마자 돌려줍니다. 안 그러면 계속 켜져 있습니다.
        if (wanted) sentinel = acquired;
        else void acquired.release().catch(() => {});
      } catch {
        sentinel = null;
      } finally {
        requesting = false;
      }
    },

    release() {
      wanted = false;
      void sentinel?.release().catch(() => {});
      sentinel = null;
    },
  };
}

/** active인 동안 화면을 켜 둡니다. 다른 앱을 봤다가 돌아오면 다시 잡습니다. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const api = "wakeLock" in navigator ? (navigator.wakeLock as WakeLockApi) : undefined;
    const keeper = createWakeLockKeeper(api);
    const onVisible = () => {
      if (document.visibilityState === "visible") void keeper.acquire();
    };

    void keeper.acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      keeper.release();
    };
  }, [active]);
}
