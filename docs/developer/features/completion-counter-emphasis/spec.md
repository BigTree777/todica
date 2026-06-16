# 仕様: 完了タスク数カウンタの中央配置 + アクセント色強調

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-105
- 依存: BL-008 (`features/completion-counter/` / 実装本体) / BL-047 (`features/completion-counter-placement/` / header 内配置) / BL-102 (priority-stars amber-700 アクセント)
- 由来要件: FR-040 (今日の完了タスク数を表示)
- 関連 NFR: NFR-001 (単一ワークフロー強制) / NFR-010 (最小手数の起票)

## 背景 / 課題

today ビューの「今日の完了: N」カウンタは BL-047 で `<header className="day-view__header">` の
内側、`<h1>今日</h1>` の右側に並列配置され、`.today-view__completion-count` ルールで
`font-size: var(--font-size-small)` + `color: var(--color-fg-subtle)` (`#595959`) として
控えめに表示されている (`web/src/ui/today-view/today-view.css`)。

これは「ヘッダの脇に補足情報を添える」配置として静かではあるが、本機能の本来の目的である
「今日達成したタスクをユーザーに認識させ達成感を提供する」観点では訴求が弱い。
カウンタを「今日の主要な達成指標」として一目で読める位置・サイズ・色で提示する必要がある。

ただし以下の制約は維持しなければならない。

- カウンタの取得経路 (`repository.today()` の `completionCount`) と aria-label
  (`今日の完了タスク数`) は **無改修**。BL-008 / BL-047 の既存テスト群が依存している。
- `.day-view__header` は today / tomorrow の両ビューで共有される共通 CSS クラスである
  (`web/src/ui/day-view/day-view.css`)。projects-view / routines-view は当該クラスを使わない
  (= 影響対象外) が、tomorrow ビューには副作用を与えてはならない。
- ヘッダの直接の子要素は **`<h1>` と `<span>` の 2 要素のみ** という規約が、BL-050
  (remove-inline-project-create) と BL-051 (unified-day-view) の単体 / E2E テストで
  既に固定されている。本 BL の「2 段構造化」はこの 2 要素を CSS で縦に並べる手段で行い、
  子要素数を 3 以上に増やしてはならない。

## ゴール / 非ゴール

### ゴール

- today ビューの `<header className="day-view__header">` 内に置かれた
  `<span className="today-view__completion-count">今日の完了: N</span>` を、
  `<h1>今日</h1>` の **下段** に独立した行として配置する (2 段構造)。
- カウンタ要素を **水平方向中央揃え**・**`var(--font-size-h2)` (= 20px)** サイズ・
  **`var(--color-accent)` (= amber-700 / `#b45309`)** で強調表示する。
  この amber-700 は BL-102 で priority-stars の点灯星に既に採用されている同一トークン。
- tomorrow ビューの header (= 同じ `.day-view__header` クラスを共有) には何の視覚変化も
  与えない。projects-view / routines-view は元々 `.day-view__header` を使わないため影響なし。
- BL-008 / BL-047 / BL-050 / BL-051 の既存単体 / E2E テスト群が **全件 green を維持** する。

### 非ゴール

- **カウンタの取得経路 / API / ドメイン変更**: `completionCount` は `repository.today()` から
  取得される既存値をそのまま使う。サーバ API、ドメイン、Repository には一切触れない。
- **`aria-label` / DOM タグ / マークアップ構造の変更**: BL-047 で確定した
  `<span aria-label="今日の完了タスク数">今日の完了: {N}</span>` のマークアップは維持する。
  header の直接の子要素は `<h1>` と `<span>` の 2 要素のままで、3 要素以上に増やさない
  (BL-050 / BL-051 のテスト群が固定している規約)。
- **tokens.css の新規トークン追加**: `--font-size-h2` / `--color-accent` は既存トークン。
  新トークンを増やさない (NFR-NO-NEW-TOKENS / BL-046 方針の踏襲)。
- **tomorrow / projects / routines / focus / settings ビューへの波及**: 視覚変化は today
  ビューのみで生じる。他ビューの header / カウンタ表示 (元々存在しない) には一切触れない。
- **カウンタの ON/OFF 設定**: NFR-012 (設定項目最小化) に反するため提供しない。
- **「今日の完了: N」以外の文言変更**: BL-008 のテストが文言を検証しているため変更しない。

