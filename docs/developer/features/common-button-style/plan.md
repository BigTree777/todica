# 設計・実装計画: 共通ボタンスタイル (common-button-style)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`web/src/styles/button.css` を新設し, 基底 `.button` + 派生 `.button--primary` / `.button--danger` / `.button--ghost` の 4 セレクタを定義する. `main.tsx` の上段 (`tokens.css` の隣) で import してグローバル CSS として全 view に届ける. 影響範囲表の対象 13 ファイルの全 `<button>` の `className` に `"button"` (+ variant) を併記し, 既存の配置制御 className とは併記関係で共存させる. JSX 構造 / props / 機能は一切変更しない. variant の色配分は spec U-4 の第一候補を D 章で確定し, 既存トークンのみで全表現する. 各 view CSS の中で button の "視覚" を直接上書きしている宣言は撤去する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 無改修. |
| DB | 無改修. |
| ドメイン / usecase / repository | 無改修. |
| グローバル CSS | 新規 `web/src/styles/button.css` (基底 1 + variant 3 + disabled 1 + focus-visible 1, 約 6 セレクタ). |
| エントリポイント | `web/src/main.tsx` の冒頭 import に 1 行追加 (`import "./styles/button.css"`). |
| UI (13 ファイル) | 各 `<button>` の `className` に "button" (+ variant) を併記. JSX 構造 / props / 機能は無改修. |
| 既存 view CSS | `web/src/ui/project-create-dialog/project-create-dialog.css` の `.project-create-dialog button { min-height; padding }` から `padding` を撤去 (= `.button` 基底に統合). `min-height: 44px` は WCAG 2.5.5 のタップターゲット保証として維持. `:focus-visible` outline は D-005 に従う. その他の view CSS には button 視覚を直接上書きする宣言が無いため修正不要. |
| 既存テスト | role + accessibleName ベースが大半のため大規模追従はないが, 一部 className を直接 assert している既存テストがあれば追従が必要 (= 後述 R-1). |
| 新規テスト | 1 ファイル新設 (`web/__tests__/common-button-style.test.tsx` 仮称, AC-1 〜 AC-13 をカバー). |
| E2E ツール | 無改修 (= role + accessibleName ベース). |

## 設計詳細

### `web/src/styles/button.css` の構造 (確定値)

```css
/*
 * 共通ボタンスタイル (BL-067 / common-button-style).
 *
 * - 基底 .button + 派生 --primary / --danger / --ghost.
 * - shadow / hover background / transition / animation は意図的に持たない
 *   (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
 * - 値は tokens.css の既存トークンから引く (= 新規トークン追加なし).
 *
 * 対象外 (= .button を付与しない):
 *   - .priority-stars__star (radiogroup の★/☆)
 *   - .app-shell__hamburger / .app-shell__menu-close (グローバルメニュー icon-only)
 *
 * 既存配置制御 className (例: .task-card__actions__delete の margin-right: auto)
 * とは併記関係で共存する.
 */

.button {
  /* visual 基底. UA スタイルを意図的に上書きする. */
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs) var(--space-md);
  font: inherit;
  cursor: pointer;
  background: var(--color-bg);
  color: var(--color-fg);
  /* display は明示しない (= UA 既定の inline-block のまま) → auto-margin パターン非干渉. */
}

.button:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.button--primary {
  background: var(--color-accent);
  color: var(--color-bg);
  border-color: var(--color-accent);
}

.button--danger {
  /* tokens.css に赤系トークンが無い (D-003). 既存トークンの組合せで「危険」を表現する.
     border + 文字色を --color-accent に寄せて視覚的に強調. background は --color-bg を維持. */
  background: var(--color-bg);
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.button--ghost {
  background: transparent;
  color: var(--color-fg);
  border-color: var(--color-border);
}
```

### `web/src/main.tsx` の import 追加位置

`main.tsx` 既存 line 23 (`import "./styles/tokens.css";`) の直後に挿入する.

```tsx
import "./styles/tokens.css";
import "./styles/button.css";
```

順序の根拠: tokens.css の CSS 変数を button.css の `.button` 基底が参照するため, tokens を先に読み込む必要がある. button.css を他の view-local CSS より先に読み込むことで, view-local CSS の override が後勝ちで効くようにする.

### 各 view tsx の className 改修

`className` の併記順は `"button button--<variant> <既存配置制御 className>"` とする (= 基底 → variant → 配置制御).

具体的な改修 (`<button>` 単位):

