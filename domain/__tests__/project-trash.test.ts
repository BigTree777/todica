/**
 * ドメイン単体テスト: Project のゴミ箱化 / 復元 純関数 (BL-119 / project-soft-delete).
 *
 * 受け入れ基準の出典: docs/developer/features/project-soft-delete/spec.md AC-10.
 * 設計参照: plan.md §データモデル (trashProject / restoreProject / isTrashed).
 *
 * 注意: 本ファイルは TDD の "red" を作るためのテスト.
 *       trashProject / restoreProject / isTrashed は domain/project に未実装のため,
 *       インポート解決に失敗して全テストが red になる想定.
 *       implementer がこれら純関数を実装することで green 化する.
 *
 * isTrashed は task / project の双方で同名 export されるため, バレル (../src/index.js)
 * 経由ではなく project モジュール (../src/project/index.js) から直接 import する.
 */
import { describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock/index.js";
import {
  createProject,
  isTrashed,
  type Project,
  restoreProject,
  trashProject,
} from "../src/project/index.js";

const NOW = "2026-06-07T09:00:00.000Z";
const LATER = "2026-06-07T09:00:05.000Z";

/** 通常状態 (trashedAt=null) の Project フィクスチャ. */
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    trashedAt: null,
    ...overrides,
  };
}

// ============================================================
// AC-10: trashProject
// ============================================================

describe("trashProject (AC-10 ゴミ箱化)", () => {
  it("通常状態の Project を trash すると trashedAt=clock.now(), version+1, updatedAt 更新", () => {
    // Given 通常状態の Project P (version=1, trashedAt=null)
    // When  trashProject(P, clock) を呼ぶ
    // Then  trashedAt が clock.now() にセットされ version=2 になる
    const clock = new FakeClock(LATER);
    const before = makeProject({ version: 1 });

    const after = trashProject(before, clock);

    expect(after.trashedAt).toBe(LATER);
    expect(after.version).toBe(2);
    expect(after.updatedAt).toBe(LATER);
    // createdAt / id / name は不変.
    expect(after.id).toBe("p-1");
    expect(after.name).toBe("仕事");
    expect(after.createdAt).toBe(NOW);
  });

  it("Project は trashedReason を持たない (D-6: 削除理由は持たせない)", () => {
    // Project の戻り値に trashedReason フィールドが現れないことを確認する.
    const clock = new FakeClock(LATER);
    const after = trashProject(makeProject(), clock) as Record<string, unknown>;
    expect(after.trashedReason).toBeUndefined();
  });

  it("既にゴミ箱状態の Project に trashProject を再適用しても trashedAt と version は変化しない (冪等 no-op 等価)", () => {
    // Given 既にゴミ箱状態の Project (trashedAt != null, version=2)
    // When  trashProject を再適用する
    // Then  trashedAt と version は変化しない
    const clock = new FakeClock(LATER);
    const trashedAt = "2026-06-07T08:00:00.000Z";
    const already = makeProject({ trashedAt, version: 2, updatedAt: trashedAt });

    const after = trashProject(already, clock);

    expect(after.trashedAt).toBe(trashedAt);
    expect(after.version).toBe(2);
  });

  it("入力オブジェクトを破壊的に変更しない (新しいオブジェクトを返す)", () => {
    const clock = new FakeClock(LATER);
    const before = makeProject({ version: 1 });
    const snapshot = { ...before };

    trashProject(before, clock);

    expect(before).toEqual(snapshot);
  });
});

// ============================================================
// AC-10: restoreProject
// ============================================================

describe("restoreProject (AC-10 復元)", () => {
  it("ゴミ箱状態の Project を復元すると trashedAt=null, version+1, updatedAt 更新", () => {
    // Given ゴミ箱状態の Project (trashedAt != null, version=2)
    // When  restoreProject(P, clock) を呼ぶ
    // Then  trashedAt が null に戻り version が +1 (=3) される
    const clock = new FakeClock(LATER);
    const trashedAt = "2026-06-07T08:00:00.000Z";
    const trashed = makeProject({ trashedAt, version: 2, updatedAt: trashedAt });

    const after = restoreProject(trashed, clock);

    expect(after.trashedAt).toBeNull();
    expect(after.version).toBe(3);
    expect(after.updatedAt).toBe(LATER);
    // createdAt / id / name は不変.
    expect(after.createdAt).toBe(NOW);
    expect(after.name).toBe("仕事");
  });

  it("入力オブジェクトを破壊的に変更しない", () => {
    const clock = new FakeClock(LATER);
    const trashed = makeProject({ trashedAt: NOW, version: 2 });
    const snapshot = { ...trashed };

    restoreProject(trashed, clock);

    expect(trashed).toEqual(snapshot);
  });
});

// ============================================================
// AC-10: isTrashed
// ============================================================

describe("isTrashed (AC-10 状態判定)", () => {
  it("trashedAt が null なら false", () => {
    expect(isTrashed(makeProject({ trashedAt: null }))).toBe(false);
  });

  it("trashedAt がセットされていれば true", () => {
    expect(isTrashed(makeProject({ trashedAt: NOW }))).toBe(true);
  });
});

// ============================================================
// createProject: trashedAt 初期値
// ============================================================

describe("createProject (trashedAt 初期値)", () => {
  it("起票直後の Project は trashedAt=null を持つ", () => {
    const clock = new FakeClock(NOW);
    const created = createProject("p-1", "仕事", clock);
    expect(created.trashedAt).toBeNull();
  });
});
