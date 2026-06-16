# 設計・実装計画: 完了タスク数カウンタの中央配置 + アクセント色強調

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`today-view.tsx` の `<header>` に today 専用 modifier クラス `day-view__header--today`
を追加し、`today-view.css` 内でその modifier に対して `flex-direction: column` を宣言する
(= ヘッダを 2 段化)。並行して、既存ルール `.today-view__completion-count` の
`font-size` / `color` を `var(--font-size-h2)` / `var(--color-accent)` に書き換え、
`text-align: center` を追加する。共通 `day-view.css` の `.day-view__header` は無改修とし、
tomorrow ビューへの副作用をゼロにする。サーバ API / domain / repository / tokens.css /
カウンタの取得経路は一切触らない。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| ドメイン / Repository | なし |
| デザイントークン | なし (`--font-size-h2` / `--color-accent` は既存トークンを参照するのみ) |
| 共通 CSS | なし (`web/src/ui/day-view/day-view.css` の `.day-view__header` を変更しない) |
| UI - TSX | `web/src/ui/today-view/today-view.tsx`: `<header>` の className を `"day-view__header"` → `"day-view__header day-view__header--today"` に変更する 1 箇所 |
| UI - CSS | `web/src/ui/today-view/today-view.css`: 新規ルール `.day-view__header--today` (flex-direction: column 等) を追加。既存ルール `.today-view__completion-count` の `font-size` / `color` を書き換え、`text-align: center` を追加 |

## 設計詳細

### データモデル

変更なし。`completionCount` は `repository.today()` の `TodayData` レスポンスに既に含まれる。

### 処理フロー

変更なし。`useQuery({ queryKey: ["today"] })` 経由で `completionCount` を取得し、
`useMutation` 成功時に `invalidateQueries(["today"])` で再フェッチ → 再描画する既存フロー
を維持する。

### JSX の変更

**変更前** (`web/src/ui/today-view/today-view.tsx`, line 497-507):

```tsx
<header className="day-view__header">
  <h1>今日</h1>
  <span className="today-view__completion-count" aria-label="今日の完了タスク数">
    今日の完了: {completionCount}
  </span>
</header>
```

**変更後**:

```tsx
<header className="day-view__header day-view__header--today">
  <h1>今日</h1>
  <span className="today-view__completion-count" aria-label="今日の完了タスク数">
    今日の完了: {completionCount}
  </span>
</header>
```

- 追加するのは modifier クラス `day-view__header--today` 1 個のみ。
- マークアップ構造 (`<header>` 直接の子: `<h1>` + `<span>` の 2 要素) は **不変**。
  BL-050 / BL-051 の固定 assertion (childCount === 2 / 順序: h1 → span) を破壊しない。
- 既存 `aria-label="今日の完了タスク数"` / `<span>` タグ / クラス名
  `today-view__completion-count` は維持。BL-008 / BL-047 のテストが全て green を維持する。

### CSS の変更

**変更前** (`web/src/ui/today-view/today-view.css` 全文):

```css
.today-view__completion-count {
  font-size: var(--font-size-small);
  color: var(--color-fg-subtle);
}
```

**変更後**:

```css
/*
 * BL-105: today 専用 header modifier.
 *
 * 共通 .day-view__header (= tomorrow と共有) のレイアウト宣言を破壊せず, today だけ
 * 2 段 (h1 / カウンタ) の縦並びに切り替える. 1 段目 h1 は左寄せのまま, 2 段目
 * カウンタは .today-view__completion-count 側の text-align: center で中央寄せにする.
 *
 * tomorrow / projects / routines ビューでは付与されないため副作用なし.
 */
.day-view__header--today {
  flex-direction: column;
  align-items: stretch;
}

/*
 * BL-105: カウンタを「今日の達成指標」として強調する.
 *
 * - font-size: var(--font-size-h2) (= 20px) で h1 (= 24px) の次点サイズに昇格.
 * - color: var(--color-accent) (= amber-700 / #b45309). BL-102 で priority-stars の
 *   点灯星に既採用されたトークン. 達成 / アクティブ指標の視覚言語を統一する.
 * - text-align: center で 2 段目の行内で水平方向中央に寄せる.
 *
 * 旧 BL-047 の控えめ表示 (font-size-small / color-fg-subtle) を本 BL で置き換える.
 */
.today-view__completion-count {
  font-size: var(--font-size-h2);
  color: var(--color-accent);
  text-align: center;
}
```

