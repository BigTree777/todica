# 設計・実装計画: 起票カードのプロジェクト `<select>` の box サイズを縮小 (task-form-select-compact)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`web/src/ui/task-card/task-card.css` の末尾 (= BL-063 の `.visually-hidden` ルールの後ろ) に **`.task-card__header select` ルール 1 個**を追加する. 7 宣言 (min-height / padding / font-size / border / border-radius / appearance / -webkit-appearance) のみを書き, shadow / hover / transition / animation / 矢印代替 SVG は追加しない. JSX / tokens.css / 他 CSS は無改修. テストは CSS 直読み + jsdom レンダの組み合わせで担保する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (REST / Repository / domain / mutation / query すべて無改修). |
| DB | 変更なし. |
| モジュール (UI 構造) | 変更なし. `<TaskFormCard>` / `<TaskCard>` の props 型 / DOM 構造 / aria-label / role / accessibleName は無改修. |
| UI (CSS) | `web/src/ui/task-card/task-card.css` に `.task-card__header select` ルール 1 個追加. 既存ルールへの touch は **無し**. |
| UI (JSX) | 無改修. `web/src/ui/task-card/task-card.tsx` / `web/src/ui/task-card/task-form-card.tsx` / `web/src/ui/today-view/today-view.tsx` / `web/src/ui/tomorrow-view/tomorrow-view.tsx` ともに main の HEAD と diff 0. |
| UI (tokens) | 無改修. `web/src/styles/tokens.css` に touch しない. 既存 5 トークン (`--font-size-small` / `--space-xs` / `--space-sm` / `--color-border` / `--radius-lg`) を参照するだけ. |
| UI (他 CSS) | 無改修. `web/src/ui/day-view/day-view.css` / `web/src/ui/focus-view/focus-view.css` / その他 UI モジュール CSS は touch しない. |
| テスト | 新規単体テストファイル `web/__tests__/task-form-select-compact.test.tsx` を 1 個追加. 既存テストの修正は**不要** (BL-065 で確定した `<select>` 経由操作テストは UA 既定スタイル前提ではなく role / option のみで動作するため). |
| E2E | 改修なし. 既存 E2E は `<select>` の role + accessibleName ベースで動作しているため style 変更で影響を受けない. |
| ドキュメント | `docs/developer/features/task-form-select-compact/` (本 BL ディレクトリ) を新設. backlog.md の BL-066 ステータス更新は本 BL のクローズフェーズで実施 (= タスク化はするが本 spec では指定しない). |

## 設計詳細

### CSS 追加位置

`web/src/ui/task-card/task-card.css` の末尾 (= `.visually-hidden` ルール定義の後ろ) に, BL-063 D-003 ルール (`.task-card__header .project-chip`) と隣接する形で本 BL ルールを置く.

```css
/*
 * BL-066 (task-form-select-compact) REQ-1 / D-001 / D-002 / D-003:
 * 起票カード (.task-card--form) header 段のプロジェクト <select> の box を縮小し,
 * 同 header 段で chip / PriorityStars と並んだ際の視覚的な統一を取る.
 *
 * scope は .task-card__header select (2 class + 1 type) で起票カード内に実質限定:
 *   - TaskCard 表示側 (<TaskCard>) の .task-card__header 配下に <select> は
 *     DOM 構造上存在しない (BL-059 task-card-component 確定の不変性).
 *   - したがって modifier (.task-card--form) で限定する必要は無い.
 *
 * 値:
 *   - min-height: 24px (WCAG 2.5.8 目標水準. D-001).
 *   - padding: 4px 8px (= --space-xs --space-sm).
 *   - font-size: 14px (= --font-size-small. .project-chip と揃える).
 *   - border: 1px solid #ccc (= var(--color-border). .task-card / .day-view__form と同色).
 *   - border-radius: 16px (= var(--radius-lg). .task-card / .day-view__form と同値).
 *   - appearance: none (+ -webkit-appearance: none) で OS デフォルトの矢印を消す.
 *     矢印代替 SVG / 擬似要素は本 BL では描画しない (D-002).
 *
 * 非衝突確認:
 *   - .task-card__header .project-chip (BL-063 D-003) は <span> にマッチ. <select> とは別 DOM.
 */
.task-card__header select {
  min-height: 24px;
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-size-small);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  appearance: none;
  -webkit-appearance: none;
}
```

