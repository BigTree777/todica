/**
 * 単体テスト: DrizzleSessionRepository (better-sqlite3 + drizzle-orm).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/app-login/spec.md §「受け入れ基準」AC-2 / AC-4 / AC-5
 *   - docs/developer/features/app-login/plan.md §「データモデル」/ D-1 / D-6
 *
 * 観点:
 *   1. create({ token, expiresAt, createdAt }) で 1 行 INSERT される.
 *   2. findValidByToken(token, now) が期限内なら行を返し, 期限切れなら null を返す.
 *      - 境界 (expires_at === now) は strict `>` 判定で「期限切れ」扱い (plan D-6).
 *   3. deleteByToken(token) で行が削除され, 以降の findValidByToken は null になる.
 *
 * 現状: DrizzleSessionRepository は未実装. 本テストはインポート不能でコンパイルエラー → red.
 *       implementer が Step 1 で実装することで green 化する.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { schema } from "../../src/db/schema.js";
import { DrizzleSessionRepository } from "../../src/infra/persistence/drizzle/session-repository.js";

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);
const NOW = 1_700_000_000_000; // 任意の Unix epoch ms.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 本実装で使うことになる sessions テーブル定義の最低限を CREATE TABLE で立てる.
 * カラム名は plan.md §「データモデル」と一致させる (snake_case).
 */
const CREATE_SESSIONS_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`;

let sqlite: Database.Database;
let repo: DrizzleSessionRepository;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(CREATE_SESSIONS_SQL);
  const db = drizzle(sqlite, { schema });
  repo = new DrizzleSessionRepository({ db });
});

afterEach(() => {
  sqlite.close();
});

describe("DrizzleSessionRepository", () => {
  it("create() で 1 行 INSERT されたものを findValidByToken で取得できる (AC-2 基盤)", async () => {
    await repo.create({
      token: TOKEN_A,
      expiresAt: NOW + THIRTY_DAYS_MS,
      createdAt: NOW,
    });

    const session = await repo.findValidByToken(TOKEN_A, NOW);
    expect(session).not.toBeNull();
    expect(session?.token).toBe(TOKEN_A);
    expect(session?.expiresAt).toBe(NOW + THIRTY_DAYS_MS);
    expect(session?.createdAt).toBe(NOW);
  });

  it("findValidByToken(token, now) は now < expiresAt なら行を返す (期限内)", async () => {
    await repo.create({
      token: TOKEN_A,
      expiresAt: NOW + 1000,
      createdAt: NOW,
    });

    // 期限内: now < expiresAt
    const session = await repo.findValidByToken(TOKEN_A, NOW);
    expect(session).not.toBeNull();
    expect(session?.token).toBe(TOKEN_A);
  });

  it("findValidByToken(token, now) は now > expiresAt なら null を返す (期限切れ / AC-4 基盤)", async () => {
    await repo.create({
      token: TOKEN_A,
      expiresAt: NOW,
      createdAt: NOW - 1000,
    });

    // 期限切れ: now > expiresAt
    const session = await repo.findValidByToken(TOKEN_A, NOW + 1);
    expect(session).toBeNull();
  });

  it("findValidByToken(token, now) は now === expiresAt の境界では null を返す (strict > 判定 / D-6)", async () => {
    // plan D-6: 期限境界は `expires_at > clock.now()` の strict > で判定し,
    // 同一 ms ぴったりの境界は「期限切れ」として扱う.
    await repo.create({
      token: TOKEN_A,
      expiresAt: NOW,
      createdAt: NOW - 1000,
    });

    const session = await repo.findValidByToken(TOKEN_A, NOW);
    expect(session).toBeNull();
  });

  it("findValidByToken は存在しない token に対して null を返す", async () => {
    const session = await repo.findValidByToken("nonexistent-token", NOW);
    expect(session).toBeNull();
  });

  it("deleteByToken(token) で対象行が削除され, findValidByToken が null を返す (AC-5 基盤)", async () => {
    await repo.create({
      token: TOKEN_A,
      expiresAt: NOW + THIRTY_DAYS_MS,
      createdAt: NOW,
    });

    // 削除前は取得できる
    expect(await repo.findValidByToken(TOKEN_A, NOW)).not.toBeNull();

    await repo.deleteByToken(TOKEN_A);

    // 削除後は null
    expect(await repo.findValidByToken(TOKEN_A, NOW)).toBeNull();
  });

  it("deleteByToken は他の token の行に影響しない", async () => {
    await repo.create({
      token: TOKEN_A,
      expiresAt: NOW + THIRTY_DAYS_MS,
      createdAt: NOW,
    });
    await repo.create({
      token: TOKEN_B,
      expiresAt: NOW + THIRTY_DAYS_MS,
      createdAt: NOW,
    });

    await repo.deleteByToken(TOKEN_A);

    expect(await repo.findValidByToken(TOKEN_A, NOW)).toBeNull();
    expect(await repo.findValidByToken(TOKEN_B, NOW)).not.toBeNull();
  });

  it("deleteByToken は存在しない token を削除しようとしても throw しない (冪等 no-op)", async () => {
    // /logout の二重実行 / 既に削除済みの token に対する冪等性を担保する.
    await expect(repo.deleteByToken("nonexistent-token")).resolves.toBeUndefined();
  });

  it("deleteAll() で sessions テーブルの全行が削除される (password-change AC-6 基盤)", async () => {
    // docs/developer/features/password-change/spec.md AC-6:
    //   パスワード変更成功時に sessions テーブルの全行を削除して全端末を失効させる.
    await repo.create({
      token: TOKEN_A,
      expiresAt: NOW + THIRTY_DAYS_MS,
      createdAt: NOW,
    });
    await repo.create({
      token: TOKEN_B,
      expiresAt: NOW + THIRTY_DAYS_MS,
      createdAt: NOW,
    });

    // 削除前: 両方とも有効.
    expect(await repo.findValidByToken(TOKEN_A, NOW)).not.toBeNull();
    expect(await repo.findValidByToken(TOKEN_B, NOW)).not.toBeNull();

    await repo.deleteAll();

    // 削除後: いずれも null.
    expect(await repo.findValidByToken(TOKEN_A, NOW)).toBeNull();
    expect(await repo.findValidByToken(TOKEN_B, NOW)).toBeNull();
  });

  it("deleteAll() は空テーブルに対しても throw しない (冪等 no-op)", async () => {
    await expect(repo.deleteAll()).resolves.toBeUndefined();
  });
});
