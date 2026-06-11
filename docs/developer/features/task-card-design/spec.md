# 仕様: タスクカードのデザイン統一 (縁・余白・角丸) (task-card-design)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-052
  - 依存 BL: BL-051 (unified-day-view)
  - 関連 feature:
    - [`../unified-day-view/spec.md`](../unified-day-view/spec.md) — 本 BL の前提となる構造整理と `day-view__` クラス体系
    - [`../design-tokens/`](../design-tokens/) (BL-046) — 本 BL が参照する `--color-bg` / `--color-border` / `--radius-md` / `--radius-lg` / `--space-md` / `--space-lg`
    - [`../focus-view/`](../focus-view/) (BL-037) — 単独大表示用の `.focus-view__card` (本 BL の対象外)
  - 上位要件: NFR-010 (最小手数 / 一貫した UI)

## 背景 / 課題

BL-051 (unified-day-view) によって today/tomorrow の HTML 構造とクラス体系は `day-view__` 名前空間に統一されたが, `web/src/ui/day-view/day-view.css` には構造系プロパティ (display / flex / gap / list-style) のみが定義されており, 各カードに **border / radius / padding / background** などの visual な詳細はまだ無い. その結果, 現状の `/today` と `/tomorrow` のタスクは「縁の無い素のテキスト行」として描画されており, user 指摘の通り「カードっぽくない」状態である.

### user 指摘 (要約)

- 「タスクカードがカードっぽくない (縁が必要)」
- 「影あればカードっぽいというのはだめ. カードは少なくとも縁が必要」

### 方針の核

本 BL は **border をベースとしたカード意匠** を `.day-view__card` および `.day-view__card--focus` に与える. shadow は使わない (user 明言). 縁が「カードの本体」であり, 影は本 BL の対象外とする.

「現在のタスク」用の `.day-view__card--focus` は通常カードよりも縁を太く (`border-width: 2px`), radius を大きく (`var(--radius-lg)`), padding を広く (`var(--space-lg)`) して**強調**する.

## ゴール / 非ゴール

### ゴール

- **G-1 (通常カードの可視化)**: `/today` と `/tomorrow` の各タスク (= `.day-view__card`) が border / radius / padding / background を備えたカードとして視覚的に識別できる.
- **G-2 (強調カードの差別化)**: today の「現在のタスク」セクション (= `.day-view__card .day-view__card--focus`) が, 通常カードよりも太い border と大きな radius / padding によって**明確に強調**された状態で表示される.
- **G-3 (トークン参照のみで完結)**: 本 BL では `web/src/styles/tokens.css` を**変更しない**. 既存トークン (`--color-bg` / `--color-border` / `--radius-md` / `--radius-lg` / `--space-md` / `--space-lg`) のみで構成する.
- **G-4 (差分の局所化)**: 変更は `web/src/ui/day-view/day-view.css` の 1 ファイルへの追記のみに閉じる. JSX (today-view.tsx / tomorrow-view.tsx) は無改修. 旧クラスの追加・削除も発生しない.
- **G-5 (既存テスト全件 green)**: BL-051 で確定した DOM 構造 / aria-label / role / accessibleName は無変更. 既存単体テスト・E2E は無修正で通る.

### 非ゴール

- **focus-view (`/focus`) の visual 変更**: focus-view は単独大表示で `.focus-view__card` を使うため**対象外**. 本 BL では一切触らない.
- **tokens.css への新規トークン追加**: 既存トークンで十分であることが確認済み (user 合意). 本 BL で `--shadow-*` 等の新規トークンを追加しない.
- **`.day-view__form` / `.day-view__list` / `.day-view__header` / `.day-view__empty` の visual 変更**: 本 BL の対象は `.day-view__card` と `.day-view__card--focus` の 2 セレクタのみ. 起票フォーム枠や空状態テキストの再装飾はスコープ外 (必要であれば後続 BL).
- **hover 効果 / transition / animation**: 本 BL では追加しない. 静的な border / radius / padding / background のみ.
- **box-shadow (影)**: user は明示的に「shadow は脇役, border が主役」と表明済み. 本 BL では shadow を一切追加しない. 後続の磨き込み BL で検討する余地は残す.
- **タスクカード内部の子要素配置の見直し**: `.day-view__card` の `display: flex / align-items: center / gap: var(--space-md)` (BL-051 で確定済み) はそのまま維持する. 本 BL では子要素の並び方には触れない.
- **起票フォームの入力要素 / 「現在のタスク」セクションのロジック / サーバ API / Repository / domain**: 一切無改修.
- **JSX (today-view.tsx / tomorrow-view.tsx) の変更**: BL-051 で `day-view__card` クラスはすでに付与済み. 本 BL では JSX を変更する必要はない.
- **起票フォームの border 復活 (旧 tomorrow-view.css 由来)**: BL-051 の P-001 で意図的に撤去された `.day-view__form` の border. 本 BL でも `.day-view__form` には touch しない. 必要があれば別 BL でフォロー.
- **新規 DOM 構造テストの追加**: DOM 構造は BL-051 で確定済み. 本 BL では DOM 構造のアサーションは追加しない. CSS 宣言の存在を検証する単体テストのみ追加する (詳細は plan).
- **E2E テストの追加**: visual は単体テストで CSS 宣言の存在を assert する形で担保する. 本 BL では E2E (Playwright) のテストを追加・改修しない.

