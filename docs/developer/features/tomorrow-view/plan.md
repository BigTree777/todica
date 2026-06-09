# 設計・実装計画: 「明日のタスク」独立ビュー (tomorrow-view)

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md) を参照. 上位 feature は [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) / [`../ui-sidebar-nav/spec.md`](../ui-sidebar-nav/spec.md). 前提 BL は [`../focus-view/plan.md`](../focus-view/plan.md) (BL-037).

## 方針概要

- **`web/src/ui/tomorrow-view/tomorrow-view.tsx` を新設** して BL-036 の `TomorrowViewPlaceholder` を実コンポーネントに置き換える. `main.tsx` の `/tomorrow` ルート割り当てと placeholder ファイルの削除を行う.
- **`GET /api/v1/tasks` を補強** して `?dueDate=today|tomorrow` クエリパラメータを追加する. サーバ側でフィルタを行い, クライアントから client-side filter を排除する (spec §「サーバ実装の補強」採用案 A).
- **今日ビューを触らない**. `today-view.tsx` の挙動はそのまま残す. 後続 BL-039 〜 BL-044 で今日ビュー側の分解を行う (focus-view と同じ段階的移行戦略).
- **既存実装を踏襲**: `useQuery(["tomorrow"])` で `GET /api/v1/tasks?dueDate=tomorrow` を取得. `useMutation` で `create` / `update` (dueDate=today への移送) / `delete` を発行する. `today-view.tsx` の `createMutation` / `updateMutation` / `deleteMutation` を雛形にし, 412 → `ConflictError` 変換 (BL-031) / `notifyError` (BL-034) / オフラインキュー (`offline-queue.ts`) の枠組みを再利用する.
- **デザイン**: モックに合わせて起票フォーム + リスト. CSS は `web/src/ui/tomorrow-view/tomorrow-view.css` に局所化. デザイントークン無しの暫定値 + `/* TODO(BL-046) */` マーカー (focus-view と同じ手法).

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | **補強**: `GET /api/v1/tasks` に `?dueDate=today\|tomorrow` クエリパラメータを追加. 既存 `?trashed` は無改修. 他エンドポイント (`/today` / `/focus` / `POST tasks` / `PATCH tasks/:id` / `DELETE tasks/:id`) は無改修. |
| DB | なし. データモデル変更なし. |
| ドメイン層 | なし. |
| サーバ | `server/src/data/task-repository.ts` の `ListTasksFilter` 型に `dueDate?: "today" \| "tomorrow"` を追加. `server/src/infra/persistence/drizzle/task-repository.ts` の `list()` の where 句を拡張. `server/src/app.ts` の `GET /api/v1/tasks` で `dueDate` query を読む. |
| クライアント repository | `web/src/repositories/task-repository.ts` の `TaskRepository.list()` を拡張し, `list(filter?: { dueDate?: "today" \| "tomorrow" })` を受け取れるようにする. `HttpTaskRepository.list()` も追従して `?dueDate=tomorrow` 等を URL に乗せる. |
| モジュール | **新規**: `web/src/ui/tomorrow-view/tomorrow-view.tsx` / `web/src/ui/tomorrow-view/tomorrow-view.css`. **削除**: `web/src/ui/tomorrow-view/tomorrow-view-placeholder.tsx`. **変更**: `web/src/main.tsx` の import と `/tomorrow` ルート element. |
| UI | `/tomorrow` が明日タスクの一覧 + 起票 + 「今日にする」/「削除」 を提供する独立ビューになる. `/today` は本 BL では無改修. |
| テスト | **新規**: `web/__tests__/tomorrow-view.test.tsx` (tomorrow-view 単体). `e2e/tomorrow-view.spec.ts` (任意). サーバ統合テスト `server/__tests__/integration/tasks.test.ts` に `?dueDate=today\|tomorrow\|不正値` シナリオを追加. **変更**: `web/__tests__/router.test.tsx` (もし `/tomorrow` placeholder のテストがあれば追従). |
| ドキュメント | `docs/developer/features/tomorrow-view/` の 3 ファイル. `docs/developer/planning/backlog.md` の BL-038 を「Done」へ更新 (マージ後. 管理者が実施). ADR は不要. |

## 設計詳細

### コンポーネント階層 (実装後)

