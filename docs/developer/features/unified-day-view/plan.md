# 設計・実装計画: unified-day-view

> [`spec.md`](spec.md) の要件 (REQ-1〜REQ-9) を, どう実現するかに落とす.

## 方針概要

`web/src/ui/day-view/day-view.css` を新規作成し, `.day-view` 系の BEM クラスで today-view / tomorrow-view の共通構造を表現する. 2 つの `.tsx` の JSX 並び順とラッパー要素を最小限書き換え (`<section>` → `<main>`, `<header>` 追加, 「現在のタスク」セクションの位置入れ替え, 入れ子 `<div>` 撤去) しつつ, aria-label と挙動は一切変えない. visual 詳細 (border / radius / background / shadow) は本 BL では入れず, BL-052 に委ねる.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| domain / Repository | 変更なし |
| サーバ | 変更なし |
| UI (新規) | `web/src/ui/day-view/day-view.css` を新設 (REQ-7) |
| UI (改修) | `web/src/ui/today-view/today-view.tsx` (REQ-1〜REQ-5 / D-002), `web/src/ui/tomorrow-view/tomorrow-view.tsx` (REQ-1〜REQ-6 / D-007), `web/src/ui/today-view/today-view.css` (`.today-view__header` 削除. `.today-view__completion-count` のみ残す / D-005) |
| UI (削除) | `web/src/ui/tomorrow-view/tomorrow-view.css` を**ファイルごと削除** (REQ-8) |
| テスト (追従) | `web/__tests__/today-view.test.tsx` / `web/__tests__/tomorrow-view.test.tsx` のうち, `querySelector(".tomorrow-view__*")` や `closest(".tomorrow-view__item")` 等の旧クラス依存箇所のみ追従 (REQ-9). aria セレクタ依存箇所は無修正 |
| テスト (新規) | 構造アサーション用の単体テスト (`web/__tests__/unified-day-view.test.tsx`) を新規追加. AC-1〜AC-6 / AC-10 を機械検証 (詳細は §「テスト方針」) |
| E2E | 既存 spec は無改修. hamburger 系リグレッション (D-008) は別 BL |
| ドキュメント | backlog の BL-051 状態を Doing → Done に更新 (実装完了後) |

## 設計詳細

### day-view.css の最小定義

新規 `web/src/ui/day-view/day-view.css` に置く CSS は以下のみとする. visual 詳細 (border / radius / background / shadow) は含めない (D-004).

```css
/*
 * 共通レイアウト CSS for /today and /tomorrow (BL-051 / unified-day-view).
 *
 * - 本 BL は HTML 構造の共通化と最小限のレイアウト系プロパティのみ扱う.
 * - カードの border / radius / background / shadow / 強調 variant の visual は
 *   BL-052 (task-card-design) で `.day-view__card` / `.day-view__card--focus` に追加する.
 */

.day-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.day-view__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.day-view__header h1 {
  font-size: var(--font-size-h1);
  margin: 0;
}

.day-view__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.day-view__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.day-view__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.day-view__card--focus {
  /* 強調 variant のフックのみ. visual は BL-052. */
}

.day-view__empty {
  color: var(--color-fg-subtle);
  text-align: center;
  padding: var(--space-lg) 0;
}
```

ポイント:

- `.day-view__form` から角丸枠 (`border` / `border-radius` / `padding`) を撤去している. 既存 tomorrow-view.css は `border: 1px solid var(--color-border)` を持っていたが, 本 BL では visual 詳細を BL-052 に集約するためこの border は付けない. ユーザーから見ると一時的に「フォームの枠が消える」リグレッションになる. これは D-004 の意図的な選択で, BL-052 で `.day-view__form` または `.day-view__card` に統一的な border を与えて回復する. plan として明示する.
- `.day-view__card` は flex column + gap のみで, 子要素の縦並び (project 名 / タスク名 / 星 / button 群) を素直に並べる. tomorrow-view.css にあった「左右並び (`justify-content: space-between`)」は visual 整列なので除く (= BL-052 で再導入). 一時的に各カードの中身が縦並びになる.
- `.day-view__card--focus` は本 BL では空ルール (or 完全省略可) としておく. CSS フックがあれば BL-052 で `border-width` を太くするだけで強調になる. 実装上は空ルールを残しておくほうが将来差分が分かりやすい.

