import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

describe("web/src/main.tsx の as any 撤去", () => {
  const body = readFileSync(resolve(repoRoot, "web/src/main.tsx"), "utf-8");

  it("`as any` が残らない", () => {
    expect(body).not.toMatch(/as any/);
  });

  it("`eslint-disable` の死コメントが残らない", () => {
    expect(body).not.toMatch(/eslint-disable/);
  });

  it("`anyDb` 変数名が残らない", () => {
    expect(body).not.toMatch(/anyDb/);
  });
});

describe("LocalDb 型の共有", () => {
  it("local-db.ts が LocalDb interface を export している", () => {
    const body = readFileSync(resolve(repoRoot, "web/src/repositories/local-db.ts"), "utf-8");
    expect(body).toMatch(/export interface LocalDb/);
  });

  const LOCAL_FILES = [
    "web/src/repositories/local-task-repository.ts",
    "web/src/repositories/local-settings-repository.ts",
    "web/src/repositories/local-trash-repository.ts",
    "web/src/repositories/local-project-repository.ts",
    "web/src/repositories/local-routine-repository.ts",
    "web/src/usecases/local-reset-usecase.ts",
  ];

  it.each(LOCAL_FILES)("%s が LocalDb を参照する", (file) => {
    const body = readFileSync(resolve(repoRoot, file), "utf-8");
    expect(body).toMatch(/import type \{ LocalDb \} from "/);
  });

  it.each(LOCAL_FILES)("%s に個別 interface DBConnection が残らない", (file) => {
    const body = readFileSync(resolve(repoRoot, file), "utf-8");
    expect(body).not.toMatch(/interface DBConnection/);
  });
});
