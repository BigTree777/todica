# 設計・実装計画: タスク完了アクション（ゴミ箱経由 + カウント +1）

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす. BL-001（タスク CRUD）と BL-002（タスク優先度）が main にマージ済であることを前提とし, **両 BL で確立した経路（POST 共通ミドルウェア / Idempotency-Key / If-Match / version 採番 / 暫定 3 段ソート / `trashedAt` 立ち上げ）を再利用** する.

## 方針概要

- 本 feature は新規エンドポイント **`POST /api/v1/tasks/{id}/complete`** を 1 本追加し, ドメイン層に **`completeTask` 関数** を新設し, Web UI に **「完了」ボタン** を 1 つ追加する, 純粋な機能拡張である.
- データモデル変更は **一切ない**. 既存 `tasks.trashed_at` / `tasks.trashed_reason` カラム（BL-001 で確定済, schema.md §Task）を使い回す.
- 「完了で `completedCount` が +1」される **集計側は Counter（BL-008）が担当**. 本 feature は **遷移を残すところまで** を責務とし, Counter 関連の Repository / API は触らない.

## 既存実装の調査結果

> 「BL-003 で新たに必要なもの」を最小化するため, BL-001 / BL-002 マージ済の実装を実際に読み, FR-006 / FR-060 / 関連 NFR への充足状況を一覧化する.

### 調査対象ファイル

- `domain/src/task/index.ts`（ドメイン: Task 型, `trashTask`, `validatePriority` 等）
- `server/src/app.ts`（Hono アプリ. 共通ミドルウェア + 既存 CRUD ハンドラ）
- `server/__tests__/integration/tasks.test.ts`（結合テスト）
- `server/__tests__/helpers/build-test-app.ts`, `in-memory-repositories.ts`（テスト用配線）
- `web/src/ui/today-view/today-view.tsx`（今日ビュー UI）
- `web/src/repositories/task-repository.ts`（クライアント Repository インターフェース + HTTP 実装）
- `docs/developer/architecture/api/openapi.yaml`（`Task` / `TaskInput` / `TaskPatch` スキーマ, `/tasks/{id}/complete` の骨格定義）
- `docs/developer/architecture/database/schema.md` §Task（`trashedReason` 列挙と状態遷移）

### 充足状況

