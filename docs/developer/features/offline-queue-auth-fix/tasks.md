# タスク: offline-queue 認証ヘッダ修正

## 実装

- [x] `offline-queue.ts` で `authedFetch` を import + `flush()` 内の `fetch` を置換
- [x] 7 UI ファイル (today / tomorrow / projects / routines / trash / focus + project-create-dialog) から `HasBaseUrlAndToken` interface と `authToken` 参照を撤去
- [x] enqueue 時の Authorization ヘッダ行を全削除

## テスト

- [x] `__tests__/structure/offline-queue-auth.test.ts` 新規 (dead path 不在 + authedFetch import を assert)
- [x] 既存テスト全件 green
- [x] lint / typecheck 0
