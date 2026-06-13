## 仕様: ブラウザからのパスワード変更

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-079
- 由来要件: NFR-002 (認証) / NFR-013 (秘密情報の保護)
- 関連先行 feature:
  - [`../app-login/spec.md`](../app-login/spec.md) (sessions テーブル / Bearer 認証 / bcrypt 照合パターン)
  - [`../settings-day-boundary/spec.md`](../settings-day-boundary/spec.md) (SettingsView の UI / singleton レコード設計の参考)

## 背景 / 課題

Todica サーバの認証は bcrypt ハッシュ化したパスワードとセッショントークンによる Bearer 認証で構成されており, パスワードのハッシュは `APP_PASSWORD_HASH` 環境変数で固定されている. このため, 個人運用の Todica であってもパスワードを変更するには以下の手順が必要になる.

1. サーバホストに SSH で接続する.
2. `.env` (またはプロセス管理の env 定義) を編集し, 新しい bcrypt ハッシュを書き込む.
3. Todica サーバを再起動する.

普段使いの SaaS であれば設定画面からパスワードを変更できることが当然であり, 端末を選ばずブラウザだけで完結することがユーザー体験上の前提となる. 現状の運用は CORE-1 (「迷わず使える」) と NFR-013 (秘密情報の安全な取り扱い) の両方を毀損する負債である.

本 feature では, パスワードを DB に永続化したうえで, SettingsView 内のフォームからブラウザだけでパスワードを変更できるようにする. サーバ起動時の `APP_PASSWORD_HASH` 環境変数は DB が空のときに限って初期 seed として使われる役割に縮退する.

## ゴール / 非ゴール

### ゴール

- **パスワードハッシュを DB に永続化する**. drizzle テーブル `app_password` (単一行) に bcrypt ハッシュと更新時刻を保持する.
- **`APP_PASSWORD_HASH` 環境変数を初期 seed に縮退させる**. サーバ起動時に DB の `app_password` が空のときだけ環境変数の値で 1 行 INSERT する. DB に既に値があれば環境変数は読まない (= 値が異なっていても DB 側が正となる).
- **認証経路を DB に統合する**. `POST /api/v1/login` および `POST /api/v1/password` ハンドラは DB から取得したハッシュで bcrypt 照合する.
- **`POST /api/v1/password` を新設する**. Bearer 認証必須. `{ currentPassword, newPassword }` を受け取り, 現在パスワードと一致した場合だけ新パスワードを bcrypt でハッシュ化して DB を更新する.
- **パスワード変更成功時に全 sessions を削除する**. 他端末も含むすべてのセッションを失効させ, 自端末も次のリクエストで 401 を受けて LoginView に戻る.
- **SettingsView にパスワード変更セクションを追加する**. 現在パスワード / 新パスワード / 新パスワード確認の 3 入力 + 送信ボタンで構成する. 401 / 400 のエラーは画面内のエラー領域に表示する. 成功時は LoginView に強制遷移する.
- **クライアント側バリデーション**. 新パスワードと確認入力が一致しないときはフォーム送信を行わない. 入力が空のときも送信しない.

### 非ゴール

- **メール経由のパスワードリセット**. メール送信基盤を持たないため範囲外とする.
- **パスワード強度ポリシー (zxcvbn / 文字種 / 長さ / 履歴禁止など)**. 個人運用前提では過剰であり, 範囲外とする.
- **多要素認証**. 範囲外とする.
- **マルチユーザー対応**. 単一ユーザー前提 (ADR-0010 と同じ立場) を継続する. `app_password` は単一行 singleton で扱う.
- **パスワード履歴の保存・再利用禁止**. 範囲外とする.

## 要件

### 機能要件

- **FR-PWD-1: パスワードハッシュの DB 永続化**
  - `app_password` テーブル (1 行 singleton) に bcrypt ハッシュと更新時刻 (Unix epoch ms) を保持する.
  - `id` カラムは PRIMARY KEY で値は固定の `"current"`.
- **FR-PWD-2: 初期 seed**
  - サーバ起動時, `app_password` テーブルが空なら `APP_PASSWORD_HASH` 環境変数の値で 1 行 INSERT する.
  - `app_password` テーブルに既に行がある場合は環境変数を読まない.
