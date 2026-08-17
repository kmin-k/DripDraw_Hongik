import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api, type Bean, type Recipe, type RecipeRequest } from "../lib/api";
import { DRINK, PHASE, PROCESS, REGION, ROAST } from "../lib/labels";
import { loadSettings } from "../lib/settings";

/**
 * 데모 시나리오 2번 — 입력을 바꾸면 Target Curve가 즉시 달라지는 화면.
 *
 * 계산은 전부 서버(Rule Engine)가 합니다. 이 화면은 입력을 모아 보내고 받은 값을 그리기만 합니다.
 * 규칙을 프론트에 복제하면 서버와 반드시 어긋나기 때문입니다 (docs/rule-table.md).
 */

/** 원두량·음용 방식은 설정에 저장된 값에서 시작합니다 (온보딩에서 정합니다). */
function initialForm(): RecipeRequest {
  const settings = loadSettings();
  return {
    doseG: settings.doseG,
    drinkType: settings.drinkType,
    roastLevel: "LIGHT",
    region: "AFRICA",
    process: "WASHED",
    d50Um: 950,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none";

export default function RecipePage() {
  const navigate = useNavigate();
  // 원두 화면에서 원두를 지정해 넘어올 수 있습니다.
  const preselectBeanId = (useLocation().state as { beanId?: number } | null)?.beanId;

  const [form, setForm] = useState<RecipeRequest>(initialForm);
  const [beans, setBeans] = useState<Bean[]>([]);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 입력이 멈춘 뒤에만 호출합니다. 슬라이더를 끌 때마다 보내면 레시피 기록이 불필요하게 쌓입니다.
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        setRecipe(await api.generateRecipe(form));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form]);

  // 등록한 원두가 없어도 화면은 그대로 동작합니다. 목록은 선택지일 뿐입니다.
  useEffect(() => {
    api
      .listBeans()
      .then((res) => {
        setBeans(res.items);
        // 원두 화면에서 "이 원두로 레시피 만들기"로 넘어온 경우.
        // 목록을 받은 뒤에야 원두의 지역·가공·로스팅을 알 수 있습니다.
        const bean = res.items.find((b) => b.id === preselectBeanId);
        if (bean) {
          setForm((prev) => ({
            ...prev,
            beanId: bean.id,
            region: bean.region,
            process: bean.process,
            roastLevel: bean.roastLevel,
          }));
        }
      })
      .catch(() => setBeans([]));
  }, [preselectBeanId]);

  const update = <K extends keyof RecipeRequest>(key: K, value: RecipeRequest[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /**
   * 원두를 고르면 지역·가공·로스팅을 채워 넣습니다.
   *
   * beanId를 함께 보내는 이유는 두 가지입니다 — 서버가 원두 값을 기준으로 계산하고,
   * 레시피에 원두가 연결돼 히스토리에 이름이 나옵니다.
   */
  const selectBean = (beanId: number | null) => {
    const bean = beans.find((b) => b.id === beanId);
    if (!bean) {
      // 직접 입력으로 돌아갑니다. 조건은 건드리지 않고 연결만 끊습니다.
      setForm((prev) => ({ ...prev, beanId: undefined }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      beanId: bean.id,
      region: bean.region,
      process: bean.process,
      roastLevel: bean.roastLevel,
    }));
  };

  const fromBean = form.beanId !== undefined;

  // Recharts는 x가 숫자여도 기본은 카테고리 축이라, 시간 간격을 살리려면 type="number"가 필요합니다.
  const chartData = recipe?.targetCurve.map(([sec, gram]) => ({ sec, gram })) ?? [];

  return (
    <section className="space-y-5">
      <h1 className="text-lg font-semibold">레시피 생성</h1>

      {beans.length > 0 && (
        <div className="rounded border bg-white p-4">
          <Field label="등록한 원두">
            <select
              className={inputClass}
              value={form.beanId ?? ""}
              onChange={(e) => selectBean(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">직접 입력</option>
              {beans.map((bean) => (
                <option key={bean.id} value={bean.id}>
                  {bean.name}
                  {bean.roaster ? ` · ${bean.roaster}` : ""}
                </option>
              ))}
            </select>
          </Field>
          {form.beanId !== undefined && (
            <p className="mt-2 text-xs text-slate-500">
              생산 지역·가공 방식·로스팅은 <b>이 원두의 값을 따릅니다.</b> 다르게 지정하려면 직접
              입력을 고르세요.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 rounded border bg-white p-4 sm:grid-cols-3">
        <Field label={`원두량 ${form.doseG} g`}>
          <input
            type="range"
            min={10}
            max={30}
            value={form.doseG}
            onChange={(e) => update("doseG", Number(e.target.value))}
            className="w-full"
          />
        </Field>

        <Field label="음용 방식">
          <select
            className={inputClass}
            value={form.drinkType}
            onChange={(e) => update("drinkType", e.target.value as RecipeRequest["drinkType"])}
          >
            {Object.entries(DRINK).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        {/* 원두를 고른 경우 서버가 원두 값을 기준으로 계산합니다.
            여기서 바꿔도 반영되지 않으므로, 바꿀 수 있는 것처럼 보이지 않게 잠급니다. */}
        <Field label="로스팅">
          <select
            className={inputClass}
            disabled={fromBean}
            value={form.roastLevel}
            onChange={(e) => update("roastLevel", e.target.value as RecipeRequest["roastLevel"])}
          >
            {Object.entries(ROAST).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="생산 지역">
          <select
            className={inputClass}
            disabled={fromBean}
            value={form.region}
            onChange={(e) => update("region", e.target.value as RecipeRequest["region"])}
          >
            {Object.entries(REGION).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="가공 방식">
          <select
            className={inputClass}
            disabled={fromBean}
            value={form.process}
            onChange={(e) => update("process", e.target.value as RecipeRequest["process"])}
          >
            {Object.entries(PROCESS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="분쇄 입자 D50 (μm)">
          <input
            type="number"
            step={50}
            min={100}
            value={form.d50Um}
            onChange={(e) => update("d50Um", Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {recipe && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "물 온도", value: `${recipe.waterTempC} ℃` },
              { label: "총 물량", value: `${recipe.totalWaterG} g` },
              { label: "유량", value: `${recipe.flowRateGps} g/s` },
              { label: "총 시간", value: `${recipe.targetCurve.at(-1)?.[0] ?? 0} 초` },
            ].map((item) => (
              <div key={item.label} className="rounded border bg-white p-3">
                <div className="text-xs text-slate-500">{item.label}</div>
                <div className="font-mono text-xl tabular-nums">{item.value}</div>
              </div>
            ))}
          </div>

          <div className={`rounded border bg-white p-4 ${loading ? "opacity-60" : ""}`}>
            <div className="mb-2 text-sm text-slate-600">
              목표 추출 곡선 — 가로 시간(초), 세로 누적 물량(g)
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid stroke="#e2e8f0" />
                <XAxis dataKey="sec" type="number" domain={[0, "dataMax"]} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  formatter={(value) => [`${value} g`, "누적"]}
                  labelFormatter={(label) => `${label}초`}
                />
                {/* 구간 선형 곡선이므로 곡선 보간(monotone)을 쓰면 실제 규칙과 다른 모양이 됩니다. */}
                <Line
                  type="linear"
                  dataKey="gram"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="mb-2 text-sm text-slate-600">주수 계획</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-1">구간</th>
                  <th className="pb-1">물량</th>
                  <th className="pb-1">시작</th>
                  <th className="pb-1">종료</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {recipe.pours.map((pour) => (
                  <tr key={pour.phase} className="border-t">
                    <td className="py-1 font-sans">{PHASE[pour.phase]}</td>
                    <td>{pour.waterG} g</td>
                    <td>{pour.startSec}초</td>
                    <td>{pour.endSec}초</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-slate-600">분쇄도 안내 — {recipe.grindGuide}</p>
            {recipe.iceMessage && <p className="mt-1 text-sm text-sky-700">{recipe.iceMessage}</p>}
          </div>

          {/* 목표를 따라갈지, 내 방식대로 내리고 기록만 할지 고릅니다. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => navigate("/brew", { state: { recipe } })}
              className="rounded bg-slate-900 px-4 py-3 text-white"
            >
              <div className="text-sm font-medium">이 레시피로 추출하기</div>
              <div className="mt-0.5 text-xs text-slate-300">목표 곡선을 따라가고 정확도 측정</div>
            </button>
            <button
              onClick={() => navigate("/brew", { state: { free: true } })}
              className="rounded border border-slate-300 px-4 py-3 hover:bg-slate-50"
            >
              <div className="text-sm font-medium">레시피 없이 추출하기</div>
              <div className="mt-0.5 text-xs text-slate-500">내 방식대로 내리고 기록만</div>
            </button>
          </div>
        </>
      )}
    </section>
  );
}
