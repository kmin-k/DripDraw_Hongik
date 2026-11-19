// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeScale } from "../test/fakeScale";
import { api, type ExperimentTrial, type Recipe } from "../lib/api";
import ExperimentPage from "./ExperimentPage";

/**
 * 예비 실험 진행 화면. 실제 useScale과 화면을 그대로 쓰고 블루투스와 서버만 바꿉니다.
 *
 * 확인하는 것은 두 가지입니다.
 * - 시행마다 올바른 실험 정보(단계·조건·회차)로 저장하는가
 * - 조건마다 보여 주는 것이 다르고, 편차·정확도는 어느 조건에서도 보이지 않는가
 */
const { holder } = vi.hoisted(() => ({ holder: { scale: null as unknown } }));

vi.mock("../ble/felicita", () => ({
  FelicitaArcSource: function FelicitaArcSource() {
    return holder.scale;
  },
}));

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      getRecipe: vi.fn(),
      saveBrew: vi.fn(),
      listTrials: vi.fn(),
      updateTrial: vi.fn(),
    },
  };
});

const CLOCK_MS = 1000;
const DRIPPER_G = 350;
const RECIPE = {
  recipeId: 3,
  source: "RULE_ENGINE",
  totalWaterG: 100,
  waterTempC: 96,
  ratio: 15,
  targetCurve: [
    [0, 0],
    [10, 100],
    [60, 100],
  ],
  pours: [],
} as unknown as Recipe;

function record(stage: string, condition: number, trialNo: number, valid = true): ExperimentTrial {
  return {
    trialId: 1,
    brewId: 1,
    study: "PILOT",
    participantCode: "P01",
    stage: stage as ExperimentTrial["stage"],
    condition,
    trialNo,
    valid,
    note: null,
    startedAt: "2026-11-20T05:00:00Z",
    rmse: 1,
    durationSec: 60,
    finalWeightG: 100,
  };
}

describe("예비 실험 화면", () => {
  let scale: FakeScale;
  const saveBrew = vi.mocked(api.saveBrew);
  const listTrials = vi.mocked(api.listTrials);
  const updateTrial = vi.mocked(api.updateTrial);

  beforeEach(() => {
    scale = new FakeScale();
    holder.scale = scale;
    vi.spyOn(performance, "now").mockReturnValue(CLOCK_MS);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    localStorage.setItem("dripdraw.experiment.recipeId", "3");
    vi.mocked(api.getRecipe).mockResolvedValue(RECIPE);
    saveBrew.mockReset();
    saveBrew.mockResolvedValue({
      brewId: 9,
      rmse: 2.5,
      durationSec: 30,
      finalWeightG: 100,
      trialId: 41,
    });
    listTrials.mockReset();
    listTrials.mockResolvedValue({ items: [] });
    updateTrial.mockReset();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function open(code = "P01") {
    render(
      <MemoryRouter initialEntries={[`/experiment?p=${code}`]}>
        <ExperimentPage />
      </MemoryRouter>,
    );
    await screen.findByText(/시행 \d+ \/ 11/);
  }

  function click(name: string) {
    fireEvent.click(screen.getByRole("button", { name }));
  }

  function packet(sec: number, grams: number) {
    act(() => scale.emit(grams, CLOCK_MS + sec * 1000));
  }

  function startAndPour() {
    click("시작");
    packet(0.1, DRIPPER_G);
    packet(5, DRIPPER_G + 40);
  }

  it("★ 첫 시행은 연습(조건 ①)이고 실험 정보와 함께 저장한다", async () => {
    await open();
    expect(screen.getByText(/시행 1 \/ 11 · 연습 · 화면 ① · 1회차/)).toBeTruthy();

    startAndPour();
    click("종료");

    expect(await screen.findByText(/저장했습니다 \(시행 #41\)/)).toBeTruthy();
    const body = saveBrew.mock.calls[0][0];
    expect(body.recipeId).toBe(3);
    expect(body.experiment).toEqual({
      study: "PILOT",
      participantCode: "P01",
      stage: "WARMUP",
      condition: 1,
      trialNo: 1,
    });
  });

  it("★ 이미 한 시행은 건너뛰고 서버 기록에서 이어서 진행한다", async () => {
    listTrials.mockResolvedValue({
      items: [record("WARMUP", 1, 1), record("WATER", 1, 1), record("WATER", 1, 2, false)],
    });
    await open();

    // 무효만 있는 시행(물 ① 2회차)부터 다시 합니다.
    expect(screen.getByText(/시행 3 \/ 11 · 물 · 화면 ① · 2회차/)).toBeTruthy();
  });

  it("★ 정확도는 저장 뒤에도 화면에 보이지 않는다", async () => {
    await open();
    startAndPour();
    click("종료");
    await screen.findByText(/저장했습니다/);

    expect(screen.queryByText(/RMSE|정확도/)).toBeNull();
    expect(screen.queryByText(/2\.5/)).toBeNull();
  });

  it("조건 ①은 그래프도 목표량도 없다", async () => {
    await open();
    startAndPour();

    expect(screen.queryByText("지금 목표")).toBeNull();
    expect(screen.queryByText("부은 양")).toBeNull();
    expect(screen.queryByText(/여기까지 부으세요/)).toBeNull();
  });

  it("조건 ④는 목표와 내 곡선을 모두 보여 주되 편차는 보여 주지 않는다", async () => {
    // P04는 원두 블록이 먼저이고 첫 원두 조건이 ①, 그다음이 ④입니다.
    listTrials.mockResolvedValue({ items: [record("WARMUP", 1, 1), record("BEAN", 1, 1)] });
    await open("P04");
    expect(screen.getByText(/시행 3 \/ 11 · 원두 · 화면 ④/)).toBeTruthy();

    startAndPour();

    expect(screen.getByText("지금 목표")).toBeTruthy();
    expect(screen.getByText("목표")).toBeTruthy();
    expect(screen.getByText("부은 양")).toBeTruthy();
    expect(screen.getByText(/여기까지 부으세요/)).toBeTruthy();
    // 추출 화면의 "지금 40 g · 60 g 더" 같은 편차 문구가 없어야 합니다.
    expect(screen.queryByText(/g 더/)).toBeNull();
  });

  it("무효로 표시하면 다음 시행에서 같은 시행을 다시 한다", async () => {
    updateTrial.mockResolvedValue({ ...record("WARMUP", 1, 1, false), trialId: 41 });
    listTrials.mockResolvedValueOnce({ items: [] });
    listTrials.mockResolvedValue({ items: [{ ...record("WARMUP", 1, 1), trialId: 41 }] });
    await open();
    startAndPour();
    click("종료");
    await screen.findByText(/저장했습니다/);

    fireEvent.change(screen.getByPlaceholderText(/특이사항/), {
      target: { value: "물 넘침" },
    });
    listTrials.mockResolvedValue({ items: [{ ...record("WARMUP", 1, 1, false), trialId: 41 }] });
    click("무효로 표시");

    expect(await screen.findByText(/같은 시행을 다시 합니다/)).toBeTruthy();
    expect(updateTrial).toHaveBeenCalledWith(41, { valid: false, note: "물 넘침" });

    click("다음 시행");
    expect(await screen.findByText(/시행 1 \/ 11 · 연습/)).toBeTruthy();
  });
});
