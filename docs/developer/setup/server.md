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
| `APP_PASSWORD_HASH` | （必須） | アプリログインパスワードの bcrypt ハッシュ (BL-074)。未設定だと起動失敗（`process.exit(1)`）。生成: `node -e "console.log(require('bcrypt').hashSync('your-password', 12))"` |
| `PORT` | `3000` | リッスンポート |
| `DATABASE_PATH` | `./todica.db` | SQLite データベースファイルのパス |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Web から呼び出すサーバ URL |

`.env` は `.gitignore` 済みでコミット対象外。`VITE_*` プレフィックスを持つ変数だけが Vite を通じて Web クライアントに expose される（`web/vite.config.ts` の `envDir` 設定でルートの `.env` を参照）。

BL-074 以降、Bearer トークンはビルド時に埋め込まない。アプリ起動後に LoginView でパスワード（`APP_PASSWORD_HASH` の元の平文）を入力し、`POST /api/v1/login` で opaque token を取得する。

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

`http://localhost:5173` で Vite 開発サーバが起動する。ブラウザ版では `.env` の `VITE_API_BASE_URL` がそのまま使われ、起動時に LoginView が表示される（パスワード入力後に `/today` へ遷移）。ネイティブ版（Capacitor）では Preferences が空のとき SetupView が出てサーバ URL を入力 → `/healthz` 検証 → LoginView でパスワード入力、の 2 ステップとなる (BL-074 AC-6)。

## 動作確認

```bash
curl http://localhost:3000/healthz
# → 200 OK
```

認証付きで API を叩く場合 (BL-074):

```bash
# 1. login して token を取得
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your-password"}' | jq -r '.token')

# 2. 取得した token を Bearer に乗せて API を叩く
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/tasks
```

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `401 Unauthorized` | `/api/v1/login` で取得した token が無効/期限切れ | 再度 `/api/v1/login` を叩いて token を取得し直す |
| `APP_PASSWORD_HASH environment variable is required` | `.env` 未設定 | `.env` に `APP_PASSWORD_HASH=$2b$12$...` を設定する |
| ポートが既に使用中 | 別プロセスが 3000 番を使用 | `PORT=3001` などに変更して起動する |
| DB エラーで起動失敗 | マイグレーション SQL に問題がある | `server/drizzle/` 以下の SQL ファイルを確認する |