### データモデル

該当なし. CSS 追記のみ. props 型 / domain entity / DB schema いずれも触らない.

### 処理フロー

該当なし. user 操作フロー (起票カードでプロジェクトを選ぶ → 「追加」 button を押す → タスク起票) は BL-065 から無変更.

### 例外 / エラー処理

該当なし. CSS の visual 差分のみ.

### 副作用範囲確認 (D-001 の根拠)

| DOM 要素 | `<TaskCard>` 表示側 | `<TaskFormCard>` 起票側 |
| --- | --- | --- |
| `.task-card__header` 配下の `<select>` | **存在しない** (= プロジェクト表示は `<span class="project-chip">` または無し) | **存在する** (= `<select id={`${idPrefix}-project`}>` が BL-065 で配置) |

したがって `.task-card__header select` セレクタは起票カードのみにマッチし, 表示側のレイアウトには副作用 0. AC-5 / AC-7 で実機検証する.

### specificity 競合表

| ルール | セレクタ | specificity | マッチ対象 |
| --- | --- | --- | --- |
| 本 BL REQ-1 | `.task-card__header select` | (0, 2, 1) | `<TaskFormCard>` 内の `<select>` |
| BL-063 D-003 | `.task-card__header .project-chip` | (0, 3, 0) | `<TaskCard>` 表示側の `<span class="project-chip">` |
| BL-056 本体 | `.project-chip` | (0, 1, 0) | `<span class="project-chip">` (両カード共通) |
| BL-059 V-3 | `.task-card__header` | (0, 1, 0) | header 段の親 `<div>` |

`<select>` と `<span class="project-chip">` は別 DOM のためマッチ集合が交わらず, 競合は発生しない (REQ-3).

## 重要な決定 (D 章サマリ)

spec.md の D 章を実装側からも要約する.

- **D-001**: selector は `.task-card__header select` (案 B) を採用. 案 A (`.task-card--form .task-card__header select`) は specificity 過剰で不採用.
- **D-002**: `appearance: none` (+ `-webkit-appearance: none`) を採用. 矢印代替の SVG / `::after` は描画しない (将来 BL の余地).
- **D-003**: 具体値は spec REQ-1 で確定 (min-height 24px / padding 4px 8px / font-size 14px / border 1px solid var(--color-border) / border-radius 16px / appearance none).
- **D-004**: テスト方針は CSS 直読み (`extractRuleBody`) + jsdom レンダ (`getComputedStyle`) の組み合わせ.
- **D-005**: BL-063 D-003 ルール (`.task-card__header .project-chip`) は無改修. 別 DOM のため衝突 0.

詳細はすべて spec.md D 章を参照. ADR 化は不要 (= BL-063 / BL-065 で確定した方針の延長線上で, 新たな大きな設計判断ではない).

## リスク / 代替案

### リスク

- **R-1 (UA 差分: iOS Safari の auto-zoom)**: `<select>` の font-size を 16px 未満にすると iOS Safari でタップ時に zoom-in する挙動がある. 起票カードはランディング時点で十分大きく表示されており実害は小さいが, user 環境で気になる場合は将来 BL で 16px 化 or `<meta name="viewport" content="user-scalable=no">` 検討の余地を残す (= 本 BL では受け入れる, P-007).
- **R-2 (Firefox の `appearance: none` 効果)**: Firefox では古いバージョン (< 70) で `<select>` の `appearance: none` が完全には効かず, native arrow が残る場合がある. 現代の Firefox では効くため運用上の問題は無いが, レガシー Firefox は本 BL の対象外.
- **R-3 (`-moz-appearance: none` の追加余地)**: 念のため `-moz-appearance: none` を入れる選択肢もあるが, 現代 Firefox では無印 `appearance: none` で十分効くため本 BL では追加しない. 必要なら hotfix BL で対応.
- **R-4 (jsdom の `getComputedStyle` 制約)**: jsdom は CSS の `var()` を解決して具体値を返すが, `appearance` プロパティの解釈が UA に依存する. テストでは `getComputedStyle(el).appearance || getComputedStyle(el).webkitAppearance` の either-or で評価する (AC-3 で吸収).