```
<BrowserRouter>
  <App>
    <OfflineBanner />
    <PwaUpdateBanner />
    <ErrorNotification />
    <Routes>
      <Route path="/setup" element={<SetupViewWithNav ... />} />
      <Route element={<AppShell />}>
        <Route path="/"         element={<Navigate to={defaultRoute} replace />} />
        <Route path="/focus"    element={<FocusView ... />} />
        <Route path="/today"    element={<TodayView ... />} />          (無改修)
        <Route path="/tomorrow" element={<TomorrowView repository={repos.task} projectRepository={repos.project} />} />  ← 本 BL で差し替え
        <Route path="/projects" element={<ProjectsView ... />} />
        <Route path="/routines" element={<RoutinesView ... />} />
        <Route path="/trash"    element={<TrashView ... />} />
        <Route path="/settings" element={<SettingsView ... />} />
      </Route>
    </Routes>
  </App>
</BrowserRouter>
```

### サーバ補強の手順

spec.md §「サーバ実装の補強」採用案 A に従い, 以下を順に行う. 各ステップは独立にコミット可能.

#### 手順 1: `ListTasksFilter` 型拡張

**ファイル**: `server/src/data/task-repository.ts`

```ts
export interface ListTasksFilter {
  /** "true" = ゴミ箱のみ, "false" = ゴミ箱以外 (既定), "all" = すべて. */
  trashed: "true" | "false" | "all";
  /** BL-038: dueDate での絞り込み. 未指定なら絞り込みなし (既存挙動). */
  dueDate?: "today" | "tomorrow";
}
```

- `trashed` は必須のままで挙動互換を保つ. `dueDate` は optional. 既存呼び出し (`{ trashed: "false" }` / `{ trashed: "true" }` 等) は無改修で通る.

#### 手順 2: drizzle where 句修正

**ファイル**: `server/src/infra/persistence/drizzle/task-repository.ts` の `list()`.

- 既存の `trashed` 分岐 (3 通り) に `filter.dueDate` の AND を追加する. `dueDate` が指定されていなければ既存挙動 (dueDate 絞り込みなし) を保つ.
- 実装方針: `and(...)` の引数として `[trashedCondition, dueDateCondition]` を組み立て, `dueDateCondition` は `filter.dueDate ? eq(tasks.dueDate, filter.dueDate) : undefined` で undefined はスプレッドで弾く.

擬似コード:

```ts
async list(filter: ListTasksFilter): Promise<Task[]> {
  const trashedCond =
    filter.trashed === "true"  ? isNotNull(tasks.trashedAt)
  : filter.trashed === "false" ? isNull(tasks.trashedAt)
  : undefined;
  const dueDateCond = filter.dueDate ? eq(tasks.dueDate, filter.dueDate) : undefined;
  const conds = [trashedCond, dueDateCond].filter((c): c is NonNullable<typeof c> => c !== undefined);
  const where = conds.length === 0 ? undefined
              : conds.length === 1 ? conds[0]
              : and(...conds);
  const rows = where
    ? this.db.select().from(tasks).where(where).all()
    : this.db.select().from(tasks).all();
  return rows.map(rowToTask);
}
```

- `trashed === "all"` のとき `trashedCond` は undefined になり, 既存挙動 (全 trashed を含む) を維持する.

#### 手順 3: `GET /api/v1/tasks` の query parsing

**ファイル**: `server/src/app.ts` の `app.get("/api/v1/tasks", ...)` ハンドラ.

```ts
app.get("/api/v1/tasks", async (c) => {
  const trashedParam = c.req.query("trashed");
  let trashed: "true" | "false" | "all" = "false";
  if (trashedParam === "true" || trashedParam === "false" || trashedParam === "all") {
    trashed = trashedParam;
  }
  const dueDateParam = c.req.query("dueDate");
  const dueDate: "today" | "tomorrow" | undefined =
    dueDateParam === "today" || dueDateParam === "tomorrow" ? dueDateParam : undefined;
  const tasks = await deps.taskRepository.list({ trashed, ...(dueDate ? { dueDate } : {}) });
  const sorted = sortTasks(tasks);
  return c.json({ tasks: sorted }, 200);
});
```

- **寛容なバリデーション**: 不正値 (例: `"yesterday"`) は 400 にせず無視 (`dueDate=undefined`). 既存 `trashed` パラメータと同じ方針 (spec U-010 採用案).
- ソート順 (`sortTasks` = `sortToday`) は無改修. spec REQ-1 の「priority → createdAt → id」をそのまま使う.

#### 手順 4: サーバ統合テスト追加

**ファイル**: `server/__tests__/integration/tasks.test.ts`.

