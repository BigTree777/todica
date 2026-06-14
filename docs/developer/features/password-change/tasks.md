## タスク: ブラウザからのパスワード変更

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる. TDD サイクル (失敗するテスト → 通す → リファクタ) で進める.

## AC ↔ Step マップ

| AC | カバー Step |
| --- | --- |
| AC-1 (SettingsView にパスワード変更セクション表示) | Step 5 |
| AC-2 (正しい入力で 200 + DB 更新) | Step 3 |
| AC-3 (誤った現在パスワードで 401 + DB 不変) | Step 3 |
| AC-4 (新パスワード != 確認入力で送信されない) | Step 5 |
| AC-5 (必須項目空で送信されない) | Step 5 |
| AC-6 (全 sessions 削除) | Step 3 |
| AC-7 (成功時 LoginView 強制遷移) | Step 6 |
| AC-8 (DB 空時に初期設定可能) | Step 4 |
| AC-9 (DB に値があれば初期設定済み) | Step 4 |
| AC-10 (新パスワードでログイン可) | Step 3 + Step 4 (E2E) |
| AC-11 (未認証は 401) | Step 3 |
| AC-12 (リクエスト形式不正は 400) | Step 3 |

## Step 1: DB スキーマと PasswordRepository の足場

### 実装

- [x] `server/drizzle/0002_app_password.sql` を新設し, `app_password` テーブル DDL (id PK / password_hash TEXT NOT NULL / updated_at INTEGER NOT NULL) を定義する.
- [x] `server/src/db/schema.ts` に `appPassword` テーブル定義を追加し, `schema` エクスポートに登録する.
- [x] `server/src/data/password-repository.ts` を新設し, `PasswordRepository` interface (`getHash() / setHash()`) を定義する.
- [x] `server/src/infra/persistence/drizzle/password-repository.ts` を新設し, `DrizzlePasswordRepository` を実装する (`getHash` は SELECT 1 行 / `setHash` は upsert).
- [x] `server/src/data/session-repository.ts` に `deleteAll(): Promise<void>` シグネチャを追加する.
- [x] `server/src/infra/persistence/drizzle/session-repository.ts` に `deleteAll` を実装する (`DELETE FROM sessions`).

### テスト (test-designer が用意し, implementer が green 化する)

- [x] `DrizzlePasswordRepository.getHash()` は未存在時 `null` / 存在時 既存ハッシュを返す.
- [x] `DrizzlePasswordRepository.setHash(hash, t)` は INSERT (初回) も UPDATE (2 回目以降) も冪等に動作する.
- [x] `DrizzleSessionRepository.deleteAll()` は複数行が存在する状態から全行を削除する.

## Step 2: AppDeps 置換と既存 login 経路の DB 移行

### 実装

- [x] `server/src/app.ts` の `AppDeps` から `passwordHash: string` を削除し, `passwordRepository: PasswordRepository` を追加する.
- [x] `POST /api/v1/login` の照合元を `await deps.passwordRepository.getHash()` に切り替える.
- [x] `passwordRepository.getHash()` が `null` を返した場合は初期設定未完了として扱う.

### テスト

- [x] 既存 login テスト群を `passwordRepository` 注入形に書き換え, AC-3 と同等のシナリオ (DB に bcrypt("P0") / 入力 "P0" → 200, 入力 "X" → 401) を満たす.

## Step 3: POST /api/v1/password ハンドラの新設

### 実装

- [x] `server/src/app.ts` に `POST /api/v1/password` ハンドラを追加する.
  - JSON パース失敗 → 400 INVALID_REQUEST_BODY.
  - `currentPassword` / `newPassword` が文字列でない → 400 INVALID_REQUEST_BODY.
  - `passwordRepository.getHash()` で現行ハッシュを取得し, `bcrypt.compare(currentPassword, hash)` で照合. 失敗 → 401 INVALID_PASSWORD.
  - `bcrypt.hashSync(newPassword, 12)` (または `bcrypt.hash(newPassword, 12)` の await) で新ハッシュ生成.
  - DB UPDATE + sessions 全削除. `deps.db` がある場合はトランザクションでまとめる.
  - 200 OK を返す.
- [x] エラーハンドリング (bcrypt.compare / bcrypt.hash / DB 例外) に対する 500 INTERNAL_ERROR フォールバックを入れる.

### テスト

- [x] AC-2: DB の app_password が bcrypt("P0") の状態で `{ currentPassword: "P0", newPassword: "P1" }` → 200 + DB ハッシュが "P1" を bcrypt.compare で検証可能.
- [x] AC-3: 誤った `currentPassword` で 401 + DB 不変 + sessions テーブル不変.
- [x] AC-6: 成功時に sessions テーブルが空になる (複数 token を事前に INSERT しておいて検証).
- [x] AC-11: Authorization なしで 401 (authMiddleware による拒否).
- [x] AC-12: `newPassword` 欠落 / 型不正 で 400.
- [x] AC-10 (in-process E2E): パスワード変更 → 旧 token での `/today` が 401 → 新パスワードで `/login` → 200 + 新 token → `/today` が 200.

