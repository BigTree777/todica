# 仕様: purge-trash の server timezone 取り違えバグ修正

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-112

## 背景 / 課題

server が非 UTC タイムゾーン (例: `process.env.TZ = "Asia/Tokyo"`) で動作し,
`dayBoundaryTime = "04:00"` を採用しているとき, 日次リセット (POST /api/v1/reset
あるいは GET 経路の自動リセット) を実行しても,
リセット時刻直前 (例: JST 03:30) に削除したゴミ箱タスクが物理削除されずに残る.

原因は purge 境界の計算が UTC で固定されている点にある.

- `server/src/use-cases/purge-trash.ts:29`
  `const boundaryAt = calcTodayBoundaryAt(clock.now(), settings.dayBoundaryTime);`
  と第 3 引数 `timeZone` を渡しておらず, `calcTodayBoundaryAt`
  (`server/src/use-cases/daily-reset.ts:22-26`) の既定値 `timeZone = "UTC"`
  で評価される.
- 一方リセット側 `maybeRunDailyReset`
  (`server/src/use-cases/daily-reset.ts:129`) は
  `calcTodayBoundaryAt(now, settings.dayBoundaryTime, getServerTimeZone())`
  と server TZ を渡している.

結果として server TZ = JST のとき, リセット境界は
「JST 当日 04:00 = 前日 19:00 UTC」, purge 境界は「同日 04:00 UTC (= JST 同日 13:00)」となり,
両者がズレる. ユーザが JST 03:30 にタスクをゴミ箱へ送ると `trashed_at` は
`<前日 18:30 UTC>` 付近となり,
purge 側の条件 `trashed_at < 同日 04:00 UTC` には合致して削除される範囲だが,
**本来削除されるべき「リセット時刻より前のもの」** という定義からズレた
時刻帯 (= JST の前日 13:00 〜 当日 04:00 の間に削除されたもの) では,
purge 境界 (UTC 04:00) よりも `trashed_at` のほうが新しくなるため purge を素通りする.

実害は「ユーザの体感としては『前回リセット時刻より前に消したのに, 翌朝起きたらゴミ箱に残っていた』」というデータ清算漏れ.

web 側のローカルリセット
(`web/src/usecases/local-reset-usecase.ts:131`)
は `calcPreviousBoundary(now, boundaryTime, timezone)` のように
`timezone` を明示で渡しているため同症状はない.

## ゴール / 非ゴール

- ゴール:
  - `purgeTrash` の境界計算が server timezone を考慮し, `maybeRunDailyReset` の
    リセット境界と完全に一致する.
  - server TZ = "Asia/Tokyo" / `dayBoundaryTime = "04:00"` のとき,
    リセット時刻直前 (JST 03:30) に削除されたタスクが日次リセットで物理削除される.
  - server TZ = "UTC" の従来挙動が破壊されない.
  - 回帰ガードとして, purge 境界が TZ に依存することを assert する単体 / 結合テストを追加する.
- 非ゴール:
  - ドメイン層・API 契約・Repository インタフェース・既存マイグレーションの変更.
  - `calcTodayBoundaryAt` 本体の挙動変更 (引数 timeZone の意味は据え置く).
  - web / Android クライアント側の挙動変更 (該当箇所は元から TZ を渡しているため不要).
  - DST の精緻な扱い (`calcTodayBoundaryAt` は当日正午の UTC オフセットを使う既存方針を踏襲する).
  - `dayBoundaryTime` の UI / 入力 / 保存経路の変更.

## 要件

- 機能要件:
  - REQ-1: `purgeTrash` は `calcTodayBoundaryAt(now, settings.dayBoundaryTime, getServerTimeZone())`
    によって purge 境界を計算する.
  - REQ-2: `purgeTrash` が計算する境界 `boundaryAt` は, 同じ `now` / `settings.dayBoundaryTime`
    / server timezone のもとで `maybeRunDailyReset` が計算する `appliedBoundaryAt`
    と完全一致する.
  - REQ-3: server TZ が非 UTC のとき, 「リセット時刻 (= サーバ壁時計の当日 `dayBoundaryTime`) より前」に
    `trashed_at` を持つゴミ箱タスクは, 日次リセット実行後にストアから物理削除されている.
  - REQ-4: server TZ = "UTC" のとき, 既存挙動 (UTC 当日 `dayBoundaryTime` を境界として
    `trashed_at < boundaryAt` を削除する) が保たれる.
- 非機能要件:
  - NFR-1: 変更は `server/src/use-cases/purge-trash.ts` 内部に閉じる
    (import 追加 1 行 + 引数 1 行追加の合計 2 行差分).
  - NFR-2: 既存の単体・結合・E2E テスト (vitest / Playwright) が全件 green を保つ.
  - NFR-3: typecheck / lint が 0 件で green を保つ.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 時刻定数の対応は既存テスト `server/__tests__/unit/daily-reset-maybe-run-tz.test.ts` の凡例に揃える
> (JST = UTC+9, DST 非考慮).
> - JST 2026-06-08 04:00 ↔ UTC `2026-06-07T19:00:00.000Z` (= リセット境界)
> - JST 2026-06-08 03:30 ↔ UTC `2026-06-07T18:30:00.000Z` (= 境界直前 / purge 対象であるべき)
> - JST 2026-06-08 04:30 ↔ UTC `2026-06-07T19:30:00.000Z` (= 境界直後 / purge 対象外)
> - JST 2026-06-08 10:00 ↔ UTC `2026-06-08T01:00:00.000Z` (= 評価時刻)

