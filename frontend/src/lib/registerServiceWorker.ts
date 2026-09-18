/**
 * 서비스 워커 등록 — "홈 화면에 설치"를 가능하게 합니다.
 *
 * 개발 서버(5180)에서도 등록합니다. 설치한 앱은 설치한 주소에 고정되므로,
 * 빌드본(4173)에서 설치하면 평소 켜 두는 개발 서버로는 열리지 않습니다.
 * 워커가 아무것도 캐시하지 않아 HMR과 얽힐 일도 없습니다 (public/sw.js 참고).
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  // 첫 화면 렌더를 늦추지 않도록 load 이후에 등록합니다.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      // 등록에 실패해도 앱은 그대로 동작합니다. 설치만 안 될 뿐입니다.
      console.warn("서비스 워커 등록 실패 — 앱 설치 기능만 비활성화됩니다", error);
    });
  });
}