### 代替案

- **代替案 A: modifier scope (`.task-card--form .task-card__header select`)**: specificity を最強にし起票カード scope を明示する案. しかし TaskCard 表示側に `<select>` が DOM 上存在しないため不要に specificity を上げる結果になる. 採用しない (D-001).
- **代替案 B: 矢印代替 SVG**: `appearance: none` で消した矢印を `::after` + SVG background で代替描画する案. 視覚的に「dropdown であること」をより明確にできるが, SVG asset 設計 / dark mode 対応 / 矢印位置の calc 設計が必要で本 BL のスコープ外 (D-002). 将来 BL に分離.
- **代替案 C: tokens.css に `--select-min-height` を新設**: 値の意味を tokens に閉じる案. 本 BL の 1 箇所だけのために token を増やすのは過剰. NFR-NO-NEW-TOKENS で却下.
- **代替案 D: `.day-view__form select` セレクタ**: `.day-view__form` (BL-054) に scope する案. しかし `.day-view__form` クラスは today/tomorrow view の `<form>` 要素に付き, `<TaskFormCard>` 自体は `task-card task-card--form` で `.day-view__form` を持たない. したがってこの代替案では起票カード内の `<select>` にマッチしない. 不採用.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規追加: `web/__tests__/task-form-select-compact.test.tsx`

BL-063 (`task-card-hotfix.test.tsx`) と同じパターンで新設する.

#### 共通セットアップ

- `extractRuleBody(css, selector)` ヘルパを再定義 (BL-052 以降と同形, D-008).
- `repoRoot` / `webSrcRoot` / `taskCardCssPath` / `taskCardTsxPath` / `taskFormCardTsxPath` / `tokensCssPath` のパス定数を解決.
- jsdom レンダ用に `QueryClientProvider` / `createTestQueryClient` / `makeProject` / 軽量な `<TaskFormCard>` 直接レンダ (= `<today-view>` を経由しない最小レンダ) を用意.

#### テスト分割

1. **AC-1 (CSS): `.task-card__header select` ルールの 7 宣言の存在**
   - `extractRuleBody(css, ".task-card__header select")` が非 null.
   - `min-height: 24px` / `padding: var(--space-xs) var(--space-sm)` / `font-size: var(--font-size-small)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-lg)` / `appearance: none` / `-webkit-appearance: none` の各正規表現マッチ.

2. **AC-2 (CSS): `.task-card__header select` ルール内の不要宣言・派生セレクタが無い**
   - ルール本文に `background` / `color` / `box-shadow` / `transition` / `animation` の宣言が含まれない.
   - CSS 全体に `:hover` / `:focus-within` の派生セレクタが存在しない.

3. **AC-3 / AC-4 (DOM レンダ): `<TaskFormCard>` の computed style 確認**
   - idPrefix="create" と "tomorrow-create" の 2 ケースでレンダ.
   - `document.getElementById("create-project")` / `"tomorrow-create-project"` の `getComputedStyle` から `fontSize` / `minHeight` / `borderRadius` / `borderTopStyle` / `borderTopWidth` / `appearance || webkitAppearance` を assert.
   - 期待値:
     - `fontSize === "14px"`
     - `minHeight === "24px"`
     - `borderRadius === "16px"`
     - `borderTopStyle === "solid"`
     - `borderTopWidth === "1px"`
     - `(appearance === "none" || webkitAppearance === "none")` (either-or, R-4 対応).

