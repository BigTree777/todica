# Todica

タスク・プロジェクト・ルーティンを一元管理する PWA 対応のタスク管理アプリです。Android にも対応しています。

## 主要機能

- タスク管理: 締め切り・優先度付きのタスクを作成・管理
- プロジェクト: 複数タスクをプロジェクト単位でまとめて管理
- ルーティン: 繰り返しタスクを定期スケジュールで管理
- PWA 対応: ブラウザからインストール可能なプログレッシブウェブアプリ
- Android 対応: Capacitor を利用したネイティブ Android アプリのビルド

## セットアップ

Node.js 24.x （手元の動作確認バージョン）が必要です。

```bash
git clone https://github.com/BigTree777/todica.git
cd todica
npm install
```

## サーバの起動

認証はアプリ内ログイン (`POST /api/v1/login`) で行います。サーバはパスワードenvなしで起動できます。

```bash
npm start -w server
```

その後 Web UI を開き、初期パスワード設定画面でパスワードを登録します。設定成功時にセッショントークンが発行され、以降の API 呼び出しは Bearer 認証で透過的に動作します。

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
| 運用者 | [`docs/user/deploy-guide.md`](docs/user/deploy-guide.md) |
| プライバシーポリシー | [`docs/privacy-policy.md`](docs/privacy-policy.md) |

## ライセンス

[MIT](./LICENSE)
