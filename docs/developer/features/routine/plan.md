# 設計・実装計画: ルーティン機能

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`routines` テーブルを新設し、Routine エンティティの CRUD を提供する。
日次リセット（`maybeRunDailyReset`）の処理順序を拡張し、
「前日ルーティンタスク物理削除 → 当日ルーティンタスク生成」を同一トランザクション内で実行する。
ルーティン由来タスクはゴミ箱を経由せず物理削除することで「履歴なし」（FR-034）を実現する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| DB | `routines` テーブルを新設（Drizzle マイグレーション追加）|
| ドメイン | `domain/src/routine/` パッケージを新設（Routine 型・バリデーション・ファクトリ）|
| サーバ | `RoutineRepository` インターフェースと Drizzle 実装を新設 |
| サーバ | `routine-crud.ts` ユースケースを新設（POST/GET/PATCH/DELETE）|
| サーバ | `daily-reset.ts` を拡張（前日削除・当日生成のステップを追加）|
| サーバ | ルーティング（`/api/v1/routines`, `/api/v1/routines/:id`）を追加 |
| Web | `HttpRoutineRepository` を新設 |
| Web | `/routines` ルートに `RoutinesView` を新設（一覧・作成・編集・削除）|
| Web | `TodayView` でルーティン由来タスクの「明日へ」ボタンを非表示にする |
| OpenAPI | `Routine` スキーマ / `/routines` エンドポイントのレスポンス定義を詳細化 |

## 設計詳細

### D-001 データモデル

#### Routine エンティティ（ドメイン層）

```typescript
interface Routine {
  id: string;              // UUID v4, クライアント採番
  name: string;            // 1〜200 文字, 制御文字禁止
  daysOfWeek: number[];    // 0=日〜6=土, 重複排除済み, 1 件以上
  defaultPriority: "highest" | "normal" | "later";
  version: number;
  createdAt: string;       // ISO 8601 UTC
  updatedAt: string;       // ISO 8601 UTC
}
```

#### routines テーブル（Drizzle スキーマ）

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| id | TEXT | PK NOT NULL | UUID v4 |
| name | TEXT | NOT NULL | 1〜200 文字, 制御文字禁止 |
| days_of_week | TEXT | NOT NULL | JSON 文字列（例: `"[1,2,3,4,5]"`）|
| default_priority | TEXT | NOT NULL | enum: "highest"/"normal"/"later" |
| version | INTEGER | NOT NULL DEFAULT 1 | 楽観ロック用 |
| created_at | TEXT | NOT NULL | ISO 8601 UTC |
| updated_at | TEXT | NOT NULL | ISO 8601 UTC |

`daysOfWeek` は SQLite に JSON 文字列として保存する。
repository 層でシリアライズ / デシリアライズを行い、ドメイン層では `number[]` として扱う。

### D-002 バリデーション規則

| フィールド | 規則 |
|---|---|
| name | 1 文字以上 200 文字以下, 制御文字（C0/DEL/C1）禁止。`validateTaskName` と同一ロジック |
| daysOfWeek | 空配列禁止, 各要素は 0〜6 の整数, 重複は排除して保存 |
| defaultPriority | "highest" / "normal" / "later" のいずれか |

エラーコード:
- `INVALID_ROUTINE_NAME` (400) — name バリデーション違反
- `INVALID_DAYS_OF_WEEK` (400) — 空配列 / 0〜6 以外の値を含む

### D-003 API 設計

#### POST /api/v1/routines

- ヘッダー: `Idempotency-Key` 必須
- リクエストボディ:
  ```json
  {
    "id": "<UUID v4>",
    "name": "朝の運動",
    "daysOfWeek": [1, 2, 3, 4, 5],
    "defaultPriority": "normal"
  }
  ```
- レスポンス: 201 `{ "routine": Routine }`
- 冪等性: 同一 Idempotency-Key なら保存済みレスポンスを返す

#### GET /api/v1/routines

- レスポンス: 200 `{ "routines": Routine[] }`
- 並び順: name 昇順（SQLite BINARY 照合、すなわち UTF-8 バイト順）

#### PATCH /api/v1/routines/:id

- ヘッダー: `Idempotency-Key` 必須, `If-Match` 必須
- リクエストボディ（部分上書き、省略フィールドは変更しない）:
  ```json
  {
    "name": "夜の運動",
    "daysOfWeek": [6, 0],
    "defaultPriority": "later"
  }
  ```
- レスポンス: 200 `{ "routine": Routine }` / 404 / 412
- 楽観ロック: If-Match の値と DB の version が不一致なら 412

#### DELETE /api/v1/routines/:id

- ヘッダー: `Idempotency-Key` 必須, `If-Match` 必須
- レスポンス: 204 / 404 / 412
- 副作用: 紐付くタスク（`tasks.routine_id = id` かつ `tasks.trashed_at IS NULL`）を物理削除する
  - 削除は同一トランザクション内で実行
  - trashedAt != null（完了済み / ゴミ箱済み）のタスクは対象外

### D-004 日次リセットへの統合

`maybeRunDailyReset` の処理順序を以下に拡張する。

**実行前提**: 当日の曜日は `dayBoundaryTime` と `clock.now()` の UTC 日付から算出する。

```
1. リセット要否判定（既存）
2. リセット不要なら早期リターン（既存）
3. 前日ルーティンタスク削除（新規）
   → origin="routine" かつ dueDate="today" かつ trashedAt=null のタスクを物理削除
4. tomorrow→today 繰越（既存）
5. 当日分ルーティンタスク生成（新規）
   → daysOfWeek に当日の曜日を含むルーティンを全件取得
   → 当日分がまだ生成されていないものに限りタスクを INSERT
   → tasks: origin="routine", routineId=routine.id, dueDate="today",
            name=routine.name, priority=routine.defaultPriority
6. counter リセット（既存）
7. purgeTrash（既存）
```

