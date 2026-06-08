/**
 * 結合テスト用の App ビルダー.
 *
 * - createApp() に in-memory 依存性を注入する.
 * - 認証トークンはテスト用の固定値 "test-token" を使う.
 * - FakeClock を初期時刻 "2026-06-07T09:00:00.000Z" で渡す.
 */
import { FakeClock } from "@todica/domain/clock";
import { createApp } from "../../src/app.js";
import {
  InMemoryCounterRepository,
  InMemoryFocusRepository,
  InMemoryIdempotencyStore,
  InMemoryProjectRepository,
  InMemoryTaskRepository,
} from "./in-memory-repositories.js";

export const TEST_AUTH_TOKEN = "test-token";
export const TEST_INITIAL_TIME = "2026-06-07T09:00:00.000Z";

export function buildTestApp(options: {
  initialTime?: string;
} = {}) {
  const taskRepository = new InMemoryTaskRepository();
  const projectRepository = new InMemoryProjectRepository();
  const idempotencyStore = new InMemoryIdempotencyStore();
  const focusRepository = new InMemoryFocusRepository();
  const counterRepository = new InMemoryCounterRepository();
  const clock = new FakeClock(options.initialTime ?? TEST_INITIAL_TIME);

  const app = createApp({
    taskRepository,
    projectRepository,
    idempotencyStore,
    focusRepository,
    counterRepository,
    clock,
    authToken: TEST_AUTH_TOKEN,
  });

  return {
    app,
    taskRepository,
    projectRepository,
    idempotencyStore,
    focusRepository,
    counterRepository,
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
