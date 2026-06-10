# 仕様: 既存 4 view (settings/trash/routines/projects) のスタイル統一 (secondary-views-shell)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-045
  - 上位要件: FR-020 (プロジェクト管理) / FR-030〜FR-033 (ルーティン) / FR-041 / FR-042 (設定) / FR-060 / FR-061 (ゴミ箱)
  - 関連 NFR: NFR-010 (最小手数の操作) / NFR-001 (単一ワークフロー強制)
  - 関連 feature:
    - [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) §「差分カタログ」BL-045 行 / U-010 (保守側デフォルト案: ヘッダ / 余白 / 角丸 / フォントだけ揃え, ボタン配置・CRUD UI は現状維持)
    - [`../ui-sidebar-nav/spec.md`](../ui-sidebar-nav/spec.md) (BL-036 完了. AppShell + セカンダリナビ 4 リンクは実装済み. 同 spec U-005 の再検討は本 spec D 章で確定)
    - [`../tomorrow-view/`](../tomorrow-view/) (BL-038 完了. `tomorrow-view.css` の暫定値が本 BL のスタイル参照基準)
    - [`../focus-view/`](../focus-view/) (BL-037 完了. 同上)
    - BL-046 (design-tokens, 未着手): トークン定義は BL-046 の責務. 本 BL は暫定値 + `TODO(BL-046)` マーカーで書く.

## 背景 / 課題

### BL-036 で実装済みの範囲 (本 BL のスコープ外であることを実コードで確認済み)

backlog の BL-045 記載「AppShell の補助メニューからアクセスできるようにし」の部分は, **BL-036 (ui-sidebar-nav) で既に完了している**. 2026-06 時点の実コードで以下を確認した.

| 項目 | 状態 | 根拠 (実コード) |
| --- | --- | --- |
| セカンダリナビ 4 リンク (プロジェクト / ルーティン / ゴミ箱 / 設定) | 実装済み | `web/src/ui/app-shell/app-shell.tsx` REQ-3 |
| 4 view の AppShell (`<Outlet />`) 配下でのレンダリング | 実装済み | `web/src/main.tsx` の `<Route element={<AppShell />}>` 子ルートに `/settings` `/trash` `/projects` `/routines` |
| サイドバーから 4 view への遷移 E2E | 実装済み (green) | `e2e/sidebar-nav.spec.ts` 「サイドバーから補助メニュー 4 view に遷移できる」 |
| 4 view の axe WCAG 2.1 AA スキャン | 実装済み (green) | `e2e/a11y.spec.ts` (7 view + モーダルの 8 スキャン) |

したがって **本 BL でルーティング構成の変更は行わない** (変更の必要がない).

### 本 BL で解決する課題 (残スコープ)

4 view (`settings-view.tsx` / `trash-view.tsx` / `routines-view.tsx` / `projects-view.tsx`) は AppShell 配下に置かれたものの, 中身は素の HTML のままで CSS が一切ない.

- 4 view とも `<main><h1>...</h1>...</main>` の構造で, `className` も view 専用 CSS ファイルも持たない.
- 一方, BL-037 / BL-038 で実装された focus-view / tomorrow-view は, モックアップ (ui-redesign-foundation §「UI モックアップの構造」) 由来のスタイル慣行を確立している:
  - view ルートに BEM クラス (`tomorrow-view`, `focus-view`) + view 専用 CSS ファイル.
  - 大きな H1 見出し (24px), 角丸枠 (border-radius 12px) のフォームブロック, 角丸カードのリスト項目, 余白 16px / 8px 系.
  - 全ての暫定値に grep 可能な `TODO(BL-046)` マーカー (BL-046 でのトークン置換漏れ防止).
- このため `/tomorrow` から `/trash` 等へ遷移すると, 同じアプリ内で「刷新後の view」と「素の HTML の view」が混在し, 統一感がない.

