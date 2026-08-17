import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { DrinkType } from "../lib/api";
import { DRINK } from "../lib/labels";
import { loadSettings, saveSettings } from "../lib/settings";

/**
 * 처음 한 번만 보이는 안내.
 *
 * **받은 값은 전부 실제로 씁니다.** 원두량·음용 방식은 레시피 화면의 시작값이 됩니다.
 * 선호 맛(산미·농도)은 묻지 않습니다 — Rule Engine이 그 값을 입력으로 받지 않아서,
 * 물어보면 어디에도 반영되지 않는 질문이 됩니다.
 */

const STEPS = [
  {
    icon: "📈",
    title: "목표 곡선을 만듭니다",
    body: "원두 조건을 넣으면 언제 얼마나 부어야 하는지 계산해 곡선으로 보여줍니다.",
  },
  {
    icon: "⚖️",
    title: "저울이 실시간으로 따라갑니다",
    body: "블루투스 저울을 연결하면 실제로 부은 양이 목표 위에 겹쳐 그려지고, 얼마나 가까운지 숫자로 나옵니다.",
  },
  {
    icon: "☕",
    title: "맛을 알려주면 다음이 좋아집니다",
    body: "쓴맛이 강했다고 알려주면 물 온도·유량·분쇄도를 조정한 레시피를 제안합니다.",
  },
];

const btnPrimary = "rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white";
const btn = "rounded-lg border px-5 py-2.5 text-sm hover:bg-slate-50";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [doseG, setDoseG] = useState(loadSettings().doseG);
  const [drinkType, setDrinkType] = useState<DrinkType>(loadSettings().drinkType);

  const finish = () => {
    saveSettings({ doseG, drinkType, onboarded: true });
    navigate("/", { replace: true });
  };

  const isLast = step === STEPS.length;

  return (
    <section className="mx-auto max-w-md space-y-6 py-6">
      {/* 몇 장 남았는지 보이지 않으면 사용자는 언제 끝나는지 모릅니다. */}
      <div className="flex justify-center gap-1.5">
        {[...STEPS, null].map((_, index) => (
          <span
            key={index}
            className={`h-1.5 w-8 rounded-full ${index <= step ? "bg-slate-900" : "bg-slate-200"}`}
          />
        ))}
      </div>

      {!isLast ? (
        <div className="space-y-4 rounded-xl border bg-white p-6 text-center">
          <div className="text-5xl">{STEPS[step].icon}</div>
          <h1 className="text-lg font-semibold">{STEPS[step].title}</h1>
          <p className="text-sm leading-relaxed text-slate-600">{STEPS[step].body}</p>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border bg-white p-6">
          <div className="text-center">
            <h1 className="text-lg font-semibold">자주 쓰는 값을 정해둘까요?</h1>
            <p className="mt-1 text-sm text-slate-600">
              레시피를 만들 때 이 값에서 시작합니다. 나중에 설정에서 바꿀 수 있습니다.
            </p>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">원두량 {doseG} g</span>
            <input
              type="range"
              min={10}
              max={30}
              value={doseG}
              onChange={(e) => setDoseG(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <div className="text-sm">
            <span className="mb-1 block text-slate-600">음용 방식</span>
            <div className="flex gap-2">
              {Object.entries(DRINK).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setDrinkType(value as DrinkType)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                    drinkType === value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        {/* 건너뛰어도 기본값으로 쓸 수 있어야 합니다. 막다른 길을 만들지 않습니다. */}
        <button onClick={finish} className="text-sm text-slate-500 hover:underline">
          건너뛰기
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className={btn}>
              이전
            </button>
          )}
          {!isLast ? (
            <button onClick={() => setStep((s) => s + 1)} className={btnPrimary}>
              다음
            </button>
          ) : (
            <button onClick={finish} className={btnPrimary}>
              시작하기
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
