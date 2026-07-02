# 設計・実装計画: 日次リセットのルーティン生成曜日をサーバ TZ の壁時計日付で判定する

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`calcDayOfWeek` に `timeZone` 引数を追加し、`calcTodayBoundaryAt` と同じ日付解釈
（`Intl.DateTimeFormat("en-CA", { timeZone })` で now の現地 Y-M-D を得て曜日を求める）へ置き換える。
呼び出し側 `runDailyResetWrites` は境界判定と同一の `getServerTimeZone()` を渡す。これにより
「今日の境界」と「生成する曜日」が同じ基準日で揃い、東経オフセット × 早朝境界の曜日ズレを解消する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし（外部 API のシグネチャ・レスポンス変更なし。生成されるルーティンの曜日が是正されるのみ） |
| DB | なし（スキーマ・マイグレーション変更なし） |
| モジュール | `server/src/use-cases/daily-reset.ts` のみ。`calcDayOfWeek` に `timeZone` 引数を追加し実装を差し替え、`runDailyResetWrites` の呼び出しを `calcDayOfWeek(now, getServerTimeZone())` に変更 |
| UI | なし |

## 設計詳細

- データモデル: 変更なし。
- 処理フロー:
  - `calcDayOfWeek(nowIso: string, timeZone: string): number` へシグネチャを変更する。
    1. `Intl.DateTimeFormat("en-CA", { timeZone, year, month, day, ... })` の `formatToParts(new Date(nowIso))`
       で現地の year / month / day を取り出す（`calcTodayBoundaryAt` と同じ日付抽出手法）。
    2. `new Date(Date.UTC(year, month - 1, day)).getUTCDay()` で曜日（0=日〜6=土）を返す。
  - `runDailyResetWrites` 内の当日ルーティン生成ブロック（FR-031）で
    `const dayOfWeek = calcDayOfWeek(now, getServerTimeZone());` に変更する。
    `getServerTimeZone()` は `maybeRunDailyReset` が境界判定に使うものと同一関数。
  - `findByDayOfWeek(dayOfWeek)` 以降の生成ロジック（`findTodayRoutineTask` による重複回避、
    `createRoutineTask`）は変更しない。
- 例外 / エラー処理:
  - `timeZone` は呼び出し側（server）が `getServerTimeZone()` で解決した IANA 名を必ず渡す前提。
    不正 TZ 名時の `Intl.DateTimeFormat` の挙動は `calcTodayBoundaryAt` と同一であり、本 feature で
    新たなバリデーションは追加しない（境界計算と同じ前提を共有する）。

## 重要な決定

- `calcDayOfWeek` は純関数のまま、TZ を引数で受け取る（NFR-A）。`process.env.TZ` の参照は
  server 側の `getServerTimeZone()`（I/O）に閉じ、曜日算出関数は環境に依存させない。
  これは `calcTodayBoundaryAt` が採る「ドメイン純関数 + server 側 TZ 解決」の設計に揃える判断で、
  module-boundaries.md の「ドメイン層は I/O を持たない」原則と整合する。
- ADR は新設しない。時刻・TZ 設計の基本方針は既存 ADR-0011 が定めており、本 feature は
  その方針に既存関数を追従させる局所修正のため、新たな設計判断の記録を要しない。

## リスク / 代替案

- リスク: 低。変更は 1 ファイル・1 関数の実装差し替えと 1 箇所の呼び出し変更に限定される。
  `calcDayOfWeek` の呼び出し元は `runDailyResetWrites` の 1 箇所のみ（リポジトリ全体を確認済み）。
- 後方互換: `calcDayOfWeek` の引数を 1 つ増やすため、既存の `calcDayOfWeek(nowIso)` 呼び出しは
  型エラーになる。呼び出し元は上記 1 箇所のみで同時に修正するため影響は閉じる。
- 代替案（不採用）: 呼び出し側で UTC 日付から手動オフセット補正する案は、DST や TZ 差分を
  自前計算することになり `calcTodayBoundaryAt` と手法が二重化する。純関数へ TZ を渡し既存手法へ
  揃える本案の方が保守性・整合性で優る。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 単体テスト（`calcDayOfWeek`）: 純関数として直接検証する。
  - AC-1: UTC 日付と現地日付が一致する時刻で UTC / Asia/Tokyo が同じ曜日を返す。
  - AC-2: JST 早朝境界帯（`2026-07-02T19:00:00.000Z`）で Asia/Tokyo=金(5) / UTC=木(4) を固定。
  - AC-3: 西経（America/New_York）で現地日付が UTC より前になる時刻の曜日を固定。
  - AC-4: `process.env.TZ` を UTC / Asia/Tokyo に切り替えても結果が変わらないこと（環境非依存）。
    テストは TZ を引数注入で与え、実行環境の TZ に依存しないこと（NFR-B）。
- 統合レベルテスト（`maybeRunDailyReset`）: サーバ TZ を Asia/Tokyo、境界 04:00 に固定し、
  金(5)/木(4) のルーティンを用意して早朝発火（`2026-07-02T19:00:00.000Z`）を実行する。
  - AC-5: 金(5)のルーティンから今日のルーティンタスクが生成され、木(4)からは生成されないこと。
  - AC-6: `findByDayOfWeek` が 5（金）で呼ばれ、4（木）では呼ばれないこと（スパイ/フェイクで検証）。
  - サーバ TZ の注入方法は既存の TZ 系テスト（`server/__tests__/unit/daily-reset-tz.test.ts` /
    `daily-reset-maybe-run-tz.test.ts`）の手法に揃え、CI の実行環境 TZ に依存させない。
