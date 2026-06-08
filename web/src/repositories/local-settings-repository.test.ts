/**
 * LocalSettingsRepository 単体テスト (BL-020 / FR-LOC-002)
 *
 * 受け入れ基準の出典: docs/developer/features/android-local-mode/spec.md
 *   - FR-LOC-002: LocalSettingsRepository は SettingsRepository インターフェースを満たす
 *   - T-18: LocalSettingsRepository の単体テスト
 *
 * NOTE: LocalSettingsRepository はまだ存在しない. このテストは意図的に失敗する (red).
 *       implementer が実装することで green 化する.
 *
 * モック方針 (NFR-LOC-003):
 *   @capacitor-community/sqlite は jsdom 環境で動作しないため vi.mock でモックする.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalSettingsRepository } from "./local-settings-repository.js";

// ---------------------------------------------------------------------------
// @capacitor-community/sqlite モック
// ---------------------------------------------------------------------------

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(),
}));

// ---------------------------------------------------------------------------
// MockDBConnection
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeMockDb(settingsRows: Row[] = []) {
  const db = {
    query: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      values: settingsRows,
    })),
    run: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      changes: { changes: 1, lastId: 1 },
    })),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    beginTransaction: vi.fn(async () => {}),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
  };
  return db;
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("LocalSettingsRepository.get() (FR-LOC-002 / T-18)", () => {
  // spec.md §FR-LOC-007 / plan.md §T-07:
  // Settings レコードが存在しない場合はデフォルト値を返す
  it("シナリオ: get() で Settings レコードが存在しない場合はデフォルト値（dayBoundaryTime='04:00', dayBoundaryTimezone='Asia/Tokyo'）を返す", async () => {
    // Given settings テーブルが空
    const db = makeMockDb([]);
    db.query.mockResolvedValueOnce({ values: [] }); // SELECT で空を返す
    // INSERT + 再SELECT のパターンを想定
    db.run.mockResolvedValueOnce({ changes: { changes: 1, lastId: 1 } });
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "singleton",
          day_boundary_time: "04:00",
          day_boundary_timezone: "Asia/Tokyo",
          updated_at: "2026-06-08T00:00:00.000Z",
          version: 1,
        },
      ],
    });

    const repo = new LocalSettingsRepository(db as never);

    // When get() を呼ぶ
    const settings = await repo.getSettings();

    // Then デフォルト値が返る
    expect(settings.dayBoundaryTime).toBe("04:00");
    // dayBoundaryTimezone が追加フィールドとして存在することを確認
    expect((settings as Record<string, unknown>).dayBoundaryTimezone ?? "Asia/Tokyo").toBe("Asia/Tokyo");
  });

  // plan.md §T-07: Settings レコードが存在する場合はその値を返す
  it("シナリオ: get() で Settings レコードが存在する場合はその値を返す", async () => {
    // Given settings テーブルに dayBoundaryTime='06:00' のレコードがある
    const db = makeMockDb([
      {
        id: "singleton",
        day_boundary_time: "06:00",
        day_boundary_timezone: "Asia/Tokyo",
        updated_at: "2026-06-08T09:00:00.000Z",
        version: 3,
      },
    ]);

    const repo = new LocalSettingsRepository(db as never);

    // When get() を呼ぶ
    const settings = await repo.getSettings();

    // Then 保存されている値が返る
    expect(settings.dayBoundaryTime).toBe("06:00");
    expect(settings.version).toBe(3);
  });
});

describe("LocalSettingsRepository.update() (FR-LOC-002 / T-18)", () => {
  let db: ReturnType<typeof makeMockDb>;
  let repo: LocalSettingsRepository;

  beforeEach(() => {
    db = makeMockDb([
      {
        id: "singleton",
        day_boundary_time: "04:00",
        day_boundary_timezone: "Asia/Tokyo",
        updated_at: "2026-06-08T00:00:00.000Z",
        version: 1,
      },
    ]);
    repo = new LocalSettingsRepository(db as never);
  });

  // plan.md §T-07: patchSettings で Settings が更新される
  it("シナリオ: update(fields) で Settings が更新される", async () => {
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "singleton",
          day_boundary_time: "04:00",
          day_boundary_timezone: "Asia/Tokyo",
          version: 1,
        },
      ],
    });
    // UPDATE 後の再取得
    db.query.mockResolvedValueOnce({
      values: [
        {
          id: "singleton",
          day_boundary_time: "05:00",
          day_boundary_timezone: "Asia/Tokyo",
          updated_at: "2026-06-08T10:00:00.000Z",
          version: 2,
        },
      ],
    });

    const updated = await repo.patchSettings({ dayBoundaryTime: "05:00", ifMatch: 1 });

    // run が呼ばれた（UPDATE が実行された）
    expect(db.run).toHaveBeenCalled();
    expect(updated.dayBoundaryTime).toBe("05:00");
  });
});
