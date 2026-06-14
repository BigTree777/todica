import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";

const preflightHeaders = (origin: string) => ({
  Origin: origin,
  "Access-Control-Request-Method": "GET",
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CORS origin allowlist", () => {
  it("デフォルトで Vite 開発サーバのオリジンを許可する", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", "");
    const { app } = buildTestApp();

    const res = await app.request("/healthz", {
      method: "OPTIONS",
      headers: preflightHeaders("http://localhost:5173"),
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("デフォルトで許可リスト外のオリジンを拒否する", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", "");
    const { app } = buildTestApp();

    const res = await app.request("/healthz", {
      method: "OPTIONS",
      headers: preflightHeaders("https://evil.com"),
    });

    expect(res.status).toBe(204);
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("ALLOWED_ORIGINS で指定したオリジンだけを許可する", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", "https://example.com");
    const { app } = buildTestApp();

    const allowed = await app.request("/healthz", {
      method: "OPTIONS",
      headers: preflightHeaders("https://example.com"),
    });
    const denied = await app.request("/healthz", {
      method: "OPTIONS",
      headers: preflightHeaders("http://localhost:5173"),
    });

    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
    expect(denied.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("デフォルトで Capacitor のオリジンを許可する", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", "");
    const { app } = buildTestApp();

    const res = await app.request("/healthz", {
      method: "OPTIONS",
      headers: preflightHeaders("capacitor://localhost"),
    });

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("capacitor://localhost");
  });

  it("Origin ヘッダがない health check はそのまま処理する", async () => {
    vi.stubEnv("ALLOWED_ORIGINS", "");
    const { app } = buildTestApp();

    const res = await app.request("/healthz");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
