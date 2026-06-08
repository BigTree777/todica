# タスク: ルーティン機能

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## フェーズ 1: ドメイン層

- [ ] T-001: `domain/src/routine/index.ts` を新設
  - `Routine` 型 / `RoutineInput` 型 / `UpdateRoutineInput` 型を定義する
  - `validateRoutineName(name: string)` を実装する（task の同名関数と同ロジック）
  - `validateDaysOfWeek(days: unknown)` を実装する（空配列禁止・0〜6 整数のみ・重複排除）
  - `validateDefaultPriority(priority: unknown)` を実装する
  - `createRoutine(input, clock)` ファクトリ関数を実装する
  - `updateRoutine(current, patch, clock)` 部分更新関数を実装する
- [ ] T-002: `domain/src/index.ts`（または `domain/src/routine/index.ts` のエクスポート）に Routine 関連を追加する

## フェーズ 2: DB / サーバ基盤

- [ ] T-003: `server/src/db/schema.ts` に `routines` テーブル定義を追加する（plan.md D-001 参照）
  - `id`, `name`, `daysOfWeek`（JSON 文字列）, `defaultPriority`, `version`, `createdAt`, `updatedAt`
- [ ] T-004: Drizzle マイグレーションを生成する（`drizzle-kit generate` 相当）
- [ ] T-005: `server/src/data/routine-repository.ts` を新設する
  - `RoutineRepository` インターフェースを定義する（plan.md D-005 参照）
  - Drizzle を使った `DrizzleRoutineRepository` 実装クラスを実装する
  - `daysOfWeek` の JSON シリアライズ / デシリアライズを実装する（重複排除もここで行う）
  - `list()` は name 昇順（`ORDER BY name ASC`）で返す
- [ ] T-006: `server/src/data/task-repository.ts` のインターフェースおよび Drizzle 実装に以下を追加する（plan.md D-006 参照）
  - `deleteRoutineTasksForToday()`: origin="routine" かつ dueDate="today" かつ trashedAt=null の物理削除
  - `findTodayRoutineTask(routineId)`: 重複チェック用
  - `createRoutineTask(input)`: origin="routine" 固定のタスク INSERT
  - `deleteByRoutineId(routineId)`: ルーティン削除時の紐付きタスク物理削除

## フェーズ 3: ユースケース

- [ ] T-007: `server/src/use-cases/routine-crud.ts` を新設する
  - `createRoutine(deps, input)`: POST に対応。Idempotency-Key 冪等性あり
  - `listRoutines(deps)`: GET に対応
  - `updateRoutine(deps, id, patch, ifMatch)`: PATCH に対応。楽観ロック（If-Match）あり
  - `deleteRoutine(deps, id, ifMatch)`: DELETE に対応。楽観ロックあり。紐付きタスクも削除
- [ ] T-008: `server/src/use-cases/daily-reset.ts` を拡張する（plan.md D-004 参照）
  - `DailyResetDeps` に `routineRepository?: RoutineRepository` を追加する
  - `maybeRunDailyReset` の処理順序に以下を挿入する
    1. 前日ルーティンタスク削除（ステップ 3）
    2. 当日ルーティンタスク生成（ステップ 5）
  - 曜日算出ロジック（`calcDayOfWeek(nowIso)` 純関数）を追加する
  - `routineRepository` が undefined の場合はルーティン処理をスキップする（後方互換）

## フェーズ 4: HTTP ルーティング

- [ ] T-009: サーバルーター（Hono 等の既存ルーティング層）に `/api/v1/routines` を登録する
  - `POST /api/v1/routines`
  - `GET /api/v1/routines`
  - `PATCH /api/v1/routines/:id`
  - `DELETE /api/v1/routines/:id`
- [ ] T-010: サーバ起動時に `DrizzleRoutineRepository` を DI コンテナ（または deps オブジェクト）に追加する

## フェーズ 5: Web クライアント

