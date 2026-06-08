/**
 * 単体テスト: 日次リセット純関数 (BL-010 / FR-043 / FR-051 / NFR-020).
 *
 * 受け入れ基準の出典: docs/developer/features/daily-reset/spec.md
 * 設計の出典: docs/developer/features/daily-reset/plan.md §「境界時刻の算出（D-001）」
 *
 * テスト対象モジュール: server/src/use-cases/daily-reset.ts（未実装）
 * → import がコンパイルエラーになることで「red」を確認する。
 * → implementer が daily-reset.ts を実装することで「green」になる。
 *
 * 受け入れ基準:
 *   - spec.md §「「今日」の境界判定」の 4 シナリオ
 *   - plan.md D-001: UTC 日付 + dayBoundaryTime 文字列連結
 */
import { describe, expect, it } from "vitest";
// NOTE: このファイルは実装前のため、以下の import はコンパイルエラーになる（red）。
// implementer が server/src/use-cases/daily-reset.ts を作成することで解消される。
import {
  calcTodayBoundaryAt,
  needsDailyReset,
} from "../../src/use-cases/daily-reset.js";

// ============================================================
// calcTodayBoundaryAt
//
// spec.md §「「今日」の境界判定」/ plan.md D-001:
//   「今日の境界時刻（ISO 8601）」= clock.now() の UTC 日付 + dayBoundaryTime（HH:MM）
//
// 仕様上の確定事項（U-001）:
//   clock.now() の UTC 日付部分を取り出し、dayBoundaryTime を合成した ISO 8601 文字列を返す。
//   タイムゾーン変換は行わない（BL-020 まで据え置き）。
// ============================================================

describe("calcTodayBoundaryAt (plan.md D-001)", () => {
  it("現在時刻が境界時刻を超えている場合: 当日の境界時刻を返す", () => {
    // Given: clock.now() = "2026-06-08T10:00:00.000Z", dayBoundaryTime = "04:00"
    // When:  calcTodayBoundaryAt を呼ぶ
    // Then:  "2026-06-08T04:00:00.000Z" が返る
    const result = calcTodayBoundaryAt("2026-06-08T10:00:00.000Z", "04:00");
    expect(result).toBe("2026-06-08T04:00:00.000Z");
  });

  it("現在時刻が境界時刻より前の場合: 同日の境界時刻を返す（翌日にはならない）", () => {
    // Given: clock.now() = "2026-06-08T03:30:00.000Z", dayBoundaryTime = "04:00"
    // When:  calcTodayBoundaryAt を呼ぶ
    // Then:  "2026-06-08T04:00:00.000Z" が返る（UTC 日付ベースなので翌日にならない）
    //
    // plan.md D-001 解説:
    //   03:30 < 04:00 なので「リセット不要」と判定される（needsDailyReset で判定）が、
    //   calcTodayBoundaryAt 自体は常に「同日 UTC 日付 + dayBoundaryTime」を返す。
    const result = calcTodayBoundaryAt("2026-06-08T03:30:00.000Z", "04:00");
    expect(result).toBe("2026-06-08T04:00:00.000Z");
  });

  it("dayBoundaryTime = \"00:00\" の場合: 当日 00:00:00.000Z を返す", () => {
    // Given: clock.now() = "2026-06-08T23:59:00.000Z", dayBoundaryTime = "00:00"
    // When:  calcTodayBoundaryAt を呼ぶ
    // Then:  "2026-06-08T00:00:00.000Z" が返る
    const result = calcTodayBoundaryAt("2026-06-08T23:59:00.000Z", "00:00");
    expect(result).toBe("2026-06-08T00:00:00.000Z");
  });
});

// ============================================================
// needsDailyReset
//
// spec.md §「「今日」の境界判定」の 4 シナリオ / plan.md D-001 リセット判定式:
//   needsReset = clock.now() >= todayBoundaryAt
//             && (lastResetExecutedAt === null || lastResetExecutedAt < todayBoundaryAt)
// ============================================================

describe("needsDailyReset (spec.md §「「今日」の境界判定」)", () => {
  it("シナリオ: 現在時刻 >= 境界時刻 かつ lastResetExecutedAt = null → true（初回リセット必要）", () => {
    // spec.md:
    //   Given dayBoundaryTime = "04:00", clock.now() = 当日 04:01, lastResetExecutedAt = null
    //   Then  リセット必要と判定される
    const todayBoundaryAt = "2026-06-08T04:00:00.000Z";
    const nowIso = "2026-06-08T04:01:00.000Z";
    const lastResetExecutedAt = null;
    expect(needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAt)).toBe(true);
  });

  it("シナリオ: 現在時刻 >= 境界時刻 かつ lastResetExecutedAt < 今日の境界時刻 → true（前日リセット済み）", () => {
    // spec.md:
    //   Given dayBoundaryTime = "04:00", clock.now() = 当日 10:00, lastResetExecutedAt = 前日 10:00
    //   Then  リセット必要と判定される
    const todayBoundaryAt = "2026-06-08T04:00:00.000Z";
    const nowIso = "2026-06-08T10:00:00.000Z";
    const lastResetExecutedAt = "2026-06-07T10:00:00.000Z"; // 前日 = 境界時刻より前
    expect(needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAt)).toBe(true);
  });

  it("シナリオ: 現在時刻 >= 境界時刻 かつ lastResetExecutedAt >= 今日の境界時刻 → false（今日リセット済み = 冪等）", () => {
    // spec.md:
    //   Given dayBoundaryTime = "04:00", clock.now() = 当日 10:00, lastResetExecutedAt = 当日 04:05
    //   Then  リセット不要と判定される（冪等）
    const todayBoundaryAt = "2026-06-08T04:00:00.000Z";
    const nowIso = "2026-06-08T10:00:00.000Z";
    const lastResetExecutedAt = "2026-06-08T04:05:00.000Z"; // 境界時刻以降
    expect(needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAt)).toBe(false);
  });

  it("シナリオ: 現在時刻 < 境界時刻 → false（境界時刻を超えていない）", () => {
    // spec.md:
    //   Given dayBoundaryTime = "04:00", clock.now() = 当日 03:59, lastResetExecutedAt = null
    //   Then  リセット不要と判定される（03:59 < 04:00 = まだ「昨日」）
    const todayBoundaryAt = "2026-06-08T04:00:00.000Z";
    const nowIso = "2026-06-08T03:59:00.000Z";
    const lastResetExecutedAt = null;
    expect(needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAt)).toBe(false);
  });

  it("境界値: 現在時刻 = 境界時刻ちょうど → true（>= なので境界ちょうどはリセット必要）", () => {
    // plan.md D-001: needsReset = clock.now() >= todayBoundaryAt
    // 境界値テスト: ちょうど境界時刻の場合は true
    const todayBoundaryAt = "2026-06-08T04:00:00.000Z";
    const nowIso = "2026-06-08T04:00:00.000Z";
    const lastResetExecutedAt = null;
    expect(needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAt)).toBe(true);
  });

  it("境界値: lastResetExecutedAt = todayBoundaryAt ちょうど → false（境界時刻以降のリセット済み）", () => {
    // plan.md D-001: lastResetExecutedAt < todayBoundaryAt が false → リセット不要
    // lastResetExecutedAt が境界時刻ちょうどの場合は「境界以降にリセット済み」= 不要
    const todayBoundaryAt = "2026-06-08T04:00:00.000Z";
    const nowIso = "2026-06-08T10:00:00.000Z";
    const lastResetExecutedAt = "2026-06-08T04:00:00.000Z"; // 境界ちょうど
    expect(needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAt)).toBe(false);
  });
});
