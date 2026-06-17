# タスク: Web mutation のアプリケーション層への移設

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 0. 前提確認（着手前）

- [x] 未決事項 Q-1〜Q-7 を確定する（Q-1=案B / Q-2=案A / Q-3=採用 / Q-4=採用 / Q-5=採用 / Q-7=完全適合。spec.md「確定事項」を参照）。
- [ ] 移設前に対象 view テストを実行し、現状すべて緑であることを記録する（回帰の基準点）。
  - `npx vitest run web/__tests__/today-view.test.tsx web/__tests__/tomorrow-view.test.tsx web/__tests__/focus-view.test.tsx web/__tests__/settings-view.test.tsx`（他 projects / routines / trash の該当テストも）。

## 1. 構造テスト（TDD: 先に red を用意 / test-designer）

- [ ] `__tests__/structure/web-usecase-layer.test.ts` を新設する。
  - [ ] AC-0: `web/src/usecases/{task,project,routine,trash,settings}-usecases.ts` の存在検証。
  - [ ] AC-1: 対象 7 view + `project-create-dialog.tsx` が `useMutation` を import / 直接構成しないことを検証（`@tanstack/react-query` の import から `useMutation` が消える / `useMutation(` の文字列不在）。
  - [ ] AC-2: 対象 view（settings-view を含む）が衝突例外型（`OptimisticLockError` / `ProjectConflictError` / `RoutineConflictError` / `RestoreConflictError` / `PatchConflictError`）と `../../offline-queue.js` を直接 import しないことを検証。`PatchConflictError` 不在は settings-view.tsx に対しても要求する（Q-7 確定）。
  - [ ] AC-3: `usecases/*-usecases.ts` が `ui/` 配下を import しないことを検証。
- [ ] 新設テストが（実装前のため）意図どおり red になることを確認する。

## 2. 共有ヘルパの抽出（implementer）

- [ ] `web/src/usecases/mutation-helpers.ts` を新設し、`generateId` / `safeEnqueue` / `safeDequeueByKey`、共通 `mutationFn` 骨格（enqueue → offline 分岐 → repo 呼び出し → 衝突変換 → dequeue）と `MutationDeps` 型を定義する。

## 3. ユースケースモジュール新設（implementer）

- [ ] `task-usecases.ts`: `useTaskMutations`（create / update / delete / complete / setFocus）。衝突変換は `OptimisticLockError`。標準 invalidate = `["today"]` / `["focus"]`。`deps.afterSuccess` で view 差異を吸収。
- [ ] `project-usecases.ts`: `useProjectMutations`（create / update / delete）。create は衝突変換なし。標準 invalidate = `["projects"]`。
- [ ] `routine-usecases.ts`: `useRoutineMutations`（create / update / delete）。衝突変換は `RoutineConflictError`。標準 invalidate = `["routines"]`。
- [ ] `trash-usecases.ts`: `useTrashMutations`（restore / empty）。restore の衝突変換は `RestoreConflictError`。invalidate = `["trash"]` / `["today"]`。
- [ ] `settings-usecases.ts`: `useSettingsMutations`（patch のみ）。`patchSettings` 呼び出しに加え、**412（`PatchConflictError`）判定をユースケース内に閉じる**（Q-7=完全適合）。衝突検知時は `onConflict(serverSettings)` 相当で view に最新値を渡す。再取得 / cache 反映の起動は view 側に残すが、`PatchConflictError` 型は view に出さない。

## 4. view の置換（implementer）

- [ ] `today-view.tsx`: 5 mutation を `useTaskMutations` に置換。`useMutation` / offline-queue / `OptimisticLockError` の import を撤去。`afterSuccess` に `invalidateAll`（today/focus）を渡す。
- [ ] `tomorrow-view.tsx`: create/delete（`["tomorrow"]`）と update/complete（`invalidateAfterMoveToToday` の fetchQuery 連鎖）を `afterSuccess` で出し分けて置換。
- [ ] `focus-view.tsx`: complete / update / delete を `useTaskMutations` に置換。
- [ ] `projects-view.tsx`: create / update / delete を `useProjectMutations` に置換。
- [ ] `project-create-dialog.tsx`: create を `useProjectMutations`（または create 単独フック）に置換。onSuccess の自動選択 / onClose は view 側コールバックで保持。
- [ ] `routines-view.tsx`: create / update / delete を `useRoutineMutations` に置換。
- [ ] `trash-view.tsx`: restore / empty を `useTrashMutations` に置換。
- [ ] `settings-view.tsx`: `patchMutation` を `useSettingsMutations().patch` に置換。`PatchConflictError` の import / 412 判定を撤去し、`onConflict(serverSettings)` で受けた最新値の表示に置換。`handleSave` の成功時再取得 / `setQueryData` は維持。

## 5. テスト

- [ ] 構造テスト（タスク 1）が緑になることを確認（AC-0〜AC-3）。
- [ ] 既存 view テスト・ConflictDialog テスト・offline 楽観成功テストが無改修で緑のまま通ることを確認（AC-4〜AC-8）。
- [ ] テストが mutation 内部実装に依存して赤化した場合のみ、test-designer に追従可否を確認（振る舞い不変が前提）。
- [ ] リポジトリルートから `npx vitest run` で全体回帰を確認。

## ドキュメント

- [ ] `module-boundaries.md` §5.3 違反が解消されたことを確認（ドキュメント自体の追記は不要 / 仕様適合の確認のみ）。
- [ ] backlog の BL-118 完了条件「view 層から `useMutation` の直接構成と Repository の直接 import が消える」を満たすことを確認。

## 仕上げ

- [ ] 受け入れ基準（spec.md AC-0〜AC-8）を全て満たすことを確認。
- [ ] `auditor` にレビュー依頼。
