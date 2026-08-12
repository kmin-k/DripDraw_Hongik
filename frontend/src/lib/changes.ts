/**
 * 보정 결과(`changes`)를 화면에 뿌리기 위한 표시 변환.
 *
 * **판단은 서버가 이미 끝냈습니다.** 여기서는 영어 필드명을 한글 라벨로 바꾸고
 * 단위를 붙이는 일만 합니다. ENUM은 영어로 저장하고 한글은 프론트에서 붙이는 것이
 * 이 프로젝트의 규칙입니다 (docs/erd.md).
 *
 * 조정 규칙을 여기에 옮기지 마세요. 규칙이 두 곳에 생기면 반드시 어긋납니다.
 */

import type { Change } from "./api";

const FIELD_LABEL: Record<string, string> = {
  ratio: "물 비율",
  waterTempC: "물 온도",
  flowRateGps: "유량",
  grindGuide: "분쇄도",
  totalWaterG: "총 물량",
};

/** 모르는 필드는 서버 값을 그대로 보여줍니다. 화면이 비는 것보다 낫습니다. */
export function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field;
}

/** 값에 단위를 붙입니다. 분쇄도처럼 문자열로 오는 항목은 그대로 둡니다. */
export function formatValue(field: string, value: number | string): string {
  if (typeof value === "string") return value;
  switch (field) {
    case "ratio":
      return `1:${value}`;
    case "waterTempC":
      return `${value} ℃`;
    case "flowRateGps":
      return `${value.toFixed(1)} g/s`;
    case "totalWaterG":
      return `${value} g`;
    default:
      return String(value);
  }
}

export interface ChangeRow {
  field: string;
  label: string;
  before: string;
  after: string;
  reason: string;
}

export function toRows(changes: Change[]): ChangeRow[] {
  return changes.map((change) => ({
    field: change.field,
    label: fieldLabel(change.field),
    before: formatValue(change.field, change.before),
    after: formatValue(change.field, change.after),
    reason: change.reason,
  }));
}
