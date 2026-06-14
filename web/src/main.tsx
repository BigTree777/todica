import "./styles/tokens.css";
import "./styles/button.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app.js";
import { init } from "./bootstrap.js";
import { queryClient } from "./query-client.js";

export { App, type AppConfig, type AppProps } from "./app.js";
export { buildHttpRepos } from "./bootstrap.js";

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
