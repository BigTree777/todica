/**
 * 認証状態による起動分岐ラッパ (BL-074 / AC-1 / AC-4).
 *
 * - 起動時に `auth-storage.getToken()` を取得.
 * - token 未保持時 → `LoginView` を表示し他ビューには遷移させない.
 * - token 保持時 → 子要素 (アプリ本体) を描画する.
 * - `todica:auth-expired` Custom Event を listen し, 受信時に token を破棄して LoginView に戻す.
 *
 * children は任意の React node. main.tsx から既存ルート (`<Routes>...</Routes>`) を渡す.
 */
import { type ReactNode, useEffect, useState } from "react";
import { type AuthStorage, WebAuthStorage } from "./auth/auth-storage.js";
import { AUTH_EXPIRED_EVENT, setAuthStorage } from "./auth/authed-fetch.js";
import { InvalidPasswordError, NetworkError, login as loginRequest } from "./auth/login-client.js";
import { LoginView } from "./ui/login-view/login-view.js";

void NetworkError; // keep export reachable for type narrowing in callers

export interface AppWithAuthProps {
  /** auth-storage 実装. 省略時は `WebAuthStorage`. */
  storage?: AuthStorage;
  /** /api/v1/login のベース URL. 省略時は同一オリジン (空文字列). */
  baseUrl?: string;
  /** 認証成立時に描画する本体. 省略時は何も描画しない (テスト用デフォルト). */
  children?: ReactNode;
}

export function AppWithAuth({ storage, baseUrl, children }: AppWithAuthProps): JSX.Element | null {
  const [authStorage] = useState<AuthStorage>(() => storage ?? new WebAuthStorage());
  const [token, setToken] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // 起動時に token を取得.
  useEffect(() => {
    setAuthStorage(authStorage);
    let cancelled = false;
    void (async () => {
      const t = await authStorage.getToken();
      if (cancelled) return;
      setToken(t);
      setInitialized(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authStorage]);

  // `todica:auth-expired` を listen. 受信時に token を破棄して LoginView に戻す.
  useEffect(() => {
    const handler = () => {
      void (async () => {
        await authStorage.clearToken();
        setToken(null);
      })();
    };
    if (typeof window !== "undefined") {
      window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
      }
    };
  }, [authStorage]);

  if (!initialized) {
    return null;
  }

  if (!token) {
    return (
      <LoginView
        login={async (password) => {
          try {
            return await loginRequest(baseUrl ?? "", password);
          } catch (err) {
            if (err instanceof InvalidPasswordError) throw err;
            throw new NetworkError(err instanceof Error ? err.message : undefined);
          }
        }}
        onSuccess={async (result) => {
          await authStorage.setToken(result.token);
          setToken(result.token);
        }}
      />
    );
  }

  return <>{children}</>;
}
