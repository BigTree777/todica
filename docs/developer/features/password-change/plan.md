## 設計・実装計画: ブラウザからのパスワード変更

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md), API は [`../../architecture/api/overview.md`](../../architecture/api/overview.md), DB は [`../../architecture/database/schema.md`](../../architecture/database/schema.md) を参照.

## 方針概要

- **パスワードハッシュを単一行 singleton として SQLite に永続化する**. drizzle テーブル `app_password` を新設し, `id = "current"` を PK とする 1 行に bcrypt ハッシュと更新時刻を持つ.
- **`PasswordRepository` を新設**. `app.ts` および起動 seed ロジックから DB へのアクセスを単一の Repository に集約する.
- **環境変数 `APP_PASSWORD_HASH` は初期 seed 専用に縮退**. 起動時に `app_password` テーブルが空のときだけ INSERT のソースとして使う. 既に行があるなら一切読まない (= 値が異なっても DB 優先).
- **認証経路を統一**. `POST /api/v1/login` および `POST /api/v1/password` のいずれも DB の現在ハッシュを `PasswordRepository.getHash()` で都度取得して bcrypt.compare する.
- **`POST /api/v1/password` を新規実装**. 現在パスワード照合 → 新パスワードを bcrypt.hashSync(12) → DB UPDATE → sessions 全削除 → 200 OK の順.
- **SettingsView にパスワード変更セクションを追加**. 既存の境界時刻フォーム / モード切替 / ログアウトと同じ DOM 階層に並べる. 成功時はコールバック (`onPasswordChanged`) を呼び, `main.tsx` 側の `App` が token を破棄して LoginView に遷移する (既存の `handleLogout` と同じ後始末).

## 既存実装の調査結果

| 項目 | 現状 | 本実装で変更 |
| --- | --- | --- |
| パスワードハッシュ供給源 | `process.env.APP_PASSWORD_HASH` を `main.ts` で読み, `AppDeps.passwordHash: string` として注入 | 起動時 seed → DB 永続化に移行. `AppDeps.passwordHash` を `AppDeps.passwordRepository` に置換 |
| `POST /api/v1/login` | `bcrypt.compare(password, deps.passwordHash)` で静的ハッシュと照合 | `bcrypt.compare(password, await deps.passwordRepository.getHash())` に置換 |
| `POST /api/v1/password` | 未実装 | 新規実装 (Bearer 必須 / Idempotency-Key 不要) |
| `app_password` テーブル | 存在しない | 新設 (`id` PK, `password_hash` TEXT, `updated_at` INTEGER) |
| sessions の一括削除 | 未実装 (`deleteByToken` のみ) | `SessionRepository.deleteAll()` を新設 |
| `PasswordRepository` | 存在しない | 新設 (interface + Drizzle 実装) |
| 初期 seed ロジック | なし (env をそのまま `AppDeps.passwordHash` に渡すだけ) | `main.ts` で「DB 空のとき env で INSERT」ロジックを追加 |
| Web `SettingsView` | 境界時刻フォーム + モード切替 + ログアウト | 「パスワード変更」セクションを追加 |
| Web `password-client.ts` | 存在しない | 新規 (`changePassword(baseUrl, token, currentPassword, newPassword)`) |
| Web `main.tsx` `App` 内のセッション破棄処理 | `handleLogout` が `logoutRequest` + `clearToken` を実行 | パスワード変更成功時のコールバック (`onPasswordChanged`) も同等の後始末を行う |

### 参考実装

