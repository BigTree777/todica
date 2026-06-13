# 仕様: env 廃止 + ブラウザからの初期パスワード設定の必須化

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-080
- 由来要件: NFR-002 (認証) / NFR-013 (秘密情報の保護)
- 関連先行 feature:
  - [`../app-login/spec.md`](../app-login/spec.md) (sessions テーブル / Bearer 認証 / login フロー)
  - [`../password-change/spec.md`](../password-change/spec.md) (`app_password` テーブル / `PasswordRepository` / `POST /api/v1/password`)

## 背景 / 課題

サーバ起動時に `APP_PASSWORD_HASH` 環境変数を読み, DB の `app_password` が空のときだけそれを seed として使う構成が残っている. この構成は次の負債を抱える.

- VPS デプロイ時に `node -e "console.log(require('bcrypt').hashSync('your-password', 12))"` を SSH 越しに叩いて `.env` に書き込む手順が必須となり, 「ブラウザだけでセットアップを完結させる」体験を阻害する.
- Play Store 配布や Capacitor 経由のサーバモード初回接続でも, デプロイ済みサーバ側に env を仕込んでおく必要があり, 配布フローと運用フローが疎結合にならない.
- パスワードは DB 永続化 (`app_password` テーブル) + SettingsView からの変更経路に統合済みで, env がカバーする領域は「初回 seed」だけに縮退している. 初回 seed という用途のためだけに env と bcrypt CLI を残し続ける合理性が失われている.

本 feature では `APP_PASSWORD_HASH` env と `password-seed.ts` を完全に廃止し, 初回ブラウザアクセス時に「初期パスワード設定モード」へ自動遷移する経路に置き換える. ユーザーは Web (または Capacitor アプリ) で新パスワードを 2 度入力するだけで初期化を完了でき, 完了時にはそのまま自動ログインして `/today` に到達する.

## ゴール / 非ゴール

### ゴール

- **`APP_PASSWORD_HASH` env と `password-seed.ts` を完全に削除する**. サーバコードベース全体で `APP_PASSWORD_HASH` の参照は 0 となる.
- **サーバは env なしで正常起動する**. DB の `app_password` が空でも起動失敗しない. 初期 seed や `process.exit(1)` 経路は撤去する.
- **`GET /api/v1/auth-state` を新設する**. 認証不要で `{ initialized: boolean }` を返し, クライアントが初期化済みかどうかを起動時に判定できる.
- **`POST /api/v1/password` を 2 モードに分岐させる**.
  - DB 空のとき: 認証不要 + `currentPassword` 不要で受理し, 新ハッシュを保存して自動ログイン token を返す.
  - DB ありのとき: 既存どおり Bearer 認証必須 + `currentPassword` 必須.
- **`POST /api/v1/login` は DB 空のときに 412 `INITIAL_SETUP_REQUIRED` を返す**. クライアントが LoginView を出すべき状況と初期設定モードを出すべき状況を区別できるようにする.
- **Web 起動時に `auth-state` を確認し, 未初期化なら `InitialSetupView` を表示する**. LoginView は経由しない. 新パスワード入力 + 確認入力の 2 入力 + 送信ボタンで構成する.
- **`InitialSetupView` の送信成功で自動ログインし `/today` に遷移する**. サーバが返した token を保存して以降の API 呼び出しに使う.
- **既存ユーザー (DB に `app_password` が存在する) の体験は変えない**. 起動時に `auth-state` が `initialized: true` を返し, 従来どおり token 有無で LoginView または本体が表示される.
- **deploy-guide / quick-start / setup/server / faq などの運用ドキュメントを env なし前提に書き換える**. 「サーバを起動した後, 最初に URL に辿り着いた人が初期パスワード設定者になる」というセキュリティ上の注意も併記する.

### 非ゴール

- **メール経由のパスワードリセット**. メール送信基盤を持たないため範囲外.
- **パスワード強度ポリシー (zxcvbn / 文字種 / 長さ / 履歴禁止など)**. 個人運用前提では過剰なため範囲外.
- **多要素認証**. 範囲外.
- **マルチユーザー対応**. 単一ユーザー前提を継続する. `app_password` は引き続き singleton.
- **パスワード忘れ時の自動回復経路**. SSH で DB に入り `app_password` テーブルの行を `DELETE` し, 再度ブラウザから初期設定モードに入る運用を維持する. アプリ側に「パスワードを忘れた」リンクは設けない.

