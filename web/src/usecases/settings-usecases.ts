/**
 * Settings 系統の Web mutation ユースケース (BL-118 / Q-7 完全適合).
 *
 * settings-view が直書きしていた patchSettings mutation + 412 (PatchConflictError)
 * 判定をアプリケーション層へ集約する. view からは PatchConflictError 型を撤去し,
 * 412 検知時は `deps.onConflict(serverSettings)` で view へ最新値だけを渡す.
 *
 * settings は offline-queue を使わない (patchSettings を直接呼ぶだけ) ため,
 * enqueue / dequeue / オフライン楽観成功の分岐は持たない (現挙動踏襲).
 */

import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import type {
  PatchSettingsCommand,
  Settings,
  SettingsRepository,
} from "../repositories/settings-repository.js";
import { PatchConflictError } from "../repositories/settings-repository.js";

/** settings ユースケースに注入するサイドエフェクト. */
export interface SettingsMutationDeps {
  /** 412 検知時に view へ最新サーバ値を渡す. view が表示・ConflictDialog 起動を担う. */
  onConflict?: (serverSettings: Settings) => void;
}

/**
 * 412 を usecase 境界の外へ伝える内部マーカー.
 *
 * mutationFn 内で PatchConflictError を捕捉して onConflict を起動するが,
 * `mutateAsync` を呼ぶ view 側に「成功 (= 再フェッチ + cache 反映) すべきでない」ことを
 * 伝えるため reject させる. view は理由を見ず try/catch で握るだけでよい
 * (PatchConflictError 型に触れない).
 */
class SettingsConflictHandled extends Error {
  constructor() {
    super("settings patch conflict handled by usecase");
    this.name = "SettingsConflictHandled";
  }
}

export interface SettingsMutations {
  patch: UseMutationResult<Settings | undefined, Error, PatchSettingsCommand>;
}

/** Settings mutation をまとめて返すフック (patch のみ). */
export function useSettingsMutations(
  repository: SettingsRepository,
  deps?: SettingsMutationDeps,
): SettingsMutations {
  const patch = useMutation({
    mutationFn: async (cmd: PatchSettingsCommand): Promise<Settings | undefined> => {
      try {
        return await repository.patchSettings(cmd);
      } catch (err) {
        if (err instanceof PatchConflictError) {
          // 412: 最新サーバ値を view へ渡す. 追加 GET はしない (D-004).
          deps?.onConflict?.(err.settings);
          throw new SettingsConflictHandled();
        }
        throw err;
      }
    },
    networkMode: "offlineFirst",
  });

  return { patch };
}