- `server/src/data/session-repository.ts` および `server/src/infra/persistence/drizzle/session-repository.ts` (interface / Drizzle 実装の分割パターン).
- `server/drizzle/0001_sessions.sql` (単一テーブル追加のマイグレーション SQL の書式).
- `web/src/auth/login-client.ts` (fetch ラッパ + 専用エラークラスの形).

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 新規実装 `POST /api/v1/password`. 既存 `POST /api/v1/login` の照合元を `deps.passwordHash` 文字列から `deps.passwordRepository.getHash()` に置き換え. エラーコード `INVALID_PASSWORD` は既存の login と同じ値を流用. |
| DB | 新規テーブル `app_password` (drizzle スキーマ + マイグレーション 1 本). 既存テーブルへの変更なし. |
| サーバ | `server/src/data/password-repository.ts` を新設. `server/src/infra/persistence/drizzle/password-repository.ts` を新設. `server/src/app.ts` の `AppDeps` から `passwordHash: string` を削除し `passwordRepository: PasswordRepository` を追加. `POST /api/v1/password` ハンドラを追加. `SessionRepository.deleteAll()` を追加 (interface + Drizzle 実装). `server/src/main.ts` に起動時 seed (DB 空チェック + env による INSERT) を追加. |
| Web UI | `web/src/auth/password-client.ts` を新設. `web/src/ui/settings-view/settings-view.tsx` にパスワード変更セクションを追加. `web/src/main.tsx` で SettingsView に `onPasswordChanged` コールバックを渡し, 成功時に token を破棄して LoginView 状態に戻す. |
| ドキュメント | `docs/developer/architecture/database/schema.md` / `docs/developer/architecture/api/openapi.yaml` に `app_password` テーブルと `POST /api/v1/password` を追記. setup / deploy 系のユーザードキュメントは `APP_PASSWORD_HASH` の役割を「初期 seed」へ書き換える. (本計画では feature ドキュメント 3 本の作成のみを範囲とし, 共有ドキュメントの編集は tasks.md でフォローする). |

## 設計詳細

### データモデル

`app_password` テーブル (drizzle スキーマ):

```ts
// server/src/db/schema.ts に追加
export const appPassword = sqliteTable("app_password", {
  id: text("id").primaryKey().notNull(),        // 固定値 "current"
  passwordHash: text("password_hash").notNull(),
  updatedAt: integer("updated_at").notNull(),   // Unix epoch ms
});
```

- 単一行 singleton. PK は固定値 `"current"`.
- `password_hash` は bcrypt ハッシュ (cost factor 12) を保存する.
- `updated_at` は Unix epoch ms. sessions テーブルと整合する型を選択する (D-1 / D-3).

### Repository インターフェース

```ts
// server/src/data/password-repository.ts (新設)
export interface PasswordRepository {
  /** 現在のパスワードハッシュを取得する. 未存在時は null. */
  getHash(): Promise<string | null>;
  /** ハッシュをセットする. 行が無ければ INSERT, あれば UPDATE (upsert). */
  setHash(hash: string, updatedAt: number): Promise<void>;
}
```

- 起動時 seed (`main.ts`) は `getHash()` で空かどうかを判定し, 空のときだけ `setHash(envHash, now)` を呼ぶ.
- `POST /api/v1/password` ハンドラは `getHash()` で現行ハッシュを引いて bcrypt.compare し, 成功時に `setHash(newHash, now)` で更新する.
- 既存 `SessionRepository` には `deleteAll()` を追加する.

```ts
// server/src/data/session-repository.ts (差分追加)
export interface SessionRepository {
  // ... (既存)
  /** sessions テーブルの全行を削除する. パスワード変更時に呼ばれる. */
  deleteAll(): Promise<void>;
}
```

### API リソース定義

#### `POST /api/v1/password`

- 認証必須. Idempotency-Key 不要 (新パスワードの設定は同一値再送が意味を持たず, ハッシュ計算コストも高くないため middleware の対象外とする / D-4).
- リクエストボディ:
  ```json
  { "currentPassword": "P0", "newPassword": "P1" }
  ```
- 200 OK: `{}` (空ボディ). 成功フラグはステータスコードで表現する.
- 401 INVALID_PASSWORD: 現在パスワードが DB のハッシュと一致しない.
- 400 INVALID_REQUEST_BODY: JSON パース失敗 / `currentPassword` または `newPassword` が文字列でない.

### 処理フロー — パスワード変更

1. `authMiddleware` を通過 (Bearer 必須).
2. リクエストボディの JSON パースと型検査. 失敗時は 400.
3. `passwordRepository.getHash()` で現行ハッシュを取得.
4. `bcrypt.compare(currentPassword, currentHash)` で照合. 不一致なら 401 INVALID_PASSWORD.
5. `bcrypt.hashSync(newPassword, 12)` で新ハッシュを生成.
6. `passwordRepository.setHash(newHash, clock.now())` で DB 更新.
7. `sessionRepository.deleteAll()` で全 sessions を削除.
8. 200 OK を返す.

