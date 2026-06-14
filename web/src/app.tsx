import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type AuthState, fetchAuthState } from "./auth/auth-state-client.js";
import type { AuthStorage } from "./auth/auth-storage.js";
import { AUTH_EXPIRED_EVENT } from "./auth/authed-fetch.js";
import {
  InvalidPasswordError,
  NetworkError,
  login as loginRequest,
  logout as logoutRequest,
} from "./auth/login-client.js";
import {
  changePassword as changePasswordRequest,
  setupInitialPassword as setupInitialPasswordRequest,
} from "./auth/password-client.js";
import { buildHttpRepos } from "./bootstrap.js";
import { useSyncQueue } from "./hooks/use-sync-queue.js";
import type { ProjectRepository } from "./repositories/project-repository.js";
import type { WebRoutineRepository } from "./repositories/routine-repository.js";
import type { SettingsRepository } from "./repositories/settings-repository.js";
import type { TaskRepository } from "./repositories/task-repository.js";
import type { TrashRepository } from "./repositories/trash-repository.js";
import { AppRoutes } from "./routes.js";
import { ErrorNotification } from "./ui/error-notification/error-notification.js";
import { InitialSetupView } from "./ui/initial-setup-view/initial-setup-view.js";
import { LoginView } from "./ui/login-view/login-view.js";
import { OfflineBanner } from "./ui/offline-banner/offline-banner.js";
import { PwaUpdateBanner } from "./ui/pwa-update-banner/pwa-update-banner.js";

void NetworkError;

export type AppMode = "local" | "server";

export interface Repositories {
  task: TaskRepository;
  settings: SettingsRepository;
  trash: TrashRepository;
  project: ProjectRepository;
  routine: WebRoutineRepository;
}

export interface AppConfig {
  mode: AppMode;
  baseUrl: string;
  authToken: string;
  isNative: boolean;
  needsSetup: boolean;
}

export interface AppProps {
  config: AppConfig;
  repos: Repositories;
  authStorage: AuthStorage;
}

export { buildHttpRepos } from "./bootstrap.js";

