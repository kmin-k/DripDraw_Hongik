/**
 * 추출 정확도(RMSE) 계산 — docs/api.md "RMSE 정의"
 *
 * 목표 곡선은 8개 점의 구간 선형 곡선이고 실측은 100 ms 샘플링이라 점의 개수와 시각이 다릅니다.
 * 실측 각 시각에서 목표를 선형 보간해 대응값을 만든 뒤 비교합니다.
 *
 * ⚠️ 이 로직은 백엔드(backend/app/services/rmse.py)에도 같은 내용으로 존재합니다.
 * 실시간 표시는 여기가, 저장은 서버가 계산하는데 두 값이 다르면 안 됩니다.
 * **한쪽을 고치면 반드시 다른 쪽과 양쪽 테스트를 함께 고치세요.**
 *
 * 프론트에 계산 로직을 두는 것은 원칙상 예외입니다. 100 ms마다 서버를 왕복할 수 없어서이며,
 * 저장 시에는 서버가 다시 계산한 값을 진실로 삼습니다.
 */

/** [시간(초), 누적 물량(g)] 시간 오름차순 */
export type CurvePoint = readonly [number, number];
export type Curve = readonly CurvePoint[];

/**
 * 구간 선형 보간. 곡선 범위를 벗어나면 양 끝값을 유지합니다.
 *
 * 끝을 넘긴 구간에 페널티를 주지 않는 이유는, 추출이 목표 시간보다 길어지는 것 자체는
 * 오차가 아니고 그 시점의 물량 차이만 오차이기 때문입니다.
 */
export function interpolateAt(curve: Curve, t: number): number {
  if (curve.length === 0) throw new Error("빈 곡선은 보간할 수 없습니다");

  if (t <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (t >= last[0]) return last[1];

  for (let i = 1; i < curve.length; i += 1) {
    const [t1, w1] = curve[i];
    if (t <= t1) {
      const [t0, w0] = curve[i - 1];
      const span = t1 - t0;
      // 같은 시각에 두 점이 있으면(수직 구간) 나중 값을 씁니다.
      if (span === 0) return w1;
      return w0 + ((w1 - w0) * (t - t0)) / span;
    }
  }

  return last[1];
}

/**
 * 실측이 목표에서 얼마나 벗어났는지. 단위는 g.
 *
 * 실측이 없으면 null입니다. 0이 아닌 이유는 "측정하지 않음"과 "오차 0"이 다르기 때문입니다.
 */
export function calculateRmse(target: Curve, actual: Curve): number | null {
  if (actual.length === 0 || target.length === 0) return null;

  let total = 0;
  for (const point of actual) {
    const diff = point[1] - interpolateAt(target, point[0]);
    total += diff * diff;
  }

  return Math.sqrt(total / actual.length);
}

/**
 * 실시간 표시용 누적 계산기.
 *
 * 매 점마다 전체를 다시 계산하면 추출이 길어질수록 느려집니다(초당 10회 × 누적).
 * 제곱 오차 합만 들고 있으면 새 점 하나에 O(1)로 끝납니다.
 * 결과는 calculateRmse와 반드시 같아야 하며, 테스트로 고정돼 있습니다.
 */
export function createRmseAccumulator(target: Curve) {
  let total = 0;
  let count = 0;

  return {
    add(timeSec: number, grams: number): void {
      const diff = grams - interpolateAt(target, timeSec);
      total += diff * diff;
      count += 1;
    },
    get value(): number | null {
      return count === 0 ? null : Math.sqrt(total / count);
    },
    reset(): void {
      total = 0;
      count = 0;
    },
  };
}
