/**
 * 単体テスト: calcDayOfWeek のタイムゾーン解釈.
 *
 * 受け入れ基準の出典:
 *   docs/developer/features/routine-day-of-week-tz/spec.md §「受け入れ基準」
 *   （AC-1 / AC-2 / AC-3 / AC-4）
 *
 * 対象モジュール: server/src/use-cases/daily-reset.ts の calcDayOfWeek
 *
 * 期待仕様（FR-A / FR-B / NFR-A / NFR-B）:
 *   calcDayOfWeek(nowIso, timeZone = "UTC") は nowIso を timeZone 上の壁時計日付
 *   （YYYY-MM-DD）として解釈し, その日付の曜日（0=日, 1=月, ..., 6=土）を返す純関数.
 *   結果は process.env.TZ に依存しない.
 *
 * 曜日: 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { calcDayOfWeek } from "../../src/use-cases/daily-reset.js";

describe("calcDayOfWeek: timeZone 上の壁時計日付の曜日を返す (spec.md AC-1〜AC-4)", () => {
  afterEach(() => {
    // AC-4 で差し替える process.env.TZ を必ず復元し, 他テストへ副作用を残さない.
    vi.unstubAllEnvs();
  });

  it("(AC-1) UTC 日付と現地日付が一致する時刻では両 TZ で同じ曜日 5（金）を返す", () => {
    // Given nowIso = "2026-07-03T12:00:00.000Z"（UTC でも JST でも金曜 2026-07-03）
    // When  "UTC" と "Asia/Tokyo" の両方で calcDayOfWeek を呼ぶ
    // Then  いずれも 5（金）を返す
    const nowIso = "2026-07-03T12:00:00.000Z";
    expect(calcDayOfWeek(nowIso, "UTC")).toBe(5);
    expect(calcDayOfWeek(nowIso, "Asia/Tokyo")).toBe(5);
  });

  it("(AC-2) JST 早朝境界帯で UTC 日付が前日にズレる時刻: Asia/Tokyo は 5（金）, UTC は 4（木）", () => {
    // Given nowIso = "2026-07-02T19:00:00.000Z"
    //       （UTC では木曜 2026-07-02, Asia/Tokyo では金曜 2026-07-03 04:00）
    // Then  Asia/Tokyo → 5（金）, UTC → 4（木）
    const nowIso = "2026-07-02T19:00:00.000Z";
    expect(calcDayOfWeek(nowIso, "Asia/Tokyo")).toBe(5);
    expect(calcDayOfWeek(nowIso, "UTC")).toBe(4);
  });

  it("(AC-3) 西経オフセットで現地日付が UTC より前になる時刻: America/New_York は 4（木）", () => {
    // Given nowIso = "2026-07-03T02:00:00.000Z"
    //       （UTC では金曜 2026-07-03, America/New_York では木曜 2026-07-02 22:00）
    // Then  America/New_York → 4（木）
    const nowIso = "2026-07-03T02:00:00.000Z";
    expect(calcDayOfWeek(nowIso, "America/New_York")).toBe(4);
  });

  it("(AC-4) process.env.TZ='UTC' でも結果は環境非依存で 5（金）", () => {
    // Given process.env.TZ = "UTC"
    // And   nowIso = "2026-07-02T19:00:00.000Z"
    // Then  calcDayOfWeek(nowIso, "Asia/Tokyo") は常に 5（金）
    vi.stubEnv("TZ", "UTC");
    expect(calcDayOfWeek("2026-07-02T19:00:00.000Z", "Asia/Tokyo")).toBe(5);
  });

  it("(AC-4) process.env.TZ='Asia/Tokyo' でも結果は環境非依存で 5（金）", () => {
    // Given process.env.TZ = "Asia/Tokyo"
    // And   nowIso = "2026-07-02T19:00:00.000Z"
    // Then  calcDayOfWeek(nowIso, "Asia/Tokyo") は常に 5（金）
    vi.stubEnv("TZ", "Asia/Tokyo");
    expect(calcDayOfWeek("2026-07-02T19:00:00.000Z", "Asia/Tokyo")).toBe(5);
  });
});
