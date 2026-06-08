# 設計・実装計画: 今日の完了タスク数カウントの表示

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md), API は [`../../architecture/api/overview.md`](../../architecture/api/overview.md), DB は [`../../architecture/database/schema.md`](../../architecture/database/schema.md) を参照.

## 方針概要

- **Counter を独立した単一レコード** (`id = "singleton"`) として SQLite に追加. 物理スキーマ (drizzle) と Repository を新設し, 起動時 INSERT で 1 件常に存在させる (BL-006 / D-007 と同じ思想).
- **`GET /api/v1/counter` を実装**. 読取専用 (Idempotency-Key / If-Match 不要).
- **`POST /api/v1/tasks/:id/complete` ハンドラに「通常状態 → 完了に遷移したときだけ counter を +1」処理を統合**. 既ゴミ箱状態への no-op 経路では +1 しない. 同一トランザクション内で `tasks` 更新と `counter` 更新を行う (NFR-020).
- **`GET /api/v1/today` レスポンスに `completionCount: number` を追加**. BL-006 で `currentTaskId` を `/today` に同梱した前例と同じ思想で, 「今日ビューを 1 リクエストで完結」させる.
- **UI 側 `TodayView` を改修**. 今日の完了数を視覚的にユーザーに提示する (画面上部). 完了 / 削除 / 期限切替 mutation 後の `today()` 再フェッチでサーバ正本値を反映する (既に BL-006 で `refetchToday` が稼働しているので, `completionCount` も同じ流れで更新される).
- **本 feature では `PUT /api/v1/counter` `POST /api/v1/counter/reset` などのクライアント書き込み経路を提供しない**. 「+1」は完了 API 経由, 「0 クリア」は BL-010 のリセット API 経由のみ. ユーザーが直接補正する経路を持たないことで NFR-001 / NFR-012 を担保.

## 既存実装の調査結果

| 項目 | 現状 | 本実装で変更 |
| --- | --- | --- |
| Counter 論理スキーマ | [`architecture/database/schema.md`](../../architecture/database/schema.md) §Counter に定義あり (`id="singleton"`, `completedCount`, `lastResetExecutedAt`, `version`, `updatedAt`) | 変更なし (本書の決定と既に整合) |
| Counter 物理スキーマ (drizzle) | `server/src/db/schema.ts` に未定義 | `counter` テーブル + マイグレーションを追加 |
| Counter Repository | 未定義 (BL-006 で導入された `focus-repository.ts` と同じパターンが参考になる) | `server/src/data/counter-repository.ts` を新設 |
| `GET /api/v1/counter` ハンドラ | 未実装 (openapi.yaml に骨格のみ) | 新規実装 |
| `POST /tasks/:id/complete` の counter 連動 | 連動なし (`server/src/app.ts` L423-466 の complete ハンドラ. focus 解除は実装済) | 通常状態 → 完了の遷移が起きたときに counter を +1 する処理を追加. focus 解除と同じ位置 |
| `GET /api/v1/today` レスポンス | `{ tasks, nextTaskId, currentTaskId }` (BL-005 + BL-006) | `completionCount` を追加して `{ tasks, nextTaskId, currentTaskId, completionCount }` に拡張 |
| UI: TodayView の完了数表示 | 未実装 (`web/src/ui/today-view/today-view.tsx` には起票フォーム / 強調セクション / リストのみ) | 画面上部に「今日の完了: N」相当の要素を追加. `today()` の `completionCount` を表示 |
| UI: Repository に `completionCount` を受け取る型定義 | `today()` の戻り値型に `completionCount` が無い | 型を拡張. HTTP 層で JSON のフィールドを取り出す |
| `openapi.yaml` の `/counter` | path 骨格のみ (request/response schema 未定義) | 本仕様で詳細化 (`Counter` schema, GET 200 応答) |
| `openapi.yaml` の `TodayView` schema | `{ tasks, nextTaskId, currentTaskId }` で固定 | `completionCount` を required に追加 |

### 暫定実装の所在

