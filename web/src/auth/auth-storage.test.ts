/**
 * 単体テスト: WebAuthStorage / auth-storage.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「共通コンポーネント」/ AC-2 / AC-4 / AC-5
 *   - docs/developer/features/app-login/plan.md §「Web モジュール」/ D-9
 *
 * 観点:
 *   1. `setToken(t)` → `getToken()` で `t` が返る (Web 実装は localStorage 経由).
 *   2. `clearToken()` で `null` に戻る.
 *   3. localStorage キー名は `todica.auth.token` (plan D-9).
 *   4. listener (subscribe) パターン: token 変更時にコールバックが呼ばれる.
 *   5. 起動時にキーが無い場合 `getToken()` は `null` を返す.
 *
 * 現状: `web/src/auth/auth-storage.ts` は未実装. インポート不能で red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebAuthStorage } from "./auth-storage.js";

const STORAGE_KEY = "todica.auth.token";

beforeEach(() => {
  localStorage.clear();
});

describe("WebAuthStorage (localStorage 実装)", () => {
  it("setToken(t) → getToken() で t が返る (AC-2)", async () => {
    const storage = new WebAuthStorage();
    await storage.setToken("abc123");
    expect(await storage.getToken()).toBe("abc123");
  });

  it("setToken は localStorage の 'todica.auth.token' キーに値を保存する (plan D-9)", async () => {
    const storage = new WebAuthStorage();
    await storage.setToken("token-xyz");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("token-xyz");
  });

  it("clearToken() で token が破棄され getToken() は null を返す (AC-4 / AC-5)", async () => {
    const storage = new WebAuthStorage();
    await storage.setToken("abc123");
    expect(await storage.getToken()).toBe("abc123");

    await storage.clearToken();
    expect(await storage.getToken()).toBeNull();
    // localStorage 上のキー自体が削除されている.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("key 未設定で起動した場合 getToken() は null を返す", async () => {
    const storage = new WebAuthStorage();
    expect(await storage.getToken()).toBeNull();
  });

  it("setToken は別インスタンスからも参照できる (localStorage 共有)", async () => {
    const a = new WebAuthStorage();
    await a.setToken("shared-token");

    const b = new WebAuthStorage();
    expect(await b.getToken()).toBe("shared-token");
  });
});

describe("WebAuthStorage listener パターン", () => {
  it("subscribe したコールバックは setToken 時に呼ばれる (token 値が引数で渡る)", async () => {
    const storage = new WebAuthStorage();
    const listener = vi.fn();
    const unsubscribe = storage.subscribe(listener);

    await storage.setToken("token-1");
    expect(listener).toHaveBeenCalledWith("token-1");

    unsubscribe();
  });

  it("subscribe したコールバックは clearToken 時に null で呼ばれる", async () => {
    const storage = new WebAuthStorage();
    await storage.setToken("token-1");

    const listener = vi.fn();
    storage.subscribe(listener);

    await storage.clearToken();
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("unsubscribe したコールバックは以降の変更で呼ばれない", async () => {
    const storage = new WebAuthStorage();
    const listener = vi.fn();
    const unsubscribe = storage.subscribe(listener);

    unsubscribe();
    await storage.setToken("token-after-unsubscribe");

    expect(listener).not.toHaveBeenCalled();
  });
});
