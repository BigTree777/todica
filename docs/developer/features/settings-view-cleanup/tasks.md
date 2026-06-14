# タスク: SettingsView の構造・文言整理

## 実装

- [x] FR-1 ログアウト section に `.settings-view__logout` クラス + CSS
- [x] FR-2 パスワード変更 3 ブロックに `.settings-view__password-field` + label display: block
- [x] FR-3 submit button 文言を「変更」に統一
- [x] FR-4 リセット時刻 form 2 段構成 + `.settings-view__label` / `.settings-view__field-row`

## テスト

- [x] 既存テストの追従 (settings-view.test.tsx / settings-view-reset-time-label.test.tsx / app-login.test.tsx / common-button-style.test.tsx)
- [x] 新規 `web/__tests__/settings-view-cleanup.test.tsx`
- [x] `npm run lint` / `npm run typecheck` 退行なし

## 仕上げ

- [x] 受け入れ基準 5 シナリオが満たされる
- [x] auditor 監査を依頼
