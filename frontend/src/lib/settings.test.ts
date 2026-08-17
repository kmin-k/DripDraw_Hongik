import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, clearSettings, loadSettings, saveSettings } from "./settings";

const KEY = "dripdraw.settings";

/**
 * 테스트는 브라우저가 아니라 Node에서 돕니다. localStorage가 없어 최소 구현을 끼웁니다.
 * jsdom을 들이는 것보다 가볍고, 검증 대상은 저장소가 아니라 값 처리 로직입니다.
 */
beforeAll(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
});

describe("settings", () => {
  beforeEach(() => localStorage.clear());

  it("저장한 값을 그대로 돌려준다", () => {
    saveSettings({ doseG: 25, drinkType: "ICE", onboarded: true });
    expect(loadSettings()).toEqual({ doseG: 25, drinkType: "ICE", onboarded: true });
  });

  it("저장된 값이 없으면 기본값을 쓴다", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("깨진 JSON은 기본값으로 되돌린다", () => {
    // localStorage는 사용자가 직접 고칠 수 있습니다. 그대로 믿으면 화면이 깨집니다.
    localStorage.setItem(KEY, "{{{");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("범위를 벗어난 원두량은 기본값으로 되돌린다", () => {
    // 999 g이 화면에 들어오면 서버가 400을 냅니다.
    localStorage.setItem(KEY, JSON.stringify({ doseG: 999 }));
    expect(loadSettings().doseG).toBe(DEFAULT_SETTINGS.doseG);

    localStorage.setItem(KEY, JSON.stringify({ doseG: 5 }));
    expect(loadSettings().doseG).toBe(DEFAULT_SETTINGS.doseG);
  });

  it("소수점 원두량도 되돌린다", () => {
    localStorage.setItem(KEY, JSON.stringify({ doseG: 20.5 }));
    expect(loadSettings().doseG).toBe(DEFAULT_SETTINGS.doseG);
  });

  it("모르는 음용 방식은 핫으로 본다", () => {
    localStorage.setItem(KEY, JSON.stringify({ drinkType: "LUKEWARM" }));
    expect(loadSettings().drinkType).toBe("HOT");
  });

  it("onboarded는 true일 때만 true다", () => {
    // "true" 같은 문자열이 들어와도 온보딩을 건너뛰면 안 됩니다.
    localStorage.setItem(KEY, JSON.stringify({ onboarded: "true" }));
    expect(loadSettings().onboarded).toBe(false);
  });

  it("초기화하면 기본값으로 돌아간다", () => {
    saveSettings({ doseG: 30, drinkType: "ICE", onboarded: true });
    clearSettings();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