- `?dueDate=today` で today のみ返る.
- `?dueDate=tomorrow` で tomorrow のみ返る.
- `?dueDate=` 未指定で両方返る (既存挙動維持).
- 不正値 `?dueDate=yesterday` で両方返る (寛容バリデーション).
- `?dueDate=tomorrow&trashed=false` の組合せで ゴミ箱外の tomorrow タスクのみ返る (trashed 互換).

### TaskRepository クライアント側の拡張

**ファイル**: `web/src/repositories/task-repository.ts`.

- `TaskRepository.list()` のシグネチャを `list(filter?: { dueDate?: "today" | "tomorrow" }): Promise<Task[]>` に変更.
  - 既存の引数なし呼び出し (`web/src/repositories/local-task-repository.test.ts` などのテスト用 fake 実装) との互換のため optional 引数とする.
- `HttpTaskRepository.list()` の本実装で URL に `?dueDate=...` を乗せる:
  ```ts
  async list(filter?: { dueDate?: "today" | "tomorrow" }): Promise<Task[]> {
    const url = new URL(`${this.baseUrl}/api/v1/tasks`);
    if (filter?.dueDate) url.searchParams.set("dueDate", filter.dueDate);
    const res = await fetch(url.toString(), { method: "GET", headers: this.authHeaders() });
    ...
  }
  ```
- `LocalTaskRepository` などの代替実装は **optional 引数を無視** しても本 BL の受け入れ基準を満たす (実機サーバ前提の機能). ただし `dueDate` を受け取る場合のために型上の追従だけ行う.

### TomorrowView コンポーネント設計

**ファイル**: `web/src/ui/tomorrow-view/tomorrow-view.tsx`.

**props**:

```tsx
export interface TomorrowViewProps {
  repository: TaskRepository;
  projectRepository: ProjectRepository;
}
```

**役割**:

- `useQuery(["tomorrow"])` で `repository.list({ dueDate: "tomorrow" })` を呼ぶ. spec U-001 採用案.
- `useQuery(["projects"])` で `projectRepository.list()` を呼ぶ (起票フォームの project select 用 / カード行のプロジェクト名表示用).
- 起票フォーム: タスク名 (必須) / プロジェクト `<select>` / 優先度 `<select>` / 「追加」ボタン. 期限 UI は持たない.
- 一覧: サーバから返ってきた順序をそのまま `.map` で描画. 各カードに「削除」「今日にする」の 2 ボタン.
- `useMutation` で `create` / `update` (dueDate=today) / `delete` を発行する. `today-view.tsx` の各 mutation を雛形にし以下を踏襲:
  - `safeEnqueue` で書込キューに enqueue (offline 対応 / BL-018).
  - `!navigator.onLine` で楽観成功.
  - online 時に `OptimisticLockError` を catch して `findEntryByKey` + `ConflictError` 変換 (BL-031).
  - `onSuccess` で query invalidate (下記 invalidate 方針参照).
  - `onError`: `ConflictError` なら `useConflictDialog.openDialog`, それ以外なら `notifyError("通信に失敗しました")` (BL-034).
- `setFocus` は呼ばない (明日タスクは focus 対象外 / spec REQ-4 補足).

**invalidate 方針** (spec U-002 / U-003 / U-004 採用案):

| 操作 | invalidate する query key |
| --- | --- |
| create (起票, dueDate=tomorrow 固定) | `["tomorrow"]` のみ. |
| update (「今日にする」, dueDate=today) | `["tomorrow"]` / `["today"]` / `["focus"]` の 3 つ. tomorrow → today で nextTaskId / 暗黙 focus が更新される可能性があるため. |
| delete | `["tomorrow"]` のみ (明日タスクは focus 対象外のため `["focus"]` 無効化は不要). |

**疑似コード**:

```tsx
import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Priority, Task } from "@todica/domain/task";
import type {
  CreateTaskCommand, UpdateTaskCommand, DeleteTaskCommand, TaskRepository,
} from "../../repositories/task-repository.js";
import { OptimisticLockError } from "../../repositories/task-repository.js";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import { enqueue, dequeue, getAll, findEntryByKey, ConflictError } from "../../offline-queue.js";
import { notifyError } from "../../error-notification.js";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import "./tomorrow-view.css";

const PRIORITY_LABEL: Record<Priority, string> = {
  highest: "最優先", normal: "普通", later: "後回し",
};

export interface TomorrowViewProps {
  repository: TaskRepository;
  projectRepository: ProjectRepository;
}

export function TomorrowView(props: TomorrowViewProps): JSX.Element {
  const { repository, projectRepository } = props;
  const queryClient = useQueryClient();
  const conflictDialog = useConflictDialog();

  const { data: tasks = [] } = useQuery({
    queryKey: ["tomorrow"],
    queryFn: () => repository.list({ dueDate: "tomorrow" }),
    networkMode: "offlineFirst",
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectRepository.list(),
    networkMode: "offlineFirst",
  });
  const projects: Project[] = projectsData ?? [];

  // フォーム state (期限 state は持たない. dueDate は submit 時に "tomorrow" 固定).
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");

  const invalidateTomorrow = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tomorrow"] });
  }, [queryClient]);
  const invalidateAfterMoveToToday = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["tomorrow"] });
    void queryClient.invalidateQueries({ queryKey: ["today"] });
    void queryClient.invalidateQueries({ queryKey: ["focus"] });
  }, [queryClient]);

  // createMutation / updateMutation / deleteMutation の構造は today-view.tsx を踏襲.
  // create.onSuccess = invalidateTomorrow.
  // update.onSuccess = invalidateAfterMoveToToday.
  // delete.onSuccess = invalidateTomorrow.
  // ... (中身は処理フロー §1〜§3 参照)

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    const cmd: CreateTaskCommand = {
      id: generateId(),
      name,
      projectId: projectId ? projectId : null,
      dueDate: "tomorrow",   // ← ビュー文脈で確定. UI には出さない.
      priority,
    };
    await createMutation.mutateAsync(cmd);
    setName(""); setProjectId(""); setPriority("normal");
  }, [name, projectId, priority, createMutation]);

  const handleMoveToToday = useCallback(async (task: Task) => {
    const cmd: UpdateTaskCommand = {
      id: task.id,
      ifMatch: task.version,
      patch: { dueDate: "today" },
    };
    await updateMutation.mutateAsync(cmd);
  }, [updateMutation]);

  const handleDelete = useCallback(async (task: Task) => {
    const cmd: DeleteTaskCommand = { id: task.id, ifMatch: task.version };
    await deleteMutation.mutateAsync(cmd);
  }, [deleteMutation]);

  return (
    <section aria-label="明日のタスク" className="tomorrow-view">
      <h1>明日のタスク</h1>
      <form onSubmit={handleCreate} aria-label="明日のタスク起票フォーム" className="tomorrow-view__form">
        {/* タスク名 / プロジェクト / 優先度 / 追加. 期限 UI は無し. */}
        ...
      </form>
      <ul aria-label="明日のタスク一覧" className="tomorrow-view__list">
        {tasks.length === 0 ? (
          <li className="tomorrow-view__empty">明日のタスクはありません</li>
        ) : (
          tasks.map((task) => (
            <li key={task.id} className="tomorrow-view__item">
              {/* project 名 + name + [優先度: ...] + 「削除」「今日にする」の 2 ボタン. */}
              ...
            </li>
          ))
        )}
      </ul>
      <ConflictDialog ... />
    </section>
  );
}
```

### CSS 設計 (暫定)

**ファイル**: `web/src/ui/tomorrow-view/tomorrow-view.css`.

**方針**: モックの「今日のタスク」UI と同じカード構造を踏襲しつつ「完了」ボタンを「今日にする」に置換. 暫定値 + `/* TODO(BL-046) */` マーカー (focus-view と同じ手法).

```css
/* TODO(BL-046): 暫定値はデザイントークン化する. */

.tomorrow-view {
  display: flex;
  flex-direction: column;
  /* TODO(BL-046): --space-md */
  gap: 16px;
}

.tomorrow-view h1 {
  /* TODO(BL-046): --font-size-h1 */
  font-size: 24px;
  margin: 0;
}

.tomorrow-view__form {
  display: flex;
  flex-direction: column;
  /* TODO(BL-046): --space-sm */
  gap: 8px;
  /* TODO(BL-046): --radius-md / --color-border / --space-md */
  border: 1px solid #ccc;
  border-radius: 12px;
  padding: 16px;
}

.tomorrow-view__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  /* TODO(BL-046): --space-sm */
  gap: 8px;
}

.tomorrow-view__item {
  /* TODO(BL-046): --radius-md / --color-border / --space-md */
  border: 1px solid #ccc;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tomorrow-view__empty {
  /* TODO(BL-046): --font-size-body / --color-fg-subtle */
  color: #999;
  font-size: 16px;
  text-align: center;
  padding: 24px 0;
}
```

