# タスク: 今日ビュー（入口・優先度順表示・"次の 1 つ" の一意化）

> [`plan.md`](plan.md) を実行可能な単位に分解する. TDD（失敗するテストを書く → 通す → リファクタ）を前提とし, 各タスクは原則 1 PR で扱える粒度にする. 完了したらチェックを入れる.
> サブエージェント分担の目安: T-test- は test-designer, T-impl- は implementer, T-doc- / T-finish- は管理者または implementer.

## ドラフト時点での未決事項

spec.md §「未決事項 / 確認待ち」の U-001 〜 U-007 は plan.md §「重要な決定」で保守側案を採用済みだが, 実装前に **ユーザー最終確認** を取りたい. 特に以下:

- [ ] U-001 / D-001: `/api/v1/today` 専用エンドポイントを新設する方針で良いか.
- [ ] U-002 / D-002: 並び順 3 段目に `id` を採用する方針で良いか.
- [ ] U-003 / D-003: 既存 `GET /api/v1/tasks` のサーバソートも `priority → createdAt → id` に統一する方針で良いか（BL-001 暫定実装の恒久的な変更）.
- [ ] U-004 / D-005: レスポンス形状を `{ tasks, nextTaskId }` 形式で確定して良いか.
- [ ] U-007 / D-007: 楽観 UI と再フェッチの折衷方針で良いか（特に起票・優先度変更時の挙動）.

上記が確定したら以下の実装タスクへ進む.

## 仕様 / 設計確定

- [x] spec.md 起票（本ドキュメント）
- [x] plan.md 起票（本ドキュメント）
- [ ] auditor によるドラフトレビュー（spec / plan の整合性, BL-001 / BL-006 との境界明確化）
- [ ] OpenAPI（`docs/developer/architecture/api/openapi.yaml`）の `/today` ブロックを本機能の決定（D-001 / D-005）に合わせて詳細化（レスポンススキーマ `TodayView`, `nextTaskId` の明示）

## 実装（バックエンド）

### ソート規則の統一（D-002 / D-003）

- [ ] `server/src/app.ts` の `sortTasks` 関数を `priority → createdAt → id` の 3 段に差し替え（第一キーから `dueDate` を削除）
- [ ] 既存 `GET /api/v1/tasks` のソートが新規則を使うことを確認

### `/api/v1/today` エンドポイント実装

- [ ] `filterToday(tasks)` 純関数を追加（`dueDate === "today" && trashedAt === null` で絞り込み）
- [ ] `sortToday(tasks)` 純関数を追加（`priority → createdAt → id`. `sortTasks` と共通実装で構わない）
- [ ] `pickNextTaskId(tasks)` 純関数を追加（`tasks[0]?.id ?? null`）
- [ ] `GET /api/v1/today` ハンドラを `server/src/app.ts` に実装
  - middleware/auth で 401
  - `task-repository.list({ trashed: "false" })` → `filterToday` → `sortToday` → `pickNextTaskId`
  - 200 OK で `{ tasks, nextTaskId }` を返す

### Repository / モジュール構成（任意の整理）

- [ ] `domain/today` 相当のヘルパ純関数群を共有モジュールに切り出すか, `server/src/today.ts` に閉じ込めるかを implementer 判断で決定（モジュール境界 §6 と整合させる）

## 実装（フロントエンド）

### Repository に `today()` を追加

- [ ] `web/src/repositories/task-repository.ts` の `TaskRepository` インターフェースに `today(): Promise<{ tasks: Task[]; nextTaskId: string | null }>` を追加
- [ ] `HttpTaskRepository.today()` 実装（`GET /api/v1/today` を叩く. Authorization ヘッダ付与）

### `TodayView` の本実装化