## 要件

### 機能要件

- **REQ-1 (`.day-view__card` 通常カードの visual 定義)**

  `web/src/ui/day-view/day-view.css` の `.day-view__card` セレクタに以下の宣言を追加する:

  - `background: var(--color-bg)` (= `#fff`)
  - `border: 1px solid var(--color-border)` (= `#ccc`, 1px 縁が「カードの本体」)
  - `border-radius: var(--radius-md)` (= `12px`)
  - `padding: var(--space-md)` (= `16px`)

  既存の構造系宣言 (`display: flex` / `align-items: center` / `gap: var(--space-md)`) は維持する.

- **REQ-2 (`.day-view__card--focus` 強調 variant の visual 定義)**

  同 CSS の `.day-view__card--focus` セレクタに以下の宣言を追加する:

  - `border-width: 2px` (通常 1px を上書きして太くする)
  - `border-radius: var(--radius-lg)` (= `16px`, 通常 `--radius-md` より大きい)
  - `padding: var(--space-lg)` (= `24px`, 通常 `--space-md` より広い)

  `border-color` (= `var(--color-border)`) と `background` (= `var(--color-bg)`) は通常カードと同じ. 別途宣言を書く必要はない (= `.day-view__card` の宣言を継承する. CSS で `.day-view__card .day-view__card--focus` のような上書きは行わない).

- **REQ-3 (対象クラスの限定)**

  本 BL で `web/src/ui/day-view/day-view.css` に追加する宣言は REQ-1 / REQ-2 の 2 セレクタ分のみとする. 他のセレクタ (`.day-view` / `.day-view__header` / `.day-view__header h1` / `.day-view__form` / `.day-view__list` / `.day-view__empty`) には**触れない**.

- **REQ-4 (JSX 無改修)**

  `web/src/ui/today-view/today-view.tsx` および `web/src/ui/tomorrow-view/tomorrow-view.tsx` の JSX は無改修. BL-051 ですでに `day-view__card` / `day-view__card--focus` クラスが付与済みであるため, CSS 追記のみで両ビューに反映される.

- **REQ-5 (tokens.css 無改修)**

  `web/src/styles/tokens.css` には何も追加・変更しない. 既存トークンのみで完結する.

### 非機能要件

- **NFR-NO-NEW-TOKENS**: 本 BL では tokens.css を変更しない. 既存トークンのみで構成する.
- **NFR-NO-SHADOW**: 本 BL では `box-shadow` 宣言を追加しない (user 明言).
- **NFR-NO-DOM-CHANGE**: BL-051 で確定した DOM 構造 / aria-label / role / accessibleName は無変更. 既存単体テスト・E2E は無修正で通る.
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する. 本 BL の差分は CSS のみで, ランドマーク / 見出し / aria 属性に影響しない.
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.
- **NFR-CONTRAST**: `var(--color-bg)` (= `#fff`) / `var(--color-fg)` (= `#1a1a1a`) / `var(--color-border)` (= `#ccc`) の組み合わせはすでに BL-046 で WCAG AA を確認済みのトークン. 本 BL で新規にコントラスト破綻を引き起こさない.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: 通常カード (.day-view__card) に縁・背景・角丸・余白が定義されている
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__card セレクタのルール本文を観察する
  Then  background プロパティに var(--color-bg) を参照する宣言を含む
   かつ border プロパティに 1px solid var(--color-border) を参照する宣言を含む
   かつ border-radius プロパティに var(--radius-md) を参照する宣言を含む
   かつ padding プロパティに var(--space-md) を参照する宣言を含む
   かつ 既存の display: flex / align-items: center / gap: var(--space-md) の宣言が残っている
```

```
シナリオ AC-2: 強調カード (.day-view__card--focus) は縁が太く radius と padding が大きい
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__card--focus セレクタのルール本文を観察する
  Then  border-width プロパティに 2px を参照する宣言を含む
   かつ border-radius プロパティに var(--radius-lg) を参照する宣言を含む
   かつ padding プロパティに var(--space-lg) を参照する宣言を含む
```

```
シナリオ AC-3: 強調カードは border-color と background を別途宣言しない (通常カードを継承する)
  Given web/src/ui/day-view/day-view.css を開いた
  When  .day-view__card--focus セレクタのルール本文を観察する
  Then  border-color プロパティを単独で宣言していない
   かつ background プロパティを単独で宣言していない
   (= .day-view__card の border-color / background の宣言をそのまま継承して使う)
