# 設計・実装計画: サーバアプリケーション層の抽出（server-app-layer-extraction）

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`server/src/app/` を新設し、各 API ルータのハンドラに直書きされている「ドメイン純関数の呼び出し順序の組み立て・Repository アクセス順序・トランザクション境界指定・focus 自動解除や counter +1 のオーケストレーション」を、HTTP に依存しないユースケース関数として抽出する。ルータは「入力パース → ユースケース呼び出し → 結果を HTTP へ写像」だけを行う薄い presentational に整理する。外部から観測可能な API 挙動は不変とし、振る舞いは既存テスト（vitest / Playwright）で担保する純粋なリファクタとする。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし（`api/openapi.yaml`・ステータス・ボディ・エラーコード・冪等性・楽観ロックは不変） |
| DB | 変更なし（`server/src/db/schema.ts` 無改修） |
| モジュール | 新規 `server/src/app/*.ts`（9 ファイル: task / project / routine / focus / counter / settings / trash / reset / today）。既存 `server/src/routers/*.ts`（auth.ts を除く）をユースケース呼び出しへリファクタ。`server/src/data/*` インターフェース・`server/src/infra/persistence/*` 永続化アダプタ・`@todica/domain/*` は無改修。`server/src/use-cases/`（daily-reset / purge-trash）・`server/src/today.ts`（純関数）は無改修で再利用。`routers/auth.ts` はスコープ外で無改修 |
| UI | 変更なし |

## 設計詳細

### ディレクトリと配置

```
server/src/app/
  task-usecases.ts      # create / update / complete / delete / restore
  project-usecases.ts   # create / update / delete(カスケード NULL + Tx)
  routine-usecases.ts   # create / update / delete(カスケード delete + Tx)
  focus-usecases.ts     # get / setCurrentTask(入力検証)
  counter-usecases.ts   # get
  settings-usecases.ts  # get / updateDayBoundaryTime(検証 + 楽観ロック)
  trash-usecases.ts     # list / restore / purgeAll
  reset-usecases.ts     # runDailyResetIfNeeded(maybeRunDailyReset ラッパ)
  today-usecases.ts     # getTodayView（today.ts 抽出: D-U2 で確定）
```

> `routers/auth.ts`（セッション / パスワード管理）はスコープ外につき対応する `auth-usecases.ts` は作らない。app/ 配下は上記 9 モジュールで確定。

各ユースケースモジュールは関数の集合（クラス不要）。引数は `AppDeps` の必要な依存（Repository インターフェース・Clock・任意で db）と、パース済みの入力 DTO。`hono` の `Context` は受け取らない。

### ユースケースの入出力契約（HTTP 非依存）

ユースケースは例外を投げず、discriminated union の結果値を返す。ルータがこの結果を HTTP ステータス・ボディへ写像する。代表形:

```
type UsecaseResult<T> =
  | { kind: "ok"; value: T }                       // 200 / 201 / 204 系へ写像
  | { kind: "invalid"; code: string; message: string } // 400 へ
  | { kind: "notFound"; code: string; message: string } // 404 へ
  | { kind: "conflict"; current: T }               // 412 へ（現行値同梱）
  | { kind: "noop"; value: T };                    // 既ゴミ箱再操作などの冪等 no-op
```

> 上記はガイドであり、実装者がエンティティ単位で必要な variant のみを採用してよい。重要なのは「HTTP の語彙をユースケースに持ち込まない」「ルータが結果 → HTTP を一元的に写像する」こと。各ステータスとボディは現状の挙動（spec.md AC-4〜AC-12）に厳密一致させる。

### 各ユースケースの責務

- task-usecases:
  - `createTask`: id / name / projectId / dueDate / priority の検証順序、projectId 参照整合チェック（`projectRepository.exists`）、ドメイン `createTask` 呼び出し、`taskRepository.insert`。
  - `updateTask`: 検証 → `taskRepository.findById` → 楽観ロック → ドメイン `updateTask` → `taskRepository.update` → dueDate=tomorrow 時の focus 自動解除。
  - `completeTask`: `findById` → 既ゴミ箱 no-op（If-Match スキップ）→ 楽観ロック → ドメイン `completeTask` → `update` → counter 取得・`incrementCompletedCount`・更新 → focus 自動解除。「通常 → 完了」遷移時のみ counter +1 という現挙動を厳守。
  - `deleteTask`: `findById` → 既 deleted no-op(204) → 楽観ロック → ドメイン `trashTask` → `update` → focus 自動解除。
  - `restoreTask` はゴミ箱所管のため trash-usecases に置く（後述）。
