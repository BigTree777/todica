# 仕様: ダークモード対応（OS カラースキーム追従）

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-140
- 依存: BL-046 (design-tokens / `web/src/styles/tokens.css`), BL-035 (ui-redesign-foundation / トークン体系)
- CSS 基盤の根拠: [`../../adr/0012-css-framework.md`](../../adr/0012-css-framework.md)

## 背景 / 課題

現在の Web クライアントはライトテーマ（白背景）固定である。トークンは `web/src/styles/tokens.css` の
`:root` に定義され全 view から参照されるが、`@media (prefers-color-scheme: dark)` の分岐を持たない。
そのため OS を「ダーク」設定にしているユーザーには、周囲の UI と乖離した眩しい白画面が表示される。

加えて、コンポーネント CSS（`web/src/ui/**/*.css`）には未トークン化の生の色値がわずかに残っており、
これらは `:root` を上書きするだけのダーク対応から漏れる。ダークモードを「トークンの上書き 1 箇所」で
成立させるには、先に全コンポーネントの色をトークン参照へ寄せる必要がある。

## ゴール / 非ゴール

### ゴール

- OS のカラースキーム設定（`prefers-color-scheme`）に追従してライト / ダークを自動で切り替える。
- 色に関わる全ての表示を `tokens.css` のカラートークン（`var(--color-*)`）経由にする。
  コンポーネント CSS に生の色リテラル（hex / rgb / rgba / 名前付き色）を残さない。
- `@media (prefers-color-scheme: dark)` ブロックで `:root` のカラートークンのみを上書きし、
  全 view にダーク配色を一括で波及させる。
- ダーク配色は主要テキスト・UI 要素で WCAG 2.1 AA を満たす（下記「コントラスト目標」）。

### 非ゴール

- **手動トグル / テーマ切り替え UI**: アプリ内でライト / ダークを切り替える操作は設けない。
- **設定項目 / 永続化**: テーマ設定の保存（localStorage / IndexedDB / サーバ）は行わない。
  参照する状態は OS の `prefers-color-scheme` のみ。
- **色以外のトークンの変更**: 余白（`--space-*`）・角丸（`--radius-*`）・タイポ（`--font-size-*`）は
  ダークで変更しない。ダーク上書きブロックはカラートークン（`--color-*`）に限定する。
- **新規コンポーネント / レイアウト変更 / デザイン刷新**: 本 BL は配色追従のみ。構造・余白・
  コンポーネント追加は対象外。
- **`--sidebar-width` 等レイアウト固有変数**: 色ではないため対象外。

## 要件

### 機能要件

- **REQ-1 コンポーネント CSS の全トークン化**:
  `web/src/ui/**/*.css`（`tokens.css` を除く）の色を全て `var(--color-*)` 参照にする。
  宣言値・`var()` のフォールバック引数の双方に生の色リテラルを残さない。
  - 対象の生の色（現状）:
    - `settings-view.css`: エラー色 `#c00` → `var(--color-danger)` / 成功色 `#060` → `var(--color-success)`
    - `project-create-dialog.css`: オーバーレイ `rgba(0,0,0,0.5)` → `var(--color-scrim)`
    - `app-shell.css`: スクリム `rgba(0,0,0,0.4)` → `var(--color-scrim)`
    - `sw-update-dialog.css`: オーバーレイ `rgba(0,0,0,0.4)` → `var(--color-scrim)`
    - `login-view.css` / `initial-setup-view.css`: `var(--color-danger, #c00)` のフォールバック `#c00` を除去し
      `var(--color-danger)` にする（`--color-danger` を `:root` に正式定義するため）。
  - CSS コメント内に WCAG 根拠として書かれた hex（`#fff` / `#595959` / `#1d4ed8` / `#b45309` /
    `#1a1a1a` 等）は表示に影響しないが、値の陳腐化を避けるためライト / ダーク両値を併記するか
    トークン名参照に書き換える（詳細は plan の「コメントの扱い」）。

- **REQ-2 新設カラートークン**:
  `:root`（ライト）と `@media (prefers-color-scheme: dark)` の双方で以下を定義する。
  - `--color-danger`: エラー / 破壊的操作の色。
  - `--color-success`: 成功 / 完了の色。
  - `--color-scrim`: モーダル / ドロワーの背後を暗くする半透明オーバーレイ。
    現状の `rgba(0,0,0,0.4)` と `rgba(0,0,0,0.5)` を 1 トークンに統一する。

- **REQ-3 ダーク上書きブロック**:
  `tokens.css` に `@media (prefers-color-scheme: dark) { :root { ... } }` を追加し、
  `:root`（ライト）で定義した**全カラートークンをもれなく再定義**する。
  カラー以外のトークンは再定義しない。

- **REQ-4 グローバル適用**:
  追加はすべて `tokens.css` に閉じる。`main.tsx` は既に `tokens.css` を import しているため、
  変更なしで全 view にダーク配色が波及すること。

### 非機能要件

