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

  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf.map((b: Schema) => validate(value, b, path));
    return branches.some((e: string[]) => e.length === 0)
      ? []
      : [`${path}: oneOf のどの branch にも一致しない`];
  }

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
type Method = "get" | "post" | "patch" | "put" | "delete";

interface Case {
  name: string;
  apiPath: string;
  openapiPath: string;
  method?: Method; // 既定 get
  status?: string; // 期待 HTTP ステータス (既定 "200")
  seed?: (b: ReturnType<typeof buildTestApp>) => void;
  request?: (b: ReturnType<typeof buildTestApp>) => {
    body?: unknown;
    headers?: Record<string, string>;
  };
}

/** 共通の Routine seed レコード (通常状態). */
function routineSeed(trashedAt: string | null = null) {
  return {
    id: ROUTINE_ID,
    name: "routine",
    daysOfWeek: [1, 3, 5],
    defaultPriority: "normal" as const,
    version: 1,
    createdAt: TEST_INITIAL_TIME,
    updatedAt: TEST_INITIAL_TIME,
    trashedAt,
  };
}

/** 共通の Project seed レコード. */
function projectSeed(trashedAt: string | null = null) {
  return {
    id: PROJECT_ID,
    name: "proj",
    createdAt: TEST_INITIAL_TIME,
    updatedAt: TEST_INITIAL_TIME,
    trashedAt,
    version: 1,
  };
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

  // ---- mutations (BL-127) ----
  {
    name: "POST /tasks (201)",
    method: "post",
    apiPath: "/api/v1/tasks",
    openapiPath: "/tasks",
    status: "201",
    request: () => ({ body: { id: ID(9), name: "new", dueDate: "today", priority: "normal" } }),
  },
  {
    name: "PATCH /tasks/{id} (200)",
    method: "patch",
    apiPath: `/api/v1/tasks/${ID(1)}`,
    openapiPath: "/tasks/{id}",
    status: "200",
    seed: (b) => b.taskRepository.seed(makeTask({ id: ID(1) })),
    request: () => ({ body: { name: "renamed" }, headers: { "If-Match": "1" } }),
  },
  {
    name: "POST /tasks/{id}/complete (200)",
    method: "post",
    apiPath: `/api/v1/tasks/${ID(1)}/complete`,
    openapiPath: "/tasks/{id}/complete",
    status: "200",
    seed: (b) => b.taskRepository.seed(makeTask({ id: ID(1) })),
    request: () => ({ headers: { "If-Match": "1" } }),
  },
  {
    name: "DELETE /tasks/{id} (204)",
    method: "delete",
    apiPath: `/api/v1/tasks/${ID(1)}`,
    openapiPath: "/tasks/{id}",
    status: "204",
    seed: (b) => b.taskRepository.seed(makeTask({ id: ID(1) })),
    request: () => ({ headers: { "If-Match": "1" } }),
  },
  {
    name: "PUT /focus (200)",
    method: "put",
    apiPath: "/api/v1/focus",
    openapiPath: "/focus",
    status: "200",
    seed: (b) => {
      b.taskRepository.seed(makeTask({ id: ID(1) }));
      b.focusRepository.seed({ currentTaskId: null });
    },
    request: () => ({ body: { taskId: ID(1) }, headers: { "If-Match": "1" } }),
  },
  {
    name: "POST /projects (201)",
    method: "post",
    apiPath: "/api/v1/projects",
    openapiPath: "/projects",
    status: "201",
    request: () => ({ body: { id: PROJECT_ID, name: "p" } }),
  },
  {
    name: "PATCH /projects/{id} (200)",
    method: "patch",
    apiPath: `/api/v1/projects/${PROJECT_ID}`,
    openapiPath: "/projects/{id}",
    status: "200",
    seed: (b) => b.projectRepository.seedProject(projectSeed()),
    request: () => ({ body: { name: "p2" }, headers: { "If-Match": "1" } }),
  },
  {
    name: "PATCH /projects/{id} (412)",
    method: "patch",
    apiPath: `/api/v1/projects/${PROJECT_ID}`,
    openapiPath: "/projects/{id}",
    status: "412",
    seed: (b) => b.projectRepository.seedProject(projectSeed()),
    request: () => ({ body: { name: "p2" }, headers: { "If-Match": "999" } }),
  },
  {
    name: "DELETE /projects/{id} (204)",
    method: "delete",
    apiPath: `/api/v1/projects/${PROJECT_ID}`,
    openapiPath: "/projects/{id}",
    status: "204",
    seed: (b) => b.projectRepository.seedProject(projectSeed()),
    request: () => ({ headers: { "If-Match": "1" } }),
  },
  {
    name: "DELETE /projects/{id} (412)",
    method: "delete",
    apiPath: `/api/v1/projects/${PROJECT_ID}`,
    openapiPath: "/projects/{id}",
    status: "412",
    seed: (b) => b.projectRepository.seedProject(projectSeed()),
    request: () => ({ headers: { "If-Match": "999" } }),
  },
  {
    name: "POST /routines (201)",
    method: "post",
    apiPath: "/api/v1/routines",
    openapiPath: "/routines",
    status: "201",
    request: () => ({
      body: { id: ROUTINE_ID, name: "r", daysOfWeek: [1, 3], defaultPriority: "normal" },
    }),
  },
  {
    name: "PATCH /routines/{id} (200)",
    method: "patch",
    apiPath: `/api/v1/routines/${ROUTINE_ID}`,
    openapiPath: "/routines/{id}",
    status: "200",
    seed: (b) => b.routineRepository.seed(routineSeed()),
    request: () => ({ body: { name: "r2" }, headers: { "If-Match": "1" } }),
  },
  {
    name: "PATCH /routines/{id} (412)",
    method: "patch",
    apiPath: `/api/v1/routines/${ROUTINE_ID}`,
    openapiPath: "/routines/{id}",
    status: "412",
    seed: (b) => b.routineRepository.seed(routineSeed()),
    request: () => ({ body: { name: "r2" }, headers: { "If-Match": "999" } }),
  },
  {
    name: "DELETE /routines/{id} (204)",
    method: "delete",
    apiPath: `/api/v1/routines/${ROUTINE_ID}`,
    openapiPath: "/routines/{id}",
    status: "204",
    seed: (b) => b.routineRepository.seed(routineSeed()),
    request: () => ({ headers: { "If-Match": "1" } }),
  },
  {
    name: "DELETE /routines/{id} (412)",
    method: "delete",
    apiPath: `/api/v1/routines/${ROUTINE_ID}`,
    openapiPath: "/routines/{id}",
    status: "412",
    seed: (b) => b.routineRepository.seed(routineSeed()),
    request: () => ({ headers: { "If-Match": "999" } }),
  },
  {
    name: "POST /trash/{id}/restore (200, oneOf)",
    method: "post",
    apiPath: `/api/v1/trash/${ID(1)}/restore`,
    openapiPath: "/trash/{id}/restore",
    status: "200",
    seed: (b) =>
      b.taskRepository.seed(
        makeTask({ id: ID(1), trashedAt: TEST_INITIAL_TIME, trashedReason: "deleted" }),
      ),
    request: () => ({ headers: { "If-Match": "1" } }),
  },
  {
    name: "DELETE /trash (204)",
    method: "delete",
    apiPath: "/api/v1/trash",
    openapiPath: "/trash",
    status: "204",
  },
  {
    name: "PATCH /settings (200)",
    method: "patch",
    apiPath: "/api/v1/settings",
    openapiPath: "/settings",
    status: "200",
    seed: (b) => b.settingsRepository.seed({ dayBoundaryTime: "04:00" }),
    request: () => ({ body: { dayBoundaryTime: "05:00" }, headers: { "If-Match": "1" } }),
  },
  {
    name: "PATCH /settings (412)",
    method: "patch",
    apiPath: "/api/v1/settings",
    openapiPath: "/settings",
    status: "412",
    seed: (b) => b.settingsRepository.seed({ dayBoundaryTime: "04:00" }),
    request: () => ({ body: { dayBoundaryTime: "05:00" }, headers: { "If-Match": "999" } }),
  },
  {
    name: "PUT /focus (412)",
    method: "put",
    apiPath: "/api/v1/focus",
    openapiPath: "/focus",
    status: "412",
    seed: (b) => {
      b.taskRepository.seed(makeTask({ id: ID(1) }));
      b.focusRepository.seed({ currentTaskId: null });
    },
    request: () => ({ body: { taskId: ID(1) }, headers: { "If-Match": "999" } }),
  },
  {
    name: "POST /reset (200)",
    method: "post",
    apiPath: "/api/v1/reset",
    openapiPath: "/reset",
    status: "200",
  },
];

