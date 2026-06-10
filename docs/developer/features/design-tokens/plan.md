# 設計・実装計画: デザイントークン / CSS 基盤の整備

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

vanilla CSS の `:root` セレクタに CSS variables を定義した `tokens.css` を 1 ファイル作成し、
`main.tsx` から import する。各 view の CSS は既存の BEM クラス構造を変えず、暫定ハードコード値を
`var(--トークン名)` に一括置換するだけで完結する。実装・テスト・E2E の変更は最小限に抑える。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| モジュール | `web/src/styles/tokens.css` 新規追加。`web/src/main.tsx` に import 1 行追加。 |
| UI | 対象 10 CSS ファイルの暫定値を `var(--トークン名)` に置換。今日ビュー JSX の `TODO(BL-046)` コメント 2 件を削除。視覚的変化なし。 |
| テスト | 機能変更なし。既存テスト全件 green を確認するのみ（新規テストは原則不要）。 |

## 設計詳細

### ファイル配置

```
web/src/
  styles/
    tokens.css        ← 新規作成（BL-046 のメイン成果物）
  main.tsx            ← import 1 行追加
  ui/
    app-shell/app-shell.css        ← 暫定値 → var(--...)
    focus-view/focus-view.css      ← 暫定値 → var(--...)
    tomorrow-view/tomorrow-view.css  ← 暫定値 → var(--...)
    projects-view/projects-view.css  ← 暫定値 → var(--...)
    routines-view/routines-view.css  ← 暫定値 → var(--...)
    settings-view/settings-view.css  ← 暫定値 → var(--...)
    trash-view/trash-view.css        ← 暫定値 → var(--...)
    priority-stars/priority-stars.css  ← 暫定値 → var(--...)
    project-toggle/project-toggle.css  ← 暫定値 → var(--...)
    project-create-dialog/project-create-dialog.css ← 暫定値 → var(--...)
```

### tokens.css の構造

```css
/* web/src/styles/tokens.css */
/**
 * デザイントークン定義 (BL-046 / design-tokens).
 *
 * 参照: docs/developer/features/design-tokens/spec.md REQ-2
 * 参照: docs/developer/features/ui-redesign-foundation/spec.md REQ-7
 */

:root {
  /* --- タイポグラフィ --- */
  --font-size-h1:    24px;
  --font-size-h2:    20px;
  --font-size-body:  16px;
  --font-size-small: 14px;

  /* --- 余白 --- */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* --- 角丸 --- */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;

  /* --- カラー --- */
  --color-bg:           #fff;
  --color-fg:           #1a1a1a;
  --color-fg-subtle:    #595959;  /* WCAG AA 7:1 @ #fff */
  --color-border:       #ccc;
  --color-border-subtle:#eee;
  --color-accent:       #B45309;  /* amber-700 / WCAG AA 5.94:1 @ #fff */
  --color-focus-ring:   #1d4ed8;  /* blue-700 / WCAG AAA 7.2:1 @ #fff */

  /* --color-danger は使用箇所が発生した時点で追加する (U-046-1). */
}
```

### 置換マッピング

各 CSS ファイルでの置換対応表。「暫定値」→「置換後」の一対一マッピングを定義する。

| 暫定値 | 置換後 | 備考 |
| --- | --- | --- |
| `font-size: 24px` （H1） | `font-size: var(--font-size-h1)` | |
| `font-size: 20px` （H2） | `font-size: var(--font-size-h2)` | settings-view h2 のみ |
| `font-size: 16px` （本文） | `font-size: var(--font-size-body)` | |
| `font-size: 14px` （補足） | `font-size: var(--font-size-small)` | |
| `gap: 4px` / `padding: 4px` 系 | `var(--space-xs)` | |
| `gap: 8px` / `margin: 8px` 系 | `var(--space-sm)` | |
| `gap: 16px` / `padding: 16px` / `margin: 16px` 系 | `var(--space-md)` | |
| `padding: 24px 0` | `var(--space-lg) 0` | 空状態 |
| `padding: 32px` | `var(--space-xl)` | focus-view__card |
| `border-radius: 8px` / `0.5rem` | `var(--radius-sm)` | |
| `border-radius: 12px` | `var(--radius-md)` | |
| `border-radius: 16px` | `var(--radius-lg)` | |
| `border: 1px solid #ccc` | `border: 1px solid var(--color-border)` | |
| `border-top: 1px solid #eee` | `border-top: 1px solid var(--color-border-subtle)` | |
| `color: #666` | `color: var(--color-fg-subtle)` | 補足テキスト（#666 と #595959 混在に注意→後述） |
| `color: #595959` | `color: var(--color-fg-subtle)` | 空状態（WCAG AA 確認済み） |
| `color: #1a1a1a` | `color: var(--color-fg)` | |
| `border: 1px solid #595959` | `border: 1px solid var(--color-fg-subtle)` | project-toggle / project-create-dialog |
| `color: #B45309` | `color: var(--color-accent)` | |
| `color: #595959` （非点灯星） | `color: var(--color-fg-subtle)` | |
| `outline: 2px solid #1d4ed8` | `outline: 2px solid var(--color-focus-ring)` | |
| `width: 200px` （サイドバー幅） | そのまま（REQ-4） | 変更不要 |