### main.tsx の変更点

**変更前** (BL-036 完了時点):

```tsx
import { TomorrowViewPlaceholder } from "./ui/tomorrow-view/tomorrow-view-placeholder.js";
// ...
<Route path="/tomorrow" element={<TomorrowViewPlaceholder />} />
```

**変更後**:

```tsx
import { TomorrowView } from "./ui/tomorrow-view/tomorrow-view.js";
// ...
<Route path="/tomorrow" element={<TomorrowView repository={repos.task} projectRepository={repos.project} />} />
```

加えて, `web/src/ui/tomorrow-view/tomorrow-view-placeholder.tsx` を削除する.

### データモデル

変更なし.

### 処理フロー

#### §1 起票 (REQ-2)

1. ユーザーが /tomorrow の起票フォームにタスク名を入力し「追加」を押す.
2. `handleCreate` が `createMutation.mutateAsync({ id, name, projectId, dueDate: "tomorrow", priority })` を呼ぶ.
3. `createMutation.mutationFn`:
   a. `idempotencyKey = generateId()` を採番.
   b. `safeEnqueue` で `POST /api/v1/tasks` (body に dueDate=tomorrow を含む) を書込キューに保存.
   c. `!navigator.onLine` なら `undefined` を返して終了 (offline 楽観成功).
   d. online なら `repository.create(cmd)` を呼ぶ.
   e. 成功なら `safeDequeueByKey(idempotencyKey)` でキュー entry を削除.
4. `onSuccess`: `invalidateTomorrow` で `["tomorrow"]` を invalidate. 再フェッチで起票したタスクが先頭〜途中に出現する (サーバ側ソート規則に従う).
5. `onError`:
   - `ConflictError` (project が消えている等) なら `conflictDialog.openDialog(...)`.
   - それ以外なら `notifyError("通信に失敗しました")` (BL-034).

#### §2 「今日にする」 (REQ-4 / FR-014 逆方向)

1. ユーザーがカードの「今日にする」ボタンを押す.
2. `handleMoveToToday` が `updateMutation.mutateAsync({ id, ifMatch: task.version, patch: { dueDate: "today" } })` を呼ぶ.
3. `updateMutation.mutationFn`:
   a. `PATCH /api/v1/tasks/:id` を書込キューに enqueue.
   b. offline なら楽観成功.
   c. online なら `repository.update(cmd)` を呼ぶ.
   d. `OptimisticLockError` を catch したら `findEntryByKey` + `ConflictError(entry, error.currentTask ?? {})` 変換 (BL-031).
4. サーバ側で `task.dueDate = "today"` + `version + 1` で更新される (BL-001).
5. `onSuccess`: `invalidateAfterMoveToToday` で `["tomorrow"]` / `["today"]` / `["focus"]` を invalidate.
6. 再フェッチ後 `/tomorrow` の一覧から該当タスクが消え, `/today` に出現する. nextTaskId / 暗黙フォーカスも更新される.
7. `onError`: ConflictDialog or notifyError (§1 と同様).

#### §3 削除 (REQ-5)

1. ユーザーがカードの「削除」ボタンを押す.
2. `handleDelete` が `deleteMutation.mutateAsync({ id, ifMatch: task.version })` を呼ぶ.
3. `deleteMutation.mutationFn`:
   a. `DELETE /api/v1/tasks/:id` を書込キューに enqueue.
   b. offline なら楽観成功.
   c. online なら `repository.delete(cmd)` を呼ぶ.
   d. 412 → `ConflictError` 変換.
4. サーバ側で `trashedAt = now`, `trashedReason = "deleted"` で論理削除. `completionCount` は加算されない (BL-012). 明日タスクは focus 対象外のため `clearFocusIfMatches` は副作用なし.
5. `onSuccess`: `invalidateTomorrow` で `["tomorrow"]` を invalidate.
6. 再フェッチ後 `/tomorrow` の一覧から該当タスクが消える. ゴミ箱 (`GET /api/v1/trash`) で参照可能 (本 BL では検証しない).
7. `onError`: ConflictDialog or notifyError.

### 例外 / エラー処理

