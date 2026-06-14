# 設計・実装計画: サーバ基盤 (server-foundation)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`@hono/node-server` を `server/` パッケージの依存として追加し、`server/src/main.ts` の末尾に
`serve()` 呼び出しを配線する。TypeScript のビルド（`tsc`）で `dist/` に出力し、
`npm start` は `node dist/main.js` で実行する。HTTPS は reverse proxy に委ねる。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| `server/package.json` | `@hono/node-server` を dependencies に追加。`build` / `start` スクリプトを追加 |
| `server/src/main.ts` | `serve()` 呼び出しを追加。`/healthz` エンドポイントを追加 |
| `server/tsconfig.json` | `outDir: "./dist"` / `rootDir: "./src"` が未設定なら追加 |
| ドキュメント | `docs/operations/` に環境変数リファレンスとデプロイガイドを作成 |
| API | UI |
| DB | なし（既存マイグレーション維持） |
| モジュール | なし |
| UI | なし |

## 設計詳細

### パッケージ追加

`server/package.json` の `dependencies` に追加:

```json
"@hono/node-server": "^1.13.7"
```

`hono` はルートの `devDependencies` にあるが、`server/` 自身の `dependencies` には未登録。
`@hono/node-server` と合わせて `hono` も `server/` の dependencies に追加する。

### `server/src/main.ts` の変更

末尾の `export default app;` を以下に置き換える:

```typescript
import { serve } from "@hono/node-server";

serve({ fetch: app.fetch, port: PORT }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`Todica server listening on http://localhost:${info.port}`);
});
```

`export default app;` は削除する（エントリポイントとして直接実行するため不要）。

### `/healthz` エンドポイント

`server/src/app.ts` の `createApp` 内に追加する:

```typescript
app.get("/healthz", (c) => c.json({ status: "ok" }));
```

認証ミドルウェアの適用範囲外（認証不要）とする。

### ビルド・起動スクリプト

`server/package.json` の `scripts`:

```json
"build": "tsc --project tsconfig.json",
"start": "node dist/main.js"
```

`tsconfig.json` に `"outDir": "./dist"` と `"rootDir": "./src"` を設定する。
既存の `"test": "vitest run"` は維持する。

### 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `DATABASE_PATH` | 任意 | `./todica.db` | SQLite ファイルの絶対パスまたは相対パス |
| `PORT` | 任意 | `3000` | HTTP リスニングポート |

認証 token は環境変数ではなく、`POST /api/v1/login` が発行して sessions テーブルに保存する。

### 処理フロー（起動シーケンス）

```
npm start
  → node dist/main.js
      → SQLite ファイルを開く（DATABASE_PATH）
      → WAL モード設定
      → マイグレーション適用（drizzle/*.sql）
      → Drizzle Repository / app 初期化
      → serve({ fetch: app.fetch, port: PORT })
      → "Todica server listening on http://localhost:<PORT>" をコンソールに出力
```

### エラー処理

| 状況 | 挙動 |
| --- | --- |
| SQLite ファイルのオープン失敗 | Node.js の uncaught exception としてプロセスが終了 |
| マイグレーション適用失敗 | 例外がスローされプロセスが終了 |
| PORT が非数値 | `NaN` になり `serve()` がエラーをスロー |

### HTTPS 運用（NFR-032）

サーバ自身は HTTP のみ対応する。本番環境では以下の構成を想定する:

```
Internet
  ↓ HTTPS (443)
reverse proxy (nginx / Caddy)
  ↓ HTTP (3000)
Todica server (Node.js)
```

`docs/operations/deploy-guide.md` に nginx / Caddy のサンプル設定を記載する。

## 重要な決定

- `@hono/node-server` を採用する。Bun / Deno ネイティブランタイムではなく Node.js を使う理由は、
  既存の `better-sqlite3`（ネイティブモジュール）が Node.js を前提としているため。
- ビルドは `tsc` を使う。`tsx` や `ts-node` によるランタイムトランスパイルは本番に不適切なため採用しない。
- `/healthz` を認証不要にする。reverse proxy のヘルスチェックから認証トークンを持たせることを避けるため。

## リスク / 代替案

| リスク | 対策 |
| --- | --- |
| `better-sqlite3` のネイティブモジュールがビルド環境に依存する | npm install 時にコンパイルされる。OS / Node.js バージョンを揃えて運用する |
| `dist/` の成果物を git 管理すると混乱する | `.gitignore` に `server/dist/` を追加する |

## テスト方針

- 自動テスト（vitest）: `/healthz` エンドポイントの単体テストを `server/__tests__/integration/startup.test.ts` に追加する。
- 手動確認（E2E）: `npm run build && npm start` を実行し、curl で `/healthz` とログイン後の認証付き API エンドポイントを確認する。
- 既存の結合テスト（Hono の `app.request` を使ったもの）で API ロジック全体は担保済みであり、本 feature で追加するテストは起動・ヘルスチェック・環境変数検証に絞る。
- 初期設定前の起動については、空 DB で `/healthz` と `/api/v1/auth-state` が応答することを起動テストで担保する。
