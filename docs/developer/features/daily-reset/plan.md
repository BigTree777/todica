# 設計・実装計画: 日次リセット処理

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

サーバ側で「アクセス時の lazy 実行」を採用する。`GET /api/v1/today` のハンドラ先頭で `maybeRunDailyReset` を呼び出し、リセット要否を判定して必要なら実行してからレスポンスを返す。クライアントはリセットを意識しない。`POST /api/v1/reset` は保守・テスト用の明示的なトリガーとして提供する。タスク繰り越し・counter 更新は `db.transaction()` でアトミックに実行する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | `POST /api/v1/reset` の実装（openapi.yaml の骨格を具体化）|
| API | `GET /api/v1/today` ハンドラ先頭に `maybeRunDailyReset` を挿入 |
| DB | マイグレーション不要（`counter.lastResetExecutedAt` は BL-008 で追加済み）|
| モジュール | `server/src/use-cases/daily-reset.ts` を新設（ドメインロジック）|
| モジュール | `server/src/app.ts` に reset ハンドラ追加 / today ハンドラ修正 |
| モジュール | `server/src/use-cases/purge-trash.ts` を新設（スタブ）|
| UI | なし（クライアントはリセットを透過的に受け取る）|

## 設計詳細

### データモデル

既存の `Counter` 型（`server/src/data/counter-repository.ts`）の `lastResetExecutedAt: string | null` フィールドを使う。マイグレーション追加は不要。

```
Counter {
  id: "singleton"
  completedCount: number        // リセット時に 0 にクリア
  lastResetExecutedAt: string | null  // リセット実行時刻。冪等判定に使う
  version: number               // リセット時に +1
  updatedAt: string
}
```

`Task` 型は既存のまま。リセット時に `dueDate: "tomorrow"` → `"today"` への更新を `TaskRepository.update()` で行う。

### 境界時刻の算出（D-001）

「今日の境界時刻（ISO 8601）」= `clock.now()` の UTC 日付 + `dayBoundaryTime`（HH:MM）を連結した文字列。

例:
- `clock.now()` = "2026-06-08T10:00:00.000Z"、`dayBoundaryTime` = "04:00"
  → 今日の境界時刻 = "2026-06-08T04:00:00.000Z"
- `clock.now()` = "2026-06-08T03:30:00.000Z"、`dayBoundaryTime` = "04:00"
  → 今日の境界時刻 = "2026-06-08T04:00:00.000Z"
  → `clock.now()` < 今日の境界時刻 → **リセット不要**（まだ境界を超えていない）

リセット判定:

```
todayBoundaryAt = <今日の YYYY-MM-DD>T<HH:MM>:00.000Z

needsReset = clock.now() >= todayBoundaryAt
          && (lastResetExecutedAt === null || lastResetExecutedAt < todayBoundaryAt)
```

> タイムゾーン対応（BL-020）まで UTC 日付ベースで算出する（U-001 の確定事項）。

### リセット処理フロー（D-002）

`maybeRunDailyReset(deps)` の実装:

```
1. settings = await settingsRepository.get()
2. counter = await counterRepository.get()
3. todayBoundaryAt = calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime)
4. if not needsReset(clock.now(), counter.lastResetExecutedAt, todayBoundaryAt) → return { executed: false, appliedBoundaryAt: todayBoundaryAt }
5. db.transaction(() => {
     a. tasks = taskRepository.listSync({ trashed: "false" })  // tomorrow かつ active のみ対象
     b. tasks
          .filter(t => t.dueDate === "tomorrow" && t.trashedAt === null)
          .forEach(t => taskRepository.updateSync({ ...t, dueDate: "today", updatedAt: clock.now() }))
     c. counterRepository.updateSync({
          ...counter,
          completedCount: 0,
          lastResetExecutedAt: clock.now(),
          version: counter.version + 1,
          updatedAt: clock.now()
        })
     d. purgeTrash(db, clock)  // BL-011 スタブ（no-op）
   })
6. return { executed: true, appliedBoundaryAt: todayBoundaryAt }
```

