# タスク: TaskCard / TaskFormCard 実機遺漏の一括 hotfix (task-card-hotfix)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

### CSS (`web/src/ui/task-card/task-card.css` 既存追記)

- [x] T-01: `.task-card__header__priority { margin-left: auto }` を `.task-card__header` ルールの直下に追加 (REQ-1 / 1-2 / P-003).
- [x] T-02: `.task-card__header .project-chip { font-size: var(--font-size-small) }` を `.task-card__header__priority` の直下に追加 (REQ-3 / 3-1 / P-003).
- [x] T-03: `.task-card__title input[type="text"]::placeholder { color: var(--color-fg-subtle) }` を `.task-card__title input[type="text"]` ルールの直下に追加 (REQ-4 / 4-5 / P-003 / P-008).
- [x] T-04: `.task-card__actions` ルール本文から `justify-content: center` を**撤去**する (REQ-2 / 2-2 / P-004).
- [x] T-05: `.task-card__actions__delete { margin-right: auto }` を `.task-card__actions` ルールの直下に追加 (REQ-2 / 2-3 / P-003).
- [x] T-06: `.task-card__actions__complete { margin-left: auto }` を T-05 の直下に追加 (REQ-2 / 2-4 / P-003).
- [x] T-07: `.task-card--form .task-card__actions { justify-content: flex-end }` を T-06 の直下に追加 (REQ-5 / 5-1 / P-003).
- [x] T-08: `.visually-hidden` ルールをファイル末尾に新規追加する (REQ-4 / 4-4 / D-004 / P-003 / P-005).
  - `position: absolute` / `width: 1px` / `height: 1px` / `padding: 0` / `margin: -1px` / `overflow: hidden` / `clip: rect(0, 0, 0, 0)` / `white-space: nowrap` / `border: 0` の 9 宣言.
- [x] T-09: `.task-card` 系セレクタに `:hover` / `:focus-within` / `transition` / `animation` / `box-shadow` を追加していないことを目視確認 (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION / AC-22).

### コンポーネント (`web/src/ui/task-card/task-card.tsx` 既存改修)

- [x] T-10: header 段の `<PriorityStars ... />` を `<div className="task-card__header__priority"> ... </div>` でラップする (REQ-1 / 1-1 / P-001 / P-006).
- [x] T-11: 「削除」 button に `className="task-card__actions__delete"` を付与する (REQ-2 / 2-1 / P-002).
- [x] T-12: 「完了」 button に `className="task-card__actions__complete"` を付与する (REQ-2 / 2-1 / P-002).
- [x] T-13: TaskCardProps の型定義 / export 形に**変更が無い**ことを確認する (NFR-API-FROZEN / AC-16).
- [x] T-14: 「現在のタスクにする」「明日にする」「今日にする」 button にこれらの hotfix className を**付与しない**ことを確認する (AC-7 / AC-8 / D-002).

### コンポーネント (`web/src/ui/task-card/task-form-card.tsx` 既存改修)

- [x] T-15: `<label htmlFor={inputId}>タスク名</label>` に `className="visually-hidden"` を追加する (REQ-4 / 4-1).
- [x] T-16: 同 `<input>` 要素に `placeholder="タスク名"` を追加する (REQ-4 / 4-2).
- [x] T-17: `<label htmlFor>` ↔ `<input id>` の関連付けが保持されていることを確認 (NFR-LABEL-PRESERVE / REQ-4-3 / AC-12 / AC-21).
- [x] T-18: TaskFormCardProps の型定義 / export 形に**変更が無い**ことを確認 (NFR-API-FROZEN / AC-16).
- [x] T-19: TaskFormCard の `<PriorityStars />` を**ラップしない**ことを確認する (P-007). 起票カードでは ProjectToggle (左) + PriorityStars (右) の構成で `.task-card__header { justify-content: space-between }` が成立するため.

### 各 view (無改修)

- [x] T-20: `web/src/ui/today-view/today-view.tsx` を**変更しない**. `<TaskCard>` / `<TaskFormCard>` の呼び出し側 props 無改修 (G-7).
- [x] T-21: `web/src/ui/tomorrow-view/tomorrow-view.tsx` を**変更しない** (G-7).
- [x] T-22: `web/src/ui/focus-view/focus-view.tsx` を**変更しない** (G-7).

### 周辺ファイル (無改修)

