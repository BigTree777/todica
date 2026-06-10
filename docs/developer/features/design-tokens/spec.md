# 仕様: デザイントークン / CSS 基盤の整備

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-046
- 依存: BL-035 (ui-redesign-foundation / トークン体系の確定)
- 由来要件: NFR-010 (最小手数の起票) / NFR-011 (フォーカス時の単独大表示) / NFR-012 (設定項目最小化)
- CSS フレームワーク選定の根拠: [`../../adr/0012-css-framework.md`](../../adr/0012-css-framework.md)

## 背景 / 課題

BL-036〜BL-045 で各 view を実装・スタイル統一したが、全 CSS ファイルにハードコードされた暫定値が残っている。
これらは `TODO(BL-046)` マーカーで明示されており、以下の問題を抱える。

1. **一貫性の欠如**: 同じ意味を持つ値（カードの角丸 `12px`、ボーダー `#ccc`、余白 `16px` 等）が
   各 CSS に散在しており、変更時に全ファイルを手動で修正する必要がある。
2. **意図の不可視化**: `border: 1px solid #ccc` から「カードの境界線」という意図が読み取れない。
3. **将来の保守障壁**: 暫定値のまま次の BL（BL-047 など）が追加されると、
   不統一なスタイルが固定化される。

BL-046 の実際のスコープは、backlog 記載の「後続 BL に先立つ基盤整備」ではなく、
**完了済み view（BL-036〜BL-045）の暫定値をデザイントークン（CSS variables）に置換する**作業である。

## ゴール / 非ゴール

### ゴール

- `web/src/styles/tokens.css` を新規作成し、`:root` セレクタで CSS variables を定義する。
- `main.tsx` から `tokens.css` を import し、グローバルスコープでトークンが参照可能な状態にする。
- `TODO(BL-046)` マーカーのある全 CSS ファイル（10 ファイル）の暫定値を `var(--トークン名)` に置換する。
- `grep 'TODO(BL-046)' web/src/` の出力がゼロになること。
- トークン置換後も全テスト（単体・E2E 25 件以上）が green を維持すること。

### 非ゴール

- **ダークモードの対応**: U-002 保守側デフォルト「対応しない」を継承する（NFR-012 と整合）。
  `prefers-color-scheme` メディアクエリを本 BL では導入しない。
- **Tailwind / CSS Modules への移行**: ADR-0012 で却下済み。変更しない。
- **デザイントークン以外の視覚変更**: ボタンのデザイン変更・レイアウト調整・新規コンポーネント追加は本 BL の外。
- **today-view のインラインスタイル（JSX 内 TODO コメント）の完全解消**: `today-view.tsx` に残る
  2 件の `TODO(BL-046)` コメントは CSS でなく JSX 内の構造コメントであるため、本 BL では
  対処するが、スタイル置換の主対象は CSS ファイル 10 件とする。
- **`--sidebar-width` のトークン化**: `app-shell.css` に `--sidebar-width: 200px` のマーカーがあるが、
  これはレイアウト固有の値であり、デザイントークンの体系（タイポ・余白・角丸・カラー）に含めない。
  値は直接書いたままで良い。ただし CSS 変数として `:root` に定義することは妨げない。

## 要件

### 機能要件

- **REQ-1 tokens.css の作成**:
  - `web/src/styles/tokens.css` を新規作成する。
  - ファイル内に `:root { }` ブロックを置き、下記「トークン一覧」の変数を定義する。
  - `main.tsx` で `import './styles/tokens.css'` し、全 view でグローバルに参照できるようにする。

- **REQ-2 トークン一覧と確定値**:

  BL-035 の REQ-7 で定義された体系に基づき、BL-036〜BL-045 の暫定値から以下の値を確定する。

  | トークン名 | 確定値 | 由来 / 根拠 |
  | --- | --- | --- |
  | `--font-size-h1` | `24px` | 全 view の H1 に統一されていた暫定値 |
  | `--font-size-h2` | `20px` | settings-view h2 の暫定値（focus-view__name の 28px とは別用途） |
  | `--font-size-body` | `16px` | tomorrow-view / focus-view の本文暫定値 |
  | `--font-size-small` | `14px` | project 名・days-label・current 表示の暫定値 |
  | `--space-xs` | `4px` | tomorrow-view item-body の gap 暫定値 |
  | `--space-sm` | `8px` | フォーム gap・リスト gap・アクション gap の暫定値 |
  | `--space-md` | `16px` | 全体 padding・gap・margin-bottom の主要暫定値 |
  | `--space-lg` | `24px` | 空状態 (`__empty`) の padding 暫定値 |
  | `--space-xl` | `32px` | focus-view__card の padding 暫定値 |
  | `--radius-sm` | `8px` | project-toggle / project-create-dialog の border-radius 暫定値（0.5rem） |
  | `--radius-md` | `12px` | 全 view のカード・フォーム枠の border-radius 暫定値 |
  | `--radius-lg` | `16px` | focus-view__card の大枠 border-radius 暫定値 |
  | `--color-bg` | `#fff` | 背景色（全 view 共通の UA default と整合） |
  | `--color-fg` | `#1a1a1a` | 前景テキスト（project-toggle / project-create-dialog の暫定値） |
  | `--color-fg-subtle` | `#595959` | 空状態・補足テキスト（WCAG AA 7:1 確認済み暫定値） |
  | `--color-border` | `#ccc` | カード枠・サイドバー・フォーム枠の暫定値 |
  | `--color-border-subtle` | `#eee` | app-shell divider の暫定値 |
  | `--color-accent` | `#B45309` | priority-stars の点灯色（amber-700、WCAG AA 5.94:1 確認済み） |
  | `--color-danger` | 未使用のため未定義（後続 BL で追加する） | BL-035 REQ-7 で予定されていたが現在の view に使用箇所なし |
  | `--color-focus-ring` | `#1d4ed8` | focus outline（priority-stars / project-toggle / project-create-dialog 共通） |

  > 備考: `focus-view__name` の `28px` は H2 とは用途が異なる（focus-view 専用の大文字表示）。
  > `--font-size-h2` には当てはめず、`focus-view.css` ローカルで `28px` を直書きしたままとする。
  > （将来専用トークン `--font-size-focus-task` を検討する余地はあるが本 BL の外。）

