# タスク: VITE_API_BASE_URL の dev / 本番説明整合

- 状態: 着手中
- 関連: [`spec.md`](spec.md) / [`plan.md`](plan.md)

## 実装

- [x] `docs/developer/setup/server.md` の `VITE_API_BASE_URL` 行の下に dev/本番差の注記を追加
- [x] `docs/user/quick-start.md` A-2 セクションの引用ブロックを分離し dev 想定 + Web の build 時埋め込み + サーバ dev 起動の env ランタイム読みを明示

## テスト

- [x] `__tests__/docs/api-base-url-doc-align.test.ts` を追加して grep ベースで FR-1 / FR-2 を assert
- [x] 既存テスト全件 green
- [x] `npm run lint` / `npm run typecheck` 退行なし

## 仕上げ

- [x] 受け入れ基準 3 シナリオが手動で読んで満たされる
- [x] auditor に監査を依頼
