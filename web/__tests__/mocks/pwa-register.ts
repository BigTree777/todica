/**
 * vitest 環境用の `virtual:pwa-register` スタブ.
 *
 * 実体は vite-plugin-pwa が build / dev 時に生成する仮想モジュールだが
 * vitest はこのプラグインを通さないため import が失敗する. vitest.config.ts
 * の alias でこのファイルに差し替え, no-op で型互換のみ満たす.
 */

export type RegisterSWOptions = {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
};

export function registerSW(_options?: RegisterSWOptions): (reload?: boolean) => Promise<void> {
  return async () => {
    /* no-op */
  };
}