> 5〜7 のアトミック性については, 実装段階で `deps.db.transaction(...)` でラップしてもよい (BL-016 / `DELETE /api/v1/projects/:id` のカスケード削除と同じパターン). ただし bcrypt.hashSync の所要時間 (cost 12 で数百 ms) を考えると, hash 計算はトランザクション外で行ったうえで, DB 更新 + sessions DELETE のみをトランザクション内にまとめるのが望ましい (D-4).

### 処理フロー — 起動時 seed

1. `main.ts` で drizzle migrate を実行 (既存どおり).
2. `PasswordRepository` を Drizzle 実装で構築.
3. `passwordRepository.getHash()` を await.
4. 結果が `null` のとき:
   - `APP_PASSWORD_HASH` 環境変数が空文字なら従来どおり `process.exit(1)`.
   - 空でなければ `passwordRepository.setHash(envHash, Date.now())`.
5. 結果が非 `null` のとき: 環境変数を一切参照しない (DB 優先 / D-1 / D-2).
6. `createApp({ ..., passwordRepository })` を呼ぶ.

### Web クライアント設計

#### `web/src/auth/password-client.ts`

```ts
export class InvalidPasswordError extends Error { /* login-client.ts と同じ形 */ }
export class NetworkError extends Error { /* login-client.ts と同じ形 */ }

export async function changePassword(
  baseUrl: string,
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  // 401 → InvalidPasswordError / 400 → Error / network → NetworkError / 200 → resolve.
}
```

#### `web/src/ui/settings-view/settings-view.tsx`

- 既存のフォーム (境界時刻) と並ぶ形で「パスワード変更」セクション (`<section aria-label="パスワード変更">`) を追加する.
- 入力フィールド:
  - 現在パスワード (`<input type="password" autocomplete="current-password">`).
  - 新パスワード (`<input type="password" autocomplete="new-password">`).
  - 新パスワード確認 (`<input type="password" autocomplete="new-password">`).
- 送信前バリデーション:
  - 3 入力のいずれかが空なら送信しない.
  - 新パスワードと確認入力が異なる場合は送信せず, エラー領域に注意を表示する.
- API 呼び出し:
  - 受け取った props `changePassword(currentPassword, newPassword)` を await する.
  - 401 (`InvalidPasswordError`) なら「現在のパスワードが正しくありません」を表示.
  - その他のエラーは「保存に失敗しました」を表示.
  - 成功時は props `onPasswordChanged()` を呼ぶ (副作用は親が担当).
- エラー領域は `role="alert"`.

#### `web/src/main.tsx` の `App`

- SettingsView に新たな props を渡す:
  - `changePassword(currentPassword, newPassword)`: 内部で `auth/password-client.changePassword(baseUrl, token, currentPassword, newPassword)` を呼ぶ.
  - `onPasswordChanged()`: `authStorage.clearToken()` + `setToken(null)` + `setAuthToken("")` を実行する (既存 `handleLogout` と同じ後始末. ただし `/api/v1/logout` は呼ばない. サーバ側が既に全 sessions を削除済みのため).
- 自端末の token はこの時点で破棄されるため, `App` の既存条件 (`currentMode === "server" && !token && !config.needsSetup`) によって LoginView が描画される.

### 例外 / エラー処理

- bcrypt.compare のエラー (極めて稀): 500 INTERNAL_ERROR (login と同様の取り扱い).
- bcrypt.hashSync のエラー: 同じく 500 INTERNAL_ERROR. ただし DB 更新前に発生するため副作用なし.
- DB UPDATE エラー: 500 INTERNAL_ERROR. ハンドラ全体を try/catch で囲む.
- sessions DELETE エラー: 500 INTERNAL_ERROR. ただし password の DB UPDATE が成功している以上, クライアントは結果整合的に次回ログイン時に新パスワードでログインできる.

## 重要な決定

