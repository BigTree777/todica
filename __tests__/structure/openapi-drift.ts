/**
 * BL-116 OpenAPI ドリフト検出機構 — 検出ロジック (純粋関数群).
 *
 * 仕様: docs/developer/features/openapi-drift-detection/spec.md
 *   - FR-1: openapi.yaml をパースして全 (path, method) を列挙する.
 *   - FR-2: server/src/routers/*.ts と server/src/app.ts から全 (path, method) を抽出し,
 *           マウント prefix を合成して完全 path を復元する.
 *   - FR-3: path の正規化規則 (/api/v1 除去, :p→{p}, method 小文字, 末尾スラッシュ除去).
 *   - FR-4: 双方向差集合 (openapi だけ / 実装だけ) を算出する.
 *
 * 本ファイルは検出ロジックを純粋関数として切り出すための置き場である.
 * テスト (openapi-drift.test.ts) がこの signature を要求する.
 *
 * 注意: これは構造テスト用ヘルパであり, *.test.ts ではない (vitest の include 対象外).
 */

import { load } from "js-yaml";

/** 1 つの公開エンドポイント (正規化済み). 例: { method: "post", path: "/tasks/{id}" } */
export interface Endpoint {
  /** 小文字の HTTP メソッド (get/post/put/patch/delete). */
  method: string;
  /** /api/v1 を除いた正規 path. path パラメータは {id} 形式. 末尾スラッシュ無し. */
  path: string;
}

/** app.route(prefix, xxxRouter) のマウント prefix → ルータファイル名の対応表エントリ. */
export interface MountEntry {
  /** 完全な prefix. 例: "/api/v1/tasks", auth は "/api/v1". */
  prefix: string;
  /** server/src/routers/ 配下のファイル名 (拡張子なし). 例: "tasks". */
  router: string;
}

/** 双方向差集合の算出結果. */
export interface DriftResult {
  /** openapi にあって実装に無いエンドポイント (キー文字列のソート済み配列). */
  onlyInOpenapi: string[];
  /** 実装にあって openapi に無いエンドポイント (キー文字列のソート済み配列). */
  onlyInImpl: string[];
}

/**
 * エンドポイントを比較キー文字列に変換する. 例: "post /tasks/{id}".
 */
export function endpointKey(endpoint: Endpoint): string {
  return `${endpoint.method} ${endpoint.path}`;
}

/**
 * path / method を spec の正規化規則に従って正規化する (FR-3).
 *
 * - method を小文字化.
 * - 先頭 /api/v1 を除去 (/healthz など /api/v1 配下でない path はそのまま).
 * - :param → {param} (hono → OpenAPI 形式).
 * - 末尾スラッシュ除去 (ただし path が "/" だけになる場合の扱いはルータ prefix で吸収済み).
 */
export function normalizeEndpoint(method: string, path: string): Endpoint {
  let normalizedPath = path;

  // 先頭 /api/v1 を除去する (/healthz など /api/v1 配下でない path はそのまま残す).
  if (normalizedPath === "/api/v1") {
    normalizedPath = "";
  } else if (normalizedPath.startsWith("/api/v1/")) {
    normalizedPath = normalizedPath.slice("/api/v1".length);
  }

  // :param → {param} (hono → OpenAPI 形式).
  normalizedPath = normalizedPath.replace(/:([^/]+)/g, "{$1}");

  // 末尾スラッシュ除去 (ただし path が "/" だけになる場合は空にする).
  if (normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  if (normalizedPath === "/") {
    normalizedPath = "";
  }

  return { method: method.toLowerCase(), path: normalizedPath };
}

/**
 * openapi.yaml の文字列を受け取り, 正規化済みエンドポイント集合を抽出する (FR-1).
 *
 * x-internal: true の付いた operation も例外にせず含める (spec x-internal 規約).
 */
export function extractOpenapiEndpoints(openapiYaml: string): Endpoint[] {
  const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
  const doc = load(openapiYaml) as { paths?: Record<string, Record<string, unknown>> };
  if (!doc || typeof doc !== "object" || !doc.paths) {
    throw new Error("openapi.yaml に paths が存在しない");
  }

  const endpoints: Endpoint[] = [];
  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== "object") {
      continue;
    }
    for (const key of Object.keys(pathItem)) {
      // HTTP メソッドのキーのみを (path, method) として収集する.
      // x-internal: true の operation も例外にせず含める.
      if (HTTP_METHODS.has(key.toLowerCase())) {
        endpoints.push(normalizeEndpoint(key, path));
      }
    }
  }
  return endpoints;
}

