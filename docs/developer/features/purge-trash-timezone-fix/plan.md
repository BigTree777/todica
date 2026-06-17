# 設計・実装計画: purge-trash の server timezone 取り違えバグ修正

> [`spec.md`](spec.md) の要件 (REQ-1 〜 REQ-4 / NFR-1 〜 NFR-3) を満たすための最小差分修正計画.

## 方針概要

`server/src/use-cases/purge-trash.ts` の `calcTodayBoundaryAt` 呼び出しに
第 3 引数 `getServerTimeZone()` を渡す **1 箇所変更 (import 追加 + 引数追加の 2 行差分)** で修正する.
追加した回帰ガード用テストで, server TZ が非 UTC のとき purge 境界が reset 境界と一致することを保証する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (HTTP 契約 / response shape は不変) |
| DB | 変更なし (schema / migration / 既存 row 共に不変) |
| モジュール | `server/src/use-cases/purge-trash.ts` のみ. import 1 行追加 + `calcTodayBoundaryAt` 呼び出し 1 行変更. |
| UI | 変更なし (web / Android は影響なし) |
| ドメイン | 変更なし (Clock / Task / Settings 不変) |
| Repository | 変更なし (`deleteTrashOlderThan` の signature・挙動は不変) |
| マイグレーション | 変更なし |

## 設計詳細

### データモデル

変更なし. `Task.trashedAt` (`string | null`, ISO 8601 UTC) を引き続き使う.

### 処理フロー

修正前:
1. `purgeTrash(db, clock, settingsRepository, taskRepository)`
2. `settings = settingsRepository.get()`
3. `boundaryAt = calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime)`
   ← **第 3 引数なし → timeZone = "UTC" 既定**
4. `taskRepository.deleteTrashOlderThan(boundaryAt)`

修正後:
1. `purgeTrash(db, clock, settingsRepository, taskRepository)`
2. `settings = settingsRepository.get()`
3. `boundaryAt = calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime, getServerTimeZone())`
   ← **`maybeRunDailyReset` と同じ第 3 引数を渡す**
4. `taskRepository.deleteTrashOlderThan(boundaryAt)`

### 修正の具体 (1 箇所 / 2 行差分)

`server/src/use-cases/purge-trash.ts`:

```diff
- import { calcTodayBoundaryAt } from "./daily-reset.js";
+ import { calcTodayBoundaryAt, getServerTimeZone } from "./daily-reset.js";
  ...
-   const boundaryAt = calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime);
+   const boundaryAt = calcTodayBoundaryAt(
+     clock.now(),
+     settings.dayBoundaryTime,
+     getServerTimeZone(),
+   );
```

(改行は lint / prettier に従う. 1 行で収まるなら 1 行で良い.)

### 例外 / エラー処理

新規例外なし. 既存の `settingsRepository`/`taskRepository` 未指定 no-op ガードは維持する.

## 重要な決定

- D-001: 修正範囲は `purge-trash.ts` のみに閉じる.
  `calcTodayBoundaryAt` の既定値 `timeZone = "UTC"` 自体は変更しない
  (既定値を server TZ にすると他の呼び出し元への影響評価が必要になり, 修正のリスクが膨らむ).
  呼び出し側で必ず `getServerTimeZone()` を渡す方針で揃える.
- D-002: `getServerTimeZone()` は既存の `daily-reset.ts` で公開済みの関数を再利用する.
  新規 helper を作らない.
- D-003: 新規テストは `server/__tests__/unit/purge-trash-tz.test.ts` として新設し,
  `daily-reset-maybe-run-tz.test.ts` には混ぜない (対象モジュールごとに分離).
  HTTP 経路の検証は `server/__tests__/integration/reset-purge-tz.test.ts` を新設する
  (既存 `reset-tz.test.ts` は reset 結果中心の検証, `trash.test.ts` の purge セクションは
  UTC 前提のシナリオを混ぜると意図が崩れるため別ファイルで切る).
