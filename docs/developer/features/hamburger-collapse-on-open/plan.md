# 設計・実装計画: メニュー開時のハンバーガーボタン視覚的退避

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`menuOpen === true` の間, ハンバーガーボタン (`.app-shell__hamburger`) に
state class `app-shell__hamburger--hidden` を付与し,
CSS で `display: none` を当てて視覚的に退避する.
同時にメニューパネル (`.app-shell__menu`) の冒頭に
`.app-shell__menu-close` ボタンを描画し, click で既存の `closeMenu` を呼ぶ.

DOM は残し (focus 復帰先として有効性を保つ), JSX 側の条件 render は採用しない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| domain | なし |
| server | なし |
| モジュール (web) | `web/src/ui/app-shell/app-shell.tsx`: 閉じるボタン JSX 追加 + ハンバーガーボタン className 切替 |
| CSS (web) | `web/src/ui/app-shell/app-shell.css`: `.app-shell__hamburger--hidden` と `.app-shell__menu-close` を追加 |
| UI | メニュー開時にハンバーガーが消え, メニュー内冒頭に `×` ボタンが表示される |
| テスト | `web/__tests__/hamburger-collapse-on-open.test.ts(x)` を新規追加 |
| ドキュメント | この feature ディレクトリのみ. `project.md` は触らない |

## 設計詳細

### DOM 構造変更

変更前 (BL-049 / BL-053 確定状態):

```
<div class="app-shell">
  <button class="app-shell__hamburger" aria-label="メニューを開く/閉じる" aria-expanded=...>☰</button>
  {menuOpen && <div class="app-shell__overlay" />}
  <nav class="app-shell__menu app-shell__menu--open?" role="dialog?" ...>
    <ul class="app-shell__nav-primary">...</ul>
    <hr class="app-shell__divider" />
    <ul class="app-shell__nav-secondary">...</ul>
  </nav>
  <div class="app-shell__main"><Outlet /></div>
</div>
```

変更後 (本 BL):

```
<div class="app-shell">
  <button
    class={`app-shell__hamburger${menuOpen ? " app-shell__hamburger--hidden" : ""}`}
    aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
    aria-expanded={menuOpen}
  >☰</button>

  {menuOpen && <div class="app-shell__overlay" />}

  <nav class="app-shell__menu app-shell__menu--open?" role="dialog?" ...>
    {menuOpen && (
      <button
        type="button"
        class="app-shell__menu-close"
        aria-label="メニューを閉じる"
        onClick={closeMenu}
      >×</button>
    )}
    <ul class="app-shell__nav-primary">...</ul>
    <hr class="app-shell__divider" />
    <ul class="app-shell__nav-secondary">...</ul>
  </nav>

  <div class="app-shell__main"><Outlet /></div>
</div>
```

ポイント:

- ハンバーガーボタンの DOM 自体は残し, className 切替のみ.
  → `hamburgerRef.current?.focus()` (BL-049 REQ-13) が引き続き有効.
- 閉じるボタンは `.app-shell__menu` の最初の子要素として配置 (REQ-6 / D-003).
- 閉じるボタンは menuOpen=true のときだけ render (menuOpen=false 時の不要な DOM を増やさない).
  - これは「ハンバーガー側は state class + 残置」, 「閉じる側は条件 render で追加」という
    非対称な扱いになるが, 理由は次のとおり:
    - ハンバーガー側は menuOpen=false 時に必ず可視で focus 復帰の宛先として必要.
    - 閉じる側は menuOpen=false 時には不要 (menu パネル自体が translateX で隠れている).

### state class 切替ロジック

`AppShell` 内で className を組み立てるヘルパ関数:

```
function hamburgerClass(menuOpen: boolean): string {
  return menuOpen
    ? "app-shell__hamburger app-shell__hamburger--hidden"
    : "app-shell__hamburger";
}
```

または JSX 内のテンプレートリテラルでも可:

```
className={`app-shell__hamburger${menuOpen ? " app-shell__hamburger--hidden" : ""}`}
```

実装者が好む方で構わない (実装の自由度).

### 閉じるボタンの click ハンドラ

既存の `closeMenu` (BL-049 で確定) をそのまま再利用する:

```
const closeMenu = useCallback(() => {
  setMenuOpen(false);
  hamburgerRef.current?.focus();
}, []);
```

閉じるボタン要素:

```
<button
  type="button"
  className="app-shell__menu-close"
  aria-label="メニューを閉じる"
  onClick={closeMenu}
>
  ×
</button>
```

`type="button"` は D-005 で確定. デフォルト submit 挙動を避けるため.

### CSS 追加

`web/src/ui/app-shell/app-shell.css` の末尾に以下を追加する:

```
/* BL-062: メニュー開時はハンバーガーボタンを視覚的に退避 */
.app-shell__hamburger--hidden {
  display: none;
}

/* BL-062: メニュー内「閉じる」ボタン */
.app-shell__menu-close {
  align-self: flex-end; /* menu は flex column. 右上に配置 */
  background: none;
  border: none;
  font-size: var(--font-size-h2);
  cursor: pointer;
  padding: var(--space-xs);
  color: var(--color-fg);
  margin-bottom: var(--space-sm);
}
```

スタイル詳細:

- `align-self: flex-end`: `.app-shell__menu` は `display: flex; flex-direction: column`
  なので, 子要素を右寄せにすれば「× を右上」に置ける.
- `background` / `border` / `font-size` / `padding` / `color` は
  `.app-shell__hamburger` と同じトークン構成にして, 視覚的整合を取る (REQ-10).
- `margin-bottom: var(--space-sm)`: 直下の `<ul class="app-shell__nav-primary">`
  との間に余白を確保する.

### 既存 CSS への影響

- 既存 `.app-shell__hamburger` ルールは変更しない.
- 既存 `.app-shell__menu` / `.app-shell__menu--open` ルールは変更しない.
  - 特に `.app-shell__menu` の `display: flex; flex-direction: column` は
    閉じるボタンの `align-self: flex-end` が機能するために必要 (既に確定済み).
- 既存 `.app-shell__main` の `padding-top` は変更しない (BL-053 維持, AC-10).
- 既存 `.app-shell__overlay`, `.app-shell__nav-primary`,
  `.app-shell__nav-secondary`, `.app-shell__nav-link`,
  `.app-shell__divider` は変更しない.

### イベントハンドラ表

| ハンドラ | トリガー | 処理 |
| --- | --- | --- |
| `toggleMenu` | ハンバーガーボタン click | menuOpen を反転 (既存 / BL-049) |
| `closeMenu` | 閉じるボタン click (新規) / overlay click / NavLink click / Escape | menuOpen=false + ハンバーガーボタンに focus 復帰 (既存 / BL-049 を流用) |

### 処理フロー

```
[menuOpen=false 時]
  ハンバーガーボタン: 表示 (className = "app-shell__hamburger")
  閉じるボタン: 非 render
  menu パネル: transform: translateX(-100%) (画面外)

[ユーザー: ハンバーガーボタンを click]
  → toggleMenu() → setMenuOpen(true)
  → render: ハンバーガーに --hidden 付与 (display: none で消える)
  → render: menu 冒頭に閉じるボタンが追加される
  → useEffect: firstLinkRef.current?.focus() (BL-049 REQ-12)
  → menu パネル: --open 付与 → スライドイン

[menuOpen=true 時]
  ハンバーガーボタン: 非表示 (display: none)
  閉じるボタン: menu 冒頭に表示
  menu パネル: 画面内

[ユーザー: 閉じるボタンを click]
  → closeMenu() → setMenuOpen(false) + hamburgerRef.current?.focus()
  → render: ハンバーガーから --hidden 除去 (再表示)
  → render: 閉じるボタンが unmount
  → focus: ハンバーガーボタンに移動 (DOM は残っていたので有効)
  → menu パネル: --open 除去 → スライドアウト

[ユーザー: overlay click / Escape / NavLink click]
  → BL-049 の挙動を維持 (closeMenu() を呼ぶ)
  → 上記「閉じるボタンを click」と同じ復帰経路
```

### 例外 / エラー処理

- `hamburgerRef.current` が null の場合は `?.focus()` で無害に無視 (既存挙動).
- menuOpen=false の状態で閉じるボタンが click される経路はない
  (そもそも render されない).
- menuOpen=true 中に外部から DOM が消された場合の防御は本 BL の対象外.

## 重要な決定

- D-001: 採用案は (a) シンプル退避案. spec.md §「採用案」/「D 章」を参照.
- D-002: 非表示手段は state class + `display: none`.
  JSX 条件 render と `visibility: hidden` は採用しない. 理由は spec.md D-002.
