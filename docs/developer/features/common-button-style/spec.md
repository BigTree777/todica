# 仕様: 共通ボタンスタイル (common-button-style)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-067

## 背景 / 課題

現状, `web/src/ui/` 配下では `<button>` 要素が複数の view / component から直接記述されており, 統一的な見た目を担う共通スタイルが存在しない. 各 button は以下のいずれかの状態にある.

- 既定 (= ブラウザ UA スタイルそのまま, 例: `task-card`, `task-form-card`, `routine-card`, `routine-form-card`, `project-card`, `project-form-card`, `trash-view`, `settings-view`, `setup-view`, `pwa-update-banner`, `error-notification`, `conflict-dialog`).
- 専用 CSS で固有の visual を作り込んだもの (例: `priority-stars__star` = radiogroup 内の★/☆, `app-shell__hamburger` / `app-shell__menu-close` = グローバルメニュー操作の icon-only).
- 配置制御だけを持つ専用 className (例: `task-card__actions__delete` の `margin-right: auto`, `task-card__actions__complete` の `margin-left: auto`, BL-063 で確立した auto-margin パターン).

このため「全 button の見た目を 1 か所で揃える」「変更したいとき 1 ファイルで全体を変えられる」状態になっておらず, 今後の visual 統一作業 (例: 色変更・角丸調整・padding 調整) に対するコストが高い.

本 BL では `web/src/ui/` 配下の `<button>` のうち, 視覚言語を統一すべき「通常 button (テキストラベル付き)」に対して **`.button` 共通 CSS クラス** を新設し, 全該当 button に `className="button"` を付与する. 派生 variant (`.button--primary` / `.button--danger` / `.button--ghost`) を用意し用途で使い分ける. 一方で「視覚意図が完全に異なる特殊 button」(= radiogroup の星, icon-only のグローバル操作) は本 BL の対象外とし, 既存スタイルを維持する.

`<Button>` React component 化は採用しない (= 13 ファイル超の JSX を component に差し替えるコストと, JSX シグネチャ変更による既存テスト多数追従を回避. CSS class 付与なら JSX 構造はそのまま, 既存 role-based テストは無修正で通る).

## ゴール / 非ゴール

### ゴール

- `web/src/styles/button.css` に基底 `.button` クラスと派生 variant (`.button--primary` / `.button--danger` / `.button--ghost`) を新設する.
- 対象 button (= 影響範囲表で対象とした全 `<button>`) に `className="button"` (+ 必要なら variant) を付与する.
- 既存の配置制御 className (`task-card__actions__delete` / `task-card__actions__complete` などの auto-margin / `routine-card__submit` / `project-card__submit` などのレイアウト用) は維持し, 新規 `.button` クラスと**併記**する形を取る.
- 既存の `<button>` の機能 / `aria-label` / `type` / `onClick` / `disabled` 等の振る舞いは全て維持する.
- 全 view の単体テスト / E2E ツールテスト / a11y violations 0 件を維持する.

### 非ゴール

- `<Button>` React component の新設 (= class 付与のみで完結させる).
- `web/src/styles/tokens.css` の改修 (= 色 / spacing は既存トークンを引く. 新規トークンが必要なら別 BL).
- shadow / hover background / transition / animation / box-shadow の追加 (= NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION を遵守).
- `priority-stars__star` (radiogroup の★/☆) の置換. = visual 意図が完全に異なる (透明背景 / 色は `--color-accent` / `--color-fg-subtle` で表現 / 44x44px tap target) ため対象外.
- `app-shell__hamburger` / `app-shell__menu-close` (グローバルメニューの icon-only 操作) の置換. = グローバル layout 機能であり通常 button とは視覚意図が異なるため対象外.
- 既存の配置制御 className そのものの撤去 (= `task-card__actions__delete` の `margin-right: auto` 等は維持. これを `.button` 系に吸収すると button の "配置" が "見た目" と結合してしまう).
- variant の細分化追加 (= primary / danger / ghost の 3 種で全 button を分類する. 追加 variant が必要な場合は別 BL).

