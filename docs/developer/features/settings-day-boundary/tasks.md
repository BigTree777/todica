# タスク: 境界時刻の設定

> [`plan.md`](plan.md) を実行可能な単位に分解する. TDD (失敗するテストを書く → 通す → リファクタ) を前提とし, 各タスクは原則 1 PR で扱える粒度にする. 完了したらチェックを入れる.
> サブエージェント分担の目安: T-test- は test-designer, T-impl- は implementer, T-doc- / T-finish- は管理者または implementer.

## ドラフト時点での未決事項

spec.md §「未決事項 / 確認待ち」の U-001 〜 U-004 は plan.md §「重要な決定」で保守側案を採用済みだが, 実装前に **ユーザー最終確認** を取りたい. 特に以下:

- [ ] U-001 / D-001: `PUT /api/v1/settings` を `PATCH` に変更する方針で良いか.
- [ ] U-002 / D-002: singleton レコードを lazy upsert で確保する方針で良いか (FocusRepository / CounterRepository と同じパターン).
- [ ] U-003: SettingsView を `/settings` ルートに配置し, TodayView からのナビゲーション導線は implementer 裁量で良いか.
- [ ] U-004 / D-004: 412 レスポンスボディに現在の `{ settings }` を含める方針で良いか.

上記が確定したら以下の実装タスクへ進む.

## 仕様 / 設計確定

- [ ] spec.md 起票 (本ドキュメント)
- [ ] plan.md 起票 (本ドキュメント)
- [ ] auditor によるドラフトレビュー (spec / plan の整合性, BL-010 との責務分離, 既存 singleton パターンとの整合)
- [ ] OpenAPI (`docs/developer/architecture/api/openapi.yaml`) の `/settings` ブロックを本機能の決定に合わせて詳細化

## 実装 (バックエンド)

### DB / マイグレーション (D-002)

- [ ] `server/src/db/schema.ts` に `settings` テーブル定義を追加
  - `id` TEXT PRIMARY KEY (固定値 `"singleton"`)
  - `day_boundary_time` TEXT NOT NULL DEFAULT `"04:00"`
  - `updated_at` TEXT NOT NULL
  - `version` INTEGER NOT NULL DEFAULT 1
- [ ] drizzle マイグレーションを 1 本追加 (テーブル作成のみ. singleton レコードは lazy upsert で確保するためマイグレーションに INSERT は不要)

### Repository (D-002)

- [ ] `server/src/data/settings-repository.ts` を新設
  - 型 `Settings { id, dayBoundaryTime, updatedAt, version }`
  - インターフェース `SettingsRepository.get(): Promise<Settings>` / `update(settings: Settings): Promise<void>`
- [ ] `server/src/infra/persistence/drizzle/settings-repository.ts` を新設
  - `get()`: SELECT して未存在なら `dayBoundaryTime = "04:00"` で INSERT してから返す (lazy upsert. BL-006 DrizzleFocusRepository と同じパターン)
  - `update()`: UPDATE で全フィールドを上書き
- [ ] `server/src/app.ts` の `AppDeps` に `settingsRepository: SettingsRepository` を追加

### API 実装

- [ ] `GET /api/v1/settings` ハンドラを `server/src/app.ts` に追加
  - middleware/auth で 401
  - `settingsRepository.get()` → 200 `{ settings }`
- [ ] `PATCH /api/v1/settings` ハンドラを `server/src/app.ts` に追加
  - middleware/auth で 401
  - middleware/idempotency で冪等性処理
  - body バリデーション: `dayBoundaryTime` フィールドが無ければ 400 `INVALID_REQUEST_BODY`
  - `dayBoundaryTime` 形式バリデーション: 正規表現 `^([01]\d|2[0-3]):[0-5]\d$` に不一致なら 400 `INVALID_DAY_BOUNDARY_TIME`
  - `settingsRepository.get()` で現在値を取得
  - `If-Match` 検証: version 不一致なら 412 (レスポンスボディに `{ settings: current }`)
  - `settingsRepository.update({ ...current, dayBoundaryTime, version: current.version + 1, updatedAt: now })`
  - 200 OK `{ settings: updated }`

## 実装 (フロントエンド)

### SettingsRepository の新設

- [ ] `web/src/repositories/settings-repository.ts` を新設
  - インターフェース `SettingsRepository`
    - `get(): Promise<Settings>` → `GET /api/v1/settings`
    - `patch(input: { dayBoundaryTime: string }, ifMatch: number, idempotencyKey: string): Promise<Settings>` → `PATCH /api/v1/settings`
  - HTTP 実装で JSON フィールドを取り出す

