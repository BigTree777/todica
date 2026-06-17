# タスク: 設定ビュー「リセット時刻」入力欄の横幅半減

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 仕様策定 (project-designer)

- [x] backlog BL-113 を読んで現状把握 (`settings-view.tsx` / `.css`).
- [x] 候補 (a)/(b)/(c) を比較して (b) `flex: 0 1 50%` を確定.
- [x] `spec.md` 作成 (背景 / ゴール / REQ-1〜4 / NFR-1〜2 / AC-1〜6 / 既存テスト互換性 / 方針選定根拠 / 未決事項).
- [x] `plan.md` 作成 (CSS の Before/After / 影響範囲 / D-1〜4 / リスク R-1〜3 / テスト方針 T-1〜7).
- [x] `tasks.md` 作成 (本ファイル).

## テスト設計 (test-designer)

- [x] `web/__tests__/settings-reset-time-input-width.test.ts` を新設.
  - [x] T-1 (AC-1): `.settings-view__field-row input` 本文に `flex: 0 1 50%` を含むことを regex で assert.
  - [x] T-2 (AC-1): 同ルール本文に `flex: 1;` (単独値 1) を含まないことを regex で assert.
  - [x] T-3 (AC-2 regression): 同ルール本文に `font-size: var(--font-size-h2)` を含む.
  - [x] T-4 (AC-2 regression): 同ルール本文に `padding: var(--space-xs) var(--space-sm)` を含む.
  - [x] T-5 (AC-3): `.settings-view__field-row` (input セレクタなし) 本文に `display: flex` / `gap: var(--space-sm)` / `align-items: center` が残る.
  - [x] T-6 (AC-4): `.settings-view__password-field` 本文に `display: flex` / `flex-direction: column` / `gap: var(--space-xs)` が残り, `width` / `flex` / `max-width` が新規追加されていない.
  - [x] T-7 (AC-5): SettingsView render で `.settings-view__field-row` 直下に `input#day-boundary-time` と `button[type='submit']` がこの順で並ぶ (DOM regression guard).
- [x] 新規テストを実行し, 全件が **失敗 (red)** することを確認 (CSS 未修正のため T-1, T-2 が落ちる想定. T-3〜T-7 は現状でも pass する想定).
  - [x] T-1 (`flex: 0 1 50%` を含むことを assert) が red であることを確認.
  - [x] T-2 (`flex: 1` 単独を含まないことを assert) が red であることを確認.

## 実装 (implementer / 管理者が手段選定)

- [x] `web/src/ui/settings-view/settings-view.css` の `.settings-view__field-row input` ルールを編集.
  - [x] `flex: 1;` を `flex: 0 1 50%;` に差し替え.
  - [x] 差し替えに伴うコメントを 1 行 (`/* 0 1 50%: grow なし / shrink あり / basis 50%. ... */` 程度) で添える.
  - [x] `font-size: var(--font-size-h2)` と `padding: var(--space-xs) var(--space-sm)` はそのまま残す.
- [x] 他のセレクタ (`.settings-view__field-row` 本体 / `.settings-view__password-field` 等) は無改修.
- [x] `settings-view.tsx` は無改修.

## テスト実行 (実装後の green 化)

- [x] 新規 `settings-reset-time-input-width.test.ts` が全件 green になる.
- [x] 既存テスト (regression) が全件 green を維持する.
  - [x] `web/__tests__/settings-view-reset-time-label.test.tsx`
  - [x] `web/__tests__/settings-view-cleanup.test.tsx`
  - [x] `web/__tests__/settings-view.test.tsx`
  - [x] `e2e/settings.spec.ts`
- [x] `npx vitest run` (リポジトリルートから) が全件 green.
- [x] `npx playwright test` が全件 green.
- [x] `npm run typecheck` が 0 error.
- [x] `npm run lint` が 0 error.

## 監査 (auditor)

- [x] spec.md の AC-1〜AC-6 が全て満たされていることを確認.
- [x] CSS 変更が `.settings-view__field-row input` の `flex` 宣言 1 行 (+ コメント) に閉じていることを確認.
- [x] 他の `.settings-view__*` ルールに変更が無いことを確認.
- [x] `settings-view.tsx` / tokens.css / TSX 系の変更が無いことを確認 (diff レビュー).
- [x] vitest / Playwright / typecheck / lint が全 green を確認.
- [x] 実機 (デスクトップ標準幅 + モバイル幅) で `/settings` を開き input + button が同一行に並ぶことを確認 (manual M-1 / M-2).

## ドキュメント

- [x] 本機能のドキュメントは `docs/developer/features/settings-reset-time-input-width/` 配下に閉じる (本 spec / plan / tasks のみ).
- [x] backlog BL-113 の状態を Todo → Done に更新する (実装 + auditor PASS 後).

## 仕上げ

- [x] 受け入れ基準 (`spec.md` AC-1〜6) を全て満たすことを確認.
- [x] 単一ブランチ `feature/settings-reset-time-input-width` で作業し, PR 経由で main にマージ.
- [x] マージ後にローカルブランチを削除.
