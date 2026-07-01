/**
 * 今日ビュー (BL-005 / FR-010 / FR-011 / NFR-013) の純関数群.
 *
 * spec.md / plan.md §処理フロー:
 *   1. filterToday: dueDate === "today" かつ trashedAt === null のみ通す.
 *   2. sortToday:   priority (highest→normal→later) → createdAt 降順 → id 昇順 で安定ソート.
 *   3. pickNextTaskId: 並びの先頭タスクの id. 空配列なら null.
 *
 * いずれも入力配列を破壊しない (sortToday は spread でコピーしてからソート).
 * 「今日」の意味論はここに閉じ込め, サーバ API ハンドラ層から呼び出す.
 */
import { sortTasksForView, type Task } from "@todica/domain/task";

/** 今日ビューの絞り込み: dueDate === "today" かつ trashedAt === null. */
export function filterToday(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.dueDate === "today" && t.trashedAt === null);
}

/**
 * 今日ビューの並び順 (plan.md D-002):
 *   priority (highest→normal→later) → createdAt 降順 → id 昇順.
 *
 * 入力配列は破壊せず, 新しい配列を返す.
 */
export function sortToday(tasks: Task[]): Task[] {
  return sortTasksForView(tasks);
}

/**
 * 「次の 1 つ」を一意に決める (plan.md D-005):
 * 並びの先頭タスクの id. 空配列なら null.
 */
export function pickNextTaskId(tasks: Task[]): string | null {
  return tasks[0]?.id ?? null;
}
