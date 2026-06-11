# 設計・実装計画: task-card-design

> [`spec.md`](spec.md) の要件 (REQ-1〜REQ-5) を, どう実現するかに落とす.

## 方針概要

`web/src/ui/day-view/day-view.css` の `.day-view__card` と `.day-view__card--focus` の 2 セレクタにのみ追記する. 通常カードには border / radius / padding / background を与えて「カードの本体 = 縁」とし, 強調カードは border-width / radius / padding の 3 点を上げて差別化する. 色 (border-color / background) は通常から継承して連続感を保つ. tokens.css と JSX は無改修. 検証は CSS ファイルの内容を直接 `readFileSync` で読んで宣言の存在を assert する単体テストで担保する (BL-046 の `design-tokens.test.ts` と同じスタイル).

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| domain / Repository | 変更なし |
| サーバ | 変更なし |
| UI (改修) | `web/src/ui/day-view/day-view.css` に `.day-view__card` の visual 宣言 (background / border / border-radius / padding) と `.day-view__card--focus` の強調宣言 (border-width / border-radius / padding) を追加 (REQ-1 / REQ-2) |
| UI (新規) | なし |
| UI (削除) | なし |
| JSX | 変更なし (today-view.tsx / tomorrow-view.tsx は無改修 / REQ-4 / D-005) |
| tokens.css | 変更なし (REQ-5 / D-004) |
| focus-view | 変更なし (D-006) |
| テスト (新規) | `web/__tests__/task-card-design.test.ts` を新規追加. AC-1〜AC-4 / AC-7 を CSS ファイル直読みで機械検証 (詳細は §「テスト方針」) |
| テスト (追従) | なし (DOM 構造は BL-051 から無変更のため既存テストの追従修正は不要) |
| E2E | 既存 spec は無改修. 新規 E2E も追加しない |
| ドキュメント | backlog の BL-052 状態を Todo → Done に更新 (実装完了後) |

## 設計詳細

### day-view.css の追記内容

`.day-view__card` ルール (BL-051 完了時点では `display: flex` / `align-items: center` / `gap: var(--space-md)` の 3 宣言のみ) に, 以下の 4 宣言を追加する:

```css
.day-view__card {
  /* BL-051 で確定済みの構造系 (維持) */
  display: flex;
  align-items: center;
  gap: var(--space-md);
  /* BL-052 で追加する visual (REQ-1) */
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}
```

`.day-view__card--focus` ルール (BL-051 完了時点では空ルール) に, 以下の 3 宣言を追加する:

```css
.day-view__card--focus {
  /* BL-052 で追加する強調 (REQ-2)
   * border-color / background は .day-view__card を継承するため宣言しない (D-003).
   */
  border-width: 2px;
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}
```

ポイント:

- `.day-view__card` の既存 3 宣言 (display / align-items / gap) は順序を変えず保持する.
- `.day-view__card--focus` には `border-color` / `background` を書かない. これは `<section className="day-view__card day-view__card--focus">` の構造 (BL-051 REQ-3 / 確定済み) において両クラスが同時に当たることを前提に, `.day-view__card` 側の宣言を継承する設計とする (D-003).
- `border` shorthand と `border-width` の併用: `.day-view__card` で `border: 1px solid var(--color-border)` を指定したあと, `.day-view__card--focus` で `border-width: 2px` のみを上書きする. これは CSS の通常のカスケード挙動で, `border-style: solid` と `border-color: var(--color-border)` は維持されたまま width のみ 2px になる.

### 期待される視覚的結果