- **D-1: env による seed と DB の優先順位 (DB > env).**
  - サーバ起動時に DB の `app_password` が空であれば `APP_PASSWORD_HASH` 環境変数で seed する. 既に行があれば環境変数を一切読まない.
  - 理由: 「DB を更新してもサーバ再起動で環境変数の値に戻る」という挙動を避けるため. ユーザーが SettingsView から変更したパスワードが永続化された世界観を保つ.
- **D-2: env と DB の値が異なる場合の挙動 (DB 優先, env 無視).**
  - DB に行があるが内容が `APP_PASSWORD_HASH` と一致しない状況 (古い env を消し忘れている等) でも, 起動時には DB が真として扱われる.
  - 理由: D-1 と同じ. env はあくまで初期 seed であり, 運用中の真は DB.
- **D-3: bcrypt cost factor は 12.**
  - 既存 `bcrypt.compare` 呼び出しが想定するハッシュも同じ cost で生成されている前提を継続する.
  - hashSync(newPassword, 12) を採用する.
- **D-4: パスワード変更後の全 sessions DELETE は確認ダイアログを出さない.**
  - 自端末のセッションも同時に失効するが, それは想定された結果 (= 新パスワードで再ログインする運動). CORE-1 (迷わず使える) の方針に従い, 余計な確認ダイアログは挟まない.
  - クライアント側は 200 OK を受け取った直後に LoginView に強制遷移するため, 体感はワンステップで完結する.
- **D-5: フォーム validation は client + server の両方で行う.**
  - client: 空入力拒否 / 新パスワード != 確認入力の拒否 (送信そのものを行わない).
  - server: JSON パース / 型検査 / 現在パスワード照合.
  - サーバ側は「新パスワード == 確認入力」の検査をしない (= 確認入力はサーバには送られない). 確認入力の責務はクライアント UI に閉じる.
- **D-6: `AppDeps.passwordHash: string` の置き換え方針.**
  - `AppDeps` から `passwordHash: string` を削除し, `passwordRepository: PasswordRepository` に置き換える. これにより `app.ts` のハンドラが「都度 DB から最新ハッシュを読む」形に統一される.
  - 既存テスト (login 系) は new ハッシュを `PasswordRepository` 実装にセットする形に書き換える. Fake 実装 (`InMemoryPasswordRepository`) を test-designer 段階で用意する.
- **D-7: テスト時の env と DB の使い分け.**
  - サーバ単体テストでは `APP_PASSWORD_HASH` env を使わない. `createApp({ passwordRepository: new InMemoryPasswordRepository("<hash>") })` の形で直接注入する.
  - 起動時 seed のテストは `main.ts` の seed ロジックを切り出した関数 (例: `seedPasswordIfEmpty(repo, envHash, now)`) に対して単体テストを書く.
- **D-8: `APP_PASSWORD_HASH` env の維持と廃止.**
  - 本 feature では env を **維持する** (初回起動時 seed の手段として残す). 完全廃止は次回以降の課題.
  - ドキュメント上は「初回起動の seed 用途のみ. 起動後の真は DB」と明確化する.

## リスク / 代替案

- **リスク 1: DB UPDATE 成功 + sessions DELETE 失敗の中途半端な状態.**
  - 結果: 新パスワードへの変更は永続化されるが, 古い token が残る可能性. 次回 token 失効までは古いセッションが生きてしまう.
  - 緩和策: DB UPDATE と sessions DELETE を `deps.db.transaction()` で同一トランザクションに括る (Drizzle の sync 経路に統一する). `deps.db` が無いテスト経路では Repository を順次 await するフォールバック.
- **リスク 2: bcrypt.hashSync の所要時間で他の API リクエストがブロックされる.**
  - 個人運用では同時リクエスト数が極めて少なく許容範囲. cost 12 で数百 ms 程度.
  - 代替案: `bcrypt.hash` (非同期) を使う. ただし既存 login が `bcrypt.compare` の非同期版を使っているため整合は取りやすい. 実装段階で `hashSync` か `hash` (await) かを選ぶ (D-3 では cost factor のみを決定).
