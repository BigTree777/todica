# タスク: 完了タスク数カウンタの中央配置 + アクセント色強調

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [x] `web/src/ui/today-view/today-view.tsx` の `<header className="day-view__header">`
      (line 497 周辺) を `<header className="day-view__header day-view__header--today">` に
      変更する。マークアップ構造 (子要素 = `<h1>` + `<span>` の 2 要素) は維持する。
- [x] `web/src/ui/today-view/today-view.css` に新規ルール `.day-view__header--today` を追加し、
      `flex-direction: column` と `align-items: stretch` を宣言する
      (plan.md 「CSS の変更」セクション参照)。
- [x] `web/src/ui/today-view/today-view.css` の既存ルール `.today-view__completion-count` の
      宣言を書き換える:
      - `font-size: var(--font-size-small)` → `font-size: var(--font-size-h2)`
      - `color: var(--color-fg-subtle)` → `color: var(--color-accent)`
      - 新規追加: `text-align: center`
- [x] `web/src/ui/day-view/day-view.css` (共通) は **変更しない** ことを確認する
      (tomorrow ビュー非波及の前提)。

## テスト

### 新規テスト (test-designer 範囲: 失敗するテストを先に用意)

- [x] `today-view.test.tsx` に「today header に modifier クラス `day-view__header--today` が
      付与されている」シナリオを追加する (spec.md §「配置 (REQ-1 / REQ-5 / REQ-6)」)。
- [x] tomorrow ビュー側 (`tomorrow-view.test.tsx` または `unified-day-view.test.tsx`) に
      「tomorrow header には `day-view__header--today` modifier が付かない」シナリオを追加する。
- [x] `web/__tests__/` に CSS 文面検証テストを追加する
      (新規ファイル `completion-counter-emphasis.test.ts` 等):
  - `today-view.css` の `.today-view__completion-count` ルール本体に
    `font-size: var(--font-size-h2)` が含まれる。
  - 同ルール本体に `color: var(--color-accent)` が含まれる。
  - 同ルール本体に `text-align: center` が含まれる。
  - 同ファイルに `.day-view__header--today` ルールが存在し、本体に
    `flex-direction: column` が含まれる。
  - `web/src/ui/day-view/day-view.css` の `.day-view__header` ルール本体に
    `flex-direction: column` が **含まれない** (tomorrow 非波及の回帰ガード)。

### 既存テスト green 維持確認 (implementer 範囲)

- [x] `web/__tests__/today-view.test.tsx` の以下の describe が全件 green であることを確認する:
  - `describe("TodayView (BL-008 今日の完了数表示)")` (5 シナリオ)
  - `describe("TodayView (BL-047 完了タスク数カウンタの配置見直し)")`
    (header 内配置 / `<span>` タグ / focus & tomorrow 非存在)
  - `describe("TodayView (BL-050 today ヘッダの「＋プロジェクトの追加」ボタン撤去)")`
    特に「ヘッダの直接の子要素は h1 と カウンタ <span> の 2 要素のみ」シナリオ
    (childCount === 2 が崩れていないことの確認)
- [x] `web/__tests__/unified-day-view.test.tsx` の以下が green であることを確認する:
  - 「/today 1 段目に `<header class='day-view__header'>` があり, h1 と
    today-view__completion-count を含む」
  - 「/tomorrow 1 段目に `<header class='day-view__header'>` があり, h1 ' 明日のタスク' のみを含む」
    (tomorrow header に today-view__completion-count が **含まれない** ことを含む)
  - 「day-view.css が REQ-7 の維持セレクタを含む (BL-059 追従)」
- [x] `web/__tests__/tomorrow-view.test.tsx` の既存シナリオが全件 green であることを確認する
      (tomorrow header に視覚変化が出ていないことの担保)。
- [x] `web/__tests__/design-tokens.test.ts` の `--color-accent` / `--font-size-h2` / 
      `--color-fg-subtle` / `--font-size-small` 定義検証が全件 green であることを確認する
      (本 BL では token を追加しないが、参照先を切り替えるため一応確認)。
- [x] E2E `e2e/state-restoration.spec.ts` の「今日の完了: N」テキスト復元検証が green である
      ことを確認する。
- [x] E2E `e2e/remove-inline-project-create.spec.ts` の `headerInfo.childCount === 2` /
      `firstTag === "H1"` / `secondTag === "SPAN"` / `secondAriaLabel === "今日の完了タスク数"`
      検証が全件 green であることを確認する。

### 全件実行

- [x] リポジトリルートから `npx vitest run` で vitest 全件 green を確認する。
- [x] `npm -w e2e test` で Playwright 全件 green を確認する。

## ドキュメント

- [x] `docs/developer/planning/backlog.md` の BL-105 行を `Todo` → `Done` (またはプロジェクトの
      規約に従う適切なステータス) に更新する (実装完了後)。

## 仕上げ

- [x] 受け入れ基準 (spec.md §「受け入れ基準」) の全シナリオを満たすことを確認する。
- [x] `web/src/ui/day-view/day-view.css` を変更していないことを `git diff` で再確認する
      (tomorrow / projects / routines への副作用ゼロの担保)。
- [x] auditor へレビュー依頼する。
