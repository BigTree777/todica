import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const targetDirectories = [
  "docs/developer/features",
  "docs/user",
  "docs/developer/setup",
  "docs/developer/architecture",
];

const excludedFeatureDirectories = new Set([
  "docs/developer/features/app-login",
  "docs/developer/features/auth-doc-cleanup",
  "docs/developer/features/initial-password-setup",
]);

const forbiddenPattern = /VITE_AUTH_TOKEN|APP_PASSWORD_HASH|AUTH_TOKEN/;
const historyHeading = "## 経緯";

function listMarkdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

describe("docs の旧認証参照", () => {
  it("対象文書の現行説明に旧 env 参照が残っていない", () => {
    const violations: string[] = [];

    for (const targetDirectory of targetDirectories) {
      for (const file of listMarkdownFiles(resolve(repoRoot, targetDirectory))) {
        const relativePath = relative(repoRoot, file);
        if (
          [...excludedFeatureDirectories].some(
            (directory) =>
              relativePath === directory || relativePath.startsWith(`${directory}/`),
          )
        ) {
          continue;
        }

        const lines = readFileSync(file, "utf-8").split(/\r?\n/);
        const historyIndex = relativePath.endsWith("/tasks.md")
          ? lines.findIndex((line) => line.trim() === historyHeading)
          : -1;

        lines.forEach((line, index) => {
          if (!forbiddenPattern.test(line)) return;

          const isInHistorySection = historyIndex !== -1 && index > historyIndex;
          if (!isInHistorySection) {
            violations.push(`${relativePath}:${index + 1}: ${line}`);
          }
        });
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