- サーバ: `server/src/app.ts` L423-466 (complete ハンドラ) — counter を参照しない. focus 解除は実装済 (`clearFocusIfMatches`).
- サーバ DB: `server/src/db/schema.ts` — `counter` テーブルなし.
- サーバ Repository: `server/src/data/` 配下に `counter-repository.ts` なし. focus-repository.ts (BL-006) が singleton 単一レコードの参考実装.
- サーバ infra: `server/src/infra/persistence/drizzle/` 配下に `counter-repository.ts` なし. focus-repository.ts (BL-006) が参考実装.
- クライアント: `web/src/ui/today-view/today-view.tsx` — 完了数表示なし.
- クライアント Repository: `web/src/repositories/task-repository.ts` — `today()` の戻り値型に `completionCount` なし.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 新規実装 `GET /api/v1/counter`. 既存 `POST /tasks/:id/complete` のレスポンス契約は **変更なし** (内部で counter 連動の副作用が増えるのみ. レスポンスボディには counter 値を含めない: D-005). 既存 `GET /api/v1/today` のレスポンスに `completionCount: integer` フィールドを追加 (BL-005 / BL-006 の契約拡張). `openapi.yaml` の `/counter` ブロックに response schema 追記 + `TodayView` schema に `completionCount` 追加. 新規エラーコードは追加しない. |
| DB | `counter` テーブルを drizzle スキーマに追加 (`id` PK, `completed_count` INTEGER NOT NULL DEFAULT 0, `last_reset_executed_at` TEXT nullable, `updated_at` TEXT NOT NULL, `version` INTEGER NOT NULL DEFAULT 1). マイグレーションを 1 本追加し, 起動時に `INSERT INTO counter (id, completed_count, last_reset_executed_at, updated_at, version) VALUES ('singleton', 0, NULL, <now>, 1) ON CONFLICT DO NOTHING` で 1 件確保する. |
| ドメイン | (任意) 「+1 操作」を pure に書ける形に切り出すかは implementer 判断. ただし純関数化するなら `incrementCompletedCount(counter, clock): Counter` 程度の薄いラッパーで, ビジネスルール (「2 以上の値を弾く」等) は持たない. |
| サーバ | `server/src/data/counter-repository.ts` を新設. `server/src/infra/persistence/drizzle/counter-repository.ts` を新設. `server/src/app.ts` に `GET /api/v1/counter` ハンドラ追加. complete ハンドラに「通常状態 → 完了の遷移が起きたときだけ counter を +1」処理を追加 (focus 解除と同じ位置, 同一トランザクション内). `/today` ハンドラに `counter.completedCount` を含める処理を追加. `AppDeps` に `counterRepository: CounterRepository` を追加. |
| Web UI | `web/src/repositories/task-repository.ts` の `today()` 戻り値型に `completionCount: number` を追加. HTTP 実装で JSON フィールドを取り出す. `web/src/ui/today-view/today-view.tsx` を改修: (1) state に `completionCount` を保持, (2) 画面上部に「今日の完了: {completionCount}」相当を描画, (3) `refetchToday` で `today()` 再フェッチ時に `completionCount` も更新 (既存の流れにそのまま乗せる). |
| ドキュメント | `docs/developer/architecture/api/openapi.yaml` の `/counter` ブロック詳細化 (`components.schemas.Counter` の具体化, GET 応答スキーマ). `TodayView` schema に `completionCount` を `required` で追記. `docs/developer/architecture/api/overview.md` のリソース表の `/counter` 行を本機能の実装に合わせて補足. `docs/developer/architecture/database/overview.md` の物理スキーマ表に `counter` テーブルの詳細を追記. `docs/developer/planning/backlog.md` の BL-008 を「Done」へ更新 (マージ後). |

## 設計詳細

### データモデル

`counter` テーブル (drizzle スキーマ):

```ts
// server/src/db/schema.ts に追加
export const counter = sqliteTable("counter", {
  id: text("id").primaryKey().notNull(), // 固定値 "singleton"
  completedCount: integer("completed_count").notNull().default(0),
  lastResetExecutedAt: text("last_reset_executed_at"), // nullable. BL-010 で使う
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});
```

- 単一レコード前提のため CHECK 制約は不要 (PK が固定値 `"singleton"`).
- `lastResetExecutedAt` カラムは本 feature では値を **書き込まず読み取りもしない** が, schema.md §Counter および BL-010 との整合のため最初から持つ (D-003).
- 起動時に `INSERT ... ON CONFLICT DO NOTHING` で 1 件確保 (D-004).

