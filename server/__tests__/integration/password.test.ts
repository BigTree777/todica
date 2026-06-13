import type { FakeClock } from "@todica/domain/clock";
/**
 * 結合テスト: POST /api/v1/password (パスワード変更).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/password-change/spec.md §「受け入れ基準」
 *     AC-2 / AC-3 / AC-6 / AC-10 / AC-11 / AC-12
 *   - docs/developer/features/password-change/plan.md §「処理フロー — パスワード変更」/ D-3 / D-4
 *
 * 観点:
 *   1. AC-11: Authorization 無しのリクエストは authMiddleware が 401 を返す.
 *             DB の app_password.password_hash は変わらない.
 *   2. AC-2: 認証済み + 正しい現在 PW + 新 PW で 200 を返し,
 *            DB の app_password.password_hash が新 PW を bcrypt.compare で検証可能なハッシュに更新される.
 *            updated_at は呼び出し時刻 (epoch ms) で更新される.
 *   3. AC-6: 成功時に sessions テーブルが空になる (= deleteAll が呼ばれている).
 *            他端末の token も自端末の token も次のリクエストで 401 になる.
 *   4. AC-3: 誤った現在 PW で 401 INVALID_PASSWORD を返し,
 *            DB の app_password.password_hash は変わらず, sessions も削除されない.
 *   5. AC-12: 認証済み + body 形式不正 (newPassword 欠落 / 型不正 / JSON 不正) で
 *             400 INVALID_REQUEST_BODY を返し, DB は不変.
 *   6. AC-10 (in-process E2E): パスワード変更 → 旧 token での /today が 401 →
 *                              新 PW で /login → 200 + 新 token → /today が 200.
 *   7. 新 PW が空文字なら 400 (NFR-PWD-1: 平文を永続化しないとはいえ, 空文字を許容する意味はない).
 *
 * 現状: `POST /api/v1/password` ハンドラは未実装. 全件 red になる想定.
 */
import bcrypt from "bcrypt";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  InMemoryPasswordRepository,
  InMemorySessionRepository,
} from "../helpers/login-for-test.js";
import {
  TEST_PASSWORD,
  authHeadersForToken,
  buildAuthTestApp,
  loginForTest,
} from "../helpers/login-for-test.js";

const NEW_PASSWORD = "new-password-1";

let app: Hono;
let sessionRepo: InMemorySessionRepository;
let passwordRepo: InMemoryPasswordRepository;
let clock: FakeClock;
let token: string;

beforeEach(async () => {
  const built = buildAuthTestApp();
  app = built.app;
  sessionRepo = built.sessionRepository;
  passwordRepo = built.passwordRepository;
  clock = built.clock;
  // /login して Bearer 用 token を取得 (build-test-app.ts と異なり, ここでは
  // sessions に事前 seed していないため login が必要).
  token = await loginForTest(app, TEST_PASSWORD);
});

describe("POST /api/v1/password — 認証 (AC-11)", () => {
  it("Authorization 無しで 401 を返す", async () => {
    const before = await passwordRepo.getHash();
    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });

    expect(res.status).toBe(401);
    // DB の app_password.password_hash は変わらない.
    expect(await passwordRepo.getHash()).toBe(before);
  });

  it("無効 Bearer (sessions に存在しない文字列) で 401 を返す", async () => {
    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken("not-a-valid-token"),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/password — 正常系 (AC-2)", () => {
  it("正しい現在 PW + 新 PW で 200 OK を返す", async () => {
    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });

    expect(res.status).toBe(200);
  });

  it("成功時に DB の password_hash が新 PW を bcrypt.compare で検証可能なハッシュに更新される (AC-2)", async () => {
    await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });

    const newHash = await passwordRepo.getHash();
    expect(newHash).not.toBeNull();
    expect(typeof newHash).toBe("string");
    // 平文を保存していないこと: 新ハッシュは NEW_PASSWORD と等しくない.
    expect(newHash).not.toBe(NEW_PASSWORD);
    // 新 PW を bcrypt.compare で検証可能.
    const verifiable = await bcrypt.compare(NEW_PASSWORD, newHash as string);
    expect(verifiable).toBe(true);
    // 古い PW は検証できない.
    const oldStillWorks = await bcrypt.compare(TEST_PASSWORD, newHash as string);
    expect(oldStillWorks).toBe(false);
  });

  it("成功時に app_password.updated_at が呼び出し時刻 (epoch ms) で更新される (AC-2)", async () => {
    clock.set("2026-06-08T10:11:12.345Z");

    await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });

    const afterUpdatedAt = passwordRepo.peek()?.updatedAt;
    expect(afterUpdatedAt).toBe(new Date(clock.now()).getTime());
  });

  it("currentPassword と newPassword が同じでも 200 を返し DB hash を更新する", async () => {
    const beforeHash = await passwordRepo.getHash();

    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD }),
    });

    expect(res.status).toBe(200);
    const afterHash = await passwordRepo.getHash();
    expect(afterHash).not.toBe(beforeHash);
    expect(await bcrypt.compare(TEST_PASSWORD, afterHash as string)).toBe(true);
  });
});

