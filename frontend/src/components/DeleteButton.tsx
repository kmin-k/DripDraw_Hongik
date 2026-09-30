import { useState } from "react";

/**
 * 두 번 눌러야 지워지는 삭제 버튼.
 *
 * `window.confirm`은 설치한 앱에서 브라우저 대화상자가 튀어나와 앱처럼 보이지 않습니다.
 * 대신 버튼 자리에서 "정말 지울까요?"로 바뀌고, 한 번 더 누르면 지웁니다.
 * 다른 곳을 누르거나 취소하면 원래대로 돌아갑니다.
 */

interface Props {
  /** 확인 단계에 보여줄 한 줄. 무엇이 같이 사라지고 무엇이 남는지 적습니다. */
  warning: string;
  onConfirm: () => Promise<void>;
  /** 처음 버튼의 글자. 기본 "삭제". */
  label?: string;
  className?: string;
}

const btn = "rounded border px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40";

export default function DeleteButton({ warning, onConfirm, label = "삭제", className }: Props) {
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setArming(false);
    }
    // 성공하면 보통 이 컴포넌트가 화면에서 사라지므로 상태를 되돌리지 않습니다.
  };

  if (!arming) {
    return (
      <span className={className}>
        <button type="button" onClick={() => setArming(true)} className={`${btn} text-red-700`}>
          {label}
        </button>
        {error && <span className="ml-2 text-xs text-red-700">{error}</span>}
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <span className="text-xs text-slate-600">{warning}</span>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="rounded bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        {busy ? "지우는 중…" : "지우기"}
      </button>
      <button type="button" onClick={() => setArming(false)} disabled={busy} className={btn}>
        취소
      </button>
    </span>
  );
}