- `/today` と `/tomorrow` の各 `<li className="day-view__card">` は, 縁 (1px solid #ccc) + 角丸 (12px) + 内側余白 (16px) + 白背景 (#fff) を備えたカードとして描画される.
- `/today` の「現在のタスク」セクション (`<section className="day-view__card day-view__card--focus">`) は, 通常カードよりひと回り大きい (padding 24px) / 縁が太く (2px) / 角丸が大きい (16px) カードとして描画され, 他カードと連続感を保ちつつ強調される.
- shadow は無し. hover 効果も無し (本 BL では追加しない).

### 例外 / エラー処理

CSS のみの差分であり, 例外発生経路は変わらない. ConflictDialog / notifyError / OptimisticLockError 経路は無改修.

### 処理フロー

データフロー (TanStack Query / useMutation / offline-queue / ConflictDialog) は無改修. 本 BL の差分はレンダリング後の DOM ツリーの**見た目**のみに限られる. DOM 構造 / aria 属性 / event handler は変わらない.

## 重要な決定

spec の D 章 (D-001〜D-007) で確定済み. plan では追加の決定として以下を確定する:

- **P-001 (border shorthand + border-width 上書きの順序依存)**: `.day-view__card--focus` の `border-width: 2px` は, CSS ファイル内で `.day-view__card` ルールの**後**に `.day-view__card--focus` ルールが書かれていれば期待通りカスケードされる. day-view.css のセレクタ並び順は BL-051 で `.day-view__card` → `.day-view__card--focus` の順に並んでいるため, 本 BL でも順序を変えない.
- **P-002 (HTML の class 適用順依存なし)**: `<section className="day-view__card day-view__card--focus">` の class 属性内の順序は CSS のカスケードに影響しない (= 適用順はセレクタ詳細度と CSS ファイル内の宣言順で決まる). BL-051 の JSX は `day-view__card day-view__card--focus` の順で書かれているが, 仮に逆順 (`day-view__card--focus day-view__card`) でも同じ結果になる. JSX 変更は不要.
- **P-003 (テスト検証手法は BL-046 と同じスタイル)**: `web/__tests__/design-tokens.test.ts` で確立した「CSS ファイルを `readFileSync` で読み込み, セレクタブロックを正規表現で抽出し, 各宣言の存在を `expect(content).toMatch(...)` または `expect(content).toContain(...)` で assert する」スタイルを踏襲する. 具体的な値は spec の AC-1〜AC-4 で確定済み.
- **P-004 (セレクタブロック抽出の実装方針)**: テスト内では「`.day-view__card { ... }` ブロックの本文を抽出する関数」を用意する. ナイーブには `/\.day-view__card\s*\{([^}]*)\}/` の正規表現で `.day-view__card` ルールを抽出できるが, `.day-view__card--focus` も同じ prefix を持つため, 厳密には `/\.day-view__card\s*\{([^}]*)\}/` ではなく `/^\.day-view__card\s*\{([^}]*)\}/m` のように `--focus` を含まない `.day-view__card` ルールに限定する正規表現を使うか, 単純に CSS ファイル全文に対して `expect(allContent).toContain("var(--color-bg)")` のような部分一致で assert する. 抽出が複雑になりそうなら全文部分一致で割り切ってよい (= AC-1〜AC-4 の本質は「特定の宣言が CSS に書かれていること」であり, セレクタブロックを厳密に切り出す必要は無い). 実装者に裁量を残す.

## リスク / 代替案

- **リスク R-1 (border shorthand の重複指定で `border-width` が無視される)**: `.day-view__card` で `border: 1px solid var(--color-border)` を書き, `.day-view__card--focus` で `border-width: 2px` のみを書く設計. CSS の標準カスケードでは正しく 2px に上書きされるが, 実装者が誤って `.day-view__card--focus` 側で `border: 2px solid var(--color-border)` のような shorthand を書くと意図せず color も上書きしてしまう (今回は同じ var を再指定する形になるため結果は同じだが, D-003 「border-color を別途宣言しない」原則と矛盾する). 緩和策: plan §「day-view.css の追記内容」で `border-width` 単独宣言を明示する.
- **リスク R-2 (視覚的に「縁が一周しないように見える」誤認)**: `.day-view__card--focus` で `border-width: 2px` のみを上書きする場合, 既存の `border: 1px solid var(--color-border)` から `border-style` と `border-color` を継承するため正しく一周する. 仮に `.day-view__card` 側の宣言が `border-style` / `border-color` を持たないと border が描画されない. plan §「day-view.css の追記内容」の通り `.day-view__card` で `border: 1px solid var(--color-border)` の shorthand を書くため style / color は明示される. リスクは低い.
- **リスク R-3 (`.day-view__card .day-view__card--focus` のような子孫セレクタが書かれる誤実装)**: 想定外の実装者が「`.day-view__card .day-view__card--focus` のように子孫セレクタにしたほうが詳細度が上がる」と誤解する可能性. 実際は `<section className="day-view__card day-view__card--focus">` のように 1 要素に 2 クラスが付くため, 子孫セレクタは無効. plan の例示で `.day-view__card--focus { ... }` の単独セレクタを明示する.
- **リスク R-4 (focus-view との混同)**: `.day-view__card--focus` (= today ビュー内「現在のタスク」セクション用) と `.focus-view__card` (= `/focus` 単独ページ用) はクラス名が紛らわしい. 実装者が誤って focus-view.css にも追記する可能性. tasks にて「focus-view.css は触らない」を明示し, auditor チェックでも確認する (D-006).
- **代替案 A-1 (shadow も入れて立体感を出す)**: user が「shadow は脇役, border が主役」と明言済みのため不採用 (D-001 / NFR-NO-SHADOW).
- **代替案 A-2 (`.day-view__card--focus` で background や border-color を accent 系に変える)**: 強調手段として「色」を使う案. user 合意は「縁を太く / radius を大きく / padding を広く」の 3 点強化 (D-002). 色は通常カードを継承する (D-003). 不採用.
- **代替案 A-3 (border の代わりに outline を使う)**: outline は border と違い content box の外側に描画され, レイアウトに影響しない. しかし user 指摘は「縁が必要」であり, outline は「枠」というよりフォーカスリングの印象が強い. border のほうが「カードの本体」という意図に合う. 不採用.
- **代替案 A-4 (tokens.css に `--card-padding-md` / `--card-padding-lg` のような専用トークンを追加)**: 既存トークン (`--space-md` / `--space-lg`) でそのまま意味が通るため不要. tokens.css の安定性を守る原則 (D-004) を維持. 不採用.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (新規)

新規ファイル `web/__tests__/task-card-design.test.ts` を 1 つ作り, BL-046 (`design-tokens.test.ts`) と同じ「CSS ファイルを直接 `readFileSync` で読んで宣言の存在を assert する」スタイルで spec AC-1〜AC-4 / AC-7 を機械検証する:

- **AC-1**: `web/src/ui/day-view/day-view.css` の内容に以下の宣言が含まれることを assert する:
  - `background: var(--color-bg)` (または `background-color: var(--color-bg)`)
  - `border: 1px solid var(--color-border)`
  - `border-radius: var(--radius-md)`
  - `padding: var(--space-md)` (※既存の `.day-view__card` 構造系の `gap: var(--space-md)` と区別するため, セレクタブロック抽出 or 「`padding:` で始まる行に `var(--space-md)` を含む」のようなパターンマッチを使う)
  - 既存 (BL-051) の `display: flex` / `align-items: center` / `gap: var(--space-md)` も依然として含まれている (回帰防止).

- **AC-2**: 同 CSS の内容に以下の宣言が含まれることを assert する:
  - `border-width: 2px`
  - `border-radius: var(--radius-lg)`
  - `padding: var(--space-lg)`

- **AC-3**: `.day-view__card--focus` ルールブロック内に `border-color:` / `background:` 単独宣言が存在しないことを assert する. これは `.day-view__card--focus { ... }` ブロックを抽出して内部に `border-color` / `background` キーワードを含まないことを確認する形.

- **AC-4**: CSS ファイル全体に `box-shadow` キーワードが含まれないことを assert する (`expect(content).not.toContain("box-shadow")`).

- **AC-7 (補強)**: `.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__form` / `.day-view__list` / `.day-view__empty` の各ルール本文が BL-051 完了時点と同等 (= 本 BL で新規宣言を追加していない) ことを軽くスモークする. これは「他セレクタのルール本文の長さや行数が変わっていないこと」を assert するのは過剰なため, 「他セレクタのルール本文に `background:` / `border:` 等の visual キーワードが含まれていないこと」までで割り切る. 厳密な不変性は git diff レビューで担保する.

### 単体テスト (追従)

不要. 本 BL の差分は CSS の追記のみで, DOM 構造 / aria 属性 / role / accessibleName は無変更. 既存単体テスト (`web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx` / `unified-day-view.test.tsx` 等) は無修正で通る.

### E2E

不要. 既存 `e2e/*.spec.ts` は無改修. visual 差分は単体テストで CSS 宣言の存在を assert する形で担保する.

AC-10 (a11y violations 0 件維持) は既存 `e2e/a11y.spec.ts` が引き続き green で通れば満たされる. 本 BL の差分は CSS のみで, ランドマーク / 見出し / aria 属性に影響しない.

### 回帰 (既存 green の維持)

- `web/__tests__/today-view.test.tsx` 全 describe ブロックが green.
- `web/__tests__/tomorrow-view.test.tsx` 全 describe ブロックが green.
- `web/__tests__/unified-day-view.test.tsx` (BL-051 で追加された) 全 describe ブロックが green.
- `web/__tests__/design-tokens.test.ts` (BL-046) 全 describe ブロックが green.
- `e2e/a11y.spec.ts` の全スキャンで violations 0 件.
- `npm run lint -w web` / `npm run typecheck` が exit 0.
