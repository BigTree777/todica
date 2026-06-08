# タスク: 日次リセット処理

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。
>
> 実装は TDD で進める: 「失敗するテストを書く → 通す → リファクタ」のサイクル。

---

## フェーズ 1: ドメインロジック（pure function）

### 実装

- [ ] `server/src/use-cases/daily-reset.ts` を新設する
  - [ ] `calcTodayBoundaryAt(nowIso: string, dayBoundaryTime: string): string` を実装する
    - 今日の UTC 日付 + `dayBoundaryTime`（HH:MM）を連結して ISO 8601 文字列を返す
    - 例: `"2026-06-08T10:00:00.000Z"` + `"04:00"` → `"2026-06-08T04:00:00.000Z"`
  - [ ] `needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAt): boolean` を実装する
    - `nowIso >= todayBoundaryAt` かつ `(lastResetExecutedAt === null || lastResetExecutedAt < todayBoundaryAt)` で true
  - [ ] `DailyResetResult` 型を定義する（`{ executed: boolean; appliedBoundaryAt: string }`）

### テスト（単体テスト / 純関数）

- [ ] `server/__tests__/use-cases/daily-reset.test.ts` を作成する
  - `calcTodayBoundaryAt` のテーブルテスト:
    - [ ] 通常時刻（境界時刻以降）で日付が正しく連結される
    - [ ] 深夜（境界時刻前）で同日の日付が連結される
    - [ ] 境界時刻 = "00:00" のエッジケース
    - [ ] 境界時刻 = "23:59" のエッジケース
  - `needsDailyReset` のテーブルテスト:
    - [ ] `lastResetExecutedAt = null` かつ境界時刻以降 → true
    - [ ] `lastResetExecutedAt = null` かつ境界時刻前 → false
    - [ ] `lastResetExecutedAt < 今日の境界時刻` → true（前日のリセット）
    - [ ] `lastResetExecutedAt >= 今日の境界時刻` → false（今日リセット済み）
    - [ ] `clock.now()` が境界時刻のぴったり（ミリ秒一致）→ true
    - [ ] `clock.now()` が境界時刻の 1 ミリ秒前 → false

---

## フェーズ 2: ゴミ箱清算スタブ

### 実装

- [ ] `server/src/use-cases/purge-trash.ts` を新設する
  - [ ] `async function purgeTrash(db: unknown, clock: Clock): Promise<void>` を空実装（no-op）で定義する
  - [ ] BL-011 が実装予定であることをコメントに明記する

### テスト

- [ ] `purgeTrash` が呼ばれても例外を投げず正常終了することを確認するテストを書く

---

## フェーズ 3: `maybeRunDailyReset` の実装

### 実装

- [ ] `server/src/use-cases/daily-reset.ts` に `maybeRunDailyReset(deps: DailyResetDeps): Promise<DailyResetResult>` を実装する
  - [ ] `DailyResetDeps` 型を定義する（`AppDeps` のサブセット: `taskRepository`, `counterRepository`, `settingsRepository`, `clock`, `db`）
  - [ ] フロー実装（plan.md D-002 参照）:
    - Settings から `dayBoundaryTime` を取得
    - Counter から `lastResetExecutedAt` を取得
    - `needsDailyReset` で判定 → false なら `{ executed: false, ... }` を返す
    - `db.transaction()` 内で:
      - `dueDate = "tomorrow" && trashedAt = null` のタスクを `dueDate = "today"` に更新
      - Counter の `completedCount = 0`, `lastResetExecutedAt = clock.now()`, `version + 1`, `updatedAt = clock.now()` に更新
      - `purgeTrash(db, clock)` を呼び出す
    - `{ executed: true, appliedBoundaryAt: todayBoundaryAt }` を返す
  - [ ] `AppDeps` に `db`（raw DB ハンドル）を追加する（`server/src/app.ts`）

### テスト（結合テスト / in-memory）

