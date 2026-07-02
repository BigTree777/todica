# 設計・実装計画: ダークモードのベース色適用（body 背景・文字色）

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

グローバルのベーススタイル専用ファイル `web/src/styles/base.css` を新設し、
`body { background: var(--color-bg); color: var(--color-fg); }` と
`:root { color-scheme: light dark; }` の 2 ルールのみを置く。`main.tsx` から import して全 view に
波及させる。トークン定義（`tokens.css`）とトークン適用（`base.css`）を別ファイルに分離し、
`tokens.css` は「カスタムプロパティ宣言のみ」という役割を保つ。JS ロジック・依存は追加しない。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| モジュール | なし |
| UI (スタイル) | `web/src/styles/base.css` 新設（body ベース色 + color-scheme の 2 ルールのみ） |
| エントリポイント | `web/src/main.tsx`: `import "./styles/base.css";` を style import 群の末尾（`button.css` の後）に追加 |
| tokens.css | 変更なし（REQ-4） |
| コンポーネント CSS | 変更なし（`web/src/ui/**/*.css` は触らない） |
| テスト | `web/__tests__/dark-mode-base-colors.test.ts` を新規追加（AC-1〜AC-4 のガード） |
| ドキュメント | 本 feature ディレクトリのみ。ADR 新設なし（ADR-0012 / ADR-0013 の範囲内） |

## 設計詳細

### base.css の内容（全文レベルの設計）

```css
/* グローバルのベーススタイル.
   tokens.css のカラートークンをページルートに適用する.
   トークン定義は tokens.css, 適用はこのファイル, という分離を保つ. */

:root {
  /* UA 描画部品 (フォームコントロール・スクロールバー等) を OS カラースキームに追従させる */
  color-scheme: light dark;
}

body {
  background: var(--color-bg);
  color: var(--color-fg);
}
```

- ルールはこの 2 つに限定する。要素リセット（margin 除去等）や他のグローバルスタイルは
  本 BL のスコープ外であり、必要になれば別 BL で扱う。
- 色は `var(--color-*)` 参照のみ（REQ-6）。フォールバック引数も書かない
  （`tokens.css` が常に先に読み込まれ、`:root` 定義が保証されるため）。

### main.tsx の import 順

```ts
import "./styles/tokens.css";
import "./styles/button.css";
import "./styles/base.css";
```

- `base.css` は style import 群の末尾（`button.css` の後）に置く。
  - BL-067（`features/common-button-style/`）の D-011 ガード
    （`web/__tests__/common-button-style.test.tsx` AC-3）が「`button.css` の import は
    `tokens.css` の**直後**（1 行差）」を厳密に assert しており、間に `base.css` を挟むと
    このテストが fail する。既存ガードを尊重し、`base.css` は末尾に置く。
  - `base.css` のセレクタは `:root` / `body` のみで、`button.css`（`.button` 系）と
    セレクタが重複しないため、カスケード順（import 順）は挙動に影響しない。
- `var()` の解決は要素ツリー上の算出値時点で行われるため import 順に依存せず、
  `tokens.css` より後であればよい（spec REQ-3 と整合）。

### 処理フロー

- ランタイム処理は無い。ブラウザが `prefers-color-scheme` を評価して `--color-bg` / `--color-fg` の
  値が切り替わり、body 経由でページ全体（および `color: inherit` の継承チェーン）に波及する。
- `color-scheme: light dark` により、UA はフォームコントロール・スクロールバー・canvas 既定色を
  現在のスキームで描画する。トークン未適用の UA デフォルト部分も暗色化され、症状 1 の
  「白 canvas が生きる」状態が構造的に消える。

### 例外 / エラー処理

- 該当なし（純 CSS + import 文 1 行）。`prefers-color-scheme` 非対応の古い環境では
  ライト値（`:root` 既定）で body が塗られ、従来と同じ見た目になる。

## 重要な決定

