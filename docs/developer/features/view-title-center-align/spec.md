# 仕様: view-title-center-align (各ビューの h1 タイトル中央揃え統一)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-111

## 背景 / 課題

`/today` ビューでは `<header className="day-view__header day-view__header--today">` が
`flex-direction: column + align-items: stretch` の 2 段構造を持ち, 子に `<h1>今日</h1>` と
`<span className="today-view__completion-count">今日の完了: N</span>` (中央寄せ) を並べる.
カウンタが 100% 幅で中央揃えされ, かつ 1 段目の `<h1>今日</h1>` が短い 2 文字テキストであるため,
ユーザーには `<h1>今日</h1>` も画面中央付近に表示されているように見える.

一方, 他ビューの h1 は次のいずれかであり, いずれも `text-align: center` を明示していない.
- `/tomorrow`: `<header className="day-view__header"><h1>明日のタスク</h1></header>` (h1 が flex item 単独, 左端寄り).
- `/projects`: `<h1>プロジェクト</h1>` (`<header>` 無し, ブロック既定で左寄せ).
- `/routines`: `<h1>ルーティン</h1>` (同上).
- `/focus`: `<h1>現在のタスク</h1>` (同上).
- `/settings`: `<h1>設定</h1>` (同上).
- `/trash`: `<header className="trash-view__header"><h1>ゴミ箱</h1><button>...</button></header>` (`justify-content: space-between` で h1 と「全削除」 button が両端配置, h1 は左).

結果として, `/today` の見出しだけが画面中央付近に見え, 他ビューは左寄せという視覚的な不整合が生じている.

> **「中央寄せに見える」原因の確定**: 上記のとおり, BL-105 の `flex-direction: column + align-items: stretch` 化により
> h1 が block レベルで 100% 幅にストレッチし, さらに 1 段目テキスト「今日」が 2 文字と短いため,
> 隣接するカウンタの強い中央揃えと相まって視覚的に中央付近に見えている. 現状の CSS 文面で
> `.day-view__header--today h1` に `text-align: center` の明示宣言は **無い** (= 既定 left のままだが
> テキストが 2 文字のため左端からの距離が小さく中央錯覚を起こしている). 本 BL ではこの「視覚的中央」を
> 全ビューで明示的な中央揃え (= `text-align: center`) に正規化して統一する.

## ゴール / 非ゴール

- ゴール:
  - 全 view (`/today` / `/tomorrow` / `/projects` / `/routines` / `/focus` / `/settings` / `/trash`) の h1 タイトル文字列を, 左右中央揃え (`text-align: center`) で表示する.
  - 「中央揃え統一」を CSS 文面 (= 各 view CSS にある h1 ルールに `text-align: center` が明示されていること) で機械的に保証する.
  - 修正方針を「各 view CSS の `xxx-view h1` ルールに `text-align: center` を 1 行追加する個別宣言方式」 (= 候補 (a)) に確定する.
- 非ゴール:
  - h1 のフォントサイズ (`var(--font-size-h1)`) / 色 / margin の変更.
  - tokens.css の改修 (新規トークン追加 / 既存トークンの値変更).
  - DOM / マークアップ / `aria-label` の改修 (`<h1>...</h1>` の構造は据え置き).
  - app-shell / ヘッダ構造 / 各 view header 要素 (`.day-view__header` / `.trash-view__header`) の構造変更.
  - 全 view CSS への global h1 ルール導入 (候補 (b)) や `<h1 className="view-title">` 共通クラス導入 (候補 (c)). 両者を採用しない理由は plan.md §「方針概要」を参照.
  - h2 以下の見出しの揃え方変更 (本 BL は h1 に限定).
  - 視覚回帰テスト (スクリーンショット差分) の追加 / 既存 Playwright のレイアウト系 spec の改修.

## 要件

### 機能要件