## 要件

### 機能要件

- **FR-IPS-1: env と seed の完全廃止**
  - `APP_PASSWORD_HASH` 環境変数を読むコードを 0 にする (`grep` で 0 hit).
  - `server/src/password-seed.ts` を削除する.
  - サーバ起動時に DB が空であっても `process.exit(1)` しない. env が無い状態を「未初期化」と扱い, アプリは起動成功する.
- **FR-IPS-2: `GET /api/v1/auth-state`**
  - 認証不要で受け付ける (authMiddleware の素通しパスに追加する).
  - `await passwordRepository.getHash()` の結果が `null` でなければ `{ initialized: true }`, `null` であれば `{ initialized: false }` を返す.
  - 常に 200 OK を返す. エラーケース (DB 読み取り失敗) は 500 INTERNAL_ERROR.
- **FR-IPS-3: `POST /api/v1/password` の 2 モード化**
  - DB 空のとき (= `getHash()` が `null`):
    - 認証不要で受理する.
    - リクエストボディは `{ newPassword: string }`. `currentPassword` は受理しても無視する.
    - 新ハッシュを `bcrypt.hashSync(newPassword, 12)` で生成して `setHash` で保存する.
    - 同じ呼び出しの中で auto-login token を発行し sessions に INSERT する. レスポンスボディは `{ token: string, expiresAt: number }`.
    - ステータスコードは 200 OK.
  - DB ありのとき (= `getHash()` が非 `null`):
    - 既存どおり Bearer 認証必須.
    - リクエストボディは `{ currentPassword: string, newPassword: string }`.
    - 振る舞いは既存仕様 (FR-PWD-4) を維持し, 成功時は 200 OK と空ボディを返す.
- **FR-IPS-4: `POST /api/v1/login` の 412 分岐**
  - DB 空のとき (= `getHash()` が `null`): リクエストボディの内容に関わらず 412 INITIAL_SETUP_REQUIRED を返す. token は発行しない.
  - DB ありのとき: 既存どおり 200 / 401 / 400 / 500 を返す.
- **FR-IPS-5: Web クライアントモジュールの追加**
  - `web/src/auth/auth-state-client.ts` を新設し, `fetchAuthState(baseUrl: string): Promise<{ initialized: boolean }>` を提供する.
  - `web/src/auth/password-client.ts` に `setupInitialPassword(baseUrl: string, newPassword: string): Promise<{ token: string; expiresAt: number }>` を追加する. 認証ヘッダなしで `POST /api/v1/password` を叩き, 200 を resolve, 400 を `BadRequestError`, network を `NetworkError`, その他を `Error` として扱う.
- **FR-IPS-6: `InitialSetupView` の新設**
  - `web/src/ui/initial-setup-view/initial-setup-view.tsx` を新設する.
  - 新パスワード入力 + 確認入力 + 送信ボタンの 3 要素のみで構成する. 現在パスワード欄は持たない.
  - 送信前バリデーション: 2 入力のいずれかが空なら送信しない. 一致しないなら送信せずエラー表示.
  - 送信時は `setupInitialPassword(baseUrl, newPassword)` を await する.
  - 成功時は親から渡された `onSetupSuccess({ token, expiresAt })` コールバックを呼ぶ.
  - 失敗時は対応するエラーメッセージを画面に表示する.
- **FR-IPS-7: 起動時分岐の組み込み**
  - Web 起動 (`web/src/main.tsx` の `App` 初期化経路) で `fetchAuthState(baseUrl)` を 1 回呼ぶ.
  - `initialized: false` のときは `InitialSetupView` を全画面で表示する. LoginView は表示しない. 既存の `currentMode === "server" && !token` 条件で LoginView に落ちる経路よりも先に分岐する.
  - `InitialSetupView` の `onSetupSuccess` で受け取った token を `authStorage` に保存し, ナビゲーションを `/today` に強制遷移させる.
  - `initialized: true` のときは従来どおり token の有無で LoginView / 本体に分岐する.
