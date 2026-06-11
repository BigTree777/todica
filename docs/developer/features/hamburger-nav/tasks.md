# タスク: ハンバーガーナビゲーション

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [x] `app-shell.tsx`: `isOpen` state / `hamburgerRef` / `firstLinkRef` を追加する
- [x] `app-shell.tsx`: ハンバーガーボタン要素（`<button className="app-shell__hamburger">`）を追加する（`aria-label`・`aria-expanded`・`aria-controls` 属性を含む）
- [x] `app-shell.tsx`: オーバーレイ背景要素（`<div className="app-shell__overlay">`）を `isOpen` 時のみ表示するよう追加する
- [x] `app-shell.tsx`: `<nav>` を `.app-shell__sidebar` から `.app-shell__menu` にリネームし、`role="dialog"` / `aria-modal="true"` / `aria-label` を付与する
- [x] `app-shell.tsx`: 既存の NavLink に `onClick={handleClose}` を追加する
- [x] `app-shell.tsx`: `handleClose` でハンバーガーボタンへのフォーカス復帰（`hamburgerRef.current?.focus()`）を実装する
- [x] `app-shell.tsx`: `useEffect` でメニューを開いたときに最初のリンクへフォーカスを移動する処理を実装する
- [x] `app-shell.tsx`: `document` の `keydown` イベントリスナーで Escape キー押下時に `handleClose` を呼ぶ処理を実装する（`useEffect` でマウント時に登録・アンマウント時に解除）
- [x] `app-shell.css`: `.app-shell__sidebar` クラスを削除する
- [x] `app-shell.css`: `.app-shell__main` を全幅化する（`flex: 1` → `width: 100%`）
- [x] `app-shell.css`: `.app-shell__hamburger` クラスを追加する（`position: fixed`・左上固定・デザイントークン適用）
- [x] `app-shell.css`: `.app-shell__overlay` クラスを追加する（全画面半透明背景）
- [x] `app-shell.css`: `.app-shell__menu` と `.app-shell__menu--open` クラスを追加する（`position: fixed`・スライドインアニメーション）

## テスト

- [x] `web/__tests__/hamburger-nav.test.tsx` を作成し、以下を検証する単体テストを追加する (JSX を import するため拡張子は `.tsx`):
  - 初期状態でメニューが閉じており `aria-expanded="false"` が付与されている
  - ハンバーガーボタンをクリックするとメニューが開き `aria-expanded="true"` に変わる
  - メニューが開いた状態で再度ボタンをクリックするとメニューが閉じる
  - NavLink をクリックするとメニューが閉じる
  - Escape キーを押すとメニューが閉じる
  - メニューに `role="dialog"` / `aria-modal="true"` が付与されている
- [x] `e2e/hamburger-nav.spec.ts` を作成し、AC-1〜AC-9 を Playwright で検証する
- [x] 既存 E2E テスト (sidebar-nav / focus-view / tomorrow-view / set-focus-gesture) が壊れていないことを確認し、ハンバーガー操作経由に書き換え (合わせて tomorrow 系で BL-051 の `<section aria-label="明日のタスク">` → `<main>` 統合へのランドマーク追従を実施)

## ドキュメント

- [x] `plan.md` の設計詳細と照合し、実装との差異を更新する（必要な場合のみ / 差異なし）

## 仕上げ

- [x] 受け入れ基準（spec.md の AC-1〜AC-9）を全て満たすことを確認
- [x] `npm run lint` と `npm run typecheck` が通ることを確認
- [x] レビュー依頼 (auditor PASS)
