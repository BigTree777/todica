# タスク: 日次リセットのルーティン生成曜日をサーバ TZ の壁時計日付で判定する

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [ ] `server/src/use-cases/daily-reset.ts` の `calcDayOfWeek` を
      `calcDayOfWeek(nowIso: string, timeZone: string): number` へ変更し、
      `Intl.DateTimeFormat("en-CA", { timeZone })` で現地 Y-M-D を取り出して
      `new Date(Date.UTC(y, m-1, d)).getUTCDay()` を返す実装に差し替える（FR-A / FR-B）。
- [ ] 同ファイル `runDailyResetWrites` 内のルーティン生成ブロックの呼び出しを
      `calcDayOfWeek(now, getServerTimeZone())` に変更する（FR-C）。
- [ ] `calcDayOfWeek` の JSDoc を「サーバ TZ の壁時計日付の曜日を返す」内容に更新する
      （UTC 日付を返す旨の記述を除去）。

## テスト

- [ ] 単体テスト: `calcDayOfWeek` に AC-1〜AC-4 を追加する。TZ は引数注入で与え、
      `process.env.TZ` に依存しないこと（NFR-B）を AC-4 で確認する。
- [ ] 統合レベルテスト: `maybeRunDailyReset` に AC-5 / AC-6 を追加する。サーバ TZ = Asia/Tokyo、
      境界 04:00、`clock.now()="2026-07-02T19:00:00.000Z"`、金(5)/木(4) ルーティンで、
      金(5)のみ生成・`findByDayOfWeek(5)` 呼び出しを検証する。

## ドキュメント

- [ ] `docs/developer/planning/backlog.md` に BL-146 の行を追加する（P0 / Todo）。
- [ ] `features/daily-reset/` 側で曜日算出の TZ 前提に触れている記述があれば追従確認する
      （なければ変更不要）。

## 仕上げ

- [ ] 受け入れ基準（spec.md AC-1〜AC-6）を全て満たすことを確認する。
- [ ] `npm run lint`（warning 0）/ `npm run typecheck`（pass）を確認する。
- [ ] レビュー依頼。
