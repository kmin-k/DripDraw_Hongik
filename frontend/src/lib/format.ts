/** 화면 표시용 형식 변환. 계산이 아니라 표기만 다룹니다. */

/** "2026-08-13 09:12" — 초는 버립니다. 목록에서 훑어볼 때 초까지 필요하지 않습니다. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * 무게 숫자. 소수 자릿수만 정하고 단위는 붙이지 않습니다.
 *
 * 저울은 빈 상태에서 -0.04 g 같은 값을 보냅니다. `toFixed`는 이걸 "-0.0"으로 만들어
 * 화면에 "-0 g"이 찍힙니다. 반올림해서 0이 되면 부호를 떼어 "0"으로 보여줍니다.
 * 진짜 음수(예: -3 g)는 그대로 둡니다 — 저울 기준이 틀어졌다는 신호라 감추면 안 됩니다.
 */
export function formatGram(grams: number, digits = 0): string {
  const text = grams.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

/** "3분 25초" — 205초처럼 큰 초 단위는 한눈에 안 들어옵니다. */
export function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.round(totalSec % 60);
  return minutes === 0 ? `${seconds}초` : `${minutes}분 ${seconds}초`;
}
