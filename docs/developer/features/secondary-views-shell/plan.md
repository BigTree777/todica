# 設計・実装計画: 既存 4 view のスタイル統一 (secondary-views-shell)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

BL-036 で AppShell 統合と導線は完了済みのため, 本 BL は **CSS の新規追加 + 最小の JSX 変更 (className 付与 / trash のヘッダ化)** のみで完結させる. スタイル値は `tomorrow-view.css` の暫定値をそのまま転写し (D-002), 全値に `TODO(BL-046)` マーカーを付けて BL-046 のトークン置換に備える. mutation / クエリ / aria 属性は一切触らず, 既存テスト資産 (単体 + E2E 全 23 spec) の green 維持を不変条件とする.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| サーバ / ドメイン | 変更なし |
| ルーティング (`web/src/main.tsx`) | 変更なし (BL-036 で AppShell 配下に配置済み. D-005) |
| AppShell (`web/src/ui/app-shell/`) | 変更なし |
| UI (settings-view) | `settings-view.css` 新規 + `settings-view.tsx` に className 付与 |
| UI (trash-view) | `trash-view.css` 新規 + `trash-view.tsx` に className 付与 + `<header>` 化 (REQ-5) |
| UI (routines-view) | `routines-view.css` 新規 + `routines-view.tsx` に className 付与 |
| UI (projects-view) | `projects-view.css` 新規 + `projects-view.tsx` に className 付与 |
| E2E | `e2e/secondary-views-style.spec.ts` 新規 (AC-2〜AC-7). 既存 spec は無改修で green 維持 |
| 単体テスト | 既存テストは無改修で green 維持. className / header 構造のアサーション追加は test-designer の裁量 |

## 設計詳細

### スタイル暫定値の対応表 (tomorrow-view.css から転写. 全て `TODO(BL-046)` 付き)

| 用途 | 暫定値 | 将来のトークン (BL-046) |
| --- | --- | --- |
| view ルートの縦 gap | `16px` | `--space-md` |
| H1 | `font-size: 24px; margin: 0 0 16px 0` | `--font-size-h1` / `--space-md` |
| H2 (settings のみ) | `font-size: 20px` | `--font-size-h2` (U-3: 本 BL で暫定確定) |
| 枠線 | `1px solid #ccc` | `--color-border` |
| 角丸 (フォーム / カード) | `border-radius: 12px` | `--radius-md` |
| ブロック内 padding | `16px` | `--space-md` |
| ブロック内 gap / カード間 gap | `8px` | `--space-sm` |
| 補足テキスト | `font-size: 14px; color: #666` | `--font-size-small` / `--color-fg-subtle` |
| 空状態 | `color: #595959; text-align: center; padding: 24px 0` | `--color-fg-subtle` (AA 対応値) / `--space-lg` |

### 各 view の構造変更 (before → after)

共通: ルート `<main>` に `className="<view>-view"` を付与し, 冒頭で `import "./<view>-view.css";` する. role / aria-label / アクセシブルネーム / `htmlFor`・`id` の関連付けは変更しない (NFR-COMPAT).

#### settings-view