- **FR-PWD-3: ログイン認証は DB を真とする**
  - `POST /api/v1/login` のパスワード照合は DB のハッシュに対して bcrypt.compare を実行する.
- **FR-PWD-4: パスワード変更 API**
  - `POST /api/v1/password` を実装する.
  - Bearer 認証必須. リクエストボディは `{ currentPassword: string, newPassword: string }`.
  - 現在パスワードを DB のハッシュと bcrypt.compare し, 不一致なら 401 を返す.
  - 一致したら新パスワードを bcrypt.hashSync (cost factor 12) でハッシュ化し, DB を UPDATE する.
  - DB 更新と同じ処理単位で sessions テーブルの全行を DELETE する.
  - 成功時は 200 OK を返す.
- **FR-PWD-5: SettingsView のフォーム**
  - 「パスワード変更」セクションを SettingsView に追加する.
  - 現在パスワード / 新パスワード / 新パスワード確認の 3 入力 + 保存ボタンを置く.
  - 新パスワードと確認入力が一致しない場合は送信前に拒否し, 画面に注意を表示する.
  - サーバから 401 / 400 が返った場合は対応するエラーメッセージを画面に表示する.
  - 成功時は LoginView に強制遷移する (自端末のセッションも失効しているため, 以後の API は 401 となる前提).
- **FR-PWD-6: クライアントモジュール**
  - `web/src/auth/password-client.ts` を新設し, `changePassword(baseUrl, token, currentPassword, newPassword)` を提供する.

### 非機能要件

- **NFR-PWD-1: セキュリティ**
  - パスワード平文を永続化しない. 必ず bcrypt のハッシュとして DB に保存する.
  - bcrypt の cost factor は 12 とする.
  - パスワードを含むリクエストボディはサーバログに出力しない.
- **NFR-PWD-2: 認証**
  - `POST /api/v1/password` は Bearer 認証必須. 未認証は 401 を返す.
- **NFR-PWD-3: アクセシビリティ (a11y)**
  - 「パスワード変更」セクションには `aria-label` を付与する.
  - 各パスワード入力には適切な `autocomplete` 属性 (現在パスワードは `current-password`, 新パスワードと確認入力は `new-password`) を付与する.
  - エラー表示領域は `role="alert"` で示す.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. Gherkin の Given/When/Then で表現する.

### AC-1: SettingsView にパスワード変更セクションが表示される (FR-PWD-5)

```
シナリオ: SettingsView を開くとパスワード変更フォームが表示される
  Given サーバモードで Bearer 認証済みのユーザー
  When  ユーザーが /settings を開く
  Then  「パスワード変更」セクションが描画される
  And   現在パスワード / 新パスワード / 新パスワード確認の 3 入力と保存ボタンが存在する
```

### AC-2: 正しい現在パスワード + 一致する新パスワード 2 入力で 200 を返し DB が更新される (FR-PWD-4)

```
シナリオ: 正しい入力で送信するとパスワードが更新される
  Given DB の app_password ハッシュは "P0" を表す
  And   Bearer 認証済みのユーザー
  When  POST /api/v1/password に { currentPassword: "P0", newPassword: "P1" } を送る
  Then  200 OK が返る
  And   DB の app_password.password_hash は "P1" を bcrypt.compare で検証可能なハッシュに更新されている
  And   DB の app_password.updated_at は呼び出し時刻 (epoch ms) で更新されている
```

### AC-3: 誤った現在パスワードでは 401 を返し DB を更新しない (FR-PWD-4)

```
シナリオ: 誤った現在パスワードでは更新されない
  Given DB の app_password ハッシュは "P0" を表す
  And   Bearer 認証済みのユーザー
  When  POST /api/v1/password に { currentPassword: "WRONG", newPassword: "P1" } を送る
  Then  401 INVALID_PASSWORD が返る
  And   DB の app_password.password_hash は "P0" を検証可能な状態のまま変わらない
  And   sessions テーブルの行は削除されない
```

### AC-4: クライアント側で新パスワード != 確認入力ならフォームが送信されない (FR-PWD-5)