| 項目 | 既存実装の状態 | BL-003 で追加が必要か | 備考 |
| --- | --- | --- | --- |
| Task 型に `trashedReason: "completed" | "deleted" | null` | 既存 | 不要 | `domain/src/task/index.ts` L18 |
| Task 型に `trashedAt: string | null` | 既存 | 不要 | 同 L34 |
| ドメイン `trashTask`（`trashedReason = "deleted"` 固定で論理削除） | 既存 | 不要（流用しない. 別関数を新設） | 同 L202-218. 既存呼び出し側（DELETE ハンドラ）の挙動を変えないため, この関数のシグネチャは触らない. |
| **ドメイン `completeTask`（`trashedReason = "completed"` を書く論理削除）** | **未実装** | **必要** | 本 feature で新設. D-002 参照. |
| Task の `isTrashed` ヘルパ | 既存 | 不要 | 同 L221-223 |
| 共通ミドルウェア: Bearer 認証 | 既存 | 不要 | `server/src/app.ts` L47-62 |
| 共通ミドルウェア: Idempotency-Key 受理 / 保管 / 再送応答 | 既存 | 不要 | 同 L65-94 |
| 共通ヘルパ: `saveAndReturn` で応答を idempotency_keys に保管 | 既存 | 不要 | 同 L344-359 |
| If-Match パース + 412 応答パターン | 既存（PATCH / DELETE ハンドラ内に展開済） | 流用 | 同 L197-211, L301-331. 本 feature の complete ハンドラも同パターンを踏襲する. |
| **POST `/api/v1/tasks/{id}/complete` ハンドラ** | **未実装** | **必要** | `server/src/app.ts` に存在しない. spec.md の全シナリオに対応するロジックを新設する. |
| GET `/api/v1/tasks?trashed=false` で完了済が外れる挙動 | 既存（`trashedAt != null` ですべて除外） | 不要 | 同 L182-191. 完了済も `trashedAt != null` のため自動で除外される. |
| GET `/api/v1/tasks?trashed=true` で完了済が含まれる挙動 | 既存 | 不要 | 同上. |
| InMemoryTaskRepository（テスト用） | 既存 | 流用 | `seed` + `findById` + `update` が揃っており本 feature の追加テストでそのまま使える. |
| OpenAPI: `POST /tasks/{id}/complete` の path 骨格 | 既存（responses 詳細・成功 body は未定義. 200 のみ宣言） | **拡充** | `openapi.yaml` L142-155. 200 OK の content に `Task` ボディを追記 + 400 / 404 / 412 のエラーレスポンスを追記する. |
| OpenAPI: `ErrorCode` enum に既存値（`MISSING_IF_MATCH`, `MISSING_IDEMPOTENCY_KEY`, `TASK_NOT_FOUND`, `UNAUTHORIZED`） | 既存 | 不要 | 同 L594-608. complete の 400 / 404 はこの集合で表現できる. 新規コードは不要. |
| **Web `TaskRepository` インターフェースに `complete` メソッド** | **未実装** | **必要** | `web/src/repositories/task-repository.ts` L48-53 に存在しない. |
| **Web `HttpTaskRepository.complete` 実装** | **未実装** | **必要** | 同ファイル L103-219. `update` / `delete` と同パターンで実装する. |
| **Web UI: タスク行の「完了」ボタン + ハンドラ** | **未実装** | **必要** | `today-view.tsx` の `<li>` には削除 / 編集 / 期限切替 / 優先度切替はあるが「完了」は無い. |
| Counter エンティティ / `completedCount` 集計 / Counter Repository | **未実装** | **本 feature では追加しない** | BL-008 の責務. 本 feature の complete ハンドラ実装は Counter を呼ばない. spec.md §「スコープ境界の明示」シナリオで担保. |
| FocusSelection エンティティ / 自動繰り上げ | **未実装** | **本 feature では追加しない** | BL-006 の責務. 同上. |
| 結合テスト: complete の網羅シナリオ | **未実装** | **追加** | `tasks.test.ts` に complete 関連が一切無い. spec.md の Gherkin と 1:1 のテストを追加. |
| UI 単体テスト: 完了ボタン関連 | **未実装** | **追加** | `today-view.test.tsx` に完了関連が無い. |

### スコープ最小化の結論

本 feature は **「complete エンドポイント 1 本」「ドメイン関数 1 本」「UI 完了ボタン 1 つ」「Repository.complete 1 メソッド」「OpenAPI のレスポンス拡充」「該当する追加テスト」のみ** に絞る. **データモデル変更・新規ミドルウェア・Counter / FocusSelection 関連の実装は一切行わない**.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | **新規エンドポイント `POST /api/v1/tasks/{id}/complete`** を追加. ステータスは 200（成功・冪等再送・既ゴミ箱の no-op）/ 400（`MISSING_IF_MATCH` / `MISSING_IDEMPOTENCY_KEY`）/ 401（既存）/ 404（`TASK_NOT_FOUND`）/ 412（version 不一致）. 既存エンドポイントは変更なし. |
| DB | **変更なし**. `tasks.trashed_at` / `tasks.trashed_reason` カラムは BL-001 で確定済を流用. マイグレーションは不要. |
| モジュール | サーバ: `server/src/app.ts` に complete ハンドラを 1 つ追加（PATCH / DELETE と並列に配置）. ドメイン: `domain/src/task/index.ts` に `completeTask` 関数を新設. クライアント: `web/src/repositories/task-repository.ts` の `TaskRepository` インターフェースに `complete` メソッドを追加 + `HttpTaskRepository.complete` を実装. UI: `web/src/ui/today-view/today-view.tsx` のタスク行に「完了」ボタンを追加 + `handleComplete` ハンドラ. |
| UI | タスク行に「完了」ボタンを 1 つ追加（既存「編集 / 期限切替 / 優先度切替 / 削除」と並列, NFR-001 / NFR-010 に整合）. 確認ダイアログは出さない. 完了成功で行が一覧から消える楽観 UI. |
| ドキュメント | `docs/developer/architecture/api/openapi.yaml` の `POST /tasks/{id}/complete` レスポンスを 200 / 400 / 401 / 404 / 412 に拡充. `database/schema.md` は変更なし（既に「完了 → `trashedReason = "completed"`」が記載済）. `planning/backlog.md` の BL-003 を Done に更新（マージ後）. ADR は新規作成しない. |

