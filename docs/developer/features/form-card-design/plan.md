# 設計・実装計画: form-card-design

> [`spec.md`](spec.md) の要件 (REQ-1〜REQ-5) を, どう実現するかに落とす.

## 方針概要

`web/src/ui/day-view/day-view.css` の `.day-view__form` セレクタにのみ追記する. BL-052 で `.day-view__card` に与えたのと同じ 4 宣言 (`background: var(--color-bg)` / `border: 1px solid var(--color-border)` / `border-radius: var(--radius-md)` / `padding: var(--space-md)`) を, 既存の構造系宣言 (display / flex-direction / gap) の後ろに追加する. 値は完全に同じだが, クラスは別のまま保持する (D-003 / D-004). tokens.css / JSX / focus-view.css は無改修. 検証は BL-052 で確立した CSS ファイル直読み + セレクタブロック抽出 + 宣言の存在 assert のスタイルで担保する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| domain / Repository | 変更なし |
| サーバ | 変更なし |
| UI (改修) | `web/src/ui/day-view/day-view.css` の `.day-view__form` セレクタに visual 宣言 (background / border / border-radius / padding) を追加 (REQ-1) |
| UI (新規) | なし |
| UI (削除) | なし |
| JSX | 変更なし (today-view.tsx / tomorrow-view.tsx は無改修 / REQ-3 / D-004) |
| tokens.css | 変更なし (REQ-4 / D-007) |
| focus-view | 変更なし (REQ-5 / D-005) |
| 既存 CSS の他セレクタ | `.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__list` / `.day-view__card` / `.day-view__card--focus` / `.day-view__empty` は無改修 (REQ-2) |
| テスト (新規) | `web/__tests__/form-card-design.test.ts` を新規追加. spec AC-1〜AC-8 を CSS ファイル直読みで機械検証 (詳細は §「テスト方針」) |
| テスト (追従) | なし (DOM 構造は BL-051 / BL-052 から無変更のため既存テストの追従修正は不要) |
| E2E | 既存 spec は無改修. 新規 E2E も追加しない |
| ドキュメント | backlog の BL-054 状態を Todo → Done に更新 (実装完了後) |

## 設計詳細

### day-view.css の追記内容

`.day-view__form` ルール (BL-051 完了時点では `display: flex` / `flex-direction: column` / `gap: var(--space-sm)` の 3 宣言のみ. BL-052 でも touch されていない) に, 以下の 4 宣言を追加する:

```css
.day-view__form {
  /* BL-051 で確定済みの構造系 (維持) */
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  /* BL-054 で追加する visual (REQ-1)
   * 値は .day-view__card と同一 (BL-052 / D-002).
   * shadow / hover / transition は意図的に追加しない (D-001 / D-006).
   */
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}
```

ポイント:

- `.day-view__form` の既存 3 宣言 (display / flex-direction / gap) は順序を変えず保持する.
- 追加する 4 宣言の**値**は `.day-view__card` と完全に同じ (D-002). CSS 上で値が二重に書かれることになるが本 BL では許容する (D-003).
- `.day-view__form:hover` / `.day-view__form:focus-within` 等の派生セレクタは追加しない (D-006).
- `box-shadow` は追加しない (D-001 / NFR-NO-SHADOW).

### 期待される視覚的結果