/**
 * app.ts のソースから app.route(prefix, ...) のマウント一覧を抽出する (D-2).
 */
export function extractMounts(appSource: string): MountEntry[] {
  // app.route("<prefix>", <ident>Router(...)) を抽出する.
  // ルータ識別子は xxxRouter の命名規則であり, 末尾の "Router" を除いたものをファイル名とみなす.
  const mountRe = /app\.route\(\s*"([^"]+)"\s*,\s*([A-Za-z0-9_]+)Router\s*\(/g;
  const mounts: MountEntry[] = [];
  let match: RegExpExecArray | null = mountRe.exec(appSource);
  while (match !== null) {
    mounts.push({ prefix: match[1], router: match[2] });
    match = mountRe.exec(appSource);
  }
  return mounts;
}

/**
 * 1 つのルータソースから router.<method>("<relative>") を抽出し,
 * 与えられた prefix と合成・正規化したエンドポイント集合を返す (FR-2 / FR-3).
 *
 * 第 1 引数が文字列リテラルでない router.<method>( が存在したら throw する (D-3 sentinel).
 */
export function extractRouterEndpoints(routerSource: string, prefix: string): Endpoint[] {
  return extractHandlerEndpoints(routerSource, "router", (relativePath) => {
    // prefix + relativePath を完全 path として合成・正規化する.
    // 相対 path が "/" の場合は prefix そのものを表す.
    const combined = relativePath === "/" ? prefix : prefix + relativePath;
    return normalizeEndpoint("placeholder", combined).path;
  });
}

/**
 * app.ts のインライン app.<method>("<absolute>") を抽出・正規化する (FR-2).
 * (/healthz, /api/v1/test/clock 系)
 *
 * 第 1 引数が文字列リテラルでない app.<method>( が存在したら throw する (D-3 sentinel).
 */
export function extractInlineAppEndpoints(appSource: string): Endpoint[] {
  return extractHandlerEndpoints(appSource, "app", (absolutePath) => {
    // app.<method> は完全な絶対 path を第 1 引数に取る.
    // app.route によるマウントは別途 extractMounts で扱うため除外する (ここではメソッド呼びのみ).
    return normalizeEndpoint("placeholder", absolutePath).path;
  });
}

/**
 * <receiver>.<method>("<literal>") を正規表現で抽出する共通実装.
 *
 * 第 1 引数が文字列リテラルでない呼び出しを検出したら throw する (D-3 sentinel).
 * route は HTTP メソッドではないため対象外.
 */
function extractHandlerEndpoints(
  source: string,
  receiver: string,
  toPath: (rawPath: string) => string,
): Endpoint[] {
  const methods = "get|post|put|patch|delete";
  // 第 1 引数が文字列リテラルである正常な呼び出し.
  const literalRe = new RegExp(`${receiver}\\.(${methods})\\(\\s*"([^"]*)"`, "g");
  // メソッド呼び出し全般 (sentinel 用. 第 1 引数の中身は問わない).
  const anyRe = new RegExp(`${receiver}\\.(${methods})\\(\\s*`, "g");

  const endpoints: Endpoint[] = [];
  let match: RegExpExecArray | null = literalRe.exec(source);
  while (match !== null) {
    const path = toPath(match[2]);
    endpoints.push(normalizeEndpoint(match[1], path));
    match = literalRe.exec(source);
  }

  // D-3 sentinel: メソッド呼び出しの数とリテラル抽出の数が一致しなければ
  // 文字列リテラルでない第 1 引数が混入している.
  let total = 0;
  let any: RegExpExecArray | null = anyRe.exec(source);
  while (any !== null) {
    total += 1;
    any = anyRe.exec(source);
  }
  if (total !== endpoints.length) {
    throw new Error(
      `${receiver}.<method>( の第 1 引数が文字列リテラルでない箇所を検出した (抽出漏れの可能性)`,
    );
  }

  return endpoints;
}

/**
 * 2 つのエンドポイント集合の双方向差集合を算出する純粋関数 (FR-4).
 *
 * @param openapi openapi 由来のエンドポイント集合
 * @param impl 実装由来のエンドポイント集合
 */
export function computeDrift(openapi: Endpoint[], impl: Endpoint[]): DriftResult {
  const openapiKeys = new Set(openapi.map(endpointKey));
  const implKeys = new Set(impl.map(endpointKey));

  const onlyInOpenapi = [...openapiKeys].filter((key) => !implKeys.has(key)).sort();
  const onlyInImpl = [...implKeys].filter((key) => !openapiKeys.has(key)).sort();

  return { onlyInOpenapi, onlyInImpl };
}