- **代替案: パスワード変更を `PATCH /api/v1/password` にする.**
  - 「現在の状態に対する部分更新」と捉えれば PATCH も妥当. しかし「新しい認証情報を確立する」操作とみなせば POST のほうが意味的に明快.
  - 既存の `/login` / `/logout` が POST であることとも整合する. 本 feature では POST を採用する.

## 段階分割

- **Step 1: DB スキーマと PasswordRepository の足場.**
  - drizzle スキーマに `appPassword` を追加.
  - 新規マイグレーション SQL `0002_app_password.sql` を追加.
  - `PasswordRepository` interface + Drizzle 実装 + Fake (`InMemoryPasswordRepository`) を用意.
  - 既存 `SessionRepository` に `deleteAll()` を追加 (interface + Drizzle 実装 + Fake).
- **Step 2: `AppDeps` 置換と既存 login 経路の DB 移行.**
  - `AppDeps.passwordHash: string` を削除し `passwordRepository` を追加.
  - `POST /api/v1/login` を `await deps.passwordRepository.getHash()` に切り替える.
  - 既存テスト (login 系) を `passwordRepository` 注入に書き換える (test-designer がテストを書く前提で, ここではテスト整理方針のみ計画する).
- **Step 3: `POST /api/v1/password` ハンドラの新設.**
  - app.ts にハンドラ追加. AC-2 〜 AC-3 / AC-11 / AC-12 / AC-6 をカバー.
- **Step 4: `main.ts` の起動時 seed.**
  - DB 空チェック → env で INSERT.
  - DB に行があれば env を読まない. AC-8 / AC-9 をカバー.
- **Step 5: Web `password-client.ts` の新設と SettingsView 拡張.**
  - フォーム実装 + クライアントバリデーション (AC-1 / AC-4 / AC-5).
  - 401 / その他エラーの表示.
- **Step 6: `App` (main.tsx) と SettingsView の結線.**
  - `onPasswordChanged` で token 破棄 → LoginView 遷移 (AC-7 / AC-10).
- **Step 7: 共有ドキュメント (architecture / setup / deploy / faq) を本 feature の世界観に追従させる.**
  - tasks.md でフォロー (本 plan の主担当は feature ドキュメント 3 本).

## 変更ファイル表

| ファイル | 変更種別 | 主な変更 |
| --- | --- | --- |
| `server/drizzle/0002_app_password.sql` | 新規 | `app_password` テーブル DDL |
| `server/src/db/schema.ts` | 編集 | `appPassword` を追加 / `schema` エクスポートに登録 |
| `server/src/data/password-repository.ts` | 新規 | `PasswordRepository` interface |
| `server/src/infra/persistence/drizzle/password-repository.ts` | 新規 | Drizzle 実装 |
| `server/src/data/session-repository.ts` | 編集 | `deleteAll()` シグネチャを追加 |
| `server/src/infra/persistence/drizzle/session-repository.ts` | 編集 | `deleteAll()` 実装 |
| `server/src/app.ts` | 編集 | `AppDeps.passwordHash` 削除 / `passwordRepository` 追加 / `/login` の照合元差し替え / `POST /api/v1/password` ハンドラ追加 |
| `server/src/main.ts` | 編集 | 起動時 seed (DB 空 → env で INSERT) を追加 / `passwordRepository` を `createApp` に渡す |
| `web/src/auth/password-client.ts` | 新規 | `changePassword` 関数 + エラークラス |
| `web/src/ui/settings-view/settings-view.tsx` | 編集 | パスワード変更セクション追加 / props に `changePassword` / `onPasswordChanged` を追加 |
| `web/src/ui/settings-view/settings-view.css` | 編集 (必要に応じて) | 新セクション用の最小スタイル |
| `web/src/main.tsx` | 編集 | SettingsView へ新 props を結線 |

## 既存資産流用

