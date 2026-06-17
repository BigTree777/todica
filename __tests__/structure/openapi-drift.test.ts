import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeDrift,
  type Endpoint,
  endpointKey,
  extractInlineAppEndpoints,
  extractMounts,
  extractOpenapiEndpoints,
  extractRouterEndpoints,
  normalizeEndpoint,
} from "./openapi-drift.js";

/**
 * BL-116 OpenAPI ドリフト検出機構 — 受け入れ基準 AC-1〜AC-8 の検証.
 *
 * 仕様: docs/developer/features/openapi-drift-detection/spec.md
 *
 * このテスト自体が本 feature の成果物 (ドリフト検出機構) である.
 * 整合状態では green / 片側更新漏れで red になることを最重要視する.
 *
 * - AC-2 / AC-3 / AC-4 / AC-5 は検出ロジックを純粋関数として呼び, インメモリの
 *   (path, method) 集合で差分検出・正規化挙動を検証する (実ファイル改変なしに red 化を確認できる).
 * - AC-1 / AC-6 / AC-7 / AC-8 は実ファイル (openapi.yaml + 実装ソース) に対する統合 assert.
 *
 * 検出関数が未実装スタブ (throw) の段階では本テスト群は意図的に red になる (TDD の失敗するテスト).
 * 実装後, かつ既存ドリフト 5 件を openapi 側で解消した時点で全件 green になる.
 */

const repoRoot = resolve(__dirname, "../..");

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

// app.route(prefix, xxxRouter) のマウント prefix → ルータファイル名の明示的対応表 (D-2).
// app.ts のマウント記述と相互検証して保守漏れを検出する.
const MOUNTS: { prefix: string; router: string }[] = [
  { prefix: "/api/v1", router: "auth" },
  { prefix: "/api/v1/tasks", router: "tasks" },
  { prefix: "/api/v1/today", router: "today" },
  { prefix: "/api/v1/focus", router: "focus" },
  { prefix: "/api/v1/counter", router: "counter" },
  { prefix: "/api/v1/settings", router: "settings" },
  { prefix: "/api/v1/projects", router: "projects" },
  { prefix: "/api/v1/trash", router: "trash" },
  { prefix: "/api/v1/reset", router: "reset" },
  { prefix: "/api/v1/routines", router: "routines" },
];

/** openapi.yaml の全エンドポイントを実ファイルから抽出する. */
function openapiEndpoints(): Endpoint[] {
  return extractOpenapiEndpoints(read("docs/developer/architecture/api/openapi.yaml"));
}

/** 実装 (ルータ群 + app.ts インライン) の全エンドポイントを実ファイルから抽出する. */
function implEndpoints(): Endpoint[] {
  const appSource = read("server/src/app.ts");
  const fromRouters = MOUNTS.flatMap(({ prefix, router }) =>
    extractRouterEndpoints(read(`server/src/routers/${router}.ts`), prefix),
  );
  const fromInline = extractInlineAppEndpoints(appSource);
  return [...fromRouters, ...fromInline];
}

