/**
 * 結合テスト: GET /healthz (BL-013 / サーバ基盤).
 *
 * 受け入れ基準: /healthz は認証なしで 200 OK { status: "ok" } を返す.
 */
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";

describe("GET /healthz", () => {
  it("認証なしで 200 OK を返す", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("Authorization ヘッダを送っても 200 OK を返す", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/healthz", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
