/**
 * 単体テスト: HttpRoutineRepository が 401 を引いたときの挙動 (BL-076 / AC-3).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/authed-fetch-repositories/spec.md §AC-3
 *   - docs/developer/features/app-login/plan.md §D-13 (`authedFetch` の 401 → clearToken + event dispatch)
 *
 * 観点 (app-login-production-path.test.tsx と同等の構造):
 *   - 実 `HttpRoutineRepository.list()` を呼ぶ.
 *   - サーバが 401 を返す状況 (`global.fetch` を mock) で:
 *     1. fetch が `authedFetch` 経由で 1 度呼ばれる.
 *     2. token が `auth-storage` (localStorage) から消える.
 *     3. `todica:auth-expired` Custom Event が dispatch される.
 *
 * AC-5 の補足: 本ファイルは `new HttpRoutineRepository(BASE_URL)` (引数 1 つ) で生成し,
 *   constructor 第 2 引数 `authToken` を渡さない. 渡さない経路で Authorization が
 *   正しく付与され, 401 で clearToken + event dispatch が起きることを assert している.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebAuthStorage } from "../src/auth/auth-storage.js";
import { AUTH_EXPIRED_EVENT, setAuthStorage } from "../src/auth/authed-fetch.js";
import { HttpRoutineRepository } from "../src/repositories/routine-repository.js";

const BASE_URL = "http://localhost:3000";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  setAuthStorage(null);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("AC-3 / HttpRoutineRepository が 401 を引いたとき", () => {
  it("token が auth-storage から消え, todica:auth-expired Custom Event が dispatch される", async () => {
    // 1. token を auth-storage に保存し authedFetch に注入する.
    const storage = new WebAuthStorage();
    await storage.setToken("expired-token");
    setAuthStorage(storage);

    expect(await storage.getToken()).toBe("expired-token");

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
    const repo = new HttpRoutineRepository(BASE_URL);
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
