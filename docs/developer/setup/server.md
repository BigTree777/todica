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
| `PORT` | `3000` | リッスンポート |
| `DATABASE_PATH` | `./todica.db` | SQLite データベースファイルのパス |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Web から呼び出すサーバ URL |

`VITE_API_BASE_URL` は構成で値が変わる。dev (Web `:5173` と API `:3000` が別オリジン) では `http://localhost:3000` を指定する。本番 (nginx 等で Web と API を同一ドメイン配信する構成) では空文字にして相対パス `/api/...` で同一オリジンに解決させる。`.env.example` のコメントが正本。

`.env` は `.gitignore` 済みでコミット対象外。`VITE_*` プレフィックスを持つ変数だけが Vite を通じて Web クライアントに expose される（`web/vite.config.ts` の `envDir` 設定でルートの `.env` を参照）。

Bearer トークンはビルド時に埋め込まれない。DB が空の初回アクセスではブラウザからパスワードを登録し、同時に opaque token を取得する。以後のログインとパスワード変更には DB の値が使われる。

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

`http://localhost:5173` で Vite 開発サーバが起動する。DB が空なら初期パスワード設定画面、設定済みなら LoginView が表示される。ネイティブ版（Capacitor）でも SetupView の URL 検証後に同じ分岐へ進む。

## 動作確認

```bash
curl http://localhost:3000/healthz
# → 200 OK
```

認証付きで API を叩く場合:

```bash
# DB が空なら最初にパスワードを設定して token を取得
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/password \
  -H "Content-Type: application/json" \
  -d '{"newPassword":"your-password"}' | jq -r '.token')

# 設定済みなら login して token を取得
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
| `/api/v1/login` が `412 INITIAL_SETUP_REQUIRED` | DB にパスワードが未登録 | ブラウザの初期パスワード設定画面から登録する |
| ポートが既に使用中 | 別プロセスが 3000 番を使用 | `PORT=3001` などに変更して起動する |
| DB エラーで起動失敗 | マイグレーション SQL に問題がある | `server/drizzle/` 以下の SQL ファイルを確認する |
