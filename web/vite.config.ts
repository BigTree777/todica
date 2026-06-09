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
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