- [x] T-23: `web/src/ui/priority-stars/priority-stars.tsx` を**変更しない** (REQ-7 / G-8 / AC-17).
- [x] T-24: `web/src/ui/project-toggle/project-toggle.tsx` を**変更しない** (REQ-7 / G-8 / AC-17).
- [x] T-25: `web/src/ui/project-toggle/project-toggle.css` を**変更しない**. 既存 `.project-toggle__button` ルールおよび `[data-visually-hidden]` ルールを保持 (REQ-7 / G-8 / AC-17).
- [x] T-26: `web/src/ui/day-view/day-view.css` の `.project-chip` ルール本文を**変更しない** (REQ-7 / G-8 / NFR-CHIP-PRESERVE / AC-17).
- [x] T-27: `web/src/styles/tokens.css` を**変更しない** (REQ-8 / G-9 / NFR-NO-NEW-TOKENS / AC-18).

## テスト

### 新規テスト (`web/__tests__/task-card-hotfix.test.tsx`)

- [x] T-28: テストファイル骨格 (extractRuleBody ヘルパ / repoRoot / path 定数) を BL-059 (`task-card-component.test.tsx`) と同じスタイルで用意する (D-006).

#### CSS 直読み系 assert

- [x] T-29: AC-1 系: `.task-card__header__priority` ルール本文に `margin-left: auto` が存在することを assert.
- [x] T-30: AC-4 系: `.task-card__actions` ルール本文に `justify-content: center` も `justify-content: flex-end` も**含まれない**ことを assert (回帰防止).
- [x] T-31: AC-5 系: `.task-card__actions__delete` ルール本文に `margin-right: auto` が存在することを assert.
- [x] T-32: AC-6 系: `.task-card__actions__complete` ルール本文に `margin-left: auto` が存在することを assert.
- [x] T-33: AC-9 系: `.task-card__header .project-chip` セレクタが定義され, ルール本文に `font-size: var(--font-size-small)` が存在することを assert.
- [x] T-34: AC-11 系: `.visually-hidden` ルール本文に `position: absolute` / `width: 1px` / `height: 1px` / `clip: rect(0, 0, 0, 0)` (または等価) / `overflow: hidden` が存在することを assert.
- [x] T-35: AC-13 系: `.task-card__title input[type="text"]::placeholder` ルール本文に `color: var(--color-fg-subtle)` が存在することを assert.
- [x] T-36: AC-14 系: `.task-card--form .task-card__actions` ルール本文に `justify-content: flex-end` が存在することを assert.
- [x] T-37: AC-17 系: `.project-chip` 本体 (day-view.css) と `.project-toggle__button` 本体 (project-toggle.css) と priority-stars.tsx / project-toggle.tsx の `export interface` 行が BL-059 完了時点の状態を保持していることを `readFileSync` + 文字列含有で assert.
- [x] T-38: AC-18 系: tokens.css に本 BL 参照の `--font-size-small` / `--font-size-h2` / `--color-fg-subtle` 等が引き続き定義されていることを assert.
- [x] T-39: AC-20 系: `.task-card--focus { border-width: 3px }` / `.task-card__header { justify-content: space-between }` / `.task-card__title { font-size: var(--font-size-h2) }` / `.task-card__title input[type="text"] { font: inherit }` が引き続き存在することを assert.
- [x] T-40: AC-22 系: task-card.css 全体で `box-shadow` / `transition` / `animation` キーワードが存在せず, `.task-card:hover` 等の `:hover` セレクタが存在しないことを assert.

#### jsdom DOM レンダ系 assert

- [x] T-41: AC-2 系: `<TaskCard showPriority={true} project={null} ... />` を render し, `.task-card__header__priority` 要素が存在しその中に `role="radiogroup"` が居て, chip 要素 (`.project-chip`) が存在しないことを assert.
- [x] T-42: AC-3 系: 同条件で `getComputedStyle` で `.task-card__header__priority` の `margin-left` が "auto" に解決されることを assert (jsdom 計算範囲内).
- [x] T-43: AC-7 系: `<TaskCard actionSet="full" showSetFocus={true} ... />` を render し, 削除 button に className "task-card__actions__delete" が含まれ, 完了 button に className "task-card__actions__complete" が含まれ, 「現在のタスクにする」「明日にする」 button にはこれらが**含まれない**ことを assert.
- [x] T-44: AC-8 系: `<TaskCard actionSet="minimal" showSetFocus={false} ... />` を render し, 削除 / 完了 button にそれぞれの hotfix className が含まれ, 「明日にする」「今日にする」「現在のタスクにする」 button が存在しないことを assert.
- [x] T-45: AC-10 系: `<TaskFormCard projects={[{id:"p1",name:"仕事"}]} projectId="p1" ... />` を render し, ProjectToggle button (`.project-toggle__button.project-chip`) の `getComputedStyle` で font-size が `--font-size-small` に解決されることを assert (jsdom 限界がある場合は CSS 直読み AC-9 で代替する旨をコメントで明記).
- [x] T-46: AC-12 系: `<TaskFormCard inputId="task-name" ... />` を render し, `<label for="task-name">` に className "visually-hidden" が含まれ, テキストが「タスク名」であり, `<input id="task-name">` に placeholder="タスク名" が含まれ, `getByLabelText("タスク名")` で input が取得可能であることを assert.
- [x] T-47: AC-15 系: `<TaskFormCard ... />` を render し, ルート `<form>` 内の `.task-card__actions` に type="submit" かつテキスト「追加」の button が 1 個だけ存在することを assert.
- [x] T-48: AC-16 系: task-card.tsx / task-form-card.tsx を `readFileSync` で読み, `TaskCardProps` / `TaskFormCardProps` の export 型を文字列含有で確認 (= BL-059 完了時点の 14 / 11 フィールドが含まれること).
- [x] T-49: AC-19 系: focus-view を render し (focusedTask あり), `.task-card__actions` 内 button が「削除 (task-card__actions__delete)」「完了 (task-card__actions__complete)」の 2 件のみで, 「明日にする」「今日にする」「現在のタスクにする」が存在しないことを assert.
- [x] T-50: AC-21 系: today / tomorrow を render し, `getByLabelText("タスク名")` で input が取得可能で, htmlFor + id 関連付けが維持されていることを assert.

