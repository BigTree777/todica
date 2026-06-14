import { describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "../../src/app.js";

const defaultOrigins = ["http://localhost:5173", "capacitor://localhost"];

describe("parseAllowedOrigins", () => {
  it.each([undefined, "", "   ", " , , "])(
    "未指定または空の値 %j ではデフォルトを返す",
    (envValue) => {
      expect(parseAllowedOrigins(envValue)).toEqual(defaultOrigins);
    },
  );

  it("カンマ区切りの値を trim し、空要素を除外する", () => {
    expect(
      parseAllowedOrigins(" https://example.com, ,capacitor://example, http://localhost:4173 "),
    ).toEqual(["https://example.com", "capacitor://example", "http://localhost:4173"]);
  });
});
