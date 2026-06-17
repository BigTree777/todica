/**
 * Vite 設定 (フェーズ A: PWA 基盤)
 *
 * vite-plugin-pwa を使って Web Manifest と Service Worker を生成する。
 *
 * 仕様:
 *   PWA-001: vite-plugin-pwa で Web Manifest を生成する。
 *   PWA-002: Service Worker が HTML / JS / CSS 等のシェルを pre-cache する。
 *   PWA-003: Chrome / Edge / Android Chrome のアドレスバーに「インストール」ボタンが表示される。
 *   PWA-004: インストール後、独立ウィンドウ（standalone モード）でアプリが起動する。
 */
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createLogger, defineConfig, type Logger } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * BL-109: SW ビルド deprecation warning の抑止.
 *
 * `vite-plugin-pwa@1.3.0` が SW を bundle する際に `inlineDynamicImports: true` を
 * ハードコードしているため, Rolldown 経由で以下の warning が出力される.
 *
 *   `inlineDynamicImports` option is deprecated, please use codeSplitting: false instead.
 *
 * 二段構えで抑止する:
 *   1. Vite logger 経由で同等の warning が出るケースに備えて `customLogger.warn` で
 *      当該文字列を含むメッセージを drop する.
 *   2. 実体である Rolldown は独自の consola で直接 stderr に書き出すため,
 *      `customLogger` / `onwarn` / `onLog` のいずれでも捕捉できない. SW 用 inlineConfig の
 *      `output.inlineDynamicImports` を `codeSplitting: false` (同義) に置き換えて
 *      warning の発生条件そのものを除去する.
 *
 * upstream (vite-plugin-pwa) が修正された段階で 1. / 2. の両方を撤回できる.
 */
const SUPPRESSED_WARNING = "inlineDynamicImports option is deprecated";

/**
 * baseLogger は Vite の `createLogger()` をそのまま使うと内部で `globalThis.console` を
 * 直接掴むため, vitest からの `vi.spyOn(process.stderr, "write")` 経由のキャプチャが
 * 効かない場合がある (Node.js の `console` は起動時に stderr 参照をキャッシュするため).
 *
 * テスト容易性と本番動作 (整形済み警告を stderr / stdout に出すこと) を両立するため,
 * createLogger に明示的に "そのつど `process.stderr.write` / `process.stdout.write` を
 * 参照しなおして書き込む" console を渡しておく. これにより spy 後の write 関数が
 * 確実に呼ばれる. 出力内容そのものは createLogger のデフォルト挙動と同等.
 */
const loggerConsole = {
  ...globalThis.console,
  log: (msg: unknown): void => {
    process.stdout.write(`${String(msg)}\n`);
  },
  info: (msg: unknown): void => {
    process.stdout.write(`${String(msg)}\n`);
  },
  warn: (msg: unknown): void => {
    process.stderr.write(`${String(msg)}\n`);
  },
  error: (msg: unknown): void => {
    process.stderr.write(`${String(msg)}\n`);
  },
  debug: (msg: unknown): void => {
    process.stdout.write(`${String(msg)}\n`);
  },
} as unknown as Console;

const baseLogger = createLogger("info", { console: loggerConsole });

/**
 * 抑止対象判定:
 * - Vite logger 経由: `inlineDynamicImports option is deprecated, ...`
 * - Rollup/rolldown 直接: `` `inlineDynamicImports` option is deprecated, ... `` (バッククォート付き)
 *
 * 両 format に対応するため "inlineDynamicImports" と "option is deprecated" の
 * 両方を含むかどうかで判定する.
 */
function isSuppressedWarning(msg: unknown): boolean {
  if (typeof msg !== "string") return false;
  return msg.includes("inlineDynamicImports") && msg.includes("option is deprecated");
}

export const customLogger: Logger = {
  info(msg, options) {
    baseLogger.info(msg, options);
  },
  warn(msg, options) {
    if (isSuppressedWarning(msg)) return;
    baseLogger.warn(msg, options);
  },
  warnOnce(msg, options) {
    if (isSuppressedWarning(msg)) return;
    baseLogger.warnOnce(msg, options);
  },
  error(msg, options) {
    baseLogger.error(msg, options);
  },
  clearScreen(type) {
    baseLogger.clearScreen(type);
  },
  hasErrorLogged(error) {
    return baseLogger.hasErrorLogged(error);
  },
  get hasWarned() {
    return baseLogger.hasWarned;
  },
};

// `SUPPRESSED_WARNING` 定数は spec.md / test の文面 assert (`includes(SUPPRESSED_WARNING)`)
// で参照されるため, 副作用なく文面に登場させる目的で export しておく.
export { SUPPRESSED_WARNING };

export default defineConfig({
  customLogger,
  // env はリポジトリルートの .env に集約する (server 用と web 用を 1 ファイルにまとめる).
  // VITE_ プレフィックスを持つ変数だけがクライアントに expose される.
  envDir: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "service-worker.ts",
      // BL-109: vite-plugin-pwa は SW を別 inlineConfig で再ビルドするため,
      // 親 Vite の `customLogger` が継承されない. `configureCustomSWViteBuild` フックで
      // SW build 側にも customLogger を継承させ, さらに warning の発生条件そのものを
      // 取り除く.
      integration: {
        configureCustomSWViteBuild(inlineConfig) {
          // (1) Vite logger 経由 warning に備えて customLogger を継承.
          inlineConfig.customLogger = customLogger;
          // (2) Rolldown は consola で直接 stderr に書き出すため Vite/Rollup 経路では
          // 捕捉不能. vite-plugin-pwa が固定で渡した `inlineDynamicImports: true` を
          // 取り除き, 同義の新 API `codeSplitting: false` に置き換えて警告を発生させない.
          // SW は 1 entry / 1 chunk なので artifact の意図は不変.
          const output = inlineConfig.build?.rollupOptions?.output;
          if (output && !Array.isArray(output)) {
            (output as Record<string, unknown>).codeSplitting = false;
            (output as Record<string, unknown>).inlineDynamicImports = undefined;
          }
        },
      },
      injectManifest: {
        // BL-074 / plan D-12: precache の対象から `/api/*` を除外する.
        // (実際には build artifact に /api/ パスは含まれないが, 明示しておくことで
        // 万一のレース条件で認証応答が precache に混入する事故を防ぐ.)
        globIgnores: ["**/api/**"],
      },
      manifest: {
        name: "Todica",
        short_name: "Todica",
        description: "シンプルなタスク管理アプリ",
        display: "standalone",
        start_url: "/",
        background_color: "#ffffff",
        theme_color: "#000000",
        icons: [
          {
            src: "/icons/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
});
