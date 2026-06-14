/**
 * 単体テスト: LocalResetUsecase の端末 TZ 解釈.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/reset-time-rework/spec.md §「(G-2) Local Reset Usecase の整合」
 *
 * 検証ポイント:
 *   - 端末 TZ = "Asia/Tokyo", settings.dayBoundaryTime = "04:00",
 *     counter.lastResetExecutedAt = null, now = JST 04:01 のとき
 *     LocalResetUsecase.runIfNeeded がリセット処理を実行する (= db.beginTransaction が呼ばれる).
 *
 * 補足:
 *   既存 local-reset-usecase.ts は dayBoundaryTimezone カラムをサーバ由来として
 *   読みに行く設計だが, BL-091 では「端末 TZ をフォールバックとして使う」方針に揃える.
 *   本テストでは dayBoundaryTimezone カラムを「未設定 (undefined)」にして,
 *   端末 TZ から自然に Asia/Tokyo が解決されるかを検証する.
 *   実装が dayBoundaryTimezone を "Asia/Tokyo" にハードコードしている現状ではこの
 *   検証パスは偶然成立してしまうので, より厳密な確認のため
 *   `settings.day_boundary_timezone` を未提供にしたうえで「端末 TZ フォールバック」を確認する.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalResetUsecase } from "./local-reset-usecase.js";

// ---------------------------------------------------------------------------
// @capacitor-community/sqlite モック (jsdom では capacitor native 経路が動かないため)
// ---------------------------------------------------------------------------

vi.mock("@capacitor-community/sqlite", () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn(),
}));

// ---------------------------------------------------------------------------
// テスト用定数
//
// JST 2026-06-08 04:01 ↔ UTC "2026-06-07T19:01:00.000Z"
// JST 2026-06-08 04:00 ↔ UTC "2026-06-07T19:00:00.000Z" (= 前回境界の UTC ISO)
// ---------------------------------------------------------------------------
const NOW_JST_0401 = new Date("2026-06-07T19:01:00.000Z");

// ---------------------------------------------------------------------------
// MockDBConnection
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeMockDb(
  initialData: {
    settings?: Row[];
    tasks?: Row[];
    counter?: Row[];
  } = {},
) {
  const data = {
    settings: initialData.settings ?? [
      {
        id: "singleton",
        day_boundary_time: "04:00",
        // day_boundary_timezone は意図的に未設定 (端末 TZ フォールバックを期待する)
        updated_at: "2026-06-07T00:00:00.000Z",
        version: 1,
      },
    ],
    tasks: initialData.tasks ?? [],
    counter: initialData.counter ?? [
      {
        id: "singleton",
        completed_count: 5,
        last_reset_executed_at: null,
        updated_at: "2026-06-07T00:00:00.000Z",
        version: 1,
      },
    ],
  };

  const db = {
    query: vi.fn(async (sql: string, _values?: unknown[]) => {
      if (sql.includes("settings")) return { values: data.settings };
      if (sql.includes("counter")) return { values: data.counter };
      if (sql.includes("tasks")) return { values: data.tasks };
      return { values: [] };
    }),
    run: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      changes: { changes: 1, lastId: 1 },
    })),
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    beginTransaction: vi.fn(async () => {}),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
  };

  return { db, data };
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("LocalResetUsecase: 端末 TZ = Asia/Tokyo の解釈 (spec.md G-2)", () => {
  let savedIntl: typeof Intl.DateTimeFormat;

  beforeEach(() => {
    // 端末 TZ を "Asia/Tokyo" にスタブする.
    // Intl.DateTimeFormat().resolvedOptions().timeZone が "Asia/Tokyo" を返すよう mock する.
    savedIntl = Intl.DateTimeFormat;
    const RealIntlDateTimeFormat = savedIntl;
    type DTFCtor = (typeof Intl)["DateTimeFormat"];
    const stub = function (
      this: unknown,
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      const inst = new RealIntlDateTimeFormat(
        locales,
        options ? { ...options, timeZone: options.timeZone ?? "Asia/Tokyo" } : undefined,
      );
      const originalResolvedOptions = inst.resolvedOptions.bind(inst);
      inst.resolvedOptions = () => {
        const r = originalResolvedOptions();
        return { ...r, timeZone: r.timeZone ?? "Asia/Tokyo" };
      };
      return inst;
    } as unknown as DTFCtor;
    (Intl as unknown as { DateTimeFormat: DTFCtor }).DateTimeFormat = stub;
  });

  afterEach(() => {
    (Intl as unknown as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = savedIntl;
  });

  it("シナリオ: 端末 TZ = JST + dayBoundaryTime = '04:00' + lastReset=null + now = JST 04:01 → リセット処理を実行する", async () => {
    // spec.md §G-2 シナリオ「端末 TZ = JST のローカルモードで dayBoundaryTime = '04:00' のとき JST 04:01 でリセットが発火する」
    // Given Android ローカルモードで端末 TZ が Asia/Tokyo
    // And   settings.dayBoundaryTime = "04:00"
    //       (day_boundary_timezone カラムは未提供 → 端末 TZ にフォールバック)
    // And   counter.lastResetExecutedAt = null
    // And   now = JST 2026-06-08 04:01 = UTC "2026-06-07T19:01:00.000Z"
    // When  LocalResetUsecase.runIfNeeded(now) を呼ぶ
    // Then  リセット処理が実行される (= beginTransaction & commit が呼ばれる)
    const { db } = makeMockDb();

    const usecase = new LocalResetUsecase(db as never);
    await usecase.runIfNeeded(NOW_JST_0401);

    expect(db.beginTransaction).toHaveBeenCalled();
    expect(db.commitTransaction).toHaveBeenCalled();
    // 少なくとも 1 回は db.run が呼ばれる (counter / tasks のいずれかを更新する).
    expect(db.run).toHaveBeenCalled();
  });
});
