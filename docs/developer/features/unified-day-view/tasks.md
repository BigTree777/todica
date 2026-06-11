# タスク: unified-day-view

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 関連 spec: [`spec.md`](spec.md) (AC-1〜AC-10).

## 設計 / 事前確認

- [x] T-000: AppShell 側の `.app-shell__main` が `<div>` であることを確認 (spec U-1 解消). 結果: `<div>` 確認済み. `<main>` 重複の懸念なし.

## 実装 (test-designer → implementer の順で進める)

### CSS

- [ ] T-001: 新規 `web/src/ui/day-view/day-view.css` を作成し, plan §「day-view.css の最小定義」のセレクタ 7 個 (`.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__form` / `.day-view__list` / `.day-view__card` / `.day-view__card--focus` / `.day-view__empty`) を定義する. visual 詳細 (border / radius / background / shadow) は入れない (D-004 / P-001).

- [ ] T-002: `web/src/ui/today-view/today-view.css` から `.today-view__header` ルールを削除し, `.today-view__completion-count` のみ残す (D-005).

- [ ] T-003: `web/src/ui/tomorrow-view/tomorrow-view.css` をファイルごと削除する (REQ-8).

### tomorrow-view.tsx

- [ ] T-004: `web/src/ui/tomorrow-view/tomorrow-view.tsx` を以下のように改修する (plan §「tomorrow-view.tsx の差分 (要約)」参照):
  - import 差替: `./tomorrow-view.css` → `../day-view/day-view.css`.
  - ルート要素を `<section aria-label="明日のタスク" className="tomorrow-view">` から `<main className="day-view">` へ変更 (REQ-1 / D-006). `aria-label` は撤去.
  - `<h1>明日のタスク</h1>` を `<header className="day-view__header">` でラップ (REQ-2).
  - `<form>` の className を `tomorrow-view__form` → `day-view__form` に置換 (REQ-4).
  - `<p>` 空状態の className を `tomorrow-view__empty` → `day-view__empty` に置換 (REQ-6).
  - `<ul>` の className を `tomorrow-view__list` → `day-view__list` に置換 (REQ-5).
  - 各 `<li>` の className を `tomorrow-view__item` → `day-view__card` に置換 (REQ-5).
  - `<li>` 内部の入れ子 `<div className="tomorrow-view__item-body">` / `<div className="tomorrow-view__actions">` を撤去し, 子要素 (project 名 span / タスク名 span / 各 button) を `<li>` 直下に並べる (REQ-5 / D-007).
  - `<span className="tomorrow-view__project">` / `<span className="tomorrow-view__name">` の className を削除 (素の `<span>` にする / P-003).
  - 動作・ロジック (`useQuery` / `useMutation` / `handleCreate` 等) は無改修.

### today-view.tsx

- [ ] T-005: `web/src/ui/today-view/today-view.tsx` を以下のように改修する (plan §「today-view.tsx の差分 (要約)」参照):
  - import 追加: `import "../day-view/day-view.css";` (既存 `./today-view.css` import は維持).
  - ルート要素を `<main>` → `<main className="day-view">` に変更 (REQ-1).
  - `<header className="today-view__header">` の className を `day-view__header` に置換 (REQ-2). 内部の `<span className="today-view__completion-count">` は維持 (D-005).
  - 「現在のタスク」 `<section aria-label="現在のタスク">` の JSX 並び順を「`<form>` の前 (= `<header>` の直後)」に移動 (REQ-3 / D-002).
  - 同 `<section>` の className に `day-view__card day-view__card--focus` を付与 (REQ-3).
  - `<form aria-label="タスク起票フォーム">` に className `day-view__form` を付与 (REQ-4).
  - `<ul aria-label="タスク一覧">` に className `day-view__list` を付与 (REQ-5).
  - 一覧の各 `<li>` に className `day-view__card` を付与 (REQ-5).
  - 動作・ロジック (focusedId 計算 / `otherTasks` フィルタ / 各 mutation) は無改修.

## テスト

### 単体テスト (新規)

