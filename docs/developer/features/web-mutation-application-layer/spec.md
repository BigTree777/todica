# 仕様: Web mutation のアプリケーション層への移設

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-118
- 関連アーキテクチャ: [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md) §3 / §5.3

## 背景 / 課題

`module-boundaries.md` §3 は Web クライアントを **UI 層 → アプリケーション層（クライアント）→ データソース抽象（Repository）** の単方向依存で構成すると定める。
§5.3 と §5.1 の共通ルールは「UI 層は直接 Repository / 永続化アダプタ / API クライアントを呼ばない。必ずアプリケーション層のユースケース経由」「楽観 UI はアプリケーション層で起動する」と規定する。

現実装はこの境界に違反している。

- `web/src/ui/today-view/today-view.tsx` / `tomorrow-view.tsx` / `focus-view.tsx` / `projects-view.tsx` / `routines-view.tsx` / `trash-view.tsx` / `settings-view.tsx`、および `project-create-dialog.tsx` が、view コンポーネント内で `useMutation({ mutationFn: ... })` を直接構成している。
- これらの `mutationFn` 内で `repository.create / update / delete / complete / setFocus / restore / empty / patchSettings` 等の Repository メソッドを **view 層から直接呼んでいる**。
- 楽観 UI に関わる横断ロジック（offline-queue への `enqueue` / `dequeue`、オフライン分岐、`mapConflict` / `OptimisticLockError` → `ConflictError` 変換、`onSuccess` の `invalidateQueries`、`onError` の `notifyError`）が view 層に直書きされ、view 間でほぼ同一のコードが重複している。
- `web/src/usecases/` は `local-reset-usecase.ts`（ローカルモード日次リセット）のみで、サーバモードの書き込み系ユースケース層が事実上存在しない。

結果として、view 層が Repository 型・`OptimisticLockError` 等の Repository 例外型・offline-queue を直接 import しており、境界が崩れている。

## ゴール / 非ゴール

- ゴール:
  - 各 entity 系統に対応する Web 側ユースケースモジュールを `web/src/usecases/` 配下に新設する。
  - 各ユースケースは mutation フック（`useUpdateTaskMutation` 等）を export し、内部で `useMutation` を構成して Repository を呼ぶ。invalidate キー・offline-queue 連携・衝突変換・楽観 UI 起動をユースケース内に閉じる。
  - view 層は、ユースケースが export するフックを呼び、返ってきた `mutate` / `mutateAsync` をイベントハンドラから起動するだけにする。
  - view 層から `useMutation` の直接構成と Repository（および Repository 例外型）の直接 import を消す（§5.3 / §5.1 文面への適合）。
- 非ゴール:
  - ドメイン層（`@todica/domain/*`）・Repository 実装（`web/src/repositories/*`）・API クライアント（`authedFetch`）は無改修。
  - UI のレイアウト / DOM 構造 / `aria-label` / 表示テキスト / フォーム挙動は無改修（観測可能な振る舞いを変えない）。
  - ローカルモードの `local-reset-usecase.ts` は据え置き（本 feature のスコープ外）。
  - offline-queue（`offline-queue.ts`）の実装自体・`useConflictDialog` フック・`notifyError` の実装は無改修（呼び出し位置のみ移動）。
  - 楽観 UI の挙動を「新規に」追加しない（既存実装に楽観更新ロジックがある範囲のみ移設する。下記「楽観更新の現状」を参照）。

## 楽観更新の現状（移設対象の正確な範囲）

現実装の「楽観 UI」は次の 2 要素で構成され、`onMutate` / `setQueryData` による即時 cache 書き換え + `onError` ロールバックという古典的な optimistic update は **採用していない**（`settings-view` の `setQueryData` は PATCH 成功後のサーバ正本値の反映であり、楽観更新ではない）。

1. **offline-first 楽観成功**: `mutationFn` 冒頭で offline-queue に `enqueue` し、`navigator.onLine === false` のときは Repository を呼ばず `undefined` を返して楽観的に成功させる。オンライン時は Repository を呼び、成功したら対応キューエントリを `dequeue` する。
2. **衝突の昇格**: オンライン 412 で Repository が投げる `OptimisticLockError` / `ProjectConflictError` / `RoutineConflictError` / `RestoreConflictError` を、`findEntryByKey` / `mapConflict` でキューエントリと紐付けて `ConflictError` に変換し、`onError` で `ConflictDialog` を開く。

本 feature では「この 2 要素をユースケース内へそのまま移す」ことが楽観更新の移設方針であり、新たな `onMutate` ベースの楽観更新は導入しない。

## 要件

