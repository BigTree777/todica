# タスク: 現在のタスク（フォーカス）と完了時の自動繰上げ

> [`plan.md`](plan.md) を実行可能な単位に分解する. TDD（失敗するテストを書く → 通す → リファクタ）を前提とし, 各タスクは原則 1 PR で扱える粒度にする. 完了したらチェックを入れる.
> サブエージェント分担の目安: T-test- は test-designer, T-impl- は implementer, T-doc- / T-finish- は管理者または implementer.

## ドラフト時点での未決事項

spec.md §「未決事項 / 確認待ち」の U-001 〜 U-007 は plan.md §「重要な決定」で保守側案を採用済みだが, 実装前に **ユーザー最終確認** を取りたい. 特に以下:

- [x] U-001 / D-001: 「未選択時の暗黙フォールバック = 今日ビュー先頭」を採用する方針で良いか.
- [x] U-002 / D-002: 自動繰上げのトリガーを「完了 / 削除 / 期限 today→tomorrow」の 3 経路にする方針で良いか.
- [x] U-003 / D-003: 自動繰上げ時は「解除のみ」(currentTaskId = null) とし「次の id」をサーバが書き込まない方針で良いか.
- [x] U-004 / D-004: `/today` レスポンスに `currentTaskId` を含めず, `/focus` で別途取得する方針で良いか.
- [x] U-005 / D-007: `FocusSelection` レコードを起動時 INSERT で 1 件確保する方針で良いか.
- [x] U-006 / D-009: 「現在解除」UI を提供する方針で良いか.
- [x] U-007 / D-010: PUT /api/v1/focus で `If-Match` 必須とする方針で良いか.

上記が確定したら以下の実装タスクへ進む.

## 仕様 / 設計確定

- [x] spec.md 起票（本ドキュメント）
- [x] plan.md 起票（本ドキュメント）
- [x] auditor によるドラフトレビュー（spec / plan の整合性, BL-005 との境界明確化, FocusSelection の責務分離）
- [x] OpenAPI（`docs/developer/architecture/api/openapi.yaml`）の `/focus` ブロックを本機能の決定（D-001 〜 D-010）に合わせて詳細化（リクエスト body / レスポンス `FocusSelection` schema, `INVALID_FOCUS_TARGET` エラーコード追加）

## 実装（バックエンド）

### DB / マイグレーション (D-006 / D-007)

- [x] `server/src/db/schema.ts` に `focus_selection` テーブル定義を追加 (`id` PK, `current_task_id` nullable, `updated_at`, `version`)
- [x] drizzle マイグレーションを 1 本追加（テーブル作成 + `INSERT OR IGNORE INTO focus_selection ('singleton', NULL, ..., 1)` で 1 件確保）
- [x] 起動時に「singleton レコードが必ず存在する」ことを担保（マイグレーション内 INSERT or `main.ts` での起動時 INSERT のいずれか. implementer 判断）

### Repository (D-011)

- [x] `server/src/data/focus-selection-repository.ts` を新設
  - `get(): Promise<FocusSelection>` — singleton レコードを返す（無ければ例外: 起動時に作られている前提）
  - `update(focus: FocusSelection): Promise<void>` — version 含めて全フィールド上書き
- [x] `server/src/app.ts` の `AppDeps` に `focusSelectionRepository: FocusSelectionRepository` を追加

### API 実装

- [x] `GET /api/v1/focus` ハンドラを `server/src/app.ts` に追加
  - middleware/auth で 401
  - `focusSelectionRepository.get()` → 200 `{ focus }`
- [x] `PUT /api/v1/focus` ハンドラを `server/src/app.ts` に追加
  - middleware/auth で 401
  - middleware/idempotency で `MISSING_IDEMPOTENCY_KEY` / 保存済み応答
  - body 解析 → `taskId` (string | null) 取り出し. それ以外は `INVALID_REQUEST_BODY` / `INVALID_FOCUS_TARGET`
  - `If-Match` ヘッダ → 数値化. 欠落は `MISSING_IF_MATCH`
  - 現行 `focus` 取得 → version 比較. 不一致は 412 `{ focus: current }`
  - taskId !== null のとき: タスク存在 / not trashed / dueDate === "today" を検証. 失敗は `INVALID_FOCUS_TARGET`
  - 更新 → 200 `{ focus: updated }`

