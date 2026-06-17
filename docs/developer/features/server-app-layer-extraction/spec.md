# 仕様: サーバアプリケーション層の抽出（server-app-layer-extraction）

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-115
- 関連: [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md) §2 / §4.1 / §5.2 / §6

## 背景 / 課題

[`module-boundaries.md`](../../architecture/module-boundaries.md) §5.2 は、サーバ側の依存ルールとして次を規定する。

- 「API レイヤから直接ドメイン / データアクセス層を呼ばず, **必ずアプリケーション層を経由する**」
- 「トランザクション境界は**アプリケーション層が指定する**。永続化アダプタが具体的に開始・コミットする」

また §4.1 はアプリケーション層モジュールとして `server/app/task-usecases` / `focus-usecases` / `project-usecases` / `routine-usecases` / `trash-usecases` / `reset-usecase` / `settings-usecases` を列挙する。

一方、現状の `server/src/` 直下にはアプリケーション層に相当する `app/` ディレクトリが存在せず、各 API ルータ（`server/src/routers/*.ts`）のハンドラ内に、ユースケース相当のロジックが直書きされている。具体例:

- `routers/tasks.ts` の complete ハンドラ: ドメイン純関数 `completeTask` の呼び出し → `taskRepository.update` → `counterRepository` の取得・`incrementCompletedCount`・更新 → focus 自動解除、という Repository 呼び出し順序とドメイン操作の組み立てがハンドラ内にある。
- `routers/tasks.ts` の update / delete: ドメイン純関数の呼び出しと focus 自動解除のオーケストレーションがハンドラ内にある。
- `routers/projects.ts` の delete / `routers/routines.ts` の delete: カスケード（タスクの projectId NULL 化 / ルーティン配下タスク削除）の**トランザクション境界**をハンドラが `deps.db.transaction(...)` で直接指定している。
- `routers/focus.ts` の PUT: フォーカス対象タスクの存在・ゴミ箱・dueDate 検証と `setCurrentTask` の組み立てがハンドラ内にある。
- `routers/settings.ts` の PATCH: `validateDayBoundaryTime` 呼び出しと settings 更新オブジェクトの組み立てがハンドラ内にある。
- `routers/trash.ts` / `routers/counter.ts` / `routers/reset.ts`: 取得・復元・物理削除・リセット要否判定の組み立てがハンドラ内にある。

これは §5.2 の「API レイヤから直接ドメイン / データアクセス層を呼ばない」「トランザクション境界はアプリケーション層が指定する」に反する。アプリケーション層が独立した置き場所として存在しないため、ユースケース手続きの所在が API レイヤと混在し、層境界が崩れている。

## ゴール / 非ゴール

- ゴール:
  - `server/src/app/` 配下にアプリケーション層のユースケースモジュール群を新設し、各エンティティを所管する。
  - 各 API ルータのハンドラから、ドメイン純関数の呼び出しオーケストレーション・Repository 呼び出し順序の組み立て・トランザクション境界指定をアプリケーション層へ抽出する。
  - 各ルータを「入力の受付・パース／HTTP 入出力変換／ユースケース呼び出し」だけを担う薄い presentational ハンドラに整理する。
  - トランザクション境界をユースケース関数のシグネチャ（引数 / 戻り値）で明示する。
  - §5.2 文面（「API レイヤから直接ドメイン / データアクセス層を呼ばない」「トランザクション境界はアプリケーション層が指定する」）に適合させる。
