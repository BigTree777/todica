# 仕様: ダークモードのベース色適用（body 背景・文字色）

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-143
- 依存: BL-140 (`features/dark-mode/` / `tokens.css` のダーク上書きブロック)、BL-046 (`features/design-tokens/`)
- 方式の根拠: [`../../adr/0012-css-framework.md`](../../adr/0012-css-framework.md)（vanilla CSS + トークン）、
  [`../../adr/0013-dark-mode-os-follow.md`](../../adr/0013-dark-mode-os-follow.md)（OS 追従・CSS トークン上書き）。
  本 BL は両 ADR の方式の範囲内のパッチであり、新規 ADR は起票しない。

## 背景 / 課題

`web/src/styles/tokens.css` は `@media (prefers-color-scheme: dark)` で `:root` のカラートークンを
上書きするが、トークンをページルートに適用するルール（`body { background: ...; color: ... }`）が
リポジトリ内のどこにも存在しない。`color-scheme` も未宣言のため、OS がダーク設定でも
UA デフォルト（白 canvas・黒文字）が生き、ダークモードが実質機能していない。

具体的な症状:

1. **ダーク時もページ背景が白のまま**: `--color-bg: #121212` は定義されているだけで、
   どの要素にも適用されない。
2. **ハンバーガーメニューが黒背景に黒文字**: `app-shell.css` の `.app-shell__menu` は
   `background: var(--color-bg)` で暗くなるが、`.app-shell__nav-link { color: inherit }` の
   継承元が body → UA デフォルト黒のため文字が読めない。
3. タスクカード等、`background: var(--color-bg)` / `color: var(--color-fg)` を明示参照する
   要素だけが正しくダークになる。

既存ガードテスト `web/__tests__/dark-mode-tokens.test.ts` は「コンポーネント CSS に生の色が
残っていないか」「ダーク上書きが全トークンを網羅するか」を検査するのみで、
「トークンをページルートに適用する工程」の欠落は検出できない。

## ゴール / 非ゴール

### ゴール

- OS ダーク設定時に、ページ全体（body）の背景が `--color-bg`（暗色）、文字色が `--color-fg`（明色）で
  表示される。ライト設定時は現状どおり白背景・黒系文字が維持される。
- `color: inherit` で継承する要素（ハンバーガーメニューのナビリンク等）が、ライト / ダーク双方で
  可読なコントラストになる。
- `:root { color-scheme: light dark }` を宣言し、フォームコントロール・スクロールバー等の
  UA 描画部品も OS のカラースキームに追従させる。
- 「body へのベース色適用ルールが存在すること」をガードテストで恒久的に強制し、
  同種の欠落の再発を防ぐ。

### 非ゴール

- **`index.html` の `theme-color` meta（`#000000` 固定）の修正**: スコープ外（必要なら別 BL 化）。
- **手動トグル / テーマ設定の永続化**: BL-140 の非ゴールを踏襲。OS 追従のみ。
- **カラートークン値（ライト / ダーク）の変更**: `tokens.css` のトークン定義は一切変更しない。
- **コンポーネント CSS（`web/src/ui/**/*.css`）の変更**: 各 view / コンポーネントは触らない。
  ベース色の適用のみで症状 1・2 が解消される。
- **新規カラートークンの追加**: 既存の `--color-bg` / `--color-fg` のみを使う。

## 要件

### 機能要件

- **REQ-1 ベーススタイルシートの新設**: `web/src/styles/base.css` を新設し、
  `body { background: var(--color-bg); color: var(--color-fg); }` を定義する。
- **REQ-2 color-scheme 宣言**: `base.css` に `:root { color-scheme: light dark; }` を定義し、
  UA 描画部品（フォームコントロール・スクロールバー等）を OS カラースキームに追従させる。
- **REQ-3 グローバル適用**: `web/src/main.tsx` で `./styles/base.css` を import する
  （既存の `tokens.css` import の後）。これにより全 view にベース色が波及する。
- **REQ-4 tokens.css の不変**: `web/src/styles/tokens.css` は変更しない。
  トークン定義（カスタムプロパティ宣言）専用のファイルという役割を維持する。
