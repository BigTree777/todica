/**
 * OpenAPI response schema contract テスト (BL-126).
 *
 * BL-116 の openapi-drift は (path, method) の集合一致のみ, BL-125 は ErrorCode enum のみを
 * 担保する. 本テストは「実レスポンスのフィールド単位の形」を openapi の response schema と
 * 照合する第 3 のドリフトガードである.
 *
 * 方式:
 *   - buildTestApp() で in-memory 依存を注入した app を起動し, 各 GET エンドポイントへ
 *     `app.request` で実リクエストを投げて実レスポンス JSON を得る.
 *   - openapi.yaml の対応する `responses.<status>.content.application/json.schema` を
 *     $ref 解決した上で, 自前の OpenAPI 3.0 サブセット validator で実レスポンスを検証する.
 *   - validator は **strict**: required 欠落 / 型不一致 / enum 外 に加え,
 *     **schema に宣言の無いフィールド (undocumented)** も検出する (= 実装が返すのに
 *     openapi に書かれていないフィールドを炙り出す). additionalProperties: true の
 *     オブジェクトのみ追加フィールドを許す.
 *
 * 新たな依存は足さない (js-yaml は既存). 検証対象 OpenAPI 機能のサブセット:
 *   $ref / type(object|array|string|integer|number|boolean) / properties / required /
 *   items / enum / nullable / additionalProperties.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DueDate, Priority, Task, TrashedReason } from "@todica/domain/task";
import type { Hono } from "hono";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { authHeaders, buildTestApp, TEST_INITIAL_TIME } from "../helpers/build-test-app.js";

const repoRoot = resolve(__dirname, "../../..");

// biome-ignore lint/suspicious/noExplicitAny: openapi schema ノードは動的構造のため any で扱う.
type Schema = any;

const openapi = load(
  readFileSync(resolve(repoRoot, "docs/developer/architecture/api/openapi.yaml"), "utf8"),
) as {
  paths: Record<string, Record<string, { responses: Record<string, Schema> }>>;
  components: { schemas: Record<string, Schema> };
};

/** $ref を components.schemas から解決する (1 段で十分: 全 $ref が components/schemas を指す). */
function deref(schema: Schema): Schema {
  if (schema && typeof schema === "object" && typeof schema.$ref === "string") {
    const name = schema.$ref.replace("#/components/schemas/", "");
    const target = openapi.components.schemas[name];
    if (!target) throw new Error(`未解決の $ref: ${schema.$ref}`);
    return target;
  }
  return schema;
}

/** openapi の (openapiPath, method, status) に対応する application/json response schema を返す. */
function responseSchema(openapiPath: string, method: string, status: string): Schema {
  const op = openapi.paths[openapiPath]?.[method];
  if (!op) throw new Error(`openapi に ${method.toUpperCase()} ${openapiPath} が無い`);
  const json = op.responses?.[status]?.content?.["application/json"]?.schema;
  if (!json) {
    throw new Error(
      `${method.toUpperCase()} ${openapiPath} の ${status} に application/json response schema が無い`,
    );
  }
  return json;
}

