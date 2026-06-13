# クイックスタート

> Todica を最短で起動して動作確認するための手順。

VPS や本番デプロイは [デプロイガイド](deploy-guide.md) を参照。本書は **手元で動かして触ってみる**ことに絞る。

選べる動作確認の形は 2 つ：

- **A. Web ブラウザで動かす** — PC で完結。サーバ + ブラウザ
- **B. Android で動かす（ローカルモード）** — サーバ不要。端末内のみでデータを持つ最短形

## 前提

- Node.js 24.x（手元の動作確認バージョン。他バージョンは未検証。`node -v` で確認）
- Git
- （B のみ）Android Studio + Android SDK + JDK 11 以上、USB デバッグを有効にした Android 端末

---

## A. Web ブラウザで動かす

### A-1. リポジトリ取得と依存インストール

```bash
git clone https://github.com/BigTree777/todica.git
cd todica
npm install
```

### A-2. `.env` を作る

```bash
cp .env.example .env
```

```env
VITE_API_BASE_URL=http://localhost:3000
```

> Web クライアントは **ビルド時に `VITE_*` を埋め込む**ため、`VITE_API_BASE_URL` は次の step より前に決めておく。
> パスワードと認証トークンはビルド時に埋め込まれない。

### A-3. サーバを起動する

```bash
npm run dev -w server
```

`Todica server listening on http://localhost:3000` と表示されればサーバ起動成功。

別ターミナルで動作確認：

```bash
curl http://localhost:3000/healthz
# → {"status":"ok"}
```

### A-4. Web クライアントを起動する

別ターミナルで：

```bash
npm run dev -w web
```

`Local:   http://localhost:5173/` と表示される。

### A-5. ブラウザで初期パスワードを設定する

`http://localhost:5173` を開く。DB が空の状態なら **初期パスワード設定** 画面が表示される：

1. 1 つ目の入力欄に新しいパスワード
2. 2 つ目の入力欄に確認のため同じパスワード
3. 「設定する」を押す

成功すると bcrypt ハッシュが DB の `app_password` テーブルに保存され、そのままセッショントークンが発行されて自動ログインされる。今日のタスク一覧（最初は空）が表示されれば成功。

2 回目以降のアクセスでは LoginView が表示されるので、設定したパスワードでログインする。

> **`http://localhost:3000` ではない**。3000 は API サーバで、ブラウザで開いても UI は出ない。

> ログインしたセッショントークンは `localStorage` に保存され、約 30 日間は再ログイン不要。パスワード変更は設定画面の「パスワード変更」、ログアウトは「ログアウト」ボタンから。

---

## B. Android で動かす（ローカルモード）

サーバを立てずに、端末内のみでデータを持つ形。`.env` の設定も不要。

### B-1. リポジトリ取得と依存インストール

A-1 を済ませていればスキップ。

```bash
git clone https://github.com/BigTree777/todica.git
cd todica
npm install
```

### B-2. Web → Android assets に同期

```bash
npm run android:sync
```

`web/dist/` をビルドして `android/app/src/main/assets/public/` に同期する。

### B-3. 端末にインストール

USB 接続した端末に debug ビルドをインストール：

```bash
cd android
./gradlew installDebug
```

または `android/` ディレクトリを Android Studio で開いて Run でも良い。

### B-4. アプリを起動

ホーム画面の **Todica** を開く。初回起動の「サーバ接続設定」画面で **「ローカルモードで使う」** を選ぶ。以降は端末内のデータベースに直接読み書きする（あとから設定画面でサーバ接続モードに切り替えも可能）。

> Android からサーバに繋ぎたい場合は、HTTPS でサーバを公開するか、cleartext を許可する追加設定が必要。詳しくは [FAQ](faq.md) を参照。

---

## 触ってみる

1. プロジェクトを作る（任意。単発タスクのみでも可）
2. タスクを足す（期限は既定で今日、優先度は最優先 / 普通 / 後回しから選択）
3. 今日のタスクから 1 つを選んで「現在のタスク」にすると、それだけが大きく表示される
4. 完了アクションで消化すると、自動で次のタスクに進む

## 次のステップ

- 本番サーバを VPS / 自宅サーバに立てる: [デプロイガイド](deploy-guide.md)
- 機能の細かい挙動: [`index.md`](index.md) の「基本ワークフロー」
- よくあるつまずき: [`faq.md`](faq.md)
