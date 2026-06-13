# Todica

タスク・プロジェクト・ルーティンを一元管理する PWA 対応のタスク管理アプリです。Android にも対応しています。

## 主要機能

- タスク管理: 締め切り・優先度付きのタスクを作成・管理
- プロジェクト: 複数タスクをプロジェクト単位でまとめて管理
- ルーティン: 繰り返しタスクを定期スケジュールで管理
- PWA 対応: ブラウザからインストール可能なプログレッシブウェブアプリ
- Android 対応: Capacitor を利用したネイティブ Android アプリのビルド

## セットアップ

Node.js 20 以上が必要です。

```bash
git clone https://github.com/BigTree777/todica.git
cd todica
npm install
```

## サーバの起動

BL-074 以降は固定トークン (`AUTH_TOKEN`) を廃止し, アプリ内ログイン (`POST /api/v1/login`) に切り替えました.
サーバ起動時はパスワードの bcrypt ハッシュを `APP_PASSWORD_HASH` 環境変数で渡します.

```bash
# 1. ハッシュを生成 (cost factor は本番 12 を推奨)
export APP_PASSWORD_HASH="$(node -e "console.log(require('bcrypt').hashSync('your-password', 12))")"

# 2. サーバ起動
npm start -w server
```

その後 Web UI を開くとログイン画面が出ます. `your-password` (上記で指定した平文) を入力すると `/api/v1/login` でセッショントークンが発行され, 以降の API 呼び出しは Bearer 認証で透過的に動作します.

## Web クライアントのビルド

```bash
npm run build -w web
```

## Android ビルド

```bash
npm run android:bundle
```

## ドキュメント

| 対象 | 入口 |
| --- | --- |
| ユーザー | [`docs/user/`](docs/user/index.md) |
| 開発者 | [`docs/developer/`](docs/developer/index.md) |
| 運用者 | [`docs/operations/deploy-guide.md`](docs/operations/deploy-guide.md) |
| プライバシーポリシー | [`docs/privacy-policy.md`](docs/privacy-policy.md) |

## ライセンス

[MIT](./LICENSE)
