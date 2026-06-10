/**
 * Web クライアント起動エントリポイント (BL-014 / web-client-foundation).
 *
 * - BrowserRouter + Routes でルーティングを設定.
 * - "/"         → /today にリダイレクト（またはネイティブ初回起動時は /setup）
 * - "/setup"    → SetupView（Android 初回起動時のサーバ設定）
 * - "/today"    → TodayView
 * - "/settings" → SettingsView
 * - "/trash"    → TrashView
 *
 * 環境変数 (Vite import.meta.env):
 *   - VITE_API_BASE_URL (default: 同一オリジン)
 *   - VITE_AUTH_TOKEN (必須: Bearer 認証用)
 *
 * Android ネイティブ (BL-019):
 *   - Capacitor.isNativePlatform() で検出し、@capacitor/preferences から serverUrl / authToken を取得.
 *   - 未設定の場合は /setup にリダイレクト.
 *
 * Android ローカルモード (BL-020):
 *   - mode = 'local' の場合は Local Repository 実装を注入する.
 *   - LocalResetUsecase.runIfNeeded() を起動時に実行する.
 */
import "./styles/tokens.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./query-client.js";
import { HttpTaskRepository } from "./repositories/task-repository.js";
import { HttpSettingsRepository } from "./repositories/settings-repository.js";
import { HttpTrashRepository } from "./repositories/trash-repository.js";
import { HttpProjectRepository } from "./repositories/project-repository.js";
import { HttpRoutineRepository } from "./repositories/routine-repository.js";
import type { TaskRepository } from "./repositories/task-repository.js";
import type { SettingsRepository } from "./repositories/settings-repository.js";
import type { TrashRepository } from "./repositories/trash-repository.js";
import type { ProjectRepository } from "./repositories/project-repository.js";
import type { WebRoutineRepository } from "./repositories/routine-repository.js";
import { TodayView } from "./ui/today-view/today-view.js";
import { SettingsView } from "./ui/settings-view/settings-view.js";
import { TrashView } from "./ui/trash-view/trash-view.js";
import { ProjectsView } from "./ui/projects-view/projects-view.js";
import { RoutinesView } from "./ui/routines-view/routines-view.js";
import { SetupView } from "./ui/setup-view/setup-view.js";
import { AppShell } from "./ui/app-shell/app-shell.js";
import { FocusView } from "./ui/focus-view/focus-view.js";
import { TomorrowView } from "./ui/tomorrow-view/tomorrow-view.js";
import { OfflineBanner } from "./ui/offline-banner/offline-banner.js";
import { ErrorNotification } from "./ui/error-notification/error-notification.js";
import { PwaUpdateBanner } from "./ui/pwa-update-banner/pwa-update-banner.js";
import { useSyncQueue } from "./hooks/use-sync-queue.js";

interface ViteEnv {
  VITE_API_BASE_URL?: string;
  VITE_AUTH_TOKEN?: string;
}

type AppMode = "local" | "server";

interface Repositories {
  task: TaskRepository;
  settings: SettingsRepository;
  trash: TrashRepository;
  project: ProjectRepository;
  routine: WebRoutineRepository;
}

