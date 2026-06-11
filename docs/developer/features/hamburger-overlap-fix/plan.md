# 設計・実装計画: ハンバーガーボタンと h1 タイトルの重なり修正

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`web/src/ui/app-shell/app-shell.css` の `.app-shell__main` ルールに `padding-top` を追加し,
ハンバーガーボタン (実寸約 36px) より下に各 view の `<h1>` が描画されるようにする.
具体値は `calc(var(--space-md) + var(--space-xl))` (= 48px) とし, 既存トークンの組合せで構成する.
JSX や各 view の CSS は一切変更しない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| モジュール | 変更なし |
| UI | `web/src/ui/app-shell/app-shell.css` の `.app-shell__main` ルールに `padding-top: calc(var(--space-md) + var(--space-xl))` を追加する 1 行のみ |
| JSX | `web/src/ui/app-shell/app-shell.tsx` は変更なし |
| 各 view | `today-view`, `tomorrow-view`, `focus-view`, `projects-view`, `routines-view`, `trash-view`, `settings-view` の tsx / css いずれも変更なし |
| トークン | `web/src/styles/tokens.css` は変更なし (既存トークンのみで対応) |
| ドキュメント | `docs/developer/planning/backlog.md` の BL-053 行を Todo → Done に更新 (完了時のみ) |

## 設計詳細

### データモデル

変更なし.

### 処理フロー / レイアウト

変更後の `.app-shell__main` 宣言ブロック (想定):

```css
.app-shell__main {
  flex: 1;
  width: 100%;
  padding: var(--space-md);
  /* BL-053: ハンバーガーボタン (top: 8px + ボタン高 ~28px = bottom ~36px) と
     h1 が重ならないよう, 上端のみ追加で余白を確保する.
     calc(var(--space-md) + var(--space-xl)) = 16 + 32 = 48px ≥ 36px. */
  padding-top: calc(var(--space-md) + var(--space-xl));
  overflow: auto;
}
```

ポイント:

- `padding` ショートハンドの後に `padding-top` を上書きすることで, 左右下は `var(--space-md)` のまま,
  上のみ 48px になる (CSS カスケード上, 後勝ち).
- ショートハンドを 4 値で書き直す案 (例: `padding: calc(...) var(--space-md) var(--space-md) var(--space-md)`)
  も等価だが, 既存 1 行を温存し追加 1 行で差分最小化する方が diff レビューしやすい.

### ハンバーガーボタン実寸の根拠

- `top: var(--space-sm)` = 8px
- `padding: var(--space-xs)` = 4px (上下左右各 4px)
- `font-size: var(--font-size-h2)` = 20px (☰ グリフの近似高)
- `line-height` 既定 (約 1.2〜1.5) を考慮し content 高さは約 24〜30px
- 合計 bottom 座標 ≈ 8 + 4 + 28 + 4 = 約 44px (最大見積もり)
- 余裕を含めて 48px (= `--space-md` + `--space-xl`) を採用すれば確実に下回らない.

### 例外 / エラー処理

- CSS 仕様変更のため runtime 例外は発生しない.
- 想定リスク: 既存 view の縦スクロール開始位置が下にずれることで,
  fold (スクロール無し状態の可視範囲) が狭くなる. これは仕様トレードオフとして許容する (spec REQ-7).

## 重要な決定

- **D-001 (案 A 採用)**: 案 A (`.app-shell__main` の padding-top 増) を採用する.
  案 B (各 view header への hamburger 構造統合) は不採用. 根拠は [`spec.md`](spec.md) §「採用案」.
  ADR 化はしない (小規模な CSS 調整のため. ADR-0012 の延長で済む).
- **D-002 (値の選定)**: `padding-top` は `calc(var(--space-md) + var(--space-xl))` (= 48px) を採用.
  `calc(var(--space-xl) * 2)` (= 64px) 案も検討したが, 過剰な余白で視覚バランスを損なうため不採用.