- `/today` と `/tomorrow` の `<form className="day-view__form">` (BL-051 で付与済み) が, 縁 (1px solid #ccc) + 角丸 (12px) + 内側余白 (16px) + 白背景 (#fff) を備えたカードとして描画される.
- 起票フォームとタスクカード列 (`.day-view__card`) が同じ視覚言語を共有し, 「タスクを追加するカード」と「既存タスクのカード」が連続して並ぶ.
- hover 効果なし. transition / animation なし. shadow なし.
- focus-view (`/focus`) は起票フォーム自体を持たないため見た目に変化なし.

### 例外 / エラー処理

CSS のみの差分であり, 例外発生経路は変わらない. 起票フォームの入力エラー表示 / ConflictDialog / notifyError 経路は無改修.

### 処理フロー

データフロー (TanStack Query / useMutation / offline-queue / ConflictDialog) は無改修. 本 BL の差分はレンダリング後の DOM ツリーの**見た目**のみに限られる. DOM 構造 / aria 属性 / event handler は変わらない.

## 重要な決定

spec の D 章 (D-001〜D-008) で確定済み. plan では追加の決定として以下を確定する:

- **P-001 (宣言の順序: 構造系 → visual)**: `.day-view__form` ルール本文では「既存の構造系宣言 (display / flex-direction / gap) を上に, 追加する visual 宣言 (background / border / border-radius / padding) を下に」並べる. これは BL-052 で `.day-view__card` に採用した順序と一致させ, day-view.css 全体での記述スタイルを揃えるため. 機能上は順序に意味は無いが, レビューしやすさのため統一する.
- **P-002 (border shorthand を使う)**: `border: 1px solid var(--color-border)` の shorthand 形式で記述する. `border-width` / `border-style` / `border-color` 個別の分解は使わない. BL-052 の `.day-view__card` と同じ表記スタイルを採用することで, 「これは BL-052 と同じカード意匠の form 版である」というコードリーディング上の意図が伝わりやすくなる.
- **P-003 (CSS 値の二重記述を許容: 抽象化は将来 BL)**: `.day-view__card` と `.day-view__form` で同じ 4 宣言を書くことを許容する (D-003). 共通スタイルへの抽象化 (mixin, `@apply`, 共通クラス `.card-surface` 等) は本 BL のスコープ外とし, 将来 BL の余地として残す. 抽象化のタイミングは「3 つ目以降の同種カードが現れたとき」「テーマ切替を導入するとき」などをトリガに別途検討する.
- **P-004 (テスト検証手法は BL-052 と同じスタイル)**: `web/__tests__/task-card-design.test.ts` で確立した「`extractRuleBody(css, selector)` ヘルパで指定セレクタのルール本文を抽出し, 各宣言の存在を `expect(body).toMatch(...)` で assert する」スタイルを踏襲する. 具体的な値は spec の AC-1〜AC-3 で確定済み.
- **P-005 (extractRuleBody ヘルパの取扱)**: `extractRuleBody` ヘルパは BL-052 の `web/__tests__/task-card-design.test.ts` に実装済み. 本 BL の `web/__tests__/form-card-design.test.ts` では:
  1. (推奨) 同等の小関数を再定義する (= 2 ファイル間で同じ実装を持つ. test ファイルは互いに独立に動くため許容範囲).
  2. (代替) 共通ヘルパとして `web/__tests__/_helpers/extract-rule-body.ts` 等に切り出して両 test ファイルから import する.
  本 BL では 1 を採用する. 共通化は test ヘルパが 3 件以上になった時点で別途検討する (= YAGNI).

## リスク / 代替案

- **リスク R-1 (`.day-view__form:hover` / `:focus-within` を誤って追加してしまう)**: 「フォームにマウスオーバーで変化を出したい」と実装者が誤判断するリスク. 緩和策: tasks に「hover / focus-within / transition / animation を追加しない」を明示し, テスト AC-3 でこれらの宣言が無いことを assert する.
- **リスク R-2 (`.day-view__form` 内の `<input>` / `<button>` まで再装飾してしまう)**: 起票フォームの中身 (入力欄や送信ボタン) も「ついでに整える」と実装者が判断するリスク. 緩和策: tasks に「対象は `.day-view__form` セレクタのみ. 子要素セレクタ (`.day-view__form input` 等) は本 BL の対象外」と明示し, テスト AC-3 / AC-7 で他セレクタの追加が無いことを assert する.
- **リスク R-3 (既存 `.day-view__card` テストへの誤った影響)**: BL-052 の `web/__tests__/task-card-design.test.ts` は `.day-view__card` ルール本文の宣言を assert しているため, `.day-view__form` への追加では影響を受けない. ただし `extractRuleBody` の正規表現が `.day-view__card` と `.day-view__form` を取り違える可能性は無いか? → BL-052 の実装 (`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`) は escapedSelector の直後に空白 + `{` を要求するため, 異なるセレクタを誤マッチすることはない. リスクは低い.
- **リスク R-4 (focus-view との誤混入)**: `/focus` には起票フォーム自体が無いため `.day-view__form` を focus-view.css に書く理由は無いが, 念のためテスト AC-8 で focus-view.css に `.day-view__form` セレクタが含まれないことを assert する.
- **代替案 A-1 (`.day-view__form` に `.day-view__card` クラスを併記する)**: JSX 側で `<form className="day-view__form day-view__card">` のように 2 クラスを当てれば CSS の値の重複は避けられる. しかし JSX 変更を伴うため本 BL の境界線 (= CSS 1 ファイル変更で完結) に反する (D-004). また `.day-view__form` と `.day-view__card` のセマンティクス分離が崩れる. 不採用.
- **代替案 A-2 (共通クラス `.card-surface` を新設して `.day-view__form` / `.day-view__card` の両方に当てる)**: DRY 化として正しい設計だが, 本 BL のスコープを超える (CSS / JSX の両方を触る必要がある). 将来 BL の余地として残す (P-003).
- **代替案 A-3 (`@apply` 的な mixin で共通化する)**: 現プロジェクトは vanilla CSS + CSS variables (ADR-0012). PostCSS の `@apply` や Sass の mixin を導入する話になり, スコープを大幅に逸脱する. 不採用.
- **代替案 A-4 (`.day-view__form` の visual を `.day-view__card` よりも控えめにする)**: たとえば border を `--color-border-subtle` (#eee) にする, padding を `--space-sm` にする等. user 指摘は「ちゃんとカードにしてほしい」= 「タスクカードと同等のカード扱い」であり, 控えめにする方向は要望と逆. 不採用.
- **代替案 A-5 (shadow を入れて立体感を出す)**: BL-052 と同じく user が border 主役を明言済み. 不採用 (D-001).

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (新規)

新規ファイル `web/__tests__/form-card-design.test.ts` を 1 つ作り, BL-052 (`task-card-design.test.ts`) と同じスタイル (CSS ファイルを直接 `readFileSync` で読み, `extractRuleBody` で指定セレクタのルール本文を抽出して宣言の存在を assert) で spec AC-1〜AC-8 を機械検証する:

- **AC-1**: `web/src/ui/day-view/day-view.css` の `.day-view__form` ルール本文に以下の宣言が含まれることを assert する:
  - `background: var(--color-bg)` (または `background-color: var(--color-bg)`)
  - `border: 1px solid var(--color-border)` (shorthand) または `border-width: 1px` + `border-style: solid` + `border-color: var(--color-border)` (分解いずれかで OK)
  - `border-radius: var(--radius-md)`
  - `padding: var(--space-md)` (※ `gap: var(--space-sm)` と誤検知しないよう `padding:` で始まる宣言に限定するパターンマッチを使う)

- **AC-2**: `.day-view__form` ルール本文に既存の構造系宣言が依然として含まれることを assert する:
  - `display: flex`
  - `flex-direction: column`
  - `gap: var(--space-sm)`

- **AC-3**: `.day-view__form` 周辺に hover / transition / animation / box-shadow が追加されていないことを assert する:
  - `.day-view__form` ルール本文に `box-shadow:` / `transition:` / `animation:` 宣言が含まれない.
  - CSS ファイル全体に `.day-view__form:hover` / `.day-view__form:focus-within` / `.day-view__form:active` セレクタが存在しない.

- **AC-4**: CSS ファイル全体に `box-shadow` キーワードが含まれないことを assert する (`expect(content).not.toContain("box-shadow")`). これは BL-052 の AC-4 と同等の全域チェック.

- **AC-5**: `web/src/styles/tokens.css` に本 BL で参照する 4 トークン (`--color-bg` / `--color-border` / `--radius-md` / `--space-md`) が定義されていることを assert する. これは tokens.css が改変されていない (= 必要なトークンが消えていない) ことのスモークチェック.

- **AC-6**: `web/src/ui/today-view/today-view.tsx` と `web/src/ui/tomorrow-view/tomorrow-view.tsx` に `day-view__form` クラスが含まれていることを assert する. これは BL-051 で付与済みのクラスが本 BL で誤って外されていないことを確認する.

- **AC-7**: `.day-view__form` 以外のセレクタ (`.day-view` / `.day-view__header` / `.day-view__list` / `.day-view__empty`) のルール本文に, 本 BL で追加すべきでない visual 宣言 (background / border 系) が含まれないことを assert する. これは BL-052 の AC-7 と同じスタイルで, 本 BL のスコープが `.day-view__form` に限定されていることを保証する.
  - 注意: `.day-view__card` / `.day-view__card--focus` は BL-052 で正当に visual 宣言を持つため, 本 BL の AC-7 のチェック対象から除外する.

- **AC-8**: `web/src/ui/focus-view/focus-view.css` に `.day-view__form` セレクタが含まれないことを assert する (焦点ビュー混入の防止).

### 単体テスト (追従)

不要. 本 BL の差分は CSS の追記のみで, DOM 構造 / aria 属性 / role / accessibleName は無変更. 既存単体テスト (`web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx` / `unified-day-view.test.tsx` / `task-card-design.test.ts` / `design-tokens.test.ts` 等) は無修正で通る.

### E2E

不要. 既存 `e2e/*.spec.ts` は無改修. visual 差分は単体テストで CSS 宣言の存在を assert する形で担保する.

AC-10 (a11y violations 0 件維持) は既存 `e2e/a11y.spec.ts` が引き続き green で通れば満たされる. 本 BL の差分は CSS のみで, ランドマーク / 見出し / aria 属性に影響しない.

### 回帰 (既存 green の維持)

- `web/__tests__/today-view.test.tsx` 全 describe ブロックが green.
- `web/__tests__/tomorrow-view.test.tsx` 全 describe ブロックが green.
- `web/__tests__/unified-day-view.test.tsx` (BL-051) 全 describe ブロックが green.
- `web/__tests__/task-card-design.test.ts` (BL-052) 全 describe ブロックが green.
- `web/__tests__/design-tokens.test.ts` (BL-046) 全 describe ブロックが green.
- `e2e/a11y.spec.ts` の全スキャンで violations 0 件.
- `npm run lint -w web` / `npm run typecheck` が exit 0.
