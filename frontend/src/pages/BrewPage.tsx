/**
 * 데모 시나리오 3번 — 시연 성패를 가르는 화면.
 *
 * Phase 2에서 여기에 들어갈 것:
 * - Recharts 이중 라인 (Target 점선 / Actual 실선)
 * - RMSE 실시간 표시, 페이스 인디케이터
 * - 컨트롤: 시작·일시정지·종료·리셋·영점
 *
 * ⚠️ 샘플링은 setInterval이 아니라 BLE notify 이벤트를 기준으로 적재합니다.
 * 백그라운드 탭에서 타이머가 1초로 throttle되기 때문입니다.
 */
export default function BrewPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold">추출</h1>
      <div className="rounded border bg-white p-8 text-center">
        <div className="font-mono text-5xl text-slate-300">—.— g</div>
        <p className="mt-4 text-sm text-slate-500">
          Phase 2에서 실시간 곡선과 RMSE가 들어갑니다.
        </p>
      </div>
    </section>
  );
}
