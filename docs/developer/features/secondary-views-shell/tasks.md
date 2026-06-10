# タスク: 既存 4 view のスタイル統一 (secondary-views-shell)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## テスト (先行: TDD の red を作る)

- [x] T-1: `e2e/secondary-views-style.spec.ts` を新規作成する (test-designer)
  - AC-2: 4 view の `<main>` に view ルートクラス (`settings-view` / `trash-view` / `routines-view` / `projects-view`) が付与されている
  - AC-3: 4 view の `<h1>` の computed font-size が /tomorrow の `<h1>` と同値である (/tomorrow から取得した値を期待値にする)
  - AC-4: 作成 / 設定フォーム (aria-label でセレクト) の border-radius = 12px / border = 1px solid (対象: projects / routines / settings の境界時刻フォーム)
  - AC-5: trash / routines / projects のリスト項目 (li) が角丸カード (border-radius 12px), ul が list-style-type: none
  - AC-6: /trash の header 内に見出し「ゴミ箱」と button「ゴミ箱を空にする」が同居し, クリックで空になる
  - AC-7: ゴミ箱が空のとき「ゴミ箱は空です」が text-align: center / color: rgb(89, 89, 89)
- [x] T-2: 既存テストが red にならないことの確認方法を整理する (変更前に全 green を確認し基線を取る)

## 実装

- [x] T-3: settings-view (`web/src/ui/settings-view/`)
  - `settings-view.css` 新規 (plan §「スタイル暫定値の対応表」の値. 全値に `TODO(BL-046)` マーカー)
  - `settings-view.tsx`: CSS import + ルート / フォーム / section / 設定値表示への className 付与. h2 = 20px (U-3)
- [x] T-4: trash-view (`web/src/ui/trash-view/`)
  - `trash-view.css` 新規
  - `trash-view.tsx`: CSS import + className 付与 + `<h1>` と「ゴミ箱を空にする」を `<header className="trash-view__header">` で包む (REQ-5 / D-006) + 空状態スタイル (REQ-6)
- [x] T-5: routines-view (`web/src/ui/routines-view/`)
  - `routines-view.css` 新規
  - `routines-view.tsx`: CSS import + className 付与 (フォーム / 曜日行 / リスト / カード / 補足テキスト / アクション群). 優先度 `<select>` とインライン名称変更フォームは無改修 (D-004)
- [x] T-6: projects-view (`web/src/ui/projects-view/`)
  - `projects-view.css` 新規
  - `projects-view.tsx`: CSS import + className 付与 (フォーム / リスト / カード / アクション群). インライン名称変更フォームは無改修 (D-004)

## テスト (後行: green 化の確認)

- [x] T-7: 新規 E2E (`secondary-views-style.spec.ts`) が green になる
- [x] T-8: 既存単体テスト (web/src/ 配下) が無改修で全 green (AC-8)
- [x] T-9: 既存 E2E 全 spec が無改修で全 green (AC-1 / AC-8. 特に sidebar-nav / settings / trash / routines / projects / boundary-time / conflict-handling / a11y / keyboard)
- [x] T-10: `e2e/a11y.spec.ts` の全 8 スキャンで violations 0 件 (AC-9)

## ドキュメント

- [x] T-11: 新規 CSS の全暫定値に `TODO(BL-046)` マーカーが付いていることを grep で確認する (AC-10. auditor チェック項目)
- [x] T-12: backlog (BL-045) の状態更新

## 仕上げ

- [x] T-13: 受け入れ基準 (spec.md AC-1〜AC-10) を全て満たすことを確認
- [x] T-14: auditor へレビュー依頼 (機能差分なし / NFR-COMPAT の確認を重点に)