- [ ] T-006: `web/__tests__/unified-day-view.test.tsx` を新規作成し, spec AC-1〜AC-6 に対応するアサーションを記述する (plan §「テスト方針」参照).
  - AC-1: 両ビューのルートが `<main>` で class に `day-view` を含み, `tomorrow-view` クラスが DOM に存在しない.
  - AC-2: 両ビュー 1 段目に `<header class="day-view__header">` があり, today では `<h1>今日</h1>` + completion-count, tomorrow では `<h1>明日のタスク</h1>` のみ.
  - AC-3: focusedTask 有りの today で `<main>` の子要素順序が [header, section[aria-label=現在のタスク], form, ul] かつ section の className に `day-view__card day-view__card--focus` を両方含む.
  - AC-4: focusedTask 無しの today で 「現在のタスク」 region が存在せず, 子要素順序が [header, form, ul].
  - AC-5: 両ビュー `<form>` の className に `day-view__form` を含み `tomorrow-view__form` を含まない.
  - AC-6: 両ビュー `<ul>` の className に `day-view__list`, 各 `<li>` の className に `day-view__card` を含む.
  - 補強: `container.querySelectorAll("main").length === 1` で `<main>` ランドマーク重複が起きていないことを assert (AC-9 前提条件).
  - 補強: tomorrow-view 描画後の `container.outerHTML` に `tomorrow-view__` 文字列が含まれないことを assert (AC-10 前半相当).

### 単体テスト (追従)

- [ ] T-007: `web/__tests__/tomorrow-view.test.tsx` 内で旧クラス名 (`tomorrow-view__form` / `tomorrow-view__list` / `tomorrow-view__item` / `tomorrow-view__item-body` / `tomorrow-view__actions` / `tomorrow-view__empty` / `tomorrow-view__project` / `tomorrow-view__name`) を直接参照しているアサーションがあれば追従修正する (P-004 参照). aria-label / role / accessibleName 依存箇所は無修正.
  - 作業手順: `grep -n "tomorrow-view__" web/__tests__/tomorrow-view.test.tsx` で列挙 → 該当行を新クラス名 (`day-view__*`) または `closest("li")` に書き換え.
  - `aria-label="明日のタスク"` を参照する箇所があれば, `<section>` が `<main>` に変わったため `getByRole("region", { name: "明日のタスク" })` 系は壊れる. 代替として `screen.getByRole("main")` または `getByRole("heading", { name: "明日のタスク" }).closest("main")` で取得する.

- [ ] T-008: `web/__tests__/today-view.test.tsx` 内で `.today-view__header` を参照しているアサーションがあれば `.day-view__header` に追従修正する. 「現在のタスク」 section の位置変更 (REQ-3 / D-002) に依存する順序アサーション (例: `<form>` の `nextSibling` を section と仮定する箇所) があれば追従修正する.

### E2E / a11y / CI スモーク

- [ ] T-009: `npm test -w web` (vitest) が全件 green であることを確認する. 単体テスト + 新規 unified-day-view テストの両方を含む.

- [ ] T-010: `npx playwright test e2e/a11y.spec.ts` が green であることを確認する (AC-9). axe スキャンで violations 0 件.

- [ ] T-011: `grep -rn "tomorrow-view__" web/src/` の出力が 0 件であることを手で確認する (AC-10 前半).

- [ ] T-012: `ls web/src/ui/tomorrow-view/tomorrow-view.css` が exit code 非 0 (= ファイル不在) であることを手で確認する (AC-10 後半).

- [ ] T-013: `npm run lint -w web` と `npm run typecheck` が exit 0 であることを確認する.

## ドキュメント

- [ ] T-014: 実装マージ後, `docs/developer/planning/backlog.md` の BL-051 行を Todo → Done に更新する. メモ欄に PR 番号と「visual 詳細は BL-052」を追記する.

## 仕上げ

- [ ] T-015: spec.md AC-1〜AC-10 を 1 項目ずつチェックし, すべて満たされていることを確認する.
- [ ] T-016: PR 本文に「視覚的な縁取り / 角丸 / カード装飾は BL-052 で別途入れる前提. 本 BL では一時的にカードの枠が消える」と明示する (リスク R-1 緩和).
- [ ] T-017: auditor にレビュー依頼.

## 追従タスク

- [x] T-018: BL-046 の `web/__tests__/design-tokens.test.ts` `TARGET_CSS_FILES` 配列から `ui/tomorrow-view/tomorrow-view.css` を削除する (BL-051 で同 CSS をファイルごと削除したことに伴う ENOENT fail の解消).
