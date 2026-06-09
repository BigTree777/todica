# 設計・実装計画: 「現在のタスク」独立ビュー化 (focus-view)

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md) を参照. 上位 feature は [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) / [`../ui-sidebar-nav/spec.md`](../ui-sidebar-nav/spec.md). 前提 BL は [`../focus-task/spec.md`](../focus-task/spec.md) (BL-006).

## 方針概要

- **`web/src/ui/focus-view/focus-view.tsx` を新設**して BL-036 の `FocusViewPlaceholder` を実コンポーネントに置き換える. `main.tsx` の `/focus` ルート割り当てと placeholder ファイルの削除を行う.
- **今日ビューを触らない**. `today-view.tsx` 内の `<section aria-label="現在のタスク">` および 6 ボタンの強調セクションはそのまま残し, 過渡期として並走させる. 後続 BL (今日ビュー分解) で today-view 側を削る.
- **既存実装を踏襲**: `useQuery` で `/today` と `/focus` を取得, `useMutation` で `complete` / `delete` を発行. `today-view.tsx` の `completeMutation` / `deleteMutation` を雛形とし, 412 → `ConflictError` 変換 (BL-031) / `notifyError` (BL-034) / オフラインキュー (`offline-queue.ts`) の枠組みを再利用する.
- **`setFocus` は呼ばない**: 自動解除はサーバ側 (FR-013 / BL-006 `clearFocusIfMatches`) で行われるため, クライアントから明示的な解除 API 呼び出しを行わない. 完了 / 削除後の query invalidate のみで暗黙フォールバック (`null ?? nextTaskId`) が次のタスクに繰り上がる.
- **デザイン**: モックに合わせて大きな角丸枠 + 中央寄せ. CSS は `web/src/ui/focus-view/focus-view.css` に局所化. デザイントークン無しの暫定値 + `/* TODO(BL-046) */` マーカー.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし. 既存 `GET /api/v1/today` / `GET /api/v1/focus` / `POST /api/v1/tasks/:id/complete` / `DELETE /api/v1/tasks/:id` を無改修で使う. |
| DB | なし. データモデル変更なし. |
| ドメイン層 | なし. |
| モジュール | **新規**: `web/src/ui/focus-view/focus-view.tsx` / `web/src/ui/focus-view/focus-view.css`. **削除**: `web/src/ui/focus-view/focus-view-placeholder.tsx`. **変更**: `web/src/main.tsx` の import と `/focus` ルート element. |
| UI | `/focus` がフォーカス対象を単独大表示する独立ビューになる. `/today` の focus セクション (現状) は本 BL では無改修. |
| テスト | **新規**: `web/__tests__/focus-view.test.tsx` (focus-view 単体). `e2e/focus-view.spec.ts` (任意). **変更**: `web/__tests__/router.test.tsx` (もし `/focus` placeholder のテストがあれば実コンポーネントに追従). 既存 `web/__tests__/today-view.test.tsx` の focus 関連テストは無改修で維持. |
| ドキュメント | `docs/developer/features/focus-view/` の 3 ファイル新規追加. `docs/developer/planning/backlog.md` の BL-037 を「Done」へ更新 (マージ後. 管理者が実施). ADR は不要. |

## 設計詳細

### コンポーネント階層 (実装後)

```
<BrowserRouter>
  <App>
    <OfflineBanner />       (現状維持)
    <PwaUpdateBanner />     (現状維持)
    <ErrorNotification />   (現状維持)
    <Routes>
      <Route path="/setup" element={<SetupViewWithNav ... />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route path="/focus"    element={<FocusView repository={repos.task} projectRepository={repos.project} />} />   ← 本 BL で差し替え
        <Route path="/today"    element={<TodayView ... />} />            ← 無改修
        <Route path="/tomorrow" element={<TomorrowViewPlaceholder />} />  ← BL-038 まで placeholder
        <Route path="/projects" element={<ProjectsView ... />} />
        <Route path="/routines" element={<RoutinesView ... />} />
        <Route path="/trash"    element={<TrashView ... />} />
        <Route path="/settings" element={<SettingsView ... />} />
      </Route>
    </Routes>
  </App>
</BrowserRouter>
```

