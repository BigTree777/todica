# 設計・実装計画: プロジェクトカード / プロジェクト起票カードのプロジェクト名フォントサイズを h2 に揃える

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`web/src/ui/project-card/project-card.css` の既存ルール `.project-card__input` 本体に
`font-size: var(--font-size-h2)` の 1 宣言を追加するだけで完結させる。`<ProjectCard>` /
`<ProjectFormCard>` の JSX / DOM / className / ARIA は無改修。ラッパ要素 (例: title 専用の
`<div>`) を JSX に追加せず、input 自身に font-size を当てる 1 段方式を採用する
(routine-card / task-card の 2 段継承イディオムは採用しない / 理由は spec.md §「未決事項」参照)。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| ドメイン / Repository | なし |
| デザイントークン | なし (`--font-size-h2` は既存トークンを参照するのみ) |
| 共通 CSS | なし (`task-card.css` / `routine-card.css` / `tokens.css` / `day-view.css` 等 一切無改修) |
| UI - TSX | なし (`project-card.tsx` / `project-form-card.tsx` / `projects-view.tsx` 無改修) |
| UI - CSS | `web/src/ui/project-card/project-card.css`: 既存ルール `.project-card__input` の本体に `font-size: var(--font-size-h2)` を 1 宣言追加。他の宣言には触れない。 |

## 設計詳細

### データモデル / 処理フロー / 例外

すべて変更なし。本 BL は CSS の visual 微調整のみで、`Project` ドメイン /
`ProjectRepository` / mutation 経路 / `<ProjectCard>` / `<ProjectFormCard>` の props は
無改修。

### CSS の変更

**変更前** (`web/src/ui/project-card/project-card.css`, line 46-54 周辺):

```css
.project-card__input {
  /* V-2: 残り幅を占有. */
  flex: 1;
}

.project-card__input::placeholder {
  /* V-2: placeholder を --color-fg-subtle (WCAG AA 7:1) で薄く描画. */
  color: var(--color-fg-subtle);
}
```

**変更後**:

```css
.project-card__input {
  /* V-2: 残り幅を占有. */
  flex: 1;
  /*
   * BL-110 REQ-1: プロジェクト名を h2 サイズ (= 20px) で描画する.
   * 系統間で揃える対象は <TaskCard> の `.task-card__title` 経由の input
   * (V-4 / V-7) および <RoutineCard> の `.routine-card__title` 経由の input
   * (BL-071 REQ-6 / D-002). 両者は親段に font-size を置き input に
   * `font: inherit` で継承させる 2 段方式だが, 本 BL では JSX を
   * 改修しない (NFR-SCOPE-CSS-ONLY / REQ-4) ため input 自身に
   * font-size を直接当てる 1 段方式を採る. 結果として 3 系統で同サイズに揃う.
   */
  font-size: var(--font-size-h2);
}

.project-card__input::placeholder {
  /* V-2: placeholder を --color-fg-subtle (WCAG AA 7:1) で薄く描画. */
  color: var(--color-fg-subtle);
}
```

- 既存宣言 `flex: 1` および `.project-card__input::placeholder { color: var(--color-fg-subtle) }`
  は **保持**。
- `font-size` 以外の宣言 (line-height / padding / height 等) は追加しない (spec.md §「未決事項」
  に記載のとおり、本 BL では line-height / padding 調整は行わない)。
- 親 `.project-card` 自身の `font-size` は変更しない (削除 button や label 等への波及回避)。

### JSX の変更

なし。`<ProjectCard>` (`project-card.tsx`) と `<ProjectFormCard>` (`project-form-card.tsx`) は
無改修。本 BL の編集対象は `project-card.css` 1 ファイルのみである。

## 重要な決定