注: `align-items: stretch` は flex column における既定値だが、共通 `.day-view__header` 側に
`align-items: center` が指定されている (`day-view.css` line 24) ため、modifier 側で明示的に
`stretch` で上書きしないと 2 段目の `<span>` が intrinsic width に縮んで中央寄せが効かない
可能性がある。設計上 `stretch` を明示することで `<span>` が行幅いっぱいに伸び、内部の
`text-align: center` で中央寄せが効くようにする。

### 例外 / エラー処理

変更なし。`completionCount` のフォールバック (`todayData?.completionCount ?? 0`) は BL-008
実装で既に存在する。

## 重要な決定

- **D-001 (共通 CSS 非破壊 / today 専用 modifier 採用)**: backlog で提示された 2 候補のうち、
  「today 専用に `.day-view__header--today` を派生」を採用する。
  - 不採用案: 共通 `.day-view__header` 自体を `flex-direction: column` に変更
    - 不採用理由: tomorrow ビューが同じクラスを共有しており、tomorrow の h1 単独 header の
      レイアウトを意図せず変えてしまう。BL-051 / unified-day-view の tomorrow 用 assertion
      (h1 「明日のタスク」のみを含む) は通過するが、視覚的な layout 変化のリスクが残る。
      また将来 tomorrow に補助情報を追加する際の制約にもなる。
  - 採用理由: today にのみ modifier を付けることで、影響範囲を today-view.tsx と
    today-view.css の最小 2 ファイルに閉じ込められる。共通 CSS の責務 (= 全 day-view 共通の
    基本レイアウト) を保てる。

- **D-002 (modifier 名 `day-view__header--today`)**: BEM の modifier 記法
  (`<block>__<element>--<modifier>`) に従う。`today-view__header` のような
  「today 名前空間で新規 block 化」案も考えられるが、既存テスト
  (`unified-day-view.test.tsx` の AC-2: `<header class="day-view__header">` が存在することの
  assertion) を温存するためにベースクラス `day-view__header` を残し、modifier を **加算** する。

- **D-003 (中央寄せの実現手段)**: 「2 段目の `<span>` を行内で水平中央に寄せる」手段として、
  modifier 側の `align-items: stretch` (= `<span>` を行幅いっぱいに伸ばす) + カウンタ側の
  `text-align: center` を採用する。代替案として modifier 側に `align-items: center` を置く
  方法もあるが、その場合 `<h1>` も中央揃えになって 1 段目の見た目が変わるため不採用
  (= 1 段目 h1 は左寄せのまま維持したい)。

- **D-004 (font-size: h2 採用)**: backlog 指定の `var(--font-size-h2)` (= 20px) を採用。
  h1 (= 24px) より一段小さく、本文 (`--font-size-body` = 16px) より一段大きいサイズで、
  「達成数を一目で読める」要件と「h1 を主役として食わない」バランスを満たす。

- **D-005 (color: accent / amber-700 採用)**: backlog 指定の `var(--color-accent)`
  (= `#b45309`) を採用。BL-102 で priority-stars の点灯星に既採用された同一トークン。
  「達成 / アクティブな指標」の視覚言語を統一する。新トークン追加は不要 (NFR-NO-NEW-TOKENS)。

## リスク / 代替案