### tomorrow-view.tsx の差分 (要約)

```tsx
// before:
<section aria-label="明日のタスク" className="tomorrow-view">
  <h1>明日のタスク</h1>
  <form aria-label="..." className="tomorrow-view__form">...</form>
  {tasks.length === 0 && <p className="tomorrow-view__empty">...</p>}
  <ul aria-label="..." className="tomorrow-view__list">
    {tasks.map((task) => (
      <li className="tomorrow-view__item">
        <div className="tomorrow-view__item-body">
          {project && <span className="tomorrow-view__project">{project.name}</span>}
          <span className="tomorrow-view__name">{task.name}</span>
        </div>
        <div className="tomorrow-view__actions">
          <button>削除</button>
          {task.origin !== "routine" && <button>今日にする</button>}
          <button>完了</button>
        </div>
      </li>
    ))}
  </ul>
  <ConflictDialog ... />
</section>

// after:
<main className="day-view">
  <header className="day-view__header"><h1>明日のタスク</h1></header>
  <form aria-label="..." className="day-view__form">...</form>
  {tasks.length === 0 && <p className="day-view__empty">...</p>}
  <ul aria-label="..." className="day-view__list">
    {tasks.map((task) => (
      <li className="day-view__card" key={task.id}>
        {project && <span>{project.name}</span>}
        <span>{task.name}</span>
        <button>削除</button>
        {task.origin !== "routine" && <button>今日にする</button>}
        <button>完了</button>
      </li>
    ))}
  </ul>
  <ConflictDialog ... />
</main>
```

import 差分:

- 削除: `import "./tomorrow-view.css";`
- 追加: `import "../day-view/day-view.css";`

### today-view.tsx の差分 (要約)

```tsx
// before:
<main>
  <header className="today-view__header">
    <h1>今日</h1>
    <span className="today-view__completion-count">今日の完了: {completionCount}</span>
  </header>
  <form aria-label="タスク起票フォーム">...</form>
  {focusedTask && (
    <section aria-label="現在のタスク">
      <h2>現在のタスク</h2>
      <div>...</div>
    </section>
  )}
  <ul aria-label="タスク一覧">{otherTasks.map(...)}</ul>
  <ConflictDialog ... />
</main>

// after:
<main className="day-view">
  <header className="day-view__header">
    <h1>今日</h1>
    <span className="today-view__completion-count">今日の完了: {completionCount}</span>
  </header>
  {focusedTask && (
    <section
      aria-label="現在のタスク"
      className="day-view__card day-view__card--focus"
    >
      <h2>現在のタスク</h2>
      <div>...</div>
    </section>
  )}
  <form aria-label="タスク起票フォーム" className="day-view__form">...</form>
  <ul aria-label="タスク一覧" className="day-view__list">
    {otherTasks.map((task) => (
      <li className="day-view__card" key={task.id}>...</li>
    ))}
  </ul>
  <ConflictDialog ... />
</main>
```

import 差分:

- 既存: `import "./today-view.css";`
- 追加: `import "../day-view/day-view.css";`

JSX 内部の `<section aria-label="現在のタスク">` 内の構造 (`<h2>` / `<div>` ラッパー / `<span>` / `<PriorityStars />` / 3 button) は維持. `<div>` ラッパーは本 BL では撤去しない (focus セクションの内部入れ子は今後 BL-052 で再評価予定).

### today-view.css の差分 (要約)

```css
// before:
.today-view__header { display: flex; align-items: center; justify-content: space-between; }
.today-view__completion-count { font-size: var(--font-size-small); color: var(--color-fg-subtle); }

// after:
.today-view__completion-count { font-size: var(--font-size-small); color: var(--color-fg-subtle); }
```

`.today-view__header` のレイアウト定義は `.day-view__header` に統合され, today-view.css 側からは削除する.

### 例外 / エラー処理

UI 層の構造変更のみで例外発生経路は変わらない. ConflictDialog / notifyError / OptimisticLockError 経路は無改修.

### 処理フロー

