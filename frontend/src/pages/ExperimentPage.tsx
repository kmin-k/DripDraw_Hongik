import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useScale } from "../ble/useScale";
import ExperimentDisplay from "../components/ExperimentDisplay";
import {
  api,
  experimentExportUrl,
  type BrewResult,
  type ExperimentTrial,
  type Recipe,
} from "../lib/api";
import {
  CONDITION_MARK,
  CONDITIONS,
  EXPERIMENT_RECIPE,
  PILOT_ASSIGNMENTS,
  STAGE_LABEL,
  doneKeys,
  loadExperimentRecipeId,
  nextTrialIndex,
  pilotPlan,
  saveExperimentRecipeId,
  scriptBefore,
  startsNewBlock,
  trialKey,
  type PlannedTrial,
} from "../lib/experiment";
import type { Curve } from "../lib/rmse";
import { useBrewSession } from "../lib/useBrewSession";
import { isRecordAtRisk, useLeaveWarning } from "../lib/useLeaveWarning";
import { useWakeLock } from "../lib/useWakeLock";

/**
 * 예비 실험 진행 화면 (진행자용).
 *
 * 참가자 코드를 고르면 배정표에 따라 시행 순서가 정해지고, 시행마다 화면 조건이 자동으로 바뀝니다.
 * 어디까지 했는지는 서버 기록으로 판단합니다. 새로고침하거나 기기를 바꿔도 이어서 진행됩니다.
 *
 * 참가자도 같은 화면을 봅니다. 그래서 정확도(RMSE)는 진행자 영역에도 띄우지 않습니다.
 */

const STUDY = "PILOT" as const;

const btn = "rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40";
const btnPrimary =
  "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40";
