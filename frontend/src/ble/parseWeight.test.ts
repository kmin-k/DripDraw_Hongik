import { describe, expect, it } from "vitest";

import { parseWeight } from "./parseWeight";

/** 실물 검증(2026-08-06)에서 확인한 구조대로 18-byte 합성 패킷을 만듭니다. */
function packet(sign: "+" | "-", digits: string): DataView {
  const bytes = new Uint8Array(18).fill(0x20);
  bytes[0] = 0x01;
  bytes[1] = 0x02;
  bytes[2] = sign === "+" ? 0x2b : 0x2d;
  for (let i = 0; i < 6; i += 1) bytes[3 + i] = digits.charCodeAt(i);
  bytes[10] = 0x67; // 'g'
  bytes[16] = 0x0d;
  bytes[17] = 0x0a;
  return new DataView(bytes.buffer);
}

describe("parseWeight", () => {
  it("★ 실물에서 캡처한 패킷을 정확히 읽는다 (저울 표시 398.9 g)", () => {
    // 2026-08-06 hex-dump.html로 캡처한 raw 패킷 그대로. 회귀 기준값입니다.
    const captured = new Uint8Array([
      0x01, 0x02, 0x2b, 0x30, 0x33, 0x39, 0x38, 0x39, 0x30,
      0x20, 0x67, 0x43, 0x68, 0x4d, 0x22, 0x89, 0x0d, 0x0a,
    ]);
    expect(parseWeight(new DataView(captured.buffer))).toBe(398.9);
  });

  it("★ 실물에서 캡처한 음수 패킷을 읽는다 (영점 후 물건 제거, -341.1 g)", () => {
    // 2026-08-06 캡처. index 2가 0x2D로 바뀌는 것을 실물로 확인한 케이스입니다.
    const captured = new Uint8Array([
      0x01, 0x02, 0x2d, 0x30, 0x33, 0x34, 0x31, 0x31, 0x30,
      0x20, 0x67, 0x43, 0x21, 0x16, 0x22, 0x89, 0x0d, 0x0a,
    ]);
    expect(parseWeight(new DataView(captured.buffer))).toBe(-341.1);
  });

  it("무게와 무관한 바이트가 달라도 결과가 같다", () => {
    // index 11~15는 의미 미상이고 패킷마다 값이 다릅니다. 파서가 여기에 영향받으면 안 됩니다.
    const a = new Uint8Array([
      0x01, 0x02, 0x2b, 0x30, 0x33, 0x39, 0x38, 0x39, 0x30,
      0x20, 0x67, 0x43, 0x68, 0x4d, 0x22, 0x89, 0x0d, 0x0a,
    ]);
    const b = a.slice();
    b[12] = 0x21;
    b[13] = 0x16;
    b[15] = 0x00;
    expect(parseWeight(new DataView(b.buffer))).toBe(parseWeight(new DataView(a.buffer)));
  });

  it("단위는 0.01 g — 카운트 130은 1.3 g이다", () => {
    expect(parseWeight(packet("+", "000130"))).toBe(1.3);
  });

  it("0을 읽는다", () => {
    expect(parseWeight(packet("+", "000000"))).toBe(0);
  });

  it("음수를 읽는다 (영점 후 컵을 치운 경우)", () => {
    expect(parseWeight(packet("-", "000450"))).toBe(-4.5);
  });

  it("검증 예시의 총 물량 300 g을 읽는다", () => {
    expect(parseWeight(packet("+", "030000"))).toBe(300.0);
  });

  it("최대 용량 2 kg을 읽는다 (index 3까지 숫자가 차는 경우)", () => {
    expect(parseWeight(packet("+", "200000"))).toBe(2000.0);
  });

  it("부호 자리가 이상하면 NaN", () => {
    const bytes = new Uint8Array(18).fill(0x20);
    bytes[2] = 0x41; // 'A'
    expect(parseWeight(new DataView(bytes.buffer))).toBeNaN();
  });

  it("숫자 자리에 비숫자가 있으면 NaN", () => {
    const p = packet("+", "000130");
    new Uint8Array(p.buffer)[5] = 0x41;
    expect(parseWeight(p)).toBeNaN();
  });

  it("패킷이 짧으면 NaN", () => {
    expect(parseWeight(new DataView(new Uint8Array(4).buffer))).toBeNaN();
  });

  it("★ 무게 패킷이 아니면 NaN — 헤더가 01 02가 아닌 것은 거른다", () => {
    // 저울은 같은 채널로 타이머·모드 패킷도 보냅니다. 걸러내지 않으면 곡선에 튀는 점이 생깁니다.
    const other = new Uint8Array([
      0x03, 0x0a, 0x2b, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30,
      0x20, 0x67, 0x43, 0xe3, 0x4f, 0x22, 0x88, 0x0d, 0x0a,
    ]);
    expect(parseWeight(new DataView(other.buffer))).toBeNaN();
  });

  it("★ 실물에서 캡처한 0 g 패킷을 읽는다", () => {
    // 2026-08-06 캡처. 빈 저울 상태.
    const captured = new Uint8Array([
      0x01, 0x02, 0x2b, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30,
      0x20, 0x67, 0x43, 0xe3, 0x4f, 0x22, 0x88, 0x0d, 0x0a,
    ]);
    expect(parseWeight(new DataView(captured.buffer))).toBe(0);
  });
});