- REQ-1: `web/src/ui/today-view/today-view.css` 内の `.day-view__header--today` 配下の h1 (= today ヘッダ内の `<h1>今日</h1>`) が, 計算上中央揃え (`text-align: center`) になる宣言を CSS 文面に持つ.
- REQ-2: `web/src/ui/day-view/day-view.css` の `.day-view__header h1` ルール本体に `text-align: center` の宣言を含む. これは `/tomorrow` の `<h1>明日のタスク</h1>` の中央揃えに寄与する.
- REQ-3: `web/src/ui/projects-view/projects-view.css` の `.projects-view h1` ルール本体に `text-align: center` の宣言を含む.
- REQ-4: `web/src/ui/routines-view/routines-view.css` の `.routines-view h1` ルール本体に `text-align: center` の宣言を含む.
- REQ-5: `web/src/ui/focus-view/focus-view.css` の `.focus-view h1` ルール本体に `text-align: center` の宣言を含む.
- REQ-6: `web/src/ui/settings-view/settings-view.css` の `.settings-view h1` ルール本体に `text-align: center` の宣言を含む.
- REQ-7: `web/src/ui/trash-view/trash-view.css` の `.trash-view__header h1` ルール本体に `text-align: center` の宣言を含む. なお `.trash-view__header` 自身は `display: flex / justify-content: space-between` のままで, h1 と「全削除」 button の左右両端配置レイアウトは不変 (= 非ゴール: ヘッダ構造を変えない). h1 単独 (flex item) の `text-align: center` 宣言の効果は plan.md §「リスク / 代替案」で扱う.

### 非機能要件

- NFR-NO-NEW-TOKENS: tokens.css は本 BL では一切改修しない (既存 `--font-size-h1` を参照するのみ).
- NFR-PRESERVE-DOM: DOM (`<h1>`, header, ボタン) / `aria-label` / マークアップは無改修. 影響は CSS 文面のみ.
- NFR-NO-GLOBAL-H1: `web/src/styles/` 配下に global な h1 ルールを新設しない (= 候補 (b) を採用しない). 既存ファイル `tokens.css` / `button.css` も無改修.
- NFR-NO-COMMON-CLASS: `.view-title` のような共通クラスを各 view の h1 に付与しない (= 候補 (c) を採用しない). DOM 改修禁止と整合.
- NFR-PRESERVE-LAYOUT: `.day-view__header` / `.day-view__header--today` / `.trash-view__header` の flex / column / justify-content 等のレイアウト系プロパティは一切改修しない. 追加するのは各 view CSS の **h1 ルール本体への 1 宣言 (`text-align: center`)** のみ.
- NFR-DOC-RATIONALE: 中央寄せの正規化方法を「各 view CSS の h1 ルール個別宣言 (= 候補 (a))」とする選定理由を plan.md に明記する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証は **CSS 文面 assert** (= `.css` ファイルを `readFileSync` し, 指定セレクタのルール本文に
> `text-align: center` が含まれることを assert する) で行う. これは BL-105 の
> `web/__tests__/completion-counter-emphasis.test.ts` で確立されたパターンと同形.

### AC-h1-center: 各 view CSS の h1 ルール本文に text-align: center が宣言されている

```
シナリオ: today header の h1 が中央揃えで宣言される (REQ-1 / REQ-2)
  Given web/src/ui/day-view/day-view.css の .day-view__header h1 ルールを開く
  When  ルール本体を読む
  Then  ルール本文に text-align: center が含まれる

シナリオ: projects view の h1 が中央揃えで宣言される (REQ-3)
  Given web/src/ui/projects-view/projects-view.css の .projects-view h1 ルールを開く
  When  ルール本体を読む
  Then  ルール本文に text-align: center が含まれる

シナリオ: routines view の h1 が中央揃えで宣言される (REQ-4)
  Given web/src/ui/routines-view/routines-view.css の .routines-view h1 ルールを開く
  When  ルール本体を読む
  Then  ルール本文に text-align: center が含まれる

シナリオ: focus view の h1 が中央揃えで宣言される (REQ-5)
  Given web/src/ui/focus-view/focus-view.css の .focus-view h1 ルールを開く
  When  ルール本体を読む
  Then  ルール本文に text-align: center が含まれる

シナリオ: settings view の h1 が中央揃えで宣言される (REQ-6)
  Given web/src/ui/settings-view/settings-view.css の .settings-view h1 ルールを開く
  When  ルール本体を読む
  Then  ルール本文に text-align: center が含まれる

シナリオ: trash header の h1 が中央揃えで宣言される (REQ-7)
  Given web/src/ui/trash-view/trash-view.css の .trash-view__header h1 ルールを開く
  When  ルール本体を読む
  Then  ルール本文に text-align: center が含まれる
```

