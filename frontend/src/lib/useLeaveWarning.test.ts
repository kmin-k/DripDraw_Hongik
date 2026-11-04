import { describe, expect, it } from "vitest";

import { isRecordAtRisk } from "./useLeaveWarning";

describe("isRecordAtRisk — 나가면 기록이 사라지는 상태", () => {
  it("추출 중이거나 일시정지면 위험하다", () => {
    expect(isRecordAtRisk("RUNNING", false, false)).toBe(true);
    expect(isRecordAtRisk("PAUSED", false, false)).toBe(true);
  });

  it("★ 저장이 실패한 채 끝났으면 위험하다", () => {
    expect(isRecordAtRisk("FINISHED", false, true)).toBe(true);
  });

  it("저장 중이면 위험하다", () => {
    expect(isRecordAtRisk("FINISHED", true, false)).toBe(true);
  });

  it("저장이 끝났으면 안전하다", () => {
    expect(isRecordAtRisk("FINISHED", false, false)).toBe(false);
  });

  it("시작 전에는 잃을 것이 없다", () => {
    expect(isRecordAtRisk("IDLE", false, false)).toBe(false);
  });
});
