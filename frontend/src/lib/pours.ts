/**
 * 목표 곡선에서 "여기까지 부으면 된다"는 지점을 뽑습니다.
 *
 * 곡선은 오르막(붓는 중)과 평지(기다리는 중)가 번갈아 나옵니다.
 * 사용자가 알아야 하는 건 **오르막이 끝나 평지로 꺾이는 지점** — 몇 초에 몇 g까지인지입니다.
 *
 * 주수 계획(`pours`)을 쓰지 않고 곡선에서 직접 찾는 이유는, 직접 부은 추출을 저장한
 * 레시피(RECORDED)에는 주수 계획이 없기 때문입니다. 곡선은 어느 쪽에나 있습니다.
 */

import type { Curve, CurvePoint } from "./rmse";

export interface PourTarget {
  /** 이 시각까지 */
  sec: number;
  /** 이 무게까지 붓습니다 (누적) */
  gram: number;
  /** 몇 번째 주수인지. 1부터 셉니다. */
  index: number;
}

/**
 * 오르막이 끝나는 지점을 순서대로 돌려줍니다.
 *
 * 마지막 점이 오르막의 끝이면 그것도 포함합니다 — 드립다운 구간이 없는 곡선도 있습니다.
 */
export function pourTargets(target: Curve): PourTarget[] {
  const points = target as readonly CurvePoint[];
  const found: PourTarget[] = [];

  for (let i = 1; i < points.length; i++) {
    const rose = points[i][1] > points[i - 1][1];
    if (!rose) continue;

    // 다음 구간이 평평하거나(기다림) 곡선이 끝나면, 여기가 이번 주수의 끝입니다.
    const isLast = i === points.length - 1;
    const flatNext = !isLast && points[i + 1][1] <= points[i][1];
    if (isLast || flatNext) {
      found.push({ sec: points[i][0], gram: points[i][1], index: found.length + 1 });
    }
  }

  return found;
}

/**
 * 지금 시각 기준으로 다음에 맞춰야 할 지점.
 *
 * 이미 지난 지점은 건너뜁니다. 전부 지났으면 null — 더 부을 것이 없다는 뜻입니다.
 */
export function nextPourTarget(targets: PourTarget[], elapsedSec: number): PourTarget | null {
  return targets.find((t) => t.sec > elapsedSec) ?? null;
}
