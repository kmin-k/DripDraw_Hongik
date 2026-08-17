/**
 * 사용자 기본값. 브라우저에만 저장합니다.
 *
 * 서버에 두지 않는 이유는 **로그인이 없기 때문**입니다. 계정이 없는데 서버에 저장하면
 * 이 기기의 취향인지 다른 사람의 취향인지 구분할 수 없습니다.
 *
 * 여기에는 **화면이 실제로 쓰는 값만** 둡니다. 받아놓고 아무 데도 안 쓰는 값은
 * 사용자에게 "이건 어디에 반영되나요?"라는 질문을 남깁니다.
 */

import type { DrinkType } from "./api";

const STORAGE_KEY = "dripdraw.settings";

export interface Settings {
  /** 레시피 화면의 시작값 */
  doseG: number;
  drinkType: DrinkType;
  /** 온보딩을 끝냈는지. 처음 한 번만 보여줍니다. */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  doseG: 20,
  drinkType: "HOT",
  onboarded: false,
};

/** 원두량 허용 범위. 백엔드 DOSE_MIN_G/DOSE_MAX_G와 같습니다 (rule-table.md 8-1절, 8-2절). */
const DOSE_MIN = 10;
const DOSE_MAX = 30;

/**
 * 저장된 값을 읽습니다. **깨진 값은 기본값으로 되돌립니다.**
 *
 * localStorage는 사용자가 직접 고칠 수 있고 예전 버전의 값이 남아 있을 수도 있습니다.
 * 그대로 믿으면 원두량 999 g 같은 값이 화면에 들어와 서버가 400을 냅니다.
 */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<Settings>;
    const doseG = Number(parsed.doseG);

    return {
      doseG:
        Number.isInteger(doseG) && doseG >= DOSE_MIN && doseG <= DOSE_MAX
          ? doseG
          : DEFAULT_SETTINGS.doseG,
      drinkType: parsed.drinkType === "ICE" ? "ICE" : "HOT",
      onboarded: parsed.onboarded === true,
    };
  } catch {
    // JSON이 깨졌거나 저장소를 못 쓰는 환경(시크릿 모드 등).
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 저장에 실패해도 화면은 그대로 동작해야 합니다. 기본값으로 쓰면 됩니다.
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시합니다.
  }
}
