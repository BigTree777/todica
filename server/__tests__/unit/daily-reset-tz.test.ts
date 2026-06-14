/**
 * 単体テスト: 日次リセット純関数の TZ 引数対応.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/reset-time-rework/spec.md §「(G-1) サーバ TZ 解釈」
 *   - docs/developer/features/reset-time-rework/plan.md §「calcTodayBoundaryAt のアルゴリズム」
 *
 * 対象モジュール: server/src/use-cases/daily-reset.ts
 *
 * 仕様の核:
 *   - calcTodayBoundaryAt は (nowIso, dayBoundaryTime, timeZone) の純関数.
 *   - timeZone は IANA TZ 名 (例: "Asia/Tokyo", "UTC") で呼び出し側が解決して渡す.
 *   - 戻り値は「サーバ TZ 上の当日 (= nowIso をサーバ TZ で見たときの YYYY-MM-DD) の HH:MM」
 *     に相当する瞬間を UTC ISO で表した文字列.
 *
 * TZ 換算の参考値 (DST 非考慮 / JST = UTC+9):
 *   - JST 当日 04:00 (2026-06-08) ↔ UTC "2026-06-07T19:00:00.000Z"
 *   - JST 04:01 (2026-06-08) ↔ UTC "2026-06-07T19:01:00.000Z"
 *   - JST 03:59 (2026-06-08) ↔ UTC "2026-06-07T18:59:00.000Z"
 *   - JST 10:00 (2026-06-08) ↔ UTC "2026-06-08T01:00:00.000Z"
 *   - JST 04:05 (2026-06-08) ↔ UTC "2026-06-07T19:05:00.000Z"
 *
 * 現状実装:
 *   現行の calcTodayBoundaryAt(nowIso, dayBoundaryTime) は引数 2 つの純関数で
 *   UTC 日付に dayBoundaryTime を素朴に連結する. 本ファイルのテストは
 *   3 引数版 (timeZone 受け取り) の挙動を期待しており, 実装が更新されるまで失敗する.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { calcTodayBoundaryAt, needsDailyReset } from "../../src/use-cases/daily-reset.js";

// ============================================================
// 型レベルの要件: timeZone 引数を受け取れること
// ============================================================
//
// 現行シグネチャ: calcTodayBoundaryAt(nowIso: string, dayBoundaryTime: string): string
// 要求シグネチャ: calcTodayBoundaryAt(nowIso: string, dayBoundaryTime: string, timeZone: string): string
//
// 3 番目の引数を渡せる純関数として再エクスポートされることが期待される.

describe("calcTodayBoundaryAt: timeZone 引数対応 (spec.md G-1 / plan.md §calcTodayBoundaryAt のアルゴリズム)", () => {
  it("シナリオ: サーバ TZ = Asia/Tokyo, dayBoundaryTime = '04:00', nowIso = JST 04:01 → 期待する境界 = JST 当日 04:00 の UTC ISO", () => {
    // spec.md §G-1 シナリオ「サーバ TZ = JST, dayBoundaryTime = '04:00', JST 04:01 にリセット判定するとリセット必要」
    // Given サーバ TZ = "Asia/Tokyo"
    // And   dayBoundaryTime = "04:00"
    // And   nowIso = "2026-06-07T19:01:00.000Z" (= JST 2026-06-08 04:01)
    // When  calcTodayBoundaryAt を呼ぶ
    // Then  "2026-06-07T19:00:00.000Z" (= JST 2026-06-08 04:00) が返る
    const nowIso = "2026-06-07T19:01:00.000Z";
    const expected = "2026-06-07T19:00:00.000Z";
    // 型エラー回避: 現行シグネチャが 2 引数のため as never でキャストして呼び出す.
    // 実装更新後 (3 引数化) は as never が無くても通る.
    const result = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "Asia/Tokyo",
    );
    expect(result).toBe(expected);
  });

  it("シナリオ: サーバ TZ = Asia/Tokyo, dayBoundaryTime = '04:00', nowIso = JST 03:59 → 同 JST 日付の境界 04:00 を UTC ISO で返す (まだ未到来)", () => {
    // spec.md §G-1 シナリオ「サーバ TZ = JST, dayBoundaryTime = '04:00', JST 03:59 にリセット判定するとリセット不要」
    // Given サーバ TZ = "Asia/Tokyo"
    // And   dayBoundaryTime = "04:00"
    // And   nowIso = "2026-06-07T18:59:00.000Z" (= JST 2026-06-08 03:59)
    // When  calcTodayBoundaryAt を呼ぶ
    // Then  「サーバ TZ 上の当日」= JST 2026-06-08 の 04:00 (= "2026-06-07T19:00:00.000Z") が返る
    // ※ JST 03:59 から見て JST 04:00 は「これから来る境界」だが,
    //   calcTodayBoundaryAt は「サーバ TZ 上の当日 YYYY-MM-DD の HH:MM」を返す純関数なので
    //   nowIso < result となる結果値を返す. needsDailyReset 側で「未到来」と判定される.
    const nowIso = "2026-06-07T18:59:00.000Z";
    const expected = "2026-06-07T19:00:00.000Z";
    const result = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "Asia/Tokyo",
    );
    expect(result).toBe(expected);
  });

  it("シナリオ: サーバ TZ = Asia/Tokyo, dayBoundaryTime = '04:00', nowIso = JST 10:00 → JST 当日 04:00 の UTC ISO を返す", () => {
    // spec.md §G-1 シナリオ「当日 04:00 以降にリセット済みなら no-op」の境界算出部.
    // Given サーバ TZ = "Asia/Tokyo"
    // And   dayBoundaryTime = "04:00"
    // And   nowIso = "2026-06-08T01:00:00.000Z" (= JST 2026-06-08 10:00)
    // Then  "2026-06-07T19:00:00.000Z" (= JST 2026-06-08 04:00) が返る
    const nowIso = "2026-06-08T01:00:00.000Z";
    const expected = "2026-06-07T19:00:00.000Z";
    const result = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "Asia/Tokyo",
    );
    expect(result).toBe(expected);
  });

  it("シナリオ: サーバ TZ = UTC, dayBoundaryTime = '04:00', nowIso = UTC 04:01 → UTC 04:00 を返す (UTC ケース)", () => {
    // spec.md §G-1 シナリオ「サーバ TZ = UTC, dayBoundaryTime = '04:00', UTC 04:01 にリセット必要」
    // Given サーバ TZ = "UTC"
    // And   dayBoundaryTime = "04:00"
    // And   nowIso = "2026-06-08T04:01:00.000Z"
    // Then  "2026-06-08T04:00:00.000Z" が返る
    // ※ UTC のときは既存 UTC 解釈と挙動が一致する.
    const nowIso = "2026-06-08T04:01:00.000Z";
    const expected = "2026-06-08T04:00:00.000Z";
    const result = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "UTC",
    );
    expect(result).toBe(expected);
  });

  it("シナリオ: サーバ TZ = Asia/Tokyo, dayBoundaryTime = '00:00', nowIso = JST 00:30 → JST 当日 00:00 の UTC ISO を返す", () => {
    // 境界値: dayBoundaryTime = "00:00" のとき "サーバ TZ 上の当日 00:00" を返す.
    // Given サーバ TZ = "Asia/Tokyo"
    // And   dayBoundaryTime = "00:00"
    // And   nowIso = "2026-06-07T15:30:00.000Z" (= JST 2026-06-08 00:30)
    // Then  "2026-06-07T15:00:00.000Z" (= JST 2026-06-08 00:00) が返る
    const nowIso = "2026-06-07T15:30:00.000Z";
    const expected = "2026-06-07T15:00:00.000Z";
    const result = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "00:00",
      "Asia/Tokyo",
    );
    expect(result).toBe(expected);
  });

  it("純関数性: 同じ引数なら process.env.TZ に依存せず常に同じ値を返す", () => {
    // spec.md §「確定事項」: calcTodayBoundaryAt は純関数で
    //   process.env / グローバル状態を内部で参照しない.
    // process.env.TZ を変えても結果は引数 timeZone で決まる.
    const nowIso = "2026-06-07T19:01:00.000Z";
    const a = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "Asia/Tokyo",
    );
    vi.stubEnv("TZ", "America/New_York");
    const b = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "Asia/Tokyo",
    );
    expect(b).toBe(a);
  });
});

// 純関数性テストの直後に env スタブを片付ける.
afterEach(() => {
  vi.unstubAllEnvs();
});

// ============================================================
// needsDailyReset との組み合わせ (G-1 の判定挙動)
// ============================================================
//
// needsDailyReset は (nowIso, lastResetExecutedAt, todayBoundaryAt) の純関数で
// シグネチャは無変更. ただし todayBoundaryAt の意味が「サーバ TZ 上の当日境界の UTC ISO」
// に変わるため, 組み合わせとして期待される挙動を確認する.

describe("needsDailyReset: TZ 解釈を反映した境界値経由でも判定が成立する (G-1)", () => {
  it("JST 04:01 + lastReset=null → リセット必要", () => {
    // Given サーバ TZ = JST, nowIso = JST 04:01
    // And   todayBoundaryAt = calcTodayBoundaryAt(nowIso, "04:00", "Asia/Tokyo") = JST 04:00 の UTC ISO
    // And   lastResetExecutedAt = null
    // Then  needsDailyReset = true
    const nowIso = "2026-06-07T19:01:00.000Z";
    const todayBoundaryAt = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "Asia/Tokyo",
    );
    expect(needsDailyReset(nowIso, null, todayBoundaryAt)).toBe(true);
  });

  it("JST 03:59 + lastReset=null → リセット不要 (境界未到来)", () => {
    // Given サーバ TZ = JST, nowIso = JST 03:59
    // And   todayBoundaryAt = calcTodayBoundaryAt(nowIso, "04:00", "Asia/Tokyo") = JST 04:00 の UTC ISO
    // And   lastResetExecutedAt = null
    // Then  nowIso ("2026-06-07T18:59:00.000Z") < todayBoundaryAt ("2026-06-07T19:00:00.000Z")
    //       なので needsDailyReset = false
    const nowIso = "2026-06-07T18:59:00.000Z";
    const todayBoundaryAt = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "Asia/Tokyo",
    );
    expect(needsDailyReset(nowIso, null, todayBoundaryAt)).toBe(false);
  });

  it("JST 10:00 + lastReset = JST 04:05 → リセット不要 (今日既に実施済み = 冪等)", () => {
    // Given サーバ TZ = JST, nowIso = JST 10:00
    // And   todayBoundaryAt = JST 04:00 の UTC ISO
    // And   lastResetExecutedAt = JST 04:05 の UTC ISO ("2026-06-07T19:05:00.000Z")
    //       → lastResetExecutedAt >= todayBoundaryAt なので needsDailyReset = false
    const nowIso = "2026-06-08T01:00:00.000Z";
    const todayBoundaryAt = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "Asia/Tokyo",
    );
    const lastResetExecutedAt = "2026-06-07T19:05:00.000Z";
    expect(needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAt)).toBe(false);
  });

  it("JST 10:00 + lastReset = 前日 JST 04:05 → リセット必要", () => {
    // Given サーバ TZ = JST, nowIso = JST 2026-06-08 10:00
    // And   todayBoundaryAt = JST 2026-06-08 04:00 の UTC ISO ("2026-06-07T19:00:00.000Z")
    // And   lastResetExecutedAt = JST 2026-06-07 04:05 の UTC ISO ("2026-06-06T19:05:00.000Z")
    //       → lastResetExecutedAt < todayBoundaryAt なので needsDailyReset = true
    const nowIso = "2026-06-08T01:00:00.000Z";
    const todayBoundaryAt = (calcTodayBoundaryAt as (n: string, d: string, tz: string) => string)(
      nowIso,
      "04:00",
      "Asia/Tokyo",
    );
    const lastResetExecutedAt = "2026-06-06T19:05:00.000Z";
    expect(needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAt)).toBe(true);
  });
});
