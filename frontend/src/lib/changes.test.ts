import { describe, expect, it } from "vitest";

import { fieldLabel, formatValue, toRows } from "./changes";

describe("fieldLabel", () => {
  it("서버의 영어 필드명을 한글로 바꾼다", () => {
    expect(fieldLabel("waterTempC")).toBe("물 온도");
    expect(fieldLabel("flowRateGps")).toBe("유량");
  });

  it("모르는 필드는 그대로 보여준다", () => {
    // 화면이 비는 것보다 낫습니다. 서버가 항목을 추가해도 표가 깨지지 않습니다.
    expect(fieldLabel("somethingNew")).toBe("somethingNew");
  });
});

describe("formatValue", () => {
  it("물 비율은 1:N으로 읽는다", () => {
    expect(formatValue("ratio", 14)).toBe("1:14");
  });

  it("유량은 소수 첫째 자리까지 고정한다", () => {
    // 6과 6.0이 섞여 나오면 값이 바뀐 것처럼 보입니다.
    expect(formatValue("flowRateGps", 6)).toBe("6.0 g/s");
    expect(formatValue("flowRateGps", 6.5)).toBe("6.5 g/s");
  });

  it("온도에 단위를 붙인다", () => {
    expect(formatValue("waterTempC", 95)).toBe("95 ℃");
  });

  it("분쇄도처럼 문자열로 오는 값은 그대로 둔다", () => {
    expect(formatValue("grindGuide", "1단계 굵게")).toBe("1단계 굵게");
  });
});

describe("toRows", () => {
  it("표 한 줄에 필요한 것을 전부 담는다", () => {
    const rows = toRows([{ field: "ratio", before: 15, after: 14, reason: "농도 연함" }]);

    // "무엇이 · 얼마에서 · 얼마로 · 왜" — 이 네 가지가 발표의 핵심입니다.
    expect(rows).toEqual([
      { field: "ratio", label: "물 비율", before: "1:15", after: "1:14", reason: "농도 연함" },
    ]);
  });

  it("빈 배열이면 빈 표가 된다", () => {
    expect(toRows([])).toEqual([]);
  });
});
