# タスク: web/src/main.tsx の as any 解消

- 状態: 着手中
- 関連: [`spec.md`](spec.md) / [`plan.md`](plan.md)

## 実装

- [x] `local-db.ts` に `LocalDb` interface を追加 + `getDb(): Promise<LocalDb>`
- [x] 6 Local 系ファイル (`local-task-repository.ts` / `local-settings-repository.ts` / `local-trash-repository.ts` / `local-project-repository.ts` / `local-routine-repository.ts` / `local-reset-usecase.ts`) の `interface DBConnection` を撤去し `LocalDb` を import
- [x] `main.tsx` の 4 箇所の `const anyDb = db as any;` + `// eslint-disable-next-line` を撤去

## テスト

- [x] `__tests__/web/main-tsx-no-any.test.ts` で `main.tsx` に `as any` / `eslint-disable` が残らないことを grep ベース検証
- [x] 既存テスト全件 green
- [x] `npm run lint` / `npm run typecheck` exit 0

## 仕上げ

- [x] 受け入れ基準 4 シナリオが満たされる
- [x] auditor に監査を依頼
