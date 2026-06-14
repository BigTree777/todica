# 計画: web/src/main.tsx の as any 解消

- 状態: ドラフト
- 関連: [`spec.md`](spec.md)

## 方針概要

`local-db.ts` の `getDb()` を strongly-typed にし, 各 Local 系ファイルが共有の `LocalDb` 型を使う. これにより `main.tsx` の `as any` が不要になる.

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `web/src/repositories/local-db.ts` | `LocalDb` interface を新設 + `getDb(): Promise<LocalDb>` |
| `web/src/repositories/local-task-repository.ts` | 個別 `DBConnection` 撤去 + `LocalDb` import |
| `web/src/repositories/local-settings-repository.ts` | 同上 |
| `web/src/repositories/local-trash-repository.ts` | 同上 |
| `web/src/repositories/local-project-repository.ts` | 同上 |
| `web/src/repositories/local-routine-repository.ts` | 同上 |
| `web/src/usecases/local-reset-usecase.ts` | 同上 |
| `web/src/main.tsx` | `as any` / `anyDb` / `eslint-disable-next-line` 撤去 |

## 設計詳細

### LocalDb 型

`local-task-repository.ts` の `interface DBConnection` を最大公約数として採用 (8 メソッド, うち 2 つはオプショナル):

```ts
export interface LocalDb {
  query(sql: string, values?: unknown[]): Promise<{ values?: Row[] }>;
  run(sql: string, values?: unknown[]): Promise<{ changes?: { changes: number; lastId: number } }>;
  execute(sql: string): Promise<{ changes?: { changes: number } }>;
  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  isTransactionActive?(): Promise<{ result: boolean }>;
  isDBOpen?(): Promise<{ result: boolean }>;
}
```

### getDb() の戻り型

`SQLiteDBConnection` 実物との橋渡しは `local-db.ts` 内部で 1 回だけ `as unknown as LocalDb` のキャストを許す (`@capacitor-community/sqlite` の型と最小インターフェースの構造的互換を担保).

### 各 Local 系ファイル

個別の `interface DBConnection` を撤去し `import type { LocalDb } from "./local-db.js"` (Usecase 側は `"../repositories/local-db.js"`) で受け取る. `constructor(private readonly db: DBConnection)` を `constructor(private readonly db: LocalDb)` に変更.

### main.tsx

`const anyDb = db as any;` を撤去し `db` を直接 `LocalResetUsecase` / 各 Local Repository に渡す. `db.execute(sql)` も `LocalDb.execute` 経由でそのまま呼べる.

## 重要な決定

- **D-1**: `LocalDb` の名前は `local-db.ts` の責務にちなみ最短で命名 (`LocalDbConnection` 等の冗長化を回避).
- **D-2**: ADR は作らない (既存型の重複解消にとどまり, 新しい設計選択はしない).

## テスト方針

- 既存 Local 系の単体テスト (`local-task-repository.test.ts` 等) が pass し続けることをもって動作確認.
- 新規テストは不要 (挙動変更なし).
- 完了の追加検証として grep ベースで `main.tsx` に `as any` / `eslint-disable` が無いことを確認 (受け入れ基準) — 既存テストでは捕捉できないため `__tests__/web/main-tsx-no-any.test.ts` を 1 ファイル追加.