## Step 4: 初期設定経路

### 実装

- [x] `server/src/main.ts` で `PasswordRepository` を構築して `createApp` に渡す.
- [x] `GET /api/v1/auth-state` で DB 空なら初期設定未完了を返す.
- [x] 初期設定未完了時の `POST /api/v1/password` で最初のハッシュを保存する.
- [x] DB に値があるときは初期設定済みとして既存値を認証に使用する.

### テスト

- [x] AC-8: 空 Repository では `auth-state` が初期設定未完了を返し、初期設定 API が `setHash` を呼ぶ.
- [x] AC-9: `getHash()` が既存値を返す状態では `auth-state` が初期設定済みを返す.
- [x] AC-9 続き: 起動後の `/login` は DB に保存したパスワードで 200 を返す.

## Step 5: Web password-client.ts と SettingsView 拡張

### 実装

- [x] `web/src/auth/password-client.ts` を新設.
  - `InvalidPasswordError` / `NetworkError` を定義 (login-client.ts と同じ形).
  - `changePassword(baseUrl, token, currentPassword, newPassword): Promise<void>` を実装.
  - 200 → resolve / 401 → `InvalidPasswordError` / network → `NetworkError` / その他 → `Error`.
- [x] `web/src/ui/settings-view/settings-view.tsx` に `<section aria-label="パスワード変更">` を追加.
  - 3 入力 (`current-password` / `new-password` / `new-password`) + 保存ボタン.
  - クライアントバリデーション: 必須項目空で送信中止, 新パスワード != 確認入力で送信中止 + エラー表示.
  - `InvalidPasswordError` で「現在のパスワードが正しくありません」表示.
  - その他エラーで「保存に失敗しました」表示.
  - 成功時に props `onPasswordChanged()` を呼ぶ.
  - props 追加: `changePassword?: (current, next) => Promise<void>` / `onPasswordChanged?: () => void | Promise<void>` (両方ともサーバモードでのみ渡される).
- [x] `web/src/ui/settings-view/settings-view.css` に新セクション最小スタイルを追加 (必要に応じて).

### テスト

- [x] AC-1: SettingsView 描画で `aria-label="パスワード変更"` のセクションと 3 つの type=password input + 保存ボタンが出る.
- [x] AC-4: 新パスワード != 確認入力で保存ボタンを押すと `changePassword` が呼ばれない + role="alert" にエラーが出る.
- [x] AC-5: 任意の入力が空のまま保存ボタンを押すと `changePassword` が呼ばれない.
- [x] AC-3 (UI 側): `changePassword` が `InvalidPasswordError` を投げた場合のエラー表示.
- [x] AC-7 (UI 側単体): `changePassword` が resolve したあと `onPasswordChanged` が呼ばれる.

## Step 6: main.tsx と SettingsView の結線

### 実装

- [x] `web/src/main.tsx` の `App` から SettingsView に `onChangePassword` / `onPasswordChanged` を渡す (server モード + token 保持時のみ).
  - `onChangePassword`: `password-client.changePassword(baseUrl, token, current, next)` を呼ぶ.
  - `onPasswordChanged`: `await authStorage.clearToken()` + `setToken(null)` + `setAuthToken("")` を実行 (logoutRequest は呼ばない).
- [x] 既存 `handleLogout` との重複は共通関数化してもよい (任意のリファクタ).

### テスト

- [x] AC-7 (結線): SettingsView から `onPasswordChanged` が呼ばれると, `App` の state が `token === null` になり, 既存の条件 (`currentMode === "server" && !token && !config.needsSetup`) で LoginView が描画される.
- [x] AC-10 (Web 結線): 新パスワードを LoginView に入力すると `/login` を叩いて成功する (login の経路は既存テストに依拠).

## Step 7: 共有ドキュメントの追従

### ドキュメント

- [x] `docs/developer/architecture/database/schema.md` に `app_password` テーブルを追記.
- [x] `docs/developer/architecture/api/openapi.yaml` に `POST /api/v1/password` を追記 (Bearer / 200 / 401 / 400).
- [x] setup / deploy / faq 系のユーザードキュメントを更新.
  - 初回アクセス時の設定と、起動後は DB を真として SettingsView から変更できることを案内する.
  - パスワードを忘れた場合の復旧手順は `app_password` を削除して初期設定画面から再登録する形で FAQ に追記する.

## 仕上げ

- [x] 受け入れ基準 (spec.md AC-1 〜 AC-12) を全て満たすことを確認.
- [x] サーバ全テスト (vitest) と Web 全テストが green.
- [x] typecheck / lint 0 エラー.
- [x] auditor にレビュー依頼.

## 経緯

- 実装途中では `APP_PASSWORD_HASH` env を初回 seed に使い、DB が空のとき `setHash(envHash, Date.now())` を呼ぶ構成だった。
- `createApp` への Repository 注入へ移行する際、旧 `passwordHash: APP_PASSWORD_HASH` の直接注入を削除した。
- 共有ドキュメントには `APP_PASSWORD_HASH` env を初回 seed 用途として案内する中間状態があった。