describe("POST /api/v1/password — 全 sessions 削除 (AC-6)", () => {
  it("成功時に sessions テーブルが空になる", async () => {
    // 他端末用にもう 1 つ token を追加 (= 2 セッション存在).
    const otherToken = await loginForTest(app, TEST_PASSWORD);
    expect(sessionRepo.count()).toBeGreaterThanOrEqual(2);

    await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });

    // 全セッションが消えている.
    expect(sessionRepo.count()).toBe(0);
    // (使わないが) otherToken も無効化されている.
    expect(sessionRepo.get(otherToken)).toBeUndefined();
  });

  it("成功後, 自端末の旧 token で /api/v1/today を叩くと 401 になる (AC-6)", async () => {
    await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });

    const todayRes = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeadersForToken(token),
    });
    expect(todayRes.status).toBe(401);
  });

  it("成功後, 他端末の旧 token で /api/v1/today を叩いても 401 になる (AC-6)", async () => {
    const otherToken = await loginForTest(app, TEST_PASSWORD);

    await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });

    const todayRes = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeadersForToken(otherToken),
    });
    expect(todayRes.status).toBe(401);
  });
});

describe("POST /api/v1/password — 異常系 (AC-3)", () => {
  it("誤った現在 PW で 401 INVALID_PASSWORD を返す", async () => {
    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: "WRONG", newPassword: NEW_PASSWORD }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_PASSWORD");
  });

  it("誤った現在 PW のとき DB の password_hash は変わらない (AC-3)", async () => {
    const before = await passwordRepo.getHash();

    await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: "WRONG", newPassword: NEW_PASSWORD }),
    });

    expect(await passwordRepo.getHash()).toBe(before);
  });

  it("誤った現在 PW のとき sessions テーブルは削除されない (AC-3)", async () => {
    const before = sessionRepo.count();

    await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: "WRONG", newPassword: NEW_PASSWORD }),
    });

    // 既存セッションは残ったまま.
    expect(sessionRepo.count()).toBe(before);
    expect(sessionRepo.get(token)).not.toBeUndefined();
  });
});

describe("POST /api/v1/password — body バリデーション (AC-12)", () => {
  it("newPassword 欠落で 400 INVALID_REQUEST_BODY を返し DB は不変", async () => {
    const before = await passwordRepo.getHash();

    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("INVALID_REQUEST_BODY");
    expect(await passwordRepo.getHash()).toBe(before);
  });

  it("currentPassword 欠落で 400 INVALID_REQUEST_BODY を返し DB は不変", async () => {
    const before = await passwordRepo.getHash();

    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ newPassword: NEW_PASSWORD }),
    });

    expect(res.status).toBe(400);
    expect(await passwordRepo.getHash()).toBe(before);
  });

  it("currentPassword が非文字列 (number) で 400", async () => {
    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: 123, newPassword: NEW_PASSWORD }),
    });
    expect(res.status).toBe(400);
  });

  it("newPassword が非文字列 (number) で 400", async () => {
    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: 123 }),
    });
    expect(res.status).toBe(400);
  });

  it("newPassword が空文字で 400 (空 PW を許容しない)", async () => {
    // クライアント側 (SettingsView) でも空入力は拒否するが, サーバ側の最終防衛も検査する.
    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("body が JSON として不正で 400", async () => {
    const res = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: "{not-json",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/password — 変更後ログイン (AC-10 in-process E2E)", () => {
  it("変更後の新 PW で /api/v1/login を叩くと 200 + token + expiresAt を返す", async () => {
    // パスワード変更.
    const change = await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });
    expect(change.status).toBe(200);

    // 新 PW で再ログイン.
    const loginRes = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: NEW_PASSWORD }),
    });
    expect(loginRes.status).toBe(200);
    const body = (await loginRes.json()) as { token: string; expiresAt: number };
    expect(typeof body.token).toBe("string");
    expect(body.token).toMatch(/^[0-9a-f]{64}$/i);
    expect(typeof body.expiresAt).toBe("number");

    // 旧 PW では 401.
    const oldLogin = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: TEST_PASSWORD }),
    });
    expect(oldLogin.status).toBe(401);
  });

  it("変更後の新 token で /api/v1/today にアクセスできる (AC-10)", async () => {
    await app.request("/api/v1/password", {
      method: "POST",
      headers: authHeadersForToken(token),
      body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }),
    });

    const newToken = await loginForTest(app, NEW_PASSWORD);
    const today = await app.request("/api/v1/today", {
      method: "GET",
      headers: authHeadersForToken(newToken),
    });
    expect(today.status).toBe(200);
  });
});