```
シナリオ AC-1: server TZ = JST, リセット時刻直前に削除したタスクが purge される
  Given process.env.TZ = "Asia/Tokyo"
  And   settings.dayBoundaryTime = "04:00"
  And   counter.lastResetExecutedAt = null
  And   clock.now() = "2026-06-08T01:00:00.000Z" (= JST 2026-06-08 10:00)
  And   タスク T1 が { trashedAt: "2026-06-07T18:30:00.000Z" } (= JST 2026-06-08 03:30) でゴミ箱にある
  When  maybeRunDailyReset が実行される (POST /api/v1/reset 経由でも可)
  Then  result.executed === true
  And   result.appliedBoundaryAt === "2026-06-07T19:00:00.000Z"
  And   taskRepository.findById(T1) === null (= 物理削除されている)
```

```
シナリオ AC-2: server TZ = JST, リセット時刻直後に削除したタスクは purge されない
  Given process.env.TZ = "Asia/Tokyo"
  And   settings.dayBoundaryTime = "04:00"
  And   counter.lastResetExecutedAt = null
  And   clock.now() = "2026-06-08T01:00:00.000Z" (= JST 2026-06-08 10:00)
  And   タスク T2 が { trashedAt: "2026-06-07T19:30:00.000Z" } (= JST 2026-06-08 04:30) でゴミ箱にある
  When  maybeRunDailyReset が実行される
  Then  result.executed === true
  And   taskRepository.findById(T2) !== null
  And   T2.trashedAt === "2026-06-07T19:30:00.000Z"
```

```
シナリオ AC-3: purge 境界と reset 境界が一致する (回帰ガード)
  Given process.env.TZ = "Asia/Tokyo"
  And   settings.dayBoundaryTime = "04:00"
  And   clock.now() = "2026-06-08T01:00:00.000Z"
  When  calcTodayBoundaryAt(now, "04:00", getServerTimeZone()) を評価する
  Then  返り値 === "2026-06-07T19:00:00.000Z"
  And   この値は maybeRunDailyReset の result.appliedBoundaryAt と一致する
  And   この値は purgeTrash 内部で taskRepository.deleteTrashOlderThan に渡される boundaryAt と一致する
```

```
シナリオ AC-4: server TZ = UTC の従来挙動が保たれる
  Given process.env.TZ = "UTC"
  And   settings.dayBoundaryTime = "04:00"
  And   clock.now() = "2026-06-08T10:00:00.000Z"
  And   タスク T_old が { trashedAt: "2026-06-07T10:00:00.000Z" } でゴミ箱にある (= UTC 当日 04:00 より前)
  And   タスク T_new が { trashedAt: "2026-06-08T05:00:00.000Z" } でゴミ箱にある (= UTC 当日 04:00 以降)
  When  maybeRunDailyReset が実行される
  Then  taskRepository.findById(T_old) === null
  And   taskRepository.findById(T_new) !== null
```

```
シナリオ AC-5: HTTP 経路でも purge 境界が server TZ で評価される
  Given process.env.TZ = "Asia/Tokyo"
  And   settings.dayBoundaryTime = "04:00"
  And   counter.lastResetExecutedAt = null
  And   clock.now() = "2026-06-08T01:00:00.000Z"
  And   タスク T_pre  が { trashedAt: "2026-06-07T18:30:00.000Z" } でゴミ箱にある
  And   タスク T_post が { trashedAt: "2026-06-07T19:30:00.000Z" } でゴミ箱にある
  When  POST /api/v1/reset を送る (Idempotency-Key 付き / 認証済み)
  Then  HTTP 200 OK が返る
  And   body.executed === true
  And   body.appliedBoundaryAt === "2026-06-07T19:00:00.000Z"
  And   taskRepository.findById(T_pre)  === null
  And   taskRepository.findById(T_post) !== null
```

## 既存テスト互換性

- `server/__tests__/integration/reset-tz.test.ts`:
  本修正で `appliedBoundaryAt` 等の検証ロジックは変えない. 引き続き green であること.
- `server/__tests__/unit/daily-reset-maybe-run-tz.test.ts`:
  リセット側の TZ 解釈は元から正しい. 引き続き green であること.
- `server/__tests__/integration/trash.test.ts` の `purgeTrash` セクション:
  既存シナリオは TZ を `process.env.TZ` で明示固定していないが,
  CI / 開発環境の TZ が UTC でない場合に挙動が変わる可能性があった.
  本修正でも当該テスト群が green を保つようにする (= UTC ベースのシナリオで書かれている部分は
  シナリオ前提で `vi.stubEnv("TZ", "UTC")` を追加するか, 既存挙動を破壊しない範囲で
  シナリオ意図を保つ. 詳細は plan.md 参照).
- `server/__tests__/unit/drizzle-task-repository.test.ts`:
  `deleteTrashOlderThan` の純粋な動作は本修正の影響を受けない.
- web / Android / E2E:
  影響なし. 既存 vitest / Playwright が引き続き全件 green であること.

## 未決事項 / 確認待ち

- U-1: 既存 `server/__tests__/integration/trash.test.ts` の `purgeTrash` セクションで,
  TZ 前提を明示するために `vi.stubEnv("TZ", "UTC")` を追加するかどうか.
  既存実装では CI runner の TZ 設定により暗黙的に依存していた可能性がある.
  追加方針は plan.md 「テスト方針」で決める.
- U-2: 新規テストを `daily-reset-maybe-run-tz.test.ts` に追記するか,
  別ファイル `purge-trash-tz.test.ts` として新設するか.
  対象モジュールが `purge-trash.ts` の単独修正であることに合わせ,
  本仕様では新規ファイル `purge-trash-tz.test.ts` を推奨する (plan.md で確定).