データフロー (TanStack Query / useMutation / offline-queue / ConflictDialog) は無改修. 本 BL の差分はレンダリング後の DOM ツリーのみに限られる.

## 重要な決定

spec の D 章 (D-001〜D-008) で確定済み. plan では追加の決定として以下を確定する:

- **P-001 (visual 詳細を入れない範囲を明示)**: 既存 tomorrow-view.css の `.tomorrow-view__form` / `.tomorrow-view__item` には `border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-md)` が含まれていた. 本 BL ではこれを `.day-view__form` / `.day-view__card` に**引き継がない**. 一時的に枠が消える視覚リグレッションが発生するが, BL-052 で統一的に再導入する前提で受け入れる. user 合意済み.
- **P-002 (一時的視覚リグレッションの範囲)**: P-001 により本 BL 完了時点では以下の見た目が一時的に変わる:
  - `/tomorrow` の起票フォームの角丸枠が消える.
  - `/tomorrow` のタスクカードの border / radius / padding が消え, 子要素が縦並びになる (project 名 → タスク名 → 削除 → 今日にする → 完了 が縦に積まれる).
  - `/today` のタスクカードはもともと無装飾だったので変化なし.
  - `/today` の「現在のタスク」セクションは起票フォームの**前**に移動する (D-002).
  - `/today` の `<header>` 右端 completionCount の位置は維持 (`.day-view__header` の justify-content: space-between で同等).
- **P-003 (`<span>` / `<div>` のクラス無付与)**: tomorrow-view の `<li>` 子要素 (project 名 / タスク名 / action button) には個別 className を付けない. これは visual を BL-052 にまとめる方針 (D-004) と整合する. 内部要素にクラスを付けない代わりに, BL-052 で `.day-view__card > .day-view__card-name` のような子クラスを必要に応じて新設する.
- **P-004 (テスト追従の最小化)**: aria-label / role / accessibleName ベースのアサーションは無修正で通る (NFR-COMPAT). 修正が必要なのは以下のような旧クラス依存箇所のみ:
  - `screen.getByRole(...).querySelector(".tomorrow-view__item")` → `closest("li")` か `closest(".day-view__card")` に書き換え
  - `expect(li.className).toContain("tomorrow-view__item")` → `expect(li.className).toContain("day-view__card")` に書き換え
  - `getByText("明日のタスク").closest("section")` → `getByText("明日のタスク").closest("main")` に書き換え (D-006 のランドマーク変更で section が main になる)
  - 現状の `today-view.test.tsx` / `tomorrow-view.test.tsx` を grep して該当箇所を列挙し, tasks.md T-005 で追従する.

## リスク / 代替案

- **リスク R-1 (視覚リグレッションのレビュー反応)**: P-002 で「枠が消える / 子要素が縦並びになる」一時状態が出る. user は spec 確定時にこれを認識済みだが, レビューで「不格好」と差し戻される可能性. 緩和策: PR 本文に「視覚的な縁取りは BL-052 でまとめて入れる」と明示し, BL-052 の着手を即座に予定に組み込む.
- **リスク R-2 (`<main>` ランドマーク重複)**: spec U-1 で確認済みの通り `app-shell.tsx` の `.app-shell__main` は `<div>` なので, 本 BL で today/tomorrow を `<main>` にしても重複しない. ただし将来 AppShell 側が `<main>` 化される変更が入ると衝突するため, ADR や別 BL でフォローが必要.
- **リスク R-3 (内部 `<div>` 撤去でテスト破壊)**: tomorrow-view.test.tsx は現在 `closest("li")` ベースで card を取り出しており, 内部入れ子の撤去で `within(card).getByRole("button")` の挙動は変わらないはず. ただし `getByText(project.name).closest(".tomorrow-view__project")` のような細かい依存があれば破壊される. テスト追従 (T-005) で grep して列挙する.
- **代替案 A-1 (専用 `DayView` コンポーネントを新設)**: 共通化を `<DayView>` という関数コンポーネントの抽出で行う案. メリット: 振る舞いまで含めて共通化できる. デメリット: today だけが持つ「現在のタスク」セクションを props として渡す必要があり, 差分が大きくなる. user 合意は「CSS / 構造の共通化」までで, 関数抽出は別 BL (将来やってもよい). 不採用.
- **代替案 A-2 (今 visual も入れて 1 BL で完結)**: BL-052 を本 BL に統合する案. メリット: 中間状態が無く視覚リグレッションが出ない. デメリット: spec / plan が 2 倍になり, レビュー粒度が大きすぎる. 本 BL は構造に専念, BL-052 は visual に専念で分割するほうがレビューに優しい. 不採用.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (新規 + 追従)

