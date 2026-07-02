# 設計・実装計画: ダークモード対応（OS カラースキーム追従）

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

色の単一の情報源を `web/src/styles/tokens.css` のカラートークンに一本化し、その `:root` を
`@media (prefers-color-scheme: dark)` で上書きするだけで全 view のダーク配色が成立する構造にする。
そのため先にコンポーネント CSS に残る生の色をトークン参照へ寄せ（不足分は新設）、次に tokens.css へ
ダーク上書きブロックを追加する。JS・ライブラリ・ビルド設定は追加しない（ADR-0012 の依存追加ゼロを維持）。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| モジュール | なし（Clock 抽象等ロジックに影響しない） |
| UI (トークン) | `web/src/styles/tokens.css`: 新設 3 トークンをライトに追加 / `@media (prefers-color-scheme: dark)` 追加（全 `--color-*` を再定義） |
| UI (コンポーネント CSS) | `settings-view.css` / `project-create-dialog.css` / `app-shell.css` / `sw-update-dialog.css` / `login-view.css` / `initial-setup-view.css` の生の色を `var(--color-*)` に置換。各 CSS コメント内の hex を両値併記 or トークン名へ更新 |
| main.tsx | 変更なし（既に `tokens.css` を import 済み） |
| テスト | `web/__tests__/` にトークン / CSS 構造のガードテストを追加（AC-1〜AC-5） |
| ドキュメント | 新規 ADR-0013（dark mode 追従の決定）を起票。tokens.css 冒頭コメントにダーク方針を追記 |

## 設計詳細

### トークン一覧（ライト現状値 / ダーク候補値）

既存 8 トークンのダーク値と、新設 3 トークンのライト / ダーク値を以下で確定候補とする。
ダーク値はニュートラルダーク背景（純黒を避けたグレー系サーフェス）を基準に、AA を満たす前景色を選ぶ。
数値は候補であり、最終コントラスト実測は implementer / auditor が確定してよい（目標基準は spec 非機能要件）。

| トークン | ライト（現状 / 新設） | ダーク候補 | 用途 / コントラスト狙い |
| --- | --- | --- | --- |
| `--color-bg` | `#fff` | `#121212` | 画面背景。純黒(#000)を避けハレーション低減 |
| `--color-fg` | `#1a1a1a` | `#e6e6e6` | 本文。on #121212 で約 13:1（AAA） |
| `--color-fg-subtle` | `#595959` | `#a3a3a3` | 補足テキスト。on #121212 で約 7:1（AA/AAA） |
| `--color-border` | `#ccc` | `#555` | 主ボーダー（UI 区切り） |
| `--color-border-subtle` | `#eee` | `#2a2a2a` | 薄いボーダー（装飾的仕切り） |
| `--color-accent` | `#b45309` | `#fbbf24` | アクセント（amber-400）。暗背景で読める明度に引き上げ。★等に使用 |
| `--color-accent-bg-subtle` | `#fef3c7` | `#3f2d0f` | アクセント背景。暗いアンバー。on 上で `--color-fg` が読める |
| `--color-focus-ring` | `#1d4ed8` | `#60a5fa` | フォーカスリング（blue-400）。暗背景で 3:1 以上確保 |
| `--color-danger`（新設） | `#c00` | `#f87171` | エラー / 破壊的操作（red-400）。on #121212 で AA |
| `--color-success`（新設） | `#060` | `#4ade80` | 成功 / 完了（green-400）。on #121212 で AA |
| `--color-scrim`（新設） | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.6)` | モーダル / ドロワー背後の暗幕 |

> ライトの新設値: `--color-danger` は現行の `#c00`（settings / login / initial-setup で使用中）を踏襲。
> `--color-success` は settings の `#060` を踏襲。`--color-scrim` は現行 `0.4` / `0.5` の濃い方 `0.5` に統一。
> `--color-danger` は現状フォールバック（`var(--color-danger, #c00)`）でのみ参照され `:root` 未定義のため、
> 本 BL で正式定義する。

### コンポーネント CSS のトークン化

`web/src/ui/**/*.css`（`tokens.css` を除く）の生の色を以下へ置換する。

- `settings-view.css`: `color: #c00` → `color: var(--color-danger)` / `color: #060` → `color: var(--color-success)`
- `project-create-dialog.css`: `background: rgba(0,0,0,0.5)` → `background: var(--color-scrim)`
- `app-shell.css`: `background: rgba(0,0,0,0.4)` → `background: var(--color-scrim)`
- `sw-update-dialog.css`: `background: rgba(0,0,0,0.4)` → `background: var(--color-scrim)`
- `login-view.css` / `initial-setup-view.css`: `var(--color-danger, #c00)` → `var(--color-danger)`（フォールバック除去）

### コメントの扱い

各コンポーネント CSS / tokens.css のコメントには WCAG 根拠として hex が併記されている
（例: `--color-fg (#1a1a1a). WCAG AAA 18.9:1 on #fff`）。これらは表示に影響しないが、ダーク値が
加わると「on #fff」前提が実態と乖離する。方針: **コメントは hex を消してトークン名 + 用途で記述し、
コントラスト値はライト / ダークの根拠を tokens.css の該当宣言箇所に集約する**。コンポーネント CSS 側の
コメントは「色は `--color-*` に集約」と参照に寄せ、個別 hex を残さない（AC-1 のガードは宣言値のみを
対象にするが、コメントの hex 陳腐化を避けるため併せて整理する）。

