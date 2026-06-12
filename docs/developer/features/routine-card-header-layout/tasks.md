# タスク: RoutineCard ヘッダレイアウト刷新

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 1. 事前調査 (test-designer / implementer 共通)

- [ ] 既存テストで `.routine-card__main` セレクタを参照している箇所を grep で洗い出す
  - 対象: `web/__tests__/routine-card-component.test.tsx` / `routine-card-edit-fields.test.tsx` /
    `routine-card-edit-priority.test.tsx` / `inline-edit-all-cards.test.tsx`
- [ ] 既存テストで「name input と PriorityStars が同じ親に並ぶ」 assert がどう書かれているかを確認
- [ ] `web/src/styles/tokens.css` に `--font-size-h2: 20px` が現存することを確認 (= 既存値で動く)
- [ ] vitest.config.ts に `css: true` が設定されていることを確認 (= AC-9 の computed style 検証が動く前提)

## 2. テスト設計 (test-designer)

### 2.1. 新規テスト追加

- [ ] `web/__tests__/routine-card-header-layout.test.tsx` を新規作成
  - [ ] **CSS 直読み** (file read + 正規表現) で以下を assert:
    - [ ] AC-4: `.routine-card { display: flex; flex-direction: column }`
    - [ ] AC-5: `.routine-card__header { display: flex; align-items: center; justify-content: space-between }`
    - [ ] AC-6: `.routine-card__header { font-size: var(--font-size-h2) }`
    - [ ] AC-7: `.routine-card__input { font: inherit; flex: 1 }`
    - [ ] AC-8: `.routine-card__main` セレクタが CSS から完全撤去されている
    - [ ] AC-10: `.routine-card--form { flex-direction: column; align-items: stretch }` 維持
  - [ ] **jsdom DOM レンダ** で以下を assert (failing 状態):
    - [ ] AC-1: name input と PriorityStars が同一の `.routine-card__header` 直下に並ぶ
    - [ ] AC-2: `.routine-card__main` 要素が DOM に存在しない
    - [ ] AC-3: `.routine-card` 直下に 3 要素 (header / day-checkboxes / actions) のみが並ぶ
    - [ ] AC-11: `<RoutineFormCard>` の DOM 構造が既存と変わらない
    - [ ] AC-12: 空文字 blur で input が `routine.name` に書き戻される
    - [ ] AC-13: 同値 blur で onNameBlur が呼ばれ value が維持される
    - [ ] AC-14: 曜日 checkbox click で onDaysOfWeekChange が呼ばれる
    - [ ] AC-15: PriorityStars click で onDefaultPriorityChange が呼ばれる
    - [ ] AC-16: 「削除」 button click で onDelete が 1 回呼ばれる
    - [ ] AC-17: visually-hidden label が `routine-name-{id}` で input と紐づく
    - [ ] AC-18: PriorityStars の accessibleName が「{routine.name} の優先度」/ idPrefix が `routine-{id}`
    - [ ] AC-19: header 内の DOM 順 = visually-hidden label → input → PriorityStars
  - [ ] **getComputedStyle** で以下を assert:
    - [ ] AC-9: name input の computed font-size が 20px と一致

### 2.2. 既存テストの追従

- [ ] `routine-card-component.test.tsx` (BL-061) の `.routine-card__main` 依存 assert を追従 (= 階層を新構造に書き換え)
- [ ] `routine-card-edit-fields.test.tsx` (BL-068) の DOM 階層 assert があれば追従
- [ ] `routine-card-edit-priority.test.tsx` (BL-069) の DOM 階層 assert があれば追従
- [ ] `inline-edit-all-cards.test.tsx` (BL-070) の DOM 階層 assert があれば追従

### 2.3. テスト全件赤確認

- [ ] `npm test -w web` を実行し, **新規** test がすべて failing で止まることを確認
  (= 実装前の TDD 状態 / 既存テストは追従後に再評価)

## 3. 実装 (implementer)

### 3.1. CSS (`web/src/ui/routine-card/routine-card.css`)

- [ ] `.routine-card` を `flex-direction: row; align-items: center; gap: var(--space-sm)` から
  `flex-direction: column; gap: var(--space-md)` に変更
- [ ] `.routine-card__header` ルールセットを新設:
  - `display: flex`
  - `align-items: center`
  - `justify-content: space-between`
  - `gap: var(--space-sm)`
  - `font-size: var(--font-size-h2)`
