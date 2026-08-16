import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, type Bean, type BeanCreate } from "../lib/api";
import { PROCESS, REGION, ROAST } from "../lib/labels";

/**
 * 데모 시나리오 1번 — 원두 등록.
 *
 * 등록해 두면 레시피 화면에서 골라 쓸 수 있고, 추출 기록에 원두 이름이 남습니다.
 * 지역·가공·로스팅이 Rule Engine의 입력이라, 원두를 고르는 것만으로 조건이 정해집니다.
 */

const EMPTY: BeanCreate = {
  name: "",
  roaster: "",
  region: "AFRICA",
  process: "WASHED",
  roastLevel: "LIGHT",
  memo: "",
};

const inputClass =
  "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none";
const btnPrimary =
  "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export default function BeansPage() {
  const navigate = useNavigate();
  const [beans, setBeans] = useState<Bean[] | null>(null);
  const [form, setForm] = useState<BeanCreate>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listBeans()
      .then((res) => setBeans(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const update = <K extends keyof BeanCreate>(key: K, value: BeanCreate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      // 비어 있는 선택 항목은 보내지 않습니다. 빈 문자열과 "입력하지 않음"은 다릅니다.
      const created = await api.createBean({
        ...form,
        name: form.name.trim(),
        roaster: form.roaster?.trim() || null,
        memo: form.memo?.trim() || null,
      });
      setBeans((prev) => [created, ...(prev ?? [])]);
      setForm(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <h1 className="text-lg font-semibold">원두</h1>

      <div className="space-y-3 rounded border bg-white p-4">
        <h2 className="text-sm font-semibold">새 원두 등록</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="이름">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="예: 예가체프 G1"
            />
          </Field>
          <Field label="로스터리 (선택)">
            <input
              className={inputClass}
              value={form.roaster ?? ""}
              onChange={(e) => update("roaster", e.target.value)}
            />
          </Field>
          <Field label="로스팅">
            <select
              className={inputClass}
              value={form.roastLevel}
              onChange={(e) => update("roastLevel", e.target.value as BeanCreate["roastLevel"])}
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
              value={form.region}
              onChange={(e) => update("region", e.target.value as BeanCreate["region"])}
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
              value={form.process}
              onChange={(e) => update("process", e.target.value as BeanCreate["process"])}
            >
              {Object.entries(PROCESS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="메모 (선택)">
            <input
              className={inputClass}
              value={form.memo ?? ""}
              onChange={(e) => update("memo", e.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={saving || !form.name.trim()} className={btnPrimary}>
            {saving ? "저장하는 중…" : "등록"}
          </button>
          <span className="text-xs text-slate-500">
            지역·가공·로스팅은 <b>레시피 계산에 그대로 쓰입니다.</b>
          </span>
        </div>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {beans === null ? (
        <p className="rounded border bg-white p-8 text-center text-sm text-slate-500">
          불러오는 중…
        </p>
      ) : beans.length === 0 ? (
        <p className="rounded border bg-white p-8 text-center text-sm text-slate-600">
          등록한 원두가 없습니다. 위에서 하나 추가해 보세요.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">이름</th>
                <th className="px-3 py-2 font-medium">로스터리</th>
                <th className="px-3 py-2 font-medium">지역</th>
                <th className="px-3 py-2 font-medium">가공</th>
                <th className="px-3 py-2 font-medium">로스팅</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {beans.map((bean) => (
                <tr key={bean.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{bean.name}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {bean.roaster ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{REGION[bean.region]}</td>
                  <td className="px-3 py-2 text-slate-600">{PROCESS[bean.process]}</td>
                  <td className="px-3 py-2 text-slate-600">{ROAST[bean.roastLevel]}</td>
                  <td className="px-3 py-2 text-right">
                    {/* 등록만 하고 끝나면 왜 있는 화면인지 알 수 없습니다. 바로 다음 단계로 잇습니다. */}
                    <button
                      onClick={() => navigate("/recipe", { state: { beanId: bean.id } })}
                      className="text-xs text-sky-700 hover:underline"
                    >
                      이 원두로 레시피 만들기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
