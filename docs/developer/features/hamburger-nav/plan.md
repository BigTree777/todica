# 設計・実装計画: ハンバーガーナビゲーション

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`AppShell` コンポーネントに開閉状態（`isOpen: boolean`）の `useState` を追加し、ハンバーガーボタンとオーバーレイメニューの表示切り替えを制御する。
既存の `.app-shell__sidebar` を廃止し、新たに `.app-shell__overlay` + `.app-shell__menu` のオーバーレイ構造に置き換える。
`.app-shell__main` から `flex` の子要素としての幅制限を除去し、全幅化する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| モジュール | `web/src/ui/app-shell/app-shell.tsx`（開閉ロジック追加）、`web/src/ui/app-shell/app-shell.css`（サイドバー廃止・オーバーレイ追加） |
| UI | ハンバーガーボタン追加、固定サイドバー廃止、オーバーレイメニュー追加 |
| テスト | `web/__tests__/` に単体テスト追加、`e2e/` に E2E テスト追加 |

## 設計詳細

### コンポーネント構造

変更後の `AppShell` の JSX 構造:

```
<div className="app-shell">
  <button
    className="app-shell__hamburger"
    aria-label={isOpen ? "メニューを閉じる" : "メニューを開く"}
    aria-expanded={isOpen}
    aria-controls="app-shell-menu"
    onClick={handleToggle}
  >
    ☰
  </button>

  {/* オーバーレイ背景: クリックで閉じる */}
  {isOpen && (
    <div
      className="app-shell__overlay"
      aria-hidden="true"
      onClick={handleClose}
    />
  )}

  {/* メニューパネル */}
  <nav
    id="app-shell-menu"
    className={`app-shell__menu ${isOpen ? "app-shell__menu--open" : ""}`}
    role="dialog"
    aria-modal="true"
    aria-label="ナビゲーションメニュー"
  >
    {/* 既存のナビゲーション要素（プライマリ・区切り・セカンダリ）をそのまま移植 */}
    ...
  </nav>

  <div className="app-shell__main">
    <Outlet />
  </div>
</div>
```

### 状態管理

- `isOpen` は `AppShell` ローカルの `useState<boolean>(false)` で管理する
- React Router の `useNavigate` や `useLocation` は使わない（NavLink の `onClick` でハンドラを組み合わせる）
- ルーティング遷移後の自動クローズは NavLink の `onClick` に `handleClose` を渡して実現する

### イベントハンドラ

| ハンドラ | トリガー | 処理 |
| --- | --- | --- |
| `handleToggle` | ハンバーガーボタン click | `isOpen` を反転する |
| `handleClose` | オーバーレイ背景 click / NavLink click | `isOpen` を `false` にし、ハンバーガーボタンに `focus()` を戻す |
| `handleKeyDown` | `keydown` on document または menu | `key === "Escape"` で `handleClose` を呼ぶ |

### フォーカス管理

- `useRef` でハンバーガーボタンへの参照 (`hamburgerRef`) とメニュー内最初のリンクへの参照 (`firstLinkRef`) を保持する
- メニューを開いた直後（`useEffect` で `isOpen` を監視）に `firstLinkRef.current?.focus()` を呼ぶ
- メニューを閉じたとき `hamburgerRef.current?.focus()` を呼ぶ

### CSS 設計

既存クラスの変更:

| クラス | 変更内容 |
| --- | --- |
| `.app-shell` | `display: flex` は維持、サイドバーとの横並びレイアウトを廃止 |
| `.app-shell__sidebar` | 削除 |
| `.app-shell__main` | `flex: 1` → `width: 100%` に変更（全幅化） |

新規クラス:

| クラス | 役割 |
| --- | --- |
| `.app-shell__hamburger` | 左上固定のハンバーガーボタン。`position: fixed; top: var(--space-sm); left: var(--space-sm)` |
| `.app-shell__overlay` | 全画面を覆う半透明の背景層。`position: fixed; inset: 0; background: rgba(0,0,0,0.4)` |
| `.app-shell__menu` | メニューパネル本体。`position: fixed; left: 0; top: 0; height: 100%; width: 240px; transform: translateX(-100%); transition: transform 0.2s` |
| `.app-shell__menu--open` | メニューを表示状態にするモディファイア。`transform: translateX(0)` |

デザイントークンの適用箇所:

| トークン | 使用箇所 |
| --- | --- |
| `--space-sm` | ハンバーガーボタンの top/left オフセット、メニュー内余白 |
| `--space-md` | メニュー内パディング |
| `--color-bg` | メニューパネルの背景色 |
| `--color-border` | メニューパネルの右ボーダー |
| `--color-border-subtle` | 区切り線 |
| `--radius-sm` | ハンバーガーボタンの角丸 |

### 処理フロー

```
[ユーザー: ハンバーガーボタンをクリック]
  → handleToggle() → isOpen: false → true
  → useEffect(isOpen) → firstLinkRef.current.focus()
  → メニューパネルに .app-shell__menu--open が付与されてスライドイン表示

[ユーザー: NavLink をクリック]
  → handleClose() → isOpen: true → false
  → hamburgerRef.current.focus()
  → React Router がルーティング遷移
  → メニューパネルから .app-shell__menu--open が外れてスライドアウト

[ユーザー: オーバーレイ背景をクリック]
  → handleClose() → isOpen: true → false
  → hamburgerRef.current.focus()

[ユーザー: Escape キーを押す]
  → handleKeyDown() → handleClose() → isOpen: true → false
  → hamburgerRef.current.focus()
```

### 例外 / エラー処理

- `firstLinkRef` または `hamburgerRef` が null の場合は `?.focus()` の optional chaining で無害に無視する
- Escape キーハンドラは `isOpen` が `false` のときは何もしない（二重 close を防ぐ）

## 重要な決定

- D-001: `<nav role="dialog" aria-modal="true">` を採用する。純粋なダイアログ（`<dialog>` 要素）ではなく `<nav>` に `role="dialog"` を付与する理由は、ネイティブ `<dialog>` はフォームの submit/close 動作が組み込まれておりナビゲーション用途には semantics が過剰なため。NavLink + useRef によるフォーカス管理で同等の a11y を実現する。
- D-002: オーバーレイ開閉アニメーションは CSS `transform: translateX` + `transition` で実装し、JS アニメーションライブラリを使わない（依存追加なし）。
- D-003: メニュー幅は `240px` の固定値とする（`200px` から若干広げてタップしやすくする）。デザイントークンには含めない（AppShell 固有値）。

## リスク / 代替案

- `<dialog>` 要素を使う代替案: ネイティブの `showModal()` / `close()` でフォーカストラップが自動化される利点があるが、NavLink のクリックで閉じるハンドリングが複雑になるため不採用。
- CSS `display: none` / `display: flex` による表示切り替えの代替案: アニメーションが実現できないため不採用（`transform` + `transition` を採用）。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 単体テスト (`web/__tests__/hamburger-nav.test.ts`): `@testing-library/react` でコンポーネントをレンダリングし、ボタンクリック・Escape キー・リンククリックによる `isOpen` 状態変化と ARIA 属性の変化を検証する
- E2E テスト (`e2e/hamburger-nav.spec.ts`): Playwright で実ブラウザを操作し、spec.md の AC-1〜AC-9 を検証する
- 既存 E2E テスト（`e2e/smoke.spec.ts` 等）の `nav` / `.app-shell__sidebar` セレクタ参照箇所を修正する
