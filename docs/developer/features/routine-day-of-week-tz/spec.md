# 仕様: 日次リセットのルーティン生成曜日をサーバ TZ の壁時計日付で判定する

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-146
- 由来要件: FR-031（当日分ルーティンタスクの自動生成。BL-017）
- 関連 feature:
  - [`../daily-reset/spec.md`](../daily-reset/spec.md)（日次リセット処理の全体）
  - [`../routine/spec.md`](../routine/spec.md)（ルーティン定義・指定曜日の自動生成）
  - [`../reset-time-rework/spec.md`](../reset-time-rework/spec.md)（`calcTodayBoundaryAt` の TZ 解釈）
- 関連 ADR: [ADR-0011](../../adr/0011-day-boundary-time-source.md)（境界時刻のハイブリッド時刻設計。本 feature は Server モード専任）

## 背景 / 課題

日次リセットは、指定曜日のルーティンを「今日のルーティンタスク」として自動生成する（FR-031）。
どの曜日のルーティンを生成するかは `server/src/use-cases/daily-reset.ts` の `calcDayOfWeek()` が決める。

現状の `calcDayOfWeek(nowIso)` は、now（サーバ時計の UTC 瞬間）の **UTC カレンダー日付**の曜日を返す。

```ts
export function calcDayOfWeek(nowIso: string): number {
  const dateStr = nowIso.slice(0, 10);              // now の UTC 日付
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}
```

一方、同じリセット処理内の「今日」の境界判定
`calcTodayBoundaryAt(now, dayBoundaryTime, getServerTimeZone())` は、now をサーバ TZ
（`process.env.TZ`）の壁時計日付として解釈する。つまり日次リセットは境界判定と曜日算出とで
「今日」の基準日をずらして扱っている。

この不整合により、リセット発火時点で **UTC 日付が現地日付より前**になる TZ・境界の組合せ
（東経オフセットで、境界の壁時計時 < TZ オフセット時間となる場合。JST(+9) では境界
00:00〜08:59 が該当）で、生成される曜日が 1 日前にズレる。

- 具体例（JST・境界 04:00）: 金曜 04:00 JST = 木曜 19:00 UTC。`getUTCDay()` は木曜(4) を返す。
  結果、金曜のリセットで木曜(4)のルーティンを生成し、金曜(5)のルーティンを生成しない。
- さらに悪化する点: 初回発火で `counter.lastResetExecutedAt` が今回の境界時刻に更新されるため、
  同日の後刻（UTC 日付も金曜に変わる時間帯）に開き直しても `needsDailyReset = false` となり、
  正しい曜日で生成し直されない。JST + デフォルト境界 04:00 では毎日再現する。

境界時刻計算 `calcTodayBoundaryAt` 自体は TZ を正しく扱えており、原因は曜日算出のみが TZ を
無視して UTC 日付を使っている点にある。

## ゴール / 非ゴール

- ゴール:
  - 日次リセットが生成するルーティンの曜日を、境界判定と同じ「サーバ TZ の壁時計日付」の曜日に
    一致させる。これにより、東経オフセット × 早朝境界の組合せで生じる曜日ズレを解消する。
  - `calcDayOfWeek` に検証可能なテストを付与し、UTC 日付と現地日付が食い違う条件での曜日を固定する。
- 非ゴール:
  - 境界時刻計算 `calcTodayBoundaryAt` の変更（既に TZ を正しく扱えており無改修）。
  - web ローカルモード `local-reset-usecase.ts` の変更。ローカルモードはルーティン生成を行わない
    （trash 清算と manual→tomorrow の繰越のみ）ため本不具合と無関係・無改修。
  - リセット要否判定 `needsDailyReset` やリセットの発火タイミング自体の変更。
  - 曜日ズレ由来で既に誤生成された過去タスクの遡及補正（データマイグレーション）。

## 要件

