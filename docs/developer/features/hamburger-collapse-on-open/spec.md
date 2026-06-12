# 仕様: メニュー開時のハンバーガーボタン視覚的退避

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-062
- 依存: BL-049 (`features/hamburger-nav/`) のフォローアップ
- 隣接: BL-053 (`features/hamburger-overlap-fix/`) — `.app-shell__main` の上余白で h1 との重なりを解消済み (本 BL の対象外, ただし回帰させない)

## 背景 / 課題

BL-049 で導入したハンバーガーボタン (`.app-shell__hamburger`) は,
viewport 左上に `position: fixed; top: var(--space-sm); left: var(--space-sm); z-index: 200`
で常時表示される. BL-053 で `.app-shell__main` の `padding-top` を増やし
`<h1>` との重なりは解消したが,
**オーバーレイメニュー (`.app-shell__menu--open`) が開いた状態でも
☰ アイコンが画面左上に表示され続け, メニューパネルと視覚的に重なって見える**
という別の重なり問題が残っている.

`menuOpen` 状態で `aria-label` が「メニューを閉じる」に切り替わる挙動はあるが,
ユーザーから見ると「メニューが開いている / 閉じている」を表す視覚情報として
☰ アイコンの位置・形状は変化しないため,
パネルの上に ☰ がそのまま乗って表示される.

本 BL では「メニューが開いている間 (`menuOpen === true`) は
ハンバーガーボタンを視覚的に隠す」方向に挙動を統一する.

## ゴール / 非ゴール

- ゴール:
  - `menuOpen === true` の間, ハンバーガーボタン (`.app-shell__hamburger`) が
    視覚的にメニューパネルと重ならない (= 画面から消える / 干渉しない).
  - メニューを閉じるための明示的なアフォーダンス (閉じるボタン) を menu 内に提供する.
  - BL-049 の AC-1〜AC-9 すべてが引き続き満たされる.
  - BL-053 で確定した `.app-shell__main` の上余白 (`calc(var(--space-md) + var(--space-xl))`)
    を維持する.
- 非ゴール:
  - ハンバーガーボタン (`.app-shell__hamburger`) の DOM 自体を削除すること
    (メニュー閉時には再表示が必要なため).
  - ハンバーガーアイコン (`☰`) の文字列・サイズ・色の変更.
  - メニューパネル (`.app-shell__menu`) の幅・位置・スライドアニメーションの変更.
  - レスポンシブブレークポイント別の挙動切り替え.
  - `tokens.css` への新規トークン追加.
  - 各 view (`day-view`, `focus-view`, etc.) の改修.
  - domain / server / API の改修.

## 要件

- 機能要件:
  - REQ-1: `menuOpen === true` の間, `.app-shell__hamburger` を
    視覚的に非表示にする (`display: none` を CSS で適用する).
  - REQ-2: `menuOpen === true` の間, `.app-shell__menu` 内に
    「メニューを閉じる」ボタンを描画する.
  - REQ-3: 閉じるボタン (REQ-2) を click すると `closeMenu` が呼ばれ,
    `menuOpen` が `false` に戻り, ハンバーガーボタンが再表示される.
  - REQ-4: 閉じるボタン (REQ-2) を click した直後, focus が
    再表示されたハンバーガーボタンに戻る (BL-049 REQ-13 と同じ挙動).
  - REQ-5: 閉じるボタン (REQ-2) には `aria-label="メニューを閉じる"` を付与する.
  - REQ-6: 閉じるボタン (REQ-2) は `.app-shell__menu` の冒頭 (最初の子要素) に
    配置する. メニュー内ナビゲーションリストよりも前.
  - REQ-7: 閉じるボタン (REQ-2) のクラス名は `.app-shell__menu-close` とする.
