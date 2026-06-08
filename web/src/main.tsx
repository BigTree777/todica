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
 */
import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./query-client.js";
import { HttpTaskRepository } from "./repositories/task-repository.js";
import { HttpSettingsRepository } from "./repositories/settings-repository.js";
import { HttpTrashRepository } from "./repositories/trash-repository.js";
import { HttpProjectRepository } from "./repositories/project-repository.js";
import { HttpRoutineRepository } from "./repositories/routine-repository.js";
import { TodayView } from "./ui/today-view/today-view.js";
import { SettingsView } from "./ui/settings-view/settings-view.js";
import { TrashView } from "./ui/trash-view/trash-view.js";
import { ProjectsView } from "./ui/projects-view/projects-view.js";
import { RoutinesView } from "./ui/routines-view/routines-view.js";
import { SetupView } from "./ui/setup-view/setup-view.js";
import { OfflineBanner } from "./ui/offline-banner/offline-banner.js";
import { PwaUpdateBanner } from "./ui/pwa-update-banner/pwa-update-banner.js";
import { useSyncQueue } from "./hooks/use-sync-queue.js";

interface ViteEnv {
  VITE_API_BASE_URL?: string;
  VITE_AUTH_TOKEN?: string;
}

async function loadCapacitorPreferences(): Promise<{ serverUrl: string; authToken: string; isNative: boolean }> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      return { serverUrl: "", authToken: "", isNative: false };
    }
    const { Preferences } = await import("@capacitor/preferences");
    const { value: serverUrl } = await Preferences.get({ key: "serverUrl" });
    const { value: authToken } = await Preferences.get({ key: "authToken" });
    return { serverUrl: serverUrl ?? "", authToken: authToken ?? "", isNative: true };
  } catch {
    return { serverUrl: "", authToken: "", isNative: false };
  }
}

// import.meta.env は Vite が注入する. types/vite が無い環境向けに緩く受ける.
const env = ((import.meta as unknown as { env?: ViteEnv }).env ?? {}) as ViteEnv;

interface AppConfig {
  baseUrl: string;
  authToken: string;
  isNative: boolean;
  needsSetup: boolean;
}

interface AppProps {
  config: AppConfig;
}

function App({ config }: AppProps) {
  // WQ-005 / WQ-006: Service Worker / online イベントによるキュー同期
  useSyncQueue();

  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [authToken, setAuthToken] = useState(config.authToken);

  const taskRepository = new HttpTaskRepository(baseUrl, authToken);
  const settingsRepository = new HttpSettingsRepository(baseUrl, authToken);
  const trashRepository = new HttpTrashRepository(baseUrl, authToken);
  const projectRepository = new HttpProjectRepository(baseUrl, authToken);
  const routineRepository = new HttpRoutineRepository(baseUrl, authToken);

  const defaultRoute = config.needsSetup ? "/setup" : "/today";

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* WQ-004: オフライン中のバナー表示 */}
      <OfflineBanner />
      {/* SW-001: PWA アップデート通知バナー */}
      <PwaUpdateBanner />
      <Routes>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route
          path="/setup"
          element={
            <SetupViewWithNav
              isNative={config.isNative}
              onSave={(url, token) => {
                setBaseUrl(url);
                setAuthToken(token);
              }}
            />
          }
        />
        <Route path="/today" element={<TodayView repository={taskRepository} projectRepository={projectRepository} />} />
        <Route
          path="/settings"
          element={
            <SettingsView
              repository={settingsRepository}
              serverUrl={config.isNative ? baseUrl : undefined}
              authToken={config.isNative ? authToken : undefined}
              onSaveServer={config.isNative ? (url, token) => { setBaseUrl(url); setAuthToken(token); } : undefined}
            />
          }
        />
        <Route path="/trash" element={<TrashView repository={trashRepository} />} />
        <Route path="/projects" element={<ProjectsView repository={projectRepository} />} />
        <Route path="/routines" element={<RoutinesView repository={routineRepository} />} />
      </Routes>
    </BrowserRouter>
  );
}

interface SetupViewWithNavProps {
  isNative: boolean;
  onSave: (serverUrl: string, authToken: string) => void;
}

function SetupViewWithNav({ isNative, onSave }: SetupViewWithNavProps) {
  const navigate = useNavigate();

  const handleSave = async (serverUrl: string, authToken: string) => {
    if (isNative) {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.set({ key: "serverUrl", value: serverUrl });
        await Preferences.set({ key: "authToken", value: authToken });
      } catch {
        // Preferences が利用できない環境ではスキップ
      }
    }
    onSave(serverUrl, authToken);
    navigate("/today", { replace: true });
  };

  return <SetupView onSave={handleSave} />;
}

async function init() {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error('mount point "#root" not found');
  }

  const native = await loadCapacitorPreferences();

  let config: AppConfig;
  if (native.isNative) {
    config = {
      baseUrl: native.serverUrl,
      authToken: native.authToken,
      isNative: true,
      needsSetup: !native.serverUrl,
    };
  } else {
    config = {
      baseUrl: env.VITE_API_BASE_URL ?? "",
      authToken: env.VITE_AUTH_TOKEN ?? "",
      isNative: false,
      needsSetup: false,
    };
  }

  createRoot(root).render(
    <StrictMode>
      {/* TQ-001: QueryClientProvider でアプリ全体をラップ */}
      <QueryClientProvider client={queryClient}>
        <App config={config} />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void init();
