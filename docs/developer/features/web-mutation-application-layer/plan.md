# 設計・実装計画: Web mutation のアプリケーション層への移設

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

view 内に直書きされた `useMutation` を、entity 系統ごとのユースケースモジュール（`web/src/usecases/*-usecases.ts`）へ「振る舞いを変えずに」移す。
ユースケースは Repository とサイドエフェクト用コールバック（衝突通知 / エラー通知 / 追加再フェッチ）を引数で受け取るカスタムフックを export し、内部で `useMutation` + `useQueryClient` + offline-queue 連携 + 衝突変換 + invalidate を組み立てる。
view はフックを呼んで得た mutation の `mutate` / `mutateAsync` をイベントハンドラから起動するだけになる。`useConflictDialog` / `notifyError` / `ConflictDialog` の所有は view に残し、起動経路だけユースケースに渡す。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし（エンドポイント・スキーマ無改修） |
| DB | なし |
| ドメイン | なし（`@todica/domain/*` 無改修） |
| Repository | なし（`web/src/repositories/*` のインターフェース・実装・例外型を無改修） |
| モジュール（新規） | `web/src/usecases/task-usecases.ts` / `project-usecases.ts` / `routine-usecases.ts` / `trash-usecases.ts` / `settings-usecases.ts`。共有ヘルパ `web/src/usecases/mutation-helpers.ts`（`generateId` / `safeEnqueue` / `safeDequeueByKey` の集約） |
| UI | `today-view.tsx` / `tomorrow-view.tsx` / `focus-view.tsx` / `projects-view.tsx` / `routines-view.tsx` / `trash-view.tsx` / `settings-view.tsx` / `project-create-dialog.tsx` から mutation 構成を撤去しフック呼び出しに置換 |
| テスト（新規） | 構造テスト `__tests__/structure/web-usecase-layer.test.ts` |
| テスト（追従） | 既存 view テストは原則無改修（Repository モック前提のため） |

## 設計詳細

### モジュール構成

新設するユースケースモジュールと export するフック（Q-1 確定＝entity ごと 1 フックで複数 mutation を返す案）。

| モジュール | export フック | 返す mutation | 対応 Repository メソッド |
| --- | --- | --- | --- |
| `task-usecases.ts` | `useTaskMutations(repository, deps)` | `create` / `update` / `delete` / `complete` / `setFocus` | `create` / `update` / `delete` / `complete` / `setFocus` |
| `project-usecases.ts` | `useProjectMutations(repository, deps)` | `create` / `update` / `delete` | `create` / `update` / `delete` |
| `routine-usecases.ts` | `useRoutineMutations(repository, deps)` | `create` / `update` / `delete` | `create` / `update` / `delete` |
| `trash-usecases.ts` | `useTrashMutations(repository, deps)` | `restore` / `empty` | `restore` / `empty` |
| `settings-usecases.ts` | `useSettingsMutations(repository, deps?)` | `patch` | `patchSettings` |

`deps` には view から注入するサイドエフェクトを渡す（Q-2 確定＝コールバック注入）。

```
interface MutationDeps {
  onConflict: (entry: QueueEntry, serverValue: unknown) => void;  // = conflictDialog.openDialog
  onError?: () => void;  // 既定は notifyError("通信に失敗しました")
  invalidateKeys?: ...   // view 差異の吸収（下記「invalidate の差異」）
}
```

ユースケースは `notifyError` / `QueueEntry` 型を import してよい（これらは UI コンポーネントではなく横断ユーティリティ）。`useConflictDialog` フック自体は view が呼び、戻り値の `openDialog` を `onConflict` として渡す。これにより**ユースケースは `ConflictDialog` コンポーネントや view を import しない**（NFR-3 / AC-3）。

### invalidate の差異の吸収（FR-6）

同じ entity でも view によって invalidate 先が異なるため、ユースケースは「mutation ごとの既定 invalidate キー集合」を持ちつつ、view 側から上書き / 追加できるようにする。

- task の create / update / delete / complete / setFocus の既定は `["today"]` / `["focus"]`（today-view / focus-view 相当）。
- tomorrow-view は task の create / delete を `["tomorrow"]` のみに、update / complete を `["tomorrow"]` / `["today"]` / `["focus"]` + observer 不在 query の `fetchQuery` 再フェッチに上書きする。これを `deps` の `afterSuccess`（`queryClient` を受け取り任意の invalidate / fetchQuery を行うコールバック）で表現する案を採る。
- trash の restore / empty は `["trash"]` / `["today"]`。
- project / routine / settings は各 entity の単一キー。

