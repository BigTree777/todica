# 仕様: ハンバーガーボタンと h1 タイトルの重なり修正

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-053
- 依存: BL-049 (`features/hamburger-nav/`) のフォローアップ

## 背景 / 課題

BL-049 で AppShell の幅 200px 固定サイドバーを廃止し,
viewport 左上に固定表示するハンバーガーボタン (`.app-shell__hamburger`) に置き換えた.
ハンバーガーボタンは `position: fixed; top: var(--space-sm); left: var(--space-sm)` で
配置され, `padding: var(--space-xs); font-size: var(--font-size-h2)` から
実寸はおよそ 28〜36px 四方となる (top/left 8px + content 約 20px + padding 4px×2).

一方 `.app-shell__main` には `padding: var(--space-md)` (= 16px) のみが指定されており,
配下の各 view (`/focus`, `/today`, `/tomorrow`, `/projects`, `/routines`, `/trash`, `/settings`)
の `<h1>` は viewport 座標 (16, 16) 付近から描画される.
結果としてハンバーガーボタンと h1 タイトルの矩形が完全に重なって表示され,
ユーザーから「ハンバーガーメニューとタイトルが被っています」との報告を受けた.

本 BL では `.app-shell__main` の上端 padding を増やし,
ハンバーガーボタンの下に各 view の content が来るようにして重なりを解消する.

## ゴール / 非ゴール

- ゴール:
  - AppShell 配下の全 view (`/focus`, `/today`, `/tomorrow`, `/projects`, `/routines`, `/trash`, `/settings`)
    で `<h1>` とハンバーガーボタンが視覚的に重ならないようにする.
  - ハンバーガーボタンが引き続き全画面でクリック可能であることを維持する.
  - BL-049 (`features/hamburger-nav/`) の既存テスト (単体 / E2E) を一切回帰させない.
- 非ゴール:
  - ハンバーガーボタンの位置・サイズ・スタイルの変更.
  - 各 view の `<h1>` スタイル・構造の変更.
  - 各 view (`day-view`, `focus-view`, `projects-view`, `routines-view`, `trash-view`, `settings-view`) の tsx / css 編集.
  - AppShell の JSX 構造 (`app-shell.tsx`) の変更.
  - `tokens.css` への新規トークン追加.
  - `/setup` への適用 (BL-036 D-002 により AppShell の外であり対象外).

## 要件

- 機能要件:
  - REQ-1: `.app-shell__main` の `padding-top` を, ハンバーガーボタンの下端 (約 36px) より大きくする.
    具体値は `calc(var(--space-md) + var(--space-xl))` (= 16 + 32 = 48px) とする.
  - REQ-2: `.app-shell__main` の `padding-right` / `padding-bottom` / `padding-left` は
    既存値 `var(--space-md)` (= 16px) を維持する.
  - REQ-3: 修正対象は `web/src/ui/app-shell/app-shell.css` の `.app-shell__main` ルールのみとする.
- 非機能要件:
  - REQ-4: 採用案は **案 A (シンプル案: padding-top 増分)** とする. 案 B (各 view header への構造統合) は採用しない.
  - REQ-5: 既存トークン (`--space-md`, `--space-xl`) のみを使用し, 新規トークン追加・直接の px 値記述は行わない.
  - REQ-6: ハンバーガーボタンのスタイル (`.app-shell__hamburger`) は一切変更しない.
  - REQ-7: 案 A の副作用として viewport 上部に空白帯ができることを許容する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

### AC-1: `.app-shell__main` の padding-top がハンバーガーの実寸より大きい

```
シナリオ: app-shell.css の .app-shell__main ルールが上端余白を確保している
  Given web/src/ui/app-shell/app-shell.css を読み込む
  When  .app-shell__main セレクタの宣言ブロックを抽出する
  Then  padding-top プロパティ (または padding ショートハンドの上端値) として
        calc(var(--space-md) + var(--space-xl)) が指定されている
  And   その算出値は 36px より大きい (16 + 32 = 48px ≥ 37px)
```

### AC-2: padding の左右下は既存値を維持する

