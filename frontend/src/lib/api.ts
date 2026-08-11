/**
 * 백엔드 호출 래퍼.
 *
 * 계산은 전부 서버가 합니다. 프론트는 받은 값을 그리기만 합니다.
 * 예외는 두 가지뿐입니다 — BLE 패킷 파싱과 실시간 RMSE 표시.
 * 둘 다 브라우저에서만 가능한 일이라 옮길 수 없습니다.
 */

import type { Curve } from "./rmse";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(formatError(body, res));
  }
  return res.json() as Promise<T>;
}

/** FastAPI는 규칙 위반(400)과 스키마 위반(422)의 detail 형태가 다릅니다. */
function formatError(body: unknown, res: Response): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e: { loc?: unknown[]; msg?: string }) => {
        const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : "";
        return `${field}: ${e.msg ?? ""}`;
      })
      .join(", ");
  }
  return `${res.status} ${res.statusText}`;
}

// --- 원두 ---

export interface Bean {
  id: number;
  name: string;
  region: string;
  process: string;
  roastLevel: string;
}

// --- 레시피 ---

export type DrinkType = "HOT" | "ICE";
export type RoastLevel = "LIGHT" | "MEDIUM" | "DARK";
export type Region = "AFRICA" | "CENTRAL_AMERICA" | "SOUTH_AMERICA" | "ASIA_PACIFIC";
export type Process = "WASHED" | "NATURAL";

export interface RecipeRequest {
  doseG: number;
  drinkType: DrinkType;
  roastLevel: RoastLevel;
  region: Region;
  process: Process;
  d50Um: number;
}

export interface Pour {
  phase: "BLOOM" | "SECOND" | "THIRD" | "FOURTH";
  waterG: number;
  startSec: number;
  endSec: number;
}

export interface Recipe {
  recipeId: number;
  totalWaterG: number;
  /** [[시간(초), 누적 물량(g)], ...] 구간 선형 곡선 */
  targetCurve: [number, number][];

  /** 아래는 Rule Engine이 계산한 값. 기록(RECORDED) 레시피에는 없습니다. */
  waterTempC: number | null;
  ratio: number | null;
  flowRateGps: number | null;
  grindGuide: string | null;
  iceMessage: string | null;
  pours: Pour[];
}

// --- 추출 기록 ---

export interface BrewRequest {
  /** 자유 모드는 따라간 목표가 없어 생략합니다. */
  recipeId?: number;
  startedAt: string;
  endedAt: string;
  /** 다운샘플링하지 않은 원본 곡선 (docs/api.md) */
  actualCurve: Curve;
}

export interface BrewResult {
  brewId: number;
  /** 서버가 다시 계산한 값. 자유 모드는 null입니다. */
  rmse: number | null;
  durationSec: number;
  finalWeightG: number;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  listBeans: () => request<{ items: Bean[] }>("/api/beans"),
  generateRecipe: (body: RecipeRequest) =>
    request<Recipe>("/api/recipe/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  saveBrew: (body: BrewRequest) =>
    request<BrewResult>("/api/brews", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** 마음에 든 추출을 다음 목표로 저장합니다. 곡선 다듬기는 서버가 합니다. */
  saveBrewAsRecipe: (brewId: number, body: { doseG: number; drinkType: DrinkType }) =>
    request<Recipe>(`/api/brews/${brewId}/save-as-recipe`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
