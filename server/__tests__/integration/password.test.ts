import { FakeClock } from "@todica/domain/clock";
/**
 * 結合テスト: POST /api/v1/password (パスワード変更 + 初期設定モード).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/password-change/spec.md §「受け入れ基準」
 *     AC-2 / AC-3 / AC-6 / AC-10 / AC-11 / AC-12
 *   - docs/developer/features/password-change/plan.md §「処理フロー — パスワード変更」/ D-3 / D-4
 *   - docs/developer/features/initial-password-setup/spec.md §「受け入れ基準」AC-5 / AC-6
 *   - docs/developer/features/initial-password-setup/plan.md §「サーバ — `app.ts` (`POST /api/v1/password` の 2 モード分岐)」
 *
 * 観点:
 *   1. AC-11: Authorization 無しのリクエストは authMiddleware が 401 を返す
 *             (= DB に password_hash が存在する通常モードで).
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
 *   8. AC-5 (initial-password-setup): DB が空のとき, Authorization なし + currentPassword 不要 +
 *      { newPassword } で 200 + { token, expiresAt } を返し, app_password に hash を保存,
 *      sessions に token を INSERT する (auto-login).
 *   9. AC-5 補足: 初期設定モードで currentPassword が来ても無視する (= 200).
 *  10. AC-5 補足: 初期設定モードで newPassword が空文字 / 欠落 / 型不正で 400.
 *  11. AC-6 (initial-password-setup): DB に既存 hash があるとき Authorization なしの
 *      初期設定モード相当リクエスト ({ newPassword: ... }) は通常モードに落ち, 401 を返す.
 *
 * 現状: `POST /api/v1/password` ハンドラ + 初期設定モード分岐は未実装. 全件 red になる想定.
 */