- **R-001 (tomorrow への漏れ込み)**: 万一 modifier ではなく共通 `.day-view__header` を
  変更してしまうと、tomorrow ビューの header にも縦並び化が伝播する。D-001 の方針で防ぐ。
  受け入れ基準 §「共通 .day-view__header ルールは flex-direction を持たないか, row のままである」
  でガードする。

- **R-002 (既存 `font-size-small` / `fg-subtle` アサーション)**: 既存テスト群を grep した
  範囲では、`today-view__completion-count` の `font-size` / `color` を CSS 文面で
  assert しているテストは存在しない。よって CSS 書き換えだけで red 化する既存テストは
  無い見込み。実装時に念のため `npx vitest run` で全件確認する。

- **R-003 (`.day-view__header` の align-items: center 上書き)**: 共通側で `align-items: center`
  が指定されているため、modifier 側で `align-items: stretch` を明示しないと `<span>` の
  width が auto に縮み `text-align: center` が効かないリスクがある。D-003 の方針で対処。

- **代替案: カウンタを `<div>` 要素にして flex item として `align-self: center` を当てる**:
  マークアップ変更を伴うため不採用。BL-047 で `<span>` に確定済みであり、
  `today-view.test.tsx` の REQ-2 (tagName === "SPAN") を破壊する。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

### 失敗するテスト (test-designer 作成範囲)

- **AC-配置**: today header に modifier クラス `day-view__header--today` が付与されることを
  単体テストで verify する (`today-view.test.tsx`)。
- **AC-tomorrow 非波及**: tomorrow header に modifier `day-view__header--today` が
  付与されないことを単体テストで verify する (`tomorrow-view.test.tsx` または
  `unified-day-view.test.tsx` の tomorrow 系 describe に追加)。
- **AC-スタイル (font-size / color / text-align)**: `web/src/ui/today-view/today-view.css`
  の `.today-view__completion-count` ルール本体に `font-size: var(--font-size-h2)` /
  `color: var(--color-accent)` / `text-align: center` の 3 宣言が含まれることを、
  ファイル読み込み + 正規表現 match で verify する (新規テストファイル
  `web/__tests__/completion-counter-emphasis.test.ts` または既存 design-tokens 系テストに追記)。
- **AC-modifier 宣言**: `.day-view__header--today` ルール本体に `flex-direction: column` が
  含まれることを CSS 文面で verify する。
- **AC-共通非破壊**: `web/src/ui/day-view/day-view.css` の `.day-view__header` ルール本体に
  `flex-direction: column` が **含まれない** ことを verify する (tomorrow 非波及の回帰ガード)。

### 既存テストの green 維持確認 (implementer 確認範囲)

- BL-008: `today-view.test.tsx` の「BL-008 今日の完了数表示」describe 全件。
- BL-047: `today-view.test.tsx` の「BL-047 完了タスク数カウンタの配置見直し」describe 全件
  (header 子孫 / `<span>` タグ / focus & tomorrow 非存在)。
- BL-050: `today-view.test.tsx` の「BL-050 ...」describe の `childCount === 2` 系および
  E2E `e2e/remove-inline-project-create.spec.ts` の同等検証。
- BL-051: `unified-day-view.test.tsx` の AC-2 (today header に
  `today-view__completion-count` を含む / tomorrow header には含まない)。
- E2E: `e2e/state-restoration.spec.ts` の「今日の完了: N」テキスト復元検証。
- design-tokens: `design-tokens.test.ts` の `--color-accent` / `--font-size-h2` 定義検証
  (本 BL は token 追加なしなので自然 green)。

### 手動確認 (任意)

- ブラウザ実機で /today と /tomorrow を開き、today だけ header が 2 段になっていること、
  tomorrow は 1 段 (h1 のみ) のままであることを目視で確認する。
- カウンタが amber-700 で表示され、サイズが h1 より一段小さい h2 サイズで、行内で
  水平中央に配置されていることを目視で確認する。
