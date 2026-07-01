# 設計・実装計画: 明日ビューのタスク優先度変更 (tomorrow-task-priority)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

今日ビュー (`today-view.tsx`) に完成している優先度変更機構を、明日ビュー (`tomorrow-view.tsx`) へ横展開する。UI 部品 (`<PriorityStars />`) と `<TaskCard>` の `showPriority` / `onSetPriority` props、サーバ側 `PATCH /api/v1/tasks/:id { priority }` はすべて既存で流用できるため、変更は tomorrow-view.tsx への **ハンドラ 1 本追加 + `<TaskCard>` の props 配線変更** に閉じる。invalidate は `["tomorrow"]` のみに限定する（優先度変更は明日一覧の並び替え以外に影響しないため）。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし（`PATCH /api/v1/tasks/:id { priority }` は受理済み） |
| DB | なし |
| モジュール | `web/src/ui/tomorrow-view/tomorrow-view.tsx` のみ改修。`<TaskCard>` / `<PriorityStars />` / `useTaskMutations` / repository は無改修で流用 |
| UI | 明日タスクカードに優先度星 UI が表示され、クリックで変更可能になる（`showPriority=false` → `true` + `onSetPriority` 配線） |

## 設計詳細

### データモデル

- 変更なし。`Task.priority: Priority ("highest" | "normal" | "later")` を既存のまま使う。
- 更新コマンド `UpdateTaskCommand = { id, ifMatch, patch: { priority } }` は既存型をそのまま使う（`task-repository.ts`）。

### 処理フロー

1. リストの各 `<TaskCard>` に `showPriority`（true）と `onSetPriority={(next) => handleSetPriority(task, next)}` を配線する。
2. `<TaskCard>` 内部で `showPriority && onSetPriority` が真になり `<PriorityStars value={task.priority} onChange={onSetPriority} idPrefix={"task-" + task.id} groupLabel={task.name + " の優先度"} />` が描画される（task-card.tsx 既存ロジック）。
3. ユーザーが星をクリック → `<PriorityStars>` がクリック星に対応する `Priority` を算出。同値なら `onChange` を呼ばない（BL-040 の D-003）。
4. 異値のとき `handleSetPriority(task, next)` が発火。ハンドラ側でも `task.priority === next` を二重ガード（REQ-3）。
5. `updatePriorityMutation.mutateAsync({ id: task.id, ifMatch: task.version, patch: { priority: next } })` を try/catch で呼ぶ（onError で通知済みのため catch は空）。
6. 成功時、この mutation の `invalidateKeys: [["tomorrow"]]` により `["tomorrow"]` が invalidate され、`repository.list({ dueDate: "tomorrow" })` が再フェッチされる。サーバ側 `priority → createdAt 降順 → id 昇順` (BL-141) で並び替えられた結果で一覧が再描画される。

### mutation 系統の使い分け（重要）

tomorrow-view には `useTaskMutations` が **2 系統** 存在する。

- 系統 A（`create` / `delete` を取得）: `invalidateKeys: [["tomorrow"]]`。副作用フックなし。
- 系統 B（`update` / `complete` を取得）: `invalidateKeys: [["tomorrow"], ["today"], ["focus"]]` + `afterSuccess: fetchTodayAndFocus`。

現状、`handleMoveToToday`（今日にする）・`handleComplete`・`handleNameBlur`・`handleChangeProject` はすべて **系統 B の `update`** を使っている。

本 feature の優先度変更は **系統 A から `update` を取り出して使う**（D-002）。系統 A は現状 `{ create, delete }` のみ destructure しているので、`update: updatePriorityMutation` を追加で取り出す。これにより優先度変更は `["tomorrow"]` のみ invalidate となる。

> 補足: `handleNameBlur` / `handleChangeProject` は現状 系統 B（3 key）を使っており、名前・プロジェクト変更でも today/focus を再フェッチしている。これは BL-108 時点の設計で、本 feature のスコープ外につき変更しない。優先度についてのみ最小 invalidate を新規採用する。

### 例外 / エラー処理

- online 412: `useTaskMutations` の `onConflict: conflictDialog.openDialog` 経由で `ConflictDialog` を開く（既存経路）。
- ネットワークエラー / 401: `useTaskMutations` 内の onError が `notifyError("通信に失敗しました")` を呼ぶ（既存経路）。
- offline: `offline-queue.ts` に enqueue し楽観成功（既存経路）。
- 上記いずれも本 feature 固有の新規実装はない。系統 A の `update` を使っても `onConflict` は系統 A の構成に含まれる（create/delete と同じ `onConflict: conflictDialog.openDialog` を渡している）ため、ConflictDialog / notifyError / offline は共有される。

## 重要な決定