### 既存ハンドラへのフォーカス連動統合 (D-002 / D-005)

- [x] `POST /api/v1/tasks/:id/complete` の末尾に「完了対象が currentTaskId なら focus を null に解除」処理を追加
  - 既ゴミ箱の no-op 経路でも focus が同じ id を指していたら解除する (R-002)
- [x] `DELETE /api/v1/tasks/:id` の末尾に同様の処理を追加（no-op 経路含む）
- [x] `PATCH /api/v1/tasks/:id` で `dueDate === "tomorrow"` への変更時に同様の処理を追加（dueDate: today のままの編集では何もしない）
- [x] (D-005) 上記 3 経路のフォーカス連動を可能であれば同一トランザクションで実行する（better-sqlite3 `db.transaction()` 採用. 困難なら sequential 実行 + R-003 の代替方針で許容）

### エラーコード追加

- [x] `INVALID_FOCUS_TARGET` を `server/src/app.ts` のエラー応答に追加（openapi.yaml の ErrorCode enum にも反映）

## 実装（フロントエンド）

### Repository に focus 系メソッドを追加

- [x] `web/src/repositories/task-repository.ts` (or 別ファイル `focus-repository.ts`) に以下を追加
  - 型 `FocusSelection { id: string; currentTaskId: string | null; version: number; updatedAt: string }`
  - 型 `SetFocusCommand { taskId: string | null; ifMatch: number }`
  - インターフェース `FocusRepository.focus(): Promise<FocusSelection>` / `setFocus(cmd: SetFocusCommand): Promise<FocusSelection>`
  - HTTP 実装（`GET /api/v1/focus` / `PUT /api/v1/focus`）
  - 412 衝突時は `OptimisticLockError` を投げる（既存パターンと一貫）

### `TodayView` 改修 (D-001 / D-008 / D-009)

- [x] 起動時に `today()` と `focus()` を並列フェッチし, `tasks` / `nextTaskId` / `focus` を state に保持
- [x] 強調対象 id = `focus.currentTaskId ?? nextTaskId` を算出
- [x] 強調対象が null でなければ「現在のタスク」セクションを単独・大表示で描画（NFR-011）. CSS / レイアウトは implementer 裁量
- [x] 通常リストは `tasks.filter(t => t.id !== focusedId)` を描画
- [x] 通常リスト各行に「現在に設定」ボタンを追加. クリックで `setFocus({ taskId: t.id, ifMatch: focus.version })` を実行
- [x] 強調セクションに「現在解除」ボタンを追加. クリックで `setFocus({ taskId: null, ifMatch: focus.version })` を実行
- [x] 強調セクション内に既存の「完了 / 編集 / 削除 / 期限切替 / 優先度切替」ボタンも引き続き提供（操作経路を奪わない）
- [x] 各書き込み mutation (create / update / delete / complete / setFocus) 成功時に `today()` と `focus()` を **両方** 再フェッチ
- [x] 今日のタスク 0 件のとき, 強調セクションは表示せず（または空状態文言）

## テスト

### 単体（サーバ純関数 / ドメイン）

- [x] フォーカス連動判定関数（仮: `shouldClearFocusOn(focus, targetId)` 等を切り出した場合）
  - currentTaskId == targetId → true
  - currentTaskId != targetId → false
  - currentTaskId == null → false

### 結合（サーバ API）