- 非機能要件:
  - REQ-8: ハンバーガーボタンの非表示は CSS の state class
    (`.app-shell__hamburger.app-shell__hamburger--hidden`) で行う.
    JSX 側の条件 render (`menuOpen && <button .../>`) は採用しない.
    根拠は D-002 を参照.
  - REQ-9: 非表示の手段は `display: none` を採用する (`visibility: hidden` は採用しない).
    根拠は D-002 を参照.
  - REQ-10: 既存トークン (`tokens.css`) のみを使用する.
    閉じるボタンのスタイルは既存の `.app-shell__hamburger` と同じトークン
    (`--font-size-h2`, `--space-xs`, `--color-fg`, etc.) を流用する.
  - REQ-11: 閉じるボタンのアイコンは `×` (U+00D7 MULTIPLICATION SIGN) とする.
    画像 / SVG は使わない.
  - REQ-12: BL-049 の AC-1〜AC-9 (menu 開閉 / dialog role / Escape / overlay click /
    リンク選択での自動 close / focus 管理) は全件回帰させない.
  - REQ-13: BL-053 で確定した `.app-shell__main` の `padding-top` を変更しない.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

### AC-1: メニュー開時にハンバーガーボタンが視覚的に非表示になる (CSS)

```
シナリオ: app-shell.css に menuOpen 状態用の非表示ルールが存在する
  Given web/src/ui/app-shell/app-shell.css を読み込む
  When  .app-shell__hamburger--hidden セレクタの宣言ブロックを抽出する
  Then  display: none が指定されている
```

### AC-2: メニュー開時のハンバーガーボタンに state class が付与される (DOM)

```
シナリオ: menuOpen=true の AppShell を jsdom でレンダリングする
  Given AppShell コンポーネントをルータ配下でレンダリングする
  When  ハンバーガーボタンをクリックして menuOpen=true にする
  Then  ハンバーガーボタン要素の className に
        "app-shell__hamburger--hidden" が含まれている
  And   ハンバーガーボタン要素の className に
        "app-shell__hamburger" も引き続き含まれている (基底クラスは保持)
```

### AC-3: メニュー閉時にハンバーガーボタンが表示状態に戻る (DOM)

```
シナリオ: menuOpen=false の AppShell を jsdom でレンダリングする
  Given AppShell コンポーネントを初期状態 (menuOpen=false) でレンダリングする
  When  ハンバーガーボタン要素の className を確認する
  Then  className に "app-shell__hamburger--hidden" は含まれない
  And   className に "app-shell__hamburger" は含まれる
```

### AC-4: 閉じるボタンが menu パネル内に存在する (DOM)

```
シナリオ: menuOpen=true の AppShell に閉じるボタンが描画される
  Given AppShell コンポーネントをルータ配下でレンダリングする
  When  ハンバーガーボタンをクリックして menuOpen=true にする
  Then  aria-label="メニューを閉じる" を持つ button が menu パネル内に存在する
  And   その button の className に "app-shell__menu-close" が含まれる
  And   その button は role="dialog" な menu パネル (BL-049 AC-9) の子孫である
```

### AC-5: 閉じるボタンは menu パネルの最初の子要素である (DOM)

```
シナリオ: 閉じるボタンが menu の冒頭に配置されている
  Given menuOpen=true の AppShell をレンダリングする
  When  menu パネル (role="dialog") の firstElementChild を取得する
  Then  その要素が .app-shell__menu-close クラスを持つ button である
```

### AC-6: 閉じるボタン click で menu が閉じる (DOM)

```
シナリオ: 閉じるボタンを click すると menuOpen が false に戻る
  Given menuOpen=true の AppShell をレンダリングする
  When  aria-label="メニューを閉じる" の button を click する
  Then  menu パネルから "app-shell__menu--open" クラスが外れる
  And   ハンバーガーボタンから "app-shell__hamburger--hidden" クラスが外れる
  And   ハンバーガーボタンの aria-expanded が "false" に戻る
```

### AC-7: 閉じるボタン click 後に focus がハンバーガーに戻る (DOM)

```
シナリオ: 閉じるボタン click 後に focus 復帰が行われる
  Given menuOpen=true の AppShell をレンダリングする
  When  aria-label="メニューを閉じる" の button を click する
  Then  document.activeElement が aria-label="メニューを開く" の
        ハンバーガーボタンに一致する
```

### AC-8: 閉じるボタンのアイコンが `×` である (DOM)

```
シナリオ: 閉じるボタンの可視テキストが × である
  Given menuOpen=true の AppShell をレンダリングする
  When  .app-shell__menu-close の textContent を取得する
  Then  "×" (U+00D7) を含む
```

