import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf-8");
}

describe("VITE_API_BASE_URL の dev / 本番説明整合", () => {
  it("setup/server.md が dev / 本番の用途差を説明している", () => {
    const body = read("docs/developer/setup/server.md");
    expect(body).toMatch(/VITE_API_BASE_URL/);
    expect(body).toMatch(/dev/);
    expect(body).toMatch(/本番/);
    expect(body).toMatch(/相対パス/);
    expect(body).toMatch(/空文字/);
  });

  it("quick-start.md A-2 が dev 想定 + 本番の別値を明示している", () => {
    const body = read("docs/user/quick-start.md");
    expect(body).toMatch(/dev 想定/);
    expect(body).toMatch(/本番/);
    expect(body).toMatch(/相対パス/);
  });

  it("quick-start.md A-2 が build 時埋め込みと dev 起動の env ランタイム読みを区別している", () => {
    const body = read("docs/user/quick-start.md");
    expect(body).toMatch(/ビルド時に `VITE_\*` を埋め込む/);
    expect(body).toMatch(/サーバ dev 起動.*env をランタイムで読む/);
  });
});