### tokens.css の構造（追加後）

```
:root {
  /* タイポ / 余白 / 角丸（変更なし） */
  ...
  /* カラー（ライト）: 既存 8 + 新設 3 */
  --color-bg: #fff; ... --color-focus-ring: #1d4ed8;
  --color-danger: #c00;
  --color-success: #060;
  --color-scrim: rgba(0, 0, 0, 0.5);
}

@media (prefers-color-scheme: dark) {
  :root {
    /* カラーのみ再定義（全 --color-* を網羅） */
    --color-bg: #121212; ... --color-scrim: rgba(0, 0, 0, 0.6);
  }
}
```

- 非カラートークン（`--space-*` / `--radius-*` / `--font-size-*` / `--sidebar-width`）はダークブロックに
  含めない（AC-5）。
- 追加は tokens.css 単独に閉じ、`main.tsx` は変更しない（AC-6 の回帰防止）。

### 処理フロー

- ランタイム処理は無い。ブラウザが `prefers-color-scheme` を評価し `@media` が自動適用される。
  OS 設定変更にはブラウザがリロード無しで追従する（AC-V3）。JS による監視 / トグルは実装しない。

### 例外 / エラー処理

- 該当なし（純 CSS）。`prefers-color-scheme` 非対応の古い環境ではライト（`:root` 既定）が使われる。

## 重要な決定

- **D-1 トークン上書き方式**: ダークは `@media (prefers-color-scheme: dark) { :root { --color-* } }` の
  カラートークン上書きのみで実現する。クラス付与 / data 属性 / JS テーマ切替は採らない。理由: OS 追従が
  唯一の要件（手動トグル・永続化は非ゴール）で、CSS のみが最小コスト。ADR-0012 の依存追加ゼロと整合。
- **D-2 色の単一情報源化を前提化**: ダーク対応の前に全コンポーネント CSS をトークン参照へ寄せる。
  これにより「トークン上書き 1 箇所」でダークが漏れなく波及する。以後 `web/src/ui/**/*.css` に生の色を
  書けないことを AC-1 のガードテストで恒久的に強制する（回帰防止の資産になる）。
- **D-3 scrim の 1 トークン統一**: 現行 `0.4` / `0.5` を `--color-scrim` に統一（ライト `0.5`）。
  わずかな透過度変化は許容（spec 未決事項で合意済み）。ダークは視認性のため `0.6` を候補とする。
- **D-4 新設トークン名**: `--color-danger` / `--color-success` / `--color-scrim` を採用。
  代替の `--color-error`（→ danger は破壊的操作全般を含み意味が広い）/ `--color-overlay`（→ scrim が
  UI 用語として暗幕を的確に表す）より意味が明確なため。
- **D-5 ADR は追補でなく新規**: ADR-0012 は BL-046 時点の CSS 基盤決定の記録であり、「BL-046 では
  ダークモード対応しない」という当時の記述はその時点の事実として保持する（ADR / features は履歴記録で
  陳腐化理由で書き換えない）。ダーク追従の決定は新規 ADR-0013 として起票する。

## リスク / 代替案

- **リスク: ダーク配色の AA 未達**: 候補値は目標基準（AA）を狙うが実測前。implementer 実装後に
  auditor がコントラストを実在確認し、未達なら明度を調整する（spec AC-V2）。
- **リスク: コンポーネント CSS の色見落とし**: 生の色を手作業で置換するため漏れる懸念。
  AC-1 のガードテストが宣言値・`var()` フォールバックを走査し、漏れを機械的に検出する。
- **リスク: ダーク上書きの網羅漏れ**: ライトに新トークンを足してダーク側へ追加し忘れる懸念。
  AC-3 のガードが :root とダークの `--color-*` 集合の一致を検証して防ぐ。
- **代替案（不採用）: data-theme + JS トグル**: 手動切替 / 永続化ができるが本 BL の非ゴール。
  複雑度と依存が増えるため不採用（将来必要になれば別 BL で再検討）。
- **代替案（不採用）: `light-dark()` CSS 関数**: 1 プロパティでライト / ダーク値を指定できるが、
  ブラウザ対応が新しく、既存の `:root` 上書き方式の方が枯れていて安全。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- **構造ガードテスト（test-designer が作成 / AC-1〜AC-5）**: tokens.css と `web/src/ui/**/*.css` を
  文字列として読み、以下を検証する。配置は `web/__tests__/`（node 環境、jsdom 不要）を想定。
  - AC-1: コンポーネント CSS の宣言値・`var()` フォールバックに生の色が無い（コメント除外）。
  - AC-2: `@media (prefers-color-scheme: dark)` + 内側 `:root` の存在。
  - AC-3: :root とダークの `--color-*` 集合が一致（ダーク網羅）。
  - AC-4: 新設 3 トークンがライト / ダーク双方に存在。
  - AC-5: ダークブロックの宣言が `--color-*` に限定（非カラー混入なし）。
- **回帰（AC-6）**: 既存の単体 / コンポーネント / E2E を `npx vitest run`（リポジトリルート）で green 維持。
  `npm run lint`（warning 0）/ `npm run typecheck`（pass）も完了条件に含む。
- **視覚 / コントラスト（AC-V1〜AC-V3）**: 振る舞いテスト化しない。auditor / architecture-reviewer が
  OS ダーク設定下の各 view とコントラスト比を実在確認する。
</content>
