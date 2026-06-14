import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

const UI_FILES = [
  "web/src/ui/today-view/today-view.tsx",
  "web/src/ui/tomorrow-view/tomorrow-view.tsx",
  "web/src/ui/projects-view/projects-view.tsx",
  "web/src/ui/routines-view/routines-view.tsx",
  "web/src/ui/trash-view/trash-view.tsx",
  "web/src/ui/focus-view/focus-view.tsx",
  "web/src/ui/project-create-dialog/project-create-dialog.tsx",
];

describe("offline-queue auth (BL-097)", () => {
  it.each(UI_FILES)("%s に HasBaseUrlAndToken interface が残らない", (rel) => {
    const src = readFileSync(resolve(repoRoot, rel), "utf-8");
    expect(src).not.toMatch(/HasBaseUrlAndToken/);
  });

  it.each(UI_FILES)("%s に repo.authToken 参照が残らない", (rel) => {
    const src = readFileSync(resolve(repoRoot, rel), "utf-8");
    expect(src).not.toMatch(/\bauthToken\b/);
  });

  it.each(UI_FILES)("%s に Authorization Bearer 手動セット行が残らない", (rel) => {
    const src = readFileSync(resolve(repoRoot, rel), "utf-8");
    expect(src).not.toMatch(/Authorization:\s*`Bearer/);
  });

  it("offline-queue.ts が authedFetch を import している", () => {
    const src = readFileSync(resolve(repoRoot, "web/src/offline-queue.ts"), "utf-8");
    expect(src).toMatch(/import\s*\{\s*authedFetch\s*\}/);
  });

  it("offline-queue.ts の flush() が authedFetch を呼び出している", () => {
    const src = readFileSync(resolve(repoRoot, "web/src/offline-queue.ts"), "utf-8");
    expect(src).toMatch(/await\s+authedFetch\s*\(/);
  });
});
