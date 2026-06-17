# 仕様: プロジェクトカード / プロジェクト起票カードのプロジェクト名フォントサイズを h2 に揃える

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-110
- 依存: BL-060 (`features/project-card-component/` / `<ProjectCard>` / `<ProjectFormCard>` 新設) / BL-070 (`features/inline-edit-all-cards/` / 編集モード概念撤去, name を常時 `<input>` 表示化) / BL-104 (起票カードを + ボタン展開で出す UI)
- 参考: BL-071 (`features/routine-card-component/` REQ-6 / D-002 で同じ「親 font-size + input への font 継承 + jsdom 対応の二重宣言」イディオムを既に採用) / BL-063 (TaskCard V-4 / V-7 で `.task-card__title { font-size: var(--font-size-h2) }` の系統)

## 背景 / 課題

`/projects` で表示される `<ProjectCard>` と `<ProjectFormCard>` のプロジェクト名 `<input>` は
ともに `.project-card__input` クラスを使う
(`web/src/ui/project-card/project-card.tsx` の `<input className="project-card__input">` /
`web/src/ui/project-card/project-form-card.tsx` の同一クラス使用)。

しかし `web/src/ui/project-card/project-card.css` の `.project-card__input` ルールは
`flex: 1` を宣言するのみで `font-size` を指定していない。`<input>` はブラウザ既定で
親要素から `font` を継承しないため、結果としてプロジェクト名はユーザーエージェント既定の
input サイズ (一般に 13px 前後) で描画される。

一方、タスクカードのタスク名は `.task-card__title { font-size: var(--font-size-h2) }`
(= 20px) を親 (`<div className="task-card__title">`) に置き、子の `<input>` には
`.task-card__title input[type="text"] { font: inherit }` を当てて継承させている
(`web/src/ui/task-card/task-card.css` の V-4 / V-7)。
ルーティンカードも同様のイディオムを採用しており、ルーティン名 input は h2 サイズで描画される
(`web/src/ui/routine-card/routine-card.css` の `.routine-card__title` / `.routine-card__input` /
BL-071 REQ-6 / D-002)。

この差により、`/projects` のプロジェクト名 input だけが他カード系の「エンティティ名」と
比べて 1 段小さい視覚サイズで描画され、3 系統 (task / routine / project) 間で
カード上の主タイトルの視覚ヒエラルキーが揃わない。

## ゴール / 非ゴール

### ゴール

- `<ProjectCard>` / `<ProjectFormCard>` のプロジェクト名 `<input className="project-card__input">`
  を `var(--font-size-h2)` (= 20px) で描画する。
- 結果として `/projects` のプロジェクトカード上のプロジェクト名と、`<TaskCard>` の
  タスク名 input、`<RoutineCard>` のルーティン名 input が **同じ視覚サイズ** で並ぶ。
- 既存の `<ProjectCard>` / `<ProjectFormCard>` の DOM / ARIA / マークアップ / 文言は無改修。
- 既存テスト群 (`project-card-component.test.tsx` / `inline-edit-all-cards.test.tsx` 等) が
  全件 green を維持する。

### 非ゴール

- **プロジェクト名以外のテキストサイズ変更**: 「削除」 button / 「追加」 submit / 「キャンセル」 button
  / placeholder 色 / label テキスト等は無改修。
- **routine-card / task-card への波及**: 系統独立 (= ペア専用 CSS) の方針に従い、本 BL の
  変更は `web/src/ui/project-card/project-card.css` 1 ファイルに閉じ込める。
- **デザイントークンの追加 / 変更**: `--font-size-h2` は既存トークン。tokens.css は無改修
  (NFR-NO-NEW-TOKENS / BL-046 方針の踏襲)。
- **新規 CSS セレクタ / クラスの導入**: 影響は `.project-card__input` 単一ルールの宣言追加で
  完結する。新規 modifier やラッパ要素を JSX に追加しない (= マークアップ不変)。
- **`.project-card` (親) 自身の `font-size` 変更**: 親に `font-size` を置くと「削除」 button や
  将来 `.project-card` 直下に増えるテキストにも継承してしまう。本 BL は input にのみ font 拡大を
  及ぼすため、宣言は `.project-card__input` 側に閉じる (D-001 参照)。