4. **AC-5 (DOM レンダ): TaskCard 表示側の chip は本 BL ルールの影響を受けない**
   - `<TaskCard>` をプロジェクト有りでレンダ.
   - `<span class="project-chip">` の `getComputedStyle(el).fontSize === "14px"` (= BL-063 D-003 由来であって本 BL 由来ではないことの暗黙的確認).
   - `container.querySelectorAll("select").length === 0` (= TaskCard 表示側に `<select>` が無い).

5. **AC-6 (CSS): BL-063 D-003 ルールの不変性**
   - `extractRuleBody(css, ".task-card__header .project-chip")` が非 null.
   - 本文に `font-size: var(--font-size-small)` の宣言が含まれる.

6. **AC-7 (静的解析): JSX 4 ファイルに `<select` が起票側のみ**
   - `task-card.tsx` の文字列に `<select` を含まない (= TaskCard 表示側に select 無し).
   - `task-form-card.tsx` の文字列に `<select` を含む (= 起票側に select 有り, BL-065 由来の不変性確認).
   - JSX 差分そのものの diff 比較は本テストでは行わない (= main 比較は git diff の役割, テストでは差分が無いことを構造的不変性のサンプルで担保).

7. **AC-8 (CSS): tokens.css の不変性 (= 5 トークン定義の存在)**
   - `tokens.css` を read し, `--font-size-small:`, `--space-xs:`, `--space-sm:`, `--color-border:`, `--radius-lg:` の 5 トークン定義が引き続き存在することを正規表現で確認.

8. **AC-9 (CSS): 他 CSS ファイルに `.task-card__header select` セレクタが混入していない**
   - `day-view.css` / `focus-view.css` を read し, `.task-card__header select` 文字列が含まれないことを確認.

9. **AC-10 (CSS): task-card.css 全体に box-shadow / transition / animation / :hover / :focus-within が無い**
   - ファイル全体に対する正規表現確認.

### 既存テストへの影響

- **修正不要なテスト**:
  - `web/__tests__/task-card-component.test.tsx`, `task-card-hotfix.test.tsx`, `task-form-card-select.test.tsx`, `project-chip.test.tsx`, `form-card-design.test.ts`, `task-card-design.test.ts`, `design-tokens.test.ts`, `task-form-grid-layout.test.tsx`, `task-card-zone-layout.test.tsx`, `task-card-actions-reorder.test.tsx`: いずれも本 BL ルール (`.task-card__header select`) を assert していないため無影響.
  - `today-view.test.tsx` / `tomorrow-view.test.tsx` の `<select>` 経由操作 (BL-065 で書き換え済み) は role + accessibleName ベースで, style 値には依存しないため無影響.
- **修正が必要かもしれないテスト**: なし (= 想定通り 0 件).

### E2E

- 改修なし. 既存 E2E は `<select>` を `selectOption` などの role / accessibleName ベース API で操作するため style 値に依存しない. axe スキャン (`e2e/a11y.spec.ts`) も violations 0 件維持 (NFR-A11Y / AC-12).

### vitest.config.ts

- 無改修. `css: true` は BL-063 で確定済みで, 本 BL の jsdom + `getComputedStyle` で必要.

### 確認手順 (本 BL のクローズフェーズ)

1. CSS 追記後, `npm run test --workspace web` で新規テストファイル含め全件 green.
2. `npm run test:e2e` で Playwright 全件 green (= 改修なしのまま通る).
3. `npm run lint` / `npm run typecheck` green.
4. 実機 (`npm run dev`) で `/today` / `/tomorrow` の起票カードのプロジェクト `<select>` が:
   - chip 風の高さ (= PriorityStars の星と同等のレベル) で並ぶ.
   - 矢印が消え, 文字色 / 背景は親カードを継承.
   - tap / クリックで dropdown が開き option 群を選択可能.
5. auditor (`.claude/agents/auditor.md`) に依頼: 仕様 (AC-1 〜 AC-12) との適合 + 副作用範囲 (TaskCard 表示側 / focus-view / day-view) の不変性確認 + a11y violations 0 件.
