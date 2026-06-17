import { describe, expect, it } from "vitest";
import {
  calcPreviousBoundaryAt,
  calcTodayBoundaryAt,
  needsDailyReset,
  validateDayBoundaryTime,
} from "../src/settings/index.js";

describe("validateDayBoundaryTime", () => {
  it("正常な HH:MM 形式は true", () => {
    expect(validateDayBoundaryTime("04:00")).toBe(true);
    expect(validateDayBoundaryTime("00:00")).toBe(true);
    expect(validateDayBoundaryTime("23:59")).toBe(true);
    expect(validateDayBoundaryTime("12:30")).toBe(true);
  });

  it("時 24 以上は false", () => {
    expect(validateDayBoundaryTime("24:00")).toBe(false);
    expect(validateDayBoundaryTime("99:00")).toBe(false);
  });

  it("分 60 以上は false", () => {
    expect(validateDayBoundaryTime("12:60")).toBe(false);
    expect(validateDayBoundaryTime("12:99")).toBe(false);
  });

  it("形式が違うと false", () => {
    expect(validateDayBoundaryTime("4:00")).toBe(false); // 1 桁時
    expect(validateDayBoundaryTime("04:0")).toBe(false); // 1 桁分
    expect(validateDayBoundaryTime("abc")).toBe(false);
    expect(validateDayBoundaryTime("")).toBe(false);
    expect(validateDayBoundaryTime("04-00")).toBe(false);
  });
});

describe("calcTodayBoundaryAt (UTC デフォルト)", () => {
  it("nowIso が境界時刻を超えている → 当日境界を返す", () => {
    const result = calcTodayBoundaryAt("2026-06-08T10:00:00.000Z", "04:00");
    expect(result).toBe("2026-06-08T04:00:00.000Z");
  });

  it("nowIso が境界時刻より前 → 当日境界を返す (前日に戻らない)", () => {
    const result = calcTodayBoundaryAt("2026-06-08T03:30:00.000Z", "04:00");
    expect(result).toBe("2026-06-08T04:00:00.000Z");
  });

  it("dayBoundaryTime = 00:00 → 当日 00:00 UTC", () => {
    const result = calcTodayBoundaryAt("2026-06-08T12:00:00.000Z", "00:00");
    expect(result).toBe("2026-06-08T00:00:00.000Z");
  });
});

describe("calcTodayBoundaryAt (timeZone = Asia/Tokyo)", () => {
  it("JST 04:01 → JST 当日 04:00 の UTC ISO", () => {
    // JST 04:01 = 前日 19:01 UTC. JST 当日 = 前日 04:00 を JST で見た日付の今日.
    // つまり nowIso = "2026-06-16T19:01:00.000Z" → JST 当日 = 2026-06-17.
    // 境界 = 2026-06-17 04:00 JST = 2026-06-16T19:00:00.000Z
    const result = calcTodayBoundaryAt("2026-06-16T19:01:00.000Z", "04:00", "Asia/Tokyo");
    expect(result).toBe("2026-06-16T19:00:00.000Z");
  });

  it("UTC の同時刻でも timeZone = UTC なら別結果", () => {
    const utc = calcTodayBoundaryAt("2026-06-16T19:01:00.000Z", "04:00", "UTC");
    expect(utc).toBe("2026-06-16T04:00:00.000Z");
  });
});

describe("calcPreviousBoundaryAt", () => {
  it("nowIso が今日の境界を超えている → 今日の境界を返す", () => {
    // UTC 2026-06-08 10:00, 境界 04:00 → 今日 04:00
    const result = calcPreviousBoundaryAt("2026-06-08T10:00:00.000Z", "04:00", "UTC");
    expect(result).toBe("2026-06-08T04:00:00.000Z");
  });

  it("nowIso が今日の境界より前 → 前日の境界を返す", () => {
    // UTC 2026-06-08 03:00, 境界 04:00 → 前日 (06-07) 04:00
    const result = calcPreviousBoundaryAt("2026-06-08T03:00:00.000Z", "04:00", "UTC");
    expect(result).toBe("2026-06-07T04:00:00.000Z");
  });

  it("nowIso が境界ちょうど → 今日の境界を返す (>= の境界値)", () => {
    const result = calcPreviousBoundaryAt("2026-06-08T04:00:00.000Z", "04:00", "UTC");
    expect(result).toBe("2026-06-08T04:00:00.000Z");
  });

  it("Asia/Tokyo: JST 02:00 (= UTC 17:00 前日) は前日の境界 (JST 04:00)", () => {
    // nowIso = "2026-06-17T17:00:00.000Z" = JST 2026-06-18 02:00
    // 今日 (JST) = 06-18. 今日の境界 = JST 06-18 04:00 = UTC 06-17 19:00
    // nowIso < 今日の境界 → 前日の境界 = JST 06-17 04:00 = UTC 06-16 19:00
    const result = calcPreviousBoundaryAt("2026-06-17T17:00:00.000Z", "04:00", "Asia/Tokyo");
    expect(result).toBe("2026-06-16T19:00:00.000Z");
  });

  it("Asia/Tokyo: JST 10:00 (境界後) は今日 (JST) の境界", () => {
    // nowIso = "2026-06-17T01:00:00.000Z" = JST 2026-06-17 10:00
    // 今日の境界 = JST 06-17 04:00 = UTC 06-16 19:00
    // nowIso >= 今日の境界 → 今日の境界を返す
    const result = calcPreviousBoundaryAt("2026-06-17T01:00:00.000Z", "04:00", "Asia/Tokyo");
    expect(result).toBe("2026-06-16T19:00:00.000Z");
  });
});

describe("needsDailyReset", () => {
  it("now が境界未到来なら false", () => {
    expect(needsDailyReset("2026-06-08T03:00:00.000Z", null, "2026-06-08T04:00:00.000Z")).toBe(
      false,
    );
  });

  it("初回 (lastReset = null) かつ境界以降なら true", () => {
    expect(needsDailyReset("2026-06-08T10:00:00.000Z", null, "2026-06-08T04:00:00.000Z")).toBe(
      true,
    );
  });

  it("lastReset が今日の境界より前なら true (前日リセット済み)", () => {
    expect(
      needsDailyReset(
        "2026-06-08T10:00:00.000Z",
        "2026-06-07T10:00:00.000Z",
        "2026-06-08T04:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("lastReset が今日の境界以降なら false (今日リセット済み)", () => {
    expect(
      needsDailyReset(
        "2026-06-08T10:00:00.000Z",
        "2026-06-08T05:00:00.000Z",
        "2026-06-08T04:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("境界値: now = todayBoundaryAt ちょうど なら true", () => {
    expect(needsDailyReset("2026-06-08T04:00:00.000Z", null, "2026-06-08T04:00:00.000Z")).toBe(
      true,
    );
  });
});
