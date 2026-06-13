/**
 * Web クライアント起動エントリポイント (BL-014 / web-client-foundation).
 *
 * - BrowserRouter + Routes でルーティングを設定.
 * - "/"         → /today にリダイレクト（またはネイティブ初回起動時は /setup）
 * - "/setup"    → SetupView（Android 初回起動時のサーバ URL 検証 + /healthz）
 * - "/login"    → LoginView (token 未保持 / 401 受信時に表示)
 * - "/today"    → TodayView
 * - "/settings" → SettingsView
 * - "/trash"    → TrashView
 *
 * 環境変数 (Vite import.meta.env):
 *   - VITE_API_BASE_URL (default: 同一オリジン)
 *
 * Android ネイティブ (BL-019):
 *   - Capacitor.isNativePlatform() で検出し、@capacitor/preferences から serverUrl を取得.
 *   - 未設定の場合は /setup にリダイレクト.
 *
 * Android ローカルモード (BL-020):
 *   - mode = 'local' の場合は Local Repository 実装を注入する.
 *   - LocalResetUsecase.runIfNeeded() を起動時に実行する.
 *
 * 認証 token は
 *   `auth-storage` (Web: localStorage / Android: Preferences) 経由で保存し,
 *   起動時に token 有無で `LoginView` / 本体 を分岐する.
 */
import "./styles/tokens.css";
import "./styles/button.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { type AuthStorage, CapacitorAuthStorage, WebAuthStorage } from "./auth/auth-storage.js";
import { AUTH_EXPIRED_EVENT, setAuthStorage } from "./auth/authed-fetch.js";
import {
  InvalidPasswordError,
  NetworkError,
  login as loginRequest,
  logout as logoutRequest,
} from "./auth/login-client.js";
import { useSyncQueue } from "./hooks/use-sync-queue.js";
import { queryClient } from "./query-client.js";
import { HttpProjectRepository } from "./repositories/project-repository.js";
import type { ProjectRepository } from "./repositories/project-repository.js";
import { HttpRoutineRepository } from "./repositories/routine-repository.js";
import type { WebRoutineRepository } from "./repositories/routine-repository.js";
import { HttpSettingsRepository } from "./repositories/settings-repository.js";
import type { SettingsRepository } from "./repositories/settings-repository.js";
import { HttpTaskRepository } from "./repositories/task-repository.js";
import type { TaskRepository } from "./repositories/task-repository.js";
import { HttpTrashRepository } from "./repositories/trash-repository.js";
import type { TrashRepository } from "./repositories/trash-repository.js";
import { AppShell } from "./ui/app-shell/app-shell.js";
import { ErrorNotification } from "./ui/error-notification/error-notification.js";
import { FocusView } from "./ui/focus-view/focus-view.js";
import { LoginView } from "./ui/login-view/login-view.js";
import { OfflineBanner } from "./ui/offline-banner/offline-banner.js";
import { ProjectsView } from "./ui/projects-view/projects-view.js";
import { PwaUpdateBanner } from "./ui/pwa-update-banner/pwa-update-banner.js";
import { RoutinesView } from "./ui/routines-view/routines-view.js";
import { SettingsView } from "./ui/settings-view/settings-view.js";
import { SetupView } from "./ui/setup-view/setup-view.js";
import { TodayView } from "./ui/today-view/today-view.js";
import { TomorrowView } from "./ui/tomorrow-view/tomorrow-view.js";
import { TrashView } from "./ui/trash-view/trash-view.js";

void NetworkError;

interface ViteEnv {
  VITE_API_BASE_URL?: string;
}

type AppMode = "local" | "server";

interface Repositories {
  task: TaskRepository;
  settings: SettingsRepository;
  trash: TrashRepository;
  project: ProjectRepository;
  routine: WebRoutineRepository;
}

function buildHttpRepos(baseUrl: string): Repositories {
  return {
    task: new HttpTaskRepository(baseUrl),
    settings: new HttpSettingsRepository(baseUrl),
    trash: new HttpTrashRepository(baseUrl),
    project: new HttpProjectRepository(baseUrl),
    routine: new HttpRoutineRepository(baseUrl),
  };
}

interface AppConfig {
  mode: AppMode;
  baseUrl: string;
  authToken: string;
  isNative: boolean;
  needsSetup: boolean;
}

interface AppProps {
  config: AppConfig;
  repos: Repositories;
  authStorage: AuthStorage;
}