- **online 412**: BL-031 と同じパターンで `OptimisticLockError` を `ConflictError` に変換し `ConflictDialog` を開く. update / delete のいずれの経路でも対応する.
- **ネットワークエラー / 401**: BL-034 の `notifyError("通信に失敗しました")` でバナー表示.
- **offline**: BL-018 の書込キューに enqueue. 次回 online + Service Worker sync で flush.
- **明日タスクが 0 件**: REQ-6 の空状態「明日のタスクはありません」を表示. 起票フォームは引き続き表示する.
- **不正な dueDate query パラメータ**: サーバ側で寛容バリデーション (= 全件返す). クライアントは常に `"tomorrow"` を送る前提なので通常経路では発生しない.

## 重要な決定

- **D-001 サーバに `?dueDate=today|tomorrow` を追加する (採用案 A)**. spec §「サーバ実装の補強」参照. 却下案 B (client filter) を採らない理由は転送量 / 責務集約 / 既存 `?trashed` との整合.
- **D-002 dueDate 不正値は 400 を返さず無視する**. 既存 `?trashed` パラメータの寛容バリデーション (`"true" | "false" | "all"` 以外は既定値) と整合させる. spec U-010 採用案.
- **D-003 query key を `["tomorrow"]` とする**. 今日ビューの `["today"]` と対称. spec U-001 採用案. `["tasks", "tomorrow"]` は採らない (短く一貫性のある形を優先).
- **D-004 「今日にする」成功時に `["focus"]` も invalidate する**. tomorrow → today で nextTaskId が更新され, 暗黙フォールバック `currentTaskId ?? nextTaskId` が変わる可能性があるため. spec U-003 採用案.
- **D-005 起票成功時は `["tomorrow"]` のみ invalidate**. 起票は dueDate=tomorrow 固定で `["today"]` に影響しない. spec U-002 採用案.
- **D-006 削除成功時は `["tomorrow"]` のみ invalidate**. 明日タスクは focus 対象外で `clearFocusIfMatches` の副作用なし. spec U-004 採用案.
- **D-007 today-view を触らない**. focus-view (BL-037) と同じ段階的移行戦略. 今日ビューの分解は後続 BL-039 〜 BL-044 の責務.
- **D-008 placeholder ファイルを削除**. `web/src/ui/tomorrow-view/tomorrow-view-placeholder.tsx` は BL-036 で一時的に置かれたもので, 本 BL の実コンポーネント追加で役目を終える.
- **D-009 props で repository を注入する**. AppShell 経由ではなく Route element 直渡し (focus-view D-006 と同じ).
- **D-010 CSS は暫定値 + `TODO(BL-046)` マーカー**. focus-view と同じ手法.
- **D-011 `TaskRepository.list()` のシグネチャ拡張は optional 引数で**. 既存呼び出しを壊さないため. 渡されたら URL に `?dueDate=...` を乗せる.
- **D-012 起票フォームの初期値は今日ビューと揃える**. projectId="" (未分類) / priority="normal". dueDate は UI に出さず submit 時に "tomorrow" 固定 (spec U-005).
- **D-013 タスクカード上の表示は今日ビューと揃える**. project 名 + 「[優先度: ...]」を表示. ただし優先度切替ボタンは置かない (REQ-3 / 非ゴール / spec U-006).
- **D-014 routine 由来タスクも区別なく表示する**. dueDate=tomorrow なら origin を問わず一覧に出し, 「今日にする」も origin を問わず有効化する (spec U-007).
- **D-015 ADR は新規作成しない**. 設計判断は spec.md と本 plan に閉じる. ui-redesign-foundation / ui-sidebar-nav で確定済みの方針を踏襲するのみ.
- **D-016 共通化はしない (本 BL では)**. today-view と tomorrow-view の重複コード (mutation の枠組み) はあるが, 本 BL では抽出しない. focus-view と同じく後続 BL (今日ビュー分解と同時) で共通化判断する.

## リスク / 代替案

