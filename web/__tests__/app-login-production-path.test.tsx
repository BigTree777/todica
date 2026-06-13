/**
 * 単体テスト: AC-4 production 経路 (BL-074 差し戻し Problem 1).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-4
 *   - docs/developer/features/app-login/plan.md §「401 interceptor」 / D-13
 *
 * 観点:
 *   - 既存 production の `HttpTaskRepository.list()` を呼ぶ.
 *   - サーバが 401 を返す状況 (`global.fetch` を mock) で:
 *     1. token が `auth-storage` (localStorage) から消える.
 *     2. `todica:auth-expired` Custom Event が dispatch される.
 *
 * 「event を手動 dispatch」ではなく「実 Repository 呼び出しが 401 を引き当てた結果として
 *  event が発火する」形を検証する. これにより authedFetch 配線 (Problem 1) が
 *  最低 1 本の Repository で成立していることを担保する.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebAuthStorage } from "../src/auth/auth-storage.js";
import { AUTH_EXPIRED_EVENT, setAuthStorage } from "../src/auth/authed-fetch.js";
import { HttpTaskRepository } from "../src/repositories/task-repository.js";

const BASE_URL = "http://localhost:3000";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  setAuthStorage(null);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("AC-4 production 経路 — HttpTaskRepository が 401 を引いたとき", () => {
  it("token が auth-storage から消え, todica:auth-expired Custom Event が dispatch される", async () => {
    // 1. token を auth-storage に保存し authedFetch に注入する.
    const storage = new WebAuthStorage();
    await storage.setToken("expired-session-token");
    setAuthStorage(storage);

    expect(await storage.getToken()).toBe("expired-session-token");

    // 2. global.fetch を 401 を返す mock に差し替える.
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // 3. AUTH_EXPIRED イベントが発火したかを listener で観測する.
    let dispatched = 0;
    const handler = () => {
      dispatched += 1;
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);

    // 4. 実際の Repository 呼び出しで 401 を引き当てる.
    const repo = new HttpTaskRepository(BASE_URL);
    await expect(repo.list()).rejects.toThrow(/HTTP 401/);

    // 5. fetch は authedFetch 経由で 1 度呼ばれている.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 6. token が auth-storage (localStorage) から消えている.
    expect(await storage.getToken()).toBeNull();

    // 7. Custom Event が dispatch されている.
    expect(dispatched).toBe(1);

    window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  });
});