- 機能要件:
  - FR-1: `web/src/usecases/` 配下に entity 系統別のユースケースモジュールを新設する。最低限、次を所管する。
    - `task-usecases.ts`: create / update / delete / complete / setFocus（`UpdateTaskCommand` 経由の name / dueDate / projectId / priority 変更を含む）。
    - `project-usecases.ts`: create / update / delete。
    - `routine-usecases.ts`: create / update / delete。
    - `trash-usecases.ts`: restore / empty。
    - `settings-usecases.ts`: patchSettings。
  - FR-2: 各ユースケースは React フックとして mutation を export する。フックの粒度は **entity ごとに 1 フックが複数 mutation を束ねて返す**（Q-1=案B 確定。例: `useTaskMutations(repository, deps)` → `{ create, update, delete, complete, setFocus }`）。フックは Repository を引数で受け取り、内部で `useMutation` を構成して当該 Repository メソッドを呼ぶ。
  - FR-3: 各フックは、現行 view 内 mutation が持っていた以下の責務をユースケース内に閉じる。
    - offline-queue 連携（`enqueue` / `dequeue` の安全呼び出し、オフライン楽観成功分岐）。
    - 衝突変換（Repository 例外 → `ConflictError`）。
    - `onSuccess` での `invalidateQueries`（invalidate キーをユースケース側に持つ）。
  - FR-4: `notifyError` 通知と `ConflictDialog` の開閉は、view が現在持つ `useConflictDialog` の結果を **`onConflict` コールバックとしてユースケースフックに注入**する形で接続する（UI 状態の所有は view、起動はユースケース。Q-2=案A 確定）。観測される通知文言（「通信に失敗しました」等）は現状と同一にする。
  - FR-5: 各 view（today / tomorrow / focus / projects / routines / trash / settings + project-create-dialog）は、`useMutation` の直接構成を削除し、対応するユースケースフックの呼び出しに置換する。view の `mutationFn` / `onSuccess` / `onError` 本文・offline-queue 呼び出し・`OptimisticLockError` 等の直接参照を view から除去する。
  - FR-5b: settings は **412（`PatchConflictError`）判定もユースケース層（`settings-usecases.ts`）へ移す**（Q-7=完全適合 確定）。`settings-view.tsx` には `PatchConflictError` の import / 判定ロジックを残さない。412 を検知して最新サーバ値を view に渡す経路は、`onConflict` 相当のコールバック注入（または成功時の値返却）で表現し、view 側の `ConflictDialog` / 通知 / 最新値表示を起動する。これにより `settings-view.tsx` を AC-2 の衝突例外型 import 検査対象に**含める**。
  - FR-6: invalidate キーの集合は view ごとに現状を維持する。特に次の差異を保つ。
    - tomorrow の「今日にする」/「完了」は `["tomorrow"]` / `["today"]` / `["focus"]` を invalidate し、observer 不在の `["today"]` / `["focus"]` を `fetchQuery` で明示再フェッチする現挙動を保つ。
    - trash の restore / empty は `["trash"]` / `["today"]` を invalidate する。
    - today / focus の各 mutation は `["today"]` / `["focus"]` を invalidate する。
    - tomorrow の create / delete は `["tomorrow"]` のみ invalidate する。
    - projects / routines は各々 `["projects"]` / `["routines"]` を invalidate する。
- 非機能要件:
  - NFR-1: 既存の振る舞い（Repository への呼び出し回数・引数、invalidate 結果として再フェッチされる query、通知文言、ConflictDialog の開閉条件、オフライン時の楽観成功）を変えない。回帰しないこと。
  - NFR-2: view 層が Repository 型を import するのは「フックへ渡すための prop 型」までに限る（メソッドの直接呼び出しはしない）。`OptimisticLockError` 等の Repository 例外型・`offline-queue.ts` の関数を view が直接 import しない。
  - NFR-3: ユースケースモジュールは UI コンポーネント（`*-view.tsx` / `*-card.tsx` 等）を import しない（UI 詳細に依存しない）。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
シナリオ: ユースケースモジュールが存在する（AC-0）
  Given web/src/usecases/ ディレクトリ
  When  ディレクトリ内容を列挙する
  Then  task-usecases.ts / project-usecases.ts / routine-usecases.ts /
        trash-usecases.ts / settings-usecases.ts が存在する
