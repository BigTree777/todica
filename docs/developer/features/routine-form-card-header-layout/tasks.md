# タスク: RoutineFormCard レイアウト刷新

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 1. 事前調査 (test-designer / implementer 共通)

- [x] 既存テスト 4 ファイルで `.routine-card__form-row` / `.routine-card__form-row--name` /
  `.routine-card__form-row--options` セレクタを参照している箇所を grep で洗い出す
  - 対象: `web/__tests__/routine-card-component.test.tsx` (BL-061) /
    `routine-card-edit-fields.test.tsx` (BL-068) /
    `routine-card-edit-priority.test.tsx` (BL-069) /
    `routine-card-header-layout.test.tsx` (BL-071)
- [x] BL-071 の `routine-card-header-layout.test.tsx` AC-10 / AC-11 で「起票カードに
  `.routine-card__form-row--name` と `.routine-card__form-row--options` の 2 段が存在する」
  と assert している箇所を確認 (= 本 BL で書き換えが必要)
- [x] `web/src/ui/routine-card/routine-card.css` の現状で `.routine-card__form-row` の
  宣言ブロックがあること, `.routine-card__form-row--name` /
  `.routine-card__form-row--options` の modifier 専用宣言ブロックが**無い**ことを確認
- [x] `web/src/styles/tokens.css` に `--font-size-h2: 20px` が現存することを確認 (= 既存値で動く)
- [x] vitest.config.ts に `css: true` が設定されていることを確認 (= AC-10 の computed style 検証が動く前提)
- [x] `web/src/ui/task-card/task-form-card.tsx` の DOM 構造を参照し,
  `.task-card__header` / `.task-card__title` / `.task-card__actions` の 3 段イディオムを
  踏襲する形を確認 (= 機構の出典)

## 2. テスト設計 (test-designer)

### 2.1. 新規テスト追加

- [x] `web/__tests__/routine-form-card-header-layout.test.tsx` を新規作成
  - [x] **CSS 直読み** (file read + 正規表現) で以下を assert:
    - [x] AC-6: `.routine-card__title` ルールセットに `font-size: var(--font-size-h2)` が宣言されている
    - [x] AC-7: `.routine-card__header` の BL-071 5 宣言 (display: flex / align-items: center /
      justify-content: space-between / gap: var(--space-sm) / font-size: var(--font-size-h2))
      が無改修で維持されている
      + `.routine-card--form .routine-card__header` の override セレクタは
      `justify-content: flex-end` の 1 宣言のみで, 他の 5 宣言を上書きしていない
    - [x] AC-8: `.routine-card__form-row` セレクタを定義する宣言ブロックが完全撤去されている
    - [x] AC-9: `.routine-card--form { flex-direction: column; align-items: stretch }` 維持
    - [x] D-006 追加: `.routine-card--form .routine-card__header { justify-content: flex-end }` 宣言の存在
    - [x] D-007 追加: `.routine-card--form .routine-card__actions { justify-content: flex-end }` 宣言の存在
  - [x] **jsdom DOM レンダ** で以下を assert (failing 状態):
    - [x] AC-1: form 直下 `.routine-card__header` 要素が存在し PriorityStars (radiogroup) を含む
    - [x] AC-2: `.routine-card__title` 要素が存在し visually-hidden label と
      `<input id="routine-name">` の両方を含む
    - [x] AC-3: form 直下に `.routine-card__header` / `.routine-card__title` /
      `.routine-card__day-checkboxes` / `.routine-card__actions` の 4 要素のみが順に並ぶ
    - [x] AC-4: `.routine-card__form-row*` 系の class 名にマッチする要素が DOM に存在しない
    - [x] AC-5: 「追加」 button が `.routine-card__actions` 直下に位置し
      `.routine-card__title` には含まれない
    - [x] AC-11: `<RoutineCard>` (表示カード) の DOM 構造が BL-071 の 3 段で不変
    - [x] AC-13: 「追加」 button click で onSubmit が 1 回呼ばれる
    - [x] AC-14: name input への入力で onNameChange が段階的に呼ばれる
    - [x] AC-15: 曜日 checkbox click で onToggleDay(day) が呼ばれる
    - [x] AC-16: PriorityStars click で onDefaultPriorityChange(priority) が呼ばれる
    - [x] AC-17: daysOfWeek={[1, 3, 5]} で月・水・金のみ checked=true
    - [x] AC-18: name input の required 属性が true
    - [x] AC-19: form aria-label が "ルーティン作成フォーム"
    - [x] AC-20: visually-hidden label `htmlFor="routine-name"` が name input と紐づく
    - [x] AC-21: PriorityStars accessibleName が "優先度" / idPrefix が "routine-create"
    - [x] AC-22: 表示カード `routine-name-r-1` と起票カード `routine-name` の id が両立し
      重複しない
    - [x] AC-23: `.routine-card__header` の直下子要素が PriorityStars のみ
  - [x] **getComputedStyle** で以下を assert:
    - [x] AC-10: name input の computed font-size が 20px と一致
    - [x] AC-12: 表示カード `<RoutineCard>` の name input の computed font-size が 20px (= BL-071 維持)