なお backlog は「モックの今日ビューと揃える」と表現しているが, 実コード上 `today-view.tsx` 自体も CSS 未適用 (素の HTML) である. モック由来の慣行が実装として存在するのは **tomorrow-view / focus-view の CSS** であり, 本 BL のスタイル参照基準はこの 2 ファイルの暫定値とする (D-002).

## ゴール / 非ゴール

### ゴール

- **4 view へのスタイル適用 (ヘッダ / 余白 / タイポグラフィの統一)**:
  - 各 view のルート要素に BEM ルートクラス (`settings-view` / `trash-view` / `routines-view` / `projects-view`) を付与し, view 専用 CSS ファイルを追加する.
  - H1 見出し / フォームブロック (角丸枠) / リスト項目 (角丸カード) / 空状態表示 / 補足テキストの暫定値を tomorrow-view.css と同値で揃える.
  - 全ての暫定値に `TODO(BL-046)` マーカーを付け, BL-046 でのトークン置換に備える.
- **trash-view のヘッダ構造を today-view の慣行に揃える**:
  - 「ゴミ箱を空にする」ボタンを H1 と同じ `<header>` 内 (右寄せ) に置く (today-view の「＋プロジェクトの追加」と同じ構造. D-006).
- **機能差分なし (CRUD はそのまま)**:
  - 各 view の入出力・操作 (設定保存 / 復元 / ゴミ箱を空にする / ルーティン CRUD / プロジェクト CRUD)・mutation・ConflictDialog 経路は無改修.
  - 既存の単体テスト + E2E は全 green を維持する.
- **アクセシビリティ維持**:
  - `e2e/a11y.spec.ts` の全スキャン (7 view + モーダル) で WCAG 2.1 AA violations 0 件を維持する.
  - 追加する色は AA コントラスト比 (4.5:1 以上) を満たす値のみ使う (tomorrow-view 既出の `#595959` / `#666` を踏襲).

### 非ゴール

- **ルーティング / AppShell の変更**: BL-036 で完了済み. `main.tsx` の Routes と `app-shell.tsx` / `app-shell.css` は本 BL では触らない.
- **デザイントークンの定義**: BL-046 の責務. 本 BL は直接値 + `TODO(BL-046)` マーカーで書く. `web/src/styles/tokens.css` は作らない.
- **CRUD UI の変更**: ui-redesign-foundation U-010 の保守側デフォルト案に従い, ボタンの種類・文言・操作フロー・フォーム入力要素は現状維持. 具体的には:
  - routines-view の優先度 `<select>` を星 UI に置き換えない (「select は使わない」規約は起票フォーム向け. 補助 view の管理 UI は対象外).
  - projects-view / routines-view のインライン名称変更フォーム (「名称変更」→ input + 保存 / キャンセル) の方式は変えない.
  - settings-view のフォーム構成 (境界時刻 / サーバ接続設定 / モード切替) は変えない.
- **today-view へのスタイル適用**: today-view も CSS 未適用だが, 本 BL の対象は補助 4 view のみ. today-view のスタイルは BL-046 (全 view トークン適用) で扱う.
- **ランドマーク構造の全 view 統一**: today + 補助 4 view は `<main>` ルート, focus / tomorrow は `<section>` ルートという不整合があるが, 本 BL では各 view の既存ルート要素を維持する (D-001). 統一の要否は未決事項 U-2.
- **モバイル (狭幅) 対応**: ui-sidebar-nav U-001 を引き継ぎ, デスクトップ幅のみ対象.
- **サーバ API / ドメイン層 / DB の変更**: なし (UI レイヤの CSS + 最小の JSX 構造変更のみ).

## 要件

### 機能要件

- **REQ-1 (view ルートクラスと専用 CSS ファイル)**
  - 4 view のルート要素 (`<main>`) に BEM ルートクラスを付与する: `settings-view` / `trash-view` / `routines-view` / `projects-view`.
  - 各 view ディレクトリに専用 CSS ファイルを追加し, view の `.tsx` から import する: `settings-view.css` / `trash-view.css` / `routines-view.css` / `projects-view.css`.
  - ルート要素は `<main>` のまま維持する (D-001. ランドマーク / 既存テスト互換).
  - ルートのレイアウトは tomorrow-view と同じ縦並び (flex column, gap 16px) とする.