### AC-9: BL-049 の AC-1〜AC-9 が引き続き満たされる (回帰防止)

```
シナリオ: 既存 BL-049 テストが全件 green を維持する
  Given 本 BL の変更を適用した状態
  When  web/__tests__/ 配下の hamburger-nav 関連単体テスト
        および e2e/ 配下の hamburger-nav 関連 spec を実行する
  Then  全件が pass する
  And   特に以下の BL-049 AC が引き続き green:
        - AC-2 (ハンバーガー click で menu 開, focus が最初のリンク)
        - AC-3 (NavLink click で menu 閉, focus 復帰)
        - AC-4 (overlay click で menu 閉, focus 復帰)
        - AC-5 (Escape で menu 閉, focus 復帰)
        - AC-9 (menu パネルに role="dialog" / aria-modal="true")
```

### AC-10: BL-053 で確定した `.app-shell__main` 設定が変更されていない (回帰防止)

```
シナリオ: .app-shell__main の padding-top が BL-053 確定値のまま
  Given web/src/ui/app-shell/app-shell.css を読み込む
  When  .app-shell__main セレクタの宣言ブロックを抽出する
  Then  padding-top が calc(var(--space-md) + var(--space-xl)) のままである
```

### AC-11: ハンバーガーボタンと menu パネルが視覚的に重ならない (CSS 直読み)

```
シナリオ: menuOpen=true の CSS 状態でハンバーガーが非表示になる
  Given web/src/ui/app-shell/app-shell.css を読み込む
  When  .app-shell__hamburger--hidden セレクタの宣言ブロックと
        .app-shell__menu--open セレクタの宣言ブロックを取得する
  Then  .app-shell__hamburger--hidden に display: none が指定されている
  And   .app-shell__menu--open には display: none が指定されていない
        (= menu 側は引き続き表示される)
```

### AC-12: 単体テスト全件 green

```
シナリオ: 既存テストを一切回帰させない
  Given 本 BL の変更を適用した状態
  When  npm test を実行する
  Then  全件が pass (またはスキップ) する
```

## 採用案

- **案 (a) (シンプル退避案) を採用する**.
  - 内容:
    - `menuOpen === true` の間, ハンバーガーボタンに state class
      `app-shell__hamburger--hidden` を付与し, CSS で `display: none` する.
    - 同時に menu パネル冒頭に `.app-shell__menu-close` ボタンを描画し,
      `aria-label="メニューを閉じる"` + 可視テキスト `×` で
      閉じ操作のアフォーダンスを提供する.
  - 採用理由 (D-001):
    - 実装が最小 (CSS 1 ルール追加 + JSX で閉じるボタン 1 個追加 + className 条件付与).
    - BL-049 の `closeMenu` ヘルパ (overlay click / Escape / NavLink click の
      共通ハンドラ, focus 復帰先がハンバーガーボタン) をそのまま再利用できる.
    - BL-049 の AC-1〜AC-9 への影響範囲が「ハンバーガーボタンが見えない間に
      閉じるボタンが追加で存在する」だけで, 既存テスト要件に直接の衝突がない.
- 案 (b) (アイコン切り替え案) は不採用とする.
  - 理由: ハンバーガーボタンがメニューパネルの上に重なる位置に表示され続けるため
    z-index 制御 + アイコン状態管理 (☰ ↔ ×) + アニメーション遷移を
    扱う必要があり, 案 (a) より複雑.
- 案 (c) (メニュー内部常駐案) は不採用とする.
  - 理由: ハンバーガーボタンの位置自体を menu パネル内に移動させると,
    menu が閉じている状態でもボタン押下できるためには
    menu パネル自体を常時 viewport に出すか, ボタンだけ外出しする
    特殊な DOM 構造が必要になり, BL-049 の `<button>` + `<nav role="dialog">`
    の素直な構造を崩す.

## D 章 (確定事項)

