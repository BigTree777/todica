# タスク: view-title-center-align

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 0. 仕様確定 (project-designer)

- [x] `_template/` をコピーして `docs/developer/features/view-title-center-align/` を作成.
- [x] `spec.md` (REQ-1〜REQ-7, NFR-*, AC-h1-center / AC-no-regression / AC-no-global-h1 / AC-no-class-shadow / AC-trash-header-preserved, UND-1〜UND-3) を作成.
- [x] `plan.md` (方針 (a) 採用根拠, CSS の変更 6 箇所, D-001〜D-004, R-1〜R-3, ALT-1〜ALT-3, テスト方針) を作成.
- [x] `tasks.md` (本ファイル) を作成.

## 1. 失敗するテストの作成 (test-designer)

- [x] `web/__tests__/view-title-center-align.test.ts` を新規作成する.
  - 形式は `web/__tests__/completion-counter-emphasis.test.ts` と同形 (`extractRuleBody` ヘルパ + `readFileSync` + 正規表現 assert).
  - 文頭コメントに「本ファイルは TDD の red を作るためのテスト」と明記し, spec / plan / tasks への参照を入れる.
- [x] 次の assert を組み込む.
  - [x] AC-h1-center-1: `web/src/ui/day-view/day-view.css` の `.day-view__header h1` ルール本文に `text-align: center` を含む (REQ-1 / REQ-2).
  - [x] AC-h1-center-2: `web/src/ui/projects-view/projects-view.css` の `.projects-view h1` ルール本文に `text-align: center` を含む (REQ-3).
  - [x] AC-h1-center-3: `web/src/ui/routines-view/routines-view.css` の `.routines-view h1` ルール本文に `text-align: center` を含む (REQ-4).
  - [x] AC-h1-center-4: `web/src/ui/focus-view/focus-view.css` の `.focus-view h1` ルール本文に `text-align: center` を含む (REQ-5).
  - [x] AC-h1-center-5: `web/src/ui/settings-view/settings-view.css` の `.settings-view h1` ルール本文に `text-align: center` を含む (REQ-6).
  - [x] AC-h1-center-6: `web/src/ui/trash-view/trash-view.css` の `.trash-view__header h1` ルール本文に `text-align: center` を含む (REQ-7).
  - [x] AC-no-regression: 上記 6 ルール全てに `font-size: var(--font-size-h1)` が依然含まれる (非ゴール遵守).
  - [x] AC-no-global-h1: `web/src/styles/tokens.css` / `web/src/styles/button.css` の文面に `h1 {` パターンを含む CSS ルールが存在しない (NFR-NO-GLOBAL-H1).
  - [x] AC-no-class-shadow: `web/src/ui/{today,tomorrow,projects,routines,focus,settings,trash}-view/*.tsx` に `view-title` 文字列がヒットしない (NFR-NO-COMMON-CLASS).
  - [x] AC-trash-header-preserved: `.trash-view__header` ルール本文に `display: flex` と `justify-content: space-between` が残っている (NFR-PRESERVE-LAYOUT / UND-1).
- [x] ルートから `npx vitest run web/__tests__/view-title-center-align.test.ts` を実行して **red (失敗) になる**ことを確認する. 期待される失敗内訳:
  - 6 ファイルの h1 ルールはどれも `text-align: center` を未宣言なので AC-h1-center-1〜6 が red.
  - AC-no-regression / AC-no-global-h1 / AC-no-class-shadow / AC-trash-header-preserved は最初から green の想定 (= 回帰ガード). もし最初から red ならテスト設計のミス.

## 2. 実装 (implementer)

> 実装手段は管理者が選定する (codex-rescue 直接呼び出し or implementer サブエージェント). このタスクは選定後の担当者が実行する.

- [x] `web/src/ui/day-view/day-view.css` の `.day-view__header h1` ルール本体に `text-align: center;` を追加 (REQ-2). コメント `/* BL-111 / REQ-2 追加 */` を併記.
- [x] `web/src/ui/projects-view/projects-view.css` の `.projects-view h1` ルール本体に `text-align: center;` を追加 (REQ-3). コメント `/* BL-111 / REQ-3 追加 */` を併記.
- [x] `web/src/ui/routines-view/routines-view.css` の `.routines-view h1` ルール本体に `text-align: center;` を追加 (REQ-4). コメント `/* BL-111 / REQ-4 追加 */` を併記.
- [x] `web/src/ui/focus-view/focus-view.css` の `.focus-view h1` ルール本体に `text-align: center;` を追加 (REQ-5). コメント `/* BL-111 / REQ-5 追加 */` を併記.
- [x] `web/src/ui/settings-view/settings-view.css` の `.settings-view h1` ルール本体に `text-align: center;` を追加 (REQ-6). コメント `/* BL-111 / REQ-6 追加 */` を併記.
- [x] `web/src/ui/trash-view/trash-view.css` の `.trash-view__header h1` ルール本体に `text-align: center;` を追加 (REQ-7). コメント `/* BL-111 / REQ-7 追加 */` を併記.
- [x] 上記 6 ファイル以外 (DOM / TSX / tokens.css / button.css / styles 配下 / app-shell.css / today-view.css の `.today-view__completion-count` / `.day-view__header--today` 等) は **一切触らない**.
- [x] ルートから `npx vitest run web/__tests__/view-title-center-align.test.ts` を実行して **全件 green** になることを確認する.
- [x] ルートから `npx vitest run` を実行して全件 green を確認する (既存テスト無回帰).

## 3. 監査 (auditor)

- [x] spec (REQ-1〜REQ-7 / NFR-* / AC-*) と CSS 実体の対応関係を確認する.
- [x] 各 view CSS の h1 ルール本体に `text-align: center;` が **過不足なく** 1 宣言ずつ追加されていることを確認する.
- [x] DOM (各 view TSX) / tokens.css / 共通 styles / app-shell / `.day-view__header--today` / `.today-view__completion-count` / `.trash-view__header` 本体が **一切改修されていない**ことを確認する.
- [x] `web/__tests__/view-title-center-align.test.ts` が spec の AC-* を漏れなく覆っていることを確認する (CSS 文面 assert + global h1 ガード + 共通クラス未付与ガード + trash header 不変ガード).
- [x] vitest 全件 / Playwright 全件 / lint / typecheck の green を確認する.
- [x] spec.md UND-1 (`/trash` ヘッダの全削除 button 存在時の中央配置受容) の方針を実装が踏襲していることを確認する. 必要なら別 BL 起票の要否を提示する.

## 4. ドキュメント

- [x] backlog (`docs/developer/planning/backlog.md`) の BL-111 行を `Todo` → `Done` に更新する (PR マージ時). 詳細欄に方針 (a) 採用と CSS 6 ファイル変更の要約を記載する.
- [x] 関連 ADR は **作成しない** (D-001 で「ADR 化は不要」と判断済).

## 5. 仕上げ

- [x] 受け入れ基準 (spec.md AC-*) を全て満たすことを確認.
- [x] feature ブランチ `feature/view-title-center-align` で PR を作成し, auditor レビュー後 squash merge + branch 削除.