- **FR-IPS-8: Capacitor SetupView 経路の整合**
  - Capacitor (Android) のサーバモードで `SetupView` (サーバ URL + `/healthz` 検証) を抜けた後の分岐も, `auth-state` の結果に応じて `InitialSetupView` または `LoginView` に振り分ける.
  - Capacitor 側のローカルモード (`mode === "local"`) は本 feature の対象外とし, 従来どおり認証なしで動く.

### 非機能要件

- **NFR-IPS-1: セキュリティ警告のドキュメント化**
  - 「サーバを起動した後, 最初に URL に辿り着いた人が初期パスワード設定者になる」性質を `docs/user/deploy-guide.md` のセットアップ手順に明記する.
  - 推奨運用: デプロイ完了直後に運用者本人が即座にブラウザで `/` を開き, 初期パスワードを設定する.
- **NFR-IPS-2: 初期設定 API のレート制限なし**
  - DB 空の状態は単一の race window でしか起こり得ないため, 初期設定モードの `POST /api/v1/password` には特別なレート制限を設けない. アプリ側の追加対策はせず, ドキュメント注意のみで対処する.
- **NFR-IPS-3: アクセシビリティ (a11y)**
  - `InitialSetupView` の DOM は `<main>` を持ち, タイトルを `<h1>` で示す.
  - 新パスワード / 確認入力の各 input は `<label htmlFor>` で関連付け, `type="password"` + `autocomplete="new-password"` を付与する.
  - エラー領域は `role="alert"` + `aria-live="assertive"`.
  - input には `aria-invalid` / `aria-describedby` でエラーと関連付ける.
  - submit 中は `aria-busy="true"` で二重押下を抑止する.
  - 初回マウントで新パスワード input に autofocus する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. Gherkin の Given/When/Then で表現する.

### AC-1: env なしでサーバが正常起動する (FR-IPS-1)

```
シナリオ: APP_PASSWORD_HASH 環境変数なしでサーバ起動が成功する
  Given APP_PASSWORD_HASH 環境変数が定義されていない
  And   app_password テーブルが空である
  When  サーバプロセスを起動する
  Then  プロセスは exit せず /healthz が 200 OK を返す状態に到達する
  And   ログに seed 失敗の error は出ない
```

### AC-2: コードベースから APP_PASSWORD_HASH の参照が消える (FR-IPS-1)

```
シナリオ: コードベースに APP_PASSWORD_HASH の参照が残っていない
  Given リポジトリの server / web ソースツリー
  When  "APP_PASSWORD_HASH" を grep する
  Then  ソースコード (.ts / .tsx) からのヒット数は 0 である
  And   server/src/password-seed.ts は存在しない
```

### AC-3: DB 空のとき GET /api/v1/auth-state は { initialized: false } を返す (FR-IPS-2)

```
シナリオ: 未初期化サーバの auth-state
  Given app_password テーブルが空である
  When  Authorization ヘッダなしで GET /api/v1/auth-state を呼ぶ
  Then  200 OK が返る
  And   ボディは { "initialized": false } である
```

### AC-4: DB ありのとき GET /api/v1/auth-state は { initialized: true } を返す (FR-IPS-2)

```
シナリオ: 初期化済みサーバの auth-state
  Given app_password テーブルに password_hash の行が 1 件ある
  When  Authorization ヘッダなしで GET /api/v1/auth-state を呼ぶ
  Then  200 OK が返る
  And   ボディは { "initialized": true } である
```

### AC-5: DB 空のとき POST /api/v1/password は currentPassword 不要 + 認証不要で受理する (FR-IPS-3)

```
シナリオ: 初期設定モードでのパスワード作成
  Given app_password テーブルが空である
  When  Authorization ヘッダなしで POST /api/v1/password に { "newPassword": "P0" } を送る
  Then  200 OK が返る
  And   ボディには token と expiresAt が含まれる
  And   app_password テーブルに 1 行 INSERT され, その password_hash は "P0" を bcrypt.compare で検証可能である
  And   sessions テーブルにレスポンスの token が 1 行 INSERT されている
```

### AC-6: DB ありのとき POST /api/v1/password は currentPassword 必須 + 認証必須 (FR-IPS-3)

```
シナリオ: 通常時のパスワード変更は従来仕様を維持する
  Given app_password テーブルに password_hash が存在する
  When  Authorization ヘッダなしで POST /api/v1/password に { "newPassword": "P1" } を送る
  Then  401 UNAUTHORIZED が返る
  And   app_password テーブルの password_hash は変わらない
```

