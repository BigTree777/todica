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
 *   local-reset-usecase.ts は dayBoundaryTimezone カラムをリセット判定に使わず,
 *   実行時の端末 TZ を Intl.DateTimeFormat().resolvedOptions().timeZone から解決する.
 *   本テストでは dayBoundaryTimezone カラムを「未設定 (undefined)」にしたうえで,
 *   端末 TZ から Asia/Tokyo が解決されることを検証する.
 */

import { calcPreviousBoundaryAt } from "@todica/domain/settings";
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

function makeMockDb(initialData: { settings?: Row[]; tasks?: Row[]; counter?: Row[] } = {}) {
  const data = {
    settings: initialData.settings ?? [
      {
        id: "singleton",
        day_boundary_time: "04:00",
        // day_boundary_timezone は意図的に未設定 (リセット判定には端末 TZ を使う)
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
      const inst = new RealIntlDateTimeFormat(locales, {
        ...options,
        timeZone: options?.timeZone ?? "Asia/Tokyo",
      });
      const originalResolvedOptions = inst.resolvedOptions.bind(inst);
      inst.resolvedOptions = () => {
        const r = originalResolvedOptions();
        return { ...r, timeZone: "Asia/Tokyo" };
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
    //       (day_boundary_timezone カラムは未提供。リセット判定には端末 TZ を使う)
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

  it("回帰ガード: settings.day_boundary_timezone に別 TZ が保存されていても端末 TZ (JST) で境界判定する", async () => {
    // 旧バグ: dayBoundaryTimezone カラム (Asia/Tokyo ハードコード) を優先し端末 TZ を無視していた.
    // 列に端末 TZ と異なる "America/New_York" を入れ, リセットが使う前回境界 (ゴミ箱清算 DELETE の
    // 条件値) が「端末 TZ = JST」で計算した境界に一致する (= 列を無視する) ことを検証する.
    const { db } = makeMockDb({
      settings: [
        {
          id: "singleton",
          day_boundary_time: "04:00",
          day_boundary_timezone: "America/New_York",
          updated_at: "2026-06-07T00:00:00.000Z",
          version: 1,
        },
      ],
    });

    const usecase = new LocalResetUsecase(db as never);
    await usecase.runIfNeeded(NOW_JST_0401);

    const nowIso = NOW_JST_0401.toISOString();
    const jstBoundary = calcPreviousBoundaryAt(nowIso, "04:00", "Asia/Tokyo");
    const nyBoundary = calcPreviousBoundaryAt(nowIso, "04:00", "America/New_York");
    // テストが意味を持つこと: 2 つの TZ で境界がそもそも異なる.
    expect(jstBoundary).not.toBe(nyBoundary);

    // ゴミ箱清算 DELETE (`trashed_at < ?`) の条件値が端末 TZ (JST) 境界に一致する.
    const runCalls = db.run.mock.calls as [string, unknown[]][];
    const purgeDelete = runCalls.find(
      ([sql]) => /delete from tasks/i.test(sql) && /trashed_at\s*<\s*\?/i.test(sql),
    );
    expect(purgeDelete).toBeDefined();
    const values = purgeDelete?.[1] as unknown[];
    expect(values[0]).toBe(jstBoundary);
  });
});
