# 設計・実装計画: view-title-center-align

> [`spec.md`](spec.md) の要件 (REQ-1〜REQ-7 / NFR-*) を実装に落とす.

## 方針概要

各 view CSS ファイルの既存 h1 ルール本体に `text-align: center;` の 1 宣言だけを追加する.
DOM / トークン / 共通 CSS / ヘッダ構造は一切改修しない. これは backlog BL-111 の候補 (a) に
相当する.

### 候補 (a) / (b) / (c) の比較と選定

| 候補 | 概要 | 影響範囲 | DOM 改修 | 制約適合 | 採否 |
| --- | --- | --- | --- | --- | --- |
| (a) 各 view CSS の h1 ルールに `text-align: center` を個別追加 | 各 view CSS 内の既存 `xxx-view h1 { ... }` ルールに 1 行追加 | 各 view CSS のみ. 他 view への波及ゼロ. | 無 | 全 NFR 適合 | **採用** |
| (b) `web/src/styles/` に global h1 ルールを新設 | `styles/typography.css` 等を新規追加して `h1 { text-align: center; }` を宣言 | global. dialog 等の h1 にも波及する可能性. | 無 | NFR-NO-GLOBAL-H1 違反 (新規 styles/*.css 追加が必要) | 不採用 |
| (c) 共通クラス `.view-title` 導入 | `<h1 className="view-title">` を各 view TSX で付与し, 共通 CSS を新設 | 各 view TSX + 共通 CSS 新規 | **有** (TSX 改修) | NFR-PRESERVE-DOM 違反, NFR-NO-COMMON-CLASS 違反 | 不採用 |

(a) を採用する理由:
- 既存 view CSS の h1 ルール (例: `.projects-view h1 { font-size: var(--font-size-h1); margin: 0 0 var(--space-md) 0; }`) はすでに各 view ファイル内で個別に管理されており, **そこに 1 行追加するだけで完結**する. 影響範囲が最小.
- DOM 改修・新規ファイル追加・新規トークンが全て不要で, BL-111 の制約 (DOM / マークアップ / aria-label / tokens.css 無改修) と完全に整合.
- BL-105 で確立した「CSS 文面 assert」 (= `web/__tests__/completion-counter-emphasis.test.ts`) と同形のテストで自動回帰防止が容易.
- (b) の global h1 ルールは, 将来 dialog / TaskFormCard 等で h1 を使うときに意図せず中央寄せに引きずられる副作用がある. 本 BL の対象は「各 view の主見出し」に限定されるべきで, スコープが広すぎる.
- (c) は明示的だが DOM 改修が要件と衝突する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 無し |
| DB | 無し |
| モジュール | 無し |
| UI (CSS) | 6 ファイルの h1 ルール本体に `text-align: center;` を 1 行追加. 詳細は §「CSS の変更」参照. |
| UI (DOM / TSX) | 無し (各 view TSX は完全に無改修) |
| トークン | 無し (`tokens.css` 無改修) |
| 共通 styles | 無し (`web/src/styles/` 無改修) |
| テスト | 新規 1 ファイル `web/__tests__/view-title-center-align.test.ts` (CSS 文面 assert). 既存テストは無改修. |

## 設計詳細

### CSS の変更 (6 ファイル, 各 1 行追加)

`text-align: center;` を以下のルールに追加する. 既存宣言の順序や他プロパティは触らない.

1. `web/src/ui/day-view/day-view.css`
   ```css
   .day-view__header h1 {
     font-size: var(--font-size-h1);
     margin: 0;
     text-align: center; /* BL-111 / REQ-2 追加 */
   }
   ```
   - `/today` (`.day-view__header--today` の子) と `/tomorrow` (`.day-view__header` の子) の両方の h1 に効く. today では既に column-stretch で h1 が 100% 幅 → 中央揃えが画面幅中央になる. tomorrow では h1 が flex item 単独 (justify-content: space-between の唯一の子) で 100% 幅相当となるため, 中央揃えが効く.

2. `web/src/ui/projects-view/projects-view.css`
   ```css
   .projects-view h1 {
     font-size: var(--font-size-h1);
     margin: 0 0 var(--space-md) 0;
     text-align: center; /* BL-111 / REQ-3 追加 */
   }
   ```

3. `web/src/ui/routines-view/routines-view.css`
   ```css
   .routines-view h1 {
     font-size: var(--font-size-h1);
     margin: 0 0 var(--space-md) 0;
     text-align: center; /* BL-111 / REQ-4 追加 */
   }
   ```

4. `web/src/ui/focus-view/focus-view.css`
   ```css
   .focus-view h1 {
     font-size: var(--font-size-h1);
     margin: 0 0 var(--space-md) 0;
     text-align: center; /* BL-111 / REQ-5 追加 */
   }
   ```

5. `web/src/ui/settings-view/settings-view.css`
   ```css
   .settings-view h1 {
     font-size: var(--font-size-h1);
     margin: 0 0 var(--space-md) 0;
     text-align: center; /* BL-111 / REQ-6 追加 */
   }
   ```
   - `.settings-view h2` は本 BL の対象外 (= 不変).

6. `web/src/ui/trash-view/trash-view.css`
   ```css
   .trash-view__header h1 {
     font-size: var(--font-size-h1);
     margin: 0;
     text-align: center; /* BL-111 / REQ-7 追加 */
   }
   ```
   - `.trash-view__header` 本体 (`display: flex; justify-content: space-between; align-items: center;`) は **無改修**. spec UND-1 のとおり, 「全削除」 button がある場合の画面中央配置は本 BL の対象外として受け入れる.

### データモデル

- 無し (CSS 文面のみ).

### 処理フロー

- 無し (ランタイム挙動の変更なし).

### 例外 / エラー処理

- 無し (CSS 宣言の追加のみ).

## 重要な決定

- D-001: 中央揃えは「各 view CSS の h1 ルールへの個別 `text-align: center;` 宣言」で実現する (= 候補 (a)). global h1 ルールや共通クラス導入は採用しない. 理由は §「方針概要」 (a) / (b) / (c) 表を参照. ADR 化は不要 (= 影響範囲が CSS 文面 6 行のみで, アーキ判断ではなくスタイル方針の限定的選定).
- D-002: `.trash-view__header` のレイアウト (`justify-content: space-between`) は変更しない. これにより `/trash` で「全削除」 button があるとき h1 は flex item 幅内で中央寄せ (= 画面中央ではない) になる. これは spec UND-1 で明示的に受容する.
- D-003: 検証方法は CSS 文面 assert に限定する. jsdom が CSS custom property を解決しない既知制約と, 視覚回帰運用の負担を避けるため. Playwright での視覚回帰や `getComputedStyle` 経由の assert は導入しない (BL-105 と同方針).
- D-004: 共通 `day-view.css` の `.day-view__header h1` を変更することで `/today` と `/tomorrow` の両方を 1 宣言で正規化する. today 用に `.day-view__header--today h1` のような modifier 配下の h1 ルールを増やさない (= ルール最小化).

## リスク / 代替案

### リスク

- R-1: `/trash` で全削除 button がある場合, h1 が flex item として中央配置されないため, 厳密には「画面中央」にはならない (spec UND-1). ユーザー視点では他ビューと完全な視覚的統一にならない可能性がある. **緩和**: spec で UND-1 として未決事項に明示し, 必要なら別 BL でヘッダ構造改修を起票する.
- R-2: `.day-view__header h1` への中央揃え追加が, 将来 `.day-view__header` 内に他要素 (例: ステータスバッジ) を追加したときに視覚的に分かりにくくなる可能性. **緩和**: 本 BL では現状の構造に対する最適解として採用する. 将来構造変更時に再評価する.
- R-3: 各 view CSS にコメント付き 1 行追加が 6 箇所に散らばるため, 「全 view 統一」の意図が CSS ファイル横断で読み取りにくい. **緩和**: 各 1 行追加箇所に `/* BL-111 / REQ-N 追加 */` コメントを付け, テスト (`view-title-center-align.test.ts`) で 6 ルール全件を一括 assert することで集約管理する.

### 代替案

- ALT-1: global h1 ルール (候補 (b)) を新規 `web/src/styles/typography.css` に置く. 拒否理由は §「方針概要」と一致 (副作用範囲が広い + 新規 styles 追加が NFR-NO-GLOBAL-H1 に違反).
- ALT-2: 共通クラス `.view-title` (候補 (c)). 拒否理由は DOM 改修禁止 (NFR-PRESERVE-DOM) と整合しない.
- ALT-3: `.trash-view__header` 構造改修 (= h1 を絶対配置で中央, button を絶対配置で右端等). 非ゴール (ヘッダ構造変更) に該当. 本 BL では採用せず, 必要なら別 BL で扱う.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト

- `web/__tests__/view-title-center-align.test.ts` (vitest 単体, CSS 文面 assert)
  - 形式は `web/__tests__/completion-counter-emphasis.test.ts` と同形 (`readFileSync` + 正規表現 + `extractRuleBody` ヘルパ).
  - assert 内容:
    1. AC-h1-center 系 6 シナリオ: 各 view CSS の対象 h1 ルール本体に `text-align: center` を含む.
    2. AC-no-regression: 各 view CSS の対象 h1 ルール本体に `font-size: var(--font-size-h1)` が依然含まれる (= 非ゴール遵守).
    3. AC-no-global-h1: `web/src/styles/tokens.css` / `web/src/styles/button.css` の文面に, `h1 {` パターンを含む CSS ルールが存在しない.
    4. AC-no-class-shadow: 各 view TSX (`today-view.tsx` / `tomorrow-view.tsx` / `projects-view.tsx` / `routines-view.tsx` / `focus-view.tsx` / `settings-view.tsx` / `trash-view.tsx`) に `view-title` 文字列がヒットしない.
    5. AC-trash-header-preserved: `.trash-view__header` ルール本体に `display: flex` と `justify-content: space-between` が残っている.

### 既存テストへの影響

- `web/__tests__/today-view.test.tsx`: 無影響 (DOM 不変, 既存の getByRole('heading') / 完了カウンタ assert は維持).
- `web/__tests__/unified-day-view.test.tsx`: 無影響 (AC-2 の `<header class="day-view__header">` 内に h1 + completion-count を含む構造は不変).
- `web/__tests__/completion-counter-emphasis.test.ts`: 無影響 (本 BL は `.today-view__completion-count` / `.day-view__header--today` 本体を触らない).
- `web/src/ui/trash-view/trash-view.test.tsx`: 無影響 (`<h1>ゴミ箱</h1>` の DOM 不変).
- 各 view の test (`projects-view.test.tsx` / `routines-view.test.tsx` / `settings-view.test.tsx` 等): 無影響 (DOM 不変).
- Playwright spec (各 view 訪問 / heading 取得): 無影響 (DOM 不変, レイアウト系プロパティ未変更).

### 品質ゲート

- vitest 全件 green (既存テスト + 新規 `view-title-center-align.test.ts`).
- Playwright 全件 green.
- lint / typecheck 0 件.
- auditor 承認.

## 実装手順 (高レベル)

1. test-designer が `web/__tests__/view-title-center-align.test.ts` を作成 (red 状態を作る).
2. implementer が plan §「CSS の変更」のとおり 6 ファイルに 1 行ずつ追加 (red → green).
3. auditor が CSS 文面 / DOM 不変 / 既存テスト無影響 / vitest / Playwright / lint / typecheck を検証.
