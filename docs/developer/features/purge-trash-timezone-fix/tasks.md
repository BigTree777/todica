# タスク: purge-trash の server timezone 取り違えバグ修正

> [`plan.md`](plan.md) を TDD サイクルに分解する. 完了したらチェックを入れる.
> サブエージェント分担: `test-designer` → `implementer` → `auditor`.

## test-designer (失敗するテストの作成)

- [x] T-1: 新規ファイル `server/__tests__/unit/purge-trash-tz.test.ts` を作成する.
  - [x] T-1.1 シナリオ AC-1 (JST 03:30 trashed → purge される) を `vi.stubEnv("TZ", "Asia/Tokyo")` + `FakeClock` で組み, `maybeRunDailyReset` 経由で `taskRepository.findById(T1) === null` を assert.
  - [x] T-1.2 シナリオ AC-2 (JST 04:30 trashed → purge されない) を同条件で組み, `taskRepository.findById(T2) !== null` を assert.
  - [x] T-1.3 シナリオ AC-3 (purge 境界 === reset 境界) を `calcTodayBoundaryAt(now, "04:00", getServerTimeZone())` の戻り値と `maybeRunDailyReset` の `result.appliedBoundaryAt` 一致で assert.
  - [x] T-1.4 シナリオ AC-4 (UTC 環境の従来挙動) を `vi.stubEnv("TZ", "UTC")` で組み, UTC 当日 04:00 を境界とした削除/残留を assert.
  - [x] T-1.5 `afterEach(() => vi.unstubAllEnvs())` を入れて TZ stub の漏れを防ぐ.
- [x] T-2: 新規ファイル `server/__tests__/integration/reset-purge-tz.test.ts` を作成する.
  - [x] T-2.1 シナリオ AC-5 (POST /api/v1/reset / TZ = JST) を `buildTestApp({ initialTime: "2026-06-08T01:00:00.000Z" })` + `authHeaders({ "Idempotency-Key": ... })` で組み, `T_pre` が消えて `T_post` が残ることを assert.
  - [x] T-2.2 `beforeEach` で `vi.stubEnv("TZ", "Asia/Tokyo")`, `afterEach` で `vi.unstubAllEnvs()`.
- [x] T-3: 既存 `server/__tests__/integration/trash.test.ts` の `purgeTrash` セクションに `vi.stubEnv("TZ", "UTC")` の前提を追加する (D-004).
  - [x] T-3.1 `describe("purgeTrash（日次清算 BL-011 / FR-062）")` 直下の `beforeEach` で stub を追加し, 既存 `beforeEach` と共存させる. `afterEach` で `vi.unstubAllEnvs()`.
  - [x] T-3.2 既存シナリオの assert は変更しない.
- [x] T-4: `npx vitest run server` を実行し, 上記新規テストが purge-trash.ts 未修正状態で **失敗** することを確認する (red 確認).

## implementer (修正の適用)

- [x] I-1: `server/src/use-cases/purge-trash.ts` を 2 行差分で修正する.
  - [x] I-1.1 `import { calcTodayBoundaryAt } from "./daily-reset.js";` を `import { calcTodayBoundaryAt, getServerTimeZone } from "./daily-reset.js";` に変更.
  - [x] I-1.2 `const boundaryAt = calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime);` を `const boundaryAt = calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime, getServerTimeZone());` に変更 (改行整形は lint / prettier 任せ).
- [x] I-2: `npx vitest run server` を実行し, T-1 / T-2 / T-3 が **全て green** になることを確認する.
- [x] I-3: `npx vitest run` (リポジトリルートから全件) で server / web / domain 全テストが green であることを確認する.
- [x] I-4: `npx tsc -p server --noEmit` (または同等の typecheck コマンド) と lint コマンドが 0 件であることを確認する.
- [x] I-5: 必要に応じて Playwright (`npx playwright test`) も走らせて regression が無いことを確認する.

## auditor (仕様適合・品質の検証)

- [x] A-1: 修正差分が `server/src/use-cases/purge-trash.ts` の 2 行に限定されているか確認する (NFR-1).
- [x] A-2: `spec.md` の REQ-1 〜 REQ-4 / AC-1 〜 AC-5 が新規テストで網羅されているか確認する.
- [x] A-3: 既存テスト (`reset-tz.test.ts` / `daily-reset-maybe-run-tz.test.ts` / `trash.test.ts` / `drizzle-task-repository.test.ts` 等) が green を維持しているか確認する.
- [x] A-4: `vi.stubEnv` の `afterEach(() => vi.unstubAllEnvs())` が新規 / 既存テストで漏れていないか確認する.
- [x] A-5: ドメイン / API / Repository / 既存マイグレーションが無改修であることを diff で確認する.
- [x] A-6: vitest / Playwright / typecheck / lint 全件 green を最終確認する.

## ドキュメント

- [x] D-1: backlog (`docs/developer/planning/backlog.md` の BL-112 行) の status を Done に更新する (実装完了後).
- [x] D-2: 本 feature ディレクトリの spec / plan / tasks を最終確認し, 未決事項 U-1 / U-2 を解消済みにする.

## 仕上げ

- [x] F-1: 受け入れ基準 AC-1 〜 AC-5 を全て満たすことを再確認.
- [x] F-2: PR を `feature/purge-trash-timezone-fix` ブランチで作成し, レビュー依頼.
