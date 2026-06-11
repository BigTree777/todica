# タスク: task-card-design

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 関連 spec: [`spec.md`](spec.md) (AC-1〜AC-10).

## 設計 / 事前確認

- [ ] T-000: BL-051 完了時点の `web/src/ui/day-view/day-view.css` の `.day-view__card` ルール本文が `display: flex` / `align-items: center` / `gap: var(--space-md)` の 3 宣言であること, `.day-view__card--focus` ルール本文が空 (またはコメントのみ) であることを確認する. 確認結果を tasks に追記する (= 本 BL の追記の起点となる baseline 確認).

## 実装 (test-designer → implementer の順で進める)

### CSS

- [ ] T-001: `web/src/ui/day-view/day-view.css` の `.day-view__card` セレクタに以下の宣言を追加する (REQ-1 / plan §「day-view.css の追記内容」参照):
  - `background: var(--color-bg)`
  - `border: 1px solid var(--color-border)`
  - `border-radius: var(--radius-md)`
  - `padding: var(--space-md)`
  - 既存の `display: flex` / `align-items: center` / `gap: var(--space-md)` は順序を変えず維持する.

- [ ] T-002: 同 CSS の `.day-view__card--focus` セレクタに以下の宣言を追加する (REQ-2 / plan §「day-view.css の追記内容」参照):
  - `border-width: 2px`
  - `border-radius: var(--radius-lg)`
  - `padding: var(--space-lg)`
  - `border-color` / `background` は別途宣言しない (D-003 / `.day-view__card` を継承).
  - `border` shorthand は使わず, `border-width` 単独宣言にする (P-001 / リスク R-1 緩和).

### 触らない確認

- [ ] T-003: `web/src/styles/tokens.css` を変更していないことを確認する (REQ-5 / D-004). 新規トークンを追加せず, 既存トークンの値も変えない.

- [ ] T-004: `web/src/ui/today-view/today-view.tsx` と `web/src/ui/tomorrow-view/tomorrow-view.tsx` を変更していないことを確認する (REQ-4 / D-005). git diff で両ファイルの差分が 0 行であること.

- [ ] T-005: `web/src/ui/focus-view/focus-view.css` を変更していないことを確認する (D-006). day-view と focus-view の混同を避ける.

- [ ] T-006: `web/src/ui/day-view/day-view.css` の他セレクタ (`.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__form` / `.day-view__list` / `.day-view__empty`) のルール本文を変更していないことを確認する (REQ-3 / AC-7).

## テスト

### 単体テスト (新規)

- [ ] T-007: `web/__tests__/task-card-design.test.ts` を新規作成し, spec AC-1〜AC-4 / AC-7 に対応するアサーションを記述する (plan §「テスト方針」参照).
  - 検証スタイルは BL-046 の `web/__tests__/design-tokens.test.ts` に倣う (`readFileSync` で CSS を直接読んで `expect(content).toContain(...)` / `expect(content).toMatch(...)` で宣言の存在を assert).
  - AC-1: `.day-view__card` ルール本文に `background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-md)` / `padding: var(--space-md)` の 4 宣言が含まれる. 既存の `display: flex` / `align-items: center` / `gap: var(--space-md)` も依然として含まれる.
  - AC-2: `.day-view__card--focus` ルール本文に `border-width: 2px` / `border-radius: var(--radius-lg)` / `padding: var(--space-lg)` の 3 宣言が含まれる.
  - AC-3: `.day-view__card--focus` ルール本文に `border-color:` 単独宣言と `background:` 単独宣言が**含まれない** (継承で済ます設計の検証).
  - AC-4: CSS ファイル全体に `box-shadow` キーワードが含まれない.
  - AC-7 (補強): 他セレクタ (`.day-view__form` / `.day-view__list` / `.day-view__empty` 等) のルール本文に `background:` / `border:` / `border-radius:` 等の visual キーワードが含まれないことを軽くスモーク (= 本 BL のスコープが `.day-view__card` 系に限定されていることの保証).

### 単体テスト (追従)

- [ ] T-008: 既存単体テストが無修正で通ることを確認する (NFR-NO-DOM-CHANGE). 本 BL では DOM 構造 / aria 属性 / role / accessibleName は無変更のため, `today-view.test.tsx` / `tomorrow-view.test.tsx` / `unified-day-view.test.tsx` / `design-tokens.test.ts` は無修正で green.

### E2E / a11y / lint

- [ ] T-009: `npm test -w web` (vitest) が全件 green であることを確認する. 単体テスト + 新規 task-card-design テストの両方を含む.

- [ ] T-010: `npx playwright test e2e/a11y.spec.ts` が green であることを確認する (AC-10). axe スキャンで violations 0 件.

- [ ] T-011: `npm run lint -w web` と `npm run typecheck` が exit 0 であることを確認する.

### 視覚的確認 (任意 / 手動)

- [ ] T-012: `npm run dev -w web` で開発サーバを起動し, `/today` と `/tomorrow` にアクセスして以下を目視確認する (受け入れ基準の補助確認):
  - `/today` と `/tomorrow` の各タスクが縁付きカードとして視覚的に識別できる (G-1).
  - `/today` の「現在のタスク」セクションが通常カードよりひと回り大きく強調されている (G-2).
  - shadow が描画されていない (NFR-NO-SHADOW).
  - `/focus` (focus-view) の見た目が変わっていない (D-006).

## ドキュメント

- [ ] T-013: 実装マージ後, `docs/developer/planning/backlog.md` の BL-052 行を Todo → Done に更新する. メモ欄に PR 番号と実装値 (border 1px / 2px / radius-md / radius-lg / space-md / space-lg) を追記する.

## 仕上げ

- [ ] T-014: spec.md AC-1〜AC-10 を 1 項目ずつチェックし, すべて満たされていることを確認する.
- [ ] T-015: PR 本文に「border をベースとしたカード意匠を追加. shadow は意図的に不採用 (user 合意済み). tokens.css と JSX は無改修.」と明示する.
- [ ] T-016: auditor にレビュー依頼.