## 要件

### 機能要件

- REQ-1: `web/src/styles/button.css` を新設し, 基底 `.button` クラスを定義する.
- REQ-2: `.button` 基底の宣言群を以下に揃える (詳細値は plan で確定).
  - `appearance`, `box-sizing`, `border`, `border-radius`, `padding`, `font` 関連 (= font-family, font-size, line-height), `cursor: pointer`, `background`, `color`.
  - shadow / hover background / transition / animation を**含めない** (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
- REQ-3: 派生 variant として以下 3 種を新設する.
  - `.button--primary`: 主要アクション (例: 「追加」「保存」「接続する」「再読み込み」「サーバの値を採用」「変更を保存」「現在のタスクにする」「明日にする」「今日にする」「完了」). variant 配分の最終確定は plan の D 章.
  - `.button--danger`: 破壊的アクション (例: 「削除」「ゴミ箱を空にする」). variant 配分の最終確定は plan の D 章.
  - `.button--ghost`: 補助 / キャンセル / 取消相当 (例: 「キャンセル」「閉じる」「ローカルモードで使う」「クライアントの値で再送」「復元」「サーバモードへ切り替える」「ローカルモードへ切り替える」). variant 配分の最終確定は plan の D 章.
- REQ-4: variant が必要な button には `className="button button--<variant>"` の併記で付与する.
- REQ-5: 既存の配置制御 className (= 既存テストや CSS で参照されている `task-card__actions__delete` / `task-card__actions__complete` / `routine-card__actions__delete` / `routine-card__submit` / `project-card__actions__delete` / `project-card__submit`) は維持する. これらと `.button` を**併記**する形で `className="button button--danger task-card__actions__delete"` のように記述する.
- REQ-6: `web/src/main.tsx` から `web/src/styles/button.css` を import し, 全 view にグローバル CSS として届くようにする (= `tokens.css` と同じ取り扱い).
- REQ-7: 既存の view 専用 CSS (= 各 view / card の `.css`) の中で button の visual (= border / padding / radius / font-size / cursor / background / color) を直接上書きしている宣言があれば撤去する. 配置制御 (margin / justify-content / flex 関連) は維持する.
- REQ-8: 既存の `<button>` の `type`, `onClick`, `disabled`, `aria-label`, `ref`, それ以外の props は全て保持する (= className 変更以外の DOM 変更を行わない).
- REQ-9: 対象外 button (= 後述 `S-1` / `S-2` / `S-3`) には `.button` を**付与しない**.

### 非機能要件

- NFR-1: shadow / hover background / transition / animation を `.button` 系に追加しない (= NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
- NFR-2: `tokens.css` の改修を行わない (= 既存トークンの値で全 variant を表現する).
- NFR-3: `:focus-visible` outline は維持する (= 既存 `project-create-dialog button:focus-visible` の outline 宣言は対象外 / 別経路として扱う). `.button` 基底側で `:focus-visible` outline を明示的に設定するかは plan で確定する.
- NFR-4: 全 view の単体テスト / E2E ツールテスト / a11y violations 0 件を維持する.
- NFR-5: `web/src/styles/button.css` への新規追加以外で**新規 CSS ファイルを作成しない**.

## 影響範囲 (対象 / 対象外)

### 対象 (= `.button` を付与する)

`web/src/ui/` 配下の `<button>` を grep した結果に基づく実測リスト. backlog 行で挙げられた 13 ファイルとの差分も注記する.

| ファイル | button 出現 | 機能 (label / 用途) | 想定 variant |
| --- | --- | --- | --- |
| `web/src/ui/task-card/task-card.tsx` (1) | 削除 | 表示 task 削除 (破壊的) | `--danger` (+ 既存 `task-card__actions__delete` 併記) |
| `web/src/ui/task-card/task-card.tsx` (2) | 現在のタスクにする | focus 化 | `--primary` |
| `web/src/ui/task-card/task-card.tsx` (3) | 明日にする / 今日にする | due-date toggle | `--primary` |
| `web/src/ui/task-card/task-card.tsx` (4) | 完了 | 完了 (主要 action) | `--primary` (+ 既存 `task-card__actions__complete` 併記) |
| `web/src/ui/task-card/task-form-card.tsx` | 追加 | 起票 submit | `--primary` |
| `web/src/ui/project-card/project-card.tsx` | 削除 | 表示 project 削除 | `--danger` (+ 既存 `project-card__actions__delete` 併記) |
| `web/src/ui/project-card/project-form-card.tsx` | 追加 | 起票 submit | `--primary` (+ 既存 `project-card__submit` 併記) |
| `web/src/ui/routine-card/routine-card.tsx` | 削除 | 表示 routine 削除 | `--danger` (+ 既存 `routine-card__actions__delete` 併記) |
| `web/src/ui/routine-card/routine-form-card.tsx` | 追加 | 起票 submit | `--primary` (+ 既存 `routine-card__submit` 併記) |
| `web/src/ui/trash-view/trash-view.tsx` (1) | ゴミ箱を空にする | 全消し (破壊的) | `--danger` |
| `web/src/ui/trash-view/trash-view.tsx` (2) | 復元 | restore (補助) | `--ghost` |
| `web/src/ui/settings-view/settings-view.tsx` (1) | 保存 | 境界時刻 save | `--primary` |
| `web/src/ui/settings-view/settings-view.tsx` (2) | 変更を保存 | サーバ設定 save | `--primary` |
| `web/src/ui/settings-view/settings-view.tsx` (3) | サーバモードへ切り替える / ローカルモードへ切り替える | mode switch (補助) | `--ghost` |
| `web/src/ui/setup-view/setup-view.tsx` (1) | 接続する | 認証 submit | `--primary` |
| `web/src/ui/setup-view/setup-view.tsx` (2) | ローカルモードで使う | mode 選択 (補助) | `--ghost` |
| `web/src/ui/project-create-dialog/project-create-dialog.tsx` (1) | 追加 | 起票 submit | `--primary` |
| `web/src/ui/project-create-dialog/project-create-dialog.tsx` (2) | キャンセル | dialog 閉じ | `--ghost` |
| `web/src/ui/pwa-update-banner/pwa-update-banner.tsx` (1) | 再読み込み | 主要 action | `--primary` |
| `web/src/ui/pwa-update-banner/pwa-update-banner.tsx` (2) | 閉じる | banner 閉じ | `--ghost` |
| `web/src/ui/error-notification/error-notification.tsx` | × (`aria-label="通知を閉じる"`) | 通知閉じ. icon-only だが**通常 button として扱う** (= 視覚意図が `app-shell` 系の hamburger と異なり, banner 内の小さな閉じ操作). | `--ghost` (= 最終決定は plan D 章. icon-only でも `.button` 基底に乗せるか別扱いにするかをそこで確定) |
| `web/src/ui/conflict-dialog/conflict-dialog.tsx` (1) | サーバの値を採用 | 主要 action | `--primary` |
| `web/src/ui/conflict-dialog/conflict-dialog.tsx` (2) | クライアントの値で再送 | 補助 action | `--ghost` |

**ファイル件数 (本仕様対象): 13 ファイル**.

backlog 行で挙げられた 13 ファイル (`task-card`, `task-form-card`, `project-card`, `project-form-card`, `routines-view`, `trash-view`, `settings-view`, `setup-view`, `project-create-dialog`, `pwa-update-banner`, `error-notification`, `conflict-dialog`, `priority-stars`) との差分:

- **追加**: `routine-card` (BL-061 で新設) / `routine-form-card` (BL-061 で新設). 削除 button / 「追加」 submit button が存在する.
- **削除**: `routines-view` (BL-070 で routine 関連の button は `RoutineCard` / `RoutineFormCard` に移管済み. 現 `routines-view.tsx` には `<button>` が存在しない).
- **削除**: `priority-stars` (= 視覚意図が異なる特殊 button. 後述 `S-1`).

差し引き 13 件のまま (= 13 件は維持しつつ内訳が更新された).

### 対象外 (= `.button` を付与しない)

- S-1: `web/src/ui/priority-stars/priority-stars.tsx` の `.priority-stars__star` (radiogroup の★/☆). 透明背景 / 色は accent / subtle / 44x44px tap target を維持する.
- S-2: `web/src/ui/app-shell/app-shell.tsx` の `.app-shell__hamburger` (グローバルメニューを開く `☰`). アイコンとして特殊な layout / position を持つため対象外.
- S-3: `web/src/ui/app-shell/app-shell.tsx` の `.app-shell__menu-close` (グローバルメニュー閉じる `×`). 同様に対象外.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ: AC-1 基底 .button クラスが新設される
  Given web/src/styles/button.css が存在する
  When  CSS を読み取る
  Then  .button セレクタが存在し, border / border-radius / padding / cursor: pointer / appearance / background / color / font 関連の宣言を含む
   And  shadow / hover background / transition / animation の宣言を含まない
```

```
シナリオ: AC-2 派生 variant が新設される
  Given web/src/styles/button.css が存在する
  When  CSS を読み取る
  Then  .button--primary, .button--danger, .button--ghost の 3 セレクタが存在し, それぞれ background / color / border-color のいずれかを意図に沿って上書きする
```

```
シナリオ: AC-3 button.css が main.tsx から import される
  Given web/src/main.tsx を読み取る
  When  import 文を確認する
  Then  "./styles/button.css" の import 文が存在する (順序は tokens.css と同等の最上段相当)
```

```
シナリオ: AC-4 対象 button 全てが .button 基底クラスを持つ
  Given 影響範囲表「対象」の全 button (= 13 ファイル) を render する
  When  className を確認する
  Then  全ての対象 button が className に "button" を含む
```

```
シナリオ: AC-5 削除系 button が --danger variant を持つ
  Given 影響範囲表で variant=--danger と確定された全 button を render する
  When  className を確認する
  Then  className に "button button--danger" を含む
```

```
シナリオ: AC-6 主要 action button が --primary variant を持つ
  Given 影響範囲表で variant=--primary と確定された全 button を render する
  When  className を確認する
  Then  className に "button button--primary" を含む
```

```
シナリオ: AC-7 補助 / キャンセル button が --ghost variant を持つ
  Given 影響範囲表で variant=--ghost と確定された全 button を render する
  When  className を確認する
  Then  className に "button button--ghost" を含む
```

```
シナリオ: AC-8 既存の配置制御 className が併記される
  Given <TaskCard /> を render する
  When  「削除」 button の className を確認する
  Then  className に "button" と "task-card__actions__delete" の両方を含む

  When  「完了」 button の className を確認する
  Then  className に "button" と "task-card__actions__complete" の両方を含む
```

```
シナリオ: AC-9 PriorityStars の★/☆ には .button が付与されない (対象外)
  Given <PriorityStars /> を render する
  When  各 star button の className を確認する
  Then  className に "button" を含まない (= 既存の "priority-stars__star" のみ)
```

```
シナリオ: AC-10 AppShell の hamburger / 閉じる button には .button が付与されない (対象外)
  Given <AppShell /> を render する (menuOpen=false および menuOpen=true)
  When  hamburger button / menu-close button の className を確認する
  Then  どちらも className に "button" を含まない
```

```
シナリオ: AC-11 既存 button の機能が回帰しない
  Given 影響範囲表「対象」の各 button を持つ component を render する
  When  ユーザが click する
  Then  既存の onClick / onSubmit が同じ引数で呼ばれる (= 機能差分なし)
   And  既存の aria-label / type / disabled が変更されない
```

```
シナリオ: AC-12 既存の view CSS から button 視覚を直接上書きする宣言が撤去される
  Given web/src/ui/project-create-dialog/project-create-dialog.css を読み取る
  When  ".project-create-dialog button" セレクタを確認する
  Then  border / border-radius / padding / background / color / cursor 等の "視覚" 宣言が含まれない
        (= 視覚は .button 基底に集約される. min-height / focus-visible outline 等の "視覚以外"
        / "配置/タップ領域" の上書きが必要なら維持してよい. 詳細は plan で確定)
```

```
シナリオ: AC-13 既存単体 / E2E ツールテスト / a11y violations が 0 件
  Given 全変更を適用する
  When  vitest / playwright / jest-axe を実行する
  Then  既存テストが全 green
   And  a11y violations は 0 件
```

## 未決事項 / 確認待ち

- U-1: `error-notification` の `×` button (icon-only) を `.button` + `.button--ghost` に乗せるか, 専用扱いにするか. 第一候補は `.button--ghost` で乗せる (= banner 内の閉じる操作は通常 button と視覚言語を揃えても破綻しない). plan D 章で確定.
- U-2: `.button` 基底に `:focus-visible` outline を明示的に持たせるか. 現状は `priority-stars__star` / `project-create-dialog button:focus-visible` で個別宣言している. 第一候補は `.button:focus-visible` に統一して `project-create-dialog button:focus-visible` の宣言を撤去する. plan D 章で確定.
- U-3: `cursor: pointer` を基底に入れるか. 既存実態 (`priority-stars__star` のみ明示, 他は UA 既定) と「button 既定で cursor: pointer は冗長」という意見がある. 第一候補は明示的に入れる (= 派生 disabled 状態で `cursor: not-allowed` を上書きしやすい). plan D 章で確定.
- U-4: variant の色 (background / color / border-color) に既存トークンのどれを引くか. 第一候補は以下 (plan D 章で確定).
  - `--primary`: background = `--color-accent` (amber-700), color = `--color-bg` (#fff).
  - `--danger`: background = `--color-bg`, color = `--color-fg`, border-color = `--color-border` ベース (= 既存実装で「削除」が UA 既定で動いており色を持たないため, ここで強い色 (赤) を新規導入するには tokens.css に新規トークンが必要. 既存トークンだけで「危険」を表現するなら border のみ強調 / 文字色を `--color-accent` などにする方法が候補). 詳細は plan D 章で確定.
  - `--ghost`: background = transparent, color = `--color-fg`, border-color = `--color-border`.
- U-5: `--danger` に赤系の専用色 (例: `#b91c1c`) を新規トークンとして導入するかは別 BL とする方針で良いか. 第一候補は「本 BL では既存トークンだけで表現し, 強い視覚差分は別 BL に委ねる」.
- U-6: `padding` の値 (`--space-sm`, `--space-md` 等のどの組み合わせか). 第一候補は `padding: var(--space-xs) var(--space-md)` (= 4px / 16px / 既存 `priority-stars__star` の `0.25rem 0.375rem` より若干横長). plan D 章で確定.
- U-7: `border-radius` を `--radius-sm` / `--radius-md` / `--radius-lg` のどれにするか. 第一候補は `--radius-sm` (= 8px / カード系の `--radius-lg`=16px と差を付ける). plan D 章で確定.
- U-8: 既存の `task-card__actions__delete` / `task-card__actions__complete` の auto-margin パターンが `.button` の `display` / `flex` 系宣言と干渉しないことの再確認. 第一候補は「`.button` 基底は `display` を明示しない (= UA 既定の `inline-block` のまま) → auto-margin に影響しない」.
- U-9: `disabled` button に対する視覚差分を `.button` 基底で持たせるか. 現状 `project-create-dialog` の「追加」が `disabled={createMutation.isPending}` を持つ. 第一候補は `.button:disabled { cursor: not-allowed; opacity: 0.6 }` 程度を基底に入れる. plan D 章で確定.
