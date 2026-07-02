import "./styles/tokens.css";
import "./styles/button.css";
import "./styles/base.css";
import { registerSW } from "virtual:pwa-register";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app.js";
import { init } from "./bootstrap.js";
import { queryClient } from "./query-client.js";

export { App, type AppConfig, type AppProps } from "./app.js";
export { buildHttpRepos } from "./bootstrap.js";

// Service Worker を OS / ブラウザに登録する.
// 新しい SW が waiting 状態になったときの UI は SwUpdateDialog が
// navigator.serviceWorker.ready 経由で polling して扱うため,
// ここでは onNeedRefresh / onOfflineReady は no-op で登録のみ行う.
registerSW({
  onNeedRefresh() {
    /* SwUpdateDialog が表示する */
  },
  onOfflineReady() {
    /* オフライン準備完了の通知は別 BL に切り出し済 / 現状は無音 */
  },
});

const root = document.getElementById("root");
if (root) {
  void init().then(({ config, repos, authStorage }) => {
    createRoot(root).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App config={config} repos={repos} authStorage={authStorage} />
          </BrowserRouter>
        </QueryClientProvider>
      </StrictMode>,
    );
  });
}