- **R-001 `TaskRepository.list()` のシグネチャ変更が既存呼び出し箇所に影響**. optional 引数にすることで破壊的変更を回避する. ただし `local-task-repository.test.ts` などの fake 実装が `list()` の引数を見ないケースは型エラーになる可能性. 監査前に CI で全 web テストを実行して確認する.
- **R-002 サーバ統合テストの差分が大きくならないか**. 既存 `tasks.test.ts` に dueDate シナリオを 4〜5 件追加する程度で済む見込み. 既存テストは無改修.
- **R-003 起票後の query 再フェッチ順序問題**. `["tomorrow"]` invalidate → 再フェッチ → 一覧反映 の順. 起票したタスクが一瞬出ない可能性はあるが, 楽観 UI を持たないサーバ正本値方式を採用する (今日ビューと同じ方針).
- **R-004 「今日にする」直後の `/today` への遷移**: 本 BL では `/today` への自動遷移は行わない. ユーザーがサイドバーで `/today` に遷移したときには既に invalidate 済みなので最新状態が表示される.
- **R-005 既存 sidebar-nav E2E への影響**. `e2e/sidebar-nav.spec.ts` で `/tomorrow` 遷移後に「準備中 (BL-038)」テキストを assert している場合は, 本 BL での実コンポーネント置換に合わせて見出し「明日のタスク」のみを assert する形に更新が必要.
- **R-006 axe (a11y) E2E への影響**. `<section aria-label="明日のタスク">` のランドマーク / 起票フォームの `<label htmlFor>` 整合 / ボタンのフォーカス可能性を確認. BL-029 の axe 検査が violations 0 を維持すること.
- **R-007 デザイントークン未整備の影響**. focus-view と同じく BL-046 で `var(--space-md)` 等に置換する前提. grep 可能な `/* TODO(BL-046) */` マーカーで漏れを防ぐ.
- **代替案 1: client filter で実装する (採用案 B)**. 採用しない. 転送量 / 責務集約 / 既存 `?trashed` との整合の観点で不利 (spec §「サーバ実装の補強」参照).
- **代替案 2: 起票フォームに期限セレクトを残し, 既定値を tomorrow にする**. 採用しない. ui-redesign-foundation REQ-4 で「期限セレクトはビュー文脈で確定」と確定している.
- **代替案 3: 「完了」ボタンも置く (3 ボタン構成)**. 採用しない. 非ゴール. 明日タスクを直接完了させる操作は意味的に逆 (今日にしてから完了, または削除の 2 経路で十分).
- **代替案 4: today-view / tomorrow-view を共通コンポーネントから派生させる**. 採用しない. 本 BL では抽出しない (D-016). 今日ビュー分解後の BL で共通化判断する.

## 見送り検討事項 (Open Questions の決着)

spec.md §「未決事項 / 確認待ち」の各 U-XXX について, 本 plan のどこで採用案として決着するかを示す:

| 未決事項 | spec での保守側デフォルト案 | 本 plan での決着 |
| --- | --- | --- |
| U-001 query key の命名 | `["tomorrow"]` | D-003 で採用 |
| U-002 起票成功時の invalidate | `["tomorrow"]` のみ | D-005 で採用 |
| U-003 「今日にする」成功時の invalidate | `["tomorrow"]` / `["today"]` / `["focus"]` | D-004 で採用 |
| U-004 「削除」成功時の invalidate | `["tomorrow"]` のみ | D-006 で採用 |
| U-005 起票フォームの初期値 | projectId="" / priority="normal" / dueDate=tomorrow 固定 | D-012 で採用 |
| U-006 カード上の project 名 / 優先度ラベル表示 | 今日ビューと揃える (切替ボタンは置かない) | D-013 で採用 |
| U-007 routine 由来タスクの扱い | origin に関わらず表示 / 「今日にする」も有効 | D-014 で採用 |
| U-008 起票時 dueDate の明示送信 | 明示送信する | §「処理フロー §1」b で採用 (POST body に dueDate=tomorrow を含める) |
| U-009 ConflictDialog 表示後の挙動 | `useConflictDialog` をそのまま使う | §「TomorrowView コンポーネント設計」で採用 |
| U-010 サーバ dueDate 不正値ハンドリング | 寛容バリデーション (無視) | D-002 / §「サーバ補強の手順」手順 3 で採用 |
| U-011 デザイントークン化のタイミング | 暫定値 + `/* TODO(BL-046) */` マーカー | D-010 / §「CSS 設計」で採用 |

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### サーバ統合テスト (Vitest)

- **対象**: `server/__tests__/integration/tasks.test.ts` に dueDate filter シナリオを追加.
- **観点**:
  - `?dueDate=today` で today タスクのみ返る (spec §サーバ補強の受け入れ基準 1).
  - `?dueDate=tomorrow` で tomorrow タスクのみ返る (受け入れ基準 2).
  - `?dueDate` 未指定で両方返る (受け入れ基準 3 / 既存挙動維持).
  - `?dueDate=yesterday` (不正値) で両方返る (受け入れ基準 4 / 寛容バリデーション).
  - `?dueDate=tomorrow&trashed=false` で ゴミ箱外 tomorrow のみ返る (既存 trashed との直交性).
  - ソート順 (priority → createdAt → id) は無改修であること.

