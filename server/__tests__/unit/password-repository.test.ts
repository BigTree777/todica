/**
 * 単体テスト: DrizzlePasswordRepository (better-sqlite3 + drizzle-orm).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/password-change/spec.md §「受け入れ基準」AC-8 / AC-9
 *   - docs/developer/features/password-change/plan.md §「Repository インターフェース」
 *
 * 観点:
 *   1. getHash() は app_password テーブルが空のとき null を返す.
 *   2. setHash(hash, updatedAt) は INSERT (初回) として動作し,
 *      その後 getHash() で同じハッシュが返る.
 *   3. setHash(hash, updatedAt) は UPDATE (2 回目以降) としても動作し,
 *      最新の値で上書きされる (= upsert).
 *   4. app_password テーブルは単一行 (id = "current") 設計.
 *      setHash を複数回呼んでも行数は 1 のまま保たれる.
 *
 * 現状: DrizzlePasswordRepository は未実装. インポート不能でコンパイルエラー → red.
 *       implementer が Step 1 で実装することで green 化する.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../../src/db/schema.js";
import { DrizzlePasswordRepository } from "../../src/infra/persistence/drizzle/drizzle-password-repository.js";

/**
 * 本実装で使うことになる app_password テーブル定義の最低限を CREATE TABLE で立てる.
 * カラム名は plan.md §「データモデル」と一致させる (snake_case).
 *
 * - id: 単一行 singleton の PK (固定値 "current").
 * - password_hash: bcrypt ハッシュ文字列.
 * - updated_at: Unix epoch ms.
 */
const CREATE_APP_PASSWORD_SQL = `
CREATE TABLE IF NOT EXISTS app_password (
  id TEXT PRIMARY KEY NOT NULL,
  password_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const HASH_A = "$2b$12$AAAAAAAAAAAAAAAAAAAAAA"; // 形式的に bcrypt 風の文字列 (実 hash でなくてよい).
const HASH_B = "$2b$12$BBBBBBBBBBBBBBBBBBBBBB";
const T0 = 1_700_000_000_000;
const T1 = 1_700_000_100_000;

let sqlite: Database.Database;
let repo: DrizzlePasswordRepository;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(CREATE_APP_PASSWORD_SQL);
  const db = drizzle(sqlite, { schema });
  repo = new DrizzlePasswordRepository({ db });
});

afterEach(() => {
  sqlite.close();
});

describe("DrizzlePasswordRepository", () => {
  it("getHash() は app_password が空のとき null を返す (AC-8 基盤)", async () => {
    // 起動時 seed の判定で参照される: null なら env で seed する.
    const hash = await repo.getHash();
    expect(hash).toBeNull();
  });

  it("setHash(hash, t) は初回 INSERT として動作し, 直後の getHash() で同じ値を返す", async () => {
    await repo.setHash(HASH_A, T0);

    const hash = await repo.getHash();
    expect(hash).toBe(HASH_A);
  });

  it("setHash(hash, t) は 2 回目以降 UPDATE として動作し, 最新の値で上書きされる (upsert)", async () => {
    await repo.setHash(HASH_A, T0);
    expect(await repo.getHash()).toBe(HASH_A);

    await repo.setHash(HASH_B, T1);
    expect(await repo.getHash()).toBe(HASH_B);
  });

  it("単一行 singleton: setHash を複数回呼んでも app_password の行数は 1 のまま", async () => {
    await repo.setHash(HASH_A, T0);
    await repo.setHash(HASH_B, T1);

    // singleton 設計 (plan.md §「データモデル」): id = "current" の 1 行のみ.
    const rows = sqlite.prepare("SELECT id FROM app_password").all() as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("current");
  });

  it("setHash(hash, t) は updated_at を渡された値で書き込む (AC-2 基盤)", async () => {
    await repo.setHash(HASH_A, T0);

    const row = sqlite
      .prepare("SELECT password_hash, updated_at FROM app_password WHERE id = ?")
      .get("current") as { password_hash: string; updated_at: number } | undefined;

    expect(row).toBeDefined();
    expect(row?.password_hash).toBe(HASH_A);
    expect(row?.updated_at).toBe(T0);
  });

  it("setHash(hash, t) を再呼び出しすると updated_at も最新値で上書きされる", async () => {
    await repo.setHash(HASH_A, T0);
    await repo.setHash(HASH_B, T1);

    const row = sqlite
      .prepare("SELECT password_hash, updated_at FROM app_password WHERE id = ?")
      .get("current") as { password_hash: string; updated_at: number } | undefined;

    expect(row?.password_hash).toBe(HASH_B);
    expect(row?.updated_at).toBe(T1);
  });
});