export function App({ config, repos: initialRepos, authStorage }: AppProps) {
  // WQ-005 / WQ-006: Service Worker / online イベントによるキュー同期
  useSyncQueue();

  const navigate = useNavigate();
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [authToken, setAuthToken] = useState(config.authToken);
  const [currentMode, setCurrentMode] = useState<AppMode>(config.mode);
  const [repos, setRepos] = useState<Repositories>(initialRepos);
  // token 有無で起動分岐. server モードのみ token を必要とする.
  const [token, setToken] = useState<string | null>(config.authToken || null);
  const [authState, setAuthState] = useState<AuthState | null>(
    config.mode === "local" || config.authToken ? { initialized: true } : null,
  );
  const needsServerSetup = config.isNative && currentMode === "server" && baseUrl.length === 0;

  useEffect(() => {
    if (currentMode === "local") {
      setAuthState({ initialized: true });
      return;
    }
    if (needsServerSetup) {
      return;
    }

    let cancelled = false;
    if (!config.authToken) {
      setAuthState(null);
    }
    void fetchAuthState(baseUrl)
      .then((result) => {
        if (!cancelled) setAuthState(result);
      })
      .catch(() => {
        if (!cancelled) {
          setAuthState(config.authToken ? { initialized: true } : null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, config.authToken, currentMode, needsServerSetup]);

  // `todica:auth-expired` 発火時に token を破棄して LoginView に戻す.
  useEffect(() => {
    const handler = () => {
      void (async () => {
        await authStorage.clearToken();
        setToken(null);
        setAuthToken("");
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

  // LoginView の login コールバック.
  const handleLogin = async (password: string) => {
    try {
      const result = await loginRequest(baseUrl, password);
      return result;
    } catch (err) {
      if (err instanceof InvalidPasswordError) throw err;
      throw new NetworkError(err instanceof Error ? err.message : undefined);
    }
  };

  const handleLoginSuccess = async (result: { token: string; expiresAt: number }) => {
    await authStorage.setToken(result.token);
    setToken(result.token);
    setAuthToken(result.token);
    setRepos(buildHttpRepos(baseUrl));
  };

  const handleInitialPasswordSetup = (newPassword: string) =>
    setupInitialPasswordRequest(baseUrl, newPassword);

  const handleInitialPasswordSetupSuccess = async (result: {
    token: string;
    expiresAt: number;
  }) => {
    await authStorage.setToken(result.token);
    setToken(result.token);
    setAuthToken(result.token);
    setAuthState({ initialized: true });
    setRepos(buildHttpRepos(baseUrl));
    navigate("/today", { replace: true });
  };

  // ログアウト処理. /api/v1/logout を叩いて token を破棄.
  const handleLogout = async () => {
    if (token) {
      await logoutRequest(baseUrl, token);
    }
    await authStorage.clearToken();
    setToken(null);
    setAuthToken("");
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    if (!token) {
      throw new Error("Authentication token is missing");
    }
    await changePasswordRequest(baseUrl, token, currentPassword, newPassword);
  };

  const handlePasswordChanged = async () => {
    await authStorage.clearToken();
    setToken(null);
    setAuthToken("");
  };

  const defaultRoute = needsServerSetup ? "/setup" : "/today";

  const handleSelectLocal = config.isNative
    ? async () => {
        try {
          const { Preferences } = await import("@capacitor/preferences");
          await Preferences.set({ key: "mode", value: "local" });
          const { getDb } = await import("./repositories/local-db.js");
          const { LocalTaskRepository } = await import("./repositories/local-task-repository.js");
          const { LocalSettingsRepository } = await import(
            "./repositories/local-settings-repository.js"
          );
          const { LocalTrashRepository } = await import("./repositories/local-trash-repository.js");
          const { LocalProjectRepository } = await import(
            "./repositories/local-project-repository.js"
          );
          const { LocalRoutineRepository } = await import(
            "./repositories/local-routine-repository.js"
          );
          const { LocalResetUsecase } = await import("./usecases/local-reset-usecase.js");
          const db = await getDb();
          await new LocalResetUsecase(db).runIfNeeded(new Date());
          setCurrentMode("local");
          setRepos({
            task: new LocalTaskRepository(db),
            settings: new LocalSettingsRepository(db),
            trash: new LocalTrashRepository(db),
            project: new LocalProjectRepository(db),
            routine: new LocalRoutineRepository(db),
          });
        } catch {
          // ローカル DB の初期化に失敗した場合はそのまま
        }
        navigate("/today", { replace: true });
      }
    : undefined;

  const handleSwitchMode = config.isNative
    ? async () => {
        if (currentMode === "local") {
          // ローカル → サーバ切替: ローカルデータ消去 → mode = 'server' → /setup へ遷移
          try {
            const { getDb, resetDbCache } = await import("./repositories/local-db.js");
            const db = await getDb();
            await db.execute(
              "DELETE FROM tasks; DELETE FROM projects; DELETE FROM routines; " +
                "DELETE FROM counter; DELETE FROM settings; DELETE FROM focus_selection;",
            );
            resetDbCache();
          } catch {
            /* SQLite が利用できない場合はスキップ */
          }
          try {
            const { Preferences } = await import("@capacitor/preferences");
            await Preferences.remove({ key: "serverUrl" });
            await Preferences.remove({ key: "authToken" });
            await Preferences.set({ key: "mode", value: "server" });
          } catch {
            /* Preferences が利用できない場合はスキップ */
          }
          setCurrentMode("server");
          setRepos(buildHttpRepos(""));
          navigate("/setup", { replace: true });
        } else {
          // サーバ → ローカル切替: Preferences 消去 → ローカル DB 初期化 → /today へ遷移
          try {
            const { Preferences } = await import("@capacitor/preferences");
            await Preferences.remove({ key: "serverUrl" });
            await Preferences.remove({ key: "authToken" });
            await Preferences.set({ key: "mode", value: "local" });
          } catch {
            /* Preferences が利用できない場合はスキップ */
          }
          try {
            const { resetDbCache } = await import("./repositories/local-db.js");
            resetDbCache();
            const { getDb } = await import("./repositories/local-db.js");
            const { LocalTaskRepository } = await import("./repositories/local-task-repository.js");
            const { LocalSettingsRepository } = await import(
              "./repositories/local-settings-repository.js"
            );
            const { LocalTrashRepository } = await import(
              "./repositories/local-trash-repository.js"
            );
            const { LocalProjectRepository } = await import(
              "./repositories/local-project-repository.js"
            );
            const { LocalRoutineRepository } = await import(
              "./repositories/local-routine-repository.js"
            );
            const db = await getDb();
            setCurrentMode("local");
            setBaseUrl("");
            setAuthToken("");
            setRepos({
              task: new LocalTaskRepository(db),
              settings: new LocalSettingsRepository(db),
              trash: new LocalTrashRepository(db),
              project: new LocalProjectRepository(db),
              routine: new LocalRoutineRepository(db),
            });
          } catch {
            /* SQLite が利用できない場合はスキップ */
          }
          navigate("/today", { replace: true });
        }
      }
    : undefined;

  if (currentMode === "server" && authState === null && !needsServerSetup) {
    return (
      <>
        <OfflineBanner />
        <PwaUpdateBanner />
        <ErrorNotification />
      </>
    );
  }

  if (currentMode === "server" && authState?.initialized === false) {
    return (
      <>
        <OfflineBanner />
        <PwaUpdateBanner />
        <ErrorNotification />
        <InitialSetupView
          setupInitialPassword={handleInitialPasswordSetup}
          onSetupSuccess={handleInitialPasswordSetupSuccess}
        />
      </>
    );
  }

  // server モードで token が無い (期限切れ / logout 後) は LoginView を全画面で表示する.
  // local モードは認証不要のため LoginView を経由しない (plan §「スコープ境界」).
  if (currentMode === "server" && authState?.initialized === true && !token && !needsServerSetup) {
    return (
      <>
        <OfflineBanner />
        <PwaUpdateBanner />
        <ErrorNotification />
        <LoginView login={handleLogin} onSuccess={handleLoginSuccess} />
      </>
    );
  }

  return (
    <>
      {/* WQ-004: オフライン中のバナー表示 */}
      <OfflineBanner />
      {/* SW-001: PWA アップデート通知バナー */}
      <PwaUpdateBanner />
      {/* BL-034: 401 / ネットワークエラー時の通知バナー */}
      <ErrorNotification />
      <AppRoutes
        config={config}
        repos={repos}
        currentMode={currentMode}
        token={token}
        defaultRoute={defaultRoute}
        onSetupValidated={async (url) => {
          try {
            const { Preferences } = await import("@capacitor/preferences");
            await Preferences.set({ key: "serverUrl", value: url });
            await Preferences.set({ key: "mode", value: "server" });
          } catch {
            /* Preferences が利用できない環境ではスキップ */
          }
          setBaseUrl(url);
          setCurrentMode("server");
          setRepos(buildHttpRepos(url));
        }}
        onSelectLocal={handleSelectLocal}
        onSwitchMode={handleSwitchMode}
        onLogout={handleLogout}
        onChangePassword={handleChangePassword}
        onPasswordChanged={handlePasswordChanged}
      />
    </>
  );
}