```

```
シナリオ AC-4: 本 BL で box-shadow 宣言を追加していない
  Given web/src/ui/day-view/day-view.css を開いた
  When  ファイル全体を観察する
  Then  box-shadow キーワードを含む宣言が存在しない
```

```
シナリオ AC-5: tokens.css を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/styles/tokens.css を BL-051 完了時点の状態と比較する
  Then  差分が無い (新規トークンの追加・既存トークンの変更が無い)
```

```
シナリオ AC-6: JSX (today-view.tsx / tomorrow-view.tsx) を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/ui/today-view/today-view.tsx と web/src/ui/tomorrow-view/tomorrow-view.tsx を BL-051 完了時点の状態と比較する
  Then  差分が無い (BL-052 では JSX を変更しない)
```

```
シナリオ AC-7: 本 BL の対象セレクタは .day-view__card と .day-view__card--focus に限定されている
  Given 本 BL の実装がマージされた
  When  web/src/ui/day-view/day-view.css の他セレクタ (.day-view / .day-view__header / .day-view__header h1 / .day-view__form / .day-view__list / .day-view__empty) のルール本文を観察する
  Then  BL-051 完了時点と同じ宣言のままで, 本 BL での追記が無い
```

```
シナリオ AC-8: focus-view (/focus) の CSS を変更していない
  Given 本 BL の実装がマージされた
  When  web/src/ui/focus-view/focus-view.css を BL-051 完了時点の状態と比較する
  Then  差分が無い (focus-view は本 BL の対象外)
```

```
シナリオ AC-9: 既存テスト全件 green 維持
  Given /today と /tomorrow が引き続きレンダリング可能
  When  既存単体テスト (web/__tests__/today-view.test.tsx, tomorrow-view.test.tsx, unified-day-view.test.tsx 等) と既存 E2E を実行する
  Then  すべて green である (本 BL の差分は CSS のみで DOM / aria / role を変えていない)
```

```
シナリオ AC-10: アクセシビリティ違反 0 件を維持する
  Given /today /tomorrow をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
```

## 重要な決定 (D 章)

- **D-001 (border 主役 / shadow 不採用)**: user は明示的に「カードは少なくとも縁が必要」「影あればカードっぽいというのはだめ」と表明済み. 本 BL ではカードらしさを **border** で表現し, `box-shadow` は一切追加しない. 後続の磨き込み BL でフォローの余地はあるが, 本 BL の境界線は厳密に保つ.
- **D-002 (強調は border-width + radius + padding の 3 点強化)**: `.day-view__card--focus` の強調手段として「border-color を変える」「accent 系の塗りつぶしにする」等の選択肢もあるが, user 合意は「縁を太く / radius を大きく / padding を広く」の 3 点強化. これにより通常カードと連続感のある visual を保ちつつ「ひと回り大きい・明確なカード」として知覚される.
- **D-003 (border-color と background は通常カードを継承)**: `.day-view__card--focus` には `border-color` / `background` を改めて書かない. `.day-view__card .day-view__card--focus` のように両方のクラスが当たる前提で, `.day-view__card` の宣言を継承する設計とする. CSS 上の宣言重複を避け, 「強調は『大きさ・太さ』の話, 色・塗りは通常と同じ」という意図を明示する.
- **D-004 (新規トークンを追加しない)**: 既存トークンのみで visual 要件 (REQ-1 / REQ-2) が満たされることを確認済み. tokens.css に touch しないことで, デザイントークン定義 (BL-046) の安定性を守る.
- **D-005 (JSX 無改修)**: BL-051 ですでに必要なクラスが付与済みであるため, 本 BL の差分は CSS 1 ファイルのみに閉じる. これによりレビュー粒度が最小化される.
- **D-006 (focus-view 不変更)**: focus-view (`/focus`) は単独大表示で `.focus-view__card` を使う. day-view の `.day-view__card--focus` (= 今日ビュー内の「現在のタスク」セクション) と focus-view (`/focus` の単独ページ) は**別概念**. 本 BL では focus-view CSS には触れない.
- **D-007 (テストは CSS 宣言の存在 assert で担保)**: DOM 構造は BL-051 で確定済みのため, 本 BL では DOM ベースの新規テストは不要. 代わりに `web/__tests__/task-card-design.test.ts` (or 等価名) を新設し, CSS ファイルを直接 `readFileSync` で読み込み, 指定セレクタブロック内に期待する宣言 (border / radius / padding / background / border-width 等) が含まれることを正規表現または部分一致で assert する. これは BL-046 (`web/__tests__/design-tokens.test.ts`) で確立した検証スタイルの踏襲である.

## 未決事項 / 確認待ち

- なし (user との合意は方針セクションで確定済み. 実装値・対象セレクタ・対象外の境界線・shadow 取扱・トークン追加可否はすべて確定).