- [x] `GET /api/v1/focus` 認証なし → 401
- [x] 初回 `GET /api/v1/focus` → 200 `{ focus: { currentTaskId: null, version: 1, ... } }`
- [x] `PUT /api/v1/focus` 認証なし → 401
- [x] `PUT /api/v1/focus` Idempotency-Key なし → 400 MISSING_IDEMPOTENCY_KEY
- [x] `PUT /api/v1/focus` If-Match なし → 400 MISSING_IF_MATCH
- [x] `PUT /api/v1/focus` body が JSON でない → 400 INVALID_REQUEST_BODY
- [x] `PUT /api/v1/focus` 有効な taskId 設定 → 200, version インクリメント
- [x] `PUT /api/v1/focus` { taskId: null } で解除 → 200, version インクリメント
- [x] `PUT /api/v1/focus` 存在しない taskId → 400 INVALID_FOCUS_TARGET
- [x] `PUT /api/v1/focus` trashed taskId → 400 INVALID_FOCUS_TARGET
- [x] `PUT /api/v1/focus` dueDate=tomorrow の taskId → 400 INVALID_FOCUS_TARGET
- [x] `PUT /api/v1/focus` If-Match 不一致 → 412 `{ focus: <current> }`
- [x] `PUT /api/v1/focus` Idempotency-Key 再送 → 保存済み応答, version インクリメントなし
- [x] complete: 現在のタスクを完了 → focus.currentTaskId が null に解除
- [x] complete: 現在ではないタスクを完了 → focus.currentTaskId 不変
- [x] complete: 既ゴミ箱 no-op 経路でも focus が同じ id を指していたら解除（R-002）
- [x] delete: 現在のタスクを削除 → focus.currentTaskId が null に解除
- [x] delete: 現在ではないタスクを削除 → focus 不変
- [x] patch dueDate=tomorrow: 現在のタスクなら focus 解除
- [x] patch dueDate=today のままの編集 (名称・優先度のみ) → focus 不変
- [~] (スキップ) 既存 `server/__tests__/integration/tasks.test.ts` の complete / delete / patch シナリオへの focus 連動アサーション追加. → `focus.test.ts` 側で同等の経路 (complete / delete / patch dueDate=tomorrow) を網羅しているため重複. 既存 tasks.test.ts は触らない方針に変更.

### 単体（クライアント）

- [x] `web/__tests__/today-view.test.tsx` の `makeMockRepository` に `focus()` / `setFocus()` を追加
- [x] 起動時に `repository.today()` と `repository.focus()` の両方を呼ぶこと
- [x] `currentTaskId == null` で並び先頭タスクが「現在のタスク」として強調セクションに描画される（暗黙フォールバック）
- [x] `currentTaskId != null` で該当タスクが強調セクションに描画される
- [x] 強調セクションのタスクは通常リストに含まれない（重複表示なし）
- [x] 各通常リスト行の「現在に設定」ボタン → `setFocus({ taskId, ifMatch })` 呼び出し
- [x] 強調セクションの「現在解除」ボタン → `setFocus({ taskId: null, ifMatch })` 呼び出し
- [x] 完了 / 削除 / 期限切替後に `focus()` と `today()` が両方再フェッチされる
- [x] 今日のタスク 0 件のとき, 強調セクションは表示されない
- [x] 既存テスト（起票・編集・削除・完了・優先度操作）が引き続き green

### E2E（任意）

- [x] 起動直後に並び先頭タスクが「現在のタスク」として強調表示される
- [x] 「現在に設定」で別タスクを選ぶと強調が切り替わる
- [x] 「完了」で強調セクションのタスクが消え, 次のタスクが繰り上がる
- [x] 「現在解除」で並び先頭に戻る

## ドキュメント

- [x] `docs/developer/architecture/api/openapi.yaml` の `/focus` ブロックを詳細化
  - request body schema (`{ taskId: string | null }`)
  - response schema (`FocusSelection`, 200 / 400 / 401 / 412)
  - `ErrorCode` enum に `INVALID_FOCUS_TARGET` 追加
  - `components.schemas.FocusSelection` を `id` / `currentTaskId` / `version` / `updatedAt` で具体化
- [x] `docs/developer/architecture/api/overview.md` のリソース表の `/focus` 行を本機能の実装に合わせて補足（必要に応じて）
- [x] `docs/developer/architecture/database/overview.md` に `focus_selection` 物理スキーマ（具体的な型 / インデックス）の記述を追加
- [x] `docs/developer/planning/backlog.md` の BL-006 を「Done」に更新（マージ後）

## 仕上げ

- [x] spec.md の受け入れ基準（Gherkin シナリオ）すべてに対応するテストが green
- [x] 既存 BL-001 / BL-002 / BL-003 / BL-005 のテストが引き続き green（フォーカス連動の副作用が既存契約を壊していないこと）
- [x] auditor によるレビュー依頼（FR-012 / FR-013 / NFR-011 のカバレッジ, BL-005 との境界, 自動繰上げ仕様の妥当性）
- [x] PR を作成し main へマージ（マージ条件: 全テスト green + auditor 承認）