### FocusView コンポーネント設計

**ファイル**: `web/src/ui/focus-view/focus-view.tsx`

**props**:

```tsx
export interface FocusViewProps {
  repository: TaskRepository;        // BL-036 ui-sidebar-nav D-001 / spec U-006 の方針: AppShell ではなく view 単位で注入.
  projectRepository: ProjectRepository;  // プロジェクト名の副情報表示のため.
}
```

**役割**:
- `useQuery` で `/today` / `/focus` / `/projects` を取得 (今日ビューと同じ query key を再利用. spec U-007).
- フォーカス対象 = `focusData.currentTaskId ?? nextTaskId` で決定し, `tasks.find(t => t.id === focusedId)` で実体を引く.
- `useMutation` で `complete` / `delete` を発行. 雛形は `today-view.tsx` の `completeMutation` / `deleteMutation` をコピーして以下を踏襲:
  - `safeEnqueue` で書込キューに enqueue (offline 対応).
  - `!navigator.onLine` の時は楽観的に成功を返す.
  - online 時は `OptimisticLockError` を catch して `findEntryByKey` + `ConflictError` に変換.
  - `onSuccess` で `["today"]` / `["focus"]` を invalidate.
  - `onError` で `ConflictError` なら `useConflictDialog.openDialog`, それ以外なら `notifyError("通信に失敗しました")`.

**疑似コード**:

```tsx
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Task } from "@todica/domain/task";
import type {
  CompleteTaskCommand, DeleteTaskCommand,
  FocusSelection, TaskRepository,
} from "../../repositories/task-repository.js";
import { OptimisticLockError } from "../../repositories/task-repository.js";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import { enqueue, dequeue, getAll, findEntryByKey, ConflictError } from "../../offline-queue.js";
import { notifyError } from "../../error-notification.js";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import "./focus-view.css";

export interface FocusViewProps {
  repository: TaskRepository;
  projectRepository: ProjectRepository;
}

export function FocusView({ repository, projectRepository }: FocusViewProps): JSX.Element {
  const queryClient = useQueryClient();
  const conflictDialog = useConflictDialog();

  const { data: todayData } = useQuery({
    queryKey: ["today"], queryFn: () => repository.today(), networkMode: "offlineFirst",
  });
  const { data: focus } = useQuery({
    queryKey: ["focus"], queryFn: () => repository.getFocus(), networkMode: "offlineFirst",
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"], queryFn: () => projectRepository.list(), networkMode: "offlineFirst",
  });

  const tasks = todayData?.tasks ?? [];
  const nextTaskId = todayData?.nextTaskId ?? null;
  const focusData = focus as FocusSelection | undefined;
  const focusedId: string | null = focusData?.currentTaskId ?? nextTaskId;
  const focusedTask: Task | null = focusedId
    ? tasks.find((t) => t.id === focusedId) ?? null
    : null;
  const project: Project | null = focusedTask?.projectId
    ? (projectsData ?? []).find((p) => p.id === focusedTask.projectId) ?? null
    : null;

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["today"] });
    void queryClient.invalidateQueries({ queryKey: ["focus"] });
  }, [queryClient]);

  // completeMutation / deleteMutation は today-view.tsx と同じ雛形.
  // safeEnqueue + offline 分岐 + OptimisticLockError → ConflictError 変換 + onError ハンドリング.
  const completeMutation = useMutation({ /* ... 中身は処理フロー §1 参照 ... */ });
  const deleteMutation   = useMutation({ /* ... 中身は処理フロー §2 参照 ... */ });

  const handleComplete = useCallback(async () => {
    if (!focusedTask) return;
    const cmd: CompleteTaskCommand = { id: focusedTask.id, ifMatch: focusedTask.version };
    await completeMutation.mutateAsync(cmd);
  }, [focusedTask, completeMutation]);

  const handleDelete = useCallback(async () => {
    if (!focusedTask) return;
    const cmd: DeleteTaskCommand = { id: focusedTask.id, ifMatch: focusedTask.version };
    await deleteMutation.mutateAsync(cmd);
  }, [focusedTask, deleteMutation]);

  return (
    <section aria-label="現在のタスク" className="focus-view">
      <h1>現在のタスク</h1>
      <div className="focus-view__card">
        {focusedTask ? (
          <>
            {project && <span className="focus-view__project">{project.name}</span>}
            <div className="focus-view__name">{focusedTask.name}</div>
            <div className="focus-view__actions">
              <button type="button" onClick={handleDelete}>削除</button>
              <button type="button" onClick={handleComplete}>完了</button>
            </div>
          </>
        ) : (
          <div className="focus-view__empty">現在のタスクはありません</div>
        )}
      </div>
      <ConflictDialog
        open={conflictDialog.dialogState.open}
        localValue={conflictDialog.dialogState.localValue}
        serverValue={conflictDialog.dialogState.serverValue}
        onAcceptServer={conflictDialog.onAcceptServer}
        onRetryWithServer={conflictDialog.onRetryWithServer}
      />
    </section>
  );
}
```