### 2.2. 既存テストの追従

- [x] `routine-card-component.test.tsx` (BL-061): `.routine-card__form-row` 系 assert を新構造に書き換え
- [x] `routine-card-edit-fields.test.tsx` (BL-068): 起票カード DOM 階層 assert があれば追従
- [x] `routine-card-edit-priority.test.tsx` (BL-069): 起票カード PriorityStars の親 assert を
  `.routine-card__header` に書き換え (該当があれば)
- [x] `routine-card-header-layout.test.tsx` (BL-071):
  - AC-10 「`.routine-card--form` は flex-direction: column を維持する」は本 BL でも維持なので無改修.
  - AC-11 「RoutineFormCard の DOM 構造が既存と変わらない」のうち
    「`.routine-card__form-row--name` と `.routine-card__form-row--options` の 2 段が存在する」 assert は
    本 BL で構造変更されるため `.routine-card__header` / `.routine-card__title` /
    `.routine-card__day-checkboxes` / `.routine-card__actions` の 4 段に書き換え.

### 2.3. テスト全件赤確認

- [x] `npm test -w web` を実行し, **新規** test がすべて failing で止まることを確認
  (= 実装前の TDD 状態 / 既存テストは追従後に再評価)

## 3. 実装 (implementer)

### 3.1. CSS (`web/src/ui/routine-card/routine-card.css`)

- [x] `.routine-card__title` ルールセットを新設:
  - `display: flex`
  - `align-items: center`
  - `font-size: var(--font-size-h2)`
- [x] `.routine-card--form .routine-card__header { justify-content: flex-end }` を追加 (D-006)
- [x] `.routine-card--form .routine-card__actions { justify-content: flex-end }` を追加 (D-007)
- [x] `.routine-card__form-row` ルールセットを完全撤去
- [x] 以下は無改修:
  - `.routine-card` (BL-071: flex column / gap: --space-md)
  - `.routine-card--form` (flex-direction: column / align-items: stretch)
  - `.routine-card__header` (BL-071 で確定した 5 宣言)
  - `.routine-card__day-checkboxes`
  - `.routine-card__actions`
  - `.routine-card__input` (font: inherit + font-size: var(--font-size-h2) + flex: 1 + ::placeholder)
  - `.routine-card__submit`
  - `.visually-hidden`

### 3.2. JSX (`web/src/ui/routine-card/routine-form-card.tsx`)

- [x] root `<form>` の className / aria-label / onSubmit は無改修
- [x] 外側 `.routine-card__form-row routine-card__form-row--name` div を撤去
- [x] 外側 `.routine-card__form-row routine-card__form-row--options` div を撤去
- [x] `.routine-card__header` div を新設:
  - 直下子は `<PriorityStars value={defaultPriority} onChange={onDefaultPriorityChange}
    groupLabel="優先度" idPrefix="routine-create" />` のみ
- [x] `.routine-card__title` div を新設:
  - 直下子は `<label htmlFor={inputId} className="visually-hidden">ルーティン名</label>` +
    `<input id={inputId} type="text" className="routine-card__input" value={name}
    placeholder="ルーティン名" onChange={(e) => onNameChange(e.target.value)} required />`
- [x] `.routine-card__day-checkboxes` div を `.routine-card` 直下 (title 段の下) に位置移動.
  既存の `role="group" aria-label="曜日"` + 7 個の `<label><input type="checkbox" .../>` は無改修
- [x] `.routine-card__actions` div を新設し, 直下子に
  `<button type="submit" className="routine-card__submit">追加</button>` のみを置く
