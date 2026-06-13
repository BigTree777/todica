/**
 * 認証付き fetch ラッパ.
 *
 * - `auth-storage` から token を取得し Authorization: Bearer に乗せる.
 * - 401 を捕捉したら `auth-storage.clearToken()` を呼び `todica:auth-expired` を dispatch する.
 * - 401 を upstream に投げ返す責務は呼出元 (Repository) に残す (200/204 と同じく
 *   `Response` を返す形). Repository は HTTP ステータスで分岐できる.
 */
import type { AuthStorage } from "./auth-storage.js";

export const AUTH_EXPIRED_EVENT = "todica:auth-expired";

let currentStorage: AuthStorage | null = null;

/**
 * `authed-fetch` で使う `AuthStorage` を設定する.
 * `main.tsx` の起動時に `WebAuthStorage` / `CapacitorAuthStorage` を 1 度だけ注入する.
 */
export function setAuthStorage(storage: AuthStorage | null): void {
  currentStorage = storage;
}

export function getAuthStorage(): AuthStorage | null {
  return currentStorage;
}

/**
 * 認証 token を Authorization に乗せて fetch する.
 *
 * - storage が未設定 / token が null のときは Authorization を付けない.
 * - 401 応答時は token を破棄して `todica:auth-expired` を dispatch する.
 * - 上位 (Repository) には Response をそのまま返す.
 */
export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
  if (currentStorage) {
    const token = await currentStorage.getToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    if (currentStorage) {
      await currentStorage.clearToken();
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
  }
  return res;
}