> `db.transaction()` 内では better-sqlite3 の同期 API を使う（better-sqlite3 のトランザクションは同期関数の中で完結する）。Repository インターフェースには同期版メソッドの追加が必要か、またはトランザクション専用の低レベル操作を別途設ける（D-003 参照）。

### モジュール構成（D-003）

#### `server/src/use-cases/daily-reset.ts`

エクスポートする関数・型:

```typescript
/** 今日の境界時刻（ISO 8601）を算出する純関数。 */
export function calcTodayBoundaryAt(nowIso: string, dayBoundaryTime: string): string

/** リセットが必要かどうかを判定する純関数。 */
export function needsDailyReset(
  nowIso: string,
  lastResetExecutedAt: string | null,
  todayBoundaryAt: string
): boolean

/** リセット結果。POST /api/v1/reset のレスポンスボディにも使う。 */
export interface DailyResetResult {
  executed: boolean
  appliedBoundaryAt: string
}

/**
 * リセット要否を判定し、必要なら実行する。
 * GET /api/v1/today ハンドラと POST /api/v1/reset ハンドラの双方から呼ぶ。
 */
export async function maybeRunDailyReset(deps: DailyResetDeps): Promise<DailyResetResult>
```

`DailyResetDeps` は `AppDeps` のサブセット（`taskRepository`, `counterRepository`, `settingsRepository`, `clock`, `db`）を受け取る。`db` はトランザクション実行のための raw DB ハンドル。

#### `server/src/use-cases/purge-trash.ts`（スタブ）

```typescript
/** BL-011 でゴミ箱清算ロジックが実装される。本 feature では no-op。 */
export async function purgeTrash(db: unknown, clock: Clock): Promise<void> {
  // BL-011 で実装予定
}
```

#### `server/src/app.ts` の変更点

1. `POST /api/v1/reset` ハンドラを追加する。
2. `GET /api/v1/today` ハンドラ先頭に `maybeRunDailyReset(deps)` の呼び出しを追加する。
3. `AppDeps` に `db`（raw DB ハンドル）を追加する（トランザクション実行のため）。

### トランザクション設計（D-004）

better-sqlite3 の `db.transaction()` は同期関数のみ受け付ける。現在の `TaskRepository.update()` / `CounterRepository.update()` は `Promise<void>` を返す非同期インターフェースのため、トランザクション内では使えない。

解決策: `AppDeps` に `db`（DrizzleDB または better-sqlite3 の Database インスタンス）を追加し、`daily-reset.ts` 内でトランザクション用のインライン SQL または Drizzle の同期 ORM 呼び出しを行う。既存の Repository インターフェースはそのまま維持する（既存コードへの影響を最小化）。

```typescript
// db.transaction() の例（better-sqlite3 の同期 API）
const runReset = db.rawDb.transaction(() => {
  // tasks の dueDate を更新
  db.rawDb.prepare(
    "UPDATE tasks SET dueDate = 'today', updatedAt = ? WHERE dueDate = 'tomorrow' AND trashedAt IS NULL"
  ).run(clock.now());
  // counter を更新
  db.rawDb.prepare(
    "UPDATE counter SET completedCount = 0, lastResetExecutedAt = ?, version = ?, updatedAt = ? WHERE id = 'singleton'"
  ).run(clock.now(), counter.version + 1, clock.now());
});
runReset();
```

> Drizzle ORM を使う場合は `db.$transaction()` または `db.execute()` の同期版（better-sqlite3 上では同期）を使う。実装詳細は implementer が判断する。

### API 設計（D-005）

#### `POST /api/v1/reset`

openapi.yaml の既存骨格を以下のとおり具体化する。

- **メソッド**: POST
- **認証**: Bearer 必須（401）
- **冪等性キー**: Idempotency-Key ヘッダ必須（MISSING_IDEMPOTENCY_KEY で 400）
- **If-Match**: 不要（楽観ロックはリセット内部で Counter version を使うが、クライアントへの公開は不要）
- **レスポンス**:
  - `200 OK`: `{ executed: boolean, appliedBoundaryAt: string }`
    - `executed = true`: リセットが新規実行された
    - `executed = false`: 既実行（冪等。今日の境界時刻以降に既にリセット済み）
  - `401 UNAUTHORIZED`