- **REQ-3 暫定値の置換**:
  - 以下 10 ファイルの `TODO(BL-046)` マーカー行を `var(--トークン名)` に置換する。
  - 置換後、マーカーコメントを削除する。
  - 対象ファイル:
    1. `web/src/ui/app-shell/app-shell.css`
    2. `web/src/ui/focus-view/focus-view.css`
    3. `web/src/ui/tomorrow-view/tomorrow-view.css`
    4. `web/src/ui/projects-view/projects-view.css`
    5. `web/src/ui/routines-view/routines-view.css`
    6. `web/src/ui/settings-view/settings-view.css`
    7. `web/src/ui/trash-view/trash-view.css`
    8. `web/src/ui/priority-stars/priority-stars.css`
    9. `web/src/ui/project-toggle/project-toggle.css`
    10. `web/src/ui/project-create-dialog/project-create-dialog.css`
  - `today-view.tsx` 内の 2 件のインラインコメントも削除（スタイル置換ではなくコメント整理）。

- **REQ-4 `--sidebar-width` の扱い**:
  - `app-shell.css` の `width: 200px` は `:root` への変数定義対象外とする。
  - マーカーコメントを削除し、`200px` のハードコードをそのまま残す。

### 非機能要件

- **既存テストの green 維持**: トークン置換は視覚的な値変化を伴わない。置換前後で全テスト
  （単体・E2E 25 件以上）が green を維持すること。CSS 変数の fallback が不要であること（全ブラウザが
  `:root` スコープの変数を参照できる前提）。
- **WCAG 2.1 AA の維持**: `--color-fg-subtle: #595959`（7:1）、`--color-accent: #B45309`（5.94:1）、
  `--color-focus-ring: #1d4ed8`（7.2:1）のコントラスト比は置換後も変化しないこと。
- **置換漏れゼロ**: `grep -r 'TODO(BL-046)' web/src/` の出力がゼロになること。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
シナリオ: tokens.css が配置され、main.tsx から import されている
  Given web/src/styles/tokens.css が存在する
  When  ファイルを開く
  Then  :root { } ブロックに REQ-2 で定めた 19 変数（--color-danger を除く）が定義されている

  Given web/src/main.tsx を開く
  When  import 文を確認する
  Then  import './styles/tokens.css' または等価なパスの import が存在する
```

```
シナリオ: TODO(BL-046) マーカーがコードベースから消えている
  Given BL-046 の実装作業が完了した
  When  grep -r 'TODO(BL-046)' web/src/ を実行する
  Then  出力がゼロである
```

```
シナリオ: 全 CSS ファイルがトークン変数を参照している
  Given tokens.css が存在し、main.tsx から import されている
  When  対象 10 ファイルを開く
  Then  各ファイルの旧暫定値（24px / 12px / 16px / #ccc / #595959 等）の記述箇所が
        var(--トークン名) に置き換わっている
  And   コントラスト比が BL-046 導入前と同一である（値の変更なし）
```

```
シナリオ: 既存テストが引き続き green である
  Given tokens.css が import され、暫定値が var(--トークン名) に置換されている
  When  テストスイート全件（単体・E2E）を実行する
  Then  全テストが green（失敗ゼロ）である
```

```
シナリオ: focus-view の表示に視覚的回帰がない
  Given tokens.css の --radius-lg: 16px / --color-border: #ccc / --space-xl: 32px が定義されている
  When  /focus を開き、現在のタスクカード枠を確認する
  Then  枠の角丸・ボーダー色・内側余白が置換前と同一に見える
```

```
シナリオ: app-shell のサイドバー幅がトークン化されていない
  Given app-shell.css を開く
  When  sidebar の width プロパティを確認する
  Then  200px のハードコード値が残っている
  And   --sidebar-width の変数定義が tokens.css に存在しない
```

## 未決事項 / 確認待ち

- **U-046-1 `--color-danger` の定義タイミング**: BL-035 REQ-7 で予定されたが、現在の view に
  使用箇所がない。後続 BL（削除ボタンのスタイル統一等）が必要になった時点で tokens.css に追記する。
  本 BL では定義しない（コメントで予約枠を残しても良い）。
- **U-046-2 `focus-view__name` の 28px**: `--font-size-h2` とは別用途。専用トークンを後続 BL で
  設けるか、このまま focus-view ローカルの固定値とするかは未定。本 BL では固定値のまま。