## 設計詳細

### データモデル

変更なし. 本 feature が読み書きするカラムは以下のみ.

- `tasks.trashed_at`: NULL → ISO 8601 にする（完了時）.
- `tasks.trashed_reason`: NULL → `"completed"` にする.
- `tasks.updated_at`: `clock.now()` で更新.
- `tasks.version`: `+ 1`.

`tasks.trashed_reason` の値域は `CHECK("completed" | "deleted")` であり, 既存 schema で本 feature の書き込みを許容する.

### 処理フロー

#### 1. タスク完了（POST /api/v1/tasks/{id}/complete）

```
クライアント UI（タスク行の「完了」ボタン）
  └─ Repository.complete({ id, ifMatch })
      └─ HttpTaskRepository.complete (fetch)
          ├─ headers: Authorization: Bearer <token>, Idempotency-Key: <UUID v4>, If-Match: <current version>
          └─ HTTP POST /api/v1/tasks/{id}/complete
              ├─ server/middleware/auth: Bearer 検証 → 401 if NG（既存）
              ├─ server/middleware/idempotency: 同キー直近応答があれば再送（既存）
              └─ server/src/app.ts の complete ハンドラ（本 feature 新設）:
                  ├─ taskRepository.findById(id) → null なら 404 TASK_NOT_FOUND
                  ├─ current.trashedAt != null かつ trashedReason = "completed"
                  │   → no-op 冪等: 200 OK { task: current }（version / If-Match 検証もスキップ. D-003）
                  ├─ current.trashedAt != null かつ trashedReason = "deleted"
                  │   → no-op 冪等: 200 OK { task: current }（同上. 削除済を完了に書き換えない. D-003）
                  ├─ If-Match ヘッダなし → 400 MISSING_IF_MATCH
                  ├─ If-Match 数値化失敗 → 400 MISSING_IF_MATCH
                  ├─ current.version !== ifMatch → 412 { task: current }
                  ├─ domain/task/completeTask(current, clock) で
                  │     trashedAt = clock.now(), trashedReason = "completed", updatedAt = clock.now(), version + 1
                  ├─ taskRepository.update(next)
                  └─ saveAndReturn(c, deps, 200, { task: next })
```

#### 2. Web UI: 完了ボタン

```
<li>
  <span>{task.name}</span>
  <span>[優先度: …]</span>
  <button>優先度切替</button>
  <button>編集</button>
  <button>期限切替</button>
  <button onClick={handleComplete(task)}>完了</button>  ← 本 feature で追加
  <button>削除</button>
</li>
```

- `handleComplete(task)` = `Repository.complete({ id: task.id, ifMatch: task.version })` → 成功時 `setTasks(prev => prev.filter(t => t.id !== task.id))`（楽観 UI で一覧から除外）.
- 確認ダイアログは出さない（NFR-010 / spec.md U-004 保守側案）.
- 完了ボタンの aria-label は「完了」固定（U-004）. アイコン化は後続 BL.

### 例外 / エラー処理

| HTTP ステータス | code | 発生条件 | 既存 / 新規 |
| --- | --- | --- | --- |
| 200 | ―（body に `{ task }`） | 通常状態 → 完了遷移成功 / Idempotency-Key 再送 / 既完了 no-op / 既削除 no-op | 新規ハンドラの分岐 |
| 400 | `MISSING_IF_MATCH` | If-Match ヘッダなし / 数値以外 | 既存 code を新エンドポイントで使う |
| 400 | `MISSING_IDEMPOTENCY_KEY` | 共通ミドルウェアで弾く | 既存 |
| 401 | `UNAUTHORIZED` | Bearer 未提示 / 不一致 | 既存ミドルウェア |
| 404 | `TASK_NOT_FOUND` | 該当 id のタスクが存在しない | 既存 code を新エンドポイントで使う |
| 412 | ―（body に `{ task: current }`） | If-Match と現行 version 不一致 | 既存パターン |

