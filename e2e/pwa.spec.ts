/**
 * PWA / Service Worker E2E (BL-028).
 *
 * 現在の Playwright (1.60) は `headless: true` 時に `chromium-headless-shell` を
 * 使うため Service Worker が登録されない (実機 Chrome では動く). 本ファイルは
 * その制約下でも検証可能な静的成果物 (manifest / SW スクリプト配信) のみを扱う.
 *
 * 本テストでは扱わない (full Chromium + prod build が必要なため BL-032 に切り出し):
 *   - SW 登録 → activated 到達
 *   - Lighthouse PWA 監査自動化
 *   - オフライン再アクセスでのシェル提供 (dev は precacheAndRoute が空)
 *   - インストールプロンプト表示 (beforeinstallprompt は headless で発火しない)
 *   - SW 更新通知 (vite-plugin-pwa prompt 戦略)
 */
import { expect, test } from "@playwright/test";

test("manifest.webmanifest が PWA 必須フィールドを満たす", async ({ request }) => {
  const res = await request.get("http://localhost:5173/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = (await res.json()) as {
    name?: string;
    short_name?: string;
    start_url?: string;
    display?: string;
    icons?: Array<{ src: string; sizes: string; type: string }>;
  };

  // PWA installable 要件 (Chrome の add-to-home-screen 基準).
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.display).toMatch(/standalone|fullscreen|minimal-ui/);
  expect(manifest.icons?.length ?? 0).toBeGreaterThan(0);

  // 192x192 と 512x512 の PNG アイコンが揃っていること (Chrome / Android 要件).
  const sizes = manifest.icons?.map((i) => i.sizes) ?? [];
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
});

test("Service Worker 登録スクリプトが配信され必要な workbox 機能が含まれている", async ({
  request,
}) => {
  // SW の実体は `/dev-sw.js?dev-sw` で vite-plugin-pwa が dynamic に生成して配信する.
  // 中身に precache / NavigationRoute / API キャッシュ戦略 / 書込キュー sync の
  // 主要 4 機能が含まれていれば, SW 設計と vite-plugin-pwa 統合が壊れていない.
  const res = await request.get("http://localhost:5173/dev-sw.js?dev-sw");
  expect(res.status()).toBe(200);
  const text = await res.text();

  expect(text).toContain("precacheAndRoute");
  expect(text).toContain("NavigationRoute");
  expect(text).toContain("StaleWhileRevalidate");
  expect(text).toContain("todica-write-queue");
});
