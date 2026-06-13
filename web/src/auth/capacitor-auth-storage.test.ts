/**
 * 単体テスト: CapacitorAuthStorage.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/auth-storage-tests/spec.md AC-8〜AC-12
 *   - docs/developer/features/auth-storage-tests/plan.md D-1〜D-6
 *
 * 観点:
 *   1. (AC-8) getToken() が Preferences.get({ key: "authToken" }) を呼び value を返す.
 *   2. (AC-9) Preferences.get が { value: null } のとき getToken() は null を返す.
 *   3. (AC-10) setToken(token) が Preferences.set({ key: "authToken", value: token }) を呼び
 *              subscribe listener を token で notify する.
 *   4. (AC-11) clearToken() が Preferences.remove({ key: "authToken" }) を呼び
 *              subscribe listener を null で notify する.
 *   5. (AC-12) set → get の round-trip (mock 内で state を保持) で同じ値が戻る.
 *
 * 設計メモ:
 *   - @capacitor/preferences は dynamic import される (production: auth-storage.ts).
 *     vi.mock でモジュールごと差し替えて Preferences.get/set/remove を spy 化する.
 *   - vi.hoisted で先にハンドルを作っておくことで mock factory 内の参照を安全にする
 *     (vi.mock は import 前に hoist されるため通常の let 参照は使えない).
 *   - 既存 auth-storage.test.ts は WebAuthStorage 専用なので, ファイル分離して mock の
 *     副作用を閉じ込める (plan D-6).
 *
 * production 対象: web/src/auth/auth-storage.ts (CapacitorAuthStorage. 無改修).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// @capacitor/preferences モック
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  return {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  };
});

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: mocks.get,
    set: mocks.set,
    remove: mocks.remove,
  },
}));

// production を import するのは vi.mock 宣言より後 (hoist 順序の都合上問題ない).
import { CapacitorAuthStorage } from "./auth-storage.js";

// ---------------------------------------------------------------------------
// 共通セットアップ
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // 既定では undefined 解決でいいので mockResolvedValue は各テストで上書きする.
  mocks.get.mockResolvedValue({ value: null });
  mocks.set.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// AC-8 / AC-9: getToken
// ---------------------------------------------------------------------------

describe("CapacitorAuthStorage.getToken", () => {
  it("Preferences.get({ key: 'authToken' }) を呼び value を返す (AC-8)", async () => {
    mocks.get.mockResolvedValueOnce({ value: "tkn-stored" });

    const storage = new CapacitorAuthStorage();
    const token = await storage.getToken();

    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith({ key: "authToken" });
    expect(token).toBe("tkn-stored");
  });

  it("Preferences.get が { value: null } を返したら null を透過する (AC-9)", async () => {
    mocks.get.mockResolvedValueOnce({ value: null });

    const storage = new CapacitorAuthStorage();
    const token = await storage.getToken();

    expect(token).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AC-10 / AC-11: setToken / clearToken
// ---------------------------------------------------------------------------

describe("CapacitorAuthStorage.setToken", () => {
  it("Preferences.set({ key: 'authToken', value: token }) を呼び listener に token を notify する (AC-10)", async () => {
    const storage = new CapacitorAuthStorage();
    const listener = vi.fn();
    storage.subscribe(listener);

    await storage.setToken("tkn-new");

    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith({ key: "authToken", value: "tkn-new" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("tkn-new");
  });
});

describe("CapacitorAuthStorage.clearToken", () => {
  it("Preferences.remove({ key: 'authToken' }) を呼び listener に null を notify する (AC-11)", async () => {
    const storage = new CapacitorAuthStorage();
    const listener = vi.fn();
    storage.subscribe(listener);

    await storage.clearToken();

    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith({ key: "authToken" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// AC-12: round-trip (mock 内 state)
// ---------------------------------------------------------------------------

describe("CapacitorAuthStorage round-trip", () => {
  it("setToken → getToken で同じ値が戻る (mock 内 state 経由) (AC-12)", async () => {
    // mock 内に module-scoped な state を持たせ, set 後の get で読み出せるようにする.
    let storedValue: string | null = null;
    mocks.set.mockImplementation(async ({ value }: { value: string }) => {
      storedValue = value;
    });
    mocks.get.mockImplementation(async () => ({ value: storedValue }));
    mocks.remove.mockImplementation(async () => {
      storedValue = null;
    });

    const storage = new CapacitorAuthStorage();
    await storage.setToken("tkn-rt");

    expect(await storage.getToken()).toBe("tkn-rt");

    // clearToken 後は再び null に戻ることも合わせて確認する.
    await storage.clearToken();
    expect(await storage.getToken()).toBeNull();
  });
});
