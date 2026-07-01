# タスク: タスク並び順のタイブレークを作成日時降順に統一する

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [ ] domain: `domain/src/task/index.ts` に共有比較器を追加する（plan D-002）。
  - [ ] 優先度の数値順序（`PRIORITY_ORDER` 相当、highest=0/normal=1/later=2、未知値は末尾）を追加。
  - [ ] `compareTasksForView(a, b)`: priority → createdAt **降順** → id **昇順** の 3 段比較。
  - [ ] `sortTasksForView(tasks)`: 入力を破壊しない非破壊ソート。
  - [ ] 必要なら `domain/src/index.ts` からのエクスポート経路を通す。
- [ ] server: `server/src/today.ts` の `sortToday` を `sortTasksForView` へ委譲する
  （`filterToday` / `pickNextTaskId` は today.ts に残す）。ローカルの `PRIORITY_ORDER` を撤去。
  - [ ] `server/src/routers/_shared.ts` の `sortTasks` は `sortToday` 経由のまま自動追従を確認。
  - [ ] `server/src/app/today-usecases.ts` は `sortToday` / `pickNextTaskId` 経由のまま追従を確認。
- [ ] web(local): `web/src/repositories/local-task-repository.ts` を共有比較器へ載せ替える。
  - [ ] `today()`: 行を `rowToTask` で変換後に `sortTasksForView` を適用し、先頭 id を `nextTaskId` に。
  - [ ] `list()`: 行を `rowToTask` で変換後に `sortTasksForView` を適用して返す（現状の未ソートを解消）。
  - [ ] ローカル定義の `priorityOrder` を撤去。

## テスト

- [ ] domain 単体: spec.md の並び順シナリオ（同一優先度で新しい順 / priority 優先 / createdAt 同値で
      id 昇順 / 非破壊性 / 空配列）を `compareTasksForView` / `sortTasksForView` に対して検証。
- [ ] server 単体・結合: 今日ビュー（`tasks` / `nextTaskId`）と一覧・明日ビュー（`sortTasks`）が
      新順序（priority → createdAt 降順 → id 昇順）になることを検証。
- [ ] web(local) 単体: `today()` と `list({ dueDate: "tomorrow" })` が新順序になること、
      特に `list()` が DB 返却順ではなく共有比較器順で返すことを検証。
- [ ] モード間整合: 同一入力で server ソートと local ソートの並びが一致することを検証。
- [ ] 既存回帰: 旧順序（createdAt 昇順 / 古い順）を前提にした既存テスト（today / focus / tasks 結合等）を
      新仕様へ更新（plan R-002）。

## ドキュメント

> features/ は記録（履歴）のため陳腐化理由で書き換えない。現状追従の対象は architecture/ とコードのコメント。

- [ ] 更新する（現状追従）:
  - [ ] `docs/developer/architecture/api/openapi.yaml` の並び順説明（「createdAt 昇順」→「createdAt 降順 / 新しい順」）。
        該当箇所付近: `/tasks` 説明・`/today` 説明・TodayView schema の description。
  - [ ] `server/src/today.ts` のコメント（`sortToday` の並び順説明を降順へ）。
  - [ ] `server/src/routers/_shared.ts` の `sortTasks` コメント。
  - [ ] `web/src/repositories/task-repository.ts` のコメント（TodayView 形状・`today()` / `list()` 説明の並び順）。
  - [ ] `web/src/repositories/local-task-repository.ts` のソート箇所コメント。
  - [ ] domain 新規関数の doc コメント（正本であることを明記）。
- [ ] 書き換えない（記録 / 履歴。追従対象外として明示的に据え置く）:
  - [ ] `docs/developer/features/today-view/plan.md` D-002（旧「createdAt 昇順」記述）。
  - [ ] `docs/developer/features/tomorrow-view/spec.md` の並び順記述。

## 判断事項

- [ ] ADR 化の要否（plan D-004）を管理者 / auditor が判断する。新設する場合の候補:
      「タスク表示順の正本を domain 共有比較器に置き、タイブレークを作成日時降順にする」。

## 仕上げ

- [ ] 受け入れ基準（spec.md）を全て満たすことを確認。
- [ ] `npm run lint`（warning 0）/ `npm run typecheck`（pass）。
- [ ] レビュー依頼（auditor）。