- **task-card.tsx**
  - 削除: `className="task-card__actions__delete"` → `className="button button--danger task-card__actions__delete"`
  - 現在のタスクにする: (className 無し) → `className="button button--primary"`
  - 明日にする / 今日にする: (className 無し) → `className="button button--primary"`
  - 完了: `className="task-card__actions__complete"` → `className="button button--primary task-card__actions__complete"`
- **task-form-card.tsx**
  - 追加: (className 無し) → `className="button button--primary"`
- **project-card.tsx**
  - 削除: `className="project-card__actions__delete"` → `className="button button--danger project-card__actions__delete"`
- **project-form-card.tsx**
  - 追加: `className="project-card__submit"` → `className="button button--primary project-card__submit"`
- **routine-card.tsx**
  - 削除: `className="routine-card__actions__delete"` → `className="button button--danger routine-card__actions__delete"`
- **routine-form-card.tsx**
  - 追加: `className="routine-card__submit"` → `className="button button--primary routine-card__submit"`
- **trash-view.tsx**
  - ゴミ箱を空にする: (className 無し) → `className="button button--danger"`
  - 復元: (className 無し) → `className="button button--ghost"`
- **settings-view.tsx**
  - 保存: (className 無し) → `className="button button--primary"`
  - 変更を保存: (className 無し) → `className="button button--primary"`
  - mode 切替: (className 無し) → `className="button button--ghost"`
- **setup-view.tsx**
  - 接続する: (className 無し) → `className="button button--primary"`
  - ローカルモードで使う: (className 無し) → `className="button button--ghost"`
- **project-create-dialog.tsx**
  - 追加: (className 無し) → `className="button button--primary"`
  - キャンセル: (className 無し) → `className="button button--ghost"`
- **pwa-update-banner.tsx**
  - 再読み込み: (className 無し) → `className="button button--primary"`
  - 閉じる: (className 無し) → `className="button button--ghost"`
- **error-notification.tsx**
  - ×: (className 無し) → `className="button button--ghost"` (D-001).
- **conflict-dialog.tsx**
  - サーバの値を採用: (className 無し) → `className="button button--primary"`
  - クライアントの値で再送: (className 無し) → `className="button button--ghost"`

### 既存 view CSS の改修

- `web/src/ui/project-create-dialog/project-create-dialog.css`
  - `.project-create-dialog button { min-height: 44px; padding: 0.5rem 0.75rem; }` から `padding` を撤去 (= `.button` 基底側に統合). `min-height: 44px` は WCAG 2.5.5 タップターゲット保証のため**維持** (= 視覚ではなく a11y 制約なので `.button` 基底に入れない).
  - `.project-create-dialog button:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }` は `.button:focus-visible` と同等であり**撤去**. `.project-create-dialog input:focus-visible` は input 向けなので**維持** (D-005).
- その他 view CSS (`task-card.css` / `project-card.css` / `routine-card.css` / `app-shell.css` / `priority-stars.css` / `settings-view.css` / `trash-view.css` / `projects-view.css` / `routines-view.css` / `setup-view.css` / `focus-view.css` / `today-view.css` / `day-view.css`)
  - button の "視覚" を直接上書きする宣言は持たない (= grep 確認済). 無改修.
  - 配置制御 (`.task-card__actions__delete { margin-right: auto }` 等) は維持.
- 対象外 button のスタイル (`priority-stars.css` / `app-shell.css` の hamburger / menu-close) は全て**無改修**.

### 処理フロー

CSS 適用のみ. ランタイム挙動 (onClick / onSubmit / state) は無改修.

### 例外 / エラー処理

CSS のみのため例外経路なし.

## 重要な決定 (D 章)

- **D-001: error-notification の `×` button は `.button` + `.button--ghost` に乗せる.** spec U-1 の第一候補を採用. banner 内の閉じる操作は通常 button 系と視覚言語を揃えても破綻しない (= app-shell の `×` のような特殊レイアウトを持たない). 例外扱いにすると判定境界が曖昧になる.

- **D-002: `.button:focus-visible` outline を基底に持たせる.** spec U-2 の第一候補を採用. 個別 view CSS で散らばっていた `:focus-visible` outline を `.button:focus-visible` に集約し, `project-create-dialog button:focus-visible` の宣言を撤去する. 値は既存 `--color-focus-ring` を引く (= 視覚的に既存と一致). `priority-stars__star:focus-visible` は対象外 button なので無改修.

