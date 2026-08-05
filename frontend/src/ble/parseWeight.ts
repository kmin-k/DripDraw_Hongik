/**
 * Felicita Arc 무게 패킷 파서 — docs/scale-protocol.md
 *
 * 가정: 18-byte ASCII, index 2 = 부호(0x2B/0x2D), index 3~8 = 숫자 6자리, 단위 0.1g
 *
 * ⚠️ 이 오프셋은 커뮤니티 역공학 자료 기반이며 실물 검증 전입니다.
 * tools/hex-dump.html의 "바이트별 변화 분석"으로 확인한 뒤 필요하면 여기와 문서를 함께 고칩니다.
 */

/** 파싱 실패 시 NaN을 반환합니다. 호출부에서 Number.isNaN으로 거릅니다. */
export function parseWeight(data: DataView): number {
  if (data.byteLength < 9) return Number.NaN;

  const signByte = data.getUint8(2);
  if (signByte !== 0x2b && signByte !== 0x2d) return Number.NaN;

  let digits = "";
  for (let index = 3; index <= 8; index += 1) {
    const byte = data.getUint8(index);
    if (byte < 0x30 || byte > 0x39) return Number.NaN;
    digits += String.fromCharCode(byte);
  }

  const sign = signByte === 0x2b ? 1 : -1;
  return (sign * Number.parseInt(digits, 10)) / 10;
}
