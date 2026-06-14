# タスク: 完了済 feature ドキュメントから旧認証経路参照を除去

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる. TDD サイクル (失敗するテスト → 通す → リファクタ) で進める.

## AC ↔ Step マップ

| AC | カバー Step |
| --- | --- |
| AC-1 (対象 4 ディレクトリで grep ヒット 0) | Step 5 (テスト) + Step 1〜4 (実体作業) |
| AC-2 (android-server-mode が現行 auth フローと一致) | Step 1 |
| AC-3 (web-client-foundation/plan.md の env 集約) | Step 1 |
| AC-4 (廃止 feature の記述に差分なし) | Step 6 (仕上げ確認) |
| AC-5 (vitest で grep 検証が CI に組み込まれる) | Step 5 |
| AC-6 (「経緯」節が grep 検証から除外される) | Step 5 + Step 2 / Step 3 |

## Step 0: 事前確認

- [x] D-6 のクロスリンク確認を実行する: `grep -rn "fr-pwd-2\|fr-pwd-3\|ac-8\|ac-9" docs/developer/`. ヒットがあれば移動先のアンカーを plan.md に追記する.
- [x] `playwright.config.ts` の現状を確認し, `e2e-login-spec` の書き換え内容が現状と一致するか追検証する.
- [x] `authed-fetch-repositories` の `AUTH_TOKEN` 言及が env を指していない (テスト内のローカル定数である) ことを再確認する.

## Step 1: 直接書き換え対象の編集 (該当箇所が短く文脈なく置換できるケース)

### 実装

- [x] `docs/developer/features/android-server-mode/spec.md` を編集する.
  - FR-AND-004 の「認証トークンの入力を促す SetupView」を「サーバ URL の入力を促す SetupView. 認証は SetupView 完了後に LoginView へ遷移して /api/v1/login 経由で行う」に書き換える.
  - AC-AND-003 のシナリオから認証トークン入力欄に関する Given / And 行を削除し, 入力欄をサーバ URL のみに絞る.
  - AC-AND-005 のシナリオを「サーバ URL を変更できる. 認証トークンの再発行はログアウト → 再ログイン経由」に書き換える.
  - 非ゴール L35 の旧トークン名を除去し, 「認証方式の変更は [`../app-login/spec.md`](../app-login/spec.md) で完全置換された」に書き換える.
- [x] `docs/developer/features/android-server-mode/plan.md` を編集する.
  - D-002 / D-003 / D-004 / D-005 の `authToken` を `authStorage` 経由の opaque token に書き換える.
  - SetupView は URL のみで完了し, 続けて LoginView を表示する設計に揃える.
- [x] `docs/developer/features/android-server-mode/tasks.md` L54 を「現行の `authStorage` から opaque token を読み取る (Web / Android 共通経路)」に書き換える.
- [x] `docs/developer/features/web-client-foundation/plan.md` L36 を「環境変数 (`VITE_API_BASE_URL`) の読み取りも同ファイルに集約する」に書き換える. 末尾に「認証 token は実行時に `auth-storage` から取得する」旨を 1 文追記する.
- [x] `docs/developer/features/e2e-login-spec/spec.md` の `playwright.config.ts` 関連記述を env 名を含まない表現に書き換える.
- [x] `docs/developer/features/e2e-login-spec/plan.md` 同上.
- [x] `docs/developer/features/task-crud/tasks.md` L28 を「Bearer 認証ミドルウェア (現行は sessions テーブル lookup. 詳細は [`../app-login/plan.md`](../app-login/plan.md))」に書き換える.
- [x] `docs/developer/features/settings-view-dead-path-cleanup/spec.md` L40 および同 `plan.md` L132 の旧トークン名を除去し, 「サーバ / Web 双方の認証経路 (BL-074 / BL-076 のスコープ)」に書き換える.
- [x] `docs/developer/features/authed-fetch-repositories/spec.md` / `plan.md` / `tasks.md` のテスト内ローカル定数 `AUTH_TOKEN` を `TEST_TOKEN` (または `SEED_TOKEN`) に置換した記述に書き換える. `Authorization: Bearer ${AUTH_TOKEN}` 等の文字列も同じ定数名に揃える.

### 検証

- [x] 上記編集の後, 編集ファイル群を目視で読み, 文書構造 (見出し / セクション順 / 採番) が維持されていることを確認する.

## Step 2: 「経緯」隔離対象の編集 (server-foundation)

### 実装

- [x] `docs/developer/features/server-foundation/spec.md` の本文中の `AUTH_TOKEN` 言及を `tasks.md` 末尾の `## 経緯` 節へ移動する. 本文には「初期の認証経路は固定トークン Bearer だった (詳細は `tasks.md` の `## 経緯` 節を参照)」と要約のみ残す.
  - 該当: FR-002 / NFR-002 / AC-1 (AUTH_TOKEN 未設定で起動) / AC-3 のヘッダ表記 等.
- [x] `docs/developer/features/server-foundation/plan.md` の `AUTH_TOKEN` 言及 (環境変数表 / フロー図 / エラー処理表 / リスク欄) を `tasks.md` 末尾の `## 経緯` 節へ移動する. 本文には要約のみ残す.
- [x] `docs/developer/features/server-foundation/tasks.md` 末尾に `## 経緯` 節を追加し, 上記 spec / plan から移動した記述を集約する. 見出しは plan.md D-2 のフォーマットに従う.

