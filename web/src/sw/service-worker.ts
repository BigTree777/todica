/**
 * Service Worker (フェーズ A: PWA 基盤 + フェーズ D: Background Sync)
 *
 * 仕様:
 *   PWA-002: Service Worker が HTML / JS / CSS 等のシェルを pre-cache する。
 *   WQ-005: Background Sync API が利用可能な場合、オンライン復帰時にキューを自動再送する。
 *   SW-001: 新しい Service Worker がインストールされた際、SKIP_WAITING メッセージに応答する。
 *   BL-074: `/api/*` は SW から完全に除外 (login/logout/認証応答が SW にキャッシュされる事故を防ぐ).
 *           navigation fallback denylist と runtime caching の両方で `/api/` を扱わない.
 */
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

// biome-ignore lint/suspicious/noExplicitAny: Service Worker グローバルスコープの型定義が不完全なため any を使用
declare let self: any;

// PWA-002: プリキャッシュ (vite-plugin-pwa が __WB_MANIFEST を注入する)
precacheAndRoute(self.__WB_MANIFEST);

// シングルページアプリケーションナビゲーションルート.
// BL-074: `/api/*` はナビゲーション fallback 対象外 (denylist).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//],
  }),
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
