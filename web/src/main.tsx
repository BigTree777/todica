/**
 * Web クライアント起動エントリポイント.
 *
 * - HttpTaskRepository を Vite 環境変数から構築.
 * - TodayView に注入してマウントする.
 *
 * 環境変数 (Vite import.meta.env):
 *   - VITE_API_BASE_URL (default: 同一オリジン)
 *   - VITE_AUTH_TOKEN (必須: Bearer 認証用)
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HttpTaskRepository } from "./repositories/task-repository.js";
import { TodayView } from "./ui/today-view/today-view.js";

interface ViteEnv {
  VITE_API_BASE_URL?: string;
  VITE_AUTH_TOKEN?: string;
}

// import.meta.env は Vite が注入する. types/vite が無い環境向けに緩く受ける.
const env = ((import.meta as unknown as { env?: ViteEnv }).env ?? {}) as ViteEnv;
const BASE_URL = env.VITE_API_BASE_URL ?? "";
const AUTH_TOKEN = env.VITE_AUTH_TOKEN ?? "";

const repository = new HttpTaskRepository(BASE_URL, AUTH_TOKEN);

const root = document.getElementById("root");
if (!root) {
  throw new Error('mount point "#root" not found');
}

createRoot(root).render(
  <StrictMode>
    <TodayView repository={repository} />
  </StrictMode>,
);
