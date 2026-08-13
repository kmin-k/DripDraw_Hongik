import { describe, expect, it } from "vitest";

import { formatDateTime, formatDuration } from "./format";

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
