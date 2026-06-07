/**
 * Hono アプリ本体のスタブ.
 *
 * - implementer が Hono の OpenAPI 統合 + ルーティングを実装する.
 * - 結合テスト (server/__tests__/integration/*) は `createApp()` 経由でアプリを生成し,
 *   `app.request(...)` で HTTP リクエストを送る (Hono Testing Helper の作法).
 */
import { Hono } from "hono";
import type { TaskRepository } from "./data/task-repository.js";
import type { ProjectRepository } from "./data/project-repository.js";
import type { IdempotencyStore } from "./data/idempotency-store.js";
import type { Clock } from "@todica/domain/clock";

/**
 * テストおよびアプリ起動の双方で使う依存性の束.
 * implementer はこれを受け取り Hono の Variables / Context に積む.
 */
export interface AppDeps {
  taskRepository: TaskRepository;
  projectRepository: ProjectRepository;
  idempotencyStore: IdempotencyStore;
  clock: Clock;
  /** Bearer 認証に使う固定トークン. テストでは任意の値を渡す. */
  authToken: string;
}

/**
 * Hono アプリを生成する.
 * 本機能のエンドポイント: POST /api/v1/tasks / GET /api/v1/tasks /
 * PATCH /api/v1/tasks/:id / DELETE /api/v1/tasks/:id.
 *
 * スタブ: 全リクエストで 501 を返す. implementer が実装すると green 化する.
 */
export function createApp(_deps: AppDeps): Hono {
  const app = new Hono();
  app.all("*", (c) => {
    return c.json(
      { code: "NOT_IMPLEMENTED", message: "createApp is a stub for TDD red phase" },
      501,
    );
  });
  return app;
}