実装上は「ユースケース内で標準の invalidate を行い、`deps.afterSuccess?.(queryClient, result)` を追加で呼ぶ」構造にすると、tomorrow-view の `fetchQuery` 連鎖（既存 `invalidateAfterMoveToToday`）を view 側コールバックとして保持でき、振る舞いが変わらない。

### offline-queue 連携と衝突変換のユースケース内への閉じ込め（FR-3）

現在 view が個別に持つ次のヘルパ／ロジックをユースケース側（または共有ヘルパ `mutation-helpers.ts`）へ移す。

- `generateId()`（jsdom フォールバック付き UUID 生成）。
- `safeEnqueue` / `safeDequeueByKey`（IDB 不可環境を握りつぶす enqueue/dequeue ラッパー）。
- `mutationFn` の標準形:
  1. `idempotencyKey = generateId()`
  2. `safeEnqueue({ url, method, headers, body, idempotencyKey })`
  3. `navigator.onLine === false` → `return undefined`（offline 楽観成功）
  4. オンライン: Repository メソッドを呼ぶ。`OptimisticLockError` 等を `mapConflict` / `findEntryByKey` で `ConflictError` に変換。成功時 `safeDequeueByKey`。
- `onSuccess`: 標準 invalidate + `deps.afterSuccess`。
- `onError`: `ConflictError` → `deps.onConflict(entry, serverValue)`、それ以外 → `deps.onError?.() ?? notifyError("通信に失敗しました")`。

各 entity で衝突例外型が異なる（task=`OptimisticLockError`、project=`ProjectConflictError`、routine=`RoutineConflictError`、trash=`RestoreConflictError`）ため、衝突 → サーバ値抽出の関数は entity ごとのユースケースが保持する（`offline-queue.mapConflict` の `extractServer` 引数として渡す既存パターンを踏襲）。

ここで `URL` 組み立てに必要な `baseUrl` は、現在 view が `repository as { baseUrl?: string }` で読んでいる。ユースケースでも同じ手段で `repository` から読む（Repository 実装に `baseUrl` プロパティが存在する前提を踏襲。型の取り扱いは implementer 裁量）。

### settings の特例（Q-7=完全適合 確定）

`settings-view` は offline-queue を使っておらず、`patchMutation` は `repository.patchSettings` を直接呼ぶだけで、成功 / 412 のハンドリング（`getSettings` 再取得 → `setLocalSettings` → `setQueryData(["settings"])`、412 は `PatchConflictError.settings` を表示）はすべて `handleSave` 側にある。

Q-7 確定により、**412（`PatchConflictError`）判定もユースケース層へ移す**。`settings-usecases.ts` は次を所管する。

- `patchSettings` 呼び出し。
- 412 を投げる `PatchConflictError` の catch / 判定（`settings-view.tsx` には `PatchConflictError` の import / 判定を残さない）。
- 衝突検知時に view へ最新サーバ値を渡す経路（`onConflict(serverSettings)` 相当のコールバック注入、または mutation 結果としての判別ユニオン返却。実装裁量。振る舞い不変が条件）。

view 側 `handleSave` に残すのは「成功時の `getSettings` 再取得 → `setQueryData(["settings"])` への反映」と「`onConflict` で受け取った最新値の表示・`ConflictDialog` / 通知の起動」のみとし、`PatchConflictError` 型には触れない。これにより **`settings-view.tsx` を AC-2 の衝突例外型 import 検査対象に含める**（完全適合）。AC-8 の観測される振る舞い（成功時の cache 反映、412 時の最新値表示）は不変。

### 各 view の置換後の姿（処理フロー）

- today-view: `const task = useTaskMutations(repository, { onConflict, afterSuccess: invalidateTodayFocus })` を呼び、`handleToggleDueDate` 等は `task.update.mutateAsync(cmd)` を呼ぶ。view から `useMutation` / offline-queue / `OptimisticLockError` の import が消える。
- tomorrow-view: `useTaskMutations` を 2 種の `afterSuccess`（`invalidateTomorrow` / `invalidateAfterMoveToToday`）で使い分ける。現状 create/delete と update/complete で invalidate 先が異なるため、フック呼び出しを 2 つに分ける（同じ entity フックを別 deps で 2 回呼ぶ）か、`deps` を mutation 単位で渡せる形にする（実装裁量。振る舞い不変が条件）。
- focus-view: `useTaskMutations` の `complete` / `update` / `delete` を使用。
- projects-view / project-create-dialog: `useProjectMutations`。create は If-Match を持たないので衝突変換なし（現状踏襲）。
- routines-view: `useRoutineMutations`。
- trash-view: `useTrashMutations`。
- settings-view: `useSettingsMutations`（patch のみ）。412 判定はユースケース内に閉じ、view は `onConflict(serverSettings)` で受けた最新値の表示と成功時 cache 反映のみを担う。`PatchConflictError` を view から import しない。