### Repository インターフェース

```ts
// server/src/data/counter-repository.ts (新設)
export interface Counter {
  id: string;            // 固定値 "singleton"
  completedCount: number;
  lastResetExecutedAt: string | null;
  updatedAt: string;     // ISO 8601
  version: number;
}

export interface CounterRepository {
  /** singleton レコードを返す. 起動時 INSERT で必ず存在する前提. */
  get(): Promise<Counter>;
  /** singleton レコードを丸ごと上書きする. アプリ層が completedCount / version / updatedAt を渡す前提. */
  update(counter: Counter): Promise<void>;
}
```

- `increment()` のような特化メソッドはここに置かない (D-002: ハンドラ層で `get → +1 → update` の素直な流れにする. 楽観ロックも本 feature では不要).
- BL-010 で「リセット = `completedCount = 0`, `lastResetExecutedAt = <境界時刻>`, `version + 1`」を行う際も同じ `update()` を使う.

### API リソース定義

#### `GET /api/v1/counter`

- 認証必須. Idempotency-Key / If-Match 不要 (読取専用).
- 200 OK:
  ```json
  {
    "counter": {
      "id": "singleton",
      "completedCount": 3,
      "lastResetExecutedAt": null,
      "version": 4,
      "updatedAt": "2026-06-08T08:00:00.000Z"
    }
  }
  ```
- 401 UNAUTHORIZED: 認証なし.

#### `GET /api/v1/today` (拡張のみ)

- 既存契約 `{ tasks, nextTaskId, currentTaskId }` に `completionCount: integer` を追加し `{ tasks, nextTaskId, currentTaskId, completionCount }` を返す.
- 既存テスト (BL-005 / BL-006) は `completionCount` を参照していなければ壊れない. 追加フィールドは required で OpenAPI に書く (BL-006 / D-004 と同じ進め方).

### 処理フロー

#### 1. 完了アクションでの +1 集計 (FR-040 主シナリオ)

```
クライアント UI (完了ボタン押下)
  └─ web/repositories: taskRepository.complete({ id, ifMatch })
      └─ HTTP POST /api/v1/tasks/:id/complete
          ├─ middleware/auth: Bearer 検証
          ├─ middleware/idempotency: Idempotency-Key 検証 → 既処理なら保存応答
          └─ server: complete ハンドラ
              ├─ task = task-repository.findById(id)
              ├─ if task == null → 404
              ├─ if task.trashedAt !== null → no-op 200 { task } (既ゴミ箱経路. +1 しない)
              ├─ If-Match 検証 → 412 if 不一致
              ├─ db.transaction(() => {
              │     ├─ completed = completeTask(task, clock)
              │     ├─ task-repository.update(completed)
              │     ├─ counter = counter-repository.get()
              │     ├─ updated = { ...counter, completedCount: counter.completedCount + 1, version: counter.version + 1, updatedAt: now }
              │     ├─ counter-repository.update(updated)
              │     └─ focus 解除 (BL-006 既存処理. clearFocusIfMatches)
              │   })
              └─ 200 OK { task: completed } (counter 値はレスポンスに含めない: D-005)
```

- **同一トランザクション内** で task 更新 + counter +1 + focus 解除を行う (D-007).
- レスポンスボディには counter 値を含めない (D-005). クライアントは別途 `today()` を再フェッチして `completionCount` を反映する (既存の `refetchToday` の流れにそのまま乗せる).

#### 2. 既ゴミ箱状態への no-op (FR-006 / 冪等性)

```
既 complete 経路 (BL-003 既存) で no-op 200 を返す前に counter 連動を踏まない.
これは「if task.trashedAt !== null → 即座に 200 OK { task } を返す」ことで自然に担保される.
counter 更新ロジックは「task 状態遷移が実際に起きた直後」にのみ走る位置に置く.
```

#### 3. Counter 取得 (`GET /api/v1/counter`)

```
クライアント (任意)
  └─ HTTP GET /api/v1/counter
      ├─ middleware/auth: Bearer 検証 → 401 if NG
      └─ server: get-counter ハンドラ
          ├─ counter-repository.get() → Counter
          └─ 200 OK { counter }
```

#### 4. 今日ビュー取得 (`GET /api/v1/today` 拡張)

