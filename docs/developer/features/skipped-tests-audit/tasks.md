# タスク: vitest skipped 198 件の棚卸し

- 状態: 着手中
- 関連: [`spec.md`](spec.md) / [`plan.md`](plan.md)

## 実装

- [x] 7 ファイルの obsolete `describe.skip` / `it.skip` ブロックを削除
- [x] 履歴表現コメント (「BL-XXX で…」) を同時に削除
- [x] `docs/developer/quality/test-catalog.md` に skip 件数サマリを追記

## テスト

- [x] `__tests__/structure/no-obsolete-skips.test.ts` で 7 ファイルの skip 行が 0 件であることを検証
- [x] `npx vitest run` で skipped < 100 / passed 退行なし
- [x] `npm run lint` / `npm run typecheck` 退行なし

## 仕上げ

- [x] 受け入れ基準 3 シナリオが満たされる
- [x] auditor に監査を依頼
