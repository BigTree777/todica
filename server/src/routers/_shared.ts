import { setCurrentTask, shouldClearFocus } from "@todica/domain/focus-selection";
import type { Task } from "@todica/domain/task";
import type { Context } from "hono";
import type { AppDeps } from "../app.js";
import { sortToday } from "../today.js";

export function errorJson(c: Context, status: number, code: string, message: string) {
  return c.json({ code, message }, status as 400 | 401 | 404 | 412 | 500 | 501);
}

/**
 * focus.currentTaskId が targetId と一致する場合に選択を解除する.
 */
export async function clearFocusIfMatches(deps: AppDeps, targetId: string): Promise<void> {
  const focus = await deps.focusRepository.get();
  if (!shouldClearFocus(focus, targetId)) return;
  const updated = setCurrentTask(focus, null, deps.clock.now());
  await deps.focusRepository.update(updated);
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
 * タスクを priority, createdAt, id の順で並べる.
 */
export function sortTasks(tasks: Task[]): Task[] {
  return sortToday(tasks);
}
