# 仕様: 明日ビューのタスク優先度変更 (tomorrow-task-priority)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-142
- 前提 feature:
  - [`../tomorrow-view/spec.md`](../tomorrow-view/spec.md): `/tomorrow` 独立ビューの本実装 (起票 / 削除 / 今日にする / 空状態 / ConflictDialog / offline)。**本 feature は tomorrow-view/spec.md の「優先度切替 UI の提供」非ゴール、および `showPriority=false` の記述を上書きする**（§「先行 spec との関係」参照）。
  - [`../priority-star-ui/spec.md`](../priority-star-ui/spec.md): 星 3 つ UI `<PriorityStars />` の本体仕様 (radiogroup / 同値クリック no-op / later=1 / normal=2 / highest=3)。本 feature はこの部品をそのまま再利用する。
  - [`../today-view/spec.md`](../today-view/spec.md): 今日ビューのカード優先度変更 (`handleSetPriority` → `updateMutation` → `PATCH priority`)。本 feature はこの機構を明日ビューへ横展開する。
- 関連 BL:
  - **BL-040** (priority-star-ui): カード上の星 3 つ UI による優先度切替機構。
  - **BL-141** (task-sort tiebreak): 明日ビューの並び順は `priority → createdAt 降順 → id 昇順`。優先度変更後は再フェッチで並びが更新される。
  - **BL-108** (task-card-project-change): 既存 tomorrow-view の update 系ハンドラ (name / projectId) の実装パターン。
- 由来要件: FR-002 (タスクに優先度を設定・変更できる) / NFR-013 (並び順の予測可能性)

## 背景 / 課題

`/tomorrow`（明日ビュー）の各タスクカードは現状、優先度の**表示も変更もできない**。`web/src/ui/tomorrow-view/tomorrow-view.tsx` がリストの `<TaskCard>` を `showPriority={false}` かつ `onSetPriority` 未配線でレンダリングしているためである。

一方、今日ビュー (`/today`) には優先度変更が完全実装済みで、`<TaskCard>` は `showPriority` / `onSetPriority` の props を既にサポートしている。明日ビューだけが優先度変更を欠く状態は、ビュー間の一貫性を損ない、「明日の準備」段階で優先度を調整したいというユーザー要求（起票後に重要度を見直す）を満たせない。

明日ビューの起票フォームには既に優先度入力（星 3 つ）がある。起票時に優先度を決められるのにカード上で後から変更できないのは非対称であり、本 feature でカード側の変更手段を追加して一貫させる。

## ゴール / 非ゴール

### ゴール

- **明日タスクカードでの優先度表示**: `/tomorrow` の各タスクカードに、そのタスクの現在の優先度を星 3 つ UI (`<PriorityStars />`) で表示する。
- **明日タスクカードでの優先度変更**: 星をクリックすると、そのタスクの優先度が変更される（`PATCH /api/v1/tasks/:id { priority }`）。
- **同値クリックは no-op**: 現在の優先度と同じ星をクリックした場合、PATCH を発行しない。
- **並びの追従**: 優先度変更後、明日ビューの一覧が `priority → createdAt 降順 → id 昇順` (BL-141) で再ソートされて表示される。
- **既存エラー経路の共有**: 優先度変更でも、既存の update 系 mutation を流用して ConflictDialog（online 412）・notifyError（通信失敗）・offline 書込キューの経路を共有する。

### 非ゴール

- **invalidate 対象の拡張**: 優先度変更は明日ビューの並び替えにのみ影響する。`["today"]` / `["focus"]` の再取得は行わない（§「重要な設計判断」D-002 で確定）。
- **`<PriorityStars />` 本体の変更**: 星 UI のマッピング・ARIA・同値 no-op は BL-040 で確定済み。本 feature では再利用のみで改修しない。
- **今日ビュー (`today-view.tsx`) の変更**: 今日ビューは既に優先度変更を持つ。触らない。
- **サーバ / API の変更**: `PATCH /api/v1/tasks/:id { priority }` は受理済み。サーバ改修はない。
- **起票フォームの優先度入力の変更**: 明日ビューの起票フォームには既に優先度入力がある。触らない。
- **キーボード矢印 / 数字キーでの優先度操作**: `<PriorityStars />` の初版仕様（BL-040 D-006）どおり、`<button>` 標準の Tab + Enter / Space のみ。

## 先行 spec との関係（doc 追従方針）

- [`../tomorrow-view/spec.md`](../tomorrow-view/spec.md) は「優先度切替 UI の提供」を**非ゴール**とし、リストの `<TaskCard>` を `showPriority=false` でレンダリングすると定めている。この記述は BL-038 時点の当時仕様の記録である。
- **本 feature の spec が明日ビューの優先度に関する現行仕様の正本となる**。tomorrow-view/spec.md（過去記録）は履歴として据え置き、書き換えない。
- 現行状態を追従するのは `architecture/` とコードであり、features/ 配下の過去記録は履歴として維持する（この扱いは tasks.md に明記する）。

