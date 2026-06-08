# タスク: 今日の完了タスク数カウントの表示

> [`plan.md`](plan.md) を実行可能な単位に分解する. TDD (失敗するテストを書く → 通す → リファクタ) を前提とし, 各タスクは原則 1 PR で扱える粒度にする. 完了したらチェックを入れる.
> サブエージェント分担の目安: T-test- は test-designer, T-impl- は implementer, T-doc- / T-finish- は管理者または implementer.

## ドラフト時点での未決事項

spec.md §「未決事項 / 確認待ち」の U-001 〜 U-007 は plan.md §「重要な決定」で保守側案を採用済みだが, 実装前に **ユーザー最終確認** を取りたい. 特に以下:

- [x] U-001 / D-006: `GET /api/v1/today` レスポンスに `completionCount` を同梱し, 並行して `/counter` 単独エンドポイントも実装する方針で良いか.
- [x] U-002 / D-002: +1 集計を complete API ハンドラ内で同一トランザクション内に実装する方針で良いか (ドメインイベント駆動にしない).
- [x] U-003 / D-004: Counter レコードを起動時 INSERT で 1 件確保する方針で良いか.
- [x] U-004 / D-003: `lastResetExecutedAt` カラムを本 feature でもテーブルに含める方針で良いか (BL-010 まで未使用でも).
- [x] U-005: 復元時に completedCount を減算しない件は本 feature ではテスト追加せず BL-011 で扱う方針で良いか.
- [x] U-006: 完了数表示の位置は今日ビュー画面上部とし詳細レイアウトは implementer 裁量で良いか.
- [x] U-007: フィールド名は Counter 内部 `completedCount` / `/today` レスポンス `completionCount` のままで良いか, それとも両方 `completedCount` に統一するか.

上記が確定したら以下の実装タスクへ進む.

## 仕様 / 設計確定

- [x] spec.md 起票 (本ドキュメント)
- [x] plan.md 起票 (本ドキュメント)
- [x] auditor によるドラフトレビュー (spec / plan の整合性, BL-003 との境界明確化, BL-010 との責務分離)
- [x] OpenAPI (`docs/developer/architecture/api/openapi.yaml`) の `/counter` ブロックを本機能の決定 (D-001 〜 D-011) に合わせて詳細化 (Counter schema 具体化, GET 応答スキーマ). `TodayView` schema に `completionCount` を required で追加.

## 実装 (バックエンド)

### DB / マイグレーション (D-001 / D-003 / D-004)

- [x] `server/src/db/schema.ts` に `counter` テーブル定義を追加 (`id` PK, `completed_count` INTEGER NOT NULL DEFAULT 0, `last_reset_executed_at` TEXT nullable, `updated_at` TEXT NOT NULL, `version` INTEGER NOT NULL DEFAULT 1)
- [x] drizzle マイグレーションを 1 本追加 (テーブル作成 + `INSERT OR IGNORE INTO counter ('singleton', 0, NULL, ..., 1)` で 1 件確保)
- [x] 起動時に「singleton レコードが必ず存在する」ことを担保 (マイグレーション内 INSERT or `main.ts` での起動時 INSERT or `get()` 内 upsert. implementer 判断. BL-006 の DrizzleFocusRepository と同じパターンが参考)

### Repository (D-010)

- [x] `server/src/data/counter-repository.ts` を新設
  - 型 `Counter { id, completedCount, lastResetExecutedAt, updatedAt, version }`
  - インターフェース `CounterRepository.get(): Promise<Counter>` / `update(counter: Counter): Promise<void>`
- [x] `server/src/infra/persistence/drizzle/counter-repository.ts` を新設 (BL-006 `DrizzleFocusRepository` を参考に upsert + onConflictDoUpdate で実装)
- [x] `server/src/app.ts` の `AppDeps` に `counterRepository: CounterRepository` を追加

### API 実装

- [x] `GET /api/v1/counter` ハンドラを `server/src/app.ts` に追加
  - middleware/auth で 401
  - `counterRepository.get()` → 200 `{ counter }`

### 既存ハンドラへの counter 連動統合 (D-002 / D-007)

- [x] `POST /api/v1/tasks/:id/complete` ハンドラに「通常状態 → 完了の遷移が起きたときに counter を +1」処理を追加
  - 通常状態判定: `current.trashedAt === null` (= 既ゴミ箱への no-op 経路は通らない)
  - 加算: `counter = counter-repository.get()` → `updated = { ...counter, completedCount: counter.completedCount + 1, version: counter.version + 1, updatedAt: clock.now() }` → `counter-repository.update(updated)`
  - **(D-007)** task 更新 + counter 更新 + focus 解除を同一 `db.transaction(() => { ... })` でラップ. better-sqlite3 の transaction を使う. BL-006 の sequential 実行が現状ならここで transaction wrapper に移行する (R-001)
- [x] `GET /api/v1/today` ハンドラに `counterRepository.get().completedCount` を埋め込み, レスポンスを `{ tasks, nextTaskId, currentTaskId, completionCount }` に拡張

### レスポンス契約 (D-005)

- [x] `POST /tasks/:id/complete` のレスポンスボディは **変更しない** (`{ task }` のまま. counter 値は含めない)

## 実装 (フロントエンド)

### Repository の型拡張

- [x] `web/src/repositories/task-repository.ts` の `today()` 戻り値型に `completionCount: number` を追加
- [x] HTTP 実装で JSON フィールド `completionCount` を取り出す
- [x] (任意) `counter()` メソッドを追加して `GET /api/v1/counter` を叩く経路を作る. 本 feature の TodayView では `/today` 同梱で完結するため必須ではないが, 将来の他画面 / E2E テスト向けに薄く実装しておくと良い (implementer 判断)

