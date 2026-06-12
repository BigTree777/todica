# サーバの立ち上げ

## 前提条件

- Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証）

## 手順

### 1. 依存関係のインストール（初回のみ）

```bash
npm install
```

### 2. 環境変数の設定

リポジトリルートの `.env.example` をコピーして `.env` を作成する。
`server` の `dev` スクリプトは `node --env-file-if-exists=.env` でこの `.env` を自動読込する（`server/` 配下ではなく**ルート**に置く必要がある）。

```bash
cp .env.example .env
# エディタで .env を開いて値を埋める
```

| 変数 | デフォルト | 説明 |
|---|---|---|
| `AUTH_TOKEN` | （必須） | Bearer 認証トークン。未設定だと起動失敗（`process.exit(1)`） |
| `PORT` | `3000` | リッスンポート |
| `DATABASE_PATH` | `./todica.db` | SQLite データベースファイルのパス |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Web から呼び出すサーバ URL |
| `VITE_AUTH_TOKEN` | （空） | Web 側の Bearer トークン。`AUTH_TOKEN` と同じ値を入れる |

`.env` は `.gitignore` 済みでコミット対象外。`VITE_*` プレフィックスを持つ変数だけが Vite を通じて Web クライアントに expose される（`web/vite.config.ts` の `envDir` 設定でルートの `.env` を参照）。

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

`http://localhost:5173` で Vite 開発サーバが起動する。ブラウザ版では `.env` の `VITE_API_BASE_URL` / `VITE_AUTH_TOKEN` がそのまま使われる（SetupView は表示されない。ネイティブ版（Capacitor）では Preferences が空のとき SetupView が出てサーバ URL とトークンを入力する）。

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