### CSS 設計 (暫定)

**ファイル**: `web/src/ui/focus-view/focus-view.css`

**方針**: モックに合わせ大きな角丸枠 + 中央寄せ. 暫定値 + `/* TODO(BL-046) */` マーカー.

```css
/* TODO(BL-046): 暫定値はデザイントークン化する. */

.focus-view {
  display: flex;
  flex-direction: column;
  /* メイン領域 (AppShell の <main>) の高さに合わせる. */
  min-height: 100%;
}

.focus-view h1 {
  /* TODO(BL-046): --font-size-h1 */
  font-size: 24px;
  /* TODO(BL-046): --space-md */
  margin: 0 0 16px 0;
}

.focus-view__card {
  /* 画面の主要部分を占める大きな枠 */
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  /* TODO(BL-046): --radius-lg */
  border-radius: 16px;
  /* TODO(BL-046): --color-border */
  border: 1px solid #ccc;
  /* TODO(BL-046): --space-xl */
  padding: 32px;
  position: relative;  /* アクション配置のため */
}

.focus-view__project {
  /* タスク名の上に小さく出る副情報 */
  /* TODO(BL-046): --font-size-small */
  font-size: 14px;
  /* TODO(BL-046): --color-fg-subtle */
  color: #666;
  /* TODO(BL-046): --space-sm */
  margin-bottom: 8px;
}

.focus-view__name {
  /* TODO(BL-046): --font-size-h2 */
  font-size: 28px;
  text-align: center;
  /* タスク名が長い場合は自然な折返し (spec U-003) */
  word-break: normal;
  overflow-wrap: anywhere;
}

.focus-view__empty {
  /* TODO(BL-046): --font-size-body / --color-fg-subtle */
  font-size: 18px;
  color: #999;
}

.focus-view__actions {
  /* 枠の下部に左=削除 / 右=完了 を配置 (spec U-006) */
  position: absolute;
  /* TODO(BL-046): --space-md */
  bottom: 16px;
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
}
```

### main.tsx の変更点

**変更前** (BL-036 完了時点):

```tsx
import { FocusViewPlaceholder } from "./ui/focus-view/focus-view-placeholder.js";
// ...
<Route path="/focus" element={<FocusViewPlaceholder />} />
```

**変更後**:

```tsx
import { FocusView } from "./ui/focus-view/focus-view.js";
// ...
<Route path="/focus" element={<FocusView repository={repos.task} projectRepository={repos.project} />} />
```

加えて, `web/src/ui/focus-view/focus-view-placeholder.tsx` を削除する.

