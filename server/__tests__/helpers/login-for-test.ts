/**
 * `loginForTest()` ヘルパ.
 *
 * docs/developer/features/app-login/plan.md D-17:
 *   integration テストの beforeEach で token を取得して各 fetch の Bearer に乗せる.
 *   47 ファイル超の修正をヘルパ 1 点突破で抑える.
 *
 * 設計:
 *   - bcrypt cost factor 4 で予めパスワードハッシュを生成 (plan D-18, 高速化のため).
 *   - createApp() に `passwordRepository` + `sessionRepository` を注入したテストアプリを作る.
 *   - そのアプリに対して `POST /api/v1/login { password }` を発行し token を取り出す.
 *
 * 使い方 (Step 8 で 47 ファイル超を一括書き換える際の典型例):
 *
 * ```ts
 * beforeEach(async () => {
 *   const built = buildAuthTestApp();
 *   app = built.app;
 *   token = await loginForTest(app, built.password);
 * });
 *
 * const headers = authHeadersForToken(token);
 * ```
 *
 * 既存 `build-test-app.ts` (`buildTestApp` / `authHeaders`) と同じ in-memory 依存を使う.
 */
import { FakeClock } from "@todica/domain/clock";
import bcrypt from "bcrypt";
import type { Hono } from "hono";
import { createApp } from "../../src/app.js";
import type { PasswordRepository } from "../../src/data/password-repository.js";
import type { SessionRepository } from "../../src/data/session-repository.js";
import {
  InMemoryCounterRepository,
  InMemoryFocusRepository,
  InMemoryIdempotencyStore,
  InMemoryProjectRepository,
  InMemoryRoutineRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "./in-memory-repositories.js";

/** plan D-18: テスト時パスワード固定. */
export const TEST_PASSWORD = "test-password";

/** plan D-18: cost factor 4 で予めハッシュ生成しキャッシュする. */
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

export const TEST_INITIAL_TIME = "2026-06-07T09:00:00.000Z";

/**
 * In-memory 実装の `SessionRepository`.
 *
 * `DrizzleSessionRepository` の本実装と振る舞いを揃える:
 *   - findValidByToken: `expires_at > now` の strict > 判定 (plan D-6).
 *   - deleteByToken: 不在 token は no-op (冪等).
 */
export class InMemorySessionRepository implements SessionRepository {
  private readonly store = new Map<
    string,
    { token: string; expiresAt: number; createdAt: number }
  >();

  async create(input: { token: string; expiresAt: number; createdAt: number }): Promise<void> {
    this.store.set(input.token, { ...input });
  }

  async findValidByToken(
    token: string,
    now: number,
  ): Promise<{ token: string; expiresAt: number; createdAt: number } | null> {
    const row = this.store.get(token);
    if (!row) return null;
    // strict > 判定 (plan D-6).
    if (row.expiresAt > now) return { ...row };
    return null;
  }

  async deleteByToken(token: string): Promise<void> {
    this.store.delete(token);
  }

  /**
   * password-change AC-6: sessions テーブルの全行を削除する.
   * パスワード変更成功時に呼び出され, 全端末を一括失効させる.
   */
  async deleteAll(): Promise<void> {
    this.store.clear();
  }

  /** テスト用: 期限切れトークンを直接 seed するためのフック (AC-4 検証で使用). */
  seed(input: { token: string; expiresAt: number; createdAt: number }): void {
    this.store.set(input.token, { ...input });
  }

  /** テスト用: 行数の確認. */
  count(): number {
    return this.store.size;
  }

  /** テスト用: 任意 token の生 row 取得. */
  get(token: string): { token: string; expiresAt: number; createdAt: number } | undefined {
    const row = this.store.get(token);
    return row ? { ...row } : undefined;
  }
}

/**
 * In-memory 実装の `PasswordRepository`.
 *
 * 用途:
 *   - password-change feature の統合テストで `createApp` に注入する.
 *   - `getHash()` / `setHash(hash, updatedAt)` の振る舞いを Drizzle 実装と揃える (upsert).
 *
 * docs/developer/features/password-change/plan.md D-7:
 *   サーバ単体テストでは `APP_PASSWORD_HASH` env を使わず, `InMemoryPasswordRepository`
 *   を直接注入する.
 */
export class InMemoryPasswordRepository implements PasswordRepository {
  private current: { hash: string; updatedAt: number } | null;

  constructor(initialHash?: string, initialUpdatedAt = 0) {
    this.current =
      initialHash !== undefined ? { hash: initialHash, updatedAt: initialUpdatedAt } : null;
  }

  async getHash(): Promise<string | null> {
    return this.current?.hash ?? null;
  }

  async setHash(hash: string, updatedAt: number): Promise<void> {
    this.current = { hash, updatedAt };
  }

  /** テスト用: 行を直接 seed するためのフック. */
  seed(hash: string, updatedAt: number): void {
    this.current = { hash, updatedAt };
  }

  /** テスト用: 現在の hash + updatedAt を覗く. */
  peek(): { hash: string; updatedAt: number } | null {
    return this.current ? { ...this.current } : null;
  }
}

export interface BuildAuthTestAppOptions {
  initialTime?: string;
  /** plan D-18: 既定は TEST_PASSWORD ("test-password"). 上書き可能. */
  password?: string;
}

export interface BuildAuthTestAppResult {
  app: Hono;
  taskRepository: InMemoryTaskRepository;
  projectRepository: InMemoryProjectRepository;
  idempotencyStore: InMemoryIdempotencyStore;
  focusRepository: InMemoryFocusRepository;
  counterRepository: InMemoryCounterRepository;
  settingsRepository: InMemorySettingsRepository;
  routineRepository: InMemoryRoutineRepository;
  sessionRepository: InMemorySessionRepository;
  passwordRepository: InMemoryPasswordRepository;
  clock: FakeClock;
  /** plan D-18: テスト固定パスワード. /login の payload に使う. */
  password: string;
}

/** テストアプリビルダー (auth 経路を含む). */
export function buildAuthTestApp(options: BuildAuthTestAppOptions = {}): BuildAuthTestAppResult {
  const password = options.password ?? TEST_PASSWORD;
  const passwordHash =
    password === TEST_PASSWORD ? TEST_PASSWORD_HASH : bcrypt.hashSync(password, 4);

  const taskRepository = new InMemoryTaskRepository();
  const projectRepository = new InMemoryProjectRepository();
  const idempotencyStore = new InMemoryIdempotencyStore();
  const focusRepository = new InMemoryFocusRepository();
  const counterRepository = new InMemoryCounterRepository();
  const settingsRepository = new InMemorySettingsRepository();
  const routineRepository = new InMemoryRoutineRepository();
  const sessionRepository = new InMemorySessionRepository();
  const clock = new FakeClock(options.initialTime ?? TEST_INITIAL_TIME);
  const nowMs = new Date(clock.now()).getTime();

  const passwordRepository = new InMemoryPasswordRepository(passwordHash, nowMs);

  const app = createApp({
    taskRepository,
    projectRepository,
    idempotencyStore,
    focusRepository,
    counterRepository,
    settingsRepository,
    routineRepository,
    sessionRepository,
    clock,
    passwordRepository,
  });

  return {
    app,
    taskRepository,
    projectRepository,
    idempotencyStore,
    focusRepository,
    counterRepository,
    settingsRepository,
    routineRepository,
    sessionRepository,
    passwordRepository,
    clock,
    password,
  };
}

/**
 * `POST /api/v1/login` を叩き Bearer 用 token を返す.
 *
 * @throws レスポンスが 200 でない場合.
 */
export async function loginForTest(app: Hono, password: string): Promise<string> {
  const res = await app.request("/api/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.status !== 200) {
    throw new Error(`loginForTest failed: status=${res.status}`);
  }
  const body = (await res.json()) as { token?: string };
  if (typeof body.token !== "string" || body.token.length === 0) {
    throw new Error("loginForTest: token missing in response");
  }
  return body.token;
}

/**
 * Bearer + Content-Type の最小ヘッダ束.
 *
 * 既存 `authHeaders()` (build-test-app.ts) の sessions 版相当.
 */
export function authHeadersForToken(
  token: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}
