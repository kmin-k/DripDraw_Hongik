import { describe, expect, it } from "vitest";

import { formatDateTime, formatDuration, formatGram } from "./format";

describe("formatGram", () => {
  it("★ 반올림해서 0이 되는 작은 음수는 0으로", () => {
    // 빈 저울이 보내는 -0.04 g. 그대로 두면 화면에 "-0 g"이 찍힙니다.
    expect(formatGram(-0.04)).toBe("0");
    expect(formatGram(-0.04, 1)).toBe("0.0");
    expect(formatGram(-0)).toBe("0");
  });

  it("진짜 음수는 감추지 않는다", () => {
    // 저울 기준이 틀어졌다는 신호입니다.
    expect(formatGram(-3.2)).toBe("-3");
    expect(formatGram(-0.06, 1)).toBe("-0.1");
  });

  it("양수는 자릿수만 맞춘다", () => {
    expect(formatGram(298.46)).toBe("298");
    expect(formatGram(298.46, 1)).toBe("298.5");
  });
});

describe("formatDateTime", () => {
  it("초를 버리고 분까지만 보여준다", () => {
    // 목록에서 훑어볼 때 초까지 필요하지 않습니다.
    const local = new Date(2026, 7, 13, 9, 12, 3).toISOString();
    expect(formatDateTime(local)).toBe("2026-08-13 09:12");
  });

  it("한 자리 월·일·시각에 0을 채운다", () => {
    const local = new Date(2026, 0, 5, 7, 4, 0).toISOString();
    expect(formatDateTime(local)).toBe("2026-01-05 07:04");
  });

  it("해석할 수 없는 값은 그대로 보여준다", () => {
    // 화면이 "Invalid Date"로 깨지는 것보다 원본이 낫습니다.
    expect(formatDateTime("나중에")).toBe("나중에");
  });
});

describe("formatDuration", () => {
  it("분과 초로 나눈다", () => {
    expect(formatDuration(205)).toBe("3분 25초");
  });

  it("1분 미만은 초만 보여준다", () => {
    expect(formatDuration(42)).toBe("42초");
  });

  it("정확히 몇 분이면 초를 0으로 남긴다", () => {
    expect(formatDuration(120)).toBe("2분 0초");
  });
});