describe("BL-116 OpenAPI ドリフト検出機構", () => {
  describe("検出ロジック (純粋関数) の挙動", () => {
    // AC-4: path パラメータ形式の差を吸収する.
    // openapi の {id} と 実装の :id を同一に正規化する.
    it("AC-4: :id (hono) と {id} (OpenAPI) を同一エンドポイントに正規化する", () => {
      const fromImpl = normalizeEndpoint("PATCH", "/api/v1/tasks/:id");
      const fromOpenapi = normalizeEndpoint("patch", "/tasks/{id}");
      expect(endpointKey(fromImpl)).toBe(endpointKey(fromOpenapi));
      expect(fromImpl).toEqual({ method: "patch", path: "/tasks/{id}" });
    });

    // AC-5: ベース path /api/v1 の有無を吸収する.
    it("AC-5: 実装側の先頭 /api/v1 を除去し openapi の path 形式に揃える", () => {
      const fromImpl = normalizeEndpoint("get", "/api/v1/tasks");
      const fromOpenapi = normalizeEndpoint("get", "/tasks");
      expect(endpointKey(fromImpl)).toBe(endpointKey(fromOpenapi));
      expect(fromImpl.path).toBe("/tasks");
    });

    // AC-5 補助: /api/v1 配下でない /healthz はそのまま比較キーにする.
    it("AC-5: /healthz は /api/v1 配下でないため path をそのまま保持する", () => {
      expect(normalizeEndpoint("get", "/healthz")).toEqual({ method: "get", path: "/healthz" });
    });

    // 正規化補助: method 小文字化と末尾スラッシュ除去.
    it("method を小文字化し末尾スラッシュを除去する", () => {
      expect(normalizeEndpoint("POST", "/api/v1/tasks/")).toEqual({
        method: "post",
        path: "/tasks",
      });
    });

    // AC-2: 実装にハンドラを足して openapi 未更新だと「実装だけにある」に出る.
    it("AC-2: 実装のみに存在するエンドポイントが onlyInImpl に算出される", () => {
      const openapi: Endpoint[] = [{ method: "get", path: "/tasks" }];
      const impl: Endpoint[] = [
        { method: "get", path: "/tasks" },
        { method: "post", path: "/tasks/{id}/archive" },
      ];
      const drift = computeDrift(openapi, impl);
      expect(drift.onlyInImpl).toEqual(["post /tasks/{id}/archive"]);
      expect(drift.onlyInOpenapi).toEqual([]);
    });

    // AC-3: openapi に endpoint を足して実装未追加だと「openapi だけにある」に出る.
    it("AC-3: openapi のみに存在するエンドポイントが onlyInOpenapi に算出される", () => {
      const openapi: Endpoint[] = [
        { method: "get", path: "/tasks" },
        { method: "post", path: "/tasks/{id}/restore" },
      ];
      const impl: Endpoint[] = [{ method: "get", path: "/tasks" }];
      const drift = computeDrift(openapi, impl);
      expect(drift.onlyInOpenapi).toEqual(["post /tasks/{id}/restore"]);
      expect(drift.onlyInImpl).toEqual([]);
    });

    // AC-1 / AC-4 / AC-5 の合流: 形式差を吸収した上で完全一致なら双方向差分が空.
    it("AC-1: 形式違いだけの集合は正規化後に双方向差分が空になる", () => {
      const openapi = [
        normalizeEndpoint("get", "/tasks"),
        normalizeEndpoint("patch", "/tasks/{id}"),
      ];
      const impl = [
        normalizeEndpoint("GET", "/api/v1/tasks/"),
        normalizeEndpoint("patch", "/api/v1/tasks/:id"),
      ];
      const drift = computeDrift(openapi, impl);
      expect(drift.onlyInOpenapi).toEqual([]);
      expect(drift.onlyInImpl).toEqual([]);
    });
  });

  describe("D-2: マウント prefix 対応表と app.ts の相互検証", () => {
    // app.ts の app.route(prefix, xxxRouter) と対応表 MOUNTS が過不足なく一致する.
    // 「新ルータを足したが対応表更新を忘れた」状態をここで捕まえる.
    it("app.ts のマウント一覧と対応表が一致する", () => {
      const mounts = extractMounts(read("server/src/app.ts"));
      const actual = mounts.map((m) => m.prefix).sort();
      const expected = MOUNTS.map((m) => m.prefix).sort();
      expect(actual).toEqual(expected);
    });
  });

  describe("実ファイルに対する統合検証", () => {
    // AC-1 / AC-8: 整合状態では双方向差分が空 (green). 導入時点の実ドリフト 5 件解消後に成立.
    it("AC-1 / AC-8: openapi と実装の (path, method) 集合が完全一致する", () => {
      const drift = computeDrift(openapiEndpoints(), implEndpoints());
      expect({ onlyInOpenapi: drift.onlyInOpenapi, onlyInImpl: drift.onlyInImpl }).toEqual({
        onlyInOpenapi: [],
        onlyInImpl: [],
      });
    });

    // AC-6: x-internal: true の endpoint も実装側に存在することが要求される.
    // test/clock 系は openapi で x-internal が付くが, 実装にも存在しなければならない.
    it("AC-6: x-internal の test/clock 系も実装側に存在し一致する", () => {
      const impl = new Set(implEndpoints().map(endpointKey));
      const internal = ["get /test/clock", "post /test/clock/set", "post /test/clock/advance"];
      for (const key of internal) {
        expect(impl.has(key)).toBe(true);
      }
      // openapi 側にもこれらが列挙されている (例外として除外していない).
      const openapi = new Set(openapiEndpoints().map(endpointKey));
      for (const key of internal) {
        expect(openapi.has(key)).toBe(true);
      }
    });

    // AC-6 続き: /healthz も x-internal 付きで openapi に記載され, 実装にも存在する.
    it("AC-6: /healthz が openapi・実装の双方に存在する", () => {
      const impl = new Set(implEndpoints().map(endpointKey));
      const openapi = new Set(openapiEndpoints().map(endpointKey));
      expect(impl.has("get /healthz")).toBe(true);
      expect(openapi.has("get /healthz")).toBe(true);
    });

    // AC-7: 条件付きマウント (routines / test/clock) も検証対象に含まれる.
    it("AC-7: 条件付きマウントの routines / test/clock も一致検証される", () => {
      const impl = new Set(implEndpoints().map(endpointKey));
      const openapi = new Set(openapiEndpoints().map(endpointKey));
      const conditional = [
        "get /routines",
        "post /routines",
        "patch /routines/{id}",
        "delete /routines/{id}",
        "get /test/clock",
      ];
      for (const key of conditional) {
        expect(impl.has(key)).toBe(true);
        expect(openapi.has(key)).toBe(true);
      }
    });

    // AC-8 補助: 解消対象の per-entity restore 3 path は openapi から消えている.
    it("AC-8: per-entity restore (/tasks|projects|routines/{id}/restore) が openapi から削除されている", () => {
      const openapi = new Set(openapiEndpoints().map(endpointKey));
      expect(openapi.has("post /tasks/{id}/restore")).toBe(false);
      expect(openapi.has("post /projects/{id}/restore")).toBe(false);
      expect(openapi.has("post /routines/{id}/restore")).toBe(false);
    });

    // AC-8 補助: 復元は /trash/{id}/restore に一本化され, openapi・実装の双方に存在する.
    it("AC-8: 復元が /trash/{id}/restore に一本化され双方に存在する", () => {
      const impl = new Set(implEndpoints().map(endpointKey));
      const openapi = new Set(openapiEndpoints().map(endpointKey));
      expect(impl.has("post /trash/{id}/restore")).toBe(true);
      expect(openapi.has("post /trash/{id}/restore")).toBe(true);
    });
  });
});
