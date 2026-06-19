import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const routersDir = resolve(repoRoot, "server/src/routers");

const routerPrefixes: Record<string, string> = {
  auth: "",
  counter: "/counter",
  focus: "/focus",
  projects: "/projects",
  reset: "/reset",
  routines: "/routines",
  settings: "/settings",
  tasks: "/tasks",
  today: "/today",
  trash: "/trash",
};

const openapi = load(
  readFileSync(resolve(repoRoot, "docs/developer/architecture/api/openapi.yaml"), "utf8"),
) as {
  paths: Record<string, Record<string, { requestBody?: unknown; "x-internal"?: boolean }>>;
};

interface BodyReaderOperation {
  file: string;
  method: string;
  path: string;
}

function toOpenApiPath(prefix: string, routePath: string): string {
  const suffix = routePath === "/" ? "" : routePath;
  const path = `${prefix}${suffix}` || "/";
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function operationsReadingBody(file: string, source: string): BodyReaderOperation[] {
  const routerName = file.replace(/\.ts$/, "");
  const prefix = routerPrefixes[routerName];
  if (prefix === undefined) throw new Error(`router prefix 未登録: ${file}`);

  const routePattern = /router\.(get|post|patch|put|delete)\("([^"]+)"/g;
  const matches = [...source.matchAll(routePattern)];

  return matches.flatMap((match, index) => {
    const [, method, routePath] = match;
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? source.length;
    const handlerSource = source.slice(start, end);
    const readsBody = /\bc\.req\.(json|parseBody)\(/.test(handlerSource);
    if (!readsBody || !method || !routePath) return [];

    return [
      {
        file,
        method,
        path: toOpenApiPath(prefix, routePath),
      },
    ];
  });
}

describe("OpenAPI requestBody coverage", () => {
  it("request body を読む router operation は openapi requestBody を持つ", () => {
    const bodyReaderOperations = readdirSync(routersDir)
      .filter((file) => file.endsWith(".ts") && !file.startsWith("_"))
      .flatMap((file) => operationsReadingBody(file, readFileSync(join(routersDir, file), "utf8")))
      .filter((op) => !op.path.startsWith("/test/"));

    const missing = bodyReaderOperations.filter((op) => {
      const operation = openapi.paths[op.path]?.[op.method];
      return operation && operation["x-internal"] !== true && operation.requestBody === undefined;
    });

    expect(missing.map((op) => `${op.file}: ${op.method.toUpperCase()} ${op.path}`)).toEqual([]);
  });
});