新規エラーコード追加は **なし**.

## 重要な決定

- **D-001: 完了は専用エンドポイント `POST /api/v1/tasks/{id}/complete` で表現する**.
  - 採用理由: `DELETE /tasks/{id}?reason=completed` 等のクエリ拡張は (a) HTTP 動詞の意味（DELETE は冪等な「削除」）と (b) BL-001 で確立した「DELETE = `trashedReason = "deleted"` 固定」の意味論を曖昧にする. ADR-0010 §「状態遷移 API は POST `:id/<action>` を使う」と整合し, OpenAPI 骨格でも既に `:id/complete` が予約されている. 専用エンドポイントなら BL-008（カウント集計）も「complete エンドポイントの呼び出し回数」を契機にできる余地が増える.
  - 不採用案: `DELETE /tasks/{id}` の拡張は意味を壊す. `PATCH` で `trashedReason` を直接書かせるのは状態遷移の整合性をサーバ側で強制できない（クライアントが任意値を書ける）.
- **D-002: ドメイン関数は `completeTask` を新設し, 既存 `trashTask` には触らない**.
  - 採用理由: spec.md U-005 保守側案. 既存 `trashTask` は BL-001 の DELETE ハンドラから呼ばれており, シグネチャ変更は BL-001 の挙動・テストを揺らす. 別関数を新設する方が差分が小さく, 「完了」と「削除」の意味的区別をコード上に残せる. 将来 BL-008 が `completedCount` を集計する際に「`completeTask` が呼ばれたら +1」というドメインイベント設計に発展させやすい.
  - 不採用案: `trashTask(current, clock, { reason })` への拡張. 1 行差分の節約はあるが, 既存呼び出し側の安全性と意味的明瞭性を失う.
- **D-003: ゴミ箱状態のタスクへの再 complete は no-op 冪等（200 OK + 現行 task）**.
  - `trashedReason = "completed"` への再 complete → no-op（version も If-Match も触らない. 既値の `task` を返す）.
  - `trashedReason = "deleted"` への complete → **これも no-op**（trashedReason を書き換えない. spec.md U-006 で「200 no-op で統一」を確定）.
  - 採用理由: BL-001 D-003（DELETE の既削除冪等扱い）と対称な設計とすることで, クライアント側の状態遷移ロジック（同じ「ゴミ箱状態のタスクへの操作」を扱うコード）が単純になる. 409 Conflict 等で分けると, BL-011 復元の UX とも噛み合わなくなる.
  - 補足: 「削除済を完了で上書きしない」のは, BL-008 集計時の意味（完了でないものを完了として +1 してしまう）と BL-011 復元時の意味（"completed" 復元はカウントを戻さないが "deleted" 復元はそもそも完了履歴ではない）の両方を壊さないためである.
- **D-004: 完了 API の 200 OK レスポンスは `{ "task": <更新後 Task 全体> }`**.
  - 採用理由: spec.md U-001 保守側案. BL-001 の POST / PATCH と統一形. クライアント楽観 UI / BL-006 のフォーカス再選定 / BL-008 のカウント連動などで「更新後の状態を 1 リクエストで把握」できる方が後段の依存 feature を増やしにくい.
- **D-005: 完了ボタンの UI 表現は文言「完了」のみ**（spec.md U-004 保守側案）.
  - 既存「削除」ボタンと並列のテキストボタン. アイコン化や色付けは BL-005（今日ビュー本実装）以降の判断. 本 feature では NFR-001 / NFR-010 を侵さない最小実装に留める.
