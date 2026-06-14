import type { ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { AppConfig, AppMode, Repositories } from "./app.js";
import { AppShell } from "./ui/app-shell/app-shell.js";
import { FocusView } from "./ui/focus-view/focus-view.js";
import { ProjectsView } from "./ui/projects-view/projects-view.js";
import { RoutinesView } from "./ui/routines-view/routines-view.js";
import { SettingsView } from "./ui/settings-view/settings-view.js";
import { SetupView } from "./ui/setup-view/setup-view.js";
import { TodayView } from "./ui/today-view/today-view.js";
import { TomorrowView } from "./ui/tomorrow-view/tomorrow-view.js";
import { TrashView } from "./ui/trash-view/trash-view.js";

interface ProtectedRouteProps {
  allowed: boolean;
  children: ReactNode;
}

export function ProtectedRoute({ allowed, children }: ProtectedRouteProps) {
  return allowed ? children : <Navigate to="/" replace />;
}

interface AppRoutesProps {
  config: AppConfig;
  repos: Repositories;
  currentMode: AppMode;
  token: string | null;
  defaultRoute: string;
  onSetupValidated: (serverUrl: string) => Promise<void>;
  onSelectLocal?: () => Promise<void>;
  onSwitchMode?: () => Promise<void>;
  onLogout: () => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onPasswordChanged: () => Promise<void>;
}

export function AppRoutes({
  config,
  repos,
  currentMode,
  token,
  defaultRoute,
  onSetupValidated,
  onSelectLocal,
  onSwitchMode,
  onLogout,
  onChangePassword,
  onPasswordChanged,
}: AppRoutesProps) {
  const canAccessApp = currentMode === "local" || token !== null;

  return (
    <Routes>
      {/* /setup は AppShell の外に置き、サイドバーを表示しない. */}
      <Route
        path="/setup"
        element={<SetupViewWithNav onValidated={onSetupValidated} onSelectLocal={onSelectLocal} />}
      />
      <Route
        element={
          <ProtectedRoute allowed={canAccessApp}>
            <AppShell />
          </ProtectedRoute>
        }
      >
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
              onSwitchMode={onSwitchMode}
              onLogout={currentMode === "server" && token ? onLogout : undefined}
              onChangePassword={currentMode === "server" && token ? onChangePassword : undefined}
              onPasswordChanged={onPasswordChanged}
            />
          }
        />
        <Route path="/trash" element={<TrashView repository={repos.trash} />} />
        <Route path="/projects" element={<ProjectsView repository={repos.project} />} />
        <Route path="/routines" element={<RoutinesView repository={repos.routine} />} />
      </Route>
    </Routes>
  );
}

interface SetupViewWithNavProps {
  onValidated: (serverUrl: string) => Promise<void>;
  onSelectLocal?: () => Promise<void>;
}

function SetupViewWithNav({ onValidated, onSelectLocal }: SetupViewWithNavProps) {
  const navigate = useNavigate();

  const handleValidated = async (serverUrl: string) => {
    await onValidated(serverUrl);
    navigate("/", { replace: true });
  };

  return <SetupView onValidated={handleValidated} onSelectLocal={onSelectLocal} />;
}