- 機能要件:
  - FR-A: `calcDayOfWeek` は IANA タイムゾーン名を受け取り、`nowIso` をその TZ 上の壁時計日付
    （YYYY-MM-DD）として解釈し、その日付の曜日（0=日, 1=月, ..., 6=土）を返す。
  - FR-B: `calcDayOfWeek` の曜日算出手法は `calcTodayBoundaryAt` と同じ日付解釈に基づく。すなわち
    `Intl.DateTimeFormat("en-CA", { timeZone })` で now の現地 Y-M-D を取り出し、
    `new Date(Date.UTC(y, m-1, d)).getUTCDay()` で曜日を求める。
  - FR-C: 日次リセットの呼び出し側 `runDailyResetWrites` は、境界判定と同一の TZ
    （`getServerTimeZone()`）を `calcDayOfWeek` に渡し、その曜日で `routineRepository.findByDayOfWeek`
    を引く。これにより「アプリ上の今日」の曜日のルーティンが生成される。
- 非機能要件:
  - NFR-A: 純関数性を保つ。`calcDayOfWeek` は引数（nowIso, timeZone）のみに依存し、
    `process.env.TZ` 等の環境状態を関数内部で参照しない（TZ は呼び出し側が解決して渡す）。
  - NFR-B: テストは CI の実行環境 TZ に依存しない。TZ は各テストケース内で明示注入し、
    環境変数 `process.env.TZ` の値に結果が左右されないようにする。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。
> 曜日は 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土。

```
シナリオ: (AC-1) UTC 日付と現地日付が一致する時刻では両 TZ で同じ曜日を返す
  Given nowIso = "2026-07-03T12:00:00.000Z"（UTC でも JST でも金曜 2026-07-03）
  When  calcDayOfWeek(nowIso, "UTC") と calcDayOfWeek(nowIso, "Asia/Tokyo") を呼ぶ
  Then  いずれも 5（金曜）を返す
```

```
シナリオ: (AC-2) JST 早朝境界帯で UTC 日付が前日にズレる時刻の曜日
  Given nowIso = "2026-07-02T19:00:00.000Z"
        （UTC では木曜 2026-07-02、Asia/Tokyo では金曜 2026-07-03 04:00）
  When  calcDayOfWeek(nowIso, "Asia/Tokyo") を呼ぶ
  Then  5（金曜）を返す
  And   calcDayOfWeek(nowIso, "UTC") は 4（木曜）を返す（UTC 解釈との差を固定する）
```

```
シナリオ: (AC-3) 西経オフセットで現地日付が UTC より前になる時刻の曜日
  Given nowIso = "2026-07-03T02:00:00.000Z"
        （UTC では金曜 2026-07-03、America/New_York では木曜 2026-07-02 22:00）
  When  calcDayOfWeek(nowIso, "America/New_York") を呼ぶ
  Then  4（木曜）を返す
```

```
シナリオ: (AC-4) calcDayOfWeek は環境変数 process.env.TZ に依存しない
  Given process.env.TZ を "UTC" と "Asia/Tokyo" のどちらに設定していても
  And   nowIso = "2026-07-02T19:00:00.000Z"
  When  calcDayOfWeek(nowIso, "Asia/Tokyo") を呼ぶ
  Then  process.env.TZ の値に関わらず常に 5（金曜）を返す
```

```
シナリオ: (AC-5) 日次リセットは JST + 境界 04:00 の早朝発火で「当日」の曜日のルーティンを生成する
  Given サーバ TZ を "Asia/Tokyo"、dayBoundaryTime = "04:00" とする
  And   金曜(5)に紐づくルーティン R5 と 木曜(4)に紐づくルーティン R4 が定義されている
  And   counter.lastResetExecutedAt = null（未リセット）
  And   clock.now() = "2026-07-02T19:00:00.000Z"（JST で金曜 2026-07-03 04:00）
  When  maybeRunDailyReset を実行する
  Then  リセットが実行され（executed = true）
  And   金曜(5)のルーティン R5 から今日のルーティンタスクが生成される
  And   木曜(4)のルーティン R4 からはルーティンタスクが生成されない
```

```
シナリオ: (AC-6) 日次リセットの曜日は findByDayOfWeek に境界判定と同じ TZ の曜日で問い合わせる
  Given サーバ TZ を "Asia/Tokyo"、dayBoundaryTime = "04:00" とする
  And   clock.now() = "2026-07-02T19:00:00.000Z"（JST で金曜 2026-07-03 04:00）
  And   counter.lastResetExecutedAt = null
  When  maybeRunDailyReset を実行する
  Then  routineRepository.findByDayOfWeek は 5（金曜）で呼び出される
  And   4（木曜）では呼び出されない
```

## 未決事項 / 確認待ち

- なし。修正方針・スコープ境界はいずれも確定済み。
