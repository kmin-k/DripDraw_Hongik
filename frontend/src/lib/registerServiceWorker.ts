/**
 * 서비스 워커 등록 — "홈 화면에 설치"를 가능하게 합니다.
 *
 * **개발 중에는 등록하지 않습니다.** Vite의 HMR과 서비스 워커가 얽히면
 * 코드를 고쳤는데 화면이 안 바뀌는 상황이 생기고, 원인이 어느 쪽인지 알기 어렵습니다.
 * 설치 동작을 확인하려면 `npm run build && npm run preview`로 빌드본을 띄우세요.
 *
 * 워커 자체는 아무것도 캐시하지 않습니다 (public/sw.js 참고).
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (!("serviceWorker" in navigator)) return;

  // 첫 화면 렌더를 늦추지 않도록 load 이후에 등록합니다.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // 등록에 실패해도 앱은 그대로 동작합니다. 설치만 안 될 뿐입니다.
      console.warn("서비스 워커 등록 실패 — 앱 설치 기능만 비활성화됩니다", error);
    });
  });
}