- **コントラスト目標（WCAG 2.1）**:
  - 本文テキスト（`--color-fg` on `--color-bg`）: AA 4.5:1 以上（AAA 7:1 を努力目標）。
  - 補足テキスト（`--color-fg-subtle` on `--color-bg`）: AA 4.5:1 以上。
  - アクセント・エラー・成功のテキスト / アイコン（各色 on `--color-bg`）: AA 4.5:1 以上。
  - フォーカスリング・ボーダー等の非テキスト UI: AA 3:1 以上（純粋な装飾的仕切りは 1.4.11 対象外）。
  - ライト側の既存トークンの WCAG 値は現状維持（回帰させない）。
- **依存追加ゼロ**: ADR-0012 の原則を維持。ライブラリ・ビルド設定・JS は追加しない。CSS のみで実現する。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。
> 構造的に検証可能な基準（AC-1〜AC-6）は test-designer がガードテスト化する対象。
> 視覚 / コントラスト基準（AC-V1〜AC-V3）は auditor / architecture-reviewer が実在確認する対象
> （視覚要素のため振る舞いテストを持たない。「テスト green == 実装」は AC-1〜AC-6 にのみ成立する）。

### 構造的に検証可能（ガードテスト対象）

```
シナリオ: AC-1 コンポーネント CSS に生の色リテラルが残らない
  Given web/src/ui 配下の全 *.css（tokens.css を除く）
  When  各ファイルの宣言値・var() フォールバック引数を走査する（コメントは除外）
  Then  hex（#RGB / #RRGGBB）・rgb() / rgba() / hsl() / hsla()・名前付き色が 1 件も検出されない
        （色は全て var(--color-*) 経由である）
```

```
シナリオ: AC-2 ダーク上書きブロックが存在する
  Given web/src/styles/tokens.css
  When  ファイル内容を走査する
  Then  @media (prefers-color-scheme: dark) を含むブロックが存在し、
        その中に :root セレクタが存在する
```

```
シナリオ: AC-3 ダーク上書きが全カラートークンを網羅する
  Given tokens.css の :root（ライト）で定義された --color-* の全集合
  When  @media (prefers-color-scheme: dark) 内の :root で再定義される --color-* の集合と比較する
  Then  ライトで定義した全 --color-* がダークでも再定義されている（欠けが無い）
```

```
シナリオ: AC-4 新設トークンがライト / ダーク双方に定義される
  Given tokens.css
  When  --color-danger / --color-success / --color-scrim を探す
  Then  :root（ライト）と @media dark の :root の双方に 3 トークンとも定義されている
```

```
シナリオ: AC-5 ダーク上書きはカラートークンに限定される
  Given @media (prefers-color-scheme: dark) 内の :root ブロック
  When  宣言されているカスタムプロパティを走査する
  Then  すべて --color-* であり、--space-* / --radius-* / --font-size-* / --sidebar-width 等
        非カラーのトークンは含まれない
```

```
シナリオ: AC-6 既存の全テストが green を維持する
  Given リポジトリルートで npx vitest run を実行する
  When  ダークモード対応の変更を加えた後
  Then  既存の単体 / コンポーネント / E2E テストが全て green のまま
        （かつ npm run lint は warning 0、npm run typecheck は pass）
```

### 視覚 / コントラスト（auditor / architecture-reviewer が実在確認）

```
シナリオ: AC-V1 OS ダーク設定でダーク配色が適用される
  Given OS のカラースキームを「ダーク」に設定したブラウザ
  When  アプリの各 view（今日 / 明日 / プロジェクト / ルーティン / 設定 / ログイン /
        初期設定 / ゴミ箱 / 各ダイアログ）を表示する
  Then  背景が暗色・前景が明色のダーク配色で表示され、白画面のちらつきや
        読めない要素（極端な低コントラスト）が無い
```

```
シナリオ: AC-V2 ダーク配色が WCAG 2.1 AA を満たす
  Given ダーク配色で表示された各 view
  When  本文 / 補足テキスト / アクセント / エラー / 成功の各色と背景のコントラスト比を測る
  Then  テキストは 4.5:1 以上、非テキスト UI は 3:1 以上を満たす
```

```
シナリオ: AC-V3 OS 設定変更にリロード無しで追従する
  Given アプリを表示した状態
  When  OS のカラースキームをライト⇔ダークで切り替える
  Then  ページのリロード無しに配色が切り替わる（prefers-color-scheme の標準挙動）
```

## 未決事項 / 確認待ち

- **`--color-scrim` の統一値**: 現状 `0.4` と `0.5` の 2 種を 1 トークンに統一する。統一値は
  ライト `rgba(0,0,0,0.5)` を第一候補とする（濃い方に寄せる）。ダーク時はコンテンツが元々暗いため
  スクリムの視認性確保に `rgba(0,0,0,0.6)` へ強める案を plan で提示。最終値は implementer / auditor が
  視覚確認して確定してよい。わずかな透過度変化を許容するかは本 spec ではライト値統一を許容とする。
- **トークン名**: `--color-danger` / `--color-success` / `--color-scrim` を採用候補とする
  （`--color-error` / `--color-overlay` 等の別名は plan の比較で確定）。
- **ダーク各値の最終確定**: plan で AA を満たす候補値を提示するが、実測コントラストの確定は
  implementer / auditor 段階で行ってよい（目標基準は本 spec の非機能要件で固定済み）。
- **コメント内 hex の扱い方針**: 併記 / トークン名参照のどちらにするかは plan で確定する。
</content>
