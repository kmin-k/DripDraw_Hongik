import { useState } from "react";

import { api, type DrinkType, type GrindAnalysis } from "./api";

/**
 * 사진으로 분쇄도 재기 — 레시피 화면과 분쇄도 화면이 같이 씁니다.
 *
 * 분석은 전부 서버가 합니다. 여기서는 올리고, 기다리고, 결과·오류를 들고 있기만 합니다.
 */
export function useGrindMeasure(initial: GrindAnalysis | null = null) {
  const [measuring, setMeasuring] = useState(false);
  const [result, setResult] = useState<GrindAnalysis | null>(initial);
  const [error, setError] = useState<string | null>(null);

  /** drinkType을 주면 그 기준으로 분쇄도 안내를 받습니다. 없으면 핫 기준입니다. */
  const measure = async (photo: File, drinkType?: DrinkType): Promise<GrindAnalysis | null> => {
    setMeasuring(true);
    setError(null);
    try {
      const measured = await api.analyzeGrind(photo, drinkType);
      setResult(measured);
      return measured;
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setMeasuring(false);
    }
  };

  return { measuring, result, error, measure };
}

export const CONFIDENCE_LABEL: Record<GrindAnalysis["confidence"], string> = {
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

/** 촬영 안내. 처음 보는 사람이 이 한 줄만 읽고 찍을 수 있어야 합니다. */
export const GRIND_PHOTO_HINT = "마커 옆에 원두 가루를 한꼬집 흩뿌리고 위에서 가까이 찍어주세요.";
