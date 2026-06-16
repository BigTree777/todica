import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function lineCount(relativePath: string): number {
  return read(relativePath).split("\n").length;
}

describe("エントリポイントの責務分割", () => {
  const routerFiles = readdirSync(resolve(repoRoot, "server/src/routers"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `server/src/routers/${file}`);
  const splitFiles = [
    "server/src/app.ts",
    "server/src/middleware.ts",
    ...routerFiles,
    "web/src/main.tsx",
    "web/src/bootstrap.ts",
    "web/src/app.tsx",
    "web/src/routes.tsx",
  ];

  it.each(splitFiles)("%s は 400 行以下である", (file) => {
    expect(lineCount(file)).toBeLessThanOrEqual(400);
  });

  it("createApp はリソース別ハンドラを直接定義しない", () => {
    const app = read("server/src/app.ts");
    const directApiHandlers = [
      ...app.matchAll(/app\.(?:get|post|put|patch|delete)\("([^"]+)"/g),
    ].map((match) => match[1]);

    expect(
      directApiHandlers.filter((path) => path !== "/healthz" && !path.startsWith("/api/v1/test/")),
    ).toEqual([]);
  });

  it("createApp は 10 個のリソースルータを配線する", () => {
    const app = read("server/src/app.ts");
    const routerNames = [
      "auth",
      "tasks",
      "today",
      "focus",
      "counter",
      "settings",
      "routines",
      "projects",
      "trash",
      "reset",
    ];

    for (const name of routerNames) {
      expect(app).toContain(`${name}Router(deps)`);
    }
  });

  it("main.tsx は初期化結果を render するエントリに限定される", () => {
    const main = read("web/src/main.tsx");

    expect(main).toContain("void init()");
    expect(main).toContain("createRoot(root).render(");
    expect(main).not.toMatch(/function\s+(?:App|SetupViewWithNav)\b/);
    expect(main).not.toMatch(/<(?:Routes|Route)\b/);
    expect(main).not.toMatch(/\b(?:useEffect|useState)\b/);
  });
});
