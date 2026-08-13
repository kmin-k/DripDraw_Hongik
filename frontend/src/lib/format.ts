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

/** "3분 25초" — 205초처럼 큰 초 단위는 한눈에 안 들어옵니다. */
export function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.round(totalSec % 60);
  return minutes === 0 ? `${seconds}초` : `${minutes}분 ${seconds}초`;
}