- 非ゴール:
  - `routers/auth.ts`（セッション / パスワード管理）のアプリケーション層抽出。本 BL のスコープ外として現状のまま据え置く。§5.2 適合の徹底対象は task / project / routine / focus / counter / settings / trash / reset / today の 9 系統とし、auth は別途扱う。
  - 既存 `server/src/use-cases/`（`daily-reset.ts` / `purge-trash.ts`）の物理移動・`app/` への統合・ディレクトリ二重化の整理。`reset-usecases.ts` は `maybeRunDailyReset` を無改修ラッパとして再利用するに留める。二重化整理が必要なら別 BL とする。
  - ドメイン層（`@todica/domain/*` の純関数・エンティティ・状態遷移）の改修。
  - データアクセス層（`server/src/data/*` の Repository インターフェース）の改修。
  - 永続化アダプタ（`server/src/infra/persistence/*`）の改修。
  - API 契約（`api/openapi.yaml`、HTTP ステータス・レスポンスボディ・エラーコード）の変更。
  - DB スキーマ（`server/src/db/schema.ts`）の変更。
  - 既存の外部から観測可能な API 挙動（ステータスコード・ボディ・冪等性・楽観ロック・focus 自動解除・counter +1 の発火条件）の変更。

## 要件

### 機能要件

- FR-1: `server/src/app/` ディレクトリが存在し、以下のユースケースモジュールを持つ。
  - `task-usecases.ts`: タスクの作成 / 更新 / 完了 / 削除 / 復元。完了時の counter +1、期限変更・完了・削除に伴う focus 自動解除のオーケストレーションを含む。
  - `project-usecases.ts`: プロジェクトの作成 / 更新 / 削除（タスクの projectId NULL 化のカスケードとトランザクション境界を含む）。
  - `routine-usecases.ts`: ルーティンの作成 / 更新 / 削除（配下タスク削除のカスケードとトランザクション境界を含む）。
  - `focus-usecases.ts`: フォーカス対象の設定（対象タスクの存在・ゴミ箱・dueDate 検証 + `setCurrentTask`）と取得。
  - `counter-usecases.ts`: カウンタの取得。
  - `settings-usecases.ts`: 設定の取得と境界時刻の更新（`validateDayBoundaryTime` + 楽観ロック）。
  - `trash-usecases.ts`: ゴミ箱の一覧 / 復元 / 物理削除（空にする）。
  - `reset-usecases.ts`: 日次リセット要否判定・実行（`maybeRunDailyReset` 呼び出し）と結果整形。
  - `today-usecases.ts`: 今日ビューの読み取り（`runDailyResetIfNeeded` → タスク一覧 → `filterToday`/`sortToday`/`pickNextTaskId` → focus / counter 取得 → ビュー DTO 整形）。
- FR-2: 各 API ルータ（`server/src/routers/tasks.ts` / `projects.ts` / `routines.ts` / `focus.ts` / `counter.ts` / `settings.ts` / `trash.ts` / `reset.ts` / `today.ts`）のハンドラは、対応するアプリケーション層ユースケースを呼び出す。ハンドラ内にドメイン純関数（`@todica/domain/*`）の直接呼び出し・Repository 呼び出し順序の組み立て・`deps.db.transaction(...)` によるトランザクション境界指定が残らない。`routers/auth.ts`（セッション / パスワード管理）は本 feature の対象外（非ゴール参照）。
- FR-3: トランザクション境界を持つユースケース（プロジェクト削除・ルーティン削除のカスケード）は、トランザクション境界の指定をユースケース関数の内部に閉じ込め、ルータからは関数呼び出し 1 回で完結する形にする。
- FR-4: ルータ層は引き続き入力パース・HTTP 入出力変換のための presentational helper（`server/src/routers/_shared.ts` の `saveAndReturn` / `errorJson` / `sortTasks`）を呼んでよい。focus 自動解除のオーケストレーション（現 `clearFocusIfMatches`）はアプリケーション層が担う。
- FR-5: ユースケースは、HTTP の語彙（`Context` / ステータスコード / ヘッダ）に依存しない。入力はパース済みのユースケース引数（プリミティブ / DTO）、出力はユースケース結果（成功値・エラー値・楽観ロック衝突情報など、層の言葉での値）とする。HTTP への写像はルータが行う。

### 非機能要件