- [ ] `.routine-card__main` ルールセットを完全撤去
- [ ] `.routine-card__input` に `font: inherit` を追加 (既存の `flex: 1` は維持)
- [ ] `.routine-card--form { flex-direction: column; align-items: stretch }` を維持
  (基底変更により no-op になるが意図表明として残す / D-005)
- [ ] `.routine-card__day-checkboxes` / `.routine-card__actions` / `.routine-card__form-row` /
  `.routine-card__submit` / `.routine-card__input::placeholder` / `.visually-hidden` は無改修

### 3.2. JSX (`web/src/ui/routine-card/routine-card.tsx`)

- [ ] `.routine-card__main` div を撤去
- [ ] `.routine-card__header` div を新設し, 以下を内包する順序で配置:
  - `<label htmlFor={inputId} className="visually-hidden">ルーティン名</label>`
  - `<input ... />` (BL-070 の uncontrolled + key + blur 書き戻しロジックは無改修)
  - `<PriorityStars ... />` (groupLabel / idPrefix / value / onChange は無改修)
- [ ] `.routine-card__day-checkboxes` div を `.routine-card` 直下 (header の下) に位置移動
- [ ] `.routine-card__actions` div を `.routine-card` 直下 (day-checkboxes の下) に維持
- [ ] コメント (= 上部の jsdoc / 仕様参照行) に BL-071 参照を追加

### 3.3. RoutineFormCard 無改修

- [ ] `web/src/ui/routine-card/routine-form-card.tsx` を変更しないことを確認
- [ ] `<form className="routine-card routine-card--form">` で `.routine-card--form` modifier 経由で
  起票カードの体裁が維持されることを目視・テストで確認

## 4. 検証

### 4.1. 単体テスト

- [ ] `npm test -w web` 全件 green
- [ ] 新規 `routine-card-header-layout.test.tsx` がすべて green
- [ ] 既存 routine-card 系テストが追従後に全件 green

### 4.2. E2E

- [ ] `npx playwright test` 全件 green
- [ ] `e2e/routines.spec.ts` 無修正で green
- [ ] `e2e/routine-card-edit-fields.spec.ts` 無修正で green
- [ ] `e2e/routine-card-edit-priority.spec.ts` 無修正で green
- [ ] `e2e/a11y.spec.ts` で violations 0 件

### 4.3. 静的検査

- [ ] `npm run lint` exit 0
- [ ] `npm run typecheck` exit 0

### 4.4. 目視

- [ ] dev server (`npm run dev -w web`) を起動して `/routines` を開く
- [ ] ルーティン一覧で各カードの **右上に PriorityStars** が並ぶことを目視
- [ ] **ルーティン名のフォントが現状より大きく** 表示されていることを目視
- [ ] 起票カード (上段の「追加」フォーム) の見た目が現状と変わらないことを目視

## 5. ドキュメント

> 方針: auditor 監査 (2026-06-12 軽微 4) に基づき, BL-070 で BL-042 spec に注釈を入れた前例に合わせ,
> 方針 (a) (= 4 件に各 1 行追記) を採用. トレーサビリティ確保のため.

- [x] BL-061 spec.md (`docs/developer/features/routine-card-component/spec.md`) の D-009 に
  「BL-071 で `.routine-card__main` 撤去 + 3 段構造に再編」の注釈を 1 行追記.
- [x] BL-068 spec.md (`docs/developer/features/routine-card-edit-fields/spec.md`) の D-008 に
  「BL-071 で関連変更. `.routine-card__day-checkboxes` の CSS は無改修で流用される」の注釈を 1 行追記.
- [x] BL-069 spec.md (`docs/developer/features/routine-card-edit-priority/spec.md`) の D-007 に
  「BL-070 / BL-071 で関連変更. PriorityStars は `.routine-card__header` 右側に配置」の注釈を 1 行追記.
- [x] BL-070 spec.md (`docs/developer/features/inline-edit-all-cards/spec.md`) の REQ-3 DOM スニペット直後に
  「BL-071 で `.routine-card__main` ラッパ撤去 + 3 段構造に再編. 本 BL の prop / handler は無改修で引き継がれる」の注釈を 1 行追記.

## 6. 仕上げ

- [ ] 受け入れ基準 (spec.md / AC-1 〜 AC-19) を全て満たすことを確認
- [ ] backlog.md の BL-071 状態を Todo → Done に変更
- [ ] auditor へレビュー依頼
- [ ] auditor Pass 後に PR 作成 → main マージ
- [ ] main マージ後にローカル `feature/routine-card-header-layout` ブランチを削除
