/**
 * ドメイン単体テスト: Routine のゴミ箱化 / 復元 純関数 (BL-120 / routine-soft-delete).
 *
 * 受け入れ基準の出典: docs/developer/features/routine-soft-delete/spec.md AC-11.
 * 設計参照: plan.md §データモデル (trashRoutine / restoreRoutine / isTrashed).
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       trashRoutine / restoreRoutine / isTrashed は domain/routine に未実装のため,
 *       インポート解決に失敗して全テストが red になる想定.
 *       implementer がこれら純関数を実装することで green 化する.
 *
 * isTrashed は task / project / routine の複数で同名 export されるため, バレル
 * (../src/index.js) 経由ではなく routine モジュール (../src/routine/index.js) から
 * 直接 import する (project-trash.test.ts と同型).
 */
import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/index.js";
import {
  createRoutine,
  isTrashed,
  type Routine,
  restoreRoutine,
  trashRoutine,
} from "../src/routine/index.js";

const NOW = "2026-06-07T09:00:00.000Z";
const LATER = "2026-06-07T09:00:05.000Z";

/** 通常状態 (trashedAt=null) の Routine フィクスチャ. */
function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r-1",
    name: "朝の運動",
    daysOfWeek: [1, 2, 3, 4, 5],
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    trashedAt: null,
    ...overrides,
  };
}

// ============================================================
// AC-11: trashRoutine
// ============================================================

describe("trashRoutine (AC-11 ゴミ箱化)", () => {
  it("通常状態の Routine を trash すると trashedAt=clock.now(), version+1, updatedAt 更新", () => {
    // Given 通常状態の Routine R (version=1, trashedAt=null)
    // When  trashRoutine(R, clock) を呼ぶ
    // Then  trashedAt が clock.now() にセットされ version=2 になる
    const clock = new FakeClock(LATER);
    const before = makeRoutine({ version: 1 });

    const after = trashRoutine(before, clock);

    expect(after.trashedAt).toBe(LATER);
    expect(after.version).toBe(2);
    expect(after.updatedAt).toBe(LATER);
    // createdAt / id / name / daysOfWeek / defaultPriority は不変.
    expect(after.id).toBe("r-1");
    expect(after.name).toBe("朝の運動");
    expect(after.createdAt).toBe(NOW);
    expect(after.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(after.defaultPriority).toBe("normal");
  });

  it("Routine は trashedReason を持たない (D-6: 削除理由は持たせない)", () => {
    // Routine の戻り値に trashedReason フィールドが現れないことを確認する.
    const clock = new FakeClock(LATER);
    const after = trashRoutine(makeRoutine(), clock) as Record<string, unknown>;
    expect(after.trashedReason).toBeUndefined();
  });

  it("既にゴミ箱状態の Routine に trashRoutine を再適用しても trashedAt と version は変化しない (冪等 no-op 等価)", () => {
    // Given 既にゴミ箱状態の Routine (trashedAt != null, version=2)
    // When  trashRoutine を再適用する
    // Then  trashedAt と version は変化しない
    const clock = new FakeClock(LATER);
    const trashedAt = "2026-06-07T08:00:00.000Z";
    const already = makeRoutine({ trashedAt, version: 2, updatedAt: trashedAt });

    const after = trashRoutine(already, clock);

    expect(after.trashedAt).toBe(trashedAt);
    expect(after.version).toBe(2);
  });

  it("入力オブジェクトを破壊的に変更しない (新しいオブジェクトを返す)", () => {
    const clock = new FakeClock(LATER);
    const before = makeRoutine({ version: 1 });
    const snapshot = { ...before };

    trashRoutine(before, clock);

    expect(before).toEqual(snapshot);
  });
});

// ============================================================
// AC-11: restoreRoutine
// ============================================================

describe("restoreRoutine (AC-11 復元)", () => {
  it("ゴミ箱状態の Routine を復元すると trashedAt=null, version+1, updatedAt 更新", () => {
    // Given ゴミ箱状態の Routine (trashedAt != null, version=2)
    // When  restoreRoutine(R, clock) を呼ぶ
    // Then  trashedAt が null に戻り version が +1 (=3) される
    const clock = new FakeClock(LATER);
    const trashedAt = "2026-06-07T08:00:00.000Z";
    const trashed = makeRoutine({ trashedAt, version: 2, updatedAt: trashedAt });

    const after = restoreRoutine(trashed, clock);

    expect(after.trashedAt).toBeNull();
    expect(after.version).toBe(3);
    expect(after.updatedAt).toBe(LATER);
    // createdAt / id / name は不変.
    expect(after.createdAt).toBe(NOW);
    expect(after.name).toBe("朝の運動");
  });

  it("入力オブジェクトを破壊的に変更しない", () => {
    const clock = new FakeClock(LATER);
    const trashed = makeRoutine({ trashedAt: NOW, version: 2 });
    const snapshot = { ...trashed };

    restoreRoutine(trashed, clock);

    expect(trashed).toEqual(snapshot);
  });
});

// ============================================================
// AC-11: isTrashed
// ============================================================

describe("isTrashed (AC-11 状態判定)", () => {
  it("trashedAt が null なら false", () => {
    expect(isTrashed(makeRoutine({ trashedAt: null }))).toBe(false);
  });

  it("trashedAt がセットされていれば true", () => {
    expect(isTrashed(makeRoutine({ trashedAt: NOW }))).toBe(true);
  });
});

// ============================================================
// createRoutine: trashedAt 初期値
// ============================================================

describe("createRoutine (trashedAt 初期値)", () => {
  it("起票直後の Routine は trashedAt=null を持つ", () => {
    const clock = new FakeClock(NOW);
    const result = createRoutine(
      { id: "r-1", name: "朝の運動", daysOfWeek: [1], defaultPriority: "normal" },
      clock,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.routine.trashedAt).toBeNull();
    }
  });
});