function App({ config, repos: initialRepos, authStorage }: AppProps) {
  // WQ-005 / WQ-006: Service Worker / online イベントによるキュー同期
  useSyncQueue();

  const navigate = useNavigate();
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [authToken, setAuthToken] = useState(config.authToken);
  const [currentMode, setCurrentMode] = useState<AppMode>(config.mode);
  const [repos, setRepos] = useState<Repositories>(initialRepos);
  // token 有無で起動分岐. server モードのみ token を必要とする.
  const [token, setToken] = useState<string | null>(config.authToken || null);

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

  // ログアウト処理. /api/v1/logout を叩いて token を破棄.
  const handleLogout = async () => {
    if (token) {
      await logoutRequest(baseUrl, token);
    }
    await authStorage.clearToken();
    setToken(null);
    setAuthToken("");
  };

  const defaultRoute = config.needsSetup ? "/setup" : "/today";

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyDb = db as any;
          await new LocalResetUsecase(anyDb).runIfNeeded(new Date());
          setCurrentMode("local");
          setRepos({
            task: new LocalTaskRepository(anyDb),
            settings: new LocalSettingsRepository(anyDb),
            trash: new LocalTrashRepository(anyDb),
            project: new LocalProjectRepository(anyDb),
            routine: new LocalRoutineRepository(anyDb),
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyDb = db as any;
            await anyDb.execute(
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyDb = db as any;
            setCurrentMode("local");
            setBaseUrl("");
            setAuthToken("");
            setRepos({
              task: new LocalTaskRepository(anyDb),
              settings: new LocalSettingsRepository(anyDb),
              trash: new LocalTrashRepository(anyDb),
              project: new LocalProjectRepository(anyDb),
              routine: new LocalRoutineRepository(anyDb),
            });
          } catch {
            /* SQLite が利用できない場合はスキップ */
          }
          navigate("/today", { replace: true });
        }
      }
    : undefined;

  // server モードで token が無い (初回 / 期限切れ / logout 後) は LoginView を全画面で表示する.
  // local モードは認証不要のため LoginView を経由しない (plan §「スコープ境界」).
  if (currentMode === "server" && !token && !config.needsSetup) {
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
      <Routes>
        {/* BL-036 / D-002: /setup は AppShell の外 (サイドバー非表示) */}
        <Route
          path="/setup"
          element={
            <SetupViewWithNav
              isNative={config.isNative}
              onValidated={async (url) => {
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
            />
          }
        />
        {/* BL-036: 残りのルートは AppShell (左サイドバー + Outlet) 配下にまとめる */}
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />
          <Route
            path="/focus"
            element={<FocusView repository={repos.task} projectRepository={repos.project} />}
          />
          <Route
            path="/today"
            element={<TodayView repository={repos.task} projectRepository={repos.project} />}
          />
          <Route
            path="/tomorrow"
            element={<TomorrowView repository={repos.task} projectRepository={repos.project} />}
          />
          <Route
            path="/settings"
            element={
              <SettingsView
                repository={repos.settings}
                currentMode={config.isNative ? currentMode : undefined}
                onSwitchMode={handleSwitchMode}
                onLogout={
                  currentMode === "server" && token
                    ? async () => {
                        await handleLogout();
                      }
                    : undefined
                }
              />
            }
          />
          <Route path="/trash" element={<TrashView repository={repos.trash} />} />
          <Route path="/projects" element={<ProjectsView repository={repos.project} />} />
          <Route path="/routines" element={<RoutinesView repository={repos.routine} />} />
        </Route>
      </Routes>
    </>
  );
}

interface SetupViewWithNavProps {
  isNative: boolean;
  onValidated: (serverUrl: string) => Promise<void>;
  onSelectLocal?: () => Promise<void>;
}

function SetupViewWithNav({ onValidated, onSelectLocal }: SetupViewWithNavProps) {
  const navigate = useNavigate();

  const handleValidated = async (serverUrl: string) => {
    await onValidated(serverUrl);
    // URL 検証完了後は LoginView (= "/") へ遷移する.
    navigate("/", { replace: true });
  };

  const handleSelectLocal = onSelectLocal
    ? async () => {
        await onSelectLocal();
      }
    : undefined;

  return <SetupView onValidated={handleValidated} onSelectLocal={handleSelectLocal} />;
}

// import.meta.env は Vite が注入する. types/vite が無い環境向けに緩く受ける.
const env = ((import.meta as unknown as { env?: ViteEnv }).env ?? {}) as ViteEnv;

async function init() {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error('mount point "#root" not found');
  }

  let config: AppConfig;
  let repos: Repositories;
  let authStorage: AuthStorage;

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) throw new Error("not native");

    authStorage = new CapacitorAuthStorage();
    const { Preferences } = await import("@capacitor/preferences");
    const { value: mode } = await Preferences.get({ key: "mode" });
    const { value: serverUrl } = await Preferences.get({ key: "serverUrl" });

    if (mode === "local") {
      // BL-020: ローカルモード
      const { getDb } = await import("./repositories/local-db.js");
      const { LocalTaskRepository } = await import("./repositories/local-task-repository.js");
      const { LocalSettingsRepository } = await import(
        "./repositories/local-settings-repository.js"
      );
      const { LocalTrashRepository } = await import("./repositories/local-trash-repository.js");
      const { LocalProjectRepository } = await import("./repositories/local-project-repository.js");
      const { LocalRoutineRepository } = await import("./repositories/local-routine-repository.js");
      const { LocalResetUsecase } = await import("./usecases/local-reset-usecase.js");

      const db = await getDb();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyDb = db as any;
      await new LocalResetUsecase(anyDb).runIfNeeded(new Date());

      config = { mode: "local", baseUrl: "", authToken: "", isNative: true, needsSetup: false };
      repos = {
        task: new LocalTaskRepository(anyDb),
        settings: new LocalSettingsRepository(anyDb),
        trash: new LocalTrashRepository(anyDb),
        project: new LocalProjectRepository(anyDb),
        routine: new LocalRoutineRepository(anyDb),
      };
    } else {
      // サーバモード. token は auth-storage から取得 (なければ LoginView).
      const url = serverUrl ?? "";
      const token = (await authStorage.getToken()) ?? "";
      config = { mode: "server", baseUrl: url, authToken: token, isNative: true, needsSetup: !url };
      repos = buildHttpRepos(url);
    }
  } catch {
    // ブラウザ（Web）: 環境変数からベース URL を取得 / token は auth-storage 経由.
    authStorage = new WebAuthStorage();
    const baseUrl = env.VITE_API_BASE_URL ?? "";
    const token = (await authStorage.getToken()) ?? "";
    config = { mode: "server", baseUrl, authToken: token, isNative: false, needsSetup: false };
    repos = buildHttpRepos(baseUrl);
  }

  // authed-fetch に auth-storage を注入 (401 検知時に token を破棄するため).
  setAuthStorage(authStorage);

  createRoot(root).render(
    <StrictMode>
      {/* TQ-001: QueryClientProvider でアプリ全体をラップ */}
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App config={config} repos={repos} authStorage={authStorage} />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void init();
