/**
 * 結合テスト: サーバ起動関連 (BL-013 / サーバ基盤).
 *
 * 受け入れ基準:
 *   - GET /healthz が 200 OK を返す（サーバが起動している証拠）
 *   - GET /api/v1/tasks で Authorization ヘッダなし → 401
 *
 * 注: AUTH_TOKEN 未設定時の exit(1) は main.ts のトップレベルコードで担保されており、
 * vitest からモジュールインポートだけで process.exit が走るため自動テストは困難。
 * このシナリオは main.ts の実装コードで担保し、自動テスト対象外とする。
 */
import { describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";

describe("サーバ起動 / ヘルスチェック", () => {
  it("GET /healthz が 200 OK を返す（サーバ起動確認）", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

describe("Bearer 認証", () => {
  it("GET /api/v1/tasks で Authorization ヘッダなし → 401", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/api/v1/tasks");
    expect(res.status).toBe(401);
  });
});
