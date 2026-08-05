/**
 * 데모 시나리오 4번 — 맛 평가와 보정 결과.
 *
 * Phase 4에서 들어갈 것:
 * - 신맛·쓴맛·농도 3개 입력 (중립 dead zone)
 * - POST /api/recipe/adjust 호출 후 changes 표 표시 — "무엇이 왜 바뀌었는지"가 발표의 핵심
 * - 이전 vs 신규 Target Curve 겹쳐 보기 → [유지] / [적용]
 */
export default function FeedbackPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold">맛 평가</h1>
      <p className="text-sm text-slate-500">Phase 4에서 구현합니다.</p>
    </section>
  );
}
