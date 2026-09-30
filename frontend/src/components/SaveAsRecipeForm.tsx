import { useEffect, useState } from "react";

import {
  api,
  type Bean,
  type BeanCreate,
  type DrinkType,
  type Recipe,
  type SaveAsRecipeRequest,
} from "../lib/api";
import { DRINK, PROCESS, REGION, ROAST } from "../lib/labels";
import { loadSettings } from "../lib/settings";

/**
 * 자유 추출을 다음 목표로 저장하는 폼.
 *
 * 추출 화면과 기록 상세 두 곳에서 쓰므로 한 곳에 둡니다. 필드가 늘어나면서
 * 두 벌로 두면 한쪽만 고쳐 어긋나기 쉬워졌습니다.
 *
 * 원두는 셋 중 하나입니다 — 연결 안 함 / 등록된 원두 고르기 / **지금 새로 등록**.
 * 마지막이 있는 이유는, 원두를 미리 등록하지 않고 먼저 내린 뒤 저장하는 흐름이
 * 실제로는 더 자연스럽기 때문입니다.
 */

interface Props {
  brewId: number;
  onSaved: (recipe: Recipe) => void;
  onCancel: () => void;
}

type BeanChoice = "none" | "existing" | "new";

const EMPTY_BEAN: BeanCreate = {
  name: "",
  roaster: "",
  region: "AFRICA",
  process: "WASHED",
  roastLevel: "LIGHT",
};

const inputClass =
  "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none";
const btn = "rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40";
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

export default function SaveAsRecipeForm({ brewId, onSaved, onCancel }: Props) {
  const defaults = loadSettings();
  const [name, setName] = useState("");
  const [doseG, setDoseG] = useState(defaults.doseG);
  const [drinkType, setDrinkType] = useState<DrinkType>(defaults.drinkType);

  const [beanChoice, setBeanChoice] = useState<BeanChoice>("none");
  const [beans, setBeans] = useState<Bean[]>([]);
  const [beanId, setBeanId] = useState<number | null>(null);
  const [newBean, setNewBean] = useState<BeanCreate>(EMPTY_BEAN);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listBeans()
      .then((res) => setBeans(res.items))
      .catch(() => setBeans([]));
  }, []);

  const updateBean = <K extends keyof BeanCreate>(key: K, value: BeanCreate[K]) =>
    setNewBean((prev) => ({ ...prev, [key]: value }));

  // 새 원두를 고르고 이름을 안 적었으면 저장할 수 없습니다. 이름 없는 원두는 목록에서 구분이 안 됩니다.
  const newBeanIncomplete = beanChoice === "new" && !newBean.name.trim();
  const existingBeanMissing = beanChoice === "existing" && beanId === null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: SaveAsRecipeRequest = {
        doseG,
        drinkType,
        // 빈 문자열과 "이름 없음"은 다릅니다. 비웠으면 아예 보내지 않습니다.
        name: name.trim() || null,
      };
      if (beanChoice === "existing") body.beanId = beanId;
      if (beanChoice === "new") {
        body.newBean = {
          ...newBean,
          name: newBean.name.trim(),
          roaster: newBean.roaster?.trim() || null,
        };
      }
      onSaved(await api.saveBrewAsRecipe(brewId, body));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="레시피 이름 (선택)">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 주말 아침용"
          maxLength={100}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="원두량 (g)">
          <input
            type="number"
            min={10}
            max={30}
            value={doseG}
            onChange={(e) => setDoseG(Number(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="음용 방식">
          <select
            value={drinkType}
            onChange={(e) => setDrinkType(e.target.value as DrinkType)}
            className={inputClass}
          >
            {Object.entries(DRINK).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="text-sm">
        <span className="mb-1 block text-slate-600">원두</span>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["none", "연결 안 함"],
              ["existing", "등록된 원두"],
              ["new", "지금 새로 등록"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setBeanChoice(value)}
              // 등록된 원두가 없으면 고를 것이 없습니다. 빈 목록을 보여주지 않습니다.
              disabled={value === "existing" && beans.length === 0}
              className={`rounded border px-3 py-1.5 text-sm disabled:opacity-40 ${
                beanChoice === value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {beanChoice === "existing" && (
        <select
          value={beanId ?? ""}
          onChange={(e) => setBeanId(e.target.value ? Number(e.target.value) : null)}
          className={inputClass}
        >
          <option value="">원두를 고르세요</option>
          {beans.map((bean) => (
            <option key={bean.id} value={bean.id}>
              {bean.name}
              {bean.roaster ? ` · ${bean.roaster}` : ""}
            </option>
          ))}
        </select>
      )}

      {beanChoice === "new" && (
        <div className="space-y-3 rounded border border-dashed border-slate-300 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="원두 이름">
              <input
                className={inputClass}
                value={newBean.name}
                onChange={(e) => updateBean("name", e.target.value)}
                placeholder="예: 에티오피아 무라고"
              />
            </Field>
            <Field label="로스터리 (선택)">
              <input
                className={inputClass}
                value={newBean.roaster ?? ""}
                onChange={(e) => updateBean("roaster", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="로스팅">
              <select
                className={inputClass}
                value={newBean.roastLevel}
                onChange={(e) =>
                  updateBean("roastLevel", e.target.value as BeanCreate["roastLevel"])
                }
              >
                {Object.entries(ROAST).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="지역">
              <select
                className={inputClass}
                value={newBean.region}
                onChange={(e) => updateBean("region", e.target.value as BeanCreate["region"])}
              >
                {Object.entries(REGION).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="가공">
              <select
                className={inputClass}
                value={newBean.process}
                onChange={(e) => updateBean("process", e.target.value as BeanCreate["process"])}
              >
                {Object.entries(PROCESS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            여기서 등록한 원두는 원두 목록과 레시피 화면에서도 그대로 쓸 수 있습니다.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={submit}
          disabled={saving || newBeanIncomplete || existingBeanMissing}
          className={btnPrimary}
        >
          {saving ? "저장하는 중…" : "저장"}
        </button>
        <button onClick={onCancel} className={btn}>
          취소
        </button>
      </div>

      <p className="text-xs text-slate-500">
        실측 그대로가 아니라 <b>주수 구간만 뽑아 따라 하기 쉬운 곡선</b>으로 다듬어 저장합니다.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