新規ファイル `web/__tests__/unified-day-view.test.tsx` を 1 つ作り, AC-1〜AC-6 / AC-10 を機械的に検証する:

- **AC-1 / AC-2**: `<TodayView />` / `<TomorrowView />` をそれぞれ render し, `container.querySelector("main.day-view")` / `container.querySelector(".day-view__header")` の存在を assert する. AC-1 の「ルートが `<main>` で class に day-view を含む」「tomorrow-view クラスが DOM に無い」 を verify.
- **AC-3**: focusedTask を持つ today モックで render し, `<main>` の `children` 配列の順序 = [header, section[aria-label=現在のタスク], form, ul] を assert. section の className に `day-view__card` と `day-view__card--focus` の両方が含まれることも assert.
- **AC-4**: 今日タスク 0 件のモックで render し, `screen.queryByRole("region", { name: /現在のタスク/ })` が null であることを assert. 同時に `<main>` 子要素の順序 = [header, form, ul] (section 無し) を assert.
- **AC-5**: `screen.getByRole("form", { name: "タスク起票フォーム" })` / `"明日のタスク起票フォーム"` の `className` に `day-view__form` を含むことを assert. `tomorrow-view__form` を含まないことも assert.
- **AC-6**: `<ul>` の className に `day-view__list`, 各 `<li>` の className に `day-view__card` を含むことを assert. 旧クラスを含まないことも assert.
- **AC-10**: tests としては grep スモークが範囲外だが, 補強として 1 アサーションで `tomorrow-view__` プレフィックスが両ビュー出力 DOM に出ないことを正規表現 + outerHTML で verify する (file system の `ls tomorrow-view.css` は CI step 側で確認).

既存テストの追従 (`web/__tests__/today-view.test.tsx` / `web/__tests__/tomorrow-view.test.tsx`):

- 旧クラス名 (`.tomorrow-view__form` / `.tomorrow-view__item` / `.tomorrow-view__empty` / `.tomorrow-view__list`) を querySelector / closest で参照している箇所のみ追従修正する.
- aria-label / role / accessibleName 依存箇所は無修正.

### E2E

既存 `e2e/*.spec.ts` は無改修. AC-7 / AC-9 は E2E ではなく単体テスト + CI step での grep で代替する (E2E hamburger リグレッションが解消するまで `/today` `/tomorrow` への direct navigation が制限されるため. D-008).

AC-9 (a11y violations 0 件維持) は既存 `e2e/a11y.spec.ts` が green で通れば満たされる. 本 BL の構造変更で `<section>` → `<main>` になることで `<main>` が 1 ページに 1 個に保たれるかは, 単体テストで併せて assert する (`container.querySelectorAll("main").length === 1` 系のスモークを混ぜる).

### CI step スモーク

PR の CI スクリプトに以下の 2 行を追加するか, または本 BL の auditor 受け入れチェックリストに含める:

- `ls web/src/ui/tomorrow-view/tomorrow-view.css` が exit 非 0 であること (AC-10 後半).
- `grep -rn "tomorrow-view__" web/src/` が 0 件ヒットであること (AC-10 前半).

CI script 化が大袈裟なら, auditor が手で叩いて確認する形でよい (本 BL のスコープ判断は plan の段階で曖昧にせず, tasks.md に「手動で grep 確認」とチェックポイントを置く).

### 回帰 (既存 green の維持)

- `web/__tests__/today-view.test.tsx` 全 describe ブロックが green.
- `web/__tests__/tomorrow-view.test.tsx` 全 describe ブロックが green.
- `e2e/a11y.spec.ts` の全スキャンで violations 0 件.
- `npm run lint` / `npm run typecheck` が exit 0.