- project-usecases:
  - `createProject` / `updateProject`: 名前検証 + ドメイン純関数 + Repository。
  - `deleteProject`: `findById` → 楽観ロック → カスケード NULL 化 + プロジェクト削除を**ユースケース内でトランザクション境界指定**（`db` がある場合 `db.transaction`、ない場合は `taskRepository.nullifyProjectId` → `projectRepository.delete` のフォールバック。現挙動を踏襲）。
- routine-usecases:
  - `createRoutine` / `updateRoutine`: 各 `validate*` + ドメイン純関数 + Repository。
  - `deleteRoutine`: `findById` → 楽観ロック → 配下未ゴミ箱タスク削除 + ルーティン削除を**ユースケース内でトランザクション境界指定**（`db` がある場合 `db.transaction`、ない場合 `taskRepository.deleteByRoutineId` → `routineRepository.delete`）。
- focus-usecases:
  - `getFocus`: `focusRepository.get`。
  - `setFocus`: 楽観ロック → 対象タスクの存在 / ゴミ箱 / dueDate=today 検証 → `setCurrentTask` → `focusRepository.update`。`taskId=null` は解除。
  - `clearFocusIfMatches`（現 `_shared.ts`）相当を focus-usecases へ移し、task-usecases から内部利用する。
- counter-usecases: `getCounter`。
- settings-usecases:
  - `getSettings`。
  - `updateDayBoundaryTime`: `validateDayBoundaryTime` → 楽観ロック → 更新オブジェクト組み立て（version+1 / updatedAt） → `settingsRepository.update`。
- trash-usecases:
  - `listTrash`: `taskRepository.list({ trashed: "true" })`。
  - `restoreTask`: `findById` → 未ゴミ箱なら 400 → 楽観ロック → ドメイン `restoreTask` → `update`。
  - `purgeTrash`: `taskRepository.deleteAllTrashed`。
- reset-usecases:
  - `runDailyResetIfNeeded`: `maybeRunDailyReset`（`server/src/use-cases/daily-reset.ts`）を呼び結果を整形して返す薄いラッパ。reset ルータ と today ユースケースが共用する。
- today-usecases（D-U2 で確定。抽出対象に含める）:
  - `getTodayView`: `runDailyResetIfNeeded` → `taskRepository.list({trashed:"false"})` → `filterToday`/`sortToday`/`pickNextTaskId`（`server/src/today.ts` 再利用）→ focus / counter 取得 → ビュー DTO 返却。

### ルータの再構成（presentational）

各ルータハンドラは以下に縮約する。

1. ヘッダ / クエリ / body のパース（`c.req.*`）と HTTP 起因の早期 400（JSON パース不可・If-Match 欠落の形式エラー）。
2. パース済み入力でユースケースを 1 回呼ぶ。
3. ユースケース結果（discriminated union）を `saveAndReturn` / `errorJson` / `c.json` で HTTP へ写像。
4. レスポンス整列が必要な箇所（GET /tasks の `sortTasks`）は presentational helper として残してよい。

ルータが引き続き呼んでよい helper（`_shared.ts`）: `saveAndReturn` / `errorJson` / `sortTasks`。`clearFocusIfMatches` は focus-usecases へ移設し、ルータから直接は呼ばない。

### 処理フロー（例: タスク完了の現挙動の保存）