### 検証

- [x] `__tests__/docs/no-legacy-auth-refs.test.ts` (Step 5 で追加) が `server-foundation` 配下で green になる.

## Step 3: 「経緯」隔離対象の編集 (password-change)

### 実装

- [x] `docs/developer/features/password-change/spec.md` の FR-PWD-2 / AC-8 / AC-9, および本文中の `APP_PASSWORD_HASH` 言及を `tasks.md` 末尾の `## 経緯` 節へ移動する.
- [x] `docs/developer/features/password-change/plan.md` の D-1 / D-2 / D-7 / D-8 と「処理フロー — 起動時 seed」セクションを `tasks.md` 末尾の `## 経緯` 節へ移動する. 本文には「起動時 seed の挙動は後続 BL-080 で完全廃止された (詳細は `tasks.md` の `## 経緯` 節を参照)」と要約のみ残す.
- [x] `docs/developer/features/password-change/tasks.md` 末尾に `## 経緯` 節を追加し, 移動した記述と Step 4 (旧 main.ts seed の実装履歴) を集約する.
- [x] D-6 のクロスリンク確認結果を踏まえ, 移動した fragment が他 feature から参照されていれば移動先のアンカーを明示する.

### 検証

- [x] `__tests__/docs/no-legacy-auth-refs.test.ts` が `password-change` 配下で green になる.

## Step 4: 「経緯」隔離対象の編集 (oss-release-prep)

### 実装

- [x] `docs/developer/features/oss-release-prep/plan.md` L91 周辺の `AUTH_TOKEN` env 関連記述を `tasks.md` 末尾の `## 経緯` 節へ移動する. 本文には「サーバ起動時の環境変数はリリース時点の deploy-guide.md を参照」と残す.
- [x] `docs/developer/features/oss-release-prep/tasks.md` L52 周辺を同様に処理し, 末尾に `## 経緯` 節を追加する.

### 検証

- [x] `__tests__/docs/no-legacy-auth-refs.test.ts` が `oss-release-prep` 配下で green になる.

## Step 5: テスト追加と全体検証

### 実装 (test-designer → implementer)

- [x] `__tests__/docs/no-legacy-auth-refs.test.ts` を新規追加する. plan.md D-5 のロジックに従う.
  - `TARGET_DIRS` = `["docs/developer/features", "docs/user", "docs/developer/setup", "docs/developer/architecture"]`.
  - `FORBIDDEN_TOKENS` = `["VITE_AUTH_TOKEN", "APP_PASSWORD_HASH", "AUTH_TOKEN"]`.
  - 除外: `features/app-login/` および `features/initial-password-setup/` 配下.
  - `tasks.md` のみ `## 経緯` 見出し以下を assert 対象から除外する.
- [x] 初回コミット時点では `it.fails()` / `expect(content).toContain(...)` 等で **意図的に red にする** (TDD の「失敗するテストを書く」). その後 Step 1〜4 で実体を書き換えて green に倒す.

### テスト

- [x] AC-1: 4 ディレクトリすべてのファイルで grep ヒットが 0 (除外条件を除く) であることを assert する.
- [x] AC-6: `## 経緯` 配下に旧トークン名を意図的に置いたフィクスチャを用意し, テストが green であることを確認する (= 除外ロジックが正しく動く).
- [x] AC-5: テスト自体が CI で実行される (`npm test` の対象に含まれる) ことを確認する.

### 検証 (手動)

- [x] `grep -rn "VITE_AUTH_TOKEN\|APP_PASSWORD_HASH\|AUTH_TOKEN" docs/developer/features docs/user docs/developer/setup docs/developer/architecture` を実行し, ヒットが `## 経緯` 配下のみであることを目視確認する.

## Step 6: 仕上げ

- [x] AC-1〜AC-6 を全て満たすことを確認する.
- [x] `git diff main..HEAD docs/developer/features/app-login/ docs/developer/features/initial-password-setup/` で差分が無いことを確認する (AC-4).
- [x] `git diff main..HEAD docs/developer/oss/secret-scan-report.md` で差分が無いことを確認する.
- [x] `npx vitest run __tests__/docs/` が green である.
- [x] サーバ / Web 既存テスト全件 green (ドキュメントのみの変更だが念のため `npm test` を実行).
- [x] typecheck / lint 0 エラー.
- [x] auditor にレビュー依頼.

## 補足: 編集対象外ファイル一覧

以下のファイルは旧トークン名を含むが本 BL の編集対象外:

| ファイル | 除外理由 |
| --- | --- |
| `docs/developer/features/app-login/{spec,plan,tasks}.md` | 旧経路を「廃止対象」として名指しする feature 自身 (FR-DOC-3) |
| `docs/developer/features/initial-password-setup/{spec,plan,tasks}.md` | `APP_PASSWORD_HASH` env を「完全廃止対象」として名指しする feature 自身 (FR-DOC-3) |
| `docs/developer/oss/secret-scan-report.md` | 検証 4 ディレクトリの範囲外 / OSS リリース前 secret scan の監査時点記録 (FR-DOC-4) |
| `docs/developer/planning/backlog.md` | BL-082 のスコープで対応済 / status 列の履歴記述として保持 |