- D-003: 閉じるボタン位置は menu 冒頭 (最初の子要素). 命名は `.app-shell__menu-close`.
- D-004: 閉じるボタンの click ハンドラは既存 `closeMenu` を再利用.
- D-005: 閉じるボタンに `type="button"` + `aria-label="メニューを閉じる"` 必須.
- D-006: テストは単体のみ (CSS 直読み + jsdom DOM レンダ).
  E2E は BL-049 の既存 spec を回帰確認するのみで, 本 BL で新規 spec は書かない.
  根拠: 視覚退避は CSS `display: none` で実装され, jsdom DOM レンダで
  className に `--hidden` が付くことを assert すれば AC を満たせるため.

ADR 起票は不要 (BL-049 / BL-053 の延長で粒度が小さく, 大きな設計判断ではない).

## リスク / 代替案

- リスク 1: BL-049 の単体テストが menu パネル内の DOM 構造に依存している場合,
  閉じるボタン追加で `getByRole("button")` の重複が発生する可能性.
  - 緩和策: BL-049 のテストはハンバーガーを `getByRole("button", { name: /メニュー/ })`
    で取得しているが, 閉じるボタンも `aria-label="メニューを閉じる"` を持つため
    name 一致範囲が広がる. 解決には正規表現を `/メニューを開く/` 等で
    具体化するか, ref-based 取得に切り替える.
  - 影響範囲は BL-062 のテスト追加時に確認し, 必要なら BL-049 のテストも
    並行修正する (修正の根拠は本 BL のリスク緩和としてコミットに明記).
- リスク 2: E2E spec で「ハンバーガーボタンが常時 viewport にいる」前提の
  操作が含まれている場合, menu 開状態で `page.click(".app-shell__hamburger")` が
  hidden 要素への click として失敗する.
  - 緩和策: BL-049 の E2E は spec.md の AC-1〜AC-9 に対応するもの.
    AC-2 → ハンバーガーは menu 閉の状態で click するため hidden ではない.
    AC-3/4/5 → menu を閉じる動作で hidden 状態のハンバーガーを click する経路はない.
    AC-9 → ARIA 属性確認のみ.
    したがって既存 E2E は影響を受けない見込み.
- 代替案 (採用しない): 閉じるボタンをハンバーガーボタンと同じ
  fixed position に重ねて表示する案は, アイコン状態管理が複雑になるため
  spec.md §「採用案」で不採用とした.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (新規追加)

ファイル: `web/__tests__/hamburger-collapse-on-open.test.ts(x)`

検証対象とカバー AC:

| # | 検証内容 | AC |
| --- | --- | --- |
| 1 | `app-shell.css` を直読みし `.app-shell__hamburger--hidden { display: none }` が存在する | AC-1, AC-11 |
| 2 | menuOpen=false の初期状態でハンバーガー className に `--hidden` が含まれない | AC-3 |
| 3 | menuOpen=true 切替後にハンバーガー className に `--hidden` が含まれる | AC-2 |
| 4 | menuOpen=true で `aria-label="メニューを閉じる"` の button が menu 内に存在し className が `.app-shell__menu-close` を含む | AC-4 |
| 5 | menuOpen=true で role="dialog" の firstElementChild が `.app-shell__menu-close` である | AC-5 |
| 6 | 閉じるボタン click 後に menu から `--open` が外れ, ハンバーガーから `--hidden` が外れ, `aria-expanded` が false に戻る | AC-6 |
| 7 | 閉じるボタン click 後に `document.activeElement` が `aria-label="メニューを開く"` の要素 | AC-7 |
| 8 | 閉じるボタンの textContent が `×` を含む | AC-8 |
| 9 | `.app-shell__main` の padding-top が `calc(var(--space-md) + var(--space-xl))` のまま (CSS 直読み) | AC-10 |

### 既存テストの回帰確認

- `web/__tests__/` 配下の BL-049 系単体テスト全件.
- `web/src/ui/app-shell/app-shell.test.tsx` の既存テスト全件.
- `e2e/` 配下の BL-049 / BL-053 関連 spec 全件.
- → AC-9 / AC-12 のカバレッジ.

### スコープ外

- 視覚回帰テスト (screenshot diff) は本 BL では行わない.
- アニメーション (transform transition) の挙動検証は対象外.
- 新規 Playwright spec は追加しない (D-006).