- [ ] T-011: `web/src/repositories/routine-repository.ts` を新設する
  - `RoutineRepository` インターフェース（Web 側）を定義する
  - `HttpRoutineRepository` を実装する（GET / POST / PATCH / DELETE を呼ぶ）
- [ ] T-012: `web/src/ui/routines-view/routines-view.tsx` を新設する
  - ルーティン一覧の表示
  - 作成フォーム（name, daysOfWeek チェックボックス, defaultPriority セレクト）
  - 編集フォーム（既存データの初期値表示）
  - 削除確認ダイアログ
- [ ] T-013: `web/src/main.tsx` に `<Route path="/routines" element={<RoutinesView ... />} />` を追加する
- [ ] T-014: `TodayView` のタスク行を修正する
  - `task.origin === "routine"` の場合に「明日へ」ボタンを非表示にする
  - （任意）`task.origin === "routine"` の場合にルーティン由来であることを示すインジケーターを表示する

## フェーズ 6: OpenAPI 更新

- [ ] T-015: `docs/developer/architecture/api/openapi.yaml` を更新する
  - `Routine` スキーマを詳細化する（plan.md D-001 のフィールドをすべて記載）
  - `RoutineInput` / `RoutinePatch` スキーマを追加する
  - `POST /routines` / `GET /routines` / `PATCH /routines/{id}` / `DELETE /routines/{id}` のリクエスト・レスポンスを詳細化する
  - `ErrorCode` enum に `INVALID_ROUTINE_NAME`, `INVALID_DAYS_OF_WEEK`, `ROUTINE_NOT_FOUND` を追加する

## テスト

- [ ] T-016: ドメイン単体テスト（`domain/src/routine/index.test.ts`）
  - `validateRoutineName`: 空文字・201 文字・制御文字・正常値を検証
  - `validateDaysOfWeek`: 空配列・7 以上の値・重複・正常値を検証
  - `createRoutine`: 正常系・バリデーション失敗系を検証
  - `updateRoutine`: 部分更新・バリデーション失敗系を検証
- [ ] T-017: `RoutineRepository` 単体テスト（インメモリまたは SQLite インメモリ）
  - create / list（name 昇順確認）/ findById / update / delete / findByDayOfWeek を検証
  - daysOfWeek の重複排除が DB 保存時に行われることを検証
- [ ] T-018: `routine-crud.ts` ユースケーステスト（インメモリリポジトリ使用）
  - createRoutine: 正常系・Idempotency-Key 重複・バリデーション失敗を検証
  - listRoutines: name 昇順を検証
  - updateRoutine: 正常系・version 不一致（412）・ROUTINE_NOT_FOUND（404）を検証
  - deleteRoutine: 正常系・紐付きタスクの物理削除・version 不一致（412）を検証
- [ ] T-019: `daily-reset.ts` 拡張テスト（インメモリリポジトリ使用）
  - 前日ルーティンタスクが物理削除されることを検証（AC: 翌日非持越し）
  - 当日曜日に該当するルーティンのタスクが生成されることを検証
  - 当日曜日に非該当のルーティンのタスクが生成されないことを検証
  - 同一境界日での二重実行でタスクが重複しないことを検証
  - 完了済みルーティンタスク（trashedAt != null）が削除対象にならないことを検証
  - `routineRepository` 未注入時に既存動作が変わらないことを検証（後方互換）
- [ ] T-020: HTTP エンドポイント結合テスト
  - POST /routines → 201 / 重複 Idempotency-Key → 201 同じレスポンス
  - GET /routines → 200 / name 昇順
  - PATCH /routines/:id → 200 / 412 / 404
  - DELETE /routines/:id → 204 / 紐付きタスク削除確認

## ドキュメント

- [ ] T-021: `docs/developer/database/schema.md` に `routines` テーブルを追記する

## 仕上げ

- [ ] 受け入れ基準（spec.md）を全て満たすことを確認
- [ ] レビュー依頼
