import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf-8");
}

describe("デプロイ時の TZ 明示ドキュメント (BL-103)", () => {
  it(".env.example に TZ=Asia/Tokyo の行と用途コメントがある", () => {
    const body = read(".env.example");
    expect(body).toMatch(/^TZ=Asia\/Tokyo$/m);
    expect(body).toMatch(/タイムゾーン/);
    expect(body).toMatch(/dayBoundaryTime/);
  });

  it("docs/user/deploy-guide.md の env 表に TZ 行がある", () => {
    const body = read("docs/user/deploy-guide.md");
    expect(body).toMatch(/\|\s*`TZ`\s*\|/);
    expect(body).toMatch(/Asia\/Tokyo/);
  });

  it("docs/user/deploy-guide.md の systemd unit 例に Environment=TZ=Asia/Tokyo がある", () => {
    const body = read("docs/user/deploy-guide.md");
    expect(body).toMatch(/Environment=TZ=Asia\/Tokyo/);
  });

  it("docs/user/deploy-guide.md のトラブルシュート表にリセット未発火 + resolved timezone 確認が載っている", () => {
    const body = read("docs/user/deploy-guide.md");
    expect(body).toMatch(/dayBoundaryTime/);
    expect(body).toMatch(/resolved timezone/);
    expect(body).toMatch(/journalctl/);
  });

  it("docs/developer/setup/server.md の env 表に TZ 行がある", () => {
    const body = read("docs/developer/setup/server.md");
    expect(body).toMatch(/\|\s*`TZ`\s*\|/);
    expect(body).toMatch(/Asia\/Tokyo/);
  });
});
