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

```bash
export AUTH_TOKEN=your-secret-token
npm start -w server
```

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
| 開発者 | [`docs/developer/`](docs/developer/) |

## ライセンス

[MIT](./LICENSE)