## 重要な決定

- D-1: ユースケースは **React フック**として実装する（純関数のコマンドオブジェクトにはしない）。理由: 現実装が `useMutation` / `useQueryClient` という React フック資源に依存しており、これらをフック外に出すと TanStack Query の lifecycle を再実装する必要が生じる。`local-reset-usecase.ts` はフックでなくクラスだが、あれは React ツリー外（bootstrap）で呼ぶリセット処理であり性質が異なる。様式を無理に揃えない（D-2）。
- D-2: `local-reset-usecase.ts` の class 様式とは別様式（フック）を許容する。`usecases/` 配下に「React 用フック」と「ツリー外 class」が同居する。
- D-3: 衝突ダイアログ / エラー通知は **view から deps として注入**する（ユースケースが `useConflictDialog` / `ConflictDialog` を所有しない）。これにより AC-3（ユースケースが UI 非依存）を満たす。
- D-4: invalidate の view 間差異は **`deps.afterSuccess(queryClient, result)` コールバック**で吸収し、ユースケースには各 mutation の「標準キー」だけを持たせる。tomorrow の `fetchQuery` 連鎖は view 側コールバックに残す（既存 `invalidateAfterMoveToToday` をそのまま渡す）。
- D-5: `generateId` / `safeEnqueue` / `safeDequeueByKey` を `web/src/usecases/mutation-helpers.ts` に集約し、各ユースケースが共有する（view 重複の解消）。
- D-6: 構造テストは BL-115 / BL-116 と同じく **import 文・ソース文字列の静的走査**で行う（`__tests__/structure/web-usecase-layer.test.ts`）。AST 解析は導入しない。
- D-7: settings の 412（`PatchConflictError`）判定を **`settings-usecases.ts` へ移す**（Q-7=完全適合）。`settings-view.tsx` は AC-2 の衝突例外型 import 検査対象に含め、view から `PatchConflictError` を除去する。

## リスク / 代替案

- リスク1（既存 view テストの隠れた前提）: 一部テストが mutation の内部実装（例: `enqueue` を直接 spy する、`navigator.onLine` を差し替える）に依存している可能性。→ 対策: 移設前に対象 view テストを実行して緑を確認し、移設後も同一テストが緑であることを確認する（振る舞い不変を担保）。テストが offline-queue の関数を spy していて呼び出し位置に依存する場合のみ、テスト追従が必要になる（その場合は test-designer に差し戻す）。
- リスク2（invalidate の取りこぼし）: view 差異（特に tomorrow の `fetchQuery` 連鎖）を deps で再現し損ねると、UI の再フェッチが欠ける。→ 対策: AC-7 を回帰テストの軸に置き、tomorrow-view.test.tsx の該当シナリオを必ず緑にする。
- 代替案A（1 mutation = 1 フック）: `useUpdateTaskMutation` 等に分割。命名が明示的だが view 側の呼び出し行数が増える。Q-1 で選択。
- 代替案B（ユースケースを純関数化）: フックを使わず `createTaskUsecases(repository, queryClient)` のような工場関数にして view 側で `useMutation` を呼ぶ。これだと `useMutation` が view に残り AC-1 を満たせないため不採用。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 構造テスト（新設・自動）: `__tests__/structure/web-usecase-layer.test.ts`
  - AC-0: `web/src/usecases/{task,project,routine,trash,settings}-usecases.ts` が存在する。
  - AC-1: 対象 7 view + project-create-dialog が `useMutation` を import / 直接構成しない。
  - AC-2: 対象 view（settings-view を含む 7 view + project-create-dialog）が Repository 衝突例外型（`PatchConflictError` を含む）・`offline-queue.js` を直接 import しない。
  - AC-3: `usecases/*.ts` が `ui/` 配下を import しない。
- 回帰テスト（既存・原則無改修）: today / tomorrow / focus / projects / routines / trash / settings の各 view テスト、ConflictDialog 関連テスト、offline 楽観成功テストを緑のまま維持（AC-4〜AC-8）。
- 重点確認: tomorrow「今日にする」の invalidate / fetchQuery 連鎖（AC-7）、settings の PATCH→再取得→`setQueryData` と 412 経路（AC-8）、offline 楽観成功（AC-5）、衝突昇格（AC-6）。
