/**
 * Felicita Arc 무게 패킷 파서 — docs/scale-protocol.md
 *
 * 2026-08-06 실물 검증 완료: 18-byte ASCII, index 2 = 부호(0x2B/0x2D),
 * index 3~8 = 숫자 6자리, **단위 0.01g** (커뮤니티 자료의 0.1g은 오류였음).
 * 저울 해상도가 0.1g라 마지막 숫자는 항상 '0'입니다.
 *
 * 2026-08-14: index 11이 **타이머 상태**임을 확인했습니다 (아래 parseTimerState).
 */

import type { TimerState } from "./types";

/** 정수 카운트 → g 변환. 실측으로 확정한 값이므로 임의로 바꾸지 마세요. */
const COUNTS_PER_GRAM = 100;

/**
 * 무게 패킷 헤더.
 *
 * 저울은 같은 characteristic으로 **무게 외의 패킷도 보냅니다** (타이머·모드 전환 시 확인됨).
 * 헤더로 걸러내지 않으면 다른 패킷을 무게로 잘못 읽어 곡선에 튀는 점이 생깁니다.
 */
const HEADER = [0x01, 0x02] as const;

/**
 * 타이머 상태가 실려 오는 자리와 값 (2026-08-14 실측).
 *
 * 저울이 **명령 문자와 같은 글자를 그대로 돌려줍니다** — `C`/`R`/`S`.
 * 앱이 명령을 보내지 않고 사용자가 저울 버튼을 눌러도 이 값이 바뀌므로,
 * 저울에서 시작한 추출을 앱이 알아챌 수 있습니다.
 */
const TIMER_STATE_INDEX = 11;
const TIMER_STATES: Record<number, TimerState> = {
  0x43: "RESET", // 'C'
  0x52: "RUNNING", // 'R'
  0x53: "STOPPED", // 'S'
};

/**
 * 무게 패킷에서 타이머 상태를 읽습니다. 알 수 없는 값이면 null.
 *
 * 무게와 같은 패킷에 들어 있어 별도 구독이 필요 없습니다.
 */
export function parseTimerState(data: DataView): TimerState | null {
  if (data.byteLength <= TIMER_STATE_INDEX) return null;
  if (data.getUint8(0) !== HEADER[0] || data.getUint8(1) !== HEADER[1]) return null;

  return TIMER_STATES[data.getUint8(TIMER_STATE_INDEX)] ?? null;
}

/** 파싱 실패 시 NaN을 반환합니다. 호출부에서 Number.isNaN으로 거릅니다. */
export function parseWeight(data: DataView): number {
  if (data.byteLength < 9) return Number.NaN;
  if (data.getUint8(0) !== HEADER[0] || data.getUint8(1) !== HEADER[1]) return Number.NaN;

  const signByte = data.getUint8(2);
  if (signByte !== 0x2b && signByte !== 0x2d) return Number.NaN;

  let digits = "";
  for (let index = 3; index <= 8; index += 1) {
    const byte = data.getUint8(index);
    if (byte < 0x30 || byte > 0x39) return Number.NaN;
    digits += String.fromCharCode(byte);
  }

  const sign = signByte === 0x2b ? 1 : -1;
  return (sign * Number.parseInt(digits, 10)) / COUNTS_PER_GRAM;
}
