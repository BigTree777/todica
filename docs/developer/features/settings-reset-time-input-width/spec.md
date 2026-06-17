# 仕様: 設定ビュー「リセット時刻」入力欄の横幅半減と「変更」ボタン折り返し解消

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-113

## 背景 / 課題

`/settings` の「リセット時刻」フィールドは, 同一行 (`<div className="settings-view__field-row">`) に `<input id="day-boundary-time">` と `<button>変更</button>` を配置している (`web/src/ui/settings-view/settings-view.tsx:184-198`).

現状の CSS は次のとおりで, input が行内の残り幅を `flex: 1` で独占する.

```css
/* web/src/ui/settings-view/settings-view.css:38-48 */
.settings-view__field-row {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.settings-view__field-row input {
  flex: 1;
  font-size: var(--font-size-h2);
  padding: var(--space-xs) var(--space-sm);
}
```

input の `font-size: var(--font-size-h2)` と `padding: var(--space-xs) var(--space-sm)` により input の最小コンテンツ幅が大きくなる. 表示幅が狭い場面 (モバイル / 縮小ウィンドウ) では input 1 つで行幅を使い切り,「変更」 button が次行へ折り返される. 1 段で完結する row レイアウトの意図が崩れ, ボタンの視認性も下がる.

「リセット時刻」入力は `HH:MM` 形式 (固定 5 文字) なので, input は行幅の半分程度あれば十分視認できる. 残り半分を「変更」 button + ゆとり (余白) に充てたい.

## ゴール / 非ゴール

- ゴール:
  - `.settings-view__field-row` の input と「変更」 button が, モバイル / 標準幅のいずれでも常に同一行に収まる.
  - input の幅を行幅の半分相当に固定し, 「変更」 button が行末側に配置される.
  - DOM / aria-label / マークアップ / tokens.css は無改修. CSS の局所修正のみで完了する.
- 非ゴール:
  - パスワード変更フォーム (`.settings-view__password-field`) のレイアウト変更.
  - 「ログアウト」「モード切替」など他の設定項目への波及.
  - tokens.css の追加・変更.
  - `settings-view.tsx` の修正 (DOM, className, aria-label を含む).
  - input の `font-size` / `padding` の変更 (BL-091 リセット時刻 rework の意匠を維持する).
  - 「変更」 button のスタイル変更 (`button button--primary` のまま).

## 要件

### 機能要件

- REQ-1: `.settings-view__field-row input` の `flex: 1` を撤去し, input の幅指定を「`flex: 0 1 50%`」に置き換える.
  - `0` (grow なし): 残り幅を吸い込まない → 「変更」 button が次行へ押し出されない.
  - `1` (shrink あり): 極小幅では縮む → button を優先的に表示する余地を残す.
  - `50%` (basis): 行幅の半分を基準にする.
- REQ-2: `.settings-view__field-row input` の `font-size: var(--font-size-h2)` と `padding: var(--space-xs) var(--space-sm)` は維持する (見た目の一貫性).
- REQ-3: `.settings-view__field-row` 本体の宣言 (`display: flex` / `gap: var(--space-sm)` / `align-items: center`) は維持する.
- REQ-4: `.settings-view__field-row` に属さない他のセレクタ (`.settings-view__password-field`, `.settings-view__section`, `.settings-view__logout`, `.settings-view__form` 等) は無改修.

### 非機能要件

- NFR-1: 影響範囲は `web/src/ui/settings-view/settings-view.css` 1 ファイルに閉じる.
- NFR-2: 既存テスト (vitest / Playwright) が全 green を維持する.
  - 特に `settings-view-reset-time-label.test.tsx`, `settings-view-cleanup.test.tsx`, `settings-view.test.tsx`, `e2e/settings.spec.ts` の挙動 / DOM 構造 / ラベル取得経路が変わらないことを保証する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ: AC-1 input の flex 宣言が "0 1 50%" になっている
  Given web/src/ui/settings-view/settings-view.css を読み込む
  When  .settings-view__field-row input のルール本文を確認する
  Then  "flex: 0 1 50%" を 1 宣言含む
  And   "flex: 1" 単独宣言は含まない
```

```
シナリオ: AC-2 既存の font-size / padding 宣言は維持されている
  Given web/src/ui/settings-view/settings-view.css を読み込む
  When  .settings-view__field-row input のルール本文を確認する
  Then  "font-size: var(--font-size-h2)" を含む
  And   "padding: var(--space-xs) var(--space-sm)" を含む
```

```
シナリオ: AC-3 行コンテナの宣言は変わっていない
  Given web/src/ui/settings-view/settings-view.css を読み込む
  When  .settings-view__field-row (input セレクタなし) 本文を確認する
  Then  "display: flex" を含む
  And   "gap: var(--space-sm)" を含む
  And   "align-items: center" を含む
