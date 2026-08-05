import { useEffect, useState } from "react";

import { api, type Bean } from "../lib/api";

/**
 * 데모 시나리오 2번 — 입력하면 Target Curve가 즉시 그려지는 화면.
 * 지금은 백엔드 연결만 확인하는 뼈대입니다. Phase 3에서 POST /api/recipe/generate를 붙입니다.
 */
export default function RecipePage() {
  const [health, setHealth] = useState<string>("확인 중…");
  const [beans, setBeans] = useState<Bean[]>([]);

  useEffect(() => {
    api
      .health()
      .then((r) => setHealth(r.status))
      .catch((e: Error) => setHealth(`실패: ${e.message}`));
    api
      .listBeans()
      .then((r) => setBeans(r.items))
      .catch(() => setBeans([]));
  }, []);

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold">레시피 생성</h1>

      <div className="rounded border bg-white p-4 text-sm">
        <div>
          백엔드 상태: <span className="font-mono">{health}</span>
        </div>
        <div className="mt-1 text-slate-500">
          등록된 원두 {beans.length}종
          {beans.length > 0 && ` — ${beans.map((b) => b.name).join(", ")}`}
        </div>
      </div>

      <p className="text-sm text-slate-500">
        Phase 3에서 입력 폼과 Target Curve 미리보기가 들어갑니다.
      </p>
    </section>
  );
}
