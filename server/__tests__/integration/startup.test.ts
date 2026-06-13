/**
 * 結合テスト: サーバ起動関連 (BL-013 / サーバ基盤).
 *
 * 受け入れ基準:
 *   - GET /healthz が 200 OK を返す（サーバが起動している証拠）
 *   - GET /api/v1/tasks で Authorization ヘッダなし → 401
 *
 * 認証は DB のパスワードハッシュと sessions テーブルで行う。
 * DB が空でもサーバは起動し、ブラウザから初期パスワードを設定できる。
 */
import { describe, expect, it } from "vitest";
import { buildAuthTestApp } from "../helpers/login-for-test.js";

describe("サーバ起動 / ヘルスチェック", () => {
  it("GET /healthz が 200 OK を返す（サーバ起動確認）", async () => {
    const { app } = buildAuthTestApp();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

describe("Bearer 認証 (sessions lookup)", () => {
  it("GET /api/v1/tasks で Authorization ヘッダなし → 401 (AC-1)", async () => {
    const { app } = buildAuthTestApp();
    const res = await app.request("/api/v1/tasks");
    expect(res.status).toBe(401);
  });
});