```

```
シナリオ: view 層が useMutation を直接構成しない（AC-1）
  Given 対象 view（today / tomorrow / focus / projects / routines / trash /
        settings の各 *.tsx）と project-create-dialog.tsx のソース
  When  各ファイルの import / 呼び出しを静的に走査する
  Then  "@tanstack/react-query" から useMutation を import していない
  And   ソース中に useMutation( の直接呼び出しが存在しない
```

```
シナリオ: view 層が Repository / 衝突例外 / offline-queue を直接呼ばない（AC-2）
  Given 上記対象 view（today / tomorrow / focus / projects / routines / trash /
        settings の各 *.tsx）と project-create-dialog.tsx のソース
        ※ settings-view.tsx も対象に含む（Q-7 確定）
  When  import 文を静的に走査する
  Then  OptimisticLockError / ProjectConflictError / RoutineConflictError /
        RestoreConflictError / PatchConflictError を直接 import していない
        （PatchConflictError 不在は settings-view.tsx に対しても要求する）
  And   "../../offline-queue.js"（enqueue / dequeue / getAll / findEntryByKey /
        mapConflict / ConflictError）を直接 import していない
```

```
シナリオ: ユースケースが UI に依存しない（AC-3）
  Given web/src/usecases/ 配下の各 *-usecases.ts
  When  import 文を静的に走査する
  Then  ui/ 配下のコンポーネント（*-view / *-card / *-dialog 等）を import していない
```

```
シナリオ: タスク更新が従来どおり Repository を呼ぶ（AC-4 / 回帰）
  Given モック TaskRepository を注入した TodayView
  When  タスクカードの「明日にする」を操作する
  Then  repository.update が { id, ifMatch, patch: { dueDate: "tomorrow" } } で
        従来と同じ回数・引数で呼ばれる
  And   既存の today-view.test.tsx の全シナリオが緑のまま通る
```

```
シナリオ: オフライン時の楽観成功が維持される（AC-5 / 回帰）
  Given navigator.onLine === false のクライアント
  When  タスク起票を行う
  Then  Repository.create は呼ばれず、書込キューに enqueue され、UI は楽観的に成功する
  （= 既存 view テストの offline シナリオが緑のまま通る）
```

```
シナリオ: 衝突時に ConflictDialog が開く（AC-6 / 回帰）
  Given オンラインで Repository.update が OptimisticLockError を投げる状況
  When  タスク名編集 blur で update を起動する
  Then  ConflictError に変換され ConflictDialog が開く
  And   その他の通信エラーでは notifyError("通信に失敗しました") が呼ばれる
  （= 既存 ConflictDialog 関連テストが緑のまま通る）
```

```
シナリオ: tomorrow「今日にする」の invalidate / fetch 連鎖が維持される（AC-7 / 回帰）
  Given TomorrowView（モック TaskRepository）
  When  「今日にする」を操作して update が成功する
  Then  ["tomorrow"] / ["today"] / ["focus"] が invalidate され、
        observer 不在の ["today"] / ["focus"] が fetchQuery で明示再フェッチされる
  （= 既存 tomorrow-view.test.tsx の該当シナリオが緑のまま通る）
```

```
シナリオ: 設定保存が従来どおり PATCH → 再取得 → cache 反映する（AC-8 / 回帰）
  Given SettingsView（モック SettingsRepository）
  When  有効な HH:MM を入力して「変更」を押す
  Then  repository.patchSettings が呼ばれ、成功後に getSettings の再取得値が
        setQueryData(["settings"]) で反映される
  And   412 では PatchConflictError の最新値が表示される
        （412 判定は settings-usecases 層で行うが、view が受け取る最新値・表示は不変）
  （= 既存 settings-view.test.tsx の該当シナリオが緑のまま通る）
```

## 確定事項（旧・未決事項）

すべて確定済み。以下を本仕様の前提とする。

- Q-1（フック粒度）: **案B 採用**。entity ごとに 1 フックが複数 mutation を束ねて返す（`useTaskMutations(repository, deps)` → `{ create, update, delete, complete, setFocus }`）。FR-2 に反映。
- Q-2（衝突ダイアログ / 通知の注入 IF）: **案A 採用**。フック引数に `onConflict` 等のコールバックを注入し、ユースケースを UI 機構に疎結合にする。FR-4 に反映。
- Q-3（構造テストの検証範囲）: **採用**。機械検証は AC-0 / AC-1 / AC-2 / AC-3（存在 + import / useMutation 不在の静的検査）に限定する。`invalidateQueries` のキー一致までは構造テストで縛らない（回帰は既存 view テストで担保）。
- Q-4（既存 view テストの追従方針）: **採用**。既存 view テストは無改修で緑を維持する想定。ユースケース単体テストは追加せず、構造テストのみ新設する。
- Q-5（project-create-dialog の扱い）: **採用**。`project-create-dialog.tsx` をスコープに含める（`project-usecases.ts` の create フックを共有）。AC-1 / AC-2 の対象。
- Q-7（settings の 412 判定の置き場所）: **完全適合を採用**。settings の 412（`PatchConflictError`）判定も `settings-usecases.ts` 側へ移し、`settings-view.tsx` を AC-2 の import 検査対象に**含める**。view には 412 判定ロジックを残さず、`onConflict` 相当の注入で view 側の `ConflictDialog` / 通知 / 最新値表示を起動する。FR-5b に反映。
