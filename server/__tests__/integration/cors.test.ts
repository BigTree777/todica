import { describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "../../src/app.js";
import { buildTestApp } from "../helpers/build-test-app.js";

const preflightHeaders = (origin: string) => ({
  Origin: origin,
  "Access-Control-Request-Method": "GET",
});

describe("CORS origin allowlist", () => {
  it("デフォルトで Vite 開発サーバのオリジンを許可する", async () => {
    const { app } = buildTestApp();

    const res = await app.request("/api/v1/tasks", {
      method: "OPTIONS",
      headers: preflightHeaders("http://localhost:5173"),
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("デフォルトで許可リスト外のオリジンを拒否する", async () => {
    const { app } = buildTestApp();

    const res = await app.request("/api/v1/tasks", {
      method: "OPTIONS",
      headers: preflightHeaders("https://evil.com"),
    });

    expect(res.status).toBe(204);
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("ALLOWED_ORIGINS で指定したオリジンを許可する", async () => {
    const { app } = buildTestApp({ allowedOrigins: parseAllowedOrigins("https://example.com") });

    const res = await app.request("/api/v1/tasks", {
      method: "OPTIONS",
      headers: preflightHeaders("https://example.com"),
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });

  it("ALLOWED_ORIGINS を指定するとデフォルトの dev オリジンを拒否する", async () => {
    const { app } = buildTestApp({ allowedOrigins: parseAllowedOrigins("https://example.com") });

    const res = await app.request("/api/v1/tasks", {
      method: "OPTIONS",
      headers: preflightHeaders("http://localhost:5173"),
    });

    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("ALLOWED_ORIGINS にカンマ区切りで指定した複数オリジンを許可する", async () => {
    const { app } = buildTestApp({
      allowedOrigins: parseAllowedOrigins(
        "https://todica.example.com, https://staging.example.com",
      ),
    });

    const res = await app.request("/api/v1/tasks", {
      method: "OPTIONS",
      headers: preflightHeaders("https://staging.example.com"),
    });

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://staging.example.com");
  });

  it("デフォルトで Capacitor のオリジンを許可する", async () => {
    const { app } = buildTestApp();

    const res = await app.request("/api/v1/tasks", {
      method: "OPTIONS",
      headers: preflightHeaders("capacitor://localhost"),
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("capacitor://localhost");
  });

  it("Origin ヘッダがない health check はそのまま処理する", async () => {
    const { app } = buildTestApp({ allowedOrigins: parseAllowedOrigins("https://example.com") });

    const res = await app.request("/healthz");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