- **REQ-2 (タイポグラフィの統一)**
  - 4 view の `<h1>` は tomorrow-view の `<h1>` と同じ見た目になる: `font-size: 24px` / `margin: 0 0 16px 0` (いずれも `TODO(BL-046): --font-size-h1` 等のマーカー付き暫定値).
  - settings-view の `<h2>` (「サーバ接続設定」「モード切替」) は `font-size: 20px` の暫定値とする (`TODO(BL-046): --font-size-h2`).
  - 補足テキスト (プロジェクト名表示・曜日表示などの副情報) は `font-size: 14px` / `color: #666` (tomorrow-view の `__project` と同値).

- **REQ-3 (フォームブロックの角丸枠)**
  - 各 view の作成 / 設定フォーム (settings の境界時刻フォーム + サーバ接続設定 + モード切替セクション, routines のルーティン作成フォーム, projects のプロジェクト作成フォーム) は, tomorrow-view の起票フォームと同じ角丸枠ブロックとする:
    - `border: 1px solid #ccc` / `border-radius: 12px` / `padding: 16px` / 内部 gap 8px (全て `TODO(BL-046)` マーカー付き).
  - フォーム内の入力要素・ボタンの種類と並びは現状維持 (非ゴール参照).

- **REQ-4 (リスト項目の角丸カード)**
  - trash / routines / projects のリスト項目 (`<li>`) は tomorrow-view のタスクカードと同じ角丸カードとする:
    - `border: 1px solid #ccc` / `border-radius: 12px` / `padding: 16px` / 横並び (項目名は左, 操作ボタン群は右) / カード間 gap 8px.
  - `<ul>` は `list-style: none` / `padding: 0` / `margin: 0` とする.
  - カード上のボタンの種類・文言は現状維持 (復元 / 名称変更 / 削除 等).

- **REQ-5 (trash-view のヘッダ構造)**
  - trash-view の `<h1>ゴミ箱</h1>` と「ゴミ箱を空にする」ボタンを同一の `<header>` 内に置き, H1 を左, ボタンを右に配置する (today-view の `<header>` + 「＋プロジェクトの追加」と同じ構造. D-006).
  - ボタンのアクセシブルネーム「ゴミ箱を空にする」と挙動 (確認なしで empty mutation 実行) は変えない.

- **REQ-6 (空状態の統一)**
  - trash-view の「ゴミ箱は空です」は tomorrow-view の `__empty` と同じ見た目とする: `color: #595959` (AA 4.5:1 以上) / 中央寄せ / `padding: 24px 0`.
  - routines / projects は現状空状態テキストを持たないため追加しない (機能差分なしの原則).

- **REQ-7 (機能差分なし / 既存テスト green 維持)**
  - 4 view の全 mutation / クエリ / ConflictDialog / notifyError 経路は無改修.
  - 既存の単体テスト (`web/src/ui/*/[view].test.tsx`, `router.test.tsx`) と E2E (`e2e/*.spec.ts` 全 23 spec) は全 green を維持する. aria-label / role / アクセシブルネームは一切変えないことでセレクタ互換を保つ.

- **REQ-8 (BL-046 への引き継ぎマーカー)**
  - 新規 CSS の全ての暫定値 (色 / サイズ / 余白 / 角丸) に `TODO(BL-046)` コメントを付ける. `grep -rn "TODO(BL-046)" web/src/ui/<view>/` で置換対象が列挙できること (BL-036 / BL-038 と同じ D-005 慣行).

### 非機能要件

