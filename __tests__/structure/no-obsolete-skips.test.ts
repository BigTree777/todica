import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const targetFiles = [
  "web/__tests__/routine-card-component.test.tsx",
  "web/__tests__/routine-card-edit-fields.test.tsx",
  "web/__tests__/routine-card-edit-priority.test.tsx",
  "web/__tests__/routine-card-header-layout.test.tsx",
  "web/__tests__/routine-form-card-header-layout.test.tsx",
  "web/__tests__/routine-card-align-with-form.test.tsx",
  "web/__tests__/project-card-component.test.tsx",
];
const retiredFiles = new Set([
  "web/__tests__/routine-card-edit-fields.test.tsx",
  "web/__tests__/routine-card-edit-priority.test.tsx",
]);

describe("obsolete skip guard", () => {
  it.each(targetFiles)("%s に describe.skip / it.skip が存在しない", (relativePath) => {
    const path = resolve(repoRoot, relativePath);
    const exists = existsSync(path);

    if (retiredFiles.has(relativePath)) {
      expect(exists).toBe(false);
      return;
    }

    expect(exists).toBe(true);
    const source = readFileSync(path, "utf8");
    expect(source.match(/\b(?:describe|it)\.skip\b/g) ?? []).toHaveLength(0);
  });

  it.each(
    targetFiles.filter((p) => !retiredFiles.has(p)),
  )("%s に BL-XXX 履歴表現が存在しない", (relativePath) => {
    const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
    expect(source.match(/BL-\d{3}/g) ?? []).toHaveLength(0);
  });
});