- [ ] `server/__tests__/use-cases/maybe-run-daily-reset.test.ts` を作成する（または `daily-reset.test.ts` に追加）
  - リセット実行（executed = true）のシナリオ:
    - [ ] `dueDate = "tomorrow"` のアクティブタスクが `"today"` に変わる
    - [ ] `dueDate = "today"` のタスクは変わらない
    - [ ] `trashedAt != null` のタスクは変わらない（ゴミ箱は対象外）
    - [ ] `completedCount` が 0 になる
    - [ ] `lastResetExecutedAt` が `clock.now()` の値になる
    - [ ] `counter.version` が +1 される
    - [ ] `executed = true` が返る
  - リセット不要（executed = false）のシナリオ:
    - [ ] 境界時刻前ならリセットされない
    - [ ] 既にリセット済み（`lastResetExecutedAt >= 今日の境界時刻`）ならリセットされない
    - [ ] タスク・counter に変更がない
    - [ ] `executed = false` が返る
  - 冪等性のシナリオ:
    - [ ] `maybeRunDailyReset` を 2 回呼んで、2 回目は no-op（counter が 2 回更新されない）

---

## フェーズ 4: `POST /api/v1/reset` ハンドラ

### 実装

- [ ] `server/src/app.ts` に `POST /api/v1/reset` ハンドラを追加する
  - [ ] Idempotency-Key 必須（middleware で確認済み）
  - [ ] `maybeRunDailyReset(deps)` を呼んで結果を 200 OK で返す
  - [ ] レスポンス形状: `{ executed: boolean, appliedBoundaryAt: string }`

### テスト（API テスト）

- [ ] `server/__tests__/app/reset.test.ts` を作成する
  - [ ] 新規リセット実行 → `{ executed: true, appliedBoundaryAt: ... }` が返る
  - [ ] リセット不要 → `{ executed: false, ... }` が返る
  - [ ] 同一 Idempotency-Key で再送 → 保存済み応答が返る（DB への 2 重実行なし）
  - [ ] 認証なし → 401 UNAUTHORIZED
  - [ ] Idempotency-Key なし → 400 MISSING_IDEMPOTENCY_KEY

---

## フェーズ 5: `GET /api/v1/today` への自動リセット統合

### 実装

- [ ] `server/src/app.ts` の `GET /api/v1/today` ハンドラ先頭に `maybeRunDailyReset(deps)` を呼び出すコードを追加する

### テスト（API テスト）

- [ ] `server/__tests__/app/today.test.ts`（既存）にリセット統合シナリオを追加する
  - [ ] リセット条件を満たす状態で `GET /api/v1/today` を呼ぶと、タスクが繰り越され `completionCount = 0` が返る
  - [ ] リセット条件を満たさない状態では、タスクも `completionCount` も変わらない

---

## フェーズ 6: openapi.yaml の具体化

### ドキュメント

- [ ] `docs/developer/architecture/api/openapi.yaml` の `POST /api/v1/reset` レスポンス定義を具体化する
  - [ ] `200 OK` のレスポンスボディスキーマを追記する（`executed: boolean`, `appliedBoundaryAt: string`）
  - [ ] `ErrorCode` enum に本 feature で追加するエラーコードがあれば追記する（現状は MISSING_IDEMPOTENCY_KEY で対応可能）

---

## 仕上げ

- [ ] 受け入れ基準（spec.md）を全て満たすことを確認する
  - [ ] 境界判定の全シナリオ
  - [ ] タスク繰り越しの全シナリオ（"tomorrow" → "today" / "today" は変わらない / ゴミ箱は対象外）
  - [ ] completedCount / lastResetExecutedAt / version の更新
  - [ ] 冪等性（2 回呼んでも 1 回分）
  - [ ] `POST /api/v1/reset` のレスポンス形状（executed / appliedBoundaryAt）
  - [ ] `GET /api/v1/today` への自動リセット統合
  - [ ] purgeTrash スタブが no-op であること
- [ ] `server/src/use-cases/daily-reset.ts` と `purge-trash.ts` に BL 番号と仕様参照コメントを書く
- [ ] レビュー依頼（auditor へ）
