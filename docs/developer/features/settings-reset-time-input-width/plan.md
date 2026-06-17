# 設計・実装計画: 設定ビュー「リセット時刻」入力欄の横幅半減

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`web/src/ui/settings-view/settings-view.css` の `.settings-view__field-row input` ルールの `flex: 1` を `flex: 0 1 50%` に差し替える. それ以外の宣言 (`font-size`, `padding`) と他のセレクタは無改修. DOM / TSX / tokens.css / Playwright 設定にも触れない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 無し |
| DB | 無し |
| ドメイン | 無し |
| Web (TSX) | 無し (`settings-view.tsx` は無改修) |
| Web (CSS) | `web/src/ui/settings-view/settings-view.css` の `.settings-view__field-row input` 内 `flex` 宣言 1 行のみ差し替え |
| tokens.css | 無し |
| サーバ | 無し |
| Android | 無し |
| ドキュメント | `docs/developer/features/settings-reset-time-input-width/` (新規) のみ |

## 設計詳細

### CSS の具体的な差し替え

#### Before

```css
/* web/src/ui/settings-view/settings-view.css:44-48 */
.settings-view__field-row input {
  flex: 1;
  font-size: var(--font-size-h2);
  padding: var(--space-xs) var(--space-sm);
}
```

#### After

```css
.settings-view__field-row input {
  /*
   * 0 1 50%: grow なし / shrink あり / basis 50%.
   * - grow なし: input が残り幅を吸い込まない → 「変更」 button が次行に折り返されない (BL-113).
   * - shrink あり: 極小幅では button を優先して input が縮む.
   * - basis 50%: 通常時は行幅の半分が input, 残り半分が button + gap + 余白.
   */
  flex: 0 1 50%;
  font-size: var(--font-size-h2);
  padding: var(--space-xs) var(--space-sm);
}
```

### レイアウト挙動の想定

| 想定幅 | input | button | 折り返し |
| --- | --- | --- | --- |
| 標準 (≧ 600px) | 行幅の約 50% | 自然幅 (`変更`) | 無し. 行末に余白あり |
| モバイル (375 〜 480px) | 行幅の約 50% | 自然幅 | 無し |
| 極狭幅 (button 自然幅 + gap > 50%) | shrink で縮む | 自然幅 | 無し (button が次行に押し出されない) |

### 例外 / エラー処理

無し. 純粋な視覚スタイルの調整.

## 重要な決定

- D-1: 採用方針は `flex: 0 1 50%` (= spec の候補 b). 根拠は `spec.md` §「方針 (a/b/c) の選定根拠」を参照. ADR は起こさない (CSS 1 行差分のため重みが釣り合わない).
- D-2: `font-size` / `padding` は維持する. これらは BL-091 (reset-time-rework) で `var(--font-size-h2)` に統一しており, 本 BL の責務範囲外.
- D-3: 「変更」 button 側は無改修. `flex` プロパティを明示せず, デフォルト (`0 1 auto`) に任せる. 自然幅で行末に配置される.
- D-4: メディアクエリ / ブレークポイントは導入しない. 単一の `flex: 0 1 50%` で全幅域をカバーする.

## リスク / 代替案

### リスク

- R-1: 極端に狭い viewport (例: 200px 未満) では `gap` + button 自然幅 + input 最小幅の合計が行幅を超える可能性がある. ただし対象 viewport は backlog の P0 〜 P3 全体で想定していないため許容. `flex: 0 1 50%` の `1` (shrink あり) で input 側が縮んでくれる.
- R-2: 将来 `--font-size-h2` を大幅に上げると input の最小コンテンツ幅が再び行幅を圧迫する可能性がある. 本 BL の範疇外 (tokens.css 改修時に再評価する).
- R-3: CSS 文面 assertion はリテラルなので, ホワイトスペース正規化に注意 (regex で空白許容). plan の検証戦略で対処.

### 代替案 (採用しない)

- ALT-1: `width: 50%` (候補 a) — flex container 内では basis として効くが, `box-sizing` の解釈に依存して padding 込みで 50% を超える可能性があり予測しづらい.
- ALT-2: `max-width: 8em` (候補 c) — `flex: 1` を別途撤去する必要があり 2 宣言に増える. font-size 変動で実幅が動き, 「行幅の半分」という意図が直接出ない.
- ALT-3: button 側に `flex-shrink: 0` を追加 — button は元々 `flex: 0 1 auto` がデフォルトで, content の自然幅を持つため折り返しの根本原因 (input が `flex: 1` で残り幅独占) を解決しない.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト (test-designer 担当)

`web/__tests__/settings-reset-time-input-width.test.ts` を新設し, CSS ファイル文面に対して以下 4 観点を assert する (vitest + node:fs で読み込み).

- T-1 (AC-1): `.settings-view__field-row input { ... }` の本文に `flex: 0 1 50%` を含む (空白許容 regex).
- T-2 (AC-1): 同ルール本文に `flex: 1;` 単独宣言 (= `flex: 1` で値が 1 のみ) を含まない.
- T-3 (AC-2): 同ルール本文に `font-size: var(--font-size-h2)` を含む (regression guard).
- T-4 (AC-2): 同ルール本文に `padding: var(--space-xs) var(--space-sm)` を含む (regression guard).
- T-5 (AC-3): `.settings-view__field-row` (input セレクタなし) 本文に `display: flex` / `gap: var(--space-sm)` / `align-items: center` の 3 宣言が残る.
- T-6 (AC-4): `.settings-view__password-field` 本文に `display: flex` / `flex-direction: column` / `gap: var(--space-xs)` が残り, 新規に `width` / `flex` / `max-width` 宣言が追加されていない.

加えて, 既存 DOM 構造の不変を回帰ガードする観点でレンダリングテストも 1 件追加する:

- T-7 (AC-5): SettingsView を render し, `.settings-view__field-row` 直下に `input#day-boundary-time` と `button[type='submit']` がこの順で並ぶことを確認 (既存 `settings-view-cleanup.test.tsx:83-93` と二重ガード, 本 BL の責務として明示).

### 既存テスト (regression check)

CSS 変更のみのため次が全て green を維持することを確認する.

- `web/__tests__/settings-view-reset-time-label.test.tsx` (7 件)
- `web/__tests__/settings-view-cleanup.test.tsx` (FR-4 を含む)
- `web/__tests__/settings-view.test.tsx` (label 経由 / submit 経由のフロー)
- `e2e/settings.spec.ts` (「リセット時刻を変更すると表示が更新される」)
- vitest 全件 + Playwright 全件 + typecheck + lint

### 実機確認 (手動)

- M-1: 標準ウィンドウ (デスクトップ Chrome) で `/settings` を開き, input と「変更」 button が同一行に並ぶ.
- M-2: モバイル幅 (375px シミュレート) で同様に同一行で収まる.
- M-3: 「変更」 button をクリックして patchSettings が動く (既存 E2E が green ならスキップ可).