- **D-001 (input 自身に font-size を当てる 1 段方式 / 親 `.project-card` には font-size を
  置かない)**: routine-card / task-card の「親段に font-size を置き input に `font: inherit`
  で継承」の 2 段方式は採用しない。

  - 不採用理由 1: `.project-card` 親に font-size を置くと「削除」 button や `.visually-hidden`
    label にも font-size が継承され、副作用範囲が広がる (非ゴール「親 `.project-card` の
    font-size 変更」に反する)。
  - 不採用理由 2: routine / task の 2 段方式は「title 専用の子ラッパ (`.task-card__title` /
    `.routine-card__title`)」が JSX に存在することを前提とする。`.project-card` には現状
    title 専用ラッパが無く、input が `.project-card` 直下にある。ラッパを足すには JSX 改修が
    必要で NFR-SCOPE-CSS-ONLY / REQ-4 (マークアップ不変) に反する。
  - 採用理由: `.project-card__input` 自身に `font-size` を当てれば 1 行追加で完結。
    jsdom でも `getComputedStyle(input).fontSize === "var(--font-size-h2)"` として
    直接観測でき、`font: inherit` のショートハンドが jsdom で computed style に展開されない
    問題 (BL-071 D-002 AC-9 で対処した課題) を初手で回避できる。

- **D-002 (line-height / padding は本 BL で調整しない)**: backlog 起票に「必要なら line-height
  / padding を併せて調整して `.task-card__title` と高さ揃え」とあるが、本 BL では `font-size`
  追加のみに留める。理由:

  - tokens.css 由来の `--font-size-h2` (= 20px) を当てるだけで、3 系統のエンティティ名
    input は同じ font-size で描画される (= REQ-2 の主目的を満たす)。
  - line-height / padding はブラウザ既定で input 系統の特性 (vertical-align: baseline /
    UA の padding 規定) に依存し、jsdom で computed style を取っても実機と一致しない
    ことが多い。assertion を CSS 文面 match に限定するため、本 BL の受け入れ基準は
    `font-size` 1 宣言の存在だけで判定できる粒度に留めて、高さ揃えは後続 BL に委ねる。
  - 実機で目視して明確に不自然 (button との垂直配置がずれる等) であれば後続 BL を起票する。

- **D-003 (jsdom 二重宣言は不要)**: BL-071 D-002 / AC-9 で routine-card は
  `.routine-card__input { font: inherit; font-size: var(--font-size-h2); }` の二重宣言を
  jsdom 対応で入れている。本 BL は親段からの継承を使わず input 自身に `font-size` を直接当てる
  ため、`font: inherit` は宣言せず、二重宣言の必要も無い (= シンプルに 1 行)。

## リスク / 代替案

- **R-001 (`.project-card__input` の `flex: 1` を意図せず削ってしまう)**: implementer が
  既存宣言を上書きしてしまうリスク。受け入れ基準 §「`.project-card__input` の既存宣言
  flex: 1 が維持される」でガードする (CSS 文面 match)。

- **R-002 (`.project-card__input::placeholder` の color が消える)**: 同様に既存 placeholder
  色宣言を誤って削るリスク。受け入れ基準 §「`.project-card__input::placeholder` の既存宣言が
  維持される」でガードする。

- **R-003 (input と「削除」 button / 「追加」 submit との垂直方向の揃いが崩れる)**: font-size
  が 13px から 20px に上がることで input の `intrinsic height` が増え、親 `.project-card` の
  `align-items: center` で button との中心揃えは維持されるが、`padding: var(--space-md)` の
  上下余白に対する input 高さの比率が変わる。視覚的に大きな崩れは想定しないが、目視確認
  時点で問題が見つかれば D-002 を改め line-height / padding 調整を別 BL で扱う。

- **代替案 1: 親 `.project-card` に font-size を置く方式**
  - 不採用 (D-001 不採用理由 1)。