- NFR-1: 既存の自動テスト（vitest 全件、Playwright 全件）が green のまま維持される。
- NFR-2: typecheck エラー 0、lint エラー 0。
- NFR-3: 依存方向が `API レイヤ（routers） → アプリケーション層（app） → ドメイン層 / データアクセス層インターフェース` の単方向であり、アプリケーション層は API レイヤ（`hono` の `Context` 等）に依存しない（§2「アプリケーション層が知ってはいけないもの: API レイヤ」と整合）。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。
> 「振る舞い不変」を中心に据え、リファクタ前後で外部挙動が変わらないことを検証可能な形で書く。

```
シナリオ: AC-1 アプリケーション層ディレクトリが各エンティティを所管する
  Given リポジトリの server/src/ を見る
  When  app/ ディレクトリの内容を確認する
  Then  task-usecases / project-usecases / routine-usecases / focus-usecases /
        counter-usecases / settings-usecases / trash-usecases / reset-usecases /
        today-usecases の 9 系統のユースケースモジュールが server/src/app/ 配下に存在する
```

```
シナリオ: AC-2 ルータにドメイン / データアクセスの直接組み立てが残らない
  Given リファクタ後の server/src/routers/*.ts
  When  各ルータのハンドラ実装を確認する
  Then  ハンドラ内に @todica/domain/* のドメイン純関数の直接呼び出しがない
  And   ハンドラ内に Repository 呼び出し順序の組み立て（取得→ドメイン操作→保存の連鎖）がない
  And   ハンドラ内に deps.db.transaction(...) によるトランザクション境界指定がない
  And   ハンドラはアプリケーション層ユースケースの呼び出しと HTTP 入出力変換だけを行う
```

```
シナリオ: AC-3 アプリケーション層が API レイヤに依存しない
  Given server/src/app/*.ts
  When  各ユースケースモジュールの import を確認する
  Then  hono の Context など API レイヤ固有の型・値を import していない
  And   依存先は @todica/domain/* / server/src/data/* インターフェース / Clock /
        トランザクション境界用の db ハンドル / server/src/use-cases/(daily-reset) /
        server/src/today.ts(整列純関数) に限られる
```

```
シナリオ: AC-4 タスク完了の counter +1 と focus 自動解除が不変
  Given 通常状態（trashedAt が null）の今日タスクが現在のフォーカス対象である
  When  そのタスクを完了する（POST /tasks/:id/complete）
  Then  タスクが完了状態になり 200 を返す
  And   今日の完了数カウンタが 1 増える
  And   フォーカスの currentTaskId が null に解除される
```

```
シナリオ: AC-5 既ゴミ箱タスクの再完了は no-op で counter を増やさない
  Given 既にゴミ箱状態のタスクが存在する
  When  そのタスクを完了する（POST /tasks/:id/complete）
  Then  200 を返し現行タスクをそのまま返す
  And   今日の完了数カウンタは増えない
  And   If-Match 検証はスキップされる
```

```
シナリオ: AC-6 期限を明日へ変更するとフォーカスが解除される
  Given 現在のフォーカス対象が dueDate=today のタスクである
  When  そのタスクの dueDate を tomorrow へ更新する（PATCH /tasks/:id）
  Then  タスクが更新され 200 を返す
  And   フォーカスの currentTaskId が null に解除される
```

```
シナリオ: AC-7 プロジェクト削除でタスクの projectId が NULL 化される
  Given あるプロジェクトに紐付くタスクが存在する
  When  そのプロジェクトを削除する（DELETE /projects/:id）
  Then  204 を返す
  And   紐付いていたタスクの projectId が null になる
  And   タスクの NULL 化とプロジェクト削除が同一トランザクション境界で実行される
```

```
シナリオ: AC-8 ルーティン削除で配下の未ゴミ箱タスクが削除される
  Given あるルーティンから生成された未ゴミ箱タスクが存在する
  When  そのルーティンを削除する（DELETE /routines/:id）
  Then  204 を返す
  And   配下の未ゴミ箱タスクが削除される
  And   配下タスク削除とルーティン削除が同一トランザクション境界で実行される
```

