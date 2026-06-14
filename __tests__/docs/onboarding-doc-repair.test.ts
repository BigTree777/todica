import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

const NODE_REQUIREMENT_STRING = "Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証）";

const DOCS_WITH_NODE_REQUIREMENT = [
  "README.md",
  "CONTRIBUTING.md",
  "docs/user/quick-start.md",
  "docs/user/deploy-guide.md",
];

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf-8");
}

describe("オンボーディング文書の Node 要件統一", () => {
  it.each(DOCS_WITH_NODE_REQUIREMENT)(
    "%s に統一文言が含まれる",
    (rel) => {
      const body = read(rel);
      expect(body).toContain(NODE_REQUIREMENT_STRING);
    },
  );

  it.each(DOCS_WITH_NODE_REQUIREMENT)(
    "%s に旧文言「Node.js 20」が残っていない",
    (rel) => {
      const body = read(rel);
      expect(body).not.toMatch(/Node\.js 20/);
    },
  );
});

describe("README のサーバ起動手順", () => {
  it("dev 起動 (npm run dev -w server) を案内している", () => {
    const body = read("README.md");
    expect(body).toMatch(/npm run dev -w server/);
  });

  it("prod 起動には domain → server の build が必要であることを明記している", () => {
    const body = read("README.md");
    expect(body).toMatch(/npm run build -w domain && npm run build -w server/);
  });

  it("本番運用は deploy-guide.md に誘導している", () => {
    const body = read("README.md");
    expect(body).toMatch(/docs\/user\/deploy-guide\.md/);
  });
});