## 要件

### 機能要件

- **REQ-1 優先度の表示**
  - `/tomorrow` の各タスクカードに、そのタスクの現在の優先度を `<PriorityStars value={task.priority} />` として表示する。
  - 表示は今日ビューのカードと同一部品・同一マッピング（later=星1 / normal=星2 / highest=星3）を用いる。
  - `<TaskCard>` に `showPriority`（true）と `onSetPriority` を配線することで実現する。

- **REQ-2 優先度の変更**
  - カードの星をクリックすると、`repository.update({ id: task.id, ifMatch: task.version, patch: { priority: next } })` を呼ぶ。
  - `next` はクリックされた星に対応する優先度（`<PriorityStars />` が算出して `onChange` で返す）。
  - サーバ側で `PATCH /api/v1/tasks/:id` が走り `task.priority = next`, `version + 1` で更新される。

- **REQ-3 同値クリックの no-op**
  - 現在の優先度と同じ星をクリックした場合、`repository.update` を呼ばない。
  - `<PriorityStars />` 側の同値 no-op（BL-040）に加え、ハンドラ側でも `task.priority === next` の二重ガードを置く（today-view `handleSetPriority` と同型）。

- **REQ-4 変更後の並び追従**
  - 優先度変更成功後、明日ビューの `["tomorrow"]` クエリを invalidate して再フェッチし、`priority → createdAt 降順 → id 昇順`（BL-141）のサーバ側ソート結果で一覧を再描画する。
  - クライアント側で再ソートしない（サーバから返った順序をそのまま表示）。

- **REQ-5 invalidate 対象は `["tomorrow"]` のみ**
  - 優先度変更成功時に invalidate / 再フェッチするのは `["tomorrow"]` のみとする。
  - `["today"]` / `["focus"]` は invalidate せず、`fetchTodayAndFocus` 相当の明示再フェッチも行わない。
  - 根拠: 明日タスク（dueDate=tomorrow）の優先度変更は dueDate を変えないため、今日一覧（`repository.today()` は dueDate=today のみ返す）にも focus（focus は dueDate=today のタスクのみ取り得る）にも影響しない。過剰 invalidate / 過剰 fetch を避ける。

- **REQ-6 エラー / オフライン経路の共有**
  - 優先度変更で online 412（`OptimisticLockError`）が返った場合、既存機構で `ConflictError` に変換し `ConflictDialog` を開く。
  - ネットワークエラー / 401 等では `notifyError("通信に失敗しました")` を呼ぶ。
  - offline 時は既存の書込キュー（`offline-queue.ts`）に enqueue し楽観的に成功を返す。
  - これらは本 feature 固有の新規実装を持たず、既存 update 系 mutation の経路をそのまま共有する。

### 非機能要件

- **一貫性**: 明日ビューのカード優先度 UI は今日ビューと同一部品・同一挙動（同値 no-op / ARIA）とし、ビュー間の学習コストを増やさない。
- **アクセシビリティ**: `<PriorityStars />` の既存 ARIA（radiogroup + radio、現在値の aria-label 読み上げ）を維持する。BL-029 の axe 検査が violations 0 を維持すること。
- **最小手数**: 優先度変更は星 1 クリックで完結する（確認ダイアログ等を挟まない）。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。
> テストは repo ルートから `npx vitest run` で実行する。対象ファイル: `web/__tests__/tomorrow-view.test.tsx`（既存に追記）。mock repository は `listMock`（`["tomorrow"]` queryFn）/ `todayMock`（`["today"]`）/ `getFocusMock`（`["focus"]`）を公開しており、呼出回数で invalidate / 非 invalidate を観察できる。

### 優先度の表示 (REQ-1)

```
シナリオ: 明日ビューの各タスクカードに優先度星が表示される
  Given /tomorrow に タスク A (dueDate="tomorrow", priority="normal") が表示されている
  When  A のカード内を観察する
  Then  カード内に role="radiogroup"（優先度星 UI）が 1 つ存在する
  And   その中に role="radio" の星 button が 3 つ存在する
  And   現在値 normal に対応して星 2 つが点灯 (data-lit="true") している
```

```
シナリオ: 優先度星は起票フォームとカードで別インスタンスとして共存する
  Given /tomorrow を ?create=1 で開き, タスク A が一覧に表示されている
  When  起票フォームとカードの radiogroup を数える
  Then  起票フォームの radiogroup と カード A の radiogroup が別要素として存在する
  ※ id 衝突は <PriorityStars idPrefix> で回避される (カードは task-<id> prefix)。
```

### 優先度の変更 (REQ-2)

```
シナリオ: カードの星クリックで PATCH priority が発行される
  Given /tomorrow に タスク A (dueDate="tomorrow", priority="normal", version=1) が表示されている
  When  A のカードの 3 番目の星 (highest) をクリックする
  Then  repository.update が { id: A.id, ifMatch: 1, patch: { priority: "highest" } } で 1 回呼ばれる
  And   patch に dueDate / name / projectId は含まれない
  And   サーバの PATCH /api/v1/tasks/{A.id} が If-Match: 1, body: {"priority":"highest"} で発行される
```

