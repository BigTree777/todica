# タスク: サーバアプリケーション層の抽出（server-app-layer-extraction）

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 決定事項（確認済み・クローズ）

- [x] D-U1: `server/src/use-cases/`（daily-reset / purge-trash）は無改修ラッパとして再利用。二重化整理は本 BL 対象外（別 BL 候補）。
- [x] D-U2: `today.ts` を `today-usecases.ts` として抽出対象に含め、9 モジュール構成で確定。`routers/auth.ts` はスコープ外で据え置き。
- [x] D-U3: ユースケースは例外を投げず discriminated union（ok / invalid / notFound / conflict / noop）を返し、HTTP 写像はルータが行う。
- [x] D-U4: ユースケース層の単体テスト追加要否は test-designer の判断に委ねる（必須ではない）。

## 準備

- [ ] 抽出前に vitest 全件・Playwright 全件・typecheck・lint を実行し、全 green / 0 件のベースラインを記録。

## 実装（アプリケーション層の新設）

- [ ] `server/src/app/` を作成し、ユースケース結果型（`UsecaseResult` 相当の discriminated union）を定義。
- [ ] `focus-usecases.ts`: `getFocus` / `setFocus`（存在・ゴミ箱・dueDate 検証）/ `clearFocusIfMatches`（`_shared.ts` から移設）。
- [ ] `task-usecases.ts`: `createTask` / `updateTask`（dueDate=tomorrow で focus 解除）/ `completeTask`（既ゴミ箱 no-op・通常→完了で counter +1・focus 解除）/ `deleteTask`（既 deleted no-op・focus 解除）。
- [ ] `project-usecases.ts`: `createProject` / `updateProject` / `deleteProject`（カスケード NULL 化のトランザクション境界をユースケース内に閉じる、db 有無フォールバック含む）。
- [ ] `routine-usecases.ts`: `createRoutine` / `updateRoutine` / `deleteRoutine`（配下未ゴミ箱タスク削除のトランザクション境界をユースケース内に閉じる、db 有無フォールバック含む）。
- [ ] `counter-usecases.ts`: `getCounter`。
- [ ] `settings-usecases.ts`: `getSettings` / `updateDayBoundaryTime`（検証 + 楽観ロック + version+1 / updatedAt 組み立て）。
- [ ] `trash-usecases.ts`: `listTrash` / `restoreTask`（未ゴミ箱なら 400 相当 / 楽観ロック / dueDate を today にリセット）/ `purgeTrash`。
- [ ] `reset-usecases.ts`: `runDailyResetIfNeeded`（`maybeRunDailyReset` ラッパ + 結果整形）。
- [ ] `today-usecases.ts`: `getTodayView`（リセット → list → filter/sort/pick → focus/counter）。

## 実装（ルータの presentational 化）

- [ ] `routers/tasks.ts`: 各ハンドラを task-usecases 呼び出し + HTTP 写像に縮約。GET の `sortTasks` は presentational helper として残す。
- [ ] `routers/projects.ts`: project-usecases 呼び出しへ。`deps.db.transaction` 直書きを除去。
- [ ] `routers/routines.ts`: routine-usecases 呼び出しへ。`deps.db.transaction` 直書きを除去。
- [ ] `routers/focus.ts`: focus-usecases 呼び出しへ。
- [ ] `routers/counter.ts`: counter-usecases 呼び出しへ。
- [ ] `routers/settings.ts`: settings-usecases 呼び出しへ。
- [ ] `routers/trash.ts`: trash-usecases 呼び出しへ。`restoreTask` のドメイン直呼びを除去。
- [ ] `routers/reset.ts`: reset-usecases 呼び出しへ。
- [ ] `routers/today.ts`: today-usecases 呼び出しへ。`maybeRunDailyReset` / `filterToday` 等の直接組み立てを除去。
- [ ] `routers/auth.ts`: 本 feature では無改修（スコープ外）。
- [ ] `_shared.ts` から `clearFocusIfMatches` を除去し、残す helper を `saveAndReturn` / `errorJson` / `sortTasks` に限定。

## テスト

- [ ] 既存 vitest 全件が無改修で green（振る舞い不変の主担保）。
- [ ] 既存 Playwright 全件が green。
- [ ] （任意 / D-U4: test-designer 判断）ユースケース層の単体テストを追加。追加要否は test-designer が決定する。
- [ ] AC-2: ルータに `@todica/domain/*` 直呼び・Repository 組み立て・`deps.db.transaction` が残らないことを grep / 検査で確認。
- [ ] AC-3: `server/src/app/*.ts` が `hono` の `Context` を import しないことを検査で確認。

## ドキュメント

- [ ] `module-boundaries.md` §4.1 の物理レイアウト記述（`server/app/*`）と実装の対応が取れていることを確認（必要なら実装ドキュメント側を追従。`project.md` は編集しない）。
- [ ] D-U1 のディレクトリ二重化（`use-cases/` と `app/`）整理を別 BL 起票候補として backlog にメモ。

## 仕上げ

- [ ] 受け入れ基準（spec.md AC-1〜AC-13）を全て満たすことを確認。
- [ ] typecheck 0 / lint 0 を再確認。
- [ ] auditor へレビュー依頼。