```
クライアント UI (起動 / 任意 mutation 後)
  └─ HTTP GET /api/v1/today
      └─ server: today ハンドラ (既存)
          ├─ active = task-repository.list({ trashed: "false" })
          ├─ todayTasks = sortToday(filterToday(active))
          ├─ nextTaskId = pickNextTaskId(todayTasks)
          ├─ focus = focus-repository.get()
          ├─ counter = counter-repository.get()  ← 本 feature で追加
          └─ 200 OK { tasks: todayTasks, nextTaskId, currentTaskId: focus.currentTaskId, completionCount: counter.completedCount }
```

### UI 設計 (TodayView 改修)

```
[ 今日 ]
[ 今日の完了: 3 ]   ← 画面上部. 数値部分が completionCount を反映 (D-008)
[ 起票フォーム ]    (既存)

[ 現在のタスク ]    (BL-006 既存. 大表示セクション)
  ┌──────────────────────────────┐
  │ A.name                       │
  │ [完了] [現在解除] [編集] ... │
  └──────────────────────────────┘

[ 他の今日のタスク ]  (既存. 通常リスト)
  - B.name [現在に設定] [完了] [削除] ...
  - C.name [現在に設定] [完了] [削除] ...
```

- 表示要素は「ラベル + 数値」の最小構成. アイコンや視覚装飾は implementer 裁量.
- 画面上部の固定セクションとして配置. 現在のタスク強調セクションよりも上に置くことで, 完了ボタン押下後に視線移動を最小化して +1 を体感できる.
- 完了ボタン押下 → `complete()` → `refetchToday()` (既存) で `completionCount` も更新される. 楽観 UI 的に手元で +1 してから差し戻す処理は **行わない** (NFR-013 の予測可能性のため, サーバ正本値のみを信頼する).
- 削除 / 期限切替 (today → tomorrow) でも `refetchToday()` が走り `completionCount` は維持される (= 数値が変わらない).
- 今日のタスクが 0 件でも完了数表示は出す (「今日の完了: 0」 / 「今日の完了: 5」 など).

### 例外 / エラー処理

| HTTP ステータス | code | 発生条件 |
| --- | --- | --- |
| 200 | - | GET /api/v1/counter 成功 / GET /api/v1/today 成功 |
| 401 | `UNAUTHORIZED` | 認証なし |
| 500 | `INTERNAL_ERROR` | 予期せぬ例外 (counter 連動が失敗した場合の rollback はトランザクションで担保) |

- `POST /tasks/:id/complete` のエラー応答契約は **本機能で変更しない**. counter 連動の副作用が失敗した場合は task 更新ごと rollback する (D-007).
- 新規エラーコードは追加しない.

## 重要な決定

- **D-001: Counter を独立した単一レコード (`id = "singleton"`) として SQLite に新設する**.
  - 理由: schema.md §Counter 既定義と一致. BL-006 の FocusSelection と同じ singleton レコードパターンで responsibility を独立させ, 将来 BL-010 (リセット処理) でも同じテーブルを更新するだけで済む.
  - 不採用案: Settings / FocusSelection と同じテーブルに同居 (schema.md §FocusSelection の「実装側裁量」). responsibility が混ざりテストが書きにくくなる.
- **D-002: 「+1 集計」は API ハンドラ内で同一トランザクション内に統合する (spec.md U-002 保守側案)**.
  - 理由: 既存の `POST /tasks/:id/complete` ハンドラに数行加えるだけで実装でき, BL-006 で `focus 解除` を同じ位置に追加した前例と整合する. ドメインイベントバスは現状のコードベースに存在せず, 本 feature のためだけに導入すると過剰実装.
  - 実装: `db.transaction(() => { task-repository.update + counter-repository.update + clearFocusIfMatches })` で atomic 化.
  - 不採用案: ドメインイベント駆動. 拡張性は高いが BL-024 (安定化) まで保守が増える.
- **D-003: `lastResetExecutedAt` カラムを本 feature で持つ (spec.md U-004 保守側案)**.
  - 理由: schema.md §Counter に既定義. テーブル定義を 2 回変更する手間を避ける. 本 feature では書き込み / 読み取りどちらもしないが, 「最初から持つ」方が drizzle スキーマと schema.md の乖離が無く済む.
  - 不採用案: 本 feature では持たず BL-010 でカラム追加マイグレーションを足す. テーブル変更 2 回, drizzle スキーマ - ドキュメント間の一時的な乖離が生じる.
