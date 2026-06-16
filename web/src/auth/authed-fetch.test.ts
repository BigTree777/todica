/**
 * 単体テスト: authedFetch.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/auth-storage-tests/spec.md AC-1〜AC-7
 *   - docs/developer/features/auth-storage-tests/plan.md D-1〜D-6
 *
 * 観点:
 *   1. (AC-1) 引数 (input / RequestInit) が global.fetch に透過される.
 *   2. (AC-2) 200 OK Response はそのまま透過される (clearToken 未呼出 / event 未 dispatch).
 *   3. (AC-3) 401 Response で AuthStorage.clearToken が呼ばれ todica:auth-expired Custom Event が dispatch される.
 *   4. (AC-4) 非 401 エラー (500) では clearToken も event dispatch もされない.
 *   5. (AC-5) setAuthStorage(null) 状態で 401 を受けても crash せず event だけ dispatch される (no-op).
 *   6. (AC-6) getToken() が null を返すとき Authorization ヘッダは付与されない.
 *   7. (AC-7) 呼出側が Authorization を明示指定した場合は上書きしない.
 *
 * production 対象: web/src/auth/authed-fetch.ts (本テストでは無改修).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStorage } from "./auth-storage.js";
import { AUTH_EXPIRED_EVENT, authedFetch, setAuthStorage } from "./authed-fetch.js";

// ---------------------------------------------------------------------------
// 共通セットアップ
// ---------------------------------------------------------------------------

/**
 * テストで注入する AuthStorage モック.
 * 各テストで getToken の返り値を mockResolvedValue で個別に上書きする.
 *
 * vitest 4 で vi.fn の戻り型が MockInstance<Procedure | Constructable> 化したため,
 * AuthStorage の各 method シグネチャを generic で明示して代入互換性を保つ.
 */
type MockAuthStorage = {
  getToken: ReturnType<typeof vi.fn<AuthStorage["getToken"]>>;
  setToken: ReturnType<typeof vi.fn<AuthStorage["setToken"]>>;
  clearToken: ReturnType<typeof vi.fn<AuthStorage["clearToken"]>>;
  subscribe: ReturnType<typeof vi.fn<AuthStorage["subscribe"]>>;
};

function makeMockStorage(token: string | null = "tkn-1"): MockAuthStorage {
  return {
    getToken: vi.fn<AuthStorage["getToken"]>().mockResolvedValue(token),
    setToken: vi.fn<AuthStorage["setToken"]>().mockResolvedValue(undefined),
    clearToken: vi.fn<AuthStorage["clearToken"]>().mockResolvedValue(undefined),
    subscribe: vi.fn<AuthStorage["subscribe"]>().mockReturnValue(() => {
      /* noop unsubscribe */
    }),
  };
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let authExpiredListener: ReturnType<typeof vi.fn<EventListener>>;

beforeEach(() => {
  vi.restoreAllMocks();
  // global.fetch を vi.fn で差し替える. 各テストで mockResolvedValue を上書きする.
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);

  // auth-expired event の dispatch を観測する listener を仕掛ける.
  authExpiredListener = vi.fn<EventListener>();
  window.addEventListener(AUTH_EXPIRED_EVENT, authExpiredListener);
});

afterEach(() => {
  window.removeEventListener(AUTH_EXPIRED_EVENT, authExpiredListener);
  // 次テストへの漏れ防止: storage 注入をクリアし global を戻す.
  setAuthStorage(null);
  vi.unstubAllGlobals();
});

/**
 * fetch に渡された init.headers を Headers として読み出すユーティリティ.
 * authedFetch は init.headers を `new Headers(init.headers)` で正規化してから
 * fetch に渡すので, ここでも Headers で扱う.
 */
function extractHeaders(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers ?? {});
}

// ---------------------------------------------------------------------------
// AC-1 / AC-2 / AC-7
// ---------------------------------------------------------------------------

