# タスク: SW アップデート確認 UI を画面中央のダイアログ化

## 実装

- [x] `web/src/ui/sw-update-dialog/sw-update-dialog.tsx` 新規
- [x] `web/src/ui/sw-update-dialog/sw-update-dialog.css` 新規
- [x] `web/src/app.tsx` の 4 箇所マウントを `SwUpdateDialog` に置換
- [x] `web/src/ui/pwa-update-banner/` を削除

## テスト

- [x] `web/__tests__/sw-update-dialog.test.tsx` 新規
- [x] 既存テスト全件 green
- [x] `npm run lint` / `npm run typecheck` 退行なし

## 仕上げ

- [x] 受け入れ基準 4 シナリオが満たされる
- [x] auditor に監査を依頼
