# サーバの立ち上げ

## 前提条件

- Node.js 20 以上

## 手順

### 1. 依存関係のインストール（初回のみ）

```bash
npm install
```

### 2. 環境変数の設定

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AUTH_TOKEN` | `""` | Bearer 認証トークン。空だと認証なしで動作する |
| `PORT` | `3000` | リッスンポート |
| `DATABASE_PATH` | `./todica.db` | SQLite データベースファイルのパス |

```bash
export AUTH_TOKEN=your-secret-token
```

### 3. サーバの起動

```bash
npm run dev -w server
```

起動に成功すると `http://localhost:3000` でアクセスできる。マイグレーションは起動時に自動適用される。

## Web クライアントと同時に動かす

別ターミナルで以下を実行する。

```bash
npm run dev -w web
```

`http://localhost:5173` で Vite 開発サーバが起動する。初回アクセス時に SetupView が表示されるので、サーバ URL（`http://localhost:3000`）と `AUTH_TOKEN` に設定したトークンを入力する。

## 動作確認

```bash
curl http://localhost:3000/healthz
# → 200 OK
```

認証付きで API を叩く場合:

```bash
curl -H "Authorization: Bearer your-secret-token" http://localhost:3000/api/v1/tasks
```

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `401 Unauthorized` | `AUTH_TOKEN` が一致していない | `Authorization: Bearer <AUTH_TOKEN>` ヘッダを確認する |
| ポートが既に使用中 | 別プロセスが 3000 番を使用 | `PORT=3001` などに変更して起動する |
| DB エラーで起動失敗 | マイグレーション SQL に問題がある | `server/drizzle/` 以下の SQL ファイルを確認する |
