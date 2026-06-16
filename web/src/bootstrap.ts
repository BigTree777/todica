import type { AppConfig, Repositories } from "./app.js";
import type { AuthStorage } from "./auth/auth-storage.js";
import { CapacitorAuthStorage, WebAuthStorage } from "./auth/auth-storage.js";
import { setAuthStorage } from "./auth/authed-fetch.js";
import { HttpProjectRepository } from "./repositories/project-repository.js";
import { HttpRoutineRepository } from "./repositories/routine-repository.js";
import { HttpSettingsRepository } from "./repositories/settings-repository.js";
import { HttpTaskRepository } from "./repositories/task-repository.js";
import { HttpTrashRepository } from "./repositories/trash-repository.js";

interface ViteEnv {
  VITE_API_BASE_URL?: string;
}

export interface BootstrapResult {
  config: AppConfig;
  repos: Repositories;
  authStorage: AuthStorage;
}

export function buildHttpRepos(baseUrl: string): Repositories {
  return {
    task: new HttpTaskRepository(baseUrl),
    settings: new HttpSettingsRepository(baseUrl),
    trash: new HttpTrashRepository(baseUrl),
    project: new HttpProjectRepository(baseUrl),
    routine: new HttpRoutineRepository(baseUrl),
  };
}

// import.meta.env は Vite が注入する. types/vite が無い環境向けに緩く受ける.
const env = ((import.meta as unknown as { env?: ViteEnv }).env ?? {}) as ViteEnv;

export async function init(): Promise<BootstrapResult> {
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
      await new LocalResetUsecase(db).runIfNeeded(new Date());

      config = { mode: "local", baseUrl: "", authToken: "", isNative: true, needsSetup: false };
      repos = {
        task: new LocalTaskRepository(db),
        settings: new LocalSettingsRepository(db),
        trash: new LocalTrashRepository(db),
        project: new LocalProjectRepository(db),
        routine: new LocalRoutineRepository(db),
      };
    } else {
      const url = serverUrl ?? "";
      const token = (await authStorage.getToken()) ?? "";
      config = { mode: "server", baseUrl: url, authToken: token, isNative: true, needsSetup: !url };
      repos = buildHttpRepos(url);
    }
  } catch {
    authStorage = new WebAuthStorage();
    const baseUrl = env.VITE_API_BASE_URL ?? "";
    const token = (await authStorage.getToken()) ?? "";
    config = { mode: "server", baseUrl, authToken: token, isNative: false, needsSetup: false };
    repos = buildHttpRepos(baseUrl);
  }

  setAuthStorage(authStorage);
  return { config, repos, authStorage };
}
