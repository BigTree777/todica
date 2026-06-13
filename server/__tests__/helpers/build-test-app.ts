/**
 * 結合テスト用の App ビルダー.
 *
 * - createApp() に in-memory 依存性を注入する.
 * - BL-074: 旧 `authToken` 引数は廃止. 代わりに `passwordHash` + `sessionRepository` を渡す.
 *   既存 47 ファイル超の integration テストとの互換のため, ビルド時に
 *   sessionRepository に "test-token" を有効 session として seed しておく.
 *   既存テストの `authHeaders()` ( `Authorization: Bearer test-token` ) はそのまま動く.
 * - FakeClock を初期時刻 "2026-06-07T09:00:00.000Z" で渡す.
 */
import { FakeClock } from "@todica/domain/clock";
import bcrypt from "bcrypt";
import { createApp } from "../../src/app.js";
import {
  InMemoryCounterRepository,
  InMemoryFocusRepository,
  InMemoryIdempotencyStore,
  InMemoryProjectRepository,
  InMemoryRoutineRepository,
  InMemorySettingsRepository,
  InMemoryTaskRepository,
} from "./in-memory-repositories.js";
import { InMemorySessionRepository } from "./login-for-test.js";

export const TEST_AUTH_TOKEN = "test-token";
export const TEST_INITIAL_TIME = "2026-06-07T09:00:00.000Z";
const TEST_PASSWORD = "test-password";
// bcrypt cost factor 4 でテスト時間を最小化 (plan D-18).
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

export function buildTestApp(
  options: {
    initialTime?: string;
  } = {},
) {
  const taskRepository = new InMemoryTaskRepository();
  const projectRepository = new InMemoryProjectRepository();
  const idempotencyStore = new InMemoryIdempotencyStore();
  const focusRepository = new InMemoryFocusRepository();
  const counterRepository = new InMemoryCounterRepository();
  const settingsRepository = new InMemorySettingsRepository();
  // BL-017: RoutineRepository を追加
  const routineRepository = new InMemoryRoutineRepository();
  // BL-074: SessionRepository を追加.
  const sessionRepository = new InMemorySessionRepository();
  const clock = new FakeClock(options.initialTime ?? TEST_INITIAL_TIME);

  // 既存 47 ファイル超の integration テストが `TEST_AUTH_TOKEN` を Bearer に乗せて API を叩く
  // 形を維持するため, ここで sessions に有効 session を seed する.
  // expires_at = 100 年後 (テスト中に期限切れを起こさないため).
  const nowMs = new Date(clock.now()).getTime();
  sessionRepository.seed({
    token: TEST_AUTH_TOKEN,
    expiresAt: nowMs + 100 * 365 * 24 * 60 * 60 * 1000,
    createdAt: nowMs,
  });

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
    passwordHash: TEST_PASSWORD_HASH,
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
    clock,
  };
}

/** 認証ヘッダを生成するヘルパ. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${TEST_AUTH_TOKEN}`,
    "Content-Type": "application/json",
    ...extra,
  };
}
