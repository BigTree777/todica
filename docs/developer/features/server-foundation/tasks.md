# タスク: サーバ基盤 (server-foundation)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

### 1. パッケージ追加

- [ ] `server/package.json` の `dependencies` に `hono` と `@hono/node-server` を追加する
- [ ] `npm install` を実行してロックファイルを更新する
- [ ] `server/dist/` を `.gitignore`（ルートまたは `server/.gitignore`）に追加する

### 2. ビルド設定

- [ ] `server/tsconfig.json` に `"outDir": "./dist"` と `"rootDir": "./src"` を設定する（未設定の場合）
- [ ] `server/package.json` の `scripts` に `"build": "tsc --project tsconfig.json"` を追加する
- [ ] `server/package.json` の `scripts` に `"start": "node dist/main.js"` を追加する
- [ ] `npm run build` が `server/dist/main.js` を生成することを手動確認する

### 3. `/healthz` エンドポイント追加

- [ ] `server/src/app.ts` の `createApp` 内に `app.get("/healthz", ...)` を追加する
  - 認証ミドルウェアの適用前に配置し、認証不要とする
  - レスポンス: `HTTP 200` + `{ "status": "ok" }`

### 4. `serve()` の配線

- [ ] `server/src/main.ts` に `import { serve } from "@hono/node-server"` を追加する
- [ ] 末尾の `export default app;` を `serve({ fetch: app.fetch, port: PORT }, ...)` に置き換える
- [ ] 起動ログのメッセージを `"Todica server listening on http://localhost:<PORT>"` にする

### 5. 運用ドキュメント作成

- [ ] `docs/operations/` ディレクトリを作成する
- [ ] `docs/operations/env-reference.md` を作成し、環境変数（AUTH_TOKEN / DATABASE_PATH / PORT）を説明する
- [ ] `docs/operations/deploy-guide.md` を作成し、以下を記載する
  - 前提（Node.js バージョン、npm install 手順）
  - ビルド手順（`npm run build`）
  - 起動手順（`AUTH_TOKEN=... npm start`）
  - nginx / Caddy による HTTPS reverse proxy のサンプル設定
  - AUTH_TOKEN の生成方法例（`openssl rand -hex 32` 等）

## テスト

- [ ] `/healthz` エンドポイントの単体テストを追加する（`app.request("GET", "/healthz")`）
  - HTTP 200 を返すこと
  - 認証ヘッダなしでも 200 を返すこと（認証不要の確認）
- [ ] `AUTH_TOKEN` 未設定時のプロセス終了を確認する手動テスト手順をドキュメントに記載する
- [ ] 既存の結合テストが引き続き green であることを確認する（`npm test`）

## ドキュメント

- [ ] `docs/operations/env-reference.md` 完成（環境変数リファレンス）
- [ ] `docs/operations/deploy-guide.md` 完成（デプロイガイド）

## 仕上げ

- [ ] `npm run build && AUTH_TOKEN=test npm start` でサーバが起動し、curl で `/healthz` が 200 を返すことを手動確認する
- [ ] 受け入れ基準（[spec.md](spec.md)）を全て満たすことを確認する
- [ ] レビュー依頼
