/**
 * 認証トークンの保存抽象 (BL-074 / plan D-9 / D-14).
 *
 * - Web 実装: `localStorage` の `todica.auth.token` キーに保存.
 * - Capacitor 実装: `@capacitor/preferences` の `authToken` キーに保存 (動的 import).
 * - subscribe / unsubscribe パターンで token 変更を listener に通知する.
 *   (`main.tsx` から 401 イベント受信時の再描画に利用する.)
 */

const STORAGE_KEY = "todica.auth.token";

export interface AuthStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  /** token 変更時に listener を呼び出す. unsubscribe 用関数を返す. */
  subscribe(listener: (token: string | null) => void): () => void;
}

abstract class BaseAuthStorage implements AuthStorage {
  private listeners = new Set<(token: string | null) => void>();

  abstract getToken(): Promise<string | null>;
  abstract setToken(token: string): Promise<void>;
  abstract clearToken(): Promise<void>;

  protected notify(token: string | null): void {
    for (const listener of this.listeners) {
      listener(token);
    }
  }

  subscribe(listener: (token: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/**
 * Web 環境用の `localStorage` ベース実装.
 */
export class WebAuthStorage extends BaseAuthStorage {
  async getToken(): Promise<string | null> {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  }

  async setToken(token: string): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, token);
    }
    this.notify(token);
  }

  async clearToken(): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.notify(null);
  }
}

/**
 * Capacitor (Android) 用の `@capacitor/preferences` ベース実装.
 * `@capacitor/preferences` を dynamic import する.
 */
export class CapacitorAuthStorage extends BaseAuthStorage {
  private readonly key = "authToken";

  async getToken(): Promise<string | null> {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: this.key });
    return value ?? null;
  }

  async setToken(token: string): Promise<void> {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: this.key, value: token });
    this.notify(token);
  }

  async clearToken(): Promise<void> {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: this.key });
    this.notify(null);
  }
}

/**
 * 起動環境に応じた `AuthStorage` 実装を返す.
 * `@capacitor/core` の `Capacitor.isNativePlatform()` で判定する.
 */
export async function createAuthStorage(): Promise<AuthStorage> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      return new CapacitorAuthStorage();
    }
  } catch {
    /* Capacitor が無い環境では Web 実装にフォールバック */
  }
  return new WebAuthStorage();
}