### データモデル

変更なし.

### 処理フロー

#### §1 完了 (REQ-5)

1. ユーザーが /focus 上の「完了」ボタンを押す.
2. `handleComplete` が `completeMutation.mutateAsync({ id: focusedTask.id, ifMatch: focusedTask.version })` を呼ぶ.
3. `completeMutation.mutationFn`:
   a. `idempotencyKey = generateId()` を採番.
   b. `safeEnqueue` で `POST /api/v1/tasks/{id}/complete` を書込キューに保存 (offline 対応 / BL-018).
   c. `navigator.onLine` が false なら `undefined` を返して終了 (offline 楽観成功).
   d. online なら `repository.complete(cmd)` を呼ぶ.
   e. 成功なら `safeDequeueByKey(idempotencyKey)` でキュー entry を削除.
   f. `OptimisticLockError` を catch したら `findEntryByKey(idempotencyKey)` で queue 内 entry を引き `ConflictError(entry, error.currentTask ?? {})` に変換して throw (BL-031).
4. `onSuccess`: `invalidateAll` で `["today"]` / `["focus"]` を invalidate. → サーバ側で BL-006 `clearFocusIfMatches` が走り `FocusSelection.currentTaskId = null` に解除されている. completionCount は +1 されている.
5. 再フェッチ後の focus-view は暗黙フォールバック `null ?? nextTaskId` で次のタスクを表示する.
6. `onError`:
   - `ConflictError` なら `conflictDialog.openDialog(error.entry, error.serverValue)`.
   - それ以外なら `notifyError("通信に失敗しました")` (BL-034).

#### §2 削除 (REQ-6)

完了と同じ枠組みで, `DELETE /api/v1/tasks/{id}` を発行する. サーバ側で BL-001 のゴミ箱送り (`trashedReason = "deleted"`) + BL-006 自動解除 + BL-012 カウンタ非加算が走る.

### 例外 / エラー処理

- **online 412**: BL-031 と同じパターンで `OptimisticLockError` を `ConflictError` に変換し `ConflictDialog` を開く.
- **ネットワークエラー / 401**: BL-034 の `notifyError("通信に失敗しました")` でバナー表示.
- **offline**: BL-018 の書込キューに enqueue. 次回 online + Service Worker sync で flush.
- **対象タスクが取得できない (focusedTask = null)**: REQ-2 の空状態を表示. ボタンを非表示 (spec U-005) にして押下経路を絶つ.

## 重要な決定

- **D-001 setFocus を呼ばない**. 自動解除はサーバ側 (FR-013 / BL-006 `clearFocusIfMatches`) に委ねる. クライアントから明示的な解除 API は発行しない. 理由: サーバが complete / delete のロジックの中で focus 解除も保証しているため (BL-006 既存実装). 二重に呼ぶと無駄な PUT /focus + If-Match 競合のリスクが増える.
- **D-002 暗黙フォールバックを今日ビューと同じ式で表現**. `focusData.currentTaskId ?? nextTaskId` を踏襲. 今日ビュー (`today-view.tsx` の `focusedId` ロジック) と同じセマンティクスを共有する. 将来共通フック化する余地はあるが本 BL では行わない.
- **D-003 query key を今日ビューと共有**. `["today"]` / `["focus"]` / `["projects"]`. TanStack Query のキャッシュ共有で `/focus` ↔ `/today` 遷移時の再フェッチが省ける (spec U-007).
- **D-004 today-view を触らない**. `today-view.tsx` 内の focus セクションは過渡期として残す. 削除は後続 BL (今日ビュー分解) で行う. 理由: today-view を触ると BL-001 〜 BL-031 の既存 E2E / 単体テストへの影響が広がる. 本 BL は focus-view 新設のみに専念する.
- **D-005 placeholder ファイルを削除**. `web/src/ui/focus-view/focus-view-placeholder.tsx` は BL-036 で一時的に置かれたもので, 本 BL の実コンポーネント追加で役目を終える. 削除して main.tsx の import も実コンポーネントに差し替える.
- **D-006 props で repository を注入する** (AppShell 経由ではなく). ui-sidebar-nav D-001 / spec U-006 の方針 (AppShell は presentational only, props drilling 継続) を踏襲. `main.tsx` の Route element で `<FocusView repository={repos.task} projectRepository={repos.project} />` の形で直接渡す.
- **D-007 CSS は暫定値 + TODO(BL-046) マーカー**. BL-036 で確立した手法 (`app-shell.css`) と同じ. grep 可能なマーカーで BL-046 着手時の置換漏れを防ぐ.
- **D-008 タスクなし時はボタン非表示** (spec U-005). 認知負荷を減らす. 押下経路も絶つ (`onClick` 呼び出しを書かない).
- **D-009 ADR は新規作成しない**. 設計判断は ui-redesign-foundation / ui-sidebar-nav で既に確定済みの方針を踏襲するのみ.

