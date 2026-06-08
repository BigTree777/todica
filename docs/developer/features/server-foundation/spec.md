# 仕様: サーバ基盤 (server-foundation)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-013

## 背景 / 課題

BL-001〜BL-011 でビジネスロジック（API ハンドラ・Repository・ドメイン関数）は実装済みである。
しかし `server/src/main.ts` は `export default app` のみで、実際に HTTP リクエストをリッスンしない。
サーバプロセスとして起動できないため、クライアントからアクセスできない状態が続いている。

## ゴール / 非ゴール

- ゴール:
  - `npm start` でサーバプロセスが起動し、HTTP リクエストを受け付けられるようにする。
  - 環境変数（AUTH_TOKEN / DATABASE_PATH / PORT）の仕様をドキュメント化する。
  - reverse proxy を前提とした HTTPS 運用ガイドを提供する。
- 非ゴール:
  - サーバ自身が TLS を直接終端すること。
  - プロセス管理ツール（systemd / PM2 等）の設定。
  - コンテナ化（Docker）。
  - 負荷分散・スケーリング。

## 要件

### 機能要件

- FR-001: `npm start` を実行するとサーバプロセスが起動し、設定された PORT で HTTP リクエストを待ち受ける。
- FR-002: 起動時に `AUTH_TOKEN` 環境変数が未設定の場合、エラーメッセージを出力してプロセスを終了する（終了コード 1）。
- FR-003: 起動成功時にポート番号を含む起動ログをコンソールに出力する。
- FR-004: `GET /healthz` エンドポイントが 200 を返す（死活確認用）。
- FR-005: マイグレーションは起動時に自動適用する（既存実装を維持）。
- FR-006: `npm run build` で TypeScript を JavaScript にコンパイルし、`npm start` はそのコンパイル済み成果物を実行する。

### 非機能要件

- NFR-002（アクセス制御）: `AUTH_TOKEN` を Bearer トークンとして使用する。設定方法を運用ドキュメントに記載する。
- NFR-021（端末を選ばない）: サーバを 1 か所に立てれば任意の端末のブラウザからアクセス可能にする（HTTP で到達可能であること）。
- NFR-032（HTTPS）: 本番環境では reverse proxy（nginx / Caddy 等）で TLS を終端する前提とし、サーバ自身は HTTP で動作する。運用ガイドに手順を記載する。

## 受け入れ基準

```
シナリオ: AUTH_TOKEN 未設定で起動した場合はプロセスが異常終了する
  Given  DATABASE_PATH と PORT は設定済み
  When   AUTH_TOKEN を設定せずに npm start を実行する
  Then   "AUTH_TOKEN environment variable is required" がコンソールに出力される
  And    プロセスが終了コード 1 で終了する
  ※ このシナリオは main.ts のトップレベルコードで担保する。
     vitest からモジュールインポート時に process.exit が走るため自動テストは困難であり、
     自動テスト対象外とする（実装コードによる担保）。

シナリオ: 正常起動してリクエストを受け付けられる
  Given  AUTH_TOKEN / DATABASE_PATH / PORT がすべて設定されている
  When   npm start を実行する
  Then   "Todica server listening on http://localhost:<PORT>" がコンソールに出力される
  And    curl http://localhost:<PORT>/healthz が HTTP 200 を返す

シナリオ: Bearer 認証が機能する
  Given  サーバが起動している
  When   Authorization: Bearer <AUTH_TOKEN> ヘッダ付きで API エンドポイントにリクエストする
  Then   HTTP 200 を返す
  When   Authorization ヘッダなしで API エンドポイントにリクエストする
  Then   HTTP 401 を返す

シナリオ: PORT 環境変数でポートを変更できる
  Given  PORT=4000 を設定してサーバを起動する
  When   curl http://localhost:4000/healthz を実行する
  Then   HTTP 200 を返す

シナリオ: マイグレーションが起動時に自動適用される
  Given  DATABASE_PATH に新規ファイルパスを指定する
  When   npm start を実行する
  Then   指定パスに SQLite ファイルが作成される
  And    テーブルが正常に作成されており、API が動作する
```

## 未決事項 / 確認待ち

- なし
