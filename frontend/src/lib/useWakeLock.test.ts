import { describe, expect, it, vi } from "vitest";

import { createWakeLockKeeper } from "./useWakeLock";

function fakeSentinel() {
  const sentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
    }),
  };
  return sentinel;
}

function fakeApi() {
  const sentinels: ReturnType<typeof fakeSentinel>[] = [];
  const request = vi.fn(async () => {
    const sentinel = fakeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  return { request, sentinels };
}

describe("createWakeLockKeeper", () => {
  it("잡았다가 풀어 준다", async () => {
    const api = fakeApi();
    const keeper = createWakeLockKeeper(api);

    await keeper.acquire();
    expect(api.request).toHaveBeenCalledWith("screen");

    keeper.release();
    expect(api.sentinels[0].release).toHaveBeenCalledOnce();
  });

  it("이미 잡고 있으면 다시 요청하지 않는다", async () => {
    const api = fakeApi();
    const keeper = createWakeLockKeeper(api);

    await keeper.acquire();
    await keeper.acquire();

    expect(api.request).toHaveBeenCalledOnce();
  });

  it("★ 브라우저가 풀어 버렸으면 돌아왔을 때 다시 잡는다", async () => {
    // 다른 앱을 보면 브라우저가 알아서 풉니다. 돌아와서 안 잡으면 그때부터 화면이 꺼집니다.
    const api = fakeApi();
    const keeper = createWakeLockKeeper(api);

    await keeper.acquire();
    api.sentinels[0].released = true;
    await keeper.acquire();

    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it("★ 요청 중에 추출이 끝나면 받자마자 돌려준다", async () => {
    const sentinel = fakeSentinel();
    let resolve: (value: typeof sentinel) => void = () => {};
    const api = {
      request: () => new Promise<typeof sentinel>((r) => (resolve = r)),
    };
    const keeper = createWakeLockKeeper(api);

    const pending = keeper.acquire();
    keeper.release();
    resolve(sentinel);
    await pending;

    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it("거절당해도 예외를 던지지 않고, 다음에 다시 시도한다", async () => {
    // 배터리 절약 모드 등. 추출을 막을 이유가 아닙니다.
    const api = fakeApi();
    api.request.mockRejectedValueOnce(new Error("NotAllowedError"));
    const keeper = createWakeLockKeeper(api);

    await expect(keeper.acquire()).resolves.toBeUndefined();
    await keeper.acquire();

    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it("지원하지 않는 브라우저에서는 아무 일도 하지 않는다", async () => {
    const keeper = createWakeLockKeeper(undefined);

    await expect(keeper.acquire()).resolves.toBeUndefined();
    expect(() => keeper.release()).not.toThrow();
  });
});