### 同値クリックの no-op (REQ-3)

```
シナリオ: 現在値と同じ星をクリックしても PATCH は発行されない
  Given /tomorrow に タスク A (priority="normal") が表示されている
  When  A のカードの 2 番目の星 (normal = 現在値) をクリックする
  Then  repository.update は呼ばれない
```

### 変更後の並び追従 (REQ-4)

```
シナリオ: 優先度変更後に一覧が再フェッチされ並びが更新される
  Given /tomorrow に A (priority="later"), B (priority="later") が
        BL-141 の順 (createdAt 降順) で並んで表示されている
  When  A の 3 番目の星 (highest) をクリックし update が成功する
  Then  ["tomorrow"] が invalidate され list (listMock) が再フェッチされる
  And   再フェッチ後の一覧はサーバ側ソート (priority → createdAt 降順 → id 昇順) の順で描画される
  And   クライアント側での再ソートは行われない
```

### invalidate 対象は tomorrow のみ (REQ-5)

```
シナリオ: 優先度変更では today / focus を再フェッチしない
  Given /tomorrow に タスク A (dueDate="tomorrow", version=1) が表示されている
  And   マウント直後の todayMock / getFocusMock の呼出回数を記録する
  When  A の星をクリックして優先度を変更し update が成功する
  Then  listMock (["tomorrow"] の queryFn) の呼出回数が増える
  And   todayMock (["today"] の queryFn) の呼出回数は増えない
  And   getFocusMock (["focus"] の queryFn) の呼出回数は増えない
  ※ 「今日にする」操作 (D-004 で ["tomorrow"]/["today"]/["focus"] を invalidate) との差分がこのシナリオの要点。
```

### エラー / オフライン経路 (REQ-6)

```
シナリオ: 優先度変更で online 412 が返ったとき ConflictDialog が開く
  Given /tomorrow に タスク A (version=1) が表示されている
  And   別タブで A.version が 2 に進んでいる
  When  /tomorrow で A の星をクリックして優先度を変更する
  Then  サーバが 412 を返す
  And   OptimisticLockError が ConflictError に変換される
  And   ConflictDialog が開いてサーバの現行値を表示する
```

```
シナリオ: 優先度変更でネットワークエラー時は「通信に失敗しました」が表示される
  Given /tomorrow に タスク A が表示されている
  When  A の星をクリックし fetch が失敗する (401 / ネットワークエラー)
  Then  notifyError("通信に失敗しました") が呼ばれる
  And   <ErrorNotification /> バナーに「通信に失敗しました」が表示される
```

### 既存の不変条件 (回帰防止)

```
シナリオ: 「今日にする」の invalidate 挙動は本 feature で変化しない
  Given /tomorrow に タスク A (dueDate="tomorrow", version=1) が表示されている
  When  A の「今日にする」ボタンを押す
  Then  従来どおり ["tomorrow"] / ["today"] / ["focus"] が invalidate され
        list / today / getFocus が再フェッチされる (tomorrow-view D-004 の踏襲)
  ※ 優先度変更 (["tomorrow"] のみ) と「今日にする」(3 key) の invalidate 差分が保たれること。
```

```
シナリオ: カードのアクションボタン構成は本 feature で変化しない
  Given /tomorrow に タスク A が表示されている
  When  A のカードのアクションボタンを列挙する
  Then  「削除」「今日にする」「完了」が引き続き存在する
  ※ 優先度星は状態系コントロールでありアクションボタン数のカウント外 (today-view と同じ扱い)。
```

## 未決事項 / 確認待ち

- **U-001 ハンドラの mutate 呼び分け（mutate か mutateAsync か）**:
  - today-view の `handleSetPriority` は `await updateMutation.mutateAsync(cmd)` を try/catch なしで呼ぶ。一方、tomorrow-view の既存 update 系（`handleNameBlur` / `handleChangeProject`）は `mutateAsync` を try/catch で包んで unhandled rejection を防いでいる。
  - **採用案**: tomorrow-view の既存流儀に合わせ、`mutateAsync` を try/catch で包む（onError で通知済みのため catch は空でよい）。today-view と挙動は同値（通知・ConflictDialog は onError 経由）で、明日ビュー内の一貫性を優先する。plan.md D-003 で確定。
- **U-002 優先度変更に使う update mutation の系統**:
  - tomorrow-view には useTaskMutations が 2 系統ある。create/delete 系（`invalidateKeys: [["tomorrow"]]`）と、update/complete 系（`invalidateKeys: [["tomorrow"],["today"],["focus"]]` + `afterSuccess: fetchTodayAndFocus`）。
  - **採用案**: 優先度変更は `["tomorrow"]` のみ invalidate する系統（create/delete と同じ設定）の `update` を使う。plan.md D-002 で確定。
</content>
