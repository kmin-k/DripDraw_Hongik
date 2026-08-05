import { describe, expect, it } from "vitest";

import { parseWeight } from "./parseWeight";

/** 문서 가정대로 18-byte 합성 패킷을 만듭니다. */
function packet(sign: "+" | "-", digits: string): DataView {
  const bytes = new Uint8Array(18).fill(0x20);
  bytes[0] = 0x01;
  bytes[1] = 0x02;
  bytes[2] = sign === "+" ? 0x2b : 0x2d;
  for (let i = 0; i < 6; i += 1) bytes[3 + i] = digits.charCodeAt(i);
  return new DataView(bytes.buffer);
}

describe("parseWeight", () => {
  it("양수를 0.1g 단위로 읽는다", () => {
    expect(parseWeight(packet("+", "000130"))).toBe(13.0);
  });

  it("0을 읽는다", () => {
    expect(parseWeight(packet("+", "000000"))).toBe(0);
  });

  it("음수를 읽는다 (영점 후 컵을 치운 경우)", () => {
    expect(parseWeight(packet("-", "000045"))).toBe(-4.5);
  });

  it("검증 예시의 총 물량 300g을 읽는다", () => {
    expect(parseWeight(packet("+", "003000"))).toBe(300.0);
  });

  it("6자리 최대값을 읽는다", () => {
    expect(parseWeight(packet("+", "999999"))).toBe(99999.9);
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
});