### 単体テスト (Vitest + React Testing Library)

- **対象**: `web/__tests__/tomorrow-view.test.tsx` を新規作成し `<TomorrowView />` 単体をテストする.
- **観点**:
  - 一覧描画: tasks = [B (highest), A (normal), D (later)] で順番通り描画 (REQ-1).
  - 起票フォームに「期限」UI が無い (REQ-2 受け入れ基準).
  - 起票フォームの入力は タスク名 / プロジェクト / 優先度 / 追加 の 4 要素のみ.
  - 「追加」押下で `repository.create` が `{ name, dueDate: "tomorrow", ... }` で 1 回呼ばれる (REQ-2).
  - 「今日にする」押下で `repository.update` が `{ id, ifMatch: task.version, patch: { dueDate: "today" } }` で 1 回呼ばれる (REQ-4).
  - 「今日にする」成功後に `["tomorrow"]` / `["today"]` / `["focus"]` の 3 query が invalidate される.
  - 「削除」押下で `repository.delete` が `{ id, ifMatch }` で 1 回呼ばれる (REQ-5).
  - 「削除」成功後に `["tomorrow"]` が invalidate される.
  - 空状態: tasks = [] で「明日のタスクはありません」が表示される. 起票フォームは表示されたまま (REQ-6).
  - カード内のボタンは「削除」「今日にする」の 2 つのみ (REQ-3). 「完了」「明日にする」「明日へ」「優先度切替」「編集」「現在に設定」が無い.
  - ConflictDialog: `repository.update` が `OptimisticLockError` を throw すると `ConflictDialog` が開く (REQ-7).
  - ConflictDialog: `repository.delete` の online 412 でも開く.
  - notifyError: `repository.create` (もしくは update / delete) が一般エラーを throw すると `notifyError("通信に失敗しました")` が呼ばれる (REQ-7 / BL-034).
- **モック**: `TaskRepository` / `ProjectRepository` を `vi.fn()` で実装. `QueryClientProvider` でラップ (`web/__tests__/today-view.test.tsx` のパターン踏襲).

### 結合テスト (Vitest + MemoryRouter)

- **対象**: `web/__tests__/router.test.tsx` (既存) を確認. もし BL-036 で `/tomorrow` placeholder の assert があれば実コンポーネントに追従.
- **観点**:
  - `/tomorrow` で `<TomorrowView />` の見出し「明日のタスク」 + 起票フォーム + 一覧 (もしくは空状態) が描画される.
  - placeholder の「準備中 (BL-038)」テキストは表示されない (置き換え済み).

### E2E (Playwright, 任意)

- **任意**: `e2e/tomorrow-view.spec.ts` を新規作成して以下を確認 (本 BL の完了条件としては必須としないが推奨):
  - 起動 → `/tomorrow` 遷移 → 起票 → 一覧に出る.
  - `/tomorrow` で「今日にする」を押す → タスクが一覧から消える → `/today` に遷移するとそのタスクが今日タスクとして出る.
  - `/tomorrow` で「削除」を押す → タスクが一覧から消える.
  - 明日タスク 0 件時に空状態テキストが出る.
- **既存 E2E の維持**: `e2e/sidebar-nav.spec.ts` で `/tomorrow` 遷移シナリオがある場合は本 BL で見出し「明日のタスク」が引き続き出ることを確認. 「準備中 (BL-038)」テキスト assert は更新.

### カバレッジ目標

- `<TomorrowView />` 単体: 主要分岐 (一覧描画 / 空状態 / 起票成功 / 「今日にする」成功 / 削除成功 / 412 / ネットワークエラー) を網羅.
- サーバ統合: `?dueDate` の 4 パターン (today / tomorrow / 未指定 / 不正値) を網羅.
- ルーティング結合: `/tomorrow` で実コンポーネントが描画される.

### 重視するもの

- **既存 E2E + 単体テストの green 維持** (`web/__tests__/today-view.test.tsx` / `server/__tests__/integration/tasks.test.ts` の既存テストが落ちないこと).
- **today-view.tsx を触らない** (非ゴール担保).
- **`?dueDate` パラメータ未指定時の既存挙動が維持される** (互換性 / 後方互換).
- **起票フォームに期限 UI が無い** (REQ-2 規約遵守).
- **カードのアクションが「削除」「今日にする」の 2 つのみ** (REQ-3 規約遵守).