- **D-006: 完了済タスクの今日ビュー除外は既存実装で自動的に成立する**（spec.md U-003 確定）.
  - GET `/api/v1/tasks` の既定（`?trashed=false`）が `trashedAt != null` を弾くため, complete で `trashedAt` を立てれば一覧から消える. 追加の表示制御コードは書かない. trash ビューでの参照は BL-011 の責務.
- **D-007: Counter / FocusSelection を本 feature では一切触らない**.
  - spec.md §「スコープ境界の明示」シナリオで担保. complete ハンドラ実装内で Counter Repository / FocusSelection Repository を import しない（する必要が無い構造を保つ）. test-designer / auditor 段階で「未実装の依存を引きずっていないか」を確認する.
- **本 feature では ADR を新規作成しない**. プロトコル / アーキ層の判断はない. エンドポイント形状の決定（D-001）は ADR-0010 の既存規定に従う適用判断であり, ADR 化は不要.

## リスク / 代替案

- **R-001: BL-008（Counter）との接続インタフェース未確定**. 本 feature で `completeTask` 関数を新設するが, BL-008 がこれを「ドメインイベント」として扱うか「DB の `trashedReason = "completed"` を後追い集計」するかは本 feature の決定範囲外. **本 feature の責務は遷移を残すことまで** とし, インタフェース選択は BL-008 の plan.md で判断する. 本 feature のコードは「Counter 関連の依存を持たない」純粋遷移実装に留めることで, どちらの選択にも対応できる柔軟性を残す.
- **R-002: 既削除タスクへの complete を 200 no-op としたことの誤解リスク**. 「ゴミ箱に入った時点で完了 / 削除の理由は固定され, 後から書き換えない」という設計判断（D-003）が伝わりにくい場合, クライアント実装者が「完了で削除済を上書きできる」と誤解する可能性がある. **plan.md §設計詳細 §処理フロー §1 と D-003 にコメントで明示** し, OpenAPI のレスポンス説明にも 1 行追記する.
- **R-003: 楽観 UI の不整合**. complete 成功時にローカルから即時除外する場合, 楽観ロック衝突（412）で実体は除外されていないケースが起きる. **BL-001 で確立した OptimisticLockError ハンドリング**（UI が catch して 412 ボディの現行 task で再フェッチ / リトライを促す）を踏襲する. 本 feature では既存パターンを使うのみで, 新しい UI 状態遷移は導入しない.
- **R-004: BL-006（フォーカス自動繰り上げ）との順序依存**. FR-013 の自動繰り上げは BL-006 の責務だが, 本 feature が完了 API を先に提供することで「BL-006 着手前にユーザーが完了したタスクのフォーカス追従が無い」状態が一時的に発生する. これは現状 FocusSelection 自体が未実装であり, 「現在のタスク」表示が無いため UX 上の問題にならない. BL-006 着手時に本 feature の完了 API レスポンス（更新後 task）を入力として再選定ロジックを組めば良い.
- **代替案: ドメイン関数を `completeTask` ではなく `trashTask(current, clock, { reason })` に拡張**. 採用しない（D-002）.
- **代替案: 完了 API を新エンドポイントではなく `PATCH /tasks/{id}` で `trashedReason: "completed"` を受理**. 採用しない（D-001）. 状態遷移をサーバ側で強制できなくなり, BL-008 集計の意味整合も保ちにくい.
- **代替案: 完了で `completedCount` も同トランザクション内で +1 する**. 採用しない. Counter エンティティ自体が BL-008 で導入されるため, 本 feature 内で集計を実装すると BL-008 と二重実装になる. Counter 導入後にどう接続するかは BL-008 で確定する.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md). BL-001 / BL-002 で確立した枠組み（結合テスト = `server/__tests__/integration/tasks.test.ts`, UI 単体 = `web/__tests__/today-view.test.tsx`, ドメイン単体 = `domain/__tests__/task.test.ts` 相当）に乗せる.

### 単体テスト（ドメイン）

`domain/src/task/index.ts` に新設する `completeTask` をテストする.