- **D-003: variant の色は既存トークンのみで構成する.** spec U-4 / U-5 の第一候補を採用. `tokens.css` の新規追加は行わない. 結果として `--danger` は "赤" を持たず, border + 文字色 = `--color-accent` の組み合わせで「強調」を表現する. ユーザが視覚的に "破壊性" を強く認識できる赤色を導入する場合は別 BL で `--color-danger` 等の新規トークンを足す.

- **D-004: padding / radius / cursor の確定値.**
  - padding: `var(--space-xs) var(--space-md)` (= 4px / 16px). spec U-6 第一候補.
  - border-radius: `var(--radius-sm)` (= 8px). カード系の `--radius-lg`(16px) と差を付ける. spec U-7 第一候補.
  - cursor: `pointer` を基底に明示. spec U-3 第一候補. `disabled` 時は `not-allowed` で上書き.

- **D-005: `min-height: 44px` (WCAG 2.5.5 タップターゲット) は `.button` 基底に入れない.** project-create-dialog の dialog 内タップ領域確保のための制約であり, banner 系や card 内 button では既存 padding + line-height で 44px 相当が満たされる (= 視覚一貫性を優先). dialog 内 button のみ `min-height: 44px` を view CSS 側で維持する.

- **D-006: `display` を基底に明示しない.** spec U-8. UA 既定 (`inline-block`) のままにすることで, `task-card__actions__delete { margin-right: auto }` / `task-card__actions__complete { margin-left: auto }` の auto-margin パターン (BL-063) と干渉しない. flex / grid を基底に持ち込むと flex 親文脈での auto-margin が変化する可能性がある.

- **D-007: `:disabled` 視覚を `.button` 基底に持たせる.** spec U-9 第一候補. `cursor: not-allowed; opacity: 0.6;` の 2 宣言のみ. 現状 `project-create-dialog` の「追加」が `disabled={createMutation.isPending}` を持つ. opacity による視覚差分が `.button--primary` の background 上で十分視認できることを D 章で確認.

- **D-008: variant 配分.** spec REQ-3 / 影響範囲表に書いた配分を以下にまとめる (= variant 配分の最終確定).
  - `--primary` (= 主要 action, 12 件): TaskCard「現在のタスクにする」「明日/今日にする」「完了」/ TaskFormCard「追加」/ ProjectFormCard「追加」/ RoutineFormCard「追加」/ Settings「保存」「変更を保存」/ Setup「接続する」/ PwaUpdateBanner「再読み込み」/ ProjectCreateDialog「追加」/ ConflictDialog「サーバの値を採用」.
  - `--danger` (= 破壊的, 4 件): TaskCard「削除」/ ProjectCard「削除」/ RoutineCard「削除」/ TrashView「ゴミ箱を空にする」.
  - `--ghost` (= 補助 / キャンセル / 取消, 7 件): TrashView「復元」/ Settings「mode 切替」/ Setup「ローカルモードで使う」/ ProjectCreateDialog「キャンセル」/ PwaUpdateBanner「閉じる」/ ErrorNotification「×」/ ConflictDialog「クライアントの値で再送」(内訳は影響範囲表参照).
  - 合計 23 button (= 13 ファイルにわたる. TaskCard 1 ファイル内に variant 違いの button が複数あるためファイル数 != button 数).

- **D-009: 既存配置制御 className との併記順.** `"button button--<variant> <配置制御>"` (= 基底 → variant → 配置制御). CSS 上の selector specificity は className 順に依存しないので順序は規約レベル. 読み手が「共通 → 特化」の順で読めるように統一する.

- **D-010: `<Button>` React component を作らない (採用案再確認).** backlog の採用案 `.button` 共通 CSS クラス を維持. 13 ファイル超の JSX 改修コスト, テスト追従コスト, props 設計コストを全て回避できる. 将来 (= 別 BL) で component 化したいときは, `<Button className="..." {...rest}>` シェルを作って既存 `.button` クラスを内部適用するだけで段階移行可能.

- **D-011: button.css の読み込み方法.** `main.tsx` で `import "./styles/button.css"` を `tokens.css` の直後に追加. これにより全 view (= AppShell 配下 / `/setup`) で button.css が有効化される. component-local import (= 各 view tsx で個別 import) はしない (= グローバル CSS としての一貫性を保つ).

- **D-012: 既存 view CSS で button 視覚を上書きする宣言の撤去範囲.** grep の結果, `web/src/ui/project-create-dialog/project-create-dialog.css` の `.project-create-dialog button { ... padding: ... }` のみが該当. `padding` を撤去する. その他の view / card CSS には button の視覚 (border / radius / padding / background / color / cursor / font) を直接上書きする宣言は無い (= 確認済). `min-height: 44px` は a11y 制約として view CSS 側に残す.