## リスク / 代替案

- **R-001 today-view の focus セクションと並存することによる UX 混乱**. 過渡期として許容する (spec U-009). 後続 BL (今日ビュー分解) で today-view 側を削除して収束させる. 本 BL の PR 説明・spec 内で明示.
- **R-002 既存 `web/__tests__/today-view.test.tsx` の focus 関連テストへの影響**. 本 BL は today-view を触らないため影響しない見込み. 念のため CI で全 web テストを実行して確認する.
- **R-003 `/focus` placeholder を期待する既存テスト (router.test.tsx / E2E sidebar-nav.spec.ts) への影響**. BL-036 で sidebar-nav.spec.ts が `/focus` 遷移後の見出し「現在のタスク」を確認する形になっており, 本 BL でも見出しは同じ「現在のタスク」を維持するため selector ベースでは影響しない. 「準備中 (BL-037)」テキストを assert している場合はそちらを更新する必要がある.
- **R-004 完了 / 削除直後の再フェッチで一瞬「現在のタスクはありません」が表示されるリスク**. サーバ側の自動解除 + nextTaskId 計算が反映されるまでの間, 楽観 UI を持たないと一瞬空状態がチラつく可能性. 本 BL ではサーバ正本値再フェッチ方式を採り, チラつきは許容する (今日ビューと同じ方針, plan D-008 of completion-counter).
- **R-005 今日のタスクが 1 件のみの状態で削除 → 直後に同じ画面で完了ボタンを押そうとしてもタスクは無い**. REQ-2 の空状態へ遷移しボタンが非表示になるため操作経路は閉じる. 二重押下のリスクは無い.
- **R-006 ConflictDialog の動作確認は E2E では `page.route` で 412 を返す形になる**. BL-031 の `e2e/conflict-handling.spec.ts` と同じパターンで書ける. 本 BL では E2E 追加は任意.
- **R-007 デザイントークン未整備のままモックの見た目を再現することの精度**. 暫定値で「大きな角丸枠 + 中央寄せ + 削除/完了 2 ボタン」は再現できるが, モックの細かな比率は BL-046 で再調整する前提.
- **代替案 1: today-view の focus セクションを本 BL で同時に削除する**. 採用しない. 非ゴール. 影響範囲を広げる.
- **代替案 2: `/focus` を独立ルートにせず, /today の中で「フォーカスモード」のトグルを設ける**. 採用しない. ui-redesign-foundation REQ-1 / REQ-2 / BL-036 で「3 ビュー独立ルート」が確定している.
- **代替案 3: focus 自動解除をクライアントから明示 `setFocus({ taskId: null })` で行う**. 採用しない. D-001 参照.
- **代替案 4: focus-view を `today-view.tsx` の focus セクションのコンポーネント抽出として実装する**. 採用しない. 抽出のための today-view 変更が発生し非ゴールに反する.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (Vitest + React Testing Library)