## 要件

### 機能要件

- **REQ-1 配置 (2 段構造)**: today ビューの `<header className="day-view__header">` 内で、
  `<h1>今日</h1>` を 1 段目、`<span className="today-view__completion-count">今日の完了: N</span>`
  を 2 段目に表示する。**header の直接の子要素数は 2 のまま**、CSS で縦並びレイアウトを実現する。

- **REQ-2 中央配置**: カウンタ要素は 2 段目の行内で水平方向中央 (`text-align: center`) に
  配置する。1 段目の `<h1>今日</h1>` の配置・揃え方は変更しない。

- **REQ-3 フォントサイズ**: `.today-view__completion-count` の `font-size` は
  `var(--font-size-h2)` (= 20px) を参照する。
  (本 BL の前: `var(--font-size-small)` = 14px)

- **REQ-4 色**: `.today-view__completion-count` の `color` は `var(--color-accent)`
  (= amber-700 / `#b45309`) を参照する。BL-102 で priority-stars の点灯星に採用された
  同一トークンを使うことで「達成 / アクティブな指標」の視覚言語と統一する。
  (本 BL の前: `var(--color-fg-subtle)` = `#595959`)

- **REQ-5 共通 CSS への非破壊**: 共通 CSS の `.day-view__header` ルール本体 (= today /
  tomorrow が共有) のレイアウト宣言を today 専用要件のために変更しない。today 専用の
  2 段化は **today 専用 modifier `.day-view__header--today`** を `today-view.css` 内に
  定義して today-view.tsx の header にのみ付与する形で実現する。tomorrow ビューの
  header (modifier 非付与) は従来通り 1 段の flex layout を維持する。

- **REQ-6 マークアップ / 識別子の維持**: カウンタ要素は `<span>` タグのまま、
  `aria-label="今日の完了タスク数"` と `className="today-view__completion-count"` を維持する。
  ヘッダ要素は `<header className="day-view__header day-view__header--today">` のように
  既存 `day-view__header` クラスを保ったまま modifier を **追加** する。
  (`day-view__header` クラスは BL-051 の AC-2 / BL-050 の AC-1 テストが固定している。)

### 非機能要件

- **NFR-001 (単一ワークフロー) との整合**: カウンタは引き続き参照専用。補正 UI / 設定 UI は
  追加しない。
- **NFR-010 (最小手数の起票) との整合**: ヘッダの 2 段化により vertical な領域が増えるが、
  起票フォーム本体は変わらず + ボタン → モーダル展開のワークフローに変更はない。
- **既存テスト互換性**: 以下の既存テストが green を維持すること。
  - BL-008: `today-view.test.tsx` の `describe("TodayView (BL-008 今日の完了数表示)")`
    全シナリオ。
  - BL-047: `today-view.test.tsx` の `describe("TodayView (BL-047 完了タスク数カウンタの配置見直し)")`
    全シナリオ (header 内配置 / `<span>` タグ / focus & tomorrow 非波及)。
  - BL-050: `today-view.test.tsx` の `describe("TodayView (BL-050 ...)")` の
    「ヘッダの直接の子要素は h1 と カウンタ <span> の 2 要素のみ」テストおよび E2E
    `e2e/remove-inline-project-create.spec.ts` の `childCount === 2` 検証。
  - BL-051: `unified-day-view.test.tsx` の
    「/today 1 段目に `<header class='day-view__header'>` があり, h1 と
    today-view__completion-count を含む」「/tomorrow は today-view__completion-count を
    含まない」両ケース、および day-view.css に `.day-view__header` セレクタが残存して
    いることの assertion。
  - E2E: `e2e/state-restoration.spec.ts` の「今日の完了: N」テキスト復元検証。
- **tomorrow ビューへの非波及**: tomorrow-view 単体テスト
  (`tomorrow-view.test.tsx` / `unified-day-view.test.tsx` の tomorrow 系シナリオ) が
  header の見た目に依存している場合に green を維持する。
- **アクセシビリティ (WCAG)**: `var(--color-accent)` (`#b45309`) は `--color-bg` (`#fff`)
  に対し WCAG AA 5.94:1 を満たす (tokens.css コメントに記載済み)。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

