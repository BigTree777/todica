import { describe, expect, it } from "vitest";
import {
  type Counter,
  incrementCompletedCount,
  resetCompletedCount,
} from "../src/counter/index.js";

const BASE: Counter = {
  id: "singleton",
  completedCount: 0,
  lastResetExecutedAt: null,
  updatedAt: "2026-06-16T00:00:00.000Z",
  version: 1,
};

describe("incrementCompletedCount", () => {
  it("completedCount を +1 / version を +1 / updatedAt を now で更新する", () => {
    const result = incrementCompletedCount(BASE, "2026-06-17T10:00:00.000Z");
    expect(result.completedCount).toBe(1);
    expect(result.version).toBe(2);
    expect(result.updatedAt).toBe("2026-06-17T10:00:00.000Z");
    expect(result.id).toBe("singleton");
    expect(result.lastResetExecutedAt).toBeNull();
  });

  it("既存の lastResetExecutedAt を保存する", () => {
    const prev = "2026-06-16T19:00:00.000Z";
    const counter: Counter = { ...BASE, lastResetExecutedAt: prev, completedCount: 5 };
    const result = incrementCompletedCount(counter, "2026-06-17T10:00:00.000Z");
    expect(result.completedCount).toBe(6);
    expect(result.lastResetExecutedAt).toBe(prev);
  });

  it("入力 counter を変更しない (純関数)", () => {
    const before = { ...BASE };
    incrementCompletedCount(BASE, "2026-06-17T10:00:00.000Z");
    expect(BASE).toEqual(before);
  });
});

describe("resetCompletedCount", () => {
  it("completedCount を 0 / lastResetExecutedAt を引数値 / version+1 / updatedAt 更新", () => {
    const counter: Counter = { ...BASE, completedCount: 7, version: 3 };
    const result = resetCompletedCount(
      counter,
      "2026-06-17T04:00:00.000Z",
      "2026-06-17T10:00:00.000Z",
    );
    expect(result.completedCount).toBe(0);
    expect(result.lastResetExecutedAt).toBe("2026-06-17T04:00:00.000Z");
    expect(result.updatedAt).toBe("2026-06-17T10:00:00.000Z");
    expect(result.version).toBe(4);
  });

  it("既に completedCount が 0 でも version+1 / updatedAt 更新が走る", () => {
    const result = resetCompletedCount(
      BASE,
      "2026-06-17T04:00:00.000Z",
      "2026-06-17T10:00:00.000Z",
    );
    expect(result.completedCount).toBe(0);
    expect(result.version).toBe(2);
  });

  it("入力 counter を変更しない (純関数)", () => {
    const before = { ...BASE };
    resetCompletedCount(BASE, "2026-06-17T04:00:00.000Z", "2026-06-17T10:00:00.000Z");
    expect(BASE).toEqual(before);
  });
});
