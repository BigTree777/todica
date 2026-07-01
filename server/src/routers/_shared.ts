import type { Task } from "@todica/domain/task";
import type { Context } from "hono";
import type { AppDeps } from "../app.js";
import { sortToday } from "../today.js";

export function errorJson(c: Context, status: number, code: string, message: string) {
  return c.json({ code, message }, status as 400 | 401 | 404 | 412 | 500 | 501);
}

/**
 * 応答を Idempotency-Key に保存しつつ HTTP レスポンスを返す.
 */
export async function saveAndReturn(c: Context, deps: AppDeps, status: number, body: unknown) {
  const key = c.get("idempotencyKey") as string | undefined;
  if (key) {
    await deps.idempotencyStore.save(key, { status, body });
  }
  if (status === 204) {
    return c.body(null, 204);
  }
  return c.json(body, status as 200 | 201 | 400 | 401 | 404 | 412 | 500 | 501);
}

/**
 * タスクを priority (highest→normal→later), createdAt 降順, id 昇順で並べる.
 */
export function sortTasks(tasks: Task[]): Task[] {
  return sortToday(tasks);
}
