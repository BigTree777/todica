/**
 * ドメイン共有比較器 / ソート関数の単体テスト (BL-141).
 *
 * 受け入れ基準の出典:
 *   docs/developer/features/task-sort-newest-first/spec.md
 *   docs/developer/features/task-sort-newest-first/plan.md (D-001〜D-003)
 *
 * 検証対象 (plan.md D-002 で domain/src/task/index.ts に新設予定):
 *   - compareTasksForView(a, b): 3 段比較器
 *       priority (highest→normal→later) → createdAt 降順(新しい順) → id 昇順
 *   - sortTasksForView(tasks): 上記比較器による非破壊ソート
 *
 * NOTE: これらの共有部品はまだ存在しない. 本テストは意図的に失敗する (red).
 *       implementer が domain に実装することで green 化する.
 */

import type { DueDate, Priority, Task, TrashedReason } from "@todica/domain/task";
import { compareTasksForView, sortTasksForView } from "@todica/domain/task";
import { describe, expect, it } from "vitest";

/** Task のテストフィクスチャ. デフォルトは today / normal / active. */
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

describe("sortTasksForView (BL-141 並び順の正本)", () => {
  it("シナリオ: 同一優先度では作成日時が新しいタスクが先頭に並ぶ", () => {
    // spec.md シナリオ「同一優先度では作成日時が新しいタスクが先頭に並ぶ」.
    const a = makeTask({ id: "a", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" });
    const b = makeTask({ id: "b", priority: "normal", createdAt: "2026-01-01T11:00:00.000Z" });

    // 入力順 (A, B) に依らず, 新しい B が先頭.
    expect(sortTasksForView([a, b]).map((t) => t.id)).toEqual(["b", "a"]);
    expect(sortTasksForView([b, a]).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("シナリオ: priority が第 1 キーであり createdAt より優先される", () => {
    // spec.md シナリオ「priority が第 1 キーであり createdAt より優先される」.
    // createdAt は highest が最も古いが, priority が優先されるため highest が先頭.
    const a = makeTask({ id: "a", priority: "highest", createdAt: "2026-01-01T09:00:00.000Z" });
    const b = makeTask({ id: "b", priority: "normal", createdAt: "2026-01-01T12:00:00.000Z" });
    const c = makeTask({ id: "c", priority: "later", createdAt: "2026-01-01T13:00:00.000Z" });

    expect(sortTasksForView([c, b, a]).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("シナリオ: 同一優先度・同一作成日時は id 昇順で決定論的に並ぶ", () => {
    // spec.md シナリオ「同一優先度・同一作成日時は id 昇順で決定論的に並ぶ」.
    // 第 3 キー id は昇順のまま (plan.md D-003).
    const a = makeTask({ id: "a1", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" });
    const b = makeTask({ id: "b2", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" });

    expect(sortTasksForView([b, a]).map((t) => t.id)).toEqual(["a1", "b2"]);
    expect(sortTasksForView([a, b]).map((t) => t.id)).toEqual(["a1", "b2"]);
  });

  it("シナリオ: priority → createdAt降順 → id昇順 の 3 段が複合しても決定論的に確定する", () => {
    // spec.md FR-1 / NFR-1: 3 段規則の複合.
    const tasks = [
      makeTask({ id: "later-old", priority: "later", createdAt: "2026-01-01T08:00:00.000Z" }),
      makeTask({ id: "normal-old", priority: "normal", createdAt: "2026-01-01T08:00:01.000Z" }),
      makeTask({ id: "normal-new", priority: "normal", createdAt: "2026-01-01T08:00:02.000Z" }),
      makeTask({ id: "highest-b", priority: "highest", createdAt: "2026-01-01T08:00:00.000Z" }),
      makeTask({ id: "highest-a", priority: "highest", createdAt: "2026-01-01T08:00:00.000Z" }),
    ];

    // 期待: highest (createdAt 同値 → id 昇順) → normal (新しい順) → later.
    expect(sortTasksForView(tasks).map((t) => t.id)).toEqual([
      "highest-a",
      "highest-b",
      "normal-new",
      "normal-old",
      "later-old",
    ]);
  });

  it("非破壊: 入力配列を変更せず, 新しい配列を返す", () => {
    // plan.md D-002: sortTasksForView は spread でコピーしてから並べる.
    const a = makeTask({ id: "a", createdAt: "2026-01-01T10:00:00.000Z" });
    const b = makeTask({ id: "b", createdAt: "2026-01-01T11:00:00.000Z" });
    const input = [a, b];
    const before = input.map((t) => t.id);

    const result = sortTasksForView(input);

    // 入力配列の順序は保たれる (破壊されない).
    expect(input.map((t) => t.id)).toEqual(before);
    // 新しい配列インスタンスが返る.
    expect(result).not.toBe(input);
  });

  it("空配列を渡すと空配列を返す", () => {
    // spec.md FR-4 / plan.md §例外処理.
    expect(sortTasksForView([])).toEqual([]);
  });
});

describe("compareTasksForView (BL-141 比較器の符号)", () => {
  it("同一優先度では新しい方が前 (負の符号) になる", () => {
    // createdAt 降順: 新しい b は古い a より前 → compare(b, a) < 0.
    const a = makeTask({ id: "a", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" });
    const b = makeTask({ id: "b", priority: "normal", createdAt: "2026-01-01T11:00:00.000Z" });

    expect(compareTasksForView(b, a)).toBeLessThan(0);
    expect(compareTasksForView(a, b)).toBeGreaterThan(0);
  });

  it("priority が異なる場合は createdAt より priority が支配する", () => {
    // highest は createdAt が古くても normal より前 → compare(highest, normal) < 0.
    const highest = makeTask({
      id: "h",
      priority: "highest",
      createdAt: "2026-01-01T09:00:00.000Z",
    });
    const normal = makeTask({ id: "n", priority: "normal", createdAt: "2026-01-01T12:00:00.000Z" });

    expect(compareTasksForView(highest, normal)).toBeLessThan(0);
    expect(compareTasksForView(normal, highest)).toBeGreaterThan(0);
  });

  it("priority も createdAt も同値なら id 昇順 (小さい id が前) になる", () => {
    const a = makeTask({ id: "a1", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" });
    const b = makeTask({ id: "b2", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" });

    expect(compareTasksForView(a, b)).toBeLessThan(0);
    expect(compareTasksForView(b, a)).toBeGreaterThan(0);
  });
});

describe("モード間整合の基準 (BL-141 NFR-1 / NFR-2)", () => {
  it("シナリオ: 同一入力なら常に同一の並びを返す (決定論性・単一の正本)", () => {
    // spec.md シナリオ「同一入力ならサーバとローカルで並びが一致する」の土台.
    // サーバ / ローカルの両方がこの共有部品を参照するため, 同一入力 → 同一出力が保証される.
    const tasks = [
      makeTask({ id: "b", priority: "normal", createdAt: "2026-01-01T10:00:00.000Z" }),
      makeTask({ id: "a", priority: "highest", createdAt: "2026-01-01T10:00:00.000Z" }),
      makeTask({ id: "c", priority: "normal", createdAt: "2026-01-01T12:00:00.000Z" }),
    ];

    const first = sortTasksForView(tasks).map((t) => t.id);
    const second = sortTasksForView([...tasks].reverse()).map((t) => t.id);

    // 入力の到着順に依らず同一の並び (a: highest, c: 新しい normal, b: 古い normal).
    expect(first).toEqual(["a", "c", "b"]);
    expect(second).toEqual(first);
  });
});
