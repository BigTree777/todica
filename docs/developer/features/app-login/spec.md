# 仕様: アプリ内パスワードログイン

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-074

## 背景 / 課題

Web クライアントは `VITE_AUTH_TOKEN` をビルド時に JS bundle に平文埋め込みで配信している. そのため URL を知る第三者は, ブラウザで開くだけで bundle からトークンを抽出して API にも UI にも到達できる. Certificate Transparency ログから新規発行ドメインが第三者に発見される経路が現実的な脅威で,「URL の秘匿」だけが防御である現状は認証として成立していない.

既存 Bearer 認証 (`server/src/app.ts:120` の authMiddleware) は「ブラウザを経由しない直接アクセス (curl / CSRF / クローラ)」を遮断する目的では機能しているが,「ブラウザを経由する人間の不正アクセス」は止められない構造になっている.

## ゴール / 非ゴール

- ゴール:
  - URL を知るだけでは Web UI / API いずれにも到達できないこと
  - パスワード入力 → セッショントークン発行 → 以降の API 呼び出しを Bearer トークンで認証する仕組みを Web / Android で共有すること
  - 既存の authMiddleware (`server/src/app.ts:120`) の構造を最大限流用すること
- 非ゴール:
  - マルチユーザ管理 / 役割 / 共有 (project.md §3 CORE-2 を維持)
  - OAuth / SSO / メールリセット (個人運用負担とのバランスで OOS)
  - パスワード強度ポリシー / 試行回数上限などのレート制限 (将来 BL)
  - 既存 `AUTH_TOKEN` との並存運用 (本 BL で完全に廃止する)
  - JWT の採用 (単一インスタンス・単一ユーザ運用ではステートレス性が活きず, 既存 SQLite を流用する opaque token が依存・実装複雑度・即時 revoke の三点で優位)

## 要件

### 機能要件

- **サーバ**:
  - `POST /api/v1/login { password: string }` を新設. 受け取った password を `APP_PASSWORD_HASH` (bcrypt ハッシュ) と `bcrypt.compare` で照合し, 成功時は **opaque token** (`crypto.randomBytes(32).toString("hex")`) を発行し sessions テーブルに `(token, expires_at, created_at)` を INSERT してクライアントに返す. 失敗時は 401.
  - `POST /api/v1/logout` を新設. Authorization ヘッダの Bearer トークンを sessions テーブルから DELETE する.
  - 既存 authMiddleware を **sessions テーブル lookup** に差し替える. `Authorization: Bearer <token>` から token を取り出し, `SELECT FROM sessions WHERE token = ? AND expires_at > now()` で有効性確認. 失敗時 401.
  - `/api/v1/login` は authMiddleware の前で受け付ける (login 時には token を持っていないため).
  - 既存 `AUTH_TOKEN` 環境変数および固定トークン照合ロジックは本 BL で削除する.

- **共通コンポーネント (Web / Android で共有)**:
  - `LoginView` コンポーネントを新設. パスワード入力 → `POST /api/v1/login` → 成功時に token を保存して今日ビューに遷移, 失敗時にエラーメッセージを表示する.
  - token 保存先抽象を新設 (Web: `localStorage` / Android: Capacitor `Preferences`).

- **Web クライアント**:
  - 起動時に保存済み token を確認. 未保持または期限切れ時に `LoginView` を表示し, 他のビューには遷移できない.
  - 既存 `VITE_AUTH_TOKEN` 環境変数および埋め込みロジックは本 BL で削除する.
  - 全 API 呼び出しに `Authorization: Bearer <token>` を付与.

- **Android クライアント** (2 ステップ初回起動):
  - 既存 `SetupView` を「サーバ URL 入力 + `/healthz` への接続性検証」のみに簡素化する. パスワード/トークン入力欄は削除.
  - URL 検証成功後, Web と同じ `LoginView` に遷移してパスワード入力 → /login → token を Preferences に保存.

- **設定ビュー (Web / Android 共通)**:
  - `SettingsView` に「ログアウト」ボタンを追加. 押下で `POST /api/v1/logout` を呼び, token を破棄して `LoginView` に戻る.

- **Service Worker (PWA)**:
  - `vite-plugin-pwa` の `injectManifest` 設定で `/api/*` を pre-cache 対象外とする.
  - 401 を捕捉して `LoginView` に遷移する HTTP インターセプタを Web のレポジトリ層に追加する.

### 非機能要件

- パスワードはサーバ側で **bcrypt ハッシュ**として保持する (`APP_PASSWORD_HASH` env). 平文 env は使わない.
- セッショントークンの有効期限は **30 日** とする (`expires_at` を Unix epoch ms で保存).
- リフレッシュトークンは持たない.
- 既存テスト (`server/__tests__/integration/startup.test.ts` 等 47 ファイル以上) を新方式に書き換える. Bearer ヘッダ値を「固定 AUTH_TOKEN」から「テスト時に login で発行した token」に置換し, テストヘルパに `loginForTest()` を 1 つ用意する.
- `__tests__/release/prod-startup.test.ts` も `APP_PASSWORD_HASH` を env に渡し, 起動後に /login → token 取得 → 認証付き API 呼び出しまで確認する形に更新する.
- `docs/user/deploy-guide.md` の §3 環境変数表を更新し, `APP_PASSWORD_HASH` 生成手順 (`node -e "console.log(require('bcrypt').hashSync('your-password', 12))"`) を追記する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ: 未認証の Web アクセス
  Given Todica の本番が公開されている
  When  URL を知る第三者がブラウザで開く
  Then  LoginView が表示され, 他のビューには遷移できない
  And   /api/v1/* への直接リクエストは 401 を返す

シナリオ: 正しいパスワードでログイン
  Given LoginView が表示されている
  When  APP_PASSWORD_HASH に対応する正しいパスワードを入力して送信する
  Then  /api/v1/login が 200 で opaque token を返す
  And   token が localStorage (Web) または Preferences (Android) に保存される
  And   今日ビューに遷移して通常通り操作できる

シナリオ: 不正なパスワード
  Given LoginView が表示されている
  When  誤ったパスワードを送信する
  Then  /api/v1/login が 401 を返す
  And   token 保存先は変化せず, LoginView に留まる
  And   エラーメッセージ「パスワードが正しくありません」を表示する

シナリオ: 期限切れトークン
  Given token を保持しているが期限が過ぎている
  When  API 呼び出しを行う
  Then  401 を受け取る
  And   保存されている token が破棄される
  And   LoginView に遷移する

シナリオ: ログアウト
  Given token を保持し今日ビューを表示している
  When  SettingsView の「ログアウト」を押下する
  Then  POST /api/v1/logout が呼ばれ sessions テーブルから該当行が DELETE される
  And   保存されている token が破棄される
  And   LoginView に遷移する

シナリオ: Android 初回起動 (2 ステップ)
  Given アプリ初回起動で SetupView が表示されている
  When  サーバ URL を入力して送信する
  Then  /healthz への接続検証が走る
  And   200 が返れば LoginView に遷移する
  And   401 / タイムアウト等の失敗時は SetupView でエラーメッセージを表示する

  Given URL 検証後の LoginView が表示されている
  When  正しいパスワードを入力して送信する
  Then  /api/v1/login が 200 を返し token を Preferences に保存する
  And   今日ビューに遷移する

シナリオ: 既存 AUTH_TOKEN との非互換
  Given サーバが新方式 (sessions テーブル) に切り替わっている
  When  古いクライアント (固定 AUTH_TOKEN Bearer) で API を呼ぶ
  Then  401 を受け取る (= 旧方式は一切受理しない)
```

## 未決事項 / 確認待ち

なし.
