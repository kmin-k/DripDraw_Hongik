import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { DrinkType } from "../lib/api";
import { DRINK } from "../lib/labels";
import { loadSettings } from "../lib/settings";
import { CONFIDENCE_LABEL, GRIND_PHOTO_HINT, useGrindMeasure } from "../lib/useGrindMeasure";

/**
 * 분쇄도만 재는 화면.
 *
 * 레시피 화면에도 같은 측정 버튼이 있지만, 그라인더 눈금을 맞추려는 사람은 레시피까지
 * 갈 이유가 없습니다. 사진 → 분쇄도 → "몇 단계 곱게/굵게"까지가 이 화면의 전부입니다.
 *
 * 마커가 없으면 시작을 못 하므로 인쇄용 파일을 여기서 바로 받게 합니다.
 */

const btn = "rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40";
const btnPrimary =
  "rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40";

export default function GrindPage() {
  const navigate = useNavigate();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [drinkType, setDrinkType] = useState<DrinkType>(() => loadSettings().drinkType);
  // 안내는 음용 방식마다 달라 다시 재야 합니다. 마지막 사진을 들고 있다가 바꾸면 그 사진으로 다시 묻습니다.
  const [photo, setPhoto] = useState<File | null>(null);
  const { measuring, result, error, measure } = useGrindMeasure();

  const run = (file: File, drink: DrinkType) => {
    setPhoto(file);
    void measure(file, drink);
  };

  const changeDrink = (next: DrinkType) => {
    setDrinkType(next);
    if (photo) void measure(photo, next);
  };

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">분쇄도 측정</h1>
        <p className="mt-1 text-sm text-slate-600">
          갈아둔 원두 사진 한 장으로 입자 크기를 재고, 그라인더를 어느 쪽으로 돌릴지 알려드립니다.
        </p>
      </div>

      {/* 준비물 — 마커가 없으면 크기를 잴 기준이 없습니다. */}
      <div className="rounded-xl border bg-white p-4 text-sm">
        <div className="font-medium">준비물: 기준 마커</div>
        <p className="mt-1 text-slate-600">
          사진 속 크기를 실제 크기로 바꾸려면 크기를 아는 기준이 필요합니다. 아래 파일을{" "}
          <b>"실제 크기(100%)"</b>로 인쇄해 한 장 잘라 쓰세요.
        </p>
        <a
          href="/marker-20mm.pdf"
          download
          className="mt-3 inline-block rounded border px-3 py-1.5 text-xs hover:bg-slate-50"
        >
          🖨 마커 인쇄 파일 받기 (A4 PDF)
        </a>
        <p className="mt-2 text-xs text-slate-500">
          인쇄 후 검은 사각형 한 변이 <b>20 mm</b>인지 자로 확인하세요. "페이지에 맞춤"으로 인쇄하면
          크기가 달라져 측정값이 틀립니다.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border bg-white p-4">
        <div className="text-sm">
          <span className="mb-1 block text-slate-600">어떻게 마실 건가요?</span>
          <div className="flex gap-2">
            {(Object.entries(DRINK) as [DrinkType, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeDrink(value)}
                disabled={measuring}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-60 ${
                  drinkType === value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            핫과 아이스는 알맞은 분쇄도가 달라 안내가 달라집니다.
          </p>
        </div>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) run(file, drinkType);
          }}
        />
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={measuring}
          className={`w-full ${btnPrimary}`}
        >
          {measuring
            ? "사진 분석 중…"
            : result
              ? "📷 다른 사진으로 다시 재기"
              : "📷 사진 찍기 / 고르기"}
        </button>
        <p className="text-xs text-slate-500">
          {measuring ? "분석에 몇 초 걸립니다." : GRIND_PHOTO_HINT}
        </p>
      </div>

      {error && !measuring && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && !measuring && (
        <div className="space-y-3 rounded-xl border bg-white p-5 text-center">
          <div className="text-xs text-slate-500">입자 크기 (D50)</div>
          <div className="font-mono text-4xl tabular-nums">
            {Math.round(result.d50Um)}
            <span className="ml-1 text-lg text-slate-400">μm</span>
          </div>

          {/* 이 화면에 온 이유가 이 한 줄입니다. 가장 크게 둡니다. */}
          <div className="text-xl font-semibold">{result.guide}</div>
          <div className="text-xs text-slate-500">{DRINK[drinkType]} 기준</div>

          {result.confidence === "LOW" ? (
            <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
              신뢰도 낮음 — 마커와 가루가 화면을 더 채우도록 가까이에서 다시 찍어보세요.
            </p>
          ) : (
            <p className="text-xs text-slate-500">신뢰도 {CONFIDENCE_LABEL[result.confidence]}</p>
          )}

          <p className="text-xs text-slate-400">
            사진 조건에 따라 값이 달라질 수 있어 <b>조정 방향을 보는 용도</b>로 쓰세요.
          </p>

          <button
            type="button"
            onClick={() => navigate("/recipe", { state: { grind: result } })}
            className={btn}
          >
            이 분쇄도로 레시피 만들기 →
          </button>
        </div>
      )}
    </section>
  );
}