import bcrypt from "bcrypt";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import {
  InMemoryCounterRepository,
  InMemoryFocusRepository,
  InMemoryIdempotencyStore,
  InMemoryProjectRepository,
  InMemoryRoutineRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "../helpers/in-memory-repositories.js";
import {
  InMemoryPasswordRepository,
  InMemorySessionRepository,
  TEST_INITIAL_TIME,
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

// ============================================================
// 初期設定モード (initial-password-setup AC-5 / AC-6)
//
// DB の app_password が空のとき POST /api/v1/password は:
//   - Authorization 不要 (authMiddleware 素通し)
//   - currentPassword 不要 (受理しても無視)
//   - newPassword から bcrypt hash を生成して app_password に保存
//   - auto-login token を発行 / sessions に INSERT / 200 + { token, expiresAt } を返す
//
// DB に既存 hash がある状態では従来仕様 (Bearer + currentPassword 必須) に戻る.
// ============================================================

describe("POST /api/v1/password — 初期設定モード (initial-password-setup AC-5)", () => {
  /** DB が空 (= app_password 未 seed) の状態でアプリを構築する. */
  function buildUninitializedApp() {
    const taskRepository = new InMemoryTaskRepository();
    const projectRepository = new InMemoryProjectRepository();
    const idempotencyStore = new InMemoryIdempotencyStore();
    const focusRepository = new InMemoryFocusRepository();
    const counterRepository = new InMemoryCounterRepository();
    const settingsRepository = new InMemorySettingsRepository();
    const routineRepository = new InMemoryRoutineRepository();
    const sessionRepository = new InMemorySessionRepository();
    const clockUninit = new FakeClock(TEST_INITIAL_TIME);
    // initialHash 省略 = app_password 空.
    const passwordRepository = new InMemoryPasswordRepository();

    const appUninit = createApp({
      taskRepository,
      projectRepository,
      idempotencyStore,
      focusRepository,
      counterRepository,
      settingsRepository,
      routineRepository,
      sessionRepository,
      clock: clockUninit,
      passwordRepository,
    });

    return {
      app: appUninit,
      passwordRepository,
      sessionRepository,
      clock: clockUninit,
    };
  }

  it("AC-5: DB 空 + Authorization なし + { newPassword: 'P0' } で 200 + { token, expiresAt } を返す", async () => {
    const { app: uninitApp, passwordRepository, sessionRepository } = buildUninitializedApp();
    expect(await passwordRepository.getHash()).toBeNull();
    expect(sessionRepository.count()).toBe(0);

    const res = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "P0" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: unknown; expiresAt?: unknown };
    expect(typeof body.token).toBe("string");
    // token は crypto.randomBytes(32).toString("hex") = 64 文字 16 進数.
    expect(body.token as string).toMatch(/^[0-9a-f]{64}$/i);
    expect(typeof body.expiresAt).toBe("number");
  });

  it("AC-5: 成功時に app_password に hash が保存され, bcrypt.compare で newPassword を検証できる", async () => {
    const { app: uninitApp, passwordRepository } = buildUninitializedApp();

    const res = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "P0" }),
    });
    expect(res.status).toBe(200);

    const hash = await passwordRepository.getHash();
    expect(hash).not.toBeNull();
    expect(typeof hash).toBe("string");
    // 平文を保存していないこと.
    expect(hash).not.toBe("P0");
    expect(await bcrypt.compare("P0", hash as string)).toBe(true);
  });

  it("AC-5: 成功時にレスポンスの token が sessions テーブルに 1 行 INSERT される", async () => {
    const { app: uninitApp, sessionRepository, clock } = buildUninitializedApp();

    const res = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "P0" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: number };

    expect(sessionRepository.count()).toBe(1);
    const stored = sessionRepository.get(body.token);
    expect(stored).not.toBeUndefined();
    expect(stored?.expiresAt).toBe(body.expiresAt);
    // expiresAt = clock.now() + 30 日.
    const nowMs = new Date(clock.now()).getTime();
    expect(body.expiresAt).toBe(nowMs + 30 * 24 * 60 * 60 * 1000);
  });

  it("AC-5 補足: 初期設定モードで currentPassword が来ても無視され 200 を返す", async () => {
    const { app: uninitApp, passwordRepository } = buildUninitializedApp();

    const res = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // currentPassword が来ても DB が空なので無視されて 200.
      body: JSON.stringify({ currentPassword: "ignored", newPassword: "P0" }),
    });
    expect(res.status).toBe(200);
    expect(await passwordRepository.getHash()).not.toBeNull();
  });

  it("AC-5 補足: 初期設定モードで newPassword が空文字なら 400 INVALID_REQUEST_BODY", async () => {
    const { app: uninitApp, passwordRepository, sessionRepository } = buildUninitializedApp();

    const res = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "" }),
    });
    expect(res.status).toBe(400);
    // DB は不変 / sessions も増えない.
    expect(await passwordRepository.getHash()).toBeNull();
    expect(sessionRepository.count()).toBe(0);
  });

  it("AC-5 補足: 初期設定モードで newPassword が欠落なら 400 INVALID_REQUEST_BODY", async () => {
    const { app: uninitApp, passwordRepository } = buildUninitializedApp();

    const res = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(await passwordRepository.getHash()).toBeNull();
  });

  it("AC-5 補足: 初期設定モードで newPassword が非文字列 (number) なら 400", async () => {
    const { app: uninitApp, passwordRepository } = buildUninitializedApp();

    const res = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: 123 }),
    });
    expect(res.status).toBe(400);
    expect(await passwordRepository.getHash()).toBeNull();
  });

  it("AC-5 補足: 初期設定モードで body が JSON として不正なら 400", async () => {
    const { app: uninitApp, passwordRepository } = buildUninitializedApp();

    const res = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
    expect(await passwordRepository.getHash()).toBeNull();
  });

  it("AC-5 補足: 初期設定モード成功直後にもう一度同じリクエストを叩くと, 通常モードに切り替わって 401 を返す", async () => {
    const { app: uninitApp } = buildUninitializedApp();

    const first = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "P0" }),
    });
    expect(first.status).toBe(200);

    // この時点で DB に hash が入った状態. 認証なしで叩くと 401.
    const second = await uninitApp.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "P1" }),
    });
    expect(second.status).toBe(401);
  });
});

describe("POST /api/v1/password — 通常モードで初期設定相当 body (initial-password-setup AC-6)", () => {
  it("DB あり + Authorization なし + { newPassword: 'P1' } (currentPassword 無し) で 401 を返し DB は不変", async () => {
    // 既存 buildAuthTestApp は app_password に hash を 1 件 seed 済み (= 通常モード).
    const built = buildAuthTestApp();
    const before = await built.passwordRepository.getHash();

    const res = await built.app.request("/api/v1/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "P1" }),
    });

    // 認証必須 (= 401). 409 INITIAL_SETUP_DONE で返す設計でも互換とするが,
    // plan.md/spec.md の通常モード仕様は 401 を想定するため 401 を期待する.
    expect(res.status).toBe(401);
    expect(await built.passwordRepository.getHash()).toBe(before);
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