#### view 適用 (readFileSync 系)

- [x] T-51: today-view.tsx / tomorrow-view.tsx / focus-view.tsx に**本 BL での変更が無い**ことを確認する (= BL-059 完了時点のソースを保持). この assert は不要 (実装が触らないだけで, テストとしては既存 BL-059 のテストでカバー済み). 念のため tasks 一覧上で確認のみ.

### 既存テストへの追従修正

- [x] T-52: `web/__tests__/task-card-component.test.tsx` (BL-059 / 108 件) のうち, `.task-card__actions` の `justify-content: center` が含まれる ことを期待する it (= BL-059 AC-5 系) を**逆転**修正する (D-007 / P-009).
  - 修正方法: 「`justify-content: center` を含む」期待を「`justify-content: center` を含まない」期待に書き換え.
  - 「`justify-content: flex-end` を含まない」期待は維持.
  - it のタイトルを「BL-059 V-2 で actions center を確定」から「BL-063 hotfix REQ-2 で actions center を撤去」に変更, または同等のコメント追記.
- [x] T-53: `web/__tests__/task-card-component.test.tsx` で `.task-card__header` の直下に radiogroup が居ることを期待する DOM 構造 assert があれば, `.task-card__header__priority` を経由する形に追従修正する (R-003 緩和).
- [x] T-54: `web/__tests__/task-card-component.test.tsx` で `<TaskFormCard>` の `<label>タスク名</label>` の visibility / className を見ている箇所があれば, visually-hidden の付与に追従修正する.

### E2E

- [x] T-55: `e2e/tasks.spec.ts` を実行し, 削除 / 完了 / 明日にする の button テキストベースのロケータが引き続き機能することを確認 (R-003 緩和).
- [x] T-56: `e2e/today-view-create-form.spec.ts` を実行し, label を visually-hidden 化しても `getByLabel("タスク名")` / `getByPlaceholder("タスク名")` で input が取得可能であることを確認 (R-004 緩和).
- [x] T-57: `e2e/a11y.spec.ts` を実行し WCAG 2.1 AA で violations 0 件を維持していることを確認 (NFR-A11Y / G-10 / AC-25 / R-004 / R-005 緩和).
- [x] T-58: その他 E2E (`e2e/state-restoration.spec.ts` 等) が green であることを確認 (回帰防止).

## ドキュメント

- [x] T-59: 関連ドキュメント (API / schema / user ガイド) への影響は**無い**ことを確認する (presentation 層のみの変更).
- [x] T-60: ADR 起票は本 BL では**不要** (大きな設計判断は spec D 章 / plan P 章で吸収済み. 5 修正の hotfix で新規の方針確立は無い).

## 仕上げ

- [x] T-61: spec.md の受け入れ基準 AC-1 〜 AC-25 を全て満たすことを確認する.
- [x] T-62: lint / typecheck が green であることを確認する.
- [x] T-63: 単体テスト全件 + E2E 全件 green を確認する (= 「テストが通る == 機能が実装されている」).
- [x] T-64: 実機 (`npm run dev`) で 5 修正が全て反映されていることを目視確認する.
  - 修正 1: project 未設定タスクで PriorityStars が右にある.
  - 修正 2: タスクカードで 削除 左 / 中間 中央 / 完了 右. focus-view で 削除 左 / 完了 右.
  - 修正 3: 起票カード内のプロジェクト名 chip テキストがタスクカード chip と同じサイズ (14px).
  - 修正 4: 起票カードのタスク名 input に「タスク名」が薄く placeholder で表示され, 専用 label は視覚的に見えない.
  - 修正 5: 起票カードの「追加」 button が右端に配置される.
- [x] T-65: auditor へレビュー依頼する.