/** 실험 레시피. 저장해 둔 것이 있으면 불러오고, 없으면 진행자가 만듭니다. */
function useExperimentRecipe() {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(loadExperimentRecipeId() !== null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = loadExperimentRecipeId();
    if (id === null) return;
    api
      .getRecipe(id)
      .then(setRecipe)
      .catch(() => setError("저장해 둔 실험 레시피를 찾지 못했습니다. 다시 만들어 주세요."))
      .finally(() => setLoading(false));
  }, []);

  const create = async () => {
    setError(null);
    try {
      const made = await api.generateRecipe(EXPERIMENT_RECIPE);
      saveExperimentRecipeId(made.recipeId);
      setRecipe(made);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return { recipe, loading, error, create };
}

export default function ExperimentPage() {
  const [params, setParams] = useSearchParams();
  const code = params.get("p");
  const assignment = PILOT_ASSIGNMENTS.find((a) => a.code === code) ?? null;
  // 렌더마다 새 배열이면 진행 화면이 기록을 매번 다시 불러옵니다.
  const plan = useMemo(() => (assignment ? pilotPlan(assignment) : []), [assignment]);
  const experimentRecipe = useExperimentRecipe();

  if (experimentRecipe.loading) {
    return <p className="text-sm text-slate-500">실험 레시피를 불러오는 중…</p>;
  }

  if (!assignment || !experimentRecipe.recipe) {
    return (
      <Setup
        recipe={experimentRecipe.recipe}
        recipeError={experimentRecipe.error}
        onCreateRecipe={experimentRecipe.create}
        onPick={(picked) => setParams({ p: picked })}
      />
    );
  }

  return (
    <Run
      key={assignment.code}
      code={assignment.code}
      plan={plan}
      recipe={experimentRecipe.recipe}
      onExit={() => setParams({})}
    />
  );
}

function Setup({
  recipe,
  recipeError,
  onCreateRecipe,
  onPick,
}: {
  recipe: Recipe | null;
  recipeError: string | null;
  onCreateRecipe: () => void;
  onPick: (code: string) => void;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">예비 실험 (진행자용)</h1>
        <p className="mt-1 text-sm text-slate-500">
          참가자 코드를 고르면 배정표 순서대로 시행이 진행됩니다. 기록은 일반 추출 기록에 섞이지
          않습니다.
        </p>
      </div>

      <div className="rounded border bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">1. 실험 레시피</h2>
        {recipe ? (
          <div className="space-y-1">
            <div>
              레시피 #{recipe.recipeId} · 총 {recipe.totalWaterG} g · 물 온도 {recipe.waterTempC} ℃
            </div>
            <Link to="/experiment/card" className="text-sky-700 underline">
              레시피 카드 열기 (인쇄용)
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-slate-600">
              모든 시행이 같은 목표를 따릅니다. 처음 한 번만 만들면 이 기기에 기억됩니다.
            </p>
            <button onClick={onCreateRecipe} className={btnPrimary}>
              실험 레시피 만들기
            </button>
          </div>
        )}
        {recipeError && <p className="mt-2 text-red-600">{recipeError}</p>}
      </div>

      <div className="rounded border bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">2. 참가자</h2>
        <table className="w-full text-left">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1">코드</th>
              <th>블록 순서</th>
              <th>물 블록 화면 순서</th>
              <th>원두 블록</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {PILOT_ASSIGNMENTS.map((a) => (
              <tr key={a.code} className="border-t">
                <td className="py-1.5 font-mono">{a.code}</td>
                <td>{a.blockOrder.map((b) => STAGE_LABEL[b]).join(" → ")}</td>
                <td>{a.waterOrder.map((c) => CONDITION_MARK[c]).join(" ")}</td>
                <td>{a.beanOrder.map((c) => CONDITION_MARK[c]).join(" → ")}</td>
                <td className="text-right">
                  <button
                    onClick={() => onPick(a.code)}
                    disabled={!recipe}
                    className="rounded border px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                  >
                    시작
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded border bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">3. 기록 내려받기 (CSV)</h2>
        <p className="mb-2 text-slate-600">
          무효 시행도 함께 내려갑니다. 분석에서 뺄지는 valid 열로 정합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={experimentExportUrl(STUDY, "summary")} className={btn} download>
            시행 요약
          </a>
          <a href={experimentExportUrl(STUDY, "curves")} className={btn} download>
            곡선 데이터
          </a>
        </div>
      </div>
    </section>
  );
}

function trialLabel(t: PlannedTrial): string {
  return `${STAGE_LABEL[t.stage]} · 화면 ${CONDITION_MARK[t.condition]} · ${t.trialNo}회차`;
}

function Run({
  code,
  plan,
  recipe,
  onExit,
}: {
  code: string;
  plan: PlannedTrial[];
  recipe: Recipe;
  onExit: () => void;
}) {
  const target: Curve = useMemo(() => recipe.targetCurve, [recipe]);
  const scale = useScale();
  const brew = useBrewSession(scale.source, target);
  useWakeLock(brew.phase === "RUNNING" || brew.phase === "PAUSED");

  const [records, setRecords] = useState<ExperimentTrial[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const [saved, setSaved] = useState<BrewResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTrial, setSavedTrial] = useState<ExperimentTrial | null>(null);
  const [note, setNote] = useState("");
  useLeaveWarning(isRecordAtRisk(brew.phase, saving, saveError !== null));

  const refresh = useCallback(async () => {
    try {
      const { items } = await api.listTrials(STUDY, code);
      setRecords(items);
      setLoadError(null);
      return items;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [code]);

  // 처음 열 때 서버 기록으로 어디까지 했는지 찾아 다음 시행을 고릅니다.
  useEffect(() => {
    api
      .listTrials(STUDY, code)
      .then(({ items }) => {
        setRecords(items);
        setSelected(nextTrialIndex(plan, doneKeys(items)));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [code, plan]);

  const done = useMemo(() => doneKeys(records), [records]);
  const trial = selected === null ? null : plan[selected];

  const getRecord = brew.getRecord;
  const saveRecord = useCallback(async () => {
    const record = getRecord();
    if (!record || !trial) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await api.saveBrew({
        recipeId: recipe.recipeId,
        ...record,
        experiment: {
          study: STUDY,
          participantCode: code,
          stage: trial.stage,
          condition: trial.condition,
          trialNo: trial.trialNo,
        },
      });
      setSaved(result);
      const items = await refresh();
      setSavedTrial(items?.find((r) => r.trialId === result.trialId) ?? null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [getRecord, trial, recipe.recipeId, code, refresh]);

  // 드리퍼를 들어 무게가 빠지면 저절로 끝나고 저장합니다 (추출 화면과 같은 동작).
  const registerDropEnd = brew.onDropEnd;
  const stopTimer = scale.stopTimer;
  useEffect(() => {
    registerDropEnd(() => {
      void stopTimer();
      void saveRecord();
    });
    return () => registerDropEnd(null);
  }, [registerDropEnd, stopTimer, saveRecord]);

  const start = () => {
    brew.start();
    void scale.resetTimer().then(() => scale.startTimer());
  };

  const finish = async () => {
    brew.finish();
    void scale.stopTimer();
    await saveRecord();
  };

  const clearRun = () => {
    setSaved(null);
    setSavedTrial(null);
    setSaveError(null);
    setNote("");
    brew.reset();
    void scale.resetTimer();
  };

  /** 다음 시행으로. 무효로 표시했다면 같은 시행을 다시 합니다. */
  const goNext = async () => {
    const items = (await refresh()) ?? records;
    clearRun();
    setSelected(nextTrialIndex(plan, doneKeys(items)));
  };

  const markInvalid = async (valid: boolean) => {
    if (!savedTrial) return;
    try {
      const updated = await api.updateTrial(savedTrial.trialId, {
        valid,
        note: note.trim() || null,
      });
      setSavedTrial(updated);
      await refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  const idle = brew.phase === "IDLE";
  const running = brew.phase === "RUNNING";
  const paused = brew.phase === "PAUSED";
  const finished = brew.phase === "FINISHED";
  const connected = scale.status === "CONNECTED";
  const allDone = nextTrialIndex(plan, done) === null;

  return (
    <section className="space-y-4">
      {/* 진행자 줄. 작게 둡니다 — 참가자가 보는 것은 아래 화면입니다. */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-mono font-medium text-slate-700">{code}</span>
        {trial && selected !== null && (
          <span>
            시행 {selected + 1} / {plan.length} · {trialLabel(trial)}
          </span>
        )}
        <span
          className={`rounded px-2 py-0.5 ${connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
        >
          {connected ? "저울 연결됨" : "저울 연결 안 됨"}
        </span>
        {idle && (
          <button onClick={onExit} className="ml-auto underline">
            참가자 바꾸기
          </button>
        )}
      </div>

      {loadError && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          기록을 불러오지 못했습니다: {loadError}
        </p>
      )}

      {allDone && idle && (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="font-medium">이 참가자의 시행을 모두 마쳤습니다</div>
          <div className="mt-1">사후 질문을 진행하고 기록지를 작성해 주세요.</div>
        </div>
      )}

      {/* 시행 전 안내 — 진행자가 읽고 준비합니다. */}
      {trial && selected !== null && idle && (
        <div className="space-y-2 rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          {startsNewBlock(plan, selected) && (
            <div className="font-medium">블록이 바뀝니다. 5분 휴식 후 진행하세요.</div>
          )}
          <div>
            준비:{" "}
            {trial.stage === "BEAN"
              ? "새 필터를 적시고 원두 20 g을 넣은 뒤 영점을 맞춥니다."
              : "서버를 비우고 적신 필터를 끼운 드리퍼를 올린 뒤 영점을 맞춥니다."}
          </div>
          {scriptBefore(plan, selected).map((line) => (
            <div key={line} className="rounded bg-white p-2 text-slate-800">
              <span className="mr-1 text-xs text-sky-700">읽어 주세요</span>“{line}”
            </div>
          ))}
        </div>
      )}

      {trial && (
        <ExperimentDisplay
          flags={CONDITIONS[trial.condition]}
          target={target}
          elapsedSec={brew.elapsedSec}
          weightG={brew.weightG}
          chartData={brew.chartData}
          active={running || paused}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {idle ? (
          !connected ? (
            <button
              onClick={scale.connect}
              disabled={!scale.isSupported || scale.status === "CONNECTING"}
              className={btnPrimary}
            >
              저울 연결
            </button>
          ) : (
            <button onClick={start} disabled={!trial} className={btnPrimary}>
              시작
            </button>
          )
        ) : running || paused ? (
          <>
            {(running || paused) && scale.status === "DISCONNECTED" && (
              <button onClick={scale.connect} className={btn}>
                저울 다시 연결
              </button>
            )}
            <button onClick={finish} className={btnPrimary}>
              종료
            </button>
          </>
        ) : null}
        <button onClick={scale.tare} disabled={!connected || running} className={btn}>
          영점
        </button>
      </div>

      {finished && (
        <div className="space-y-3 rounded border bg-white p-4 text-sm">
          {saving && <p className="text-slate-600">저장하는 중…</p>}
          {saveError && (
            <div className="text-red-700">
              저장하지 못했습니다: {saveError}
              {!saved && (
                <button onClick={saveRecord} className={`${btn} ml-2`}>
                  다시 저장
                </button>
              )}
            </div>
          )}
          {saved && (
            <>
              <div className="text-emerald-800">
                저장했습니다 (시행 #{saved.trialId}){brew.endedByDrop && " · 무게가 빠져 자동 종료"}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  placeholder="특이사항 (예: 연결 끊김, 물 넘침)"
                  className="min-w-56 flex-1 rounded border px-2 py-1.5"
                />
                {savedTrial?.valid === false ? (
                  <button onClick={() => markInvalid(true)} className={btn}>
                    무효 취소
                  </button>
                ) : (
                  <button onClick={() => markInvalid(false)} className={btn}>
                    무효로 표시
                  </button>
                )}
              </div>
              {savedTrial?.valid === false && (
                <p className="text-amber-700">
                  무효로 표시했습니다. 다음 시행에서 같은 시행을 다시 합니다.
                </p>
              )}
              <button onClick={goNext} className={btnPrimary}>
                다음 시행
              </button>
            </>
          )}
        </div>
      )}

      {/* 전체 순서. 시행을 건너뛰거나 다시 하려면 여기서 고릅니다 (추출 전에만). */}
      <div className="rounded border bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">시행 순서</h2>
        <ol className="space-y-1">
          {plan.map((t, i) => {
            const key = trialKey(t);
            const invalidCount = records.filter((r) => trialKey(r) === key && !r.valid).length;
            const status = done.has(key)
              ? "완료"
              : invalidCount > 0
                ? `무효 ${invalidCount}회`
                : "대기";
            return (
              <li key={key}>
                <button
                  onClick={() => setSelected(i)}
                  disabled={!idle}
                  className={`flex w-full items-center gap-3 rounded px-2 py-1 text-left disabled:cursor-not-allowed ${
                    i === selected ? "bg-slate-900 text-white" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="w-6 text-right font-mono text-xs opacity-70">{i + 1}</span>
                  <span className="flex-1">{trialLabel(t)}</span>
                  <span className="text-xs opacity-80">{status}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
