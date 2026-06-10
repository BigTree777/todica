import { ExpirationPlugin } from "workbox-expiration";
/**
 * Service Worker (フェーズ A: PWA 基盤 + フェーズ C: 読み取りキャッシュ + フェーズ D: Background Sync)
 *
 * 仕様:
 *   PWA-002: Service Worker が HTML / JS / CSS 等のシェルを pre-cache する。
 *   RC-001: Workbox stale-while-revalidate 戦略で GET /api/v1/* をキャッシュする。
 *   RC-002: オフライン中に GET リクエストが発生した場合、キャッシュから前回データを返す。
 *   WQ-005: Background Sync API が利用可能な場合、オンライン復帰時にキューを自動再送する。
 *   SW-001: 新しい Service Worker がインストールされた際、SKIP_WAITING メッセージに応答する。
 */
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";

// biome-ignore lint/suspicious/noExplicitAny: Service Worker グローバルスコープの型定義が不完全なため any を使用
declare let self: any;

// PWA-002: プリキャッシュ (vite-plugin-pwa が __WB_MANIFEST を注入する)
precacheAndRoute(self.__WB_MANIFEST);

// シングルページアプリケーション用ナビゲーションルート
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// RC-001: API レスポンスの stale-while-revalidate キャッシュ
registerRoute(
  ({ url }: { url: URL }) => url.pathname.startsWith("/api/v1/"),
  new StaleWhileRevalidate({
    cacheName: "api-cache",
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 86400 })],
  }),
  "GET",
);

// WQ-005: Background Sync ハンドラ
// sync イベントを受信してクライアントに SYNC_QUEUE メッセージを送信する
self.addEventListener("sync", (event: { tag: string; waitUntil: (p: Promise<void>) => void }) => {
  if (event.tag === "todica-write-queue") {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true })
        .then((clients: Array<{ postMessage: (msg: unknown) => void }>) => {
          clients.forEach((client) => client.postMessage({ type: "SYNC_QUEUE" }));
        }),
    );
  }
});

// SW-001: skipWaiting メッセージへの応答
self.addEventListener("message", (event: { data?: { type?: string } }) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});