function buildHttpRepos(baseUrl: string, authToken: string): Repositories {
  return {
    task: new HttpTaskRepository(baseUrl, authToken),
    settings: new HttpSettingsRepository(baseUrl, authToken),
    trash: new HttpTrashRepository(baseUrl, authToken),
    project: new HttpProjectRepository(baseUrl, authToken),
    routine: new HttpRoutineRepository(baseUrl, authToken),
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
}

function App({ config, repos: initialRepos }: AppProps) {
  // WQ-005 / WQ-006: Service Worker / online イベントによるキュー同期
  useSyncQueue();

  const navigate = useNavigate();
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [authToken, setAuthToken] = useState(config.authToken);
  const [currentMode, setCurrentMode] = useState<AppMode>(config.mode);
  const [repos, setRepos] = useState<Repositories>(initialRepos);

  const defaultRoute = config.needsSetup ? "/setup" : "/today";

  const handleSelectLocal = config.isNative ? async () => {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: "mode", value: "local" });
      const { getDb } = await import("./repositories/local-db.js");
      const { LocalTaskRepository } = await import("./repositories/local-task-repository.js");
      const { LocalSettingsRepository } = await import("./repositories/local-settings-repository.js");
      const { LocalTrashRepository } = await import("./repositories/local-trash-repository.js");
      const { LocalProjectRepository } = await import("./repositories/local-project-repository.js");
      const { LocalRoutineRepository } = await import("./repositories/local-routine-repository.js");
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
  } : undefined;

  const handleSwitchMode = config.isNative ? async () => {
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
      } catch { /* SQLite が利用できない場合はスキップ */ }
      try {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.remove({ key: "serverUrl" });
        await Preferences.remove({ key: "authToken" });
        await Preferences.set({ key: "mode", value: "server" });
      } catch { /* Preferences が利用できない場合はスキップ */ }
      setCurrentMode("server");
      setRepos(buildHttpRepos("", ""));
      navigate("/setup", { replace: true });
    } else {
      // サーバ → ローカル切替: Preferences 消去 → ローカル DB 初期化 → /today へ遷移
      try {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.remove({ key: "serverUrl" });
        await Preferences.remove({ key: "authToken" });
        await Preferences.set({ key: "mode", value: "local" });
      } catch { /* Preferences が利用できない場合はスキップ */ }
      try {
        const { resetDbCache } = await import("./repositories/local-db.js");
        resetDbCache();
        const { getDb } = await import("./repositories/local-db.js");
        const { LocalTaskRepository } = await import("./repositories/local-task-repository.js");
        const { LocalSettingsRepository } = await import("./repositories/local-settings-repository.js");
        const { LocalTrashRepository } = await import("./repositories/local-trash-repository.js");
        const { LocalProjectRepository } = await import("./repositories/local-project-repository.js");
        const { LocalRoutineRepository } = await import("./repositories/local-routine-repository.js");
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
      } catch { /* SQLite が利用できない場合はスキップ */ }
      navigate("/today", { replace: true });
    }
  } : undefined;

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
              onSave={async (url, token) => {
                try {
                  const { Preferences } = await import("@capacitor/preferences");
                  await Preferences.set({ key: "serverUrl", value: url });
                  await Preferences.set({ key: "authToken", value: token });
                  await Preferences.set({ key: "mode", value: "server" });
                } catch { /* Preferences が利用できない環境ではスキップ */ }
                setBaseUrl(url);
                setAuthToken(token);
                setCurrentMode("server");
                setRepos(buildHttpRepos(url, token));
              }}
              onSelectLocal={handleSelectLocal}
            />
          }
        />
        {/* BL-036: 残りのルートは AppShell (左サイドバー + Outlet) 配下にまとめる */}
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />
          <Route path="/focus" element={<FocusView repository={repos.task} projectRepository={repos.project} />} />
          <Route path="/today" element={<TodayView repository={repos.task} projectRepository={repos.project} />} />
          <Route path="/tomorrow" element={<TomorrowView repository={repos.task} projectRepository={repos.project} />} />
          <Route
            path="/settings"
            element={
              <SettingsView
                repository={repos.settings}
                serverUrl={config.isNative && currentMode === "server" ? baseUrl : undefined}
                authToken={config.isNative && currentMode === "server" ? authToken : undefined}
                onSaveServer={
                  config.isNative && currentMode === "server"
                    ? (url, token) => {
                        setBaseUrl(url);
                        setAuthToken(token);
                      }
                    : undefined
                }
                currentMode={config.isNative ? currentMode : undefined}
                onSwitchMode={handleSwitchMode}
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
  onSave: (serverUrl: string, authToken: string) => Promise<void>;
  onSelectLocal?: () => Promise<void>;
}

function SetupViewWithNav({ onSave, onSelectLocal }: SetupViewWithNavProps) {
  const navigate = useNavigate();

  const handleSave = async (serverUrl: string, authToken: string) => {
    await onSave(serverUrl, authToken);
    navigate("/today", { replace: true });
  };

  const handleSelectLocal = onSelectLocal ? async () => {
    await onSelectLocal();
    // onSelectLocal 内で navigate("/today") が呼ばれるため、ここでは不要
  } : undefined;

  return <SetupView onSave={handleSave} onSelectLocal={handleSelectLocal} />;
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

  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) throw new Error("not native");

    const { Preferences } = await import("@capacitor/preferences");
    const { value: mode } = await Preferences.get({ key: "mode" });
    const { value: serverUrl } = await Preferences.get({ key: "serverUrl" });
    const { value: authToken } = await Preferences.get({ key: "authToken" });

    if (mode === "local") {
      // BL-020: ローカルモード
      const { getDb } = await import("./repositories/local-db.js");
      const { LocalTaskRepository } = await import("./repositories/local-task-repository.js");
      const { LocalSettingsRepository } = await import("./repositories/local-settings-repository.js");
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
      // BL-019: サーバモード（または未設定）
      const url = serverUrl ?? "";
      const token = authToken ?? "";
      config = { mode: "server", baseUrl: url, authToken: token, isNative: true, needsSetup: !url };
      repos = buildHttpRepos(url, token);
    }
  } catch {
    // ブラウザ（Web）: 従来通り環境変数を使う
    const baseUrl = env.VITE_API_BASE_URL ?? "";
    const authToken = env.VITE_AUTH_TOKEN ?? "";
    config = { mode: "server", baseUrl, authToken, isNative: false, needsSetup: false };
    repos = buildHttpRepos(baseUrl, authToken);
  }

  createRoot(root).render(
    <StrictMode>
      {/* TQ-001: QueryClientProvider でアプリ全体をラップ */}
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App config={config} repos={repos} />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void init();