- **REQ-5 ガードテストの追加**: 以下を機械検証するテストを追加する（受け入れ基準 AC-1〜AC-4）。
  - body へのベース色適用ルール（`background: var(--color-bg)` / `color: var(--color-fg)`）の存在。
  - `:root` への `color-scheme: light dark` 宣言の存在。
  - `main.tsx` が `base.css` を import していること。
  - `base.css` に生の色リテラルが無いこと。

### 非機能要件

- **REQ-6 既存トークンのみ使用**: `base.css` の色は `var(--color-*)` 参照のみで構成し、
  生の色リテラル（hex / rgb / rgba / hsl / 名前付き色）を書かない。
- **REQ-7 依存追加ゼロ**: ADR-0012 / ADR-0013 の原則を維持。ライブラリ・ビルド設定・JS ロジックは
  追加しない（`main.tsx` への import 文 1 行を除き CSS のみ）。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。
> 構造的に検証可能な基準（AC-1〜AC-5）は test-designer がガードテスト化する対象。
> 視覚基準（AC-V1〜AC-V3）は auditor / architecture-reviewer が実在確認する対象
> （「テスト green == 実装」は AC-1〜AC-5 にのみ成立する）。

### 構造的に検証可能（ガードテスト対象）

```
シナリオ: AC-1 body へのベース色適用ルールが存在する
  Given web/src/styles/base.css
  When  body セレクタの宣言ブロックを抽出する（コメントは除外）
  Then  background（または background-color）の値が var(--color-bg) である
  And   color の値が var(--color-fg) である
```

```
シナリオ: AC-2 color-scheme が宣言されている
  Given web/src/styles/base.css
  When  :root セレクタの宣言ブロックを抽出する（コメントは除外）
  Then  color-scheme: light dark が宣言されている
```

```
シナリオ: AC-3 base.css がエントリポイントから import されている
  Given web/src/main.tsx
  When  import 文を走査する
  Then  ./styles/base.css の import が存在する
```

```
シナリオ: AC-4 base.css に生の色リテラルが無い
  Given web/src/styles/base.css
  When  宣言値・var() フォールバック引数を走査する（コメントは除外）
  Then  hex / rgb() / rgba() / hsl() / hsla() / 名前付き色が 1 件も検出されない
        （色は全て var(--color-*) 経由である）
```

```
シナリオ: AC-5 既存の全テストが green を維持し tokens.css が変わらない
  Given 本 BL の変更を適用した状態
  When  リポジトリルートで npx vitest run を実行する
  Then  既存テスト（web/__tests__/dark-mode-tokens.test.ts を含む）が全て green のまま
  And   web/src/styles/tokens.css に差分が無い
  And   npm run lint は warning 0、npm run typecheck は pass
```

### 視覚（auditor / architecture-reviewer が実在確認）

```
シナリオ: AC-V1 OS ダーク設定でページ全体がダーク配色になる
  Given OS のカラースキームを「ダーク」に設定したブラウザ
  When  アプリの各 view を表示し、ハンバーガーメニューを開く
  Then  ページ背景が暗色（--color-bg のダーク値）・本文が明色（--color-fg のダーク値）で表示される
  And   ハンバーガーメニューのナビリンクの文字が暗い背景上で可読である（黒背景に黒文字にならない）
```

```
シナリオ: AC-V2 ライト設定で見た目が回帰しない
  Given OS のカラースキームを「ライト」に設定したブラウザ
  When  アプリの各 view を表示する
  Then  背景・文字色が従来と同等（白背景・黒系文字）で表示され、視覚的な回帰が無い
```

```
シナリオ: AC-V3 UA 描画部品がカラースキームに追従する
  Given OS のカラースキームを「ダーク」に設定したブラウザ
  When  フォームコントロール（select / input 等）とスクロールバーを表示する
  Then  color-scheme: light dark の効果により UA 描画部品がダーク配色で描画される
```

## 未決事項 / 確認待ち

- なし（配置先は `base.css` 新設で確定。判断根拠は [`plan.md`](plan.md) の「重要な決定」D-1 参照）。