## リスク / 代替案

- **R-1: 既存テストの className 直接 assert への影響.**
  - リスク: `task-card-component.test.tsx` 等の既存テストで `expect(button).toHaveClass("task-card__actions__delete")` のように className を直接 assert している箇所があれば, 併記 (= `"button button--danger task-card__actions__delete"`) によって `toHaveClass` 自体は依然として通る (= toHaveClass は部分一致). しかし `expect(button.className).toBe("task-card__actions__delete")` のような完全一致 assert があれば failing する.
  - 対策: test-designer が新規 button-style テストを書く際に, 既存テストへの追従が必要な箇所を grep で洗い出す. 第一候補は「toHaveClass の部分一致のみで, 完全一致 assert は実態として無い (Testing Library 慣行)」. 実装後に既存テスト全 green を確認.

- **R-2: variant 色 (`--danger` が赤を持たない) によるユーザ視覚混乱.**
  - リスク: 「削除」button が赤くないため, 破壊的 action だと user が直感しにくい可能性.
  - 対策: D-003 の判断通り tokens.css 改修は本 BL のスコープ外とし, 別 BL (例: `BL-XXX color-danger-token`) で赤系トークン導入 → `.button--danger` の background / color を上書き, という段階移行で対応. 本 BL 完了直後の視覚は「border / 文字色 = amber-700 + 白背景」で「強調 button」として認識できる.

- **R-3: グローバル CSS による意図しない第三者 button への波及.**
  - リスク: `.button` という general な名前のため, 将来サードパーティ component や別ライブラリが同名 class を使った場合に視覚衝突する可能性.
  - 対策: 現状本リポジトリは `@tanstack/react-query` / `react-router-dom` / `@capacitor/*` のみ依存しており UI library を持ち込んでいない. 衝突する可能性は低い. 将来 UI library 導入時には class 命名衝突を再点検する.

- **R-4: shadow / hover / transition を将来 import で追加してしまう risk.**
  - 対策: button.css の冒頭 docblock に明記 + auditor のチェック対象に追加. NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION を遵守.

- **代替案 A (採用): `.button` 共通 CSS クラス** (本案).
- **代替案 B (不採用): `<Button>` React component**.
  - 不採用理由: 13 ファイル超の JSX を `<Button>` に差し替えるコスト, props 設計コスト, 既存テストの追従コスト. CSS class 付与なら JSX 構造はそのまま, role-based テストは無修正で通る.
- **代替案 C (不採用): `button { ... }` を全ボタンに直接適用 (= 要素セレクタで全 button をカバー)**.
  - 不採用理由: 対象外 button (priority-stars / app-shell) にも当たってしまい, 上書き責任が view CSS 側に増える. オプトイン方式 (`.button`) の方が境界が明確.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

- **単体テスト (新規 1 ファイル, 仮称 `web/__tests__/common-button-style.test.tsx`)**: AC-1 〜 AC-13 をカバーする.
  - AC-1 / AC-2: `button.css` のテキストを fs.readFile で読み, セレクタの存在と禁則 (shadow / transition / animation 不在) を assert する. (= snapshot ではなく文字列存在チェック.)
  - AC-3: `main.tsx` を fs.readFile で読み, `import "./styles/button.css"` の存在を assert する.
  - AC-4 〜 AC-10: 各 card / view を render し, 対象 button の className に `"button"` / `"button--<variant>"` が含まれることを assert. 対象外 button (priority-stars / app-shell) には `"button"` が含まれないことを assert.
  - AC-11: 既存 onClick / onSubmit / aria-label / type / disabled が変わっていないことを既存テスト範囲で担保. 新規テストでは「click で onClick が呼ばれる」「disabled で `:disabled` style が適用される」を最小限カバー.
  - AC-12: `project-create-dialog.css` の `.project-create-dialog button` ブロックに `padding` 宣言が存在しないことを fs.readFile で assert.
  - AC-13: 既存 vitest / playwright / jest-axe を流して全 green を確認 (= テスト実行は implementer の責務).
- **E2E ツールテスト**: 無修正で通る想定. role + accessibleName ベースのため className 変更の影響を受けない.
- **a11y**: jest-axe を新規テスト内で実行する場合, 各 button 系 view で violations 0 件を assert. 既存テスト範囲を踏襲.