**重複生成防止**: ステップ 5 の直前にステップ 3 で前日タスクを削除済みのため、
当日境界日に同一 routineId のタスクが既に存在するかを確認することで二重生成を防ぐ。
具体的には `origin="routine" かつ routineId=R かつ dueDate="today" かつ trashedAt=null` が
存在する場合はスキップする。

**曜日算出**: `clock.now()` の ISO 8601 文字列から UTC 日付を取り出し `new Date(dateStr).getUTCDay()` で曜日（0=日〜6=土）を得る。

**依存注入**: `DailyResetDeps` に `routineRepository: RoutineRepository` を追加する。

### D-005 RoutineRepository インターフェース

```typescript
interface RoutineRepository {
  create(routine: Routine): Promise<void>;
  list(): Promise<Routine[]>; // name 昇順
  findById(id: string): Promise<Routine | null>;
  update(routine: Routine): Promise<void>;
  delete(id: string): Promise<void>;
  findByDayOfWeek(day: number): Promise<Routine[]>;
}
```

物理削除（`delete`）は `routines` テーブルから行を削除する。

### D-006 TaskRepository 拡張

以下のメソッドを追加する（既存インターフェースへの追記）。

```typescript
// origin="routine" かつ dueDate="today" かつ trashedAt=null のタスクを物理削除
deleteRoutineTasksForToday(): Promise<void>;

// 指定 routineId かつ dueDate="today" かつ trashedAt=null のタスクを 1 件取得（重複チェック用）
findTodayRoutineTask(routineId: string): Promise<Task | null>;

// ルーティンタスクを起票（origin="routine" 固定）
createRoutineTask(input: RoutineTaskInput): Promise<void>;

// 指定 routineId に紐付く未ゴミ箱タスクを物理削除（ルーティン削除時）
deleteByRoutineId(routineId: string): Promise<void>;
```

### D-007 DailyResetDeps 拡張

```typescript
interface DailyResetDeps {
  // 既存フィールドに追加
  routineRepository?: RoutineRepository; // optional: 未指定時はルーティン処理をスキップ
}
```

`routineRepository` が未指定の場合はルーティン関連ステップをスキップすることで、
既存テスト（`routineRepository` を注入しないもの）が壊れないようにする。

### D-008 Web クライアント

#### `/routines` ルート追加

`web/src/main.tsx` に `<Route path="/routines" element={<RoutinesView ... />} />` を追加する。

#### RoutinesView

- ルーティン一覧を表示（GET /api/v1/routines）
- 「追加」ボタンで作成フォームを開く
- 各ルーティンに「編集」「削除」ボタン
- 作成・編集フォーム: name, daysOfWeek（チェックボックス 7 つ）, defaultPriority（セレクト）

#### TodayView 変更

- タスク行の「明日へ」ボタン（dueDate を "tomorrow" に変更するアクション）を
  `task.origin === "routine"` の場合に非表示にする。
- ルーティン由来であることを示す視覚的インジケーター（任意: ルーティンアイコン等）を
  `task.origin === "routine"` の場合に表示する。

### D-009 OpenAPI スキーマ更新

`Routine` スキーマを詳細化し、`/routines` エンドポイントのリクエスト・レスポンスを追記する。
`ErrorCode` enum に `INVALID_ROUTINE_NAME`, `INVALID_DAYS_OF_WEEK`, `ROUTINE_NOT_FOUND` を追加する。

## 重要な決定

- **物理削除採用**: ルーティン由来タスクの翌日削除はゴミ箱経由ではなく物理削除とする。
  FR-034「実施履歴・ストリーク不要」に合致し、`GET /tasks?trashed=all` でも残骸が見えない。
- **UI 側で「明日へ」を非表示**: API 側で `PATCH /tasks/{id}` への `dueDate` 変更を禁止しない。
  禁止すると例外処理・エラーコードが増えて複雑になるため UI 制御に留める。
- **daysOfWeek 重複排除**: サーバ側で重複を排除して保存する（クライアント送信の重複は許容）。
- **routineRepository optional**: 既存の daily-reset テストへの後方互換を保つため
  `DailyResetDeps.routineRepository` は optional にする。

## リスク / 代替案

- **SQLite の JSON 保存**: `daysOfWeek` を JSON 文字列で保存するため、
  SQL レベルでの曜日フィルタリングが困難。ただし件数が多くても数百件規模のため
  アプリケーション層でフィルタリングしても性能上問題ない。
- **物理削除の取り消し不可**: ルーティンタスクが物理削除されると復元できない。
  これは FR-034 の仕様であり、ユーザーが誤操作時に困る可能性があるが、
  「ルーティン由来タスクは記録を残さない」という設計の帰結として受け入れる。

## テスト方針

- **ドメイン単体テスト**: `validateRoutineName`, `validateDaysOfWeek`, `createRoutine`, `updateRoutine` の各関数をバリデーション境界値で網羅。
- **ユースケース単体テスト**: `routine-crud.ts` のルーティン作成・編集・削除・一覧を
  インメモリリポジトリで検証。冪等性（Idempotency-Key 重複）も確認。
- **日次リセット統合テスト**: `maybeRunDailyReset` に `routineRepository` を注入し、
  「前日削除 → 当日生成 → 重複なし」の一連フローを確認。
- **E2E / 受け入れテスト**: `/api/v1/routines` エンドポイントの HTTP レベルでの動作確認、
  および `/api/v1/reset` 経由でのタスク生成確認。
