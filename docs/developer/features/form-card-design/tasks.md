# タスク: form-card-design

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 関連 spec: [`spec.md`](spec.md) (AC-1〜AC-10).

## 設計 / 事前確認

- [ ] T-000: BL-052 完了時点の `web/src/ui/day-view/day-view.css` の `.day-view__form` ルール本文が `display: flex` / `flex-direction: column` / `gap: var(--space-sm)` の 3 宣言のみであること (= BL-052 では touch されていないこと) を確認する. 確認結果を tasks に追記する (= 本 BL の追記の起点となる baseline 確認).

## 実装 (test-designer → implementer の順で進める)

### CSS

- [ ] T-001: `web/src/ui/day-view/day-view.css` の `.day-view__form` セレクタに以下の宣言を追加する (REQ-1 / plan §「day-view.css の追記内容」参照):
  - `background: var(--color-bg)`
  - `border: 1px solid var(--color-border)`
  - `border-radius: var(--radius-md)`
  - `padding: var(--space-md)`
  - 既存の `display: flex` / `flex-direction: column` / `gap: var(--space-sm)` は順序を変えず維持する (= 構造系 → visual の順で並べる / P-001).
  - `border` は shorthand 形式で記述する (P-002).
  - `box-shadow` / `transition` / `animation` / `:hover` / `:focus-within` 関連は一切追加しない (D-001 / D-006 / NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
  - 内部の `<input>` / `<button>` 等の子要素セレクタは本 BL の対象外 (リスク R-2 緩和).

### 触らない確認

- [ ] T-002: `web/src/styles/tokens.css` を変更していないことを確認する (REQ-4 / D-007). 新規トークンを追加せず, 既存トークンの値も変えない.

- [ ] T-003: `web/src/ui/today-view/today-view.tsx` と `web/src/ui/tomorrow-view/tomorrow-view.tsx` を変更していないことを確認する (REQ-3 / D-004). git diff で両ファイルの差分が 0 行であること. 両ファイルに `.day-view__form` クラスが引き続き付与されている (BL-051 由来) ことも確認する.

- [ ] T-004: `web/src/ui/focus-view/focus-view.css` を変更していないことを確認する (REQ-5 / D-005). focus-view と day-view の混同を避ける (リスク R-4).

- [ ] T-005: `web/src/ui/day-view/day-view.css` の他セレクタ (`.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__list` / `.day-view__card` / `.day-view__card--focus` / `.day-view__empty`) のルール本文を変更していないことを確認する (REQ-2 / AC-7). 特に BL-052 で確定した `.day-view__card` / `.day-view__card--focus` の宣言を変更していないこと.

## テスト

### 単体テスト (新規)

- [ ] T-006: `web/__tests__/form-card-design.test.ts` を新規作成し, spec AC-1〜AC-8 に対応するアサーションを記述する (plan §「テスト方針」参照).
  - 検証スタイルは BL-052 の `web/__tests__/task-card-design.test.ts` に倣う (`readFileSync` で CSS を直接読んで `extractRuleBody` で指定セレクタのルール本文を抽出し, `expect(body).toMatch(...)` / `expect(content).toContain(...)` で宣言の存在を assert).
  - `extractRuleBody` ヘルパは新規 test ファイル内に再定義する (P-005). 共通モジュール化は本 BL では行わない (YAGNI).
  - AC-1: `.day-view__form` ルール本文に `background: var(--color-bg)` / `border: 1px solid var(--color-border)` (または等価分解) / `border-radius: var(--radius-md)` / `padding: var(--space-md)` の 4 宣言が含まれる. `padding: var(--space-md)` の検査は `gap: var(--space-sm)` と誤検知しないよう `padding:` で始まる行に限定する.
  - AC-2: `.day-view__form` ルール本文に既存の `display: flex` / `flex-direction: column` / `gap: var(--space-sm)` が依然として含まれる (回帰防止).
  - AC-3: `.day-view__form` ルール本文に `box-shadow:` / `transition:` / `animation:` 宣言が含まれない. CSS ファイル全体に `.day-view__form:hover` / `.day-view__form:focus-within` / `.day-view__form:active` セレクタが存在しない.
  - AC-4: CSS ファイル全体に `box-shadow` キーワードが含まれない (`expect(content).not.toContain("box-shadow")`).
  - AC-5: `web/src/styles/tokens.css` に `--color-bg` / `--color-border` / `--radius-md` / `--space-md` の 4 トークンが定義されている.
  - AC-6: `today-view.tsx` と `tomorrow-view.tsx` に `day-view__form` クラスが含まれている (BL-051 で付与済みのものが本 BL で誤って外されていない).
  - AC-7: 他セレクタ (`.day-view` / `.day-view__header` / `.day-view__list` / `.day-view__empty`) のルール本文に `background:` / `border:` / `border-radius:` 等の visual キーワードが含まれない. `.day-view__card` / `.day-view__card--focus` は BL-052 で正当に visual 宣言を持つため, 本 AC-7 のチェック対象から除外する.
  - AC-8: `focus-view.css` に `.day-view__form` セレクタが含まれない.

### 単体テスト (追従)

- [ ] T-007: 既存単体テストが無修正で通ることを確認する (NFR-NO-DOM-CHANGE). 本 BL では DOM 構造 / aria 属性 / role / accessibleName は無変更のため, `today-view.test.tsx` / `tomorrow-view.test.tsx` / `unified-day-view.test.tsx` / `task-card-design.test.ts` / `design-tokens.test.ts` は無修正で green.

### E2E / a11y / lint

- [ ] T-008: `npm test -w web` (vitest) が全件 green であることを確認する. 単体テスト + 新規 form-card-design テストの両方を含む.

- [ ] T-009: `npx playwright test e2e/a11y.spec.ts` が green であることを確認する (AC-10). axe スキャンで violations 0 件.

- [ ] T-010: `npm run lint -w web` と `npm run typecheck` が exit 0 であることを確認する.

### 視覚的確認 (任意 / 手動)

- [ ] T-011: `npm run dev -w web` で開発サーバを起動し, `/today` と `/tomorrow` にアクセスして以下を目視確認する (受け入れ基準の補助確認):
  - 起票フォーム (`.day-view__form`) が縁つきカードとして視覚的に識別できる (G-1).
  - 起票フォームとタスクカード (`.day-view__card`) が同じ視覚言語 (同じ border 色・角丸・余白) を共有して連続している (G-2).
  - shadow が描画されていない (NFR-NO-SHADOW).
  - hover してもフォームの見た目が変わらない (NFR-NO-HOVER-TRANSITION).
  - `/focus` (focus-view) の見た目が変わっていない (D-005).

## ドキュメント

- [ ] T-012: 実装マージ後, `docs/developer/planning/backlog.md` の BL-054 行を Todo → Done に更新する. メモ欄に PR 番号と実装値 (`.day-view__form` に追加した 4 宣言が `.day-view__card` と同値であること) を追記する.

## 仕上げ

- [ ] T-013: spec.md AC-1〜AC-10 を 1 項目ずつチェックし, すべて満たされていることを確認する.
- [ ] T-014: PR 本文に「BL-052 で `.day-view__card` に与えた縁・背景・角丸・余白を, BL-054 で `.day-view__form` にも適用. CSS の値は二重に書くが, クラスは別のまま (form / card のセマンティクス分離). tokens.css / JSX / focus-view.css は無改修. shadow / hover / transition は不採用.」と明示する.
- [ ] T-015: auditor にレビュー依頼.

## 追従修正

- [ ] T-016: BL-052 `web/__tests__/task-card-design.test.ts` の AC-7 `OTHER_SELECTORS` 配列から `.day-view__form` を除外する (本 BL で `.day-view__form` に visual を意図的に追加するため. BL-051 で `tomorrow-view.css` 削除時に BL-046 `design-tokens.test.ts` `TARGET_CSS_FILES` を更新した前例と同じパターン).