- **D-004: 起動時に Counter 1 件を INSERT する (spec.md U-003 保守側案)**.
  - 理由: BL-006 (FocusSelection) D-007 と同じ方針で揃える. 単一レコード前提の lazy 生成はレース条件考慮が増える.
  - 実装手段: マイグレーション SQL に `INSERT OR IGNORE` を含めるか, 起動時 INSERT するか implementer 判断. ただし `get()` 実装が「無ければ初期値 upsert で返す」既存 FocusSelection と同じパターンを採るのが最も安全.
- **D-005: `POST /tasks/:id/complete` のレスポンスボディに counter 値を含めない**.
  - 理由: BL-003 で確定したレスポンス契約 (`{ task }`) を変更すると既存テストが壊れる. クライアントは `today()` 再フェッチで `completionCount` を反映するため, ハンドラレスポンスに含める必然性は無い.
  - 代替案: `{ task, counter }` で返す. 1 リクエストで完了結果と新しい counter 値を取れて効率は良いが, BL-003 既存契約と既存テスト影響が大きい. 「`/today` 再フェッチで完結」する設計指針 (BL-006 と同じ) で十分.
- **D-006: `GET /api/v1/today` レスポンスに `completionCount` を含める (spec.md U-001 保守側案)**.
  - 理由: BL-006 で `/today` に `currentTaskId` を含めた前例 (BL-006 D-004) と整合. 「今日ビューに必要な情報を 1 リクエストで完結」させる設計指針. クライアントは `today()` 再フェッチだけで全状態を更新できる.
  - 並行して `/counter` 単独エンドポイントも実装する. 将来 BL-009 (境界時刻設定) や BL-010 (リセット) や他画面が完了数だけを読みたい場面で素直な経路として残す.
  - 不採用案: `/counter` 単独のみ実装. クライアントは `/today` + `/counter` の 2 リクエスト並列フェッチになり, BL-006 の `currentTaskId` 同梱と一貫しない.
- **D-007: 完了 + counter 更新 + focus 解除は同一トランザクションで実行する**.
  - 理由: 「タスク状態だけ完了に進んで counter が +1 されない」「counter は +1 されたがタスク状態が戻った」という不整合を排除する (NFR-020).
  - 実装: better-sqlite3 の `db.transaction(() => { ... })` を complete ハンドラに導入. BL-006 D-005 で「focus 解除も同一トランザクション内が望ましい」と書かれており, 本 feature で trans wrapper を導入することで両方を満たせる. BL-006 が sequential 実行で済ませている場合は本 feature で transaction wrapper に移行する.
  - 不採用案: sequential 実行 (counter 更新失敗時は警告ログ + 次回の `get()` で整合性回復). 単一ユーザー前提では現実的に問題は起きにくいが, NFR-020 を明示的に担保する意味で transaction を選ぶ.
- **D-008: クライアント側は手元で +1 する楽観 UI を持たず, サーバ正本値の再フェッチで反映する**.
  - 理由: NFR-013 (今日ビューの予測可能性) を最も簡単に担保できる. 楽観 UI で手元の +1 とサーバ正本値が一時的にズレるシナリオ (network failure, 412 衝突など) を考えなくて済む.
  - 既存 `refetchToday` (BL-005 / BL-006) が完了 mutation 後に走るため, 追加実装はほぼ無い (state に `completionCount` を載せるだけ).
- **D-009: 本 feature では `PUT /api/v1/counter` / `POST /api/v1/counter/reset` を実装しない**.
  - 理由: NFR-001 単一ワークフロー / NFR-012 設定項目最小化. ユーザーが直接補正する経路を持たない方が体験が単純で, 「数字をリセットしたければ翌日になるまで待つ」という UC-001 の自然な区切りを尊重する.
  - リセットは BL-010 の責務. 同 feature が `/reset` (既骨格あり) で counter-repository を内部から呼び `completedCount = 0` に戻す.
