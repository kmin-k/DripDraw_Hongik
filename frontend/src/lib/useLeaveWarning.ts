import { useEffect } from "react";

import type { BrewPhase } from "./useBrewSession";

/**
 * 측정 기록은 저장되기 전까지 메모리에만 있어, 페이지를 벗어나면 사라집니다.
 * 추출 중이거나 저장이 끝나지 않은 동안은 나가기 전에 브라우저가 한 번 묻게 합니다.
 */
export function isRecordAtRisk(phase: BrewPhase, saving: boolean, saveFailed: boolean): boolean {
  if (phase === "RUNNING" || phase === "PAUSED") return true;
  return phase === "FINISHED" && (saving || saveFailed);
}

/** active인 동안 새로고침·탭 닫기 전에 확인을 받습니다. 문구는 브라우저가 정합니다. */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