- **SessionRepository / DrizzleSessionRepository** のパターンを `PasswordRepository` に踏襲する. interface を `server/src/data/`, Drizzle 実装を `server/src/infra/persistence/drizzle/` に置く. Fake 実装 (`InMemoryPasswordRepository`) は test-designer が用意する.
- **`server/drizzle/0001_sessions.sql`** をマイグレーション SQL の書式テンプレートとして使う.
- **`web/src/auth/login-client.ts`** を `password-client.ts` の構造テンプレートとして使う (専用エラークラス + `InvalidPasswordError` / `NetworkError`).
- **`web/src/ui/settings-view/settings-view.tsx`** の既存セクション (モード切替 / ログアウト) を踏襲して `<section aria-label="...">` の並び順に組み込む.
- **`web/src/main.tsx` の `handleLogout`** を参考に, `onPasswordChanged` でも同等の後始末 (token 破棄 + state リセット) を行う. `/api/v1/logout` は呼ばない点だけが差分.

## スコープ境界

- パスワード強度ポリシー (zxcvbn / 文字種 / 長さ) は実装しない.
- パスワード履歴を持たない. 新パスワードが現在パスワードと同じでも 200 を返す (= 実害がないため特別扱いしない).
- メール経由のリセットフローは実装しない.
- マルチユーザーへの拡張は行わない (`app_password` は singleton 固定).
- Android ローカルモード (BL-020) は本 feature の対象外. ローカルモードは認証を持たないため `/settings` の本セクションは server モードのみ表示する.

## 非機能 / a11y

- 新セクションの DOM 構造:
  ```html
  <section aria-label="パスワード変更" class="settings-view__section">
    <h2>パスワード変更</h2>
    {error && <div role="alert">{error}</div>}
    <form ...>
      <label>現在のパスワード <input type="password" autocomplete="current-password"></label>
      <label>新しいパスワード <input type="password" autocomplete="new-password"></label>
      <label>新しいパスワード (確認) <input type="password" autocomplete="new-password"></label>
      <button type="submit" class="button button--primary">保存</button>
    </form>
  </section>
  ```
- 各 input は `id` を付与し, `<label htmlFor>` で関連付ける.
- エラーメッセージは `role="alert"` + `aria-live="assertive"` で読み上げる.
- ボタンは既存の共通スタイル (`button button--primary`) を流用する.
- パスワード入力フィールドは Web 標準のブラウザパスワード管理 / 1Password 等の autofill が機能するよう, `autocomplete` 属性を必ず付与する.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md). 本 feature では以下の層で検証する.

### サーバ単体テスト

- **`POST /api/v1/login` の DB 照合化**.
  - DB に bcrypt("P0") を持たせた状態で `{ password: "P0" }` → 200, `{ password: "X" }` → 401.
  - 既存 login テスト群を `passwordRepository` 注入に書き換える.
- **`POST /api/v1/password` のハンドラ**.
  - AC-2: 正しい現在パスワード + 新パスワードで 200, DB が更新される.
  - AC-3: 誤った現在パスワードで 401, DB が変わらない, sessions が削除されない.
  - AC-6: パスワード変更成功後, sessions テーブルが空である (= 全削除されている) ことを確認する.
  - AC-11: Authorization なしのリクエストで 401 (authMiddleware が拒否).
  - AC-12: ボディが不正で 400.
- **起動時 seed ロジック**.
  - AC-8: 空 DB + env ありで seed される.
  - AC-9: DB に既存行がある状態で env を別値にしても DB が変わらない / login は DB 値で通る.

### サーバ統合テスト (E2E に近い in-process)

- AC-10: パスワード変更 → 全 sessions 削除 → 新パスワードで login → 200 OK + 新 token.

### Web UI テスト (Vitest + React Testing Library)

- AC-1: SettingsView 描画でパスワード変更セクションと 3 入力 + ボタンが出る.
- AC-4: 新パスワードと確認入力が異なるときに送信されない. エラー表示が出る.
- AC-5: 必須項目が空のときに送信されない.
- AC-7: changePassword が resolve したあと `onPasswordChanged` が呼ばれる.
- 401 (`InvalidPasswordError`) を投げた場合のエラー表示.

### Web 結線テスト (`main.tsx` 周辺)

- `onPasswordChanged` 後に token が破棄され, LoginView が描画される条件 (`currentMode === "server" && !token`) に入る.

## 未決事項 / 確認待ち

なし.
