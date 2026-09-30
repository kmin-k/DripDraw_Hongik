import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * 렌더 중 오류가 나도 화면 전체가 사라지지 않게 막습니다.
 *
 * React는 렌더에서 예외가 나면 **화면을 통째로 비웁니다.** 개발 중에 실제로 겪었는데,
 * import 하나를 빠뜨렸더니 흰 화면만 남고 아무 단서도 없었습니다.
 * 시연 도중에 이러면 복구할 방법이 없습니다.
 *
 * **한계** — 이 경계가 잡는 것은 *렌더 중* 오류뿐입니다.
 * 이벤트 핸들러, `setTimeout`, BLE 수신 콜백처럼 렌더 밖에서 나는 오류는 잡지 못합니다.
 * 그런 곳은 각자 try/catch로 처리해야 합니다 (useScale·useBrewSession이 그렇게 하고 있습니다).
 *
 * 클래스 컴포넌트인 이유는 React가 오류 경계를 훅으로 제공하지 않기 때문입니다.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const btn = "rounded border px-4 py-2 text-sm hover:bg-slate-50";
const btnPrimary = "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white";

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 화면에는 요약만 보여주고, 원인 추적에 필요한 것은 콘솔에 남깁니다.
    console.error("화면 렌더 중 오류", error, info.componentStack);
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">잠시 문제가 생겼어요</h1>

        {/* 빨강은 "고장"으로 읽힙니다. 대개 다시 시도하면 풀리는 상황이라 주의 색을 씁니다. */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p>
            이 화면을 불러오는 중에 문제가 있었습니다. <b>다시 시도</b>를 눌러 주세요.
          </p>
          {/* 추출 중이었다면 데이터가 남아 있지 않다는 것은 분명히 알려야 합니다. */}
          <p className="mt-2 text-xs text-amber-800">
            추출 중이었다면 그 기록은 저장되지 않았습니다. 저울 연결부터 다시 시작해 주세요.
          </p>

          {/* 원인 문구는 접어 둡니다. 평소에는 보이지 않되, 물어볼 때 펼쳐 읽을 수 있게 합니다. */}
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-amber-800">자세한 내용</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-xs text-slate-600">
              {error.message || String(error)}
            </pre>
          </details>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={this.retry} className={btnPrimary}>
            다시 시도
          </button>
          {/* 라우터를 거치지 않고 새로 읽습니다. 상태가 깨진 채로 이동하면 또 같은 오류가 납니다. */}
          <a href="/" className={btn}>
            홈으로
          </a>
        </div>
      </section>
    );
  }
}