- **NFR-A11Y**: `e2e/a11y.spec.ts` の全 8 スキャン (7 view + モーダル展開状態) で WCAG 2.1 AA violations 0 件を維持. 追加する文字色は通常テキストで 4.5:1 以上のコントラスト比を満たす.
- **NFR-COMPAT**: サーバ API / ドメイン / リポジトリ層は無改修. JSX の変更は className 付与・`<header>` 化 (trash のみ)・スタイル目的の `<div>` ラップ追加までに限定し, role / aria 属性 / アクセシブルネーム / フォーム関連付け (`htmlFor` / `id`) を変えない.
- **NFR-CONSISTENCY**: 4 view と tomorrow-view / focus-view で H1 サイズ・枠線色・角丸半径・基本余白の暫定値が一致する (BL-046 で同一トークンに置換できる状態).
- **NFR-010 整合**: 操作手数は増減しない (見た目のみの変更).

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: サイドバー補助メニューから 4 view にアクセスできる (BL-036 回帰 + 完了の目安)
  Given /today を開いた
  When  サイドバー (aria-label="サイドバーナビゲーション") の「プロジェクト」「ルーティン」「ゴミ箱」「設定」を順にクリックする
  Then  URL がそれぞれ /projects /routines /trash /settings に変わる
   かつ メイン領域に見出し「プロジェクト」「ルーティン」「ゴミ箱」「設定」がそれぞれ表示される
   (既存 e2e/sidebar-nav.spec.ts が green のまま維持されることで満たす)
```

```
シナリオ AC-2: 4 view のルート要素に view ルートクラスが付与されている
  Given /settings /trash /routines /projects をそれぞれ開いた
  When  各ページの <main> 要素を観察する
  Then  class にそれぞれ "settings-view" "trash-view" "routines-view" "projects-view" を含む
```

```
シナリオ AC-3: 4 view の H1 タイポグラフィが tomorrow-view と一致する
  Given /tomorrow を開き, <h1> の computed style (font-size) を記録した
  When  /settings /trash /routines /projects をそれぞれ開き, 各 <h1> の computed style を取得する
  Then  4 view すべての <h1> の font-size が /tomorrow の <h1> と同値 (24px) である
```

```
シナリオ AC-4: フォームブロックが角丸枠で表示される
  Given /projects /routines /settings をそれぞれ開いた
  When  プロジェクト作成フォーム (aria-label="プロジェクト作成フォーム") /
        ルーティン作成フォーム (aria-label="ルーティン作成フォーム") /
        設定フォーム (aria-label="設定フォーム") の computed style を取得する
  Then  各フォームの border-radius が 12px, border が 1px solid である
   かつ /tomorrow の起票フォームの border-radius と同値である
```

```
シナリオ AC-5: リスト項目が角丸カードで表示される
  Given ゴミ箱にタスクが 1 件以上 / ルーティンが 1 件以上 / プロジェクトが 1 件以上 存在する
  When  /trash /routines /projects の各リスト項目 (li) の computed style を取得する
  Then  各 li の border-radius が 12px, border が 1px solid である
   かつ 親の ul に list-style によるマーカーが表示されない (list-style-type: none)
```

```
シナリオ AC-6: trash-view のヘッダに H1 と「ゴミ箱を空にする」が同居する
  Given /trash を開いた
  When  ページの header 要素を観察する
  Then  header 内に見出し「ゴミ箱」と button「ゴミ箱を空にする」の両方が存在する
   かつ 「ゴミ箱を空にする」クリックでゴミ箱が空になる (既存挙動の維持)
```

```
シナリオ AC-7: 空状態テキストのスタイルが統一されている
  Given ゴミ箱が空の状態で /trash を開いた
  When  「ゴミ箱は空です」のテキスト要素の computed style を取得する
  Then  text-align が center, color が rgb(89, 89, 89) (#595959) である
```

```
シナリオ AC-8: 機能差分なし — 4 view の既存 CRUD 操作が変わらず動く
  Given /settings /trash /routines /projects がレンダリング可能
  When  既存 E2E (settings.spec.ts / trash.spec.ts / routines.spec.ts / projects.spec.ts /
        boundary-time.spec.ts / conflict-handling.spec.ts ほか全 spec) を実行する
  Then  全て green である (本 BL の変更でセレクタ修正を要しない)
   かつ 既存の単体テスト (web/src/ 配下) も全て green である
```

```
シナリオ AC-9: アクセシビリティ違反 0 件を維持する
  Given /today /focus /tomorrow /projects /trash /routines /settings がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts)
  Then  すべてのスキャンで violations.length === 0