- **placeholder 色 / `flex: 1` 等の既存宣言の改変**: 現状の `.project-card__input` /
  `.project-card__input::placeholder` 既存宣言には触れない。

## 要件

### 機能要件

- **REQ-1 input フォントサイズ**: `web/src/ui/project-card/project-card.css` の
  `.project-card__input` ルール本体に `font-size: var(--font-size-h2)` を追加する。
  追加後、`<ProjectCard>` / `<ProjectFormCard>` の `<input className="project-card__input">`
  はブラウザ既定の input フォントサイズではなく、`var(--font-size-h2)` (= 20px) で描画される。

- **REQ-2 視覚ヒエラルキーの統一**: `/projects` で表示される既存プロジェクトカードのプロジェクト名と、
  起票カードのプロジェクト名入力欄が、 `<TaskCard>` のタスク名 input および `<RoutineCard>` の
  ルーティン名 input と同じ視覚サイズ (= 20px) で描画される。

- **REQ-3 既存宣言の保存**: `.project-card__input` ルール本体の既存宣言 (`flex: 1`) は
  保持する。`.project-card__input::placeholder { color: var(--color-fg-subtle) }` も保持する。

- **REQ-4 マークアップ不変**: `<ProjectCard>` (`project-card.tsx`) と `<ProjectFormCard>`
  (`project-form-card.tsx`) の JSX / className / ARIA / label 構造 / `htmlFor` ↔ `id` 関連付け /
  button ラベル文言は変更しない。本 BL の編集対象は `project-card.css` 1 ファイルである。

### 非機能要件

- **NFR-NO-NEW-TOKENS**: tokens.css は無改修。`--font-size-h2` は既存トークンを参照するだけ。
- **NFR-SCOPE-CSS-ONLY**: 影響範囲は `web/src/ui/project-card/project-card.css` 1 ファイル。
  他 CSS / TSX には触れない。
- **NFR-NO-ROUTINE-OR-TASK-CASCADE**: `task-card.css` / `routine-card.css` には宣言を追加しない。
  系統独立 (= ペア専用 CSS) の方針 (`task-card.css` 冒頭コメント / `project-card.css` 冒頭コメント /
  `routine-card.css` 冒頭コメント) に従う。
- **NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION**: 本 BL では `box-shadow` / `transition` /
  `animation` / `:hover` を追加しない (BL-060 AC-18 の制約継続)。
- **既存テスト互換性**: 以下の既存テストが green を維持すること。
  - `web/__tests__/project-card-component.test.tsx` (AC-1 〜 AC-18 全件 / 特に AC-4
    `.project-card__input` の `flex: 1` 検証と `::placeholder` 色検証)。
  - `web/__tests__/inline-edit-all-cards.test.tsx` の `<ProjectCard>` 系シナリオ全件
    (常時 input 表示 / blur で `onNameBlur` 発火 / form / button 不在)。
  - `web/__tests__/projects-view.test.tsx` 等の `/projects` 関連テスト全件。
- **WCAG / アクセシビリティ**: `var(--color-fg)` (= 既定の本文色) と `var(--color-bg)` の
  コントラストは現行のまま維持され、フォントサイズ拡大によりむしろ可読性が向上する方向。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

### スタイル (REQ-1 / REQ-2 / REQ-3)

```
シナリオ: .project-card__input ルールに font-size: var(--font-size-h2) が宣言される
  Given web/src/ui/project-card/project-card.css を開いた
  When  .project-card__input セレクタのルール本文を観察する
  Then  ルール本文に font-size: var(--font-size-h2) を含む
```

```
シナリオ: .project-card__input の既存宣言 flex: 1 が維持される
  Given web/src/ui/project-card/project-card.css を開いた
  When  .project-card__input セレクタのルール本文を観察する
  Then  ルール本文に flex: 1 (または flex-grow: 1) を含む
```

