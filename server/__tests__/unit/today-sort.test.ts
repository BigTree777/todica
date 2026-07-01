/**
 * 単体テスト: サーバ今日ビューの並び順 (BL-141).
 *
 * 受け入れ基準の出典:
 *   docs/developer/features/task-sort-newest-first/spec.md
 *   docs/developer/features/task-sort-newest-first/plan.md (D-001)
 *
 * server/src/today.ts の sortToday は domain 共有ソート (sortTasksForView) に委譲する予定.
 * ここでは委譲先の並び順が新仕様
 *   priority (highest→normal→later) → createdAt 降順(新しい順) → id 昇順
 * になっていること, および pickNextTaskId が先頭 id / 空配列で null を返すことを検証する.
 *
 * NOTE: 委譲先の共有部品が未実装のため, sortToday の並び順が旧仕様(古い順)のままで red になる.
 */

import type { DueDate, Priority, Task, TrashedReason } from "@todica/domain/task";
import { describe, expect, it } from "vitest";
import { pickNextTaskId, sortToday } from "../../src/today.js";

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  const base: Task = {
    id: overrides.id,
    name: "x",
    projectId: null,
    dueDate: "today" as DueDate,
    priority: "normal" as Priority,
    origin: "manual",
    routineId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    trashedAt: null,
    trashedReason: null as TrashedReason | null,
    version: 1,
  };
  return { ...base, ...overrides };
}

describe("sortToday (BL-141 新仕様への委譲)", () => {
  it("シナリオ: 同一優先度では作成日時が新しいタスクが先頭に並ぶ", () => {
    const a = makeTask({ id: "a", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" });
    const b = makeTask({ id: "b", priority: "normal", createdAt: "2026-01-01T11:00:00.000Z" });

    expect(sortToday([a, b]).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("シナリオ: priority が第 1 キー, createdAt 同値では id 昇順", () => {
    const later = makeTask({ id: "z", priority: "later", createdAt: "2026-01-01T13:00:00.000Z" });
    const n1 = makeTask({ id: "n1", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" });
    const n2 = makeTask({ id: "n2", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" });
    const high = makeTask({ id: "h", priority: "highest", createdAt: "2026-01-01T09:00:00.000Z" });

    // highest → normal(createdAt 同値 → id 昇順) → later.
    expect(sortToday([later, n2, n1, high]).map((t) => t.id)).toEqual(["h", "n1", "n2", "z"]);
  });

  it("非破壊: 入力配列を変更しない", () => {
    const a = makeTask({ id: "a", createdAt: "2026-01-01T10:00:00.000Z" });
    const b = makeTask({ id: "b", createdAt: "2026-01-01T11:00:00.000Z" });
    const input = [a, b];
    sortToday(input);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("pickNextTaskId (BL-141 次の 1 つ)", () => {
  it("シナリオ: 今日ビューの「次の 1 つ」は同一優先度では最新タスクになる", () => {
    // spec.md シナリオ「今日ビューの「次の 1 つ」は同一優先度では最新タスクになる」.
    const p = makeTask({ id: "p", priority: "normal", createdAt: "2026-01-01T08:00:00.000Z" });
    const q = makeTask({ id: "q", priority: "normal", createdAt: "2026-01-01T09:00:00.000Z" });

    const sorted = sortToday([p, q]);
    expect(sorted.map((t) => t.id)).toEqual(["q", "p"]);
    expect(pickNextTaskId(sorted)).toBe("q");
  });

  it("シナリオ: 今日ビューが空のとき「次の 1 つ」は null", () => {
    // spec.md シナリオ「今日ビューが空のとき「次の 1 つ」は null」.
    expect(pickNextTaskId(sortToday([]))).toBeNull();
  });
});