- **D-1 配置先は base.css 新設（tokens.css への追記は不採用）**:
  - `tokens.css` は冒頭コメントで「デザイントークン定義」と宣言された、カスタムプロパティ宣言
    専用のファイルである。要素セレクタ（body）のルールを混ぜると「定義」と「適用」の責務が
    曖昧になり、既存ガードテスト（`dark-mode-tokens.test.ts`）が前提とする
    「tokens.css = `:root` のトークン集合」という構造解析の前提も崩しやすい。
  - `main.tsx` は既に `tokens.css` / `button.css` と役割別ファイルを並べて import する形であり、
    ベーススタイルを `base.css` として並べるのはこのパターンの自然な延長である。
  - backlog の具体変更に併記された 2 案（tokens.css 追記 / base.css 新設）のうち後者を採用する。
- **D-2 color-scheme は `light dark`（`dark` 単独や meta タグは不採用）**:
  OS 追従（ADR-0013）の方式に合わせ、UA にライト / ダーク両対応を宣言して選択は OS 設定に委ねる。
  `index.html` への `<meta name="color-scheme">` 追加は CSS に閉じる本方式より管理箇所が増えるため
  採らない（`theme-color` meta の扱いは非ゴールで別 BL）。
- **D-3 ガードテストは新規ファイル**: `web/__tests__/dark-mode-base-colors.test.ts` として追加する。
  既存の `dark-mode-tokens.test.ts` は BL-140 の受け入れ基準の表現であり、そこへ別 BL の基準を
  追記するより、feature 単位でテストファイルを分ける既存の慣行に合わせる。

## リスク / 代替案

- **リスク: ライトモードでの見え方の変化**: 白背景前提で `background` 未指定だった要素は、
  body に色が付いても `--color-bg`（ライト `#fff`）のままなので実質変化しない想定。
  ただし `color: inherit` の継承元が UA デフォルト黒（`#000` 相当）から `--color-fg`（`#1a1a1a`）に
  変わるため、文字色がごくわずかに変わる。視覚上の回帰有無は AC-V2 で auditor が確認する。
- **リスク: color-scheme による UA 部品の色変化**: フォームコントロール等がダークで UA 描画に
  切り替わり、コンポーネント CSS の想定と混ざって見える可能性。AC-V3 で実在確認し、
  問題があれば該当コンポーネントの対応を別 BL 化する。
- **代替案（不採用）: tokens.css へ body ルールを追記**: 変更ファイル数は最小だが、
  D-1 の理由（定義と適用の責務分離・既存ガードの前提維持）で不採用。
- **代替案（不採用）: `#root` や `.app` コンテナへの適用**: body より内側に塗ると、
  body 余白部分や overscroll 領域が UA デフォルトのまま残る。ページ全体を確実に覆う body を採る。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- **構造ガードテスト（test-designer が作成 / AC-1〜AC-4）**: 配置は
  `web/__tests__/dark-mode-base-colors.test.ts`（node 環境、jsdom 不要）。
  `dark-mode-tokens.test.ts` と同様に CSS / TSX を文字列として読み、以下を検証する。
  - AC-1: `base.css` の body ブロックに `background: var(--color-bg)`（または background-color）と
    `color: var(--color-fg)` が存在する。
  - AC-2: `base.css` の `:root` ブロックに `color-scheme: light dark` が存在する。
  - AC-3: `main.tsx` に `./styles/base.css` の import 文が存在する。
  - AC-4: `base.css` にコメント除外で生の色リテラルが無い（`dark-mode-tokens.test.ts` の
    走査ロジックと同等の基準）。
- **回帰（AC-5）**: リポジトリルートで `npx vitest run` 全 green。`git diff` で
  `tokens.css` に差分が無いこと。`npm run lint`（warning 0）/ `npm run typecheck`（pass）。
- **視覚（AC-V1〜AC-V3）**: 振る舞いテスト化しない。auditor / architecture-reviewer が
  OS ダーク / ライト双方で各 view とハンバーガーメニュー、フォームコントロールを実在確認する。
