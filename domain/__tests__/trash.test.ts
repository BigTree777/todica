import { describe, expect, it } from "vitest";
import { shouldPurge } from "../src/trash/index.js";

describe("shouldPurge (FR-062 purgeTrash 境界判定)", () => {
  const BOUNDARY = "2026-06-17T04:00:00.000Z";

  it("trashedAt が null なら false (アクティブな状態は purge 対象外)", () => {
    expect(shouldPurge(null, BOUNDARY)).toBe(false);
  });

  it("trashedAt が boundary より前なら true", () => {
    expect(shouldPurge("2026-06-17T03:59:59.999Z", BOUNDARY)).toBe(true);
  });

  it("trashedAt が boundary ちょうどなら false (半開区間 < の境界値)", () => {
    expect(shouldPurge(BOUNDARY, BOUNDARY)).toBe(false);
  });

  it("trashedAt が boundary より後なら false", () => {
    expect(shouldPurge("2026-06-17T05:00:00.000Z", BOUNDARY)).toBe(false);
  });
});
