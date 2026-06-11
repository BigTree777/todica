# タスク: 起票カードのプロジェクト `<select>` の box サイズを縮小 (task-form-select-compact)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

### CSS 追記 (REQ-1 / REQ-2 / REQ-3)

- [ ] `web/src/ui/task-card/task-card.css` の末尾 (= `.visually-hidden` ルールの後ろ) に `.task-card__header select` ルールを追加する.
  - [ ] コメントブロックで「BL-066 (task-form-select-compact) REQ-1 / D-001 / D-002 / D-003」の参照と「scope は .task-card__header select (2 class + 1 type), TaskCard 表示側に `<select>` 無し前提」を明示する.
  - [ ] `min-height: 24px;` を含める.
  - [ ] `padding: var(--space-xs) var(--space-sm);` を含める.
  - [ ] `font-size: var(--font-size-small);` を含める.
  - [ ] `border: 1px solid var(--color-border);` を含める.
  - [ ] `border-radius: var(--radius-lg);` を含める.
  - [ ] `appearance: none;` を含める.
  - [ ] `-webkit-appearance: none;` を含める.
  - [ ] 不要な宣言 (`background` / `color` / `box-shadow` / `transition` / `animation`) を**含めない**.
  - [ ] `:hover` / `:focus-within` 派生セレクタを**新設しない**.

### 無改修確認 (REQ-4 / REQ-5 / REQ-6 / NFR-COMPAT)

- [ ] `web/src/ui/task-card/task-card.tsx` を touch しない.
- [ ] `web/src/ui/task-card/task-form-card.tsx` を touch しない.
- [ ] `web/src/ui/today-view/today-view.tsx` を touch しない.
- [ ] `web/src/ui/tomorrow-view/tomorrow-view.tsx` を touch しない.
- [ ] `web/src/styles/tokens.css` を touch しない.
- [ ] `web/src/ui/day-view/day-view.css` を touch しない.
- [ ] `web/src/ui/focus-view/focus-view.css` を touch しない.
- [ ] その他 UI モジュール CSS を touch しない.
- [ ] server / domain / Repository / mutation / query / ConflictDialog / notifyError を touch しない.

## テスト

### 新規 単体テスト

- [ ] `web/__tests__/task-form-select-compact.test.tsx` を新設する.
  - [ ] 共通ヘルパ (`extractRuleBody` / パス定数 / `createTestQueryClient` / `makeProject` / 軽量 `<TaskFormCard>` レンダ) を BL-063 と同形で定義する.
  - [ ] **AC-1**: `.task-card__header select` ルール本文に 7 宣言 (min-height / padding / font-size / border / border-radius / appearance / -webkit-appearance) が存在することを assert.
  - [ ] **AC-2**: 同ルール本文に `background` / `color` / `box-shadow` / `transition` / `animation` が無いことを assert. CSS 全体に `:hover` / `:focus-within` 派生セレクタが無いことを assert.
  - [ ] **AC-3 (today)**: `<TaskFormCard idPrefix="create">` を jsdom レンダし, `#create-project` の computed style (`fontSize` / `minHeight` / `borderRadius` / `borderTopStyle` / `borderTopWidth` / `appearance || webkitAppearance`) を assert.
  - [ ] **AC-4 (tomorrow)**: 同じ assert を `idPrefix="tomorrow-create"` / `#tomorrow-create-project` で実施.
  - [ ] **AC-5**: `<TaskCard>` プロジェクト有りをレンダし, `<span class="project-chip">` の `fontSize === "14px"` と `querySelectorAll("select").length === 0` を assert.
  - [ ] **AC-6**: `.task-card__header .project-chip` ルール (BL-063 D-003) が本 BL でも `font-size: var(--font-size-small)` を持つことを assert.
  - [ ] **AC-7**: `task-card.tsx` テキストに `<select` を含まないこと, `task-form-card.tsx` テキストに `<select` を含むこと (= BL-065 由来の不変性確認) を assert.
  - [ ] **AC-8**: `tokens.css` テキストに 5 トークン定義 (`--font-size-small:`, `--space-xs:`, `--space-sm:`, `--color-border:`, `--radius-lg:`) が存在することを assert.
  - [ ] **AC-9**: `day-view.css` / `focus-view.css` テキストに `.task-card__header select` 文字列が含まれないことを assert.
  - [ ] **AC-10**: `task-card.css` 全体に `box-shadow` / `transition` / `animation` / `:hover` / `:focus-within` が含まれないことを assert.

### 既存テストの追従

- [ ] 修正不要であることを確認する (= plan.md の「既存テストへの影響」記載のとおり修正 0 件想定).
  - [ ] `task-card-component.test.tsx`, `task-card-hotfix.test.tsx`, `task-form-card-select.test.tsx`, `project-chip.test.tsx`, `form-card-design.test.ts`, `task-card-design.test.ts`, `design-tokens.test.ts`, `task-form-grid-layout.test.tsx`, `task-card-zone-layout.test.tsx`, `task-card-actions-reorder.test.tsx` が無修正のまま green であることを `npm run test --workspace web` で確認.
  - [ ] `today-view.test.tsx` / `tomorrow-view.test.tsx` の `<select>` 経由操作テストが無修正のまま green であることを確認.

### E2E

- [ ] `npm run test:e2e` (Playwright) を実行し既存全件 green を確認 (= 改修 0 件想定).
- [ ] `e2e/a11y.spec.ts` の axe スキャンが WCAG 2.1 AA violations 0 件であることを確認 (NFR-A11Y / AC-12).

### lint / typecheck

- [ ] `npm run lint` green.
- [ ] `npm run typecheck` green.

## ドキュメント

- [ ] `docs/developer/planning/backlog.md` の BL-066 行のステータスを Todo → In progress / Done に更新する (= 本 BL のクローズフェーズで実施).
- [ ] tokens.css / 仕様カタログ / a11y ドキュメント / E2E ガイド等への影響なし (= 更新不要).

## 仕上げ

- [ ] 受け入れ基準 AC-1 〜 AC-12 をすべて満たすことを確認 (spec.md).
- [ ] 実機 (`npm run dev`) で `/today` / `/tomorrow` の起票カードプロジェクト `<select>` が:
  - [ ] chip 風の高さで描画される (= PriorityStars と並んだ際の box 突出が解消されている).
  - [ ] OS デフォルト矢印が消えている (`appearance: none` の効果).
  - [ ] tap / クリックで dropdown が開き option 群 ("プロジェクトなし" + projects) が選択可能.
  - [ ] キーボード (Tab / 矢印 / Enter / Space) で操作可能.
- [ ] 実機 (`npm run dev`) で `<TaskCard>` 表示側のプロジェクト chip (= `<span class="project-chip">`) が無改修であることを確認.
- [ ] `auditor` サブエージェントにレビュー依頼 (仕様適合 / 副作用範囲 / a11y 0 件 / BL-063 D-003 ルール不変性 / BL-065 由来 DOM 構造の不変性).