- **代替案 2: title 専用ラッパ `<div className="project-card__title">` を JSX に新設し、
  task-card / routine-card と同じ 2 段方式に揃える**
  - 不採用 (D-001 不採用理由 2)。NFR-SCOPE-CSS-ONLY / REQ-4 に反するうえ、既存テスト
    `project-card-component.test.tsx` の DOM 構造 assertion (= `<input>` が `.project-card` 直下に
    ある前提) を破壊する。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

### 失敗するテスト (test-designer 作成範囲)

新規テストファイル: `web/__tests__/project-name-font-emphasis.test.ts`
(または既存 `project-card-component.test.tsx` の末尾 describe として追記する選択肢もあるが、
BL ごとに 1 ファイルで切る `completion-counter-emphasis.test.ts` の前例に倣い新規ファイルを推奨)。

- **AC-CSS-font-size**: `web/src/ui/project-card/project-card.css` の `.project-card__input`
  ルール本文に `font-size: var(--font-size-h2)` が含まれることを、ファイル読み込み +
  正規表現 match で verify する。
- **AC-CSS-flex 保存**: 同ルール本文に既存の `flex: 1` (または `flex-grow: 1`) が引き続き
  含まれることを verify する (REQ-3 保護)。
- **AC-CSS-placeholder 保存**: `.project-card__input::placeholder` ルール本文に
  `color: var(--color-fg-subtle)` が引き続き含まれることを verify する (REQ-3 保護)。
- **AC-DOM-ProjectCard 不変**: `<ProjectCard>` を jsdom で render し、input 要素が
  `className="project-card__input"` を持ち、`<label htmlFor="project-name-{id}">プロジェクト名</label>`
  と `for` ↔ `id` で関連付けされていることを verify する (REQ-4 保護)。
- **AC-DOM-ProjectFormCard 不変**: `<ProjectFormCard>` を jsdom で render し、input 要素が
  `id="project-name"` / `className="project-card__input"` / `placeholder="プロジェクト名"`
  を持つことを verify する (REQ-4 保護)。
- **AC-非波及-task/routine 無改修**: `web/src/ui/task-card/task-card.css` と
  `web/src/ui/routine-card/routine-card.css` の `.project-card__input` 系セレクタが追加されて
  いないことを CSS 文面 match で verify する (= 系統独立の回帰ガード)。

### 既存テスト green 維持確認 (implementer 確認範囲)

- `web/__tests__/project-card-component.test.tsx` 全件 (特に AC-4 `.project-card__input`
  `flex: 1` 検証 / `::placeholder` 色検証 / AC-18 box-shadow / transition / animation /
  :hover 不在検証)。
- `web/__tests__/inline-edit-all-cards.test.tsx` の `<ProjectCard>` 系シナリオ全件。
- `web/__tests__/projects-view.test.tsx` 等の `/projects` 関連テスト全件。
- `web/__tests__/design-tokens.test.ts` の `--font-size-h2` 定義検証 (本 BL では token 追加
  なしだが、参照先を保証するため一応 green を確認)。
- E2E: `/projects` のプロジェクト作成 / 名前変更 / 削除フローを扱う既存 spec
  (`e2e/projects-*.spec.ts` 系) が green を維持する。

### 全件実行

- リポジトリルートから `npx vitest run` で vitest 全件 green。
- `npm -w e2e test` で Playwright 全件 green。
- `npm -w web run typecheck` / `npm -w web run lint` で 0 件。

### 手動確認 (任意)

- ブラウザ実機で `/projects` を開き、既存プロジェクトカードのプロジェクト名と起票カードの
  プロジェクト名入力欄が、`/today` の `<TaskCard>` のタスク名 input、`/routines` の
  `<RoutineCard>` のルーティン名 input と **同じ視覚サイズ (= 20px)** で並ぶことを目視確認する。
- input と「削除」 button / 「追加」 submit との垂直方向の中心揃えが大きく崩れていないことを
  目視確認する (R-003)。崩れが目立つ場合は D-002 を改め後続 BL で line-height / padding を扱う。