describe("authedFetch", () => {
  it("引数 (URL + RequestInit) を global.fetch に透過し Authorization: Bearer <token> を付与する (AC-1)", async () => {
    const storage: AuthStorage = makeMockStorage("tkn-1");
    setAuthStorage(storage);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await authedFetch("/api/v1/projects", { method: "POST", body: "x" });

    // 第 1 引数 (input) と 第 2 引数 (init) が透過されている.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledInput, calledInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(calledInput).toBe("/api/v1/projects");
    expect(calledInit.method).toBe("POST");
    expect(calledInit.body).toBe("x");
    // Authorization: Bearer tkn-1 が headers に乗っている.
    const headers = extractHeaders(calledInit);
    expect(headers.get("Authorization")).toBe("Bearer tkn-1");
  });

  it("200 OK Response はそのまま透過され clearToken も event dispatch も起きない (AC-2)", async () => {
    const storage = makeMockStorage("tkn-1");
    setAuthStorage(storage);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await authedFetch("/api/v1/today");

    expect(res.status).toBe(200);
    expect(storage.clearToken).not.toHaveBeenCalled();
    expect(authExpiredListener).not.toHaveBeenCalled();
  });

  it("呼出側が Authorization を既に明示指定した場合は上書きしない (AC-7)", async () => {
    const storage = makeMockStorage("tkn-1");
    setAuthStorage(storage);
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await authedFetch("/x", { headers: { Authorization: "Bearer caller-token" } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, calledInit] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const headers = extractHeaders(calledInit);
    // caller が事前指定した値が保持されている (Bearer tkn-1 に上書きされていない).
    expect(headers.get("Authorization")).toBe("Bearer caller-token");
  });
});

// ---------------------------------------------------------------------------
// AC-3 / AC-4
// ---------------------------------------------------------------------------

describe("authedFetch の 401 hand-off / 非 401 素通し", () => {
  it("401 Response を受けると clearToken が呼ばれ todica:auth-expired が dispatch される (AC-3)", async () => {
    const storage = makeMockStorage("tkn-1");
    setAuthStorage(storage);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: "UNAUTHORIZED" }), { status: 401 }),
    );

    const res = await authedFetch("/api/v1/today");

    expect(res.status).toBe(401);
    expect(storage.clearToken).toHaveBeenCalledTimes(1);
    expect(authExpiredListener).toHaveBeenCalledTimes(1);
    // dispatch されたイベント型が一致する.
    const event = authExpiredListener.mock.calls[0]?.[0] as Event;
    expect(event.type).toBe(AUTH_EXPIRED_EVENT);
  });

  it("500 Response (非 401) では clearToken も event dispatch も起きない (AC-4)", async () => {
    const storage = makeMockStorage("tkn-1");
    setAuthStorage(storage);
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    const res = await authedFetch("/api/v1/today");

    expect(res.status).toBe(500);
    expect(storage.clearToken).not.toHaveBeenCalled();
    expect(authExpiredListener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AC-5 / AC-6
// ---------------------------------------------------------------------------

describe("authedFetch の storage 未設定 / getToken=null", () => {
  it("setAuthStorage(null) 状態で 401 を受けても crash せず event は dispatch される (AC-5)", async () => {
    // storage を意図的に未設定にする.
    setAuthStorage(null);
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    const res = await authedFetch("/api/v1/today");

    expect(res.status).toBe(401);
    // storage が null のため clearToken は呼ばれようがない (前段 if currentStorage で skip).
    // ただし event 自体は dispatch される現行挙動を確認する.
    expect(authExpiredListener).toHaveBeenCalledTimes(1);

    // Authorization ヘッダは付かない.
    const [, calledInit] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const headers = extractHeaders(calledInit);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("getToken() が null を返すとき Authorization ヘッダは付かず 200 はそのまま透過する (AC-6)", async () => {
    const storage = makeMockStorage(null);
    setAuthStorage(storage);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    const res = await authedFetch("/api/v1/today");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, calledInit] = fetchMock.mock.calls[0] as [unknown, RequestInit];
    const headers = extractHeaders(calledInit);
    expect(headers.has("Authorization")).toBe(false);
    // 200 系なので clearToken / event dispatch は走らない.
    expect(storage.clearToken).not.toHaveBeenCalled();
    expect(authExpiredListener).not.toHaveBeenCalled();
  });
});