**注意: `#666` と `#595959` の統一**

`routines-view.css` の `__days-label`、`focus-view.css` の `__project`、`settings-view.css` の
`__current`、`tomorrow-view.css` の `__project` / `__priority` には `#666` が使われている。
一方 `__empty` 系は `#595959`（WCAG AA 検証済み）を使用。

`--color-fg-subtle: #595959` に統一する。これにより `#666`（コントラスト比約 5.7:1）が
`#595959`（7:1）に変わるが、WCAG AA の閾値（4.5:1）を満たす方向への変化であり回帰ではない。

### main.tsx への import 追加

```tsx
// 既存 import の末尾に追加
import './styles/tokens.css';
```

配置は既存の CSS import（もしあれば）の直後、または import 群の末尾とする。

### 処理フロー

変更なし。データ取得・mutation・状態管理はすべて既存のまま。

### 例外 / エラー処理

変更なし。

## 重要な決定

- **D-001 CSS フレームワーク = vanilla CSS + CSS variables**:
  ADR-0012 に記録。Tailwind / CSS Modules を比較検討の上、vanilla CSS を採用。

- **D-002 tokens.css のスコープ = `:root` グローバル**:
  全 view が同じ名前空間でトークンを参照できるようにする。コンポーネントスコープ（CSS Modules の
  `:local`）は採用しない。BL-035 plan.md §「共通スタイル / トークン配置」の方針に従う。

- **D-003 `#666` → `#595959` への統一**:
  補足テキスト色を `--color-fg-subtle: #595959`（WCAG AAA）に統一する。`#666` は
  WCAG AA を満たすが、既存の `#595959` と混在しているため一本化する。視覚差は微小。

- **D-004 `--color-danger` は本 BL では定義しない**:
  現在の view に使用箇所がないため、定義を保留し、必要になった時点で tokens.css に追記する。
  コメント予約行（`/* --color-danger: 未定義 */`）を tokens.css に残す。

- **D-005 `focus-view__name` の 28px はトークン化しない**:
  `--font-size-h2`（20px）とは用途・値が異なる。専用トークン `--font-size-focus-task` は
  後続 BL の判断とし、本 BL では `28px` のハードコードを残す（`TODO(BL-046)` マーカーを削除して
  コメント無しの `font-size: 28px` として残す）。

- **D-006 `--sidebar-width` はトークン体系の外**:
  レイアウト固有の値であり、デザイントークン（タイポ・余白・角丸・カラー）の範疇外とする。
  `200px` ハードコードを残し、マーカーを削除する。

## リスク / 代替案

- **R-001 CSS 変数の cascade による上書きリスク**: `:root` に定義するため全要素に適用される。
  将来コンポーネントローカルで上書きしたい場合は、コンポーネントの `.クラス名 { --変数名: 値; }` で
  局所的に上書き可能。問題なし。
- **R-002 `#666` → `#595959` の視覚差**: コントラストは向上方向だが、微妙に色が変わる。
  スナップショットテストを持つ場合は更新が必要。現プロジェクトにはビジュアルリグレッションテストが
  ないため影響なし。
- **代替案: 各 view の CSS をそのままにしてグローバル CSS で上書き**: 採用しない。
  暫定値との二重定義が生まれ、保守性が悪化する。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- **新規テストは原則不要**:
  本 BL は値の意味を変えない置換のみ。機能追加がないため単体テストの追加不要。
- **E2E 全件実行で green 確認**:
  視覚的回帰がないことを E2E（25 件以上）の green で担保する。
- **マーカー消去の確認**:
  `grep -r 'TODO(BL-046)' web/src/` の出力がゼロであることを確認する（PR チェックに含める）。
- **WCAG コントラスト確認**:
  `#666` → `#595959` の変更は向上方向のため axe 検査で violations が増加しないことを確認する。