```

```
シナリオ AC-10: BL-046 への引き継ぎマーカーが揃っている
  Given 本 BL の実装がマージされた
  When  `grep -rn "TODO(BL-046)" web/src/ui/settings-view web/src/ui/trash-view web/src/ui/routines-view web/src/ui/projects-view` を実行する
  Then  新規 CSS の全ての暫定値 (色 / サイズ / 余白 / 角丸) にマーカーが付いており, 1 件以上ヒットする
```

## 重要な決定 (D 章)

- **D-001 (ルート要素は `<main>` を維持)**: 4 view の `<main>` ルートはそのまま残し, className 付与のみ行う. `<section>` 化 (tomorrow / focus 方式) はランドマーク構造の変更であり, 既存テスト・スクリーンリーダー挙動への影響に対して本 BL のリターンがない. 全 view のランドマーク統一は U-2 として持ち越す.
- **D-002 (スタイル参照基準は tomorrow-view.css / focus-view.css の暫定値)**: backlog の「モックの今日ビューと揃える」は, モック由来の慣行が実装済みの tomorrow-view.css (H1 24px / 枠 #ccc / 角丸 12px / 余白 16px・8px / 補足 14px #666 / 空状態 #595959) を正とする. today-view 自体は未スタイルのため基準にできない.
- **D-003 (セカンダリナビ「プロジェクト」リンクは維持)**: ui-sidebar-nav U-005 の再検討. BL-044 で今日ビューに「＋プロジェクトの追加」が付いたが, 名称変更 / 削除の経路は `/projects` のみであり, リンクを外すと該当機能へ到達できなくなる. よって維持で確定.
- **D-004 (CRUD UI は現状維持)**: ui-redesign-foundation U-010 の保守側デフォルト案を採用. routines の優先度 `<select>` / インライン名称変更フォーム / 各ボタン文言は変えない.
- **D-005 (ルーティング変更なし)**: BL-036 で 4 view は AppShell 配下に配置済み (本 spec §「背景」の確認表). `main.tsx` は無改修.
- **D-006 (trash のヘッダ化)**: 「ゴミ箱を空にする」は view 全体への操作であり, カード上の操作ではない. today-view の `<header>` 右上ボタン (＋プロジェクトの追加) と同じ位置づけに揃える. ボタンの名称・挙動は不変のため機能差分なしの原則に反しない.

## 未決事項 / 確認待ち

- **U-1 (settings の各セクションをブロック化する粒度)**: settings-view は「境界時刻フォーム」「サーバ接続設定」「モード切替」の 3 ブロックを持つが, 後二者は Android ネイティブ時のみ表示される. Web 向け E2E では境界時刻フォームのみ検証可能なため, 受け入れ基準 (AC-4) は境界時刻フォームを対象にし, ネイティブ専用セクションは同じクラス設計を適用するだけ (検証は単体テストに委ねる) とする. 異論があれば plan で再検討.
- **U-2 (全 view のランドマーク構造統一)**: 現状 today + 補助 4 view = `<main>` ルート, focus / tomorrow = `<section>` ルート (AppShell 側は `<div class="app-shell__main">`). ページによって main ランドマークが有ったり無かったりする不整合は本 BL では解消しない. BL-046 または別 BL で「AppShell 側を `<main>` にし全 view を `<section>` 化する」案を検討する.
- **U-3 (h2 の暫定値 20px)**: tomorrow-view / focus-view に h2 の前例がないため, 本 BL で 20px (h1=24px と body=16px の中間) を暫定採用する. BL-046 の `--font-size-h2` 確定時に再調整される前提.