- **D-010: Counter Repository は task-repository / focus-repository と同列の独立ファイルとする**.
  - 理由: モジュール境界の責務分離. BL-006 D-011 と同じ思想.
  - `server/src/data/counter-repository.ts` を新設し, `get(): Promise<Counter>` / `update(counter: Counter): Promise<void>` の 2 メソッドだけを公開する.
- **D-011: ADR は新規作成しない**.
  - 本 feature の決定は本 plan.md に書ききる. アーキテクチャ全体に波及する判断 (永続化機構の選定, API 設計指針) は ADR-0004 / ADR-0007 / ADR-0010 で既決. 必要があれば auditor 判断で軽量 ADR 化を検討.

## リスク / 代替案

- **R-001: BL-006 が transaction wrapper を導入していない場合, 本 feature での導入が既存テストに影響しうる**.
  - 既存 `server/src/app.ts` の complete ハンドラは task 更新と focus 解除を sequential に呼んでいる. 本 feature で transaction を導入する場合, BL-006 既存テスト (focus 連動シナリオ) が引き続き green であることを確認する.
  - 対策: tasks.md で「既存テスト全 green」を仕上げチェックに含める. transaction 導入で挙動が変わらないこと (テスト失敗が出ないこと) を確認.
- **R-002: 復元 + 再完了による「同じタスクの 2 重カウント」**.
  - 完了 → ゴミ箱 → BL-011 で復元 → 再度完了, という経路で同じタスクが 2 回カウントされる.
  - 仕様判断 (spec.md §非ゴール): 復元後の再完了は **新しい完了行為として +1** する. 利用者から見ても「やり直して終わらせた」を 1 回分カウントするのは妥当. 過去の +1 と相殺するロジックは持たない.
  - schema.md §Task §状態遷移とも整合 (「完了済み Task の復元も可能だが, 完了カウントは戻さない」).
- **R-003: ルーティン由来タスクと通常タスクが区別なくカウントされる**.
  - FR-040 は「完了タスク数」を単一値で扱うため区別しない方針 (spec.md §非ゴール).
  - リスク: ユーザーが「ルーティンを含めた数なのか除いた数なのか」を取り違える.
  - 対策: UI 文言を「今日の完了」など包括的にし, ルーティン区別を文言から想起させない. 「ルーティン含む完了数」「実タスクのみ」などの内訳表示は持たない (NFR-001 / OOS-008 整合).
- **R-004: 日次リセット (BL-010) との競合**.
  - BL-010 がカウントを 0 にしている最中に, 別経路で完了 +1 が走ると「リセット直後に 1 件残る」状態になりうる.
  - 対策: BL-010 の plan / 実装で「リセット処理は完了 API と直列化される (transaction で counter テーブルを取る)」ことを担保する. 本 feature の counter-repository.update() は version を含めて全フィールド上書きするので, BL-010 側の実装で `version` の楽観ロック相当を入れる余地がある (本 feature では使わないが土台は持つ).
- **R-005: `GET /api/v1/today` レスポンス契約変更 (`completionCount` 追加) が既存テストに影響しうる**.
  - BL-005 / BL-006 の既存テストは `{ tasks, nextTaskId, currentTaskId }` を期待しているが, `completionCount` を増やしても「期待していないフィールドが増えただけ」なら大半のテストは壊れない (JSON 比較が strict 等価でない限り).
  - 対策: tasks.md で「BL-005 / BL-006 既存テストが引き続き green」を仕上げチェックに含める. テストが strict 等価で壊れる場合は最小修正で追従 (新規フィールド追加に対する保守追従であり契約破壊ではない).
- **代替案 1: `POST /tasks/:id/complete` のレスポンスに `{ task, counter }` を含める**. D-005 で不採用. BL-003 既存契約と既存テスト影響が大きい.
- **代替案 2: クライアントが手元で +1 する楽観 UI**. D-008 で不採用. NFR-013 の予測可能性が崩れる.
- **代替案 3: Counter を FocusSelection / Settings と同じテーブルに同居**. D-001 で不採用. responsibility が混ざる.
- **代替案 4: ドメインイベント駆動の集計**. D-002 で不採用. 現コードベースに過剰実装.

## テスト方針

> 全体方針は [`../../quality/test-strategy.md`](../../quality/test-strategy.md). 本機能では以下のレベル分けで整理する.

