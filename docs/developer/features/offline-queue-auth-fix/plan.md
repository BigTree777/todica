# 計画: offline-queue の認証ヘッダ修正

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `web/src/offline-queue.ts` | `authedFetch` を import. `flush()` 内の `fetch` を `authedFetch` に置換 |
| `web/src/ui/today-view/today-view.tsx` | `HasBaseUrlAndToken` interface 撤去 / `authToken` 撤去 / Authorization 行撤去 |
| `web/src/ui/tomorrow-view/tomorrow-view.tsx` | 同上 |
| `web/src/ui/projects-view/projects-view.tsx` | 同上 |
| `web/src/ui/routines-view/routines-view.tsx` | 同上 |
| `web/src/ui/trash-view/trash-view.tsx` | 同上 |
| `web/src/ui/focus-view/focus-view.tsx` | 同上 |
| `web/src/ui/project-create-dialog/project-create-dialog.tsx` | 同上 |
| `__tests__/structure/offline-queue-auth.test.ts` (新規) | grep ベースで dead path 不在と authedFetch 経由を assert |

## 設計詳細

### offline-queue.ts

```ts
import { authedFetch } from "./auth/authed-fetch.js";
// ...
const response = await authedFetch(entry.url, {
  method: entry.method,
  headers: entry.headers as HeadersInit,
  body: entry.body ?? undefined,
});
```

`authedFetch` 内部で auth-storage から token を読んで `Authorization: Bearer <token>` をセットする. entry.headers に Authorization が含まれていなければ追加されるが, 本 fix 後は UI 層で Authorization を入れない方針なので `headers.has("Authorization")` チェックは常に false 側を通り token が乗る.

### UI 層

```ts
// Before
const repo = repository as unknown as HasBaseUrlAndToken;
const baseUrl = repo.baseUrl ?? "";
const authToken = repo.authToken ?? "";
// ...
void safeEnqueue({
  url: `${baseUrl}/api/v1/tasks`,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "Idempotency-Key": idempotencyKey,
  },
});

// After
const repo = repository as { baseUrl?: string };
const baseUrl = repo.baseUrl ?? "";
// ...
void safeEnqueue({
  url: `${baseUrl}/api/v1/tasks`,
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": idempotencyKey,
  },
});
```

## 重要な決定

- **D-1**: `HasBaseUrlAndToken` を共有 interface 化はせず, 各 UI ファイル内でインラインキャスト `as { baseUrl?: string }` に統一. baseUrl 1 つだけなので独立 interface を作る価値が薄い.
- **D-2**: enqueue 時に Authorization を完全に入れない (空文字も入れない). flush 時に authedFetch が auth-storage から取って付ける.
- **D-3**: auth-storage 利用不可環境では `authedFetch` 内部で Authorization が落ちて 401 → retryCount++ → MAX_RETRY=5 で drop. これは既存挙動と同じで, BL-097 のスコープ外.

## テスト方針

- `__tests__/structure/offline-queue-auth.test.ts` で 7 UI ファイルに dead path 不在を grep ベース assert.
- `offline-queue.ts` が `authedFetch` を import していることも assert.
- 既存テストで flush の挙動退行が無いことを担保.