- 通常状態（`trashedAt: null`）の Task を complete → `trashedAt = clock.now()`, `trashedReason = "completed"`, `updatedAt = clock.now()`, `version + 1`. `createdAt` 不変, それ以外（`name` / `projectId` / `dueDate` / `priority` / `origin` / `routineId`）も不変.
- 既に `trashedReason = "completed"` の Task を complete → 入力と完全同一の Task を返す（no-op）. `version` も `updatedAt` も `trashedAt` も変えない.
- 既に `trashedReason = "deleted"` の Task を complete → 同上 no-op. `trashedReason` を `"completed"` に書き換えない.

### 結合テスト（サーバ）

spec.md §API の Gherkin と 1:1 対応するシナリオを `tasks.test.ts` に追加する.

- 通常状態 → complete → 200 OK, レスポンスの task が `{ trashedReason: "completed", trashedAt: <not null>, version: 2 }`, ストア更新.
- complete 後の GET `/api/v1/tasks`（既定）に対象タスクが含まれない.
- complete 後の GET `/api/v1/tasks?trashed=true` に対象タスクが含まれ, `trashedReason = "completed"`.
- complete と delete の trashedReason 区別: complete → `"completed"`, delete → `"deleted"`（delete 側は BL-001 で担保済のため再掲しないが, complete 側のシナリオで対比して明示する）.
- 古い If-Match → 412 + 現行 task.
- If-Match 欠落 → 400 `MISSING_IF_MATCH`.
- Idempotency-Key 欠落 → 400 `MISSING_IDEMPOTENCY_KEY`.
- 同じ Idempotency-Key で 2 回送信 → 2 回目も同じ応答, ストアは 1 回しか遷移しない（version が 2 のまま 3 にならない）.
- 認証なし → 401.
- 存在しない id → 404 `TASK_NOT_FOUND`.
- 既 `"completed"` への complete → 200 OK + 現行 task, ストア不変, version 不変.
- 既 `"deleted"` への complete → 200 OK + 現行 task, ストア不変, `trashedReason` は `"deleted"` のまま.
- 完了アクションが Counter / FocusSelection の Repository を呼ばないこと（**該当 Repository を依存性に含めずに app を起動でき, テストが green になる** ことで構造的に担保. 本 feature では明示的なモック呼び出し検証は不要）.

### 単体テスト（クライアント）

`web/__tests__/today-view.test.tsx` に以下を追加する.

- タスク行に「完了」ボタンが 1 つ存在し, ラベルは「完了」.
- 完了ボタンを押すと, モック `Repository.complete` が `{ id: <task.id>, ifMatch: <task.version> }` で呼ばれる.
- 完了に成功すると, そのタスクが一覧から消える（楽観 UI による即時除外）.
- 完了ボタンを押しても `Repository.delete` は呼ばれない.

### E2E

- 本 feature では新規 E2E を追加しない. 既存 E2E が整備されたタイミング（BL-005 以降）で「タスクを 1 件起票 → 完了ボタンクリック → 今日ビューから消える」の 1 シナリオを追加する程度に留める.

### カバレッジ目標

- ドメイン `completeTask`: 100%（純関数で分岐 3 パターン. 通常 → 完了 / 既 completed no-op / 既 deleted no-op）.
- API complete ハンドラ: 主要分岐すべて（正常系 / 404 / 412 / If-Match 欠落 / Idempotency 再送 / 既 completed / 既 deleted / 認証なし）.
- UI: spec.md の 4 シナリオが green.

### 重視するもの

- **BL-001 / BL-002 と重複しない網羅性**. 既に担保済の共通経路（楽観ロック基盤, Idempotency-Key 基盤, 認証ミドルウェア, 暫定ソート）は本 feature では再テストしない. 重複追加された場合は test-designer / auditor 段階で削減する.
- **「完了 vs 削除」の意味的区別**. `trashedReason` の値が `"completed"` か `"deleted"` かを必ずアサートする（API レスポンスとストア両方）. 「論理削除されている」だけでは不十分.
- **Counter / FocusSelection への非依存**. 本 feature のコード（complete ハンドラ + `completeTask` + UI ハンドラ + Repository.complete）に Counter / FocusSelection 関連の import / 呼び出しが入っていないことを auditor 段階で目視確認する.
