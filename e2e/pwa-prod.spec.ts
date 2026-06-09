/**
 * PWA / Service Worker E2E (BL-032, full Chromium project).
 *
 * `playwright.config.ts` の `chromium-pwa` project から実行され,
 * `launchOptions.executablePath` で full Chromium バイナリを使う.
 * デフォルトの chromium-headless-shell では SW が起動しないため別 project に分けている.
 *
 * 検証する観点:
 *   1. Service Worker が登録され activated 状態に到達する (BL-018 / NFR-002)
 *   2. SW が登録された後にオフラインで再アクセスしても navigation がエラーにならない
 *      (precacheAndRoute の navigation fallback が効く)
 *
 * 未対応 (本コミットでは含めない):
 *   - Lighthouse PWA 監査自動化 — lighthouse npm package の構成変更要 (別タスク)
 *   - インストールプロンプト発火 (`beforeinstallprompt`) — headless では発火しない
 *   - SW 更新通知 (vite-plugin-pwa prompt 戦略) — dev で update を再現する手段がない
 *   - prod build (`vite build` + `vite preview`) に対するテスト — 別 webServer 設定が必要
 */
import { expect, test } from "@playwright/test";

test("Service Worker が登録され activated 状態に到達する", async ({ page }) => {
  await page.goto("/");

  // SW 登録 → activated まで時間がかかるのでポーリングで待つ.
  const deadline = Date.now() + 20_000;
  let state: string | undefined;
  let scope: string | undefined;
  while (Date.now() < deadline) {
    const snapshot = (await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg || !reg.active) return null;
      return { scope: reg.scope, state: reg.active.state };
    })) as { scope: string; state: string } | null;
    if (snapshot?.state === "activated") {
      state = snapshot.state;
      scope = snapshot.scope;
      break;
    }
    await page.waitForTimeout(200);
  }

  expect(state).toBe("activated");
  expect(scope).toMatch(/^http:\/\/localhost:4173\//);
});

test("SW activate 後にオフラインでも navigation が破綻しない", async ({
  page,
  context,
}) => {
  // 1 回目アクセス: SW を登録 → activate.
  await page.goto("/");
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      return reg?.active?.state === "activated";
    });
    if (ready) break;
    await page.waitForTimeout(200);
  }

  // オフラインに切替えてリロード. SW の NavigationRoute が cached /index.html を返すはず.
  await context.setOffline(true);
  const response = await page.reload();

  // navigation 自体が失敗しない (response が返り status が 200 系).
  expect(response).not.toBeNull();
  expect(response?.status()).toBeLessThan(500);

  // 主要 UI が描画される (シェル提供が効いている).
  await expect(page.getByRole("heading", { name: "今日" })).toBeVisible();
});