```

```
シナリオ: AC-4 パスワード変更フィールドのスタイルに波及していない
  Given web/src/ui/settings-view/settings-view.css を読み込む
  When  .settings-view__password-field 関連のルールを確認する
  Then  既存の宣言 (display: flex / flex-direction: column / gap: var(--space-xs)) がそのまま残る
  And   width / flex / max-width が新規に追加されていない
```

```
シナリオ: AC-5 SettingsView の DOM 構造は維持される
  Given SettingsView を render する
  When  画面表示後の DOM を確認する
  Then  <div className="settings-view__field-row"> の直下に input#day-boundary-time と <button type="submit"> がこの順で並ぶ
  And   <label htmlFor="day-boundary-time">リセット時刻</label> が input に対応している
  And   aria-label / className / id / submit ボタン文言 ("変更") は変わらない
```

```
シナリオ: AC-6 既存スイートが green を維持する (回帰なし)
  Given 本機能の CSS 変更を適用した状態
  When  vitest 全件 + Playwright 全件 + typecheck + lint を実行する
  Then  全て green / 0 error で完了する
  And   settings-view-reset-time-label.test.tsx の 7 件が全て pass する
  And   settings-view-cleanup.test.tsx の FR-4 (field-row 内に input + button が並ぶ) が pass する
  And   e2e/settings.spec.ts の「リセット時刻を変更すると表示が更新される」が pass する
```

## 既存テスト互換性

調査済み. input 幅 / `flex` を assert する既存テストは無い. 以下のみが `.settings-view__field-row` と `day-boundary-time` に触れる:

| ファイル | 検査内容 | 影響 |
| --- | --- | --- |
| `web/__tests__/settings-view-reset-time-label.test.tsx` | label 文言 / id / 重複表示の不在 / 保存後の value 反映 | 無し (DOM / 文言は無改修) |
| `web/__tests__/settings-view-cleanup.test.tsx:83-93` (FR-4) | `.settings-view__field-row` 直下に `input#day-boundary-time` と `button[type='submit']` が並ぶこと | 無し (DOM は無改修) |
| `web/__tests__/settings-view.test.tsx` | label 経由の input 取得 / submit 経由の patchSettings 呼び出し | 無し (DOM / ラベル無改修) |
| `e2e/settings.spec.ts` | form 内 「リセット時刻」 input → "変更" button click | 無し (DOM / 文言無改修) |

CSS の宣言文面を文字列で assert する新規テスト (本仕様の AC-1 〜 AC-4 を担保) を追加する.

## 方針 (a/b/c) の選定根拠

backlog BL-113 が示した 3 候補について比較し, **(b) `flex: 0 1 50%`** を採用する.

| 候補 | 動作 | 長所 | 短所 |
| --- | --- | --- | --- |
| (a) `width: 50%` | flex container 内では width 指定でも basis として効くが, `box-sizing` 既定 (`content-box`) では padding 込みで 50% を超える | シンプル | flex の語彙ではなく, grow / shrink の挙動が暗黙. `box-sizing` 依存で意図がコードに現れない |
| (b) `flex: 0 1 50%` | grow なし / shrink あり / basis 50%. button は固定幅 (`flex: 0 0 auto`) のままで, input は 50% を基準に必要なら縮む | 親が flex container なので flex の語彙が最も整合的. `flex: 1` (= `1 1 0%`) からの最小差分. grow しないことで button が次行に押し出されない意図がコードに表現される | grow しない分, 極大幅では行末に余白が残る (が, これは仕様で許容している) |
| (c) `max-width: ...em` | 文字数指定 ("04:00" 5 文字 + padding 分) で上限を固定 | 文字数ベースで意味が安定 | `flex: 1` を別途撤去する必要 (二段). `var(--font-size-h2)` 変化で実幅が動く. 行幅の半分という意図が直接コードに出ない |

採用理由は次のとおり.

1. 親 `.settings-view__field-row` が `display: flex` のため, 子の幅指定は flex プロパティで表現するのが文法的に整合する.
2. `0 1 50%` は「grow しない → button を行末に押し出さない」「shrink できる → 極小幅では button を優先」「basis 50% → 行幅の半分」の 3 条件を 1 宣言で表現できる.
3. 既存の `flex: 1` (= `1 1 0%`) からの差分が最小. CSS 1 行差し替えで完了する.
4. `box-sizing` の解釈に依存しないため挙動が予測可能.

## 未決事項 / 確認待ち

- なし. 方針 (b) で確定.