- **対象**: `web/__tests__/focus-view.test.tsx` を新規作成し `<FocusView />` 単体をテストする.
- **観点**:
  - フォーカス対象がある時, 見出し「現在のタスク」 + タスク名が大きく表示される (REQ-1).
  - プロジェクト名が副情報として表示される (REQ-1).
  - 暗黙フォールバック (`currentTaskId = null` で `nextTaskId` のタスクが表示される) (REQ-3).
  - 明示設定 (`currentTaskId = B.id`) で nextTaskId より優先される (REQ-3).
  - タスクなし時に「現在のタスクはありません」と空状態が表示される (REQ-2).
  - タスクなし時に「削除」「完了」ボタンが存在しない (REQ-2 / D-008).
  - 画面内のボタンは「削除」「完了」の 2 つだけ (REQ-4).
  - 「編集」「優先度切替」「明日へ」「今日へ」「現在解除」「現在に設定」のボタンが無い (REQ-4).
  - 起票フォーム (タスク名 / プロジェクト / 優先度 / 期限の入力) が無い (REQ-7).
  - 「完了」ボタン押下で `repository.complete({ id: focusedTask.id, ifMatch: focusedTask.version })` が呼ばれる (REQ-5).
  - 「削除」ボタン押下で `repository.delete({ id: focusedTask.id, ifMatch: focusedTask.version })` が呼ばれる (REQ-6).
  - 完了 / 削除成功後に `["today"]` / `["focus"]` が invalidate される (再フェッチが走る).
  - 412 `OptimisticLockError` 時に `ConflictDialog` が開く (REQ-8).
  - ネットワークエラー時に `notifyError("通信に失敗しました")` が呼ばれる (BL-034).
- **モック**: `TaskRepository` / `ProjectRepository` を `vi.fn()` で実装. `QueryClientProvider` でラップ (`web/__tests__/today-view.test.tsx` の `renderWithQueryClient` パターンを踏襲).

### 結合テスト (Vitest + MemoryRouter)

- **対象**: `web/__tests__/router.test.tsx` (既存) を拡張 (もし BL-036 で `/focus` placeholder のテストが入っていれば実コンポーネントに追従).
- **観点**:
  - `/focus` で `<FocusView />` の見出し「現在のタスク」 + 「削除」「完了」ボタンが描画される.
  - placeholder の「準備中 (BL-037)」テキストは表示されない (置き換え済み).

### E2E (Playwright)

- **任意**: `e2e/focus-view.spec.ts` を新規作成して以下を確認 (本 BL の完了条件としては必須としないが推奨):
  - 起動 → `/focus` 遷移 → タスク名が大きく表示される.
  - `/focus` で「完了」を押すと完了 + 次のタスクに繰り上がる.
  - `/focus` で「削除」を押すと削除 + 次のタスクに繰り上がる.
  - 今日のタスクが 0 件の時 `/focus` で「現在のタスクはありません」が表示される.
- **既存 E2E の維持**: `e2e/sidebar-nav.spec.ts` の `/focus` 遷移後の見出し「現在のタスク」を assert する箇所は本 BL でも green を維持する. 「準備中 (BL-037)」テキストを assert している場合は更新する.

### カバレッジ目標

- `<FocusView />` 単体: 主要分岐 (タスクあり / なし / 完了成功 / 削除成功 / 412 / ネットワークエラー) を網羅.
- ルーティング結合: `/focus` で実コンポーネントが描画される.
- E2E: 任意. `e2e/sidebar-nav.spec.ts` の selector が維持される.

### 重視するもの

- **既存 E2E + 単体テストの green 維持** (`web/__tests__/today-view.test.tsx` の focus 関連テストが落ちないこと).
- **focus-view が `setFocus` を呼ばないこと** (D-001 / FR-013 サーバ側自動解除に委ねる).
- **「削除」「完了」以外のボタンが存在しないこと** (REQ-4 規約遵守).
- **空状態でボタンが押せないこと** (REQ-2 / D-008).