- `<main>` → `<main className="settings-view">`. 縦並び gap 16px.
- 境界時刻フォーム (`aria-label="設定フォーム"`) に `settings-view__form` → 角丸枠ブロック.
- `aria-label="サーバ接続設定"` / `aria-label="モード切替"` の `<section>` に `settings-view__section` → 同じ角丸枠ブロック (U-1: 検証は単体テスト側).
- 設定値表示 (`aria-label="設定値"`) に `settings-view__current` → 補足テキスト (14px #666).
- `<h2>` は 20px (U-3).

#### trash-view

- `<main>` → `<main className="trash-view">`.
- **構造変更 (REQ-5 / D-006)**: `<h1>ゴミ箱</h1>` と「ゴミ箱を空にする」`<button>` を `<header className="trash-view__header">` で包む. flex / space-between / 中央揃え (today-view の header と同じ).
- `<ul aria-label="ゴミ箱のタスク一覧">` に `trash-view__list`, `<li>` に `trash-view__item` → 角丸カード (名前は左, 「復元」は右).
- 「ゴミ箱は空です」`<p>` に `trash-view__empty` → 空状態スタイル (REQ-6).

#### routines-view

- `<main>` → `<main className="routines-view">`.
- 作成フォーム (`aria-label="ルーティン作成フォーム"`) に `routines-view__form` → 角丸枠ブロック. 曜日チェックボックス行は flex + gap 8px (`routines-view__days`).
- `<ul>` に `routines-view__list`, `<li>` に `routines-view__item` → 角丸カード. 曜日表示 `<span>` に `routines-view__days-label` → 補足テキスト (14px #666). 操作ボタン群 (名称変更 / 削除) は右寄せ (`routines-view__actions`).
- インライン名称変更フォームの構造・優先度 `<select>` は無改修 (D-004).

#### projects-view

- `<main>` → `<main className="projects-view">`.
- 作成フォーム (`aria-label="プロジェクト作成フォーム"`) に `projects-view__form` → 角丸枠ブロック.
- `<ul>` に `projects-view__list`, `<li>` に `projects-view__item` → 角丸カード. 操作ボタン群は右寄せ (`projects-view__actions`).
- インライン名称変更フォームは無改修 (D-004).

### 処理フロー / 例外・エラー処理

変更なし. 全 mutation (restore / empty / create / rename / delete / patchSettings), TanStack Query キー, ConflictDialog / notifyError / オフラインキュー経路は無改修 (REQ-7).

## 重要な決定

spec の D 章 (D-001〜D-006) を正とする. plan 固有の補足:

- **ADR は起票しない**: 本 BL の判断は既存慣行 (BL-037 / BL-038 の CSS 慣行, ui-redesign-foundation U-010) の踏襲であり, 新規のアーキテクチャ判断を含まない. CSS フレームワーク選定の ADR は BL-046 の責務.
- **スタイル目的の `<div>` ラップは最小限**: flex 配置に必要な場合のみ追加し, role を持つ要素 (form / ul / section) の間に挟んでセレクタ (`getByRole(...)` の階層) を壊さないこと.
- **E2E での computed style 検証**: AC-3〜AC-5 / AC-7 は Playwright の `evaluate` + `getComputedStyle` で検証する. 「/tomorrow と同値」の比較は, /tomorrow で取得した値を期待値として 4 view に適用する形にし, 将来 BL-046 で値が変わってもテストが追従する (リテラル 24px の重複ハードコードを避ける).

## リスク / 代替案

- **リスク 1: 既存 E2E のセレクタ破壊**. 対策: aria 属性 / アクセシブルネームを不変とし (NFR-COMPAT), JSX 変更を className 付与と trash の header 化に限定する. trash の header 化はボタン名「ゴミ箱を空にする」を変えないため `getByRole("button", { name: ... })` 系セレクタは影響を受けない.
- **リスク 2: コントラスト違反 (axe)**. 対策: 文字色は tomorrow-view で AA 検証済みの `#666` (5.7:1) / `#595959` (7:1) のみ使う. 新色は導入しない.
- **リスク 3: BL-046 との二重作業**. 対策: 値の発明をせず tomorrow-view.css の転写に徹し, `TODO(BL-046)` マーカー (AC-10) で機械的に置換可能な状態を保つ.
- **代替案 (不採用): 共通レイアウトコンポーネント (`<ViewLayout>`) の導入**. 4 view + 既存 3 view の構造を抽象化する案. BL-046 のトークン導入前に抽象を固めると手戻りリスクが大きいため, 本 BL では view ごとの CSS 複製 (BL-038 と同じ方式) を採る. 共通化は BL-046 以降で判断.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- **新規 E2E** `e2e/secondary-views-style.spec.ts`: AC-2 (ルートクラス) / AC-3 (H1 タイポグラフィの /tomorrow 一致) / AC-4 (フォーム角丸枠) / AC-5 (カード化) / AC-6 (trash ヘッダ) / AC-7 (空状態) を検証する.
- **既存 E2E の無改修 green** (AC-1 / AC-8): `sidebar-nav.spec.ts` (導線) / `settings.spec.ts` / `trash.spec.ts` / `routines.spec.ts` / `projects.spec.ts` / `boundary-time.spec.ts` / `conflict-handling.spec.ts` ほか全 spec.
- **a11y** (AC-9): `e2e/a11y.spec.ts` の全 8 スキャンが green のまま.
- **単体テスト**: 既存テストの green 維持が必須. trash の header 化と className 付与について最小のアサーションを追加するかは test-designer の裁量 (E2E で担保済みのため必須としない).
- **マーカー検査** (AC-10): grep による確認 (CI 化はしない. auditor のチェック項目とする).
