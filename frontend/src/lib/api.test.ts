import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "./api";

describe("API 오류 문구", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respondWith(status: number, body: string | null = null) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
  }

  async function deleteError(): Promise<ApiError> {
    return api.deleteBrew(1).then(
      () => {
        throw new Error("실패해야 합니다");
      },
      (error: ApiError) => error,
    );
  }

  it("Caddy가 삭제 비밀번호를 거부하면 이유를 알려 준다", async () => {
    respondWith(401);

    const error = await deleteError();

    expect(error.status).toBe(401);
    expect(error.message).toContain("비밀번호");
  });

  it("Caddy가 큰 본문을 막으면 크기 제한을 알려 준다", async () => {
    respondWith(413);

    const error = await deleteError();

    expect(error.status).toBe(413);
    expect(error.message).toContain("25 MB");
  });

  it("백엔드가 보낸 설명은 그대로 보여 준다", async () => {
    respondWith(404, JSON.stringify({ detail: "기록을 찾을 수 없습니다" }));

    expect((await deleteError()).message).toBe("기록을 찾을 수 없습니다");
  });

  it("알 수 없는 오류는 상태 코드를 보여 준다", async () => {
    respondWith(502);

    expect((await deleteError()).message).toContain("502");
  });
});