- **D-003 (トークン非追加)**: 専用トークン (例: `--app-shell-top-clearance`) は導入しない.
  使用箇所が 1 か所のみで, 既存 `--space-md` + `--space-xl` の組合せで十分意味が読めるため.

## リスク / 代替案

- **リスク 1**: 将来ハンバーガーボタンのサイズを大きく変更した場合, 48px では足りなくなる可能性.
  - 緩和策: 変更時に本 BL の spec を参照し, `.app-shell__main` の `padding-top` も併せて見直す運用ルールとする.
  - plan.md / app-shell.css のコメントに「ボタン実寸との関係」を明記して将来の保守者に伝える.
- **リスク 2**: 各 view の content top が下にずれることで, 既存スクリーンショット系の E2E がリグレッションする.
  - 確認: 現状 todica の E2E にスクリーンショット比較系は無いため影響なし.
- **代替案 (不採用)**:
  - 案 B: 各 view header への構造統合 → [`spec.md`](spec.md) §「採用案」参照.
  - 各 view の `<h1>` に個別 `margin-top` を追加 → AppShell の責務逸脱 + 7 ファイル変更が必要で却下.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (vitest, node 環境)

新規ファイル: `web/__tests__/hamburger-overlap-fix.test.ts`

`design-tokens.test.ts` / `task-card-design.test.ts` と同じ CSS 文字列 assert 手法を採用する.

- **検証 1 (AC-1)**: `app-shell.css` を読み込み, `.app-shell__main` の宣言ブロックを正規表現で抽出し,
  `padding-top: calc(var(--space-md) + var(--space-xl))` (空白許容) が含まれることを assert.
- **検証 2 (AC-2)**: 同ブロックに `padding: var(--space-md);` のショートハンドが残っていることを assert
  (左右下が既存値であることの間接確認).
- **検証 3 (AC-3)**: 同ブロック内の値に生 px 値 (`/\d+px/`) が含まれないことを assert.
- **検証 4 (AC-4)**: `.app-shell__hamburger` ブロックを抽出し,
  `position: fixed`, `top: var(--space-sm)`, `left: var(--space-sm)`, `z-index: 200` が
  すべて含まれることを assert (回帰防止).

### E2E テスト (Playwright)

新規ファイル: `e2e/hamburger-overlap-fix.spec.ts`

- **シナリオ (AC-5)**: AppShell 配下の 7 画面 (`/focus`, `/today`, `/tomorrow`, `/projects`, `/routines`, `/trash`, `/settings`)
  をループで開き, 各画面で `h1` 要素と `button[aria-label="メニューを開く"]` の
  `boundingBox()` を取得して以下を assert:
  - `hamburger.y + hamburger.height <= h1.y`
    (= ハンバーガーボタンの bottom が h1 の top 以下 = 完全に上にある)
- **ナビゲーション操作**: 各画面への遷移は「ハンバーガーボタンをクリック → メニュー内リンクをクリック」の
  正しい手順で行う. 直接 `goto()` で URL 遷移してもよい (本 BL は h1 位置の検証であり, リンク経由か直接遷移かは問わない).

### 既存テストの green 維持 (AC-7)

- BL-049 の単体テスト (`web/__tests__/` 配下の AppShell 関連) と E2E (`e2e/hamburger-nav.spec.ts` 等)
  が一切回帰しないことを CI で確認する.
- BL-050 の備考にある既存リグレッション (本 BL の対象外) は green 化対象に含めない.

### テストカバレッジまとめ

| 受け入れ基準 | 検証手段 |
| --- | --- |
| AC-1 | 単体テスト (CSS 文字列 assert) |
| AC-2 | 単体テスト (CSS 文字列 assert) |
| AC-3 | 単体テスト (CSS 文字列 assert) |
| AC-4 | 単体テスト (CSS 文字列 assert) |
| AC-5 | E2E (Playwright boundingBox 比較) |
| AC-6 | BL-049 既存 E2E の green 維持で間接確認 |
| AC-7 | `npm test` / `npx playwright test` の全件 pass で確認 |
