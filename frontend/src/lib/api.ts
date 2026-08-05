/**
 * 백엔드 호출 래퍼.
 *
 * 계산은 전부 서버가 합니다. 프론트는 받은 값을 그리기만 합니다.
 * 예외는 두 가지뿐입니다 — BLE 패킷 파싱과 실시간 RMSE 표시.
 * 둘 다 브라우저에서만 가능한 일이라 옮길 수 없습니다.
 */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface Bean {
  id: number;
  name: string;
  region: string;
  process: string;
  roastLevel: string;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  listBeans: () => request<{ items: Bean[] }>("/api/beans"),
};
