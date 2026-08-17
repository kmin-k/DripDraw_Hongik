/**
 * 목표 곡선에서 주수 구간을 뽑습니다.
 *
 * 곡선은 오르막(붓는 중)과 평지(기다리는 중)가 번갈아 나옵니다.
 * 사용자가 알아야 하는 건 두 가지 — **언제 붓기 시작하고, 얼마까지 부으면 되는지**입니다.
 *
 * 주수 계획(`pours`)을 쓰지 않고 곡선에서 직접 찾는 이유는, 직접 부은 추출을 저장한
 * 레시피(RECORDED)에는 주수 계획이 없기 때문입니다. 곡선은 어느 쪽에나 있습니다.
 */

import type { Curve, CurvePoint } from "./rmse";

export interface PourTarget {
  /** 붓기 시작하는 시각 */
  startSec: number;
  /** 붓기 시작 시점의 누적 물량 */
  startGram: number;
  /** 붓기를 끝내는 시각 */
  sec: number;
  /** 여기까지 붓습니다 (누적) */
  gram: number;
  /** 몇 번째 주수인지. 1부터 셉니다. */
  index: number;
}

/**
 * 오르막 구간을 순서대로 돌려줍니다.
 *
 * 오르막이 여러 점에 걸쳐 이어져도 **한 번의 주수로 묶습니다.**
 * 중간에 점이 더 있다고 주수가 늘어나는 것은 아닙니다.
 */
export function pourTargets(target: Curve): PourTarget[] {
  const points = target as readonly CurvePoint[];
  const found: PourTarget[] = [];

  let i = 0;
  while (i < points.length - 1) {
    if (points[i + 1][1] <= points[i][1]) {
      i += 1; // 평지이거나 내려갑니다. 붓는 중이 아닙니다.
      continue;
    }

    const start = i;
    while (i < points.length - 1 && points[i + 1][1] > points[i][1]) i += 1;

    found.push({
      startSec: points[start][0],
      startGram: points[start][1],
      sec: points[i][0],
      gram: points[i][1],
      index: found.length + 1,
    });
  }

  return found;
}

/**
 * 지금 시각 기준으로 다음에 맞춰야 할 주수.
 *
 * 붓기를 끝내야 하는 시각이 아직 남은 것 중 첫 번째입니다.
 * 전부 지났으면 null — 더 부을 것이 없다는 뜻입니다.
 */
export function nextPourTarget(targets: PourTarget[], elapsedSec: number): PourTarget | null {
  return targets.find((t) => t.sec > elapsedSec) ?? null;
}