### 単体テスト (サーバ純関数 / ドメイン)

- **対象**: (任意) `incrementCompletedCount(counter, clock)` のような薄い純関数を切り出した場合.
- **観点**:
  - `completedCount: 0 → 1`, `version + 1`, `updatedAt` 更新.
  - 既存値からの +1 が常に整数で動く.

### 結合テスト (サーバ API)

- **対象**: `GET /api/v1/counter` / `POST /api/v1/tasks/:id/complete` の counter 連動 / `GET /api/v1/today` の `completionCount` 同梱.
- **ツール**: Vitest + Hono Testing Helper + better-sqlite3 in-memory (既存パターン).
- **観点**: spec.md の受け入れ基準 (Gherkin) と 1:1 対応するシナリオ. 特に:
  - 初回 `GET /api/v1/counter` → 200 `{ counter: { completedCount: 0, version: 1, ... } }`.
  - 認証なし `GET /api/v1/counter` → 401.
  - 通常タスク完了 → `completedCount: 0 → 1`, `version: 1 → 2`.
  - 連続 2 件完了 → `completedCount: 2`.
  - 既ゴミ箱への再 complete → `completedCount` 不変.
  - 既 deleted への complete → `completedCount` 不変.
  - 削除 (`DELETE /tasks/:id`) → `completedCount` 不変.
  - 期限変更 (today → tomorrow) → `completedCount` 不変.
  - Idempotency-Key 再送 → 保存済み応答, `completedCount` は +1 だけ.
  - `GET /api/v1/today` レスポンスに `completionCount` が含まれる.
  - 完了直後の `GET /api/v1/today` の `completionCount` が反映されている.
- **既存テストの更新**:
  - `server/__tests__/integration/tasks.test.ts` の complete シナリオに「`completedCount` の副作用」アサーションを追加するかは implementer 判断. 重複を避けるなら counter 専用テストファイルに寄せる (BL-006 の focus.test.ts と同じ進め方).

### 単体テスト (クライアント)

- **対象**: `web/src/ui/today-view/today-view.tsx` の「今日の完了数」表示.
- **ツール**: Vitest + React Testing Library + 既存の `makeMockRepository` パターン拡張.
- **観点**:
  - `repository.today()` のレスポンスに `completionCount: N` が含まれていれば, 画面に「N」が描画される.
  - 完了 mutation 後の `refetchToday` で `completionCount` が更新される.
  - 削除 / 期限切替 mutation 後も再フェッチが走り, サーバ正本値 (本テストではモックの返り値) が反映される.
  - 今日のタスクが 0 件でも完了数表示は出る (例: 「今日の完了: 0」).
- **既存テストの更新**:
  - `web/__tests__/today-view.test.tsx` の `makeMockRepository` で `today()` の戻り値に `completionCount` を追加する. 既存テストは大半が `completionCount` を参照しないので, ヘルパが既定値 (例: 0) を返せば破綻しない.

### E2E (任意 / 段階的)

- **対象**: Web クライアント + サーバ + ファイル SQLite.
- **観点**:
  - 起動直後 `completionCount = 0` が表示される.
  - 完了アクションで表示が +1 する.
  - 削除 / 期限切替で表示が変わらない.
  - リロード後もサーバ正本値が復元される.

### カバレッジ目標

- サーバ純関数: 100% (薄い実装のため).
- API 層: 受け入れ基準シナリオの正常系 + 主要異常系 (401, Idempotency-Key 再送).
- UI 層: 完了数表示が初期描画 / 完了後 / 削除後 / 期限切替後の各タイミングで期待値どおりに描画されること.

### 重視するもの

- **「完了 → +1 / 削除・期限切替 → 不変」の対称性**. FR-006 と FR-007 の差分を結合テストで明示的に網羅する.
- **「Idempotency-Key 再送で +1 が +2 にならない」冪等性**. NFR-020 の根幹.
- **「既ゴミ箱への no-op complete では +1 しない」境界**. BL-003 D-003 で確定した no-op 経路と本 feature の +1 集計を分離して確認する.
- **BL-001 / BL-002 / BL-003 / BL-005 / BL-006 のテストが引き続き green** であること. `/today` への `completionCount` 追加, complete ハンドラへの transaction 導入が既存契約を壊していないこと.