### 配置 (REQ-1 / REQ-5 / REQ-6)

```
シナリオ: today header に今日専用の modifier クラスが付与されている
  Given ユーザーが今日ビュー（/today）を開いた
  When  ページを描画した
  Then  最初の <header> 要素は class に "day-view__header" を含む
  And   同じ <header> 要素は class に "day-view__header--today" を含む
```

```
シナリオ: today header の直接の子は h1 と カウンタ <span> の 2 要素のままである
  Given ユーザーが今日ビュー（/today）を開いた
  When  最初の <header> 要素の直接の子を観察する
  Then  子要素数は 2 である
  And   1 要素目は <h1> 要素でテキスト「今日」を含む
  And   2 要素目は <span> 要素で aria-label="今日の完了タスク数" を持つ
```

```
シナリオ: tomorrow header には today 専用 modifier が付かない
  Given ユーザーが明日のタスクビュー（/tomorrow）を開いた
  When  最初の <header> 要素を観察する
  Then  class に "day-view__header" を含む
  And   class に "day-view__header--today" を **含まない**
```

### スタイル (REQ-2 / REQ-3 / REQ-4)

```
シナリオ: カウンタの CSS ルールが h2 サイズ / アクセント色 / 中央寄せを宣言する
  Given web/src/ui/today-view/today-view.css の .today-view__completion-count ルールを開く
  When  ルール本体を読む
  Then  font-size の値が var(--font-size-h2) である
  And   color の値が var(--color-accent) である
  And   text-align の値が center である
```

```
シナリオ: today 専用 header modifier が 2 段縦並びレイアウトを宣言する
  Given web/src/ui/today-view/today-view.css の .day-view__header--today ルールを開く
  When  ルール本体を読む
  Then  flex-direction の値が column である
  And   align-items の値が stretch ではなく, カウンタが中央寄せされる宣言になっている
        (= align-items: stretch / カウンタ側 text-align: center, あるいは align-items: center
        いずれでも可。spec としてはカウンタが中央に視覚的に揃うことを満たせばよい)
```

```
シナリオ: 共通 .day-view__header ルールは flex-direction を持たないか, row のままである
  Given web/src/ui/day-view/day-view.css の .day-view__header ルールを開く
  When  ルール本体を読む
  Then  ルール本体に flex-direction: column が **含まれない**
        (= tomorrow ビューの 1 段 layout を破壊しない)
```

### 既存規約の維持 (BL-008 / BL-047 / BL-050 / BL-051 互換)

```
シナリオ: カウンタの aria-label / マークアップ / 文言が維持される
  Given ユーザーが今日ビュー（/today）を開いた
  When  ページを描画した
  Then  aria-label="今日の完了タスク数" を持つ <span> 要素がちょうど 1 個存在する
  And   その textContent が「今日の完了: {N}」(N は 0 以上の整数) のパターンに一致する
  And   その要素は最初の <header> 要素の子孫である
```

```
シナリオ: 完了ボタンで完了すると完了数表示が +1 反映される (BL-008 互換)
  Given 今日ビューにタスク A が表示され, 「今日の完了: 0」と表示されている
  When  ユーザーが A の「完了」ボタンをクリックする
  Then  aria-label="今日の完了タスク数" を持つ要素が「今日の完了: 1」相当のテキストを含む
```

```
シナリオ: tomorrow / focus ビューにはカウンタが存在しない (BL-047 REQ-4 互換)
  Given ユーザーが /tomorrow または /focus を開いた
  When  ページを描画した
  Then  aria-label="今日の完了タスク数" を持つ要素がページ全体に存在しない
```

```
シナリオ: 既存テストスイートが全件 green である
  Given BL-105 の実装作業が完了した
  When  vitest 全件 (`npx vitest run`) と Playwright 全件 (`npm -w e2e test`) を実行する
  Then  全テストが green (失敗ゼロ) である
```

## 未決事項 / 確認待ち

- なし。
  - `.day-view__header` 共通ルールを破壊しない方針 (REQ-5) は backlog の「tomorrow / projects /
    routines の `.day-view__header` には影響させない方針」を採用して **確定**。
  - `.day-view__header--today` を modifier として導入する方針を **確定** (今日専用に派生)。
    `today-view.css` 内で完結させ、共通 `day-view.css` を変更しない。