- D-004: 既存 `server/__tests__/integration/trash.test.ts` の `purgeTrash` セクションは,
  CI 環境の TZ に暗黙依存しないように `vi.stubEnv("TZ", "UTC")` を `beforeEach` で追加する.
  この変更は挙動の意図変更ではなく前提の明示化であり, 既存シナリオの assert はそのまま green を保つ.

## リスク / 代替案

- リスク R-1: `calcTodayBoundaryAt` の第 3 引数を渡す変更が, `taskRepository.deleteTrashOlderThan`
  の比較対象 (= `trashed_at` の文字列比較) と整合しないケースがあるか?
  → `trashed_at` は ISO 8601 UTC で保存され, `boundaryAt` も `calcTodayBoundaryAt` が
  `new Date(...).toISOString()` で UTC ISO を返すため, 比較対象は両方 UTC ISO で整合する.
  リスクなし.
- リスク R-2: `process.env.TZ` が undefined の環境で `getServerTimeZone()` が
  `Intl.DateTimeFormat().resolvedOptions().timeZone` を返すと, テスト環境間で挙動が分岐する.
  → `purge-trash-tz.test.ts` / `reset-purge-tz.test.ts` では `vi.stubEnv("TZ", ...)` で
  明示的に固定する. 既存テストも D-004 に従い "UTC" を明示する.
- リスク R-3: 既存挙動に依存していたデータ清算タイミングがあるか?
  → ユーザ視点では「リセット時刻より前に消したものは次回リセットで物理削除される」が
  本来の意図で, 既存挙動はバグである. 期待動作に揃える方向の修正であり後方互換性に問題なし.
- 代替案 A-1: `calcTodayBoundaryAt` の `timeZone` デフォルトを `getServerTimeZone()` にする.
  → 既定値の変更は他の呼び出し元 (現状 `maybeRunDailyReset` は明示渡し, `purge-trash` は
  既定値依存) への影響評価が必要になる. 採用しない.
- 代替案 A-2: `purgeTrash` 自身に `timeZone` 引数を追加し, 呼び出し側 (`maybeRunDailyReset`)
  から渡す.
  → 引数追加は signature 変更となり, 既存 `purgeTrash` 呼び出し箇所 (`daily-reset.ts` の 1 箇所)
  にも改修が必要. 「1 箇所変更」原則 (NFR-1) に反する. 採用しない.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規追加

- 単体: `server/__tests__/unit/purge-trash-tz.test.ts`
  - AC-1 (JST 03:30 trashed → purge される)
  - AC-2 (JST 04:30 trashed → purge されない)
  - AC-3 (purge 境界 === reset 境界)
  - AC-4 (UTC 環境の従来挙動が保たれる)
  - `vi.stubEnv("TZ", "Asia/Tokyo" | "UTC")` で TZ を切り替え, `FakeClock` で時刻を固定する.
  - in-memory repositories (`InMemoryTaskRepository` / `InMemoryCounterRepository`
    / `InMemorySettingsRepository`) を使い `maybeRunDailyReset` 経由で発火させる.
- 結合: `server/__tests__/integration/reset-purge-tz.test.ts`
  - AC-5 (POST /api/v1/reset で TZ = JST のとき purge が正しく走る)
  - `buildTestApp({ initialTime })` + `authHeaders({ "Idempotency-Key": ... })` を用い,
    既存 `reset-tz.test.ts` の構成に揃える.

### 既存テスト追従

- `server/__tests__/integration/trash.test.ts` の `purgeTrash` セクション:
  D-004 に従い `vi.stubEnv("TZ", "UTC")` を `beforeEach`/`afterEach` (`vi.unstubAllEnvs`) で明示.
  既存シナリオの assert は変更しない.
- それ以外の既存テスト群 (web / Android / E2E / domain) は無改修.

### 重点的に確認すること

- purge 境界の TZ 解釈が reset 境界と一致すること (REQ-2).
- `vi.stubEnv("TZ", "Asia/Tokyo")` が他のテストへ漏れないこと (`afterEach` で `vi.unstubAllEnvs`).
- 既存 `reset-tz.test.ts` / `daily-reset-maybe-run-tz.test.ts` の green を維持していること.
- vitest / Playwright / typecheck / lint 全件 green を維持していること (NFR-2 / NFR-3).