```
POST /tasks/:id/complete
  router: id を param から取得
        → taskUsecases.completeTask(deps, { id, ifMatchHeader }) を呼ぶ
  usecase:
    findById(id) なし          → { kind:"notFound", code:"TASK_NOT_FOUND" }
    trashedAt !== null         → { kind:"noop", value: current }      // If-Match スキップ
    If-Match 欠落 / 非数値      → { kind:"invalid", code:"MISSING_IF_MATCH" }
    version 不一致             → { kind:"conflict", current }
    completeTask → update
      → counter.get → incrementCompletedCount → counter.update   // 通常→完了 のときだけ
      → clearFocusIfMatches(id)
    → { kind:"ok", value: completed }
  router: 結果 → 200/404/400/412 + saveAndReturn で Idempotency 保存
```

> If-Match のパース（ヘッダ → 数値）を「ルータが行うか／ユースケースが行うか」は実装者裁量。ただし「If-Match スキップ条件（既ゴミ箱 complete・既 deleted delete）」はユースケースの判断に属するため、ユースケースが ifMatch を受け取り検証する形を推奨する。現挙動（既ゴミ箱時の検証スキップ）を厳守すること。

### 例外 / エラー処理

- ユースケースは値で結果を返す（例外を投げない）。ドメイン層の `Result` を尊重し、ルータの既存エラーコード・メッセージ文言を 1 対 1 で維持する。
- Idempotency-Key への保存（`saveAndReturn`）はルータ層に残す。ユースケースは保存対象のステータス・ボディを決める材料（結果値）を返すだけにする。

## 重要な決定

- D-1: アプリケーション層は HTTP 非依存とし、`hono` の `Context` を受け取らない。入力はパース済み DTO、出力は discriminated union（`ok` / `invalid` / `notFound` / `conflict` / `noop`）。これにより §2 / §5.2 / §6 と整合する（D-U3 で確定）。既存 ADR の方針（§6 のエラー値表現）に沿うため新規 ADR は必須としない。
- D-2: トランザクション境界（プロジェクト削除・ルーティン削除のカスケード）をユースケース内へ閉じ込め、ルータからは関数 1 呼び出しで完結させる。`db` 有無のフォールバック分岐もユースケース内に閉じる。
- D-3: `clearFocusIfMatches` を `_shared.ts`（presentational）から focus-usecases（アプリケーション層）へ移す。focus 自動解除はビジネス手続きでありルータの責務ではないため。
- D-4: `reset-usecases` は `server/src/use-cases/daily-reset.ts` の `maybeRunDailyReset` を再利用するラッパとし、既存 `use-cases/` ディレクトリは無改修（D-U1 で確定）。二重化整理は別 BL 候補。
- D-5: `today.ts` をアプリケーション層対象に含め、`today-usecases.ts` を追加して 9 モジュール構成とする（D-U2 で確定）。`routers/auth.ts` はスコープ外につき対応ユースケースは作らない。

## リスク / 代替案

- リスク: 抽出中に「通常 → 完了のときだけ counter +1」「既ゴミ箱時の If-Match スキップ」など現挙動の機微な条件を取りこぼすと振る舞いが変わる。→ 既存 vitest / Playwright を抽出前に green 確認し、各リファクタ後に再実行して回帰検出する。
- リスク: If-Match パース責務の置き場所がルータ / ユースケースで割れると重複や齟齬が出る。→ D の方針（ユースケースが ifMatch 受領）で統一する。
- 代替案: ルータ内に薄い「サービス関数」を同ファイルで分けるだけに留める案。→ §4.1 が独立モジュール（`server/app/*`）を要求し、独立ディレクトリ存在が完了の目安（BL-115）に含まれるため不採用。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 既存の API ハンドラテスト（`server/__tests__/integration/` / `server/__tests__/unit/`）を**無改修で green 維持**することを第一の合格条件とする（振る舞い不変の担保）。
- 重点確認: spec.md の AC-4〜AC-12（counter +1 条件 / focus 自動解除 / カスケード Tx / 入力検証 / 楽観ロック / 冪等 no-op）。
- 追加余地: ユースケース層の直接単体テスト（HTTP を介さない呼び出し）。必要性は test-designer が判断（D-U4）。
- AC-2 / AC-3（ルータにドメイン直呼びが残らない / app が Context 非依存）は、import 検査・静的検査（grep / lint ルール）で機械的に検証することを推奨。
