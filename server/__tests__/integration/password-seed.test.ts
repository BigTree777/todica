/**
 * 結合テスト: 起動時パスワード seed ロジック.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/password-change/spec.md §「受け入れ基準」AC-8 / AC-9
 *   - docs/developer/features/password-change/plan.md §「処理フロー — 起動時 seed」/ D-1 / D-2 / D-7
 *
 * 観点:
 *   1. AC-8: app_password テーブルが空のとき, env で渡された hash を seed (INSERT) する.
 *   2. AC-9: app_password テーブルに既存行があるとき, env は読まれず DB 値が維持される.
 *   3. env 空 + DB 空 のときは seed しない (呼出元が exit するため, seed 関数自体は no-op).
 *
 * 設計上の切り分け (plan.md D-7):
 *   - 起動時 seed ロジックを単体テスト可能な関数に切り出す.
 *     例: `seedPasswordIfEmpty(repo, envHash, now)`.
 *   - 本テストではこの関数の振る舞いを直接検証する.
 *
 * 現状: `seedPasswordIfEmpty` は未実装. インポート不能で red.
 *       implementer が Step 4 で main.ts と並行して新設することで green 化する.
 */
import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import type { PasswordRepository } from "../../src/data/password-repository.js";
import { seedPasswordIfEmpty } from "../../src/password-seed.js";
import { buildAuthTestApp } from "../helpers/login-for-test.js";

/**
 * テスト用の in-memory `PasswordRepository`.
 * Drizzle 実装と振る舞いを揃える (上書き upsert).
 */
class InMemoryPasswordRepository implements PasswordRepository {
  private current: { hash: string; updatedAt: number } | null = null;

  async getHash(): Promise<string | null> {
    return this.current?.hash ?? null;
  }

  async setHash(hash: string, updatedAt: number): Promise<void> {
    this.current = { hash, updatedAt };
  }

  /** テスト用: 行を直接 seed するためのフック. */
  preset(hash: string, updatedAt: number): void {
    this.current = { hash, updatedAt };
  }

  /** テスト用: setHash が呼ばれたかを検査する用途で値を覗く. */
  peek(): { hash: string; updatedAt: number } | null {
    return this.current;
  }
}

const ENV_HASH = "$2b$12$ENVHASH_XXXXXXXXXXXXXX";
const DB_HASH = "$2b$12$DBHASH__YYYYYYYYYYYYYY";
const NOW = 1_700_000_000_000;

describe("seedPasswordIfEmpty (AC-8 / AC-9)", () => {
  it("AC-8: app_password が空 + env が非空 のとき env で seed する (INSERT)", async () => {
    const repo = new InMemoryPasswordRepository();
    // 前提: repo は空 (getHash() === null).
    expect(await repo.getHash()).toBeNull();

    await seedPasswordIfEmpty(repo, ENV_HASH, NOW);

    // env の hash が DB に書き込まれている.
    expect(await repo.getHash()).toBe(ENV_HASH);
    expect(repo.peek()?.updatedAt).toBe(NOW);
  });

  it("AC-9: app_password に既存行があるとき env は読まれず DB 値が維持される", async () => {
    const repo = new InMemoryPasswordRepository();
    // 前提: 既に DB に DB_HASH が入っている.
    repo.preset(DB_HASH, NOW - 1000);

    await seedPasswordIfEmpty(repo, ENV_HASH, NOW);

    // DB 値は変わらない (env を無視).
    expect(await repo.getHash()).toBe(DB_HASH);
    // updated_at も変わらない (= setHash が呼ばれていない).
    expect(repo.peek()?.updatedAt).toBe(NOW - 1000);
  });

  it("env が空文字 + DB が空 のときは seed しない (呼出元が exit する責務)", async () => {
    // plan.md §「処理フロー — 起動時 seed」 4 番:
    //   `APP_PASSWORD_HASH` 環境変数が空文字なら従来どおり `process.exit(1)`.
    //   seed 関数自体は env が空のとき副作用を起こさない.
    const repo = new InMemoryPasswordRepository();

    await seedPasswordIfEmpty(repo, "", NOW);

    expect(await repo.getHash()).toBeNull();
  });

  it("env が空文字 + DB に既存行 のときも DB 値はそのまま (env を読まない)", async () => {
    const repo = new InMemoryPasswordRepository();
    repo.preset(DB_HASH, NOW - 1000);

    await seedPasswordIfEmpty(repo, "", NOW);

    expect(await repo.getHash()).toBe(DB_HASH);
    expect(repo.peek()?.updatedAt).toBe(NOW - 1000);
  });

  it("AC-9: DB に seed 済みのパスワードでログインでき env 側の平文ではログインできない", async () => {
    const dbPassword = "db-password";
    const envPassword = "env-password";
    const built = buildAuthTestApp({ password: dbPassword });
    const envHash = bcrypt.hashSync(envPassword, 4);

    await seedPasswordIfEmpty(built.passwordRepository, envHash, NOW);

    const dbLogin = await built.app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: dbPassword }),
    });
    const envLogin = await built.app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: envPassword }),
    });

    expect(dbLogin.status).toBe(200);
    expect(envLogin.status).toBe(401);
  });
});
