import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { DrinkType } from "../lib/api";
import { DRINK } from "../lib/labels";
import { clearSettings, loadSettings, saveSettings, type Settings } from "../lib/settings";

/**
 * 설정. **화면이 실제로 쓰는 값만** 둡니다.
 *
 * 저장은 이 브라우저에만 합니다. 로그인이 없어 서버에 두면 누구의 취향인지 알 수 없습니다.
 */

const btn = "rounded-lg border px-4 py-2 text-sm hover:bg-slate-50";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-0">
      <span className="text-sm text-slate-700">{label}</span>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    setSaved(true);
  };

  const reset = () => {
    clearSettings();
    setSettings(loadSettings());
    navigate("/onboarding");
  };

  return (
    <section className="space-y-5">
      <h1 className="text-lg font-semibold">설정</h1>

      <div className="rounded-xl border bg-white">
        <Row label={`기본 원두량 — ${settings.doseG} g`}>
          <input
            type="range"
            min={10}
            max={30}
            value={settings.doseG}
            onChange={(e) => update({ doseG: Number(e.target.value) })}
            className="w-40"
          />
        </Row>

        <Row label="기본 음용 방식">
          <div className="flex gap-2">
            {Object.entries(DRINK).map(([value, label]) => (
              <button
                key={value}
                onClick={() => update({ drinkType: value as DrinkType })}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  settings.drinkType === value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>

        <Row label="사용 안내 다시 보기">
          <button onClick={() => navigate("/onboarding")} className={btn}>
            열기
          </button>
        </Row>

        <Row label="저장한 기본값 지우기">
          <button onClick={reset} className={btn}>
            초기화
          </button>
        </Row>
      </div>

      {saved && <p className="text-xs text-slate-500">변경한 값은 즉시 저장됩니다.</p>}

      <div className="rounded-xl border bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">저울</h2>
        <p className="text-slate-600">
          Felicita Arc를 <b>Chrome 또는 Edge</b>에서 블루투스로 연결합니다. 연결은 추출 화면에서
          합니다.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          iOS(사파리)는 Web Bluetooth를 지원하지 않아 저울 연결이 되지 않습니다.
        </p>
      </div>

      <p className="text-xs text-slate-500">
        추출 기록과 원두는 <b>서버에 저장</b>됩니다. 여기서 지워지지 않습니다.
      </p>
    </section>
  );
}