- [ ] `web/src/ui/today-view/today-view.tsx` の取得経路を `repository.list()` → `repository.today()` に切り替え（state は `{ tasks, nextTaskId }` を保持）
- [ ] クライアント側 `sortTasks` / `PRIORITY_ORDER` / `DUE_DATE_ORDER` を撤去（サーバ並びを正本にする = D-004）
- [ ] 一覧描画は `tasks` をそのまま map（再ソートしない）
- [ ] `nextTaskId` をコンポーネント state / props として保持（視覚的強調 UI は本 feature では任意. 最低限 data としては公開する）
- [ ] 各書き込み操作（create / update / delete / complete）成功時の処理を D-007 方針に揃える
  - 削除 / 完了 / 期限切替: ローカル除外（楽観 UI）+ `today()` 再取得
  - 起票 / 名称編集 / 優先度変更: `today()` 再取得（並び位置はサーバが決める）

## テスト

### 単体（サーバ純関数）

- [ ] `filterToday`: dueDate=tomorrow を除外
- [ ] `filterToday`: trashedAt!=null を除外（deleted / completed 両方）
- [ ] `filterToday`: projectId / origin に関わらず today/active は通過
- [ ] `sortToday`: priority 順 highest → normal → later
- [ ] `sortToday`: 同一 priority で createdAt 昇順
- [ ] `sortToday`: 同一 createdAt で id 昇順
- [ ] `sortToday`: 空配列 → 空配列
- [ ] `pickNextTaskId`: 先頭 id を返す
- [ ] `pickNextTaskId`: 空配列で null

### 結合（サーバ）

- [ ] `GET /api/v1/today` 認証なし → 401
- [ ] `GET /api/v1/today` today タスク 0 件 → 200, `{ tasks: [], nextTaskId: null }`
- [ ] `GET /api/v1/today` today / tomorrow 混在 → today のみ返る
- [ ] `GET /api/v1/today` trashed タスクは含まれない
- [ ] `GET /api/v1/today` 並び順が priority → createdAt → id で確定
- [ ] `GET /api/v1/today` `nextTaskId` が tasks[0].id と一致
- [ ] 完了 (`POST /tasks/{id}/complete`) 後の再取得で並びが繰り上がる
- [ ] 既存 `server/__tests__/integration/tasks.test.ts` のソート期待値（あれば）を新規則に追従

### 単体（クライアント）

- [ ] `web/__tests__/today-view.test.tsx` の `makeMockRepository` に `today()` を追加（既存 `list()` は維持 or 撤去を implementer 判断）
- [ ] `TodayView` が `repository.today()` を呼ぶことを検証
- [ ] サーバから受け取った並びをそのまま表示する（クライアント側で再ソートしない）
- [ ] tomorrow タスクが mock の today() に含まれない場合, UI に現れない
- [ ] 期限切替 today→tomorrow 実行後に再フェッチされ, 該当タスクが消える
- [ ] 既存テスト（起票・編集・削除・完了・優先度操作）が引き続き green

### E2E（任意）

- [ ] 起動直後に今日ビューが表示される
- [ ] tomorrow タスクが今日ビューに出ない
- [ ] 並び順が priority 順になる

## ドキュメント

- [ ] `docs/developer/architecture/api/openapi.yaml` の `/today` ブロックを詳細化（`TodayView` schema 追加, `nextTaskId` プロパティ明示）
- [ ] `docs/developer/architecture/api/overview.md` のリソース表の `/today` 行を本機能の実装に合わせて補足（必要に応じて）
- [ ] `docs/developer/planning/backlog.md` の BL-005 を「Done」に更新（マージ後）

## 仕上げ

- [ ] spec.md の受け入れ基準（Gherkin シナリオ）すべてに対応するテストが green
- [ ] 既存 BL-001 / BL-002 / BL-003 のテストが引き続き green（並び順仕様の置き換えに伴う回帰がないこと）
- [ ] auditor によるレビュー依頼（FR-010 / FR-011 / NFR-013 のカバレッジ, BL-006 との境界, レスポンス形状の妥当性）
- [ ] PR を作成し main へマージ（マージ条件: 全テスト green + auditor 承認）