```
シナリオ: 上端以外の余白が既存仕様から変わらない
  Given web/src/ui/app-shell/app-shell.css を読み込む
  When  .app-shell__main セレクタの宣言ブロックを抽出する
  Then  padding-right / padding-bottom / padding-left が var(--space-md) のままである
        (ショートハンドの場合は左右下に相当する値が var(--space-md) であること)
```

### AC-3: 既存トークンのみで構成されている

```
シナリオ: 新規トークン・直接の px 値が混入していない
  Given web/src/ui/app-shell/app-shell.css の .app-shell__main ルールを読み込む
  When  padding 系プロパティの値を確認する
  Then  値はすべて var(--space-*) 形式または calc(...) で組み立てられた既存トークン参照である
  And   生の px 値リテラル (例: 48px) は含まれない
```

### AC-4: ハンバーガーボタンのスタイルが変更されていない

```
シナリオ: .app-shell__hamburger ルールが BL-049 確定仕様から変化していない
  Given web/src/ui/app-shell/app-shell.css を読み込む
  When  .app-shell__hamburger セレクタの宣言ブロックを抽出する
  Then  position: fixed が維持されている
  And   top: var(--space-sm) / left: var(--space-sm) が維持されている
  And   z-index: 200 が維持されている
```

### AC-5: AppShell 配下の全 view で h1 とハンバーガーボタンが重ならない (E2E)

```
シナリオ: /focus, /today, /tomorrow, /projects, /routines, /trash, /settings の各画面で
          h1 とハンバーガーボタンが視覚的に重ならない
  Given アプリが起動している
  When  対象画面を順に開き, それぞれで h1 とハンバーガーボタンのバウンディングボックスを取得する
  Then  ハンバーガーボタンの bottom 座標が h1 の top 座標より小さい
        (= ハンバーガーボタンが h1 より完全に上にある)
  And   ハンバーガーボタンと h1 の矩形が交差していない
```

### AC-6: ハンバーガーボタンが引き続きクリック可能 (回帰防止)

```
シナリオ: BL-049 の AC-2 が引き続き成立する
  Given /today を開いている
  When  ハンバーガーボタン (aria-label="メニューを開く") をクリックする
  Then  オーバーレイメニューが開く
  And   ボタンの aria-expanded="true" に変わる
```

### AC-7: 単体テスト・E2E テストの全件 green

```
シナリオ: 既存テストを一切回帰させない
  Given 本 BL の変更を適用した状態
  When  npm test と npx playwright test を実行する
  Then  全件が pass (またはスキップ) する
  And   特に BL-049 (`features/hamburger-nav/`) の AC-1〜AC-9 を覆う既存テストが回帰しない
```

## 採用案

- **案 A (シンプル案)** を採用する.
  - 根拠 (REQ-4):
    - BL-049 のアーキテクチャ (AppShell が hamburger を独立に持つ presentational コンポーネント) を維持できる.
    - 各 view (`day-view`, `focus-view`, `projects-view`, `routines-view`, `trash-view`, `settings-view`)
      を一切触らずに済む.
    - BL-049 の単体 / E2E テストがそのまま green を維持できる.
    - 改修工数が最小 (CSS 1 行追加).
- 案 B (各 view header に hamburger を構造統合) は不採用とする.
  - 理由: AppShell の責務が薄まり, 各 view が hamburger を意識する必要が生じる.
    `focus-view` 等 `day-view` 系でない view への適用方法を別途設計する必要があり,
    BL-049 のテストにも影響が及ぶため工数が見合わない.

## 関連既存リグレッションとの関係

- BL-050 の備考に記載された「BL-049 由来の Playwright リグレッション」
  (`sidebar-nav`, `focus-view`, `tomorrow-view`, `set-focus-gesture` 系の spec が
   ナビゲーション操作前にハンバーガーメニューを開くステップを持たず, リンクが viewport 外で click 失敗する問題)
  は本 BL の対象外とする.
  - 本 BL は `.app-shell__main` の余白調整のみを対象とし, 各 spec の E2E 操作手順は変更しない.
  - 当該リグレッションは別 BL で扱う.
- 本 BL の E2E (AC-5) は新規 spec として追加し,
  ナビゲーションは「ハンバーガーボタンを開く → リンクをクリック → メニューが閉じる」の正しい手順で記述する.

## 未決事項 / 確認待ち

- なし (確定事項として進める).