/** OpenAPI 3.0 サブセットの strict validator. 不一致を path 付き文字列で返す. */
function validate(value: unknown, schemaRaw: Schema, path = "$"): string[] {
  const schema = deref(schemaRaw);
  const errors: string[] = [];

  if (value === null) {
    if (!schema.nullable) errors.push(`${path}: null は許可されていない (nullable 未指定)`);
    return errors;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: enum 外の値 ${JSON.stringify(value)} (許可: ${schema.enum.join(", ")})`);
  }

  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${path}: object を期待したが ${typeof value}`);
        break;
      }
      const obj = value as Record<string, unknown>;
      const props: Record<string, Schema> = schema.properties ?? {};
      for (const req of schema.required ?? []) {
        if (!(req in obj)) errors.push(`${path}.${req}: required フィールド欠落`);
      }
      for (const key of Object.keys(obj)) {
        if (key in props) {
          errors.push(...validate(obj[key], props[key], `${path}.${key}`));
        } else if (schema.additionalProperties !== true) {
          errors.push(`${path}.${key}: openapi に宣言の無いフィールド (undocumented)`);
        }
      }
      break;
    }
    case "array": {
      if (!Array.isArray(value)) {
        errors.push(`${path}: array を期待したが ${typeof value}`);
        break;
      }
      value.forEach((item, i) => {
        errors.push(...validate(item, schema.items, `${path}[${i}]`));
      });
      break;
    }
    case "string":
      if (typeof value !== "string") errors.push(`${path}: string を期待したが ${typeof value}`);
      break;
    case "integer":
      if (!Number.isInteger(value)) errors.push(`${path}: integer を期待したが ${typeof value}`);
      break;
    case "number":
      if (typeof value !== "number") errors.push(`${path}: number を期待したが ${typeof value}`);
      break;
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${path}: boolean を期待したが ${typeof value}`);
      break;
    default:
      // type 未指定スキーマは構造検査をスキップ (enum 検査のみ上で実施済み).
      break;
  }
  return errors;
}

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    name: "task",
    projectId: null,
    dueDate: "today" as DueDate,
    priority: "normal" as Priority,
    origin: "manual",
    routineId: null,
    createdAt: TEST_INITIAL_TIME,
    updatedAt: TEST_INITIAL_TIME,
    trashedAt: null,
    trashedReason: null as TrashedReason | null,
    version: 1,
    ...overrides,
  };
}

const PROJECT_ID = "00000000-0000-4000-8000-0000000000a1";
const ROUTINE_ID = "00000000-0000-4000-8000-0000000000b1";

/** 各エンドポイントの seed + リクエスト + openapi 対応を定義する. */
interface Case {
  name: string;
  apiPath: string;
  openapiPath: string;
  seed: (b: ReturnType<typeof buildTestApp>) => void;
}

const cases: Case[] = [
  {
    name: "GET /today",
    apiPath: "/api/v1/today",
    openapiPath: "/today",
    seed: (b) => {
      b.taskRepository.seed(makeTask({ id: ID(1), projectId: PROJECT_ID, priority: "highest" }));
      b.taskRepository.seed(makeTask({ id: ID(2), origin: "routine", routineId: ROUTINE_ID }));
      b.focusRepository.seed({ currentTaskId: ID(1) });
    },
  },
  {
    name: "GET /tasks",
    apiPath: "/api/v1/tasks",
    openapiPath: "/tasks",
    seed: (b) => {
      b.taskRepository.seed(makeTask({ id: ID(1), projectId: PROJECT_ID }));
      b.taskRepository.seed(
        makeTask({ id: ID(3), trashedAt: TEST_INITIAL_TIME, trashedReason: "completed" }),
      );
    },
  },
  {
    name: "GET /projects",
    apiPath: "/api/v1/projects",
    openapiPath: "/projects",
    seed: (b) =>
      b.projectRepository.seedProject({
        id: PROJECT_ID,
        name: "proj",
        createdAt: TEST_INITIAL_TIME,
        updatedAt: TEST_INITIAL_TIME,
        trashedAt: null,
        version: 1,
      }),
  },
  {
    name: "GET /routines",
    apiPath: "/api/v1/routines",
    openapiPath: "/routines",
    seed: (b) =>
      b.routineRepository.seed({
        id: ROUTINE_ID,
        name: "routine",
        daysOfWeek: [1, 3, 5],
        defaultPriority: "normal",
        version: 1,
        createdAt: TEST_INITIAL_TIME,
        updatedAt: TEST_INITIAL_TIME,
        trashedAt: null,
      }),
  },
  {
    name: "GET /trash",
    apiPath: "/api/v1/trash",
    openapiPath: "/trash",
    seed: (b) => {
      b.taskRepository.seed(
        makeTask({ id: ID(4), trashedAt: TEST_INITIAL_TIME, trashedReason: "deleted" }),
      );
      b.projectRepository.seedProject({
        id: PROJECT_ID,
        name: "proj",
        createdAt: TEST_INITIAL_TIME,
        updatedAt: TEST_INITIAL_TIME,
        trashedAt: TEST_INITIAL_TIME,
        version: 1,
      });
      b.routineRepository.seed({
        id: ROUTINE_ID,
        name: "routine",
        daysOfWeek: [2, 4],
        defaultPriority: "later",
        version: 1,
        createdAt: TEST_INITIAL_TIME,
        updatedAt: TEST_INITIAL_TIME,
        trashedAt: TEST_INITIAL_TIME,
      });
    },
  },
  { name: "GET /counter", apiPath: "/api/v1/counter", openapiPath: "/counter", seed: () => {} },
  { name: "GET /settings", apiPath: "/api/v1/settings", openapiPath: "/settings", seed: () => {} },
  {
    name: "GET /focus",
    apiPath: "/api/v1/focus",
    openapiPath: "/focus",
    seed: (b) => b.focusRepository.seed({ currentTaskId: ID(1) }),
  },
];

function ID(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

describe("BL-126 OpenAPI response schema contract", () => {
  for (const c of cases) {
    it(`${c.name} の実レスポンスが openapi response schema に一致する`, async () => {
      const built = buildTestApp();
      c.seed(built);
      const app: Hono = built.app;

      const res = await app.request(c.apiPath, { headers: authHeaders() });
      expect(res.status).toBe(200);
      const body = await res.json();

      const schema = responseSchema(c.openapiPath, "get", "200");
      const errors = validate(body, schema);
      expect(errors, `${c.name} のフィールド不一致:\n${errors.join("\n")}`).toEqual([]);
    });
  }
});
