/**
 * Web クライアント起動エントリポイント (BL-014 / web-client-foundation).
 *
 * - BrowserRouter + Routes でルーティングを設定.
 * - "/"         → /today にリダイレクト
 * - "/today"    → TodayView
 * - "/settings" → SettingsView
 * - "/trash"    → TrashView
 *
 * 環境変数 (Vite import.meta.env):
 *   - VITE_API_BASE_URL (default: 同一オリジン)
 *   - VITE_AUTH_TOKEN (必須: Bearer 認証用)
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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

interface ViteEnv {
  VITE_API_BASE_URL?: string;
  VITE_AUTH_TOKEN?: string;
}

// import.meta.env は Vite が注入する. types/vite が無い環境向けに緩く受ける.
const env = ((import.meta as unknown as { env?: ViteEnv }).env ?? {}) as ViteEnv;
const BASE_URL = env.VITE_API_BASE_URL ?? "";
const AUTH_TOKEN = env.VITE_AUTH_TOKEN ?? "";

const taskRepository = new HttpTaskRepository(BASE_URL, AUTH_TOKEN);
const settingsRepository = new HttpSettingsRepository(BASE_URL, AUTH_TOKEN);
const trashRepository = new HttpTrashRepository(BASE_URL, AUTH_TOKEN);
const projectRepository = new HttpProjectRepository(BASE_URL, AUTH_TOKEN);
const routineRepository = new HttpRoutineRepository(BASE_URL, AUTH_TOKEN);

const root = document.getElementById("root");
if (!root) {
  throw new Error('mount point "#root" not found');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayView repository={taskRepository} projectRepository={projectRepository} />} />
        <Route path="/settings" element={<SettingsView repository={settingsRepository} />} />
        <Route path="/trash" element={<TrashView repository={trashRepository} />} />
        <Route path="/projects" element={<ProjectsView repository={projectRepository} />} />
        <Route path="/routines" element={<RoutinesView repository={routineRepository} />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