```
シナリオ: 新パスワードと確認入力が一致しないと送信できない
  Given SettingsView のパスワード変更フォームが表示されている
  And   現在パスワードに "P0" を入力済み
  When  ユーザーが新パスワードに "A" / 確認入力に "B" を入れて保存ボタンを押す
  Then  POST /api/v1/password は呼ばれない
  And   画面に「新パスワードと確認入力が一致しません」相当のエラーが表示される
```

### AC-5: 必須項目が空の場合はフォームが送信されない (FR-PWD-5)

```
シナリオ: 入力が空のときは送信できない
  Given SettingsView のパスワード変更フォームが表示されている
  When  3 入力のいずれかが空のまま保存ボタンを押す
  Then  POST /api/v1/password は呼ばれない
```

### AC-6: パスワード変更成功時に全 sessions が削除され他端末のリクエストが 401 になる (FR-PWD-4)

```
シナリオ: 全端末のセッションが失効する
  Given 端末 A と端末 B がそれぞれ別の token で認証済み
  And   DB の app_password ハッシュは "P0" を表す
  When  端末 A で POST /api/v1/password に { currentPassword: "P0", newPassword: "P1" } を送る
  Then  200 OK が返る
  And   その後の端末 B からの GET /api/v1/today は 401 UNAUTHORIZED を返す
  And   その後の端末 A からの GET /api/v1/today も 401 UNAUTHORIZED を返す
```

### AC-7: パスワード変更成功時は LoginView に強制遷移する (FR-PWD-5)

```
シナリオ: 成功時はクライアントが LoginView に戻る
  Given SettingsView でパスワード変更フォームの全入力が有効値で埋まっている
  When  ユーザーが保存ボタンを押し, サーバが 200 OK を返す
  Then  クライアントは保持していた token を破棄する
  And   画面は LoginView (ログインフォーム) に遷移する
```

### AC-8: DB が空での初回起動は APP_PASSWORD_HASH 環境変数で seed される (FR-PWD-2)

```
シナリオ: DB 空のときは環境変数が seed として使われる
  Given app_password テーブルに行が存在しない
  And   APP_PASSWORD_HASH 環境変数に "P0" の bcrypt ハッシュが設定されている
  When  サーバを起動する
  Then  app_password テーブルに 1 行 INSERT される
  And   その password_hash は "P0" を bcrypt.compare で検証可能である
```

### AC-9: DB に値があれば環境変数は読まれない (FR-PWD-2)

```
シナリオ: 既存の DB 値を起動時に上書きしない
  Given app_password テーブルに password_hash = bcrypt("P_DB") の行が存在する
  And   APP_PASSWORD_HASH 環境変数に bcrypt("P_ENV") が設定されている
  When  サーバを起動する
  Then  app_password テーブルの password_hash は bcrypt("P_DB") のまま変わらない
  And   POST /api/v1/login は { password: "P_DB" } で 200, { password: "P_ENV" } で 401 を返す
```

### AC-10: 新しいパスワードでログインできる (FR-PWD-3 / FR-PWD-4)

```
シナリオ: 変更後の新パスワードでログインできる
  Given AC-2 のとおりパスワードを "P0" から "P1" に変更した直後
  When  POST /api/v1/login に { password: "P1" } を送る
  Then  200 OK が返り token と expiresAt が含まれる
```

### AC-11: 未認証では POST /api/v1/password は 401 (NFR-PWD-2)

```
シナリオ: 認証なしの POST /api/v1/password は 401
  Given Authorization ヘッダを付けない
  When  POST /api/v1/password に { currentPassword: "P0", newPassword: "P1" } を送る
  Then  401 UNAUTHORIZED が返る
  And   DB の app_password.password_hash は変わらない
```

### AC-12: リクエストボディの形式不正は 400 (FR-PWD-4)

```
シナリオ: currentPassword または newPassword が文字列でない場合は 400
  Given Bearer 認証済みのユーザー
  When  POST /api/v1/password に { currentPassword: "P0" } を送る (newPassword 欠落)
  Then  400 INVALID_REQUEST_BODY が返る
  And   DB の app_password.password_hash は変わらない
```

## 未決事項 / 確認待ち

なし.
