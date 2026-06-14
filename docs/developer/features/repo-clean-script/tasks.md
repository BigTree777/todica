# タスク: clean / clean:dist script の追加

- 状態: 着手中
- 関連: [`spec.md`](spec.md) / [`plan.md`](plan.md)

## 実装

- [x] `rimraf` を devDependency に追加
- [x] `package.json` に `clean` / `clean:dist` の 2 script を追加

## テスト

- [x] `__tests__/structure/repo-clean-script.test.ts` で scripts の存在を検証
- [x] 既存テスト全件 green
- [x] `npm run lint` / `npm run typecheck` 退行なし

## 仕上げ

- [x] 受け入れ基準 3 シナリオが満たされる
- [x] auditor に監査を依頼
