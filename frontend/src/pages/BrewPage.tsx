import { useScale } from "../ble/useScale";
import type { ScaleStatus } from "../ble/types";

/**
 * 데모 시나리오 3번 — 시연 성패를 가르는 화면.
 *
 * 지금은 Phase 1 완료 기준("물을 부으면 화면 숫자가 실시간으로 따라 올라감")까지만 만듭니다.
 * Phase 2에서 여기에 들어갈 것:
 * - Recharts 이중 라인 (Target 점선 / Actual 실선)
 * - RMSE 실시간 표시, 페이스 인디케이터
 *
 * ⚠️ 곡선 데이터 적재는 setInterval이 아니라 저울의 notify 이벤트를 기준으로 합니다.
 * 백그라운드 탭에서 타이머가 1초로 throttle되기 때문입니다.
 */

const STATUS_LABEL: Record<ScaleStatus, { text: string; className: string }> = {
  DISCONNECTED: { text: "연결 안 됨", className: "bg-slate-200 text-slate-600" },
  CONNECTING: { text: "연결 중…", className: "bg-amber-100 text-amber-700" },
  CONNECTED: { text: "연결됨", className: "bg-emerald-100 text-emerald-700" },
  RECONNECTING: { text: "재연결 중…", className: "bg-amber-100 text-amber-700" },
};

export default function BrewPage() {
  const scale = useScale();
  const label = STATUS_LABEL[scale.status];
  const connected = scale.status === "CONNECTED";

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">추출</h1>
        <span className={`rounded px-2 py-0.5 text-xs ${label.className}`}>{label.text}</span>
        {scale.packetCount > 0 && (
          <span className="text-xs text-slate-400">수신 {scale.packetCount}</span>
        )}
      </div>

      {!scale.isSupported && (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome 또는 Edge를 쓰세요. iOS는 지원하지
          않아 노트북에서 시연합니다.
        </p>
      )}

      <div className="rounded border bg-white p-8 text-center">
        <div
          className={`font-mono text-6xl tabular-nums ${
            scale.weight === null ? "text-slate-300" : "text-slate-900"
          }`}
        >
          {scale.weight === null ? "—.—" : scale.weight.toFixed(1)}
          <span className="ml-2 text-2xl text-slate-400">g</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {connected ? (
          <button
            onClick={scale.disconnect}
            className="rounded border px-4 py-2 text-sm hover:bg-slate-50"
          >
            연결 해제
          </button>
        ) : (
          <button
            onClick={scale.connect}
            disabled={!scale.isSupported || scale.status === "CONNECTING"}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            저울 연결
          </button>
        )}

        <button
          onClick={scale.tare}
          disabled={!connected}
          className="rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          영점
        </button>
        <button
          onClick={scale.startTimer}
          disabled={!connected}
          className="rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          타이머 시작
        </button>
        <button
          onClick={scale.stopTimer}
          disabled={!connected}
          className="rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          정지
        </button>
        <button
          onClick={scale.resetTimer}
          disabled={!connected}
          className="rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          타이머 리셋
        </button>
      </div>

      {scale.error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {scale.error}
        </p>
      )}

      <p className="text-sm text-slate-500">Phase 2에서 실시간 곡선과 RMSE가 들어갑니다.</p>
    </section>
  );
}
