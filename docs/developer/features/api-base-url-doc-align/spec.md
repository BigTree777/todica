# 仕様: VITE_API_BASE_URL の dev / 本番説明整合

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-088

## 背景 / 課題

`.env.example` は `VITE_API_BASE_URL` の dev (`http://localhost:3000`) と本番 (空文字 = 相対パス) の使い分けをコメントで明示している。一方:

- `docs/developer/setup/server.md` の環境変数表 (29 行目) は `VITE_API_BASE_URL` の既定値 `http://localhost:3000` だけを並べ, 本番で空文字にする必要があることに触れていない.
- `docs/user/quick-start.md` の A-2 セクションは `VITE_API_BASE_URL=http://localhost:3000` を出すのみで dev 想定の値であることが明示されない.

結果として読み手が dev と本番の選び方を `.env.example` まで遡らないと判断できず, 「Web は `VITE_*` をビルド時に埋め込む」原則と「サーバ dev 起動 (vite-node) は env をランタイムで読む」の違いも見えづらい.

## ゴール / 非ゴール

### ゴール

- `setup/server.md` の env 表に dev / 本番の用途差を追記する.
- `quick-start.md` A-2 に「Web の build 時埋め込み」と「サーバ dev 起動 (vite-node, env はランタイム読み)」の区別を明記し, dev 想定の値であることを示す.
- 3 文書 (`.env.example` / `setup/server.md` / `quick-start.md`) を読み比べたとき矛盾しないようにする.

### 非ゴール

- `.env.example` / `deploy-guide.md` の編集 (既に整合済).
- `VITE_API_BASE_URL` の値の変更や挙動の変更.
- 他の env 変数 (`PORT` / `DATABASE_PATH`) の説明改修.

## 要件

- **FR-1: setup/server.md の dev/本番説明**
  - env 表もしくは表直下に dev (`http://localhost:3000`) と本番 (空文字 = 相対パス) の用途差を明示する.
- **FR-2: quick-start.md A-2 の文脈分離**
  - `VITE_*` のビルド時埋め込みと サーバ dev 起動の env ランタイム読みを分けて述べ, A-2 で設定する値が dev 想定であることを明示する.
- **FR-3: 自動テスト**
  - `__tests__/docs/` 配下に grep ベースのテストを追加し, 2 文書が「本番」「相対パス」「空」のいずれかに相当する説明を含むことを検証する.

### 非機能要件

- 既存テストへの退行なし.
- 履歴表現 (「BL-088 で追記した」等) を使わず timeless に書く.

## 受け入れ基準

```
シナリオ: setup/server.md が VITE_API_BASE_URL の dev / 本番差を説明する
  Given setup/server.md を開く
  When  VITE_API_BASE_URL の説明を読む
  Then  dev で `http://localhost:3000` を使う旨と本番で空 (相対パス) を使う旨が読み取れる
```

```
シナリオ: quick-start.md A-2 が dev 想定であることを明示する
  Given quick-start.md A-2 を開く
  When  VITE_API_BASE_URL の値 (`http://localhost:3000`) の文脈を読む
  Then  dev 想定の値であることと, 本番では別値 (空 = 相対パス) を使う指示が読み取れる
```

```
シナリオ: 3 文書を読み比べて矛盾がない
  Given .env.example / setup/server.md / quick-start.md
  When  VITE_API_BASE_URL の dev / 本番値の選び方を読む
  Then  3 文書とも同じ規則 (dev = http://localhost:3000 / 本番 = 空 = 相対パス) を述べている
```