### SettingsView の新規作成

- [ ] `web/src/ui/settings-view/settings-view.tsx` を新規作成
  - 初回マウント時に `settingsRepository.get()` を呼び, `dayBoundaryTime` を state にセット
  - 設定値表示 (現在の `dayBoundaryTime` を表示)
  - フォーム: `dayBoundaryTime` 入力欄 + 保存ボタン
  - 保存操作時: `settingsRepository.patch()` を呼び, 成功後に `settingsRepository.get()` で再フェッチして表示を更新
  - 400 エラー時: フォームにエラーメッセージを表示
  - 412 エラー時: PatchConflictError.settings（412 ボディから取得した最新値）を直接 state に反映し、追加の GET リクエストはしない（D-004）
  - 楽観 UI 的に手元で値を変える処理は **入れない** (サーバ正本値のみを信頼)
- [ ] ルーティング設定に `/settings` を追加し, SettingsView を配置する

## テスト

### 結合テスト (サーバ API) — test-designer が作成

- [ ] 認証なし `GET /api/v1/settings` → 401
- [ ] 初回 `GET /api/v1/settings` → 200 `{ settings: { id: "singleton", dayBoundaryTime: "04:00", version: 1, ... } }`
- [ ] 有効な `dayBoundaryTime: "03:30"` で PATCH → 200, version が 2 になる
- [ ] PATCH 後の GET で更新値が反映されている
- [ ] `dayBoundaryTime: "00:00"` で PATCH → 200 (境界値: 最小)
- [ ] `dayBoundaryTime: "23:59"` で PATCH → 200 (境界値: 最大)
- [ ] `dayBoundaryTime: "4:00"` (1 桁の時) で PATCH → 400 `INVALID_DAY_BOUNDARY_TIME`
- [ ] `dayBoundaryTime: "24:00"` (時が 24) で PATCH → 400 `INVALID_DAY_BOUNDARY_TIME`
- [ ] `dayBoundaryTime: "12:60"` (分が 60) で PATCH → 400 `INVALID_DAY_BOUNDARY_TIME`
- [ ] `dayBoundaryTime` フィールドを省略した PATCH (`{}`) → 400 `INVALID_REQUEST_BODY`
- [ ] 認証なし PATCH → 401
- [ ] version 不一致 (`If-Match: 2` だが実際 version は 1) で PATCH → 412, レスポンスボディに現在の settings が含まれる
- [ ] 同じ Idempotency-Key で PATCH を 2 回送る → 2 回目も 200, version は 1 回分だけ増える

### 単体テスト (クライアント) — test-designer が作成

- [ ] `repository.get()` が `{ dayBoundaryTime: "04:00", version: 1 }` を返すとき, "04:00" が画面に表示される
- [ ] フォームに "06:00" を入力して保存すると `repository.patch()` が呼ばれ, 再フェッチ後に "06:00" が表示される
- [ ] 400 エラー時にエラーメッセージが表示される
- [ ] 412 エラー時に PatchConflictError.settings（412 ボディの最新値）が直接 state に反映され, エラーメッセージが表示される（追加の GET リクエストなし. D-004）

## ドキュメント

- [ ] `docs/developer/architecture/api/openapi.yaml` の `/settings` ブロックを詳細化
  - `PUT` を `PATCH` に変更 (D-001)
  - `PATCH` のリクエストスキーマ (`dayBoundaryTime` required)
  - `PATCH` の成功レスポンス (`200: { settings: Settings }`)
  - `PATCH` のエラーレスポンス (400, 401, 412)
  - `GET` の成功レスポンス (`200: { settings: Settings }`)
  - `components.schemas.Settings` を `id` / `dayBoundaryTime` / `version` / `updatedAt` で具体化
  - `components.schemas.ErrorCode` enum に `INVALID_DAY_BOUNDARY_TIME` を追加
- [ ] `docs/developer/planning/backlog.md` の BL-009 を「Done」に更新 (マージ後)

## 仕上げ

- [ ] spec.md の受け入れ基準 (Gherkin シナリオ) すべてに対応するテストが green
- [ ] 既存 BL-001 〜 BL-008 のテストが引き続き green (Settings 追加が既存契約を壊していないこと)
- [ ] auditor によるレビュー依頼 (FR-041 / NFR-012 のカバレッジ, BL-010 との責務分離, バリデーション網羅性)
- [ ] PR を作成し main へマージ (マージ条件: 全テスト green + auditor 承認)