- [x] 上部 jsdoc の「2 段構成 (V-1)」記述を「4 段構成 (BL-072)」に書き換え, 仕様参照行に
  `docs/developer/features/routine-form-card-header-layout/spec.md REQ-1` を追加
- [x] import 文 / `RoutineFormCardProps` 型 / 関数シグネチャ / default 値は無改修 (D-009)

### 3.3. 表示カード `<RoutineCard>` 無改修

- [x] `web/src/ui/routine-card/routine-card.tsx` を変更しないことを確認
- [x] AC-11 / AC-12 で表示カードの DOM 構造と font-size が変わらないことを目視・テストで確認

### 3.4. 親 view 無改修

- [x] `web/src/ui/routines-view/routines-view.tsx` の `<RoutineFormCard ... />` 呼び出し JSX を
  変更しないことを確認 (D-009 / NFR-2)

## 4. 検証

### 4.1. 単体テスト

- [x] `npm test -w web` 全件 green
- [x] 新規 `routine-form-card-header-layout.test.tsx` がすべて green
- [x] 既存 routine-card 系テスト 4 ファイル (BL-061 / BL-068 / BL-069 / BL-071) が
  追従後に全件 green

### 4.2. E2E

- [x] `npx playwright test` 全件 green
- [x] `e2e/routines.spec.ts` 無修正で green
- [x] `e2e/routine-card-edit-fields.spec.ts` 無修正で green
- [x] `e2e/routine-card-edit-priority.spec.ts` 無修正で green
- [x] `e2e/a11y.spec.ts` で violations 0 件

### 4.3. 静的検査

- [x] `npm run lint` exit 0
- [x] `npm run typecheck` exit 0

### 4.4. 目視

- [ ] dev server (`npm run dev -w web`) を起動して `/routines` を開く
- [ ] 起票カード上段 (header) の **右上に PriorityStars** が並ぶことを目視
- [ ] 起票カードの **name input フォントが現状より大きく** (20px) 表示されていることを目視
- [ ] 起票カードの **「追加」 button が右下** (actions 段右端) に独立して並ぶことを目視
- [ ] 起票カードの曜日 checkbox 群が day-checkboxes 段に横並びで表示されることを目視
- [ ] 表示カード (一覧の各ルーティン) の見た目が BL-071 から変わらないことを目視
  (PriorityStars が右上 / name input 20px / 曜日 / 削除 button)
- [ ] 表示カードと起票カードを並べて, PriorityStars が両方とも **同じ位置 (カード右上)**
  に並んで見えることを確認 (= 本 BL のゴール)

## 5. ドキュメント

> 方針: BL-071 で BL-061 / BL-068 / BL-069 / BL-070 spec に注釈を入れた前例に合わせ,
> 関連 BL spec への注釈 1 行追記を本 BL でも行う. トレーサビリティ確保のため.

- [x] BL-061 spec.md (`docs/developer/features/routine-card-component/spec.md`) に
  「BL-072 で起票カード `<RoutineFormCard>` が 4 段構造 (header / title / day-checkboxes / actions)
  に再編される. RoutineFormCardProps の API は無改修」の注釈を 1 行追記.
- [x] BL-068 spec.md (`docs/developer/features/routine-card-edit-fields/spec.md`) に
  「BL-072 で起票カードの PriorityStars が `.routine-card__header` 段に移動. groupLabel / idPrefix は無改修」
  の注釈を 1 行追記.
- [x] BL-069 spec.md (`docs/developer/features/routine-card-edit-priority/spec.md`) に
  「BL-072 で起票カードのレイアウトのみ変更. 編集モードの PriorityStars は対象外」の注釈を 1 行追記.
- [x] BL-071 spec.md (`docs/developer/features/routine-card-header-layout/spec.md`) の REQ-7
  (= 起票カードの体裁を壊さない) と AC-11 に
  「BL-072 で起票カードも 4 段構造に再編. REQ-7 / AC-11 の不変要求は BL-072 で逆転」の注釈を 1 行追記.

## 6. 仕上げ

- [x] 受け入れ基準 (spec.md / AC-1 〜 AC-23) を全て満たすことを確認
- [x] backlog.md の BL-072 状態を Todo → Done に変更
- [x] auditor へレビュー依頼
- [ ] auditor Pass 後に PR 作成 → main マージ
- [ ] main マージ後にローカル `feature/routine-form-card-header-layout` ブランチを削除