### AC-no-regression: h1 の font-size / margin が改修されていない (非ゴール遵守)

```
シナリオ: 各 view CSS の h1 ルールに font-size: var(--font-size-h1) が残っている
  Given 各 view CSS (day-view / projects-view / routines-view / focus-view / settings-view / trash-view) の対応 h1 ルールを開く
  When  ルール本体を読む
  Then  font-size の値が var(--font-size-h1) のままである
```

### AC-no-global-h1: 共通 styles 配下に global h1 ルールが追加されていない (NFR-NO-GLOBAL-H1)

```
シナリオ: web/src/styles/ 配下に新規の h1 ルールが入っていない
  Given web/src/styles/tokens.css と web/src/styles/button.css を読む
  When  CSS 文面を走査する
  Then  どちらにも h1 セレクタを含む CSS ルールが存在しない
```

### AC-no-class-shadow: <h1> に .view-title 等の共通クラスが付与されていない (NFR-NO-COMMON-CLASS)

```
シナリオ: 各 view の TSX に共通 view-title クラスが現れない
  Given web/src/ui/{today,tomorrow,projects,routines,focus,settings,trash}-view/*.tsx を読む
  When  className="view-title" を grep する
  Then  どのファイルにもヒットしない
```

### AC-trash-header-preserved: trash-view__header のレイアウトは無改修 (NFR-PRESERVE-LAYOUT)

```
シナリオ: .trash-view__header ルールに display: flex と justify-content: space-between が残っている
  Given web/src/ui/trash-view/trash-view.css の .trash-view__header ルールを開く
  When  ルール本体を読む
  Then  display: flex と justify-content: space-between の宣言が残っている
  And   ヘッダ DOM (h1 と全削除 button の 2 子) は trash-view.tsx 内で改修されていない
```

### 既存テスト互換性

- `web/__tests__/unified-day-view.test.tsx` AC-2 (`<header class="day-view__header">` 内に h1 + completion-count を含む) は本 BL の修正で破壊されない. h1 の DOM / aria 構造は不変.
- `web/__tests__/today-view.test.tsx` / `web/__tests__/completion-counter-emphasis.test.ts` の既存 assert (BL-105 の `.today-view__completion-count` と `.day-view__header--today` の宣言) は本 BL では触らない.
- `web/src/ui/trash-view/trash-view.test.tsx` で `<h1>ゴミ箱</h1>` を `getByRole('heading')` で取る既存テストは本 BL で破壊されない (DOM 不変).
- Playwright の各 view 訪問系 spec (login 後の `getByRole('heading', { name: '...' })` 系) は本 BL の修正で破壊されない.

## 未決事項 / 確認待ち

- UND-1: `/trash` ヘッダの「ゴミ箱」見出しは, 現状 `.trash-view__header { display: flex; justify-content: space-between; }` の左端 flex item として配置される. h1 単独に `text-align: center` を当てた場合, h1 自体は flex item としては左に残るため, 「全削除」 button が無いとき (= ゴミが空のとき) の h1 内テキストは flex item 幅内で中央寄せされる. ただし「全削除」 button が存在するときは h1 の flex item 幅が縮み, 体感としては中央 (=画面中央) には来ない. これは非ゴール「ヘッダ構造を変えない」と本 BL の方針 (a) (CSS 文面 1 宣言のみ追加) の組み合わせの結果として **受け入れる**. もし「ボタンがある場合でも画面中央に置きたい」要件であれば本 BL の方針 (a) では不足し, 別途ヘッダ構造改修 BL を起票する.
- UND-2: `/today` ヘッダの h1 は `.day-view__header--today { align-items: stretch; }` で block 100% 幅となるため, `.day-view__header h1` への `text-align: center` 追加で確実に中央揃えになる (= 画面幅中央). 既存「中央錯覚」と一致する明示宣言になる. これは UND-1 のような曖昧さを持たない.
- UND-3: 本 BL では Playwright や jsdom の `getComputedStyle` による「実際に中央寄せされている」スクリーンショット級の assert は **行わない** (jsdom が CSS custom property を解決しない既知制約 + 視覚回帰の運用負担). 検証は CSS 文面 assert に限定する. これは BL-105 と同じ方針.