### `TodayView` 改修 (D-006 / D-008)

- [x] state に `completionCount: number` を保持
- [x] 起動時 (`useEffect` 初回フェッチ) で `today()` の `completionCount` を state にセット
- [x] `refetchToday` (既存) で `completionCount` も更新する流れに乗せる
- [x] 画面上部に「今日の完了: {completionCount}」相当を描画. ラベル文言・スタイルは implementer 裁量だが「数値が表示される」「ラベルが完了数を意味する」が成り立つこと
- [x] 楽観 UI 的に手元で +1 する処理は **入れない** (D-008. NFR-013 担保のためサーバ正本値だけを信頼)

## テスト

### 単体 (サーバ純関数 / ドメイン)

- [x] (任意) `incrementCompletedCount(counter, clock)` 等の純関数化を行った場合
  - `completedCount: 0 → 1`, `version + 1`, `updatedAt` 更新を確認

### 結合 (サーバ API)

- [x] `GET /api/v1/counter` 認証なし → 401
- [x] 初回 `GET /api/v1/counter` → 200 `{ counter: { id: "singleton", completedCount: 0, lastResetExecutedAt: null, version: 1, ... } }`
- [x] 通常タスクを 1 件完了 → `completedCount: 0 → 1`, `version: 1 → 2`
- [x] 2 件続けて完了 → `completedCount: 2`
- [x] 既ゴミ箱 (`trashedReason = "completed"`) への再 complete → `completedCount` 不変
- [x] 既ゴミ箱 (`trashedReason = "deleted"`) への complete (no-op 200) → `completedCount` 不変
- [x] `DELETE /api/v1/tasks/:id` → `completedCount` 不変
- [x] `PATCH /api/v1/tasks/:id` で `dueDate: "tomorrow"` 変更 → `completedCount` 不変
- [x] `PATCH /api/v1/tasks/:id` で名称・優先度のみ変更 → `completedCount` 不変
- [x] 同じ Idempotency-Key で complete を 2 回送る → 保存済み応答, `completedCount` は +1 だけ (= 2 に進まない)
- [x] `GET /api/v1/today` レスポンスに `completionCount` フィールドが含まれる
- [x] 完了直後の `GET /api/v1/today` の `completionCount` が +1 反映されている

### 単体 (クライアント)

- [x] `web/__tests__/today-view.test.tsx` の `makeMockRepository` で `today()` の戻り値に `completionCount` を追加 (既定値 0)
- [x] `today()` の `completionCount: 3` が描画される
- [x] 完了 mutation 後の再フェッチで `completionCount` が更新される (モックの返り値を変えてアサート)
- [x] 削除 mutation 後も再フェッチが走り `completionCount` が維持される (モックの返り値を変えずアサート)
- [x] 期限切替 (today → tomorrow) 後も `completionCount` が維持される
- [x] 今日のタスクが 0 件でも完了数表示が出る (例: 「今日の完了: 0」)
- [x] 既存テスト (起票・編集・削除・完了・優先度操作・focus 関連) が引き続き green (`completionCount` フィールド追加で破綻しないこと)

### E2E (任意)

- [x] 起動直後 `completionCount = 0` が表示される
- [x] 完了アクションで表示が +1 する
- [x] 削除 / 期限切替で表示が変わらない
- [x] リロード後もサーバ正本値が復元される

## ドキュメント

- [x] `docs/developer/architecture/api/openapi.yaml` の `/counter` ブロックを詳細化
  - GET 応答 schema (`{ counter: Counter }`, 200 / 401)
  - `components.schemas.Counter` を `id` / `completedCount` / `lastResetExecutedAt` / `version` / `updatedAt` で具体化
  - `TodayView` schema に `completionCount: integer` を required で追加
- [x] `docs/developer/architecture/api/overview.md` のリソース表の `/counter` 行を本機能の実装に合わせて補足 (必要に応じて)
- [x] `docs/developer/architecture/database/overview.md` に `counter` 物理スキーマ (具体的な型 / インデックス) の記述を追加
- [x] `docs/developer/planning/backlog.md` の BL-008 を「Done」に更新 (マージ後)
- [x] `docs/developer/features/task-complete/spec.md` / `plan.md` の「+1 は BL-008 待ち」記述を実装済に合わせて補足 or リンク追加 (任意)

## 仕上げ

- [x] spec.md の受け入れ基準 (Gherkin シナリオ) すべてに対応するテストが green
- [x] 既存 BL-001 / BL-002 / BL-003 / BL-005 / BL-006 のテストが引き続き green (`/today` への `completionCount` 追加, complete ハンドラへの transaction 導入が既存契約を壊していないこと)
- [x] auditor によるレビュー依頼 (FR-040 のカバレッジ, BL-003 との境界, BL-010 リセット責務との分離, 楽観 UI 不採用の妥当性)
- [x] PR を作成し main へマージ (マージ条件: 全テスト green + auditor 承認)

## 技術的負債メモ

- **D-007 トランザクション未実装**: `POST /tasks/:id/complete` ハンドラで task 更新・counter +1・focus 解除の 3 操作は現状 sequential (非トランザクション). 単一ユーザー用途で許容範囲内だが, BL-010 (日次リセット処理) の実装時に `db.transaction()` を導入してまとめてアトミック化すること (R-001 リスク).