```
シナリオ: .project-card__input::placeholder の既存宣言が維持される
  Given web/src/ui/project-card/project-card.css を開いた
  When  .project-card__input::placeholder セレクタのルール本文を観察する
  Then  ルール本文に color: var(--color-fg-subtle) を含む
```

### マークアップ不変 (REQ-4)

```
シナリオ: <ProjectCard> の DOM / className / htmlFor↔id 関連付けが維持されている
  Given <ProjectCard project={{ id: "p1", name: "仕事" }} onNameBlur={...} onDelete={...} /> を render する
  When  出力 DOM を観察する
  Then  <input id="project-name-p1" className="project-card__input" value="仕事"> が存在する
  And   <label htmlFor="project-name-p1" className="visually-hidden">プロジェクト名</label> が存在する
  And   label の for と input の id が一致する
```

```
シナリオ: <ProjectFormCard> の DOM / className / placeholder が維持されている
  Given <ProjectFormCard name="" onNameChange={...} onSubmit={...} /> を render する
  When  出力 DOM を観察する
  Then  <input id="project-name" className="project-card__input" placeholder="プロジェクト名"> が存在する
  And   <label htmlFor="project-name" className="visually-hidden">プロジェクト名</label> が存在する
```

### 系統独立 (NFR-NO-ROUTINE-OR-TASK-CASCADE / NFR-SCOPE-CSS-ONLY)

```
シナリオ: 影響範囲が project-card.css 1 ファイルに閉じている
  Given BL-110 の実装がマージされた
  When  `git diff` で本 BL の変更ファイル一覧を観察する
  Then  CSS の変更は web/src/ui/project-card/project-card.css のみである
  And   web/src/ui/task-card/task-card.css / web/src/ui/routine-card/routine-card.css は無改修である
  And   web/src/styles/tokens.css は無改修である
  And   project-card.tsx / project-form-card.tsx は無改修である
```

### 既存テスト互換性

```
シナリオ: project-card-component.test.tsx の既存 AC が全件 green を維持する
  Given BL-110 の実装がマージされた
  When  `npx vitest run web/__tests__/project-card-component.test.tsx` を実行する
  Then  全件 green である
```

```
シナリオ: vitest 全件 / Playwright 全件 が green である
  Given BL-110 の実装がマージされた
  When  リポジトリルートから `npx vitest run` と `npm -w e2e test` を実行する
  Then  両方ともテスト失敗ゼロである
```

## 未決事項 / 確認待ち

- **input への font 反映手段は「`.project-card__input` 自身に `font-size` を宣言」で確定**。
  routine-card / task-card は「親 (`.task-card__title` / `.routine-card__header` /
  `.routine-card__title`) に `font-size` を置き、子 input に `font: inherit` で継承」する 2 段方式
  を採っているが、本 BL では `.project-card__input` 自身に直接 `font-size` を当てる
  1 段方式を採用する。理由は以下:
  - `.project-card` 親に `font-size` を置くと「削除」 button や `<label class="visually-hidden">`
    にも継承してしまい、副作用範囲が広がる (非ゴール「親 `.project-card` の font-size 変更」に反する)。
  - 現状の `.project-card` 系は task-card / routine-card のような「title 専用の子ラッパ」を
    持たない (= input が `.project-card` 直下にある) ため、専用ラッパ追加は JSX 改修になり
    NFR-SCOPE-CSS-ONLY / REQ-4 に反する。
  - `.project-card__input` 自身に `font-size` を当てれば、CSS 1 行追加だけで完結し、jsdom で
    `getComputedStyle(input).fontSize` も "var(--font-size-h2)" として直接観測できる
    (routine-card で必要だった「`font: inherit` 後に明示 `font-size` を二重宣言」の jsdom 折衷も不要)。

- **line-height / padding の調整は本 BL では行わない**。tokens.css 由来の `--font-size-h2`
  (= 20px) を適用するだけで `.task-card__title` / `.routine-card__input` と同じ視覚サイズに
  揃う。high-fidelity な高さ揃え (line-height / padding 微調整) は本 BL のスコープ外とし、
  実機で目視確認したうえで必要があれば後続 BL で扱う。