- D-001: 採用案は **(a) シンプル退避案** とする. 上記「採用案」節を参照.
- D-002: ハンバーガーボタン非表示の手段は
  **state class (`.app-shell__hamburger--hidden`) + CSS `display: none`** とする.
  - 理由 1: JSX 側で条件 render する案
    (`{!menuOpen && <button ... />}`) は, ボタン DOM が消えるため
    `hamburgerRef.current?.focus()` (BL-049 REQ-13 の focus 復帰) のタイミングで
    `ref.current` が null になり, 閉じる動作の直後の focus 復帰が壊れる.
    state class + CSS なら DOM は残り `ref` が有効なまま.
  - 理由 2: `visibility: hidden` は要素のレイアウトスペースを占有し続けるため,
    menu パネル下に透明な押せない領域が残る違和感を避けるために `display: none` を採用.
- D-003: メニュー内「閉じる」ボタンの配置は
  **menu パネル (`.app-shell__menu`) の冒頭 (最初の子要素)** とする.
  - 命名は `.app-shell__menu-close` (BL-049 の命名規則 `.app-shell__<part>` に合わせる).
  - 冒頭配置の理由: BL-049 REQ-12 (menu 開時に最初のリンクに focus 移動) は
    `firstLinkRef` への `focus()` で実装されているため, DOM 順序上 close ボタンが
    最初に来ても tab 順は close → 現在のタスク → ... となり,
    既存 focus 仕様 (最初のリンクへ移動) と矛盾しない.
- D-004: 閉じるボタン押下時の挙動は
  **既存の `closeMenu` ヘルパをそのまま呼ぶ** とする.
  - `closeMenu` は `setMenuOpen(false)` + `hamburgerRef.current?.focus()` を行う
    (BL-049 確定実装).
  - D-002 により menuOpen=false に戻った時点で
    state class が外れハンバーガーが再表示されるため,
    `hamburgerRef.current?.focus()` は表示状態の要素に対する focus となり有効.
- D-005: アクセシビリティ:
  - 閉じるボタンに `aria-label="メニューを閉じる"` を付与 (REQ-5).
  - BL-049 の Escape / overlay click / NavLink click による
    自動 close (AC-3/4/5) はそのまま維持.
  - 既存 a11y E2E (axe violations 0) を満たすため, 閉じるボタンには
    `type="button"` を必ず付与する (button のデフォルト submit 挙動回避).
- D-006: テスト方針:
  - 単体テスト: CSS ファイル直読みで `.app-shell__hamburger--hidden`
    の `display: none` 宣言を assert (AC-1, AC-11).
  - 単体テスト: `@testing-library/react` で AppShell をルータ配下にレンダリングし,
    menuOpen=true/false 切替時の className 変化 (AC-2, AC-3),
    閉じるボタンの存在と位置 (AC-4, AC-5), click による close と focus 復帰
    (AC-6, AC-7), アイコン文字列 (AC-8) を assert.
  - 既存 BL-049 / BL-053 のテストを変更しない. 回帰確認のみ.
- D-007: 既存 BL-049 / BL-053 テストへの影響:
  - BL-049 の単体テスト: menu パネル内に新しいボタン要素が増えるだけで,
    既存の `getByRole("link", ...)` / `getByRole("dialog")` /
    `aria-expanded` assert には影響しない見込み.
  - BL-053 の単体テスト: 対象が `.app-shell__main` の padding-top のみで,
    本 BL は `.app-shell__hamburger--hidden` の追加のみのため影響なし.
  - 万一 BL-049 の E2E spec で「menu 内の最初の interactive 要素 = 現在のタスク」を
    前提とする箇所があれば, 単体・E2E のいずれかを差分修正する余地は残す
    (現時点の確認では `firstLinkRef` への focus テストは
    role="link" + name="現在のタスク" で取得しているため影響なし).

## スコープ境界 (明示)

- 対象: `web/src/ui/app-shell/app-shell.tsx` および
  `web/src/ui/app-shell/app-shell.css` のみ.
- 対象外:
  - BL-049 / BL-053 で既に確定済みの DOM / CSS は触らない.
  - 各 view (`day-view`, `focus-view`, `projects-view`, `routines-view`,
    `trash-view`, `settings-view`, `setup`) の改修.
  - `tokens.css` への新規トークン追加.
  - domain / server / API.
  - `/setup` (BL-036 D-002 により AppShell の外).

## 未決事項 / 確認待ち

- なし (確定事項として進める).