### AC-7: DB 空のとき POST /api/v1/login は 412 INITIAL_SETUP_REQUIRED を返す (FR-IPS-4)

```
シナリオ: 未初期化サーバへの login 試行は 412 を返す
  Given app_password テーブルが空である
  When  POST /api/v1/login に { "password": "anything" } を送る
  Then  412 INITIAL_SETUP_REQUIRED が返る
  And   sessions テーブルには行が INSERT されない
```

### AC-8: 起動時に未初期化なら InitialSetupView が表示される (FR-IPS-7)

```
シナリオ: 未初期化サーバへのブラウザアクセス
  Given app_password テーブルが空である
  And   ブラウザに保存された token は無い
  When  ユーザーが Web クライアントを開く
  Then  画面に InitialSetupView (タイトル / 新パスワード入力 / 確認入力 / 送信ボタン) が表示される
  And   LoginView は表示されない
```

### AC-9: InitialSetupView の送信成功で自動ログインし /today へ遷移する (FR-IPS-6 / FR-IPS-7)

```
シナリオ: 初期設定完了で /today に到達する
  Given InitialSetupView が表示されている
  And   新パスワードと確認入力に同じ値 "P0" が入っている
  When  ユーザーが送信ボタンを押す
  And   サーバが 200 OK と { token, expiresAt } を返す
  Then  クライアントは受け取った token を auth-storage に保存する
  And   画面遷移先は /today である
  And   LoginView は経由しない
```

### AC-10: 新パスワードと確認入力が一致しないとき送信されない (FR-IPS-6)

```
シナリオ: InitialSetupView でのクライアント側バリデーション
  Given InitialSetupView が表示されている
  When  新パスワードに "A" / 確認入力に "B" を入れて送信ボタンを押す
  Then  POST /api/v1/password は呼ばれない
  And   画面に「新パスワードと確認入力が一致しません」相当のエラーが表示される
```

### AC-11: 必須項目が空のときは送信されない (FR-IPS-6)

```
シナリオ: 入力が空のときは送信できない
  Given InitialSetupView が表示されている
  When  2 入力のいずれかが空のまま送信ボタンを押す
  Then  POST /api/v1/password は呼ばれない
```

### AC-12: 既存ユーザーの体験は変わらない (FR-IPS-7)

```
シナリオ: 初期化済みサーバへのブラウザアクセス
  Given app_password テーブルに password_hash が存在する
  And   ブラウザに保存された token は無い
  When  ユーザーが Web クライアントを開く
  Then  画面に LoginView が表示される
  And   InitialSetupView は表示されない
```

### AC-13: 既存ユーザーが既存 token を持っているときは本体が直接表示される (FR-IPS-7)

```
シナリオ: 初期化済みサーバ + 既存 token
  Given app_password テーブルに password_hash が存在する
  And   ブラウザに有効な token が保存されている
  When  ユーザーが Web クライアントを開く
  Then  画面遷移先は /today である
  And   LoginView も InitialSetupView も表示されない
```

### AC-14: Capacitor SetupView 完了後の経路で auth-state により分岐する (FR-IPS-8)

```
シナリオ: Capacitor サーバモードでの SetupView 完了後の振り分け
  Given Capacitor (Android) アプリで mode = "server" を選択している
  And   ユーザーが SetupView でサーバ URL を入力し /healthz 検証に成功した
  When  クライアントが続けて GET /api/v1/auth-state を呼ぶ
  Then  initialized: false なら次画面は InitialSetupView である
  And   initialized: true かつ token 未保持なら次画面は LoginView である
```

### AC-15: デプロイ後の access window のリスクが deploy-guide に明記される (NFR-IPS-1)

```
シナリオ: deploy-guide にセキュリティ注意が記載されている
  Given リポジトリの docs/user/deploy-guide.md
  When  本 feature 完了時点のドキュメントを読む
  Then  「サーバ起動後, 最初に URL に到達したユーザーが初期パスワード設定者となる」旨の注意が明記されている
  And   推奨運用 (デプロイ直後に運用者本人が即座にブラウザでアクセスする) も併記されている
```

## 未決事項 / 確認待ち

なし.