- **D-001（優先度変更ハンドラの追加）**: tomorrow-view に `handleSetPriority(task, next)` を追加する。today-view の同名ハンドラと同型（同値ガード → `updateMutation.mutateAsync({ id, ifMatch: version, patch: { priority } })`）。明日タスク固有の追加考慮は invalidate 範囲のみ（D-002）で、それ以外は today-view と同一でよい。
- **D-002（invalidate は `["tomorrow"]` のみ）**: 優先度変更成功時の invalidate / 再フェッチは `["tomorrow"]` のみ。`["today"]` / `["focus"]` は対象外、`fetchTodayAndFocus` も呼ばない。
  - 根拠: 明日タスクの優先度変更は dueDate を変えない。`repository.today()` は dueDate=today のみ返し、focus は dueDate=today のタスクしか取り得ないため、明日タスクの優先度は today 一覧にも focus 選定（nextTaskId / currentTaskId）にも一切影響しない。系統 B（3 key + fetchTodayAndFocus）を流用すると today() と getFocus() を無駄に 2 回叩く過剰 fetch になる。これを避けるため系統 A の `update` を使う。
  - 対比: 「今日にする」(`handleMoveToToday`) は dueDate を today に変えるため today/focus に影響し、3 key invalidate + fetchTodayAndFocus が正しい（tomorrow-view D-004、据え置き）。この差分が本 feature の設計上の要点。
- **D-003（mutate 呼び分け）**: `mutateAsync` を try/catch で包む（catch は空）。tomorrow-view の既存 update 系ハンドラ（`handleNameBlur` / `handleChangeProject`）と同じ流儀で unhandled rejection を防ぐ。today-view の `handleSetPriority` は try/catch なしだが、通知・ConflictDialog は onError 経由で発火するため挙動は同値。明日ビュー内の一貫性を優先する。
- **D-004（起票フォームとの一貫性）**: 明日ビューの起票フォームには既に優先度星入力がある。カード側に星を足すことで「起票時に決める / 後から変える」の両方が揃い、今日ビューと同じ操作体系になる。起票フォームは無改修。id 衝突はフォーム側が `idPrefix="tomorrow-create"` 相当、カード側が `task-<id>` prefix のため発生しない。
- **D-005（doc は本 feature dir を正本とする）**: tomorrow-view/spec.md の `showPriority=false` / 「優先度切替 UI 非ゴール」は過去記録として据え置き、本 feature の spec.md を現行正本とする（詳細は tasks.md）。

ADR 化は不要と判断（既存パターンの横展開であり、新規のアーキ判断を含まない）。invalidate 最小化の判断は plan D-002 に記録して足りる。

## リスク / 代替案

- **リスク: 低**。既存部品・既存 mutation の再利用で、新規コードはハンドラ 1 本と props 配線のみ。offline / ConflictDialog 経路は既存流用で追加リスクなし。
- **代替案（却下）: 系統 B の `update` をそのまま流用する**。実装は最小（handleSetPriority を系統 B で書くだけ）だが、優先度変更のたびに today() と getFocus() を無駄に再フェッチする過剰 fetch になる。spec REQ-5 の「明日ビューの並び替えにのみ影響」に反するため却下。
- **リスク: BL-141 との相互作用**。優先度変更で並びが変わるため、BL-141（createdAt 降順タイブレーク）とセットで検証するのが自然。BL-141 は Done 済みで、明日 list のソートはサーバ正本に集約済みのため、本 feature はクライアント再ソートを持たず追従するだけでよい。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- **単体（web / vitest, jsdom）**: `web/__tests__/tomorrow-view.test.tsx` に追記。既存 mock repository（`listMock` / `todayMock` / `getFocusMock` / `updateMock` を公開）を流用する。
  - 星表示（REQ-1）: カード内に radiogroup + radio×3 が出て現在値に応じた lit 数になる。
  - 星クリックで update が `patch: { priority }` で 1 回呼ばれる（REQ-2）。dueDate/name/projectId が patch に含まれないこと。
  - 同値クリックで update が呼ばれない（REQ-3）。
  - 変更後に listMock が再フェッチされる（REQ-4）。
  - **invalidate 差分（REQ-5 / 最重要）**: 優先度変更後、listMock は増えるが todayMock / getFocusMock は増えない。対照として「今日にする」では 3 つとも増える（既存テスト シナリオ C の踏襲）。
  - ConflictDialog / notifyError（REQ-6）: 既存の「今日にする」用 412 / エラーテストと同じ mock 差し込みで優先度版を追加。
- **回帰**: 既存 tomorrow-view / today-view / task-card テストが緑のまま維持されること（`npx vitest run` を repo ルートから実行）。
- **lint / typecheck**: `npm run lint`（warning 0）/ `npm run typecheck`（pass）を完了条件に含める。
</content>