```
シナリオ: AC-9 フォーカス設定の入力検証が不変
  Given タスクが存在する
  When  存在しない / ゴミ箱中 / dueDate!=today のタスク id でフォーカスを設定する（PUT /focus）
  Then  400 INVALID_FOCUS_TARGET を返す
  And   有効な today タスク id を渡した場合は 200 でフォーカスが更新される
```

```
シナリオ: AC-10 設定の境界時刻更新の検証と楽観ロックが不変
  Given 設定が存在する
  When  不正な dayBoundaryTime で更新する（PATCH /settings）
  Then  400 INVALID_DAY_BOUNDARY_TIME を返す
  When  正しい dayBoundaryTime と一致しない If-Match で更新する
  Then  412 を返し現行設定を返す
```

```
シナリオ: AC-11 ゴミ箱の一覧 / 復元 / 物理削除が不変
  Given ゴミ箱にタスクが存在する
  When  ゴミ箱を一覧する（GET /trash）→ 復元する（POST /trash/:id/restore）→ 空にする（DELETE /trash）
  Then  一覧はゴミ箱タスクを返し、復元は dueDate を today にリセットして 200、空にすると 204 で全ゴミ箱タスクが物理削除される
```

```
シナリオ: AC-12 リセット要否判定が不変
  Given 境界時刻を超えた状態である
  When  POST /reset を呼ぶ
  Then  200 を返し { executed, appliedBoundaryAt } 相当の結果を返す
  And   GET /today の自動リセットも同一のユースケースを経由して動作する
```

```
シナリオ: AC-13 自動テストとビルド健全性
  Given リファクタ完了後のリポジトリ
  When  vitest 全件・Playwright 全件・typecheck・lint を実行する
  Then  vitest 全件が green
  And   Playwright 全件が green
  And   typecheck エラーが 0
  And   lint エラーが 0
```

### チェックリスト（補助）

- [ ] `server/src/app/` に 9 系統のユースケースモジュール（task / project / routine / focus / counter / settings / trash / reset / today）が存在する。
- [ ] `routers/auth.ts` は本 feature では無改修（スコープ外）。
- [ ] 各ルータのハンドラにドメイン純関数の直接呼び出しが残らない。
- [ ] 各ルータのハンドラに Repository 呼び出し順序の組み立てが残らない。
- [ ] 各ルータのハンドラに `deps.db.transaction(...)` のトランザクション境界指定が残らない。
- [ ] アプリケーション層は `hono` の `Context` に依存しない。
- [ ] 外部から観測可能な API 挙動（ステータス・ボディ・冪等性・楽観ロック・focus 自動解除・counter +1 条件）が不変。
- [ ] vitest / Playwright 全件 green、typecheck 0、lint 0。

## 決定事項（確認済み）

未決事項は管理者確認により以下のとおり確定した。残る未決事項はない。

- D-U1（承認）: 既存の `server/src/use-cases/`（`daily-reset.ts` / `purge-trash.ts`）は無改修ラッパとして再利用する。`reset-usecases.ts` は `maybeRunDailyReset`（`server/src/use-cases/daily-reset.ts`）を呼ぶ薄いラッパとし、`use-cases/` の物理移動・`app/` への統合・二重化整理は本 BL の対象外（別 BL 候補）とする。
- D-U2（承認）: `today.ts` も §5.2 徹底のため抽出対象に含め、`today-usecases.ts` を追加して **9 モジュール構成**とする。ただし `routers/auth.ts`（セッション / パスワード管理）はバックログ範囲外として据え置く（非ゴール参照）。
- D-U3（承認）: ユースケースは例外を投げず、discriminated union（`ok` / `invalid` / `notFound` / `conflict` / `noop`）を返す。HTTP への写像はルータが行う。結果型の具体形は plan.md で定義する。
- D-U4（承認）: ユースケース層の直接単体テストを追加するか否かは test-designer の判断に委ねる（必須ではない）。振る舞い不変は既存 API ハンドラテストの無改修 green 維持で担保する。