#### `GET /api/v1/today`（変更なし・内部動作のみ変更）

レスポンスの形状は BL-008 で確定済み（`tasks / nextTaskId / currentTaskId / completionCount`）。本 feature でリセットが自動実行されることでタスクと completionCount の値が変わる可能性があるが、クライアントから見たレスポンス形状は変わらない。

### エラー処理（D-006）

| 状況 | 処理 |
| --- | --- |
| リセット判定中に DB エラー | 500 Internal Server Error（既存の Hono エラーハンドラに委譲）|
| トランザクション失敗 | ロールバック（better-sqlite3 の transaction() が自動でロールバック）|
| `POST /api/v1/reset` で認証なし | 401 UNAUTHORIZED |
| `POST /api/v1/reset` で Idempotency-Key なし | 400 MISSING_IDEMPOTENCY_KEY |

## 重要な決定

- **D-001（境界時刻の算出）**: UTC 日付 + `dayBoundaryTime` のシンプルな文字列連結で算出する。タイムゾーン変換は BL-020 まで据え置き。
- **D-002（lazy 実行）**: `GET /api/v1/today` のハンドラ先頭で実行する。定期実行（cron）は将来の feature。
- **D-003（モジュール分離）**: リセットのドメインロジックは `server/src/use-cases/daily-reset.ts` に分離する。`app.ts` のハンドラはこれを呼ぶだけにする。
- **D-004（トランザクション）**: `db.transaction()` でアトミックに実行する。既存 Repository の Promise インターフェースはトランザクション内で使わず、DB への直接操作または Drizzle の同期 API を使う（D-007 の技術負債解消）。
- **D-005（purgeTrash スタブ）**: `server/src/use-cases/purge-trash.ts` に空実装を置く。関数シグネチャのみ確定し、BL-011 がロジックを充填する。
- **D-006（`POST /api/v1/reset` の If-Match 不要）**: リセットはクライアントが counter version を知らなくても呼べる。冪等性は `lastResetExecutedAt` で担保する。楽観ロックは counter 内部のトランザクションで対処する。

## リスク / 代替案

- **リスク: `GET /api/v1/today` のレスポンスタイムが増加する可能性**
  - リセット実行が必要な場合、全タスクのスキャンと DB 更新が発生する。日次リセットは 1 日 1 回のみ実行されるため、通常は判定のみ（`needsReset` が false）で終わる。影響は軽微と判断。
- **代替案: ミドルウェアでリセット判定**
  - `/today` ハンドラ固有のロジックを専用ミドルウェアに分離できるが、本 feature では `/today` のみがトリガー対象のため不要な抽象化。
- **代替案: `TaskRepository.bulkUpdate()` を新設**
  - 繰り越し対象タスクを 1 件ずつ更新するのではなく、bulk SQL 1 発で更新する方がシンプル。実装上は SQL の `WHERE dueDate = 'tomorrow' AND trashedAt IS NULL` 1 本で済む。implementer の判断で適切な方法を選ぶ。

## テスト方針

- **単体テスト（pure function）**: `calcTodayBoundaryAt` / `needsDailyReset` は入出力が単純な純関数のため、多数のテーブルテストを用意する。境界値（境界時刻の 1 秒前・ぴったり・1 秒後、midnight またぎ）を必ず含める。
- **結合テスト（in-memory repository）**: 既存の `server/__tests__/helpers/in-memory-repositories.ts` を使い、`maybeRunDailyReset` のトランザクション一貫性（繰り越し + counter リセット）を確認する。
- **API テスト（`POST /api/v1/reset`）**: 既存の Hono テストパターンに従い、executed=true / false・冪等性・認証エラーを確認する。
- **統合テスト（`GET /api/v1/today`）**: リセット前後で `completionCount` / タスクの `dueDate` が正しく変わることを確認する。
- **トランザクションのロールバック**: DB エラーを模倣してタスクと counter が中途半端に変わらないことを確認する（スタブで DB エラーを注入）。