function ID(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

describe("BL-126 / BL-127 OpenAPI response schema contract", () => {
  for (const c of cases) {
    const method: Method = c.method ?? "get";
    const status = c.status ?? "200";
    it(`${c.name} の実レスポンスが openapi ${status} response schema に一致する`, async () => {
      const built = buildTestApp();
      c.seed?.(built);
      const app: Hono = built.app;

      const req = c.request?.(built) ?? {};
      const headers: Record<string, string> = { ...authHeaders(), ...(req.headers ?? {}) };
      if (method !== "get" && !("Idempotency-Key" in headers)) {
        headers["Idempotency-Key"] = crypto.randomUUID();
      }
      const init: RequestInit = { method: method.toUpperCase(), headers };
      if (req.body !== undefined) init.body = JSON.stringify(req.body);

      const res = await app.request(c.apiPath, init);
      const text = await res.clone().text();
      expect(res.status, `予期しないステータス. body=${text}`).toBe(Number(status));

      // 204 No Content はボディ無し: schema 照合をスキップし空ボディのみ確認する.
      if (status === "204") {
        expect(text.trim()).toBe("");
        return;
      }

      const body = await res.json();
      const schema = responseSchema(c.openapiPath, method, status);
      const errors = validate(body, schema);
      expect(errors, `${c.name} のフィールド不一致:\n${errors.join("\n")}`).toEqual([]);
    });
  }
});
