// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeScale } from "../test/fakeScale";
import { api, type BrewResult, type Recipe } from "../lib/api";
import BrewPage from "./BrewPage";

/**
 * 시연의 성패가 걸린 화면. 실제 useScale과 화면을 그대로 쓰고 블루투스 구현만 바꿉니다.
 */
const { holder } = vi.hoisted(() => ({ holder: { scale: null as unknown } }));

vi.mock("../ble/felicita", () => ({
  FelicitaArcSource: function FelicitaArcSource() {
    return holder.scale;
  },
}));

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/api")>();
  return { ...original, api: { ...original.api, saveBrew: vi.fn(), deleteBrew: vi.fn() } };
});

const CLOCK_MS = 1000;
const DRIPPER_G = 350;
const SAVED: BrewResult = { brewId: 7, rmse: 1.2, durationSec: 30, finalWeightG: 100 };
const RECIPE = {
  recipeId: 3,
  source: "RULE_ENGINE",
  totalWaterG: 100,
  waterTempC: 94,
  ratio: 15,
  targetCurve: [
    [0, 0],
    [10, 100],
    [60, 100],
  ],
  pours: [],
} as unknown as Recipe;

describe("추출 화면", () => {
  let scale: FakeScale;
  const saveBrew = vi.mocked(api.saveBrew);
  const deleteBrew = vi.mocked(api.deleteBrew);

  beforeEach(() => {
    scale = new FakeScale();
    holder.scale = scale;
    vi.spyOn(performance, "now").mockReturnValue(CLOCK_MS);
    // 그래프 라이브러리가 크기를 재는 데 씁니다. jsdom에는 없습니다.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    saveBrew.mockReset();
    deleteBrew.mockReset();
    saveBrew.mockResolvedValue(SAVED);
    deleteBrew.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function open() {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/brew", state: { recipe: RECIPE } }]}>
        <BrewPage />
      </MemoryRouter>,
    );
  }

  function click(name: string) {
    fireEvent.click(screen.getByRole("button", { name }));
  }

  function packet(sec: number, grams: number) {
    act(() => scale.emit(grams, CLOCK_MS + sec * 1000));
  }

  function startAndPour() {
    click("추출 시작");
    packet(0.1, DRIPPER_G);
    packet(10, DRIPPER_G + 100);
    packet(30, DRIPPER_G + 100);
  }

  it("★ 추출 종료를 누르면 저울 타이머를 멈추고 저장한다", async () => {
    open();
    startAndPour();

    click("추출 종료");

    expect(await screen.findByText(/기록 저장 완료/)).toBeTruthy();
    expect(scale.stopTimer).toHaveBeenCalled();
    const body = saveBrew.mock.calls[0][0];
    expect(body.recipeId).toBe(3);
    expect(body.actualCurve.at(-1)).toEqual([30, 100]);
  });

  it("★ 드리퍼를 들면 버튼 없이 끝나고 그 직전까지 저장한다", async () => {
    open();
    startAndPour();

    packet(31, 20);

    expect(await screen.findByText(/기록 저장 완료/)).toBeTruthy();
    expect(screen.getByText(/무게가 크게 줄어 여기서 추출을 끝냈습니다/)).toBeTruthy();
    expect(scale.stopTimer).toHaveBeenCalled();
    expect(saveBrew).toHaveBeenCalledOnce();
    expect(saveBrew.mock.calls[0][0].actualCurve.at(-1)).toEqual([30, 100]);
  });

  it("영점을 잘못 눌러 끝났으면 그 기록을 지우고 처음으로 돌아간다", async () => {
    open();
    startAndPour();
    packet(31, 0.3);
    await screen.findByText(/기록 저장 완료/);

    click("이 기록 지우기");
    click("지우기");

    await waitFor(() => expect(deleteBrew).toHaveBeenCalledWith(7));
    expect(await screen.findByRole("button", { name: "추출 시작" })).toBeTruthy();
  });

  it("★ 저장에 실패해도 기록이 남아 다시 저장할 수 있다", async () => {
    saveBrew.mockRejectedValueOnce(new Error("서버 연결 실패"));
    open();
    startAndPour();

    click("추출 종료");
    expect(await screen.findByText(/기록 저장 실패 — 서버 연결 실패/)).toBeTruthy();

    click("다시 저장");

    expect(await screen.findByText(/기록 저장 완료/)).toBeTruthy();
    expect(saveBrew).toHaveBeenCalledTimes(2);
    expect(saveBrew.mock.calls[1][0]).toEqual(saveBrew.mock.calls[0][0]);
    expect(screen.queryByText(/기록 저장 실패/)).toBeNull();
  });

  it("★ 추출 중 저울이 끊겨도 종료해서 그때까지의 기록을 저장할 수 있다", async () => {
    open();
    startAndPour();

    act(() => scale.setStatus("DISCONNECTED"));
    expect(screen.getByRole("button", { name: "저울 다시 연결" })).toBeTruthy();

    click("추출 종료");

    expect(await screen.findByText(/기록 저장 완료/)).toBeTruthy();
    expect(saveBrew.mock.calls[0][0].actualCurve.at(-1)).toEqual([30, 100]);
  });

  it("저울에서 타이머를 켜면 화면도 추출을 시작한다", () => {
    open();

    act(() => scale.setTimerState("RUNNING"));

    expect(screen.getByRole("button", { name: "추출 종료" })).toBeTruthy();
  });

  it("추출 중이거나 저장에 실패한 동안은 나가기 전에 경고한다", async () => {
    saveBrew.mockRejectedValueOnce(new Error("서버 연결 실패"));
    open();

    const leaving = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(leaving()).toBe(false);
    startAndPour();
    expect(leaving()).toBe(true);

    click("추출 종료");
    await screen.findByText(/기록 저장 실패/);
    expect(leaving()).toBe(true);

    click("다시 저장");
    await screen.findByText(/기록 저장 완료/);
    expect(leaving()).toBe(false);
  });
});
