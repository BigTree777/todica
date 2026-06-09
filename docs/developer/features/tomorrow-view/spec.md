# 仕様: 「明日のタスク」独立ビュー (tomorrow-view)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-038
- 前提 feature:
  - [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) REQ-2 (3 ビューの責務分離 / tomorrow-view の責務) / REQ-3 (タスクカードのアクション最大 3) / REQ-4 (起票フォームの入力 4 要素 / 期限セレクトは置かない)
  - [`../ui-sidebar-nav/spec.md`](../ui-sidebar-nav/spec.md) REQ-4 (`/tomorrow` ルートに `TomorrowViewPlaceholder` が割り当て中)
  - [`../focus-view/spec.md`](../focus-view/spec.md) (BL-037 で確立した「placeholder を実コンポーネントに差し替える」パターン)
- 関連 BL:
  - **BL-001** (task-crud): `POST /api/v1/tasks` (起票) / `PATCH /api/v1/tasks/:id` (期限変更) / `DELETE /api/v1/tasks/:id` (論理削除) をそのまま使う.
  - **BL-002** (task-priority): 優先度順 (`priority → createdAt → id`) のサーバ側ソートをそのまま使う.
  - **BL-005** (today-view): 今日ビューの「明日へ」操作はそのまま残す (今日ビュー側を変更しない. 非ゴール).
  - **BL-007** (今日 → 明日 への期限切替): `PATCH /api/v1/tasks/:id { dueDate }` の機構を再利用. 本 BL では逆方向 (tomorrow → today) を採用する.
  - **BL-036** (ui-sidebar-nav): 本 BL は AppShell 配下の `/tomorrow` ルートを対象とし, 既存 `TomorrowViewPlaceholder` を実コンポーネントに置き換える.
  - **BL-031** / **BL-033** (web-error-handling): online 412 → `ConflictDialog` の機構をそのまま使う.
  - **BL-034** (error-notification): ネットワークエラー / 401 時の `notifyError` をそのまま使う.
  - **BL-037** (focus-view): 「placeholder を実コンポーネントに差し替える」「設計トークン無しの暫定 CSS + `TODO(BL-046)` マーカー」「mutation の枠組み」のパターンを踏襲する.
- 由来要件: FR-005 (タスクの期限を today ↔ tomorrow で切り替えられる) / FR-014 (今日 → 明日 / 明日 → 今日)
- 関連 NFR: NFR-010 (最小手数の起票) / NFR-011 (予測可能性: 「明日の準備」が可能になる) / NFR-013 (並び順の予測可能性)

## 背景 / 課題

todica v1.0.0 までで FR-005 / FR-014 は実装済みであり, 今日ビュー上で「明日へ」操作によって `dueDate=tomorrow` のタスクを生成できる. ただし以下が成立していない.

1. **明日のタスクを一覧できない**. 現状 `dueDate=tomorrow` のタスクは今日ビューから「明日へ」で押し出すのみで, 押し出した後の参照経路が存在しない (ui-redesign-foundation §「課題」項目 4). 結果, ユーザーは「明日の準備」ができない.
2. **`/tomorrow` ルートが placeholder のまま**. BL-036 で AppShell + `/tomorrow` ルートが導入され, 現在は `TomorrowViewPlaceholder` が「準備中 (BL-038)」テキストを表示しているだけ. 本 BL でこれを実コンポーネントに置き換える.
3. **FR-014 の逆方向 (tomorrow → today) の導線がない**. 今日ビューには「明日へ」ボタンがあるが, 明日タスクを「今日にする」ためには現状, 今日ビューに戻ってからではトリガーできない (そもそも tomorrow タスクは今日ビューに出ない). 明日タスクを今日へ昇格させる手段が UI 上に存在しない.
4. **サーバ側に dueDate 絞り込みクエリが無い**. 現状 `GET /api/v1/tasks` は `?trashed` パラメータのみで, dueDate 絞り込み機能が無い. クライアントで全件取得して filter する案も成立するが, NFR の責務集約方針 (server 側に並び/フィルタの正本を置く) と整合しない.

本 BL は **今日ビューを変更せず**, `/tomorrow` ルートに対応する独立した tomorrow-view コンポーネントを新設することで, ユーザーが「明日の準備」を画面 1 つで完結できるようにする. 同時にサーバ側 `GET /api/v1/tasks` に `?dueDate=today|tomorrow` クエリパラメータを追加してフィルタ責務をサーバに集約する (詳細は §「サーバ実装の補強」と plan.md).

## ゴール / 非ゴール

### ゴール

- **`/tomorrow` ルートで明日タスクを優先度順に一覧表示する**:
  - `dueDate=tomorrow` かつ `trashedAt=null` のタスクを `priority (highest → normal → later) → createdAt 昇順 → id 昇順` の決定論的ソートで一覧表示する (NFR-013).
  - 並びは今日ビュー (`/today`) と同じ規則.
- **明日タスクの起票が画面 1 つで完結する**:
  - 起票フォーム (プロジェクト / タスク名 / 優先度 / 「追加」ボタン) を画面上部に置く.
  - 期限セレクトは置かない. **dueDate は tomorrow に固定** (ビュー文脈で決まる. ui-redesign-foundation REQ-4 と整合).
- **明日タスクを「今日にする」操作で今日へ昇格できる**:
  - 各タスクカードに「今日にする」ボタンを置き, クリックで `PATCH /api/v1/tasks/:id { dueDate: "today" }` を発行する (FR-014 の逆方向).
  - 成功後はそのタスクが `/tomorrow` の一覧から消え, `/today` 側に出現する.
- **明日タスクを削除できる**:
  - 各タスクカードに「削除」ボタンを置き, クリックで `DELETE /api/v1/tasks/:id` で論理削除する (BL-012 と同じ機構. ゴミ箱に移動).
- **タスクなし時の空状態を表示する**:
  - 一覧が 0 件の時は「明日のタスクはありません」のテキストを出す.
- **サーバ API の小さな補強**:
  - `GET /api/v1/tasks` に `?dueDate=today|tomorrow` クエリパラメータを追加する (詳細 §「サーバ実装の補強」).
- **ConflictDialog / notifyError の維持**:
  - 起票 / 期限変更 / 削除のいずれかで online 412 が返った場合, BL-031 / BL-033 の機構をそのまま使い `ConflictDialog` を表示する.
  - ネットワークエラー / 401 等は BL-034 の `notifyError("通信に失敗しました")` を呼ぶ.
- **`TomorrowViewPlaceholder` の置き換え**: BL-036 で導入された `web/src/ui/tomorrow-view/tomorrow-view-placeholder.tsx` を削除し, 本 BL で実コンポーネント `web/src/ui/tomorrow-view/tomorrow-view.tsx` に置き換える. `main.tsx` の `/tomorrow` ルート割り当ても更新する.

### 非ゴール

- **`today-view.tsx` の中身を変えること**: 本 BL では今日ビューを **触らない**. 今日ビュー側の「明日へ」ボタンはそのまま残る (今日ビューの分解は後続 BL-039 〜 BL-044 の責務).
  - 理由: today-view を触ると BL-001 〜 BL-034 の既存 E2E / 単体テストへの影響が広がる. 本 BL は tomorrow-view 新設のみに専念する.
- **タスク名編集 UI の提供**: 本ビューには置かない. 編集は後続 BL (`/today` 側の分解と同時) の責務.
- **優先度切替 UI の提供** (カード上での優先度サイクル切替): 本ビューには置かない. ui-redesign-foundation REQ-3 / REQ-5 で「優先度切替はカード上の星 3 つ UI で行う」と確定しているが, 星 UI の導入自体は BL-040 の責務. 本 BL では起票時の優先度入力のみで, カード側からの切替は提供しない.
- **「現在に設定」UI の提供**: 明日タスクは focus 対象外 (BL-006 の `setFocus` は `dueDate=today` のみ受理する仕様). 本ビューに「現在に設定」ボタンを置かない.
- **「完了」アクションの提供**: 本ビューには **置かない**. 明日のタスクをまだ実行していない時点で完了させる操作は意味的に逆 (今日にしてから完了させる, あるいは今日にせず削除する, の 2 経路で十分). モックアップの「今日のタスク」UI と同じカード構造を取りつつ「完了」だけ「今日にする」に置き換える形になる (REQ-3 参照).
- **サーバ側 ListTasksFilter の `dueDate` パラメータ以外の拡張**: 本 BL では `dueDate=today|tomorrow` のみ追加する. それ以外の絞り込み軸 (projectId / priority 等) は追加しない. 既存挙動 (`?trashed=true|false|all`) は維持する.
- **デザイントークン化**: 本 BL では暫定 CSS (vanilla CSS + 直接値) で組む. BL-046 で `var(--space-md)` 等に置換する前提で `/* TODO(BL-046) */` マーカーを残す.
- **モバイル (狭幅) でのレイアウト最適化**: 本 BL はデスクトップ幅 (AppShell サイドバー常時表示) 前提で組む.
- **オフライン書込キューの新規実装**: 既存 `offline-queue.ts` の仕組みを今日ビューと同じ形で再利用する. 新しい entry 種別は追加しない.

## 要件

### 機能要件

- **REQ-1 明日タスクの一覧表示**
  - `/tomorrow` 表示時に, `dueDate=tomorrow` かつ `trashedAt=null` のタスクを以下の順序で一覧表示する:
    1. `priority` 降順 (highest → normal → later)
    2. 同優先度内は `createdAt` 昇順
    3. 同 createdAt 内は `id` 昇順
  - 並びは今日ビュー (`/today`) の `sortToday` と同じ規則 (NFR-013).
  - クライアント側で再ソートしない. サーバから返ってきた順序をそのまま表示する.
  - データ取得は新規追加する `GET /api/v1/tasks?dueDate=tomorrow` (§「サーバ実装の補強」参照).

- **REQ-2 起票フォーム (期限 = tomorrow 固定)**
  - 画面上部に起票フォームを置く. 入力要素は **4 つ** (ui-redesign-foundation REQ-4 と整合):
    1. プロジェクト選択 (現状は `<select>`. 本 BL では既存の今日ビュー実装と同じ `<select>` を使う. トグル UI 化は BL-041 の責務).
    2. タスク名 (テキスト入力, 必須).
    3. 優先度 (現状は `<select>` の 3 値. 星 UI 化は BL-040 の責務).
    4. 「追加」ボタン.
  - **期限の UI は置かない**. submit 時に `dueDate = "tomorrow"` を強制して `repository.create()` に渡す.
  - 起票成功で `["tomorrow"]` query (および `["today"]` 互換のため今日ビューの query key) を invalidate して再フェッチする.

- **REQ-3 タスクカードのアクションは「削除」「今日にする」の 2 ボタン**
  - 各タスクカードの下部に 2 ボタンを置く: 左に「削除」, 右に「今日にする」.
  - **「完了」ボタンは置かない** (非ゴール参照. 明日タスクを直接完了させる操作は本仕様では不採用).
  - キーボード操作のため `<button type="button">` で実装する.
  - **アクション最大数 3 (ui-redesign-foundation REQ-3) の規約には収まる**. 本 BL では削除 / 今日にする の 2 ボタンのみ.

- **REQ-4 「今日にする」操作 (FR-014 の逆方向)**
  - 「今日にする」ボタン押下時:
    - `repository.update({ id: task.id, ifMatch: task.version, patch: { dueDate: "today" } })` を呼ぶ.
    - サーバ側で `PATCH /api/v1/tasks/:id` が走り `task.dueDate = "today"`, `version + 1` で更新される (BL-001).
    - サーバ側で `clearFocusIfMatches` は呼ばれない (現行サーバ実装は tomorrow → today では focus 連動なし. focus は dueDate=today なタスクのみ取り得るため逆向きで焦点解除する必要が無い).
    - クライアント側で `["tomorrow"]` / `["today"]` の query を invalidate して再フェッチする.
    - 再フェッチ後, 該当タスクは `/tomorrow` の一覧から消え `/today` 側に出現する.

- **REQ-5 削除操作 (論理削除)**
  - 「削除」ボタン押下時:
    - `repository.delete({ id: task.id, ifMatch: task.version })` を呼ぶ.
    - サーバ側で `DELETE /api/v1/tasks/:id` が走り `trashedAt = now`, `trashedReason = "deleted"` で論理削除される (BL-001 / BL-012).
    - completionCount は加算されない (BL-012).
    - `clearFocusIfMatches` は呼ばれる (BL-006) が, 明日タスクは focus 対象外のため副作用は無い.
    - クライアント側で `["tomorrow"]` の query を invalidate して再フェッチする.
    - 再フェッチ後, 該当タスクは `/tomorrow` の一覧から消える. ゴミ箱 (`GET /api/v1/trash`) で参照できる (本 BL の受け入れ基準では検証しない. focus-view の流儀でカード非表示で十分).

- **REQ-6 タスクなし時の空状態**
  - 一覧 (REQ-1 の結果) が 0 件の時, タスクカードの代わりに「明日のタスクはありません」のテキストを表示する.
  - 起票フォーム自体は空状態でも表示し続ける (起票が画面 1 つで完結する要件のため).

- **REQ-7 ConflictDialog / notifyError の維持**
  - 起票 (create) / 期限変更 (update) / 削除 (delete) のいずれかで online 412 (`OptimisticLockError`) が返った場合, BL-031 / BL-033 で導入された機構 (`findEntryByKey` + `ConflictError` 変換 + `useConflictDialog`) をそのまま流用して `ConflictDialog` を表示する.
  - ネットワークエラー / 401 等は BL-034 の `notifyError("通信に失敗しました")` を呼ぶ.
  - offline 時 (`!navigator.onLine`) は今日ビュー (`today-view.tsx`) と同じ書込キュー (`offline-queue.ts`) に enqueue し, 楽観的に成功を返す.

### サーバ実装の補強

本 BL は **サーバ API の小さな補強** を含む. 詳細な実装手順は plan.md に置く. spec 段階で確定するのは方針 (採用案) と理由のみ.

**採用案 (A) サーバ側に `?dueDate=today|tomorrow` クエリパラメータを追加する**.

- **却下案 (B)**: クライアント側で `GET /api/v1/tasks` (全件) を取得し client filter する案. 採用しない.
- **採用理由**:
  - **転送量**: tomorrow タスクは個人利用前提で少数 (数件 〜 数十件) だが, 全 active タスクを取得すると今日タスク + 明日タスクの混在分が常に送られる. 不要な転送量を避けたい.
  - **責務集約**: 並び順 (priority → createdAt → id) はサーバ側 `sortToday` で正本化済み (BL-005 plan D-003). フィルタも同じくサーバ側に責務を集約することで, 「タスクの並びと絞り込み」の正本を 1 箇所に閉じ込められる.
  - **JS フィルタ削減**: クライアントで `tasks.filter(t => t.dueDate === "tomorrow")` を書かない. ロジックがサーバ側に集中する.
  - **既存パターンとの整合**: `?trashed=true|false|all` と同じ形式で追加でき, 既存実装 (`ListTasksFilter`) の自然な拡張に収まる.
  - **互換性**: パラメータ未指定時は既存挙動 (全 dueDate を返す) を維持する.

**補強の範囲 (plan.md §「サーバ補強の手順」で詳述)**:

- `server/src/data/task-repository.ts` の `ListTasksFilter` 型に `dueDate?: "today" | "tomorrow"` を追加.
- `server/src/infra/persistence/drizzle/task-repository.ts` の `list()` の where 句に `dueDate` フィルタを反映.
- `server/src/app.ts` の `GET /api/v1/tasks` で `c.req.query("dueDate")` を読み, `today` / `tomorrow` のみ受理して `taskRepository.list({ trashed, dueDate })` に渡す.
- 既存サーバ統合テスト (`server/__tests__/integration/tasks.test.ts`) に `dueDate` フィルタの green シナリオを 1 つ以上追加.
- **サーバの他エンドポイントは変えない** (`GET /api/v1/today` / `POST /api/v1/tasks` / `PATCH /api/v1/tasks/:id` / `DELETE /api/v1/tasks/:id` は無改修).

### 非機能要件

- **NFR-011 (予測可能性) との整合**:
  - 「明日の準備」が画面 1 つで完結することによりユーザーの作業可視性が上がる.
  - 並びはサーバ側 `priority → createdAt → id` の決定論的ソートを踏襲.
- **NFR-010 (最小手数の起票) との整合**:
  - 起票フォームの必須入力は「タスク名」のみ. プロジェクト / 優先度は既定値で送れる. 期限は UI に出さない (dueDate=tomorrow 固定).
- **NFR-001 (単一ワークフロー強制) との整合**:
  - 並び順を変える UI / API パラメータを増やさない (現状維持).
  - tomorrow-view 単独のアクションは 3 つ (起票 / 削除 / 今日にする) のみ. ビュー切替やカスタマイズは導入しない.
- **NFR-013 (並び順の予測可能性) との整合**:
  - サーバ側 `priority → createdAt → id` をそのまま使う. クライアント側で再ソートしない.
- **アクセシビリティ**:
  - `<section aria-label="明日のタスク">` でランドマーク化する (AppShell が `<main>` を提供しているため).
  - 起票フォームには `aria-label="明日のタスク起票フォーム"`, 一覧には `aria-label="明日のタスク一覧"` を付ける.
  - BL-029 の axe 検査が引き続き violations 0 を維持すること.
  - 「削除」「今日にする」「追加」ボタンはキーボード Tab + Enter で操作可能.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

### 一覧表示 (REQ-1)

```
シナリオ: /tomorrow 表示時に dueDate=tomorrow のタスクのみが優先度順に列挙される
  Given タスク A (dueDate="tomorrow", priority="normal",  createdAt=t1)
  And   タスク B (dueDate="tomorrow", priority="highest", createdAt=t2)
  And   タスク C (dueDate="today",    priority="highest", createdAt=t0)
  And   タスク D (dueDate="tomorrow", priority="later",   createdAt=t3, trashedAt=null)
  And   タスク E (dueDate="tomorrow", priority="normal",  createdAt=t4, trashedAt=set)
  When  Web クライアントを /tomorrow で表示する
  Then  一覧に B, A, D の 3 件がこの順 (priority 降順 → createdAt 昇順) で出る
  And   C (今日) は出ない
  And   E (ゴミ箱) は出ない
```

```
シナリオ: クライアントは GET /api/v1/tasks?dueDate=tomorrow を呼ぶ
  Given /tomorrow を表示する
  When  HttpTaskRepository.list({ dueDate: "tomorrow" }) (または同等の API) が呼ばれる
  Then  サーバへの request URL に "?dueDate=tomorrow" が含まれる
  And   サーバから返ったタスク配列のみで一覧が描画される (クライアントで再ソートしない)
```

### 起票 (REQ-2)

```
シナリオ: 起票フォームに「期限」UI が存在しない
  Given /tomorrow を表示している
  When  起票フォーム内の入力要素を列挙する
  Then  「タスク名」「プロジェクト」「優先度」「追加」の 4 要素のみが存在する
  And   「期限」「dueDate」「明日」「today」「tomorrow」の入力 (label / select / input) は存在しない
```

```
シナリオ: 起票するとそのタスクは dueDate=tomorrow で作成され /tomorrow の一覧に出る
  Given /tomorrow を表示し, タスク一覧は空である
  When  起票フォームでタスク名「明日の買い物」を入力し「追加」を押す
  Then  repository.create が { name: "明日の買い物", dueDate: "tomorrow", ... } で 1 回呼ばれる
  And   サーバへの POST /api/v1/tasks の body に dueDate: "tomorrow" が含まれる
  And   再フェッチ後の /tomorrow に「明日の買い物」のカードが表示される
```

### 「今日にする」 (REQ-4 / FR-014 逆方向)

```
シナリオ: 「今日にする」で tomorrow タスクが today へ移送される
  Given /tomorrow に タスク A (dueDate="tomorrow", version=1) が表示されている
  When  A の「今日にする」ボタンを押す
  Then  repository.update が { id: A.id, ifMatch: 1, patch: { dueDate: "today" } } で 1 回呼ばれる
  And   サーバの PATCH /api/v1/tasks/{A.id} が If-Match: 1, body: {"dueDate":"today"} で発行される
  And   /tomorrow の query が invalidate されて再フェッチされる
  And   /today の query が invalidate されて再フェッチされる
  And   再フェッチ後の /tomorrow には A が表示されない
  And   /today に遷移すると A が一覧に出ている
```

### 削除 (REQ-5)

```
シナリオ: 「削除」で tomorrow タスクが論理削除される
  Given /tomorrow に タスク A (version=1) が表示されている
  When  A の「削除」ボタンを押す
  Then  repository.delete が { id: A.id, ifMatch: 1 } で 1 回呼ばれる
  And   サーバの DELETE /api/v1/tasks/{A.id} が If-Match: 1 で発行される
  And   サーバ側で A が trashedReason = "deleted" でゴミ箱送りされる (BL-001)
  And   completionCount は加算されない (BL-012)
  And   再フェッチ後の /tomorrow には A が表示されない
  ※ ゴミ箱の中身を検証する必要はない (focus-view の流儀でカード非表示で十分).
```

### アクション数の規約 (REQ-3)

```
シナリオ: tomorrow-view のタスクカードに置かれるアクションは「削除」「今日にする」の 2 つのみ
  Given /tomorrow に タスク A が表示されている
  When  A のカード内のボタン要素を列挙する
  Then  「削除」「今日にする」の 2 つだけが存在する
  And   「完了」「明日にする」「明日へ」「優先度切替」「編集」「現在に設定」のボタンは存在しない
```

### 空状態 (REQ-6)

```
シナリオ: 明日タスクが 0 件の時は空状態テキストが出る
  Given dueDate=tomorrow のタスクが 0 件である
  When  /tomorrow を表示する
  Then  「明日のタスクはありません」が表示される
  And   起票フォーム (タスク名 / プロジェクト / 優先度 / 追加ボタン) は引き続き表示されている
```

### ConflictDialog (REQ-7 / BL-031)

```
シナリオ: 「今日にする」操作で online 412 が返ったとき ConflictDialog が開く
  Given /tomorrow にタスク A (version=1) が表示されている
  And   別タブで A.version が 2 に進んでいる
  When  /tomorrow で A の「今日にする」を押す
  Then  サーバが 412 を返す
  And   HttpTaskRepository が OptimisticLockError を throw する
  And   tomorrow-view が findEntryByKey で queue 内の entry を引き ConflictError に変換する
  And   ConflictDialog が開いてサーバの現行値を表示する
```

```
シナリオ: 「削除」操作で online 412 が返ったとき ConflictDialog が開く
  Given /tomorrow にタスク A (version=1) が表示されている
  And   別タブで A.version が 2 に進んでいる
  When  /tomorrow で A の「削除」を押す
  Then  ConflictDialog が開いてサーバの現行値を表示する
```

### 通信エラー (REQ-7 / BL-034)

```
シナリオ: ネットワークエラー時は ErrorNotification の「通信に失敗しました」が表示される
  Given /tomorrow にタスク A が表示されている
  When  「今日にする」 (または「削除」 / 「追加」) を押し fetch が失敗する (401 / ネットワークエラー)
  Then  notifyError("通信に失敗しました") が呼ばれる
  And   既存の <ErrorNotification /> バナーに「通信に失敗しました」が表示される
```

### サーバ API の補強 (§「サーバ実装の補強」)

```
シナリオ: GET /api/v1/tasks?dueDate=tomorrow が dueDate=tomorrow のみを返す
  Given タスク A (dueDate="today"), B (dueDate="tomorrow") を起票済み
  When  サーバの GET /api/v1/tasks?dueDate=tomorrow を呼ぶ
  Then  応答の tasks 配列には B のみ含まれる
  And   並びは priority → createdAt → id のサーバ側ソートに従う (既存挙動の踏襲)
```

```
シナリオ: GET /api/v1/tasks?dueDate=today が dueDate=today のみを返す
  Given タスク A (dueDate="today"), B (dueDate="tomorrow") を起票済み
  When  サーバの GET /api/v1/tasks?dueDate=today を呼ぶ
  Then  応答の tasks 配列には A のみ含まれる
```

```
シナリオ: dueDate パラメータ未指定時は既存挙動 (両方の dueDate を返す) を維持する
  Given タスク A (dueDate="today"), B (dueDate="tomorrow") を起票済み
  When  サーバの GET /api/v1/tasks (dueDate 指定なし) を呼ぶ
  Then  応答の tasks 配列には A, B の両方が含まれる
  ※ 既存の trashed フィルタ挙動 (既定 trashed="false") は維持する.
```

```
シナリオ: dueDate に不正値を渡しても 400 にせず無視する (互換性維持)
  Given dueDate=tomorrow / dueDate=today 以外の値 (例: "yesterday") を ?dueDate に渡す
  When  サーバの GET /api/v1/tasks?dueDate=yesterday を呼ぶ
  Then  既存挙動 (dueDate 絞り込みなし) と同じ応答が返る
  ※ 既存の trashed パラメータの寛容なバリデーション挙動 (不正値は既定値にフォールバック) と整合.
```

### 既存 view の不変条件 (非ゴール担保)

```
シナリオ: today-view.tsx の挙動は本 BL では変更されない
  Given /today を表示する
  When  画面を観察する
  Then  既存の起票フォーム (タスク名 / プロジェクト / 期限 / 優先度 の 4 入力 + 追加) が引き続き表示される
  And   タスクカードの 6 ボタン (優先度切替 / 編集 / 明日へ / 完了 / 削除 / 現在に設定) が引き続き存在する
  And   「現在のタスク」セクション (BL-006) が引き続き表示される
  ※ 削除 / 簡素化は後続 BL-039 〜 BL-044 で行う.
```

```
シナリオ: AppShell の /tomorrow ルートに tomorrow-view が割り当て済みであり, placeholder は削除されている
  Given main.tsx の Routes 定義を参照する
  When  /tomorrow の element を確認する
  Then  <TomorrowView /> (新規) が割り当てられている
  And   <TomorrowViewPlaceholder /> は import されていない (削除済み)
  And   ファイル web/src/ui/tomorrow-view/tomorrow-view-placeholder.tsx は存在しない
```

## 未決事項 / 確認待ち

- **U-001 query key の命名**:
  - 一覧取得の query key を `["tasks", "tomorrow"]` か `["tomorrow"]` か.
  - **保守側デフォルト案**: `["tomorrow"]`. 今日ビューが `["today"]` を使っているのと対称にする. invalidate / cache 操作の見通しがよい.
- **U-002 起票成功時に invalidate する key**:
  - `["tomorrow"]` のみで十分か, `["today"]` も invalidate するか.
  - **保守側デフォルト案**: `["tomorrow"]` のみ. 起票は dueDate=tomorrow 固定で `["today"]` に影響しない.
- **U-003 「今日にする」成功時に invalidate する key**:
  - `["tomorrow"]` だけだと, 今日ビューに遷移したときに新タスクが反映されない可能性がある.
  - **保守側デフォルト案**: `["tomorrow"]` / `["today"]` / `["focus"]` の 3 つを invalidate する. tomorrow → today で focus 候補が新たに生まれる可能性があるため (BL-005 の nextTaskId 計算と暗黙フォールバックに影響).
- **U-004 「削除」成功時に invalidate する key**:
  - **保守側デフォルト案**: `["tomorrow"]` のみ. 明日タスクは focus 対象外 (`clearFocusIfMatches` の副作用なし) のため `["focus"]` の invalidate は不要だが, 念のため invalidate しても害は無い.
- **U-005 起票フォームの初期値 (プロジェクト / 優先度)**:
  - 初期値をどうするか. 今日ビューは projectId="" (未分類) / priority="normal" / dueDate="today".
  - **保守側デフォルト案**: 今日ビューと揃える. projectId="" (未分類) / priority="normal". dueDate は UI に出さない (tomorrow 固定).
- **U-006 タスクカード上のプロジェクト名 / 優先度の表示**:
  - 今日ビューはタスクカード行に project 名と「[優先度: ...]」を出している.
  - **保守側デフォルト案**: 今日ビューと揃える. project 名 + 優先度ラベルを表示する. ただし優先度切替ボタンは置かない (REQ-3 / 非ゴール).
- **U-007 routine 由来タスク (origin="routine") の扱い**:
  - 既存 BL-017 で routine 由来タスクは dueDate=today で自動生成され, 「明日へ」ボタンも非表示にしている (今日ビュー側).
  - 仕様上 routine 由来タスクは dueDate=tomorrow になり得るか?
  - **現状の挙動**: routine タスクは dueDate=today で生成されるが, ユーザーが手動で `PATCH dueDate=tomorrow` すれば tomorrow になり得る. 本 BL は dueDate=tomorrow なら origin に関わらず表示する.
  - **保守側デフォルト案**: routine 由来タスクも区別なく表示する. 「今日にする」ボタンは origin に関わらず有効化する (今日ビュー側で routine タスクに「明日へ」を出さない制限は本 BL のスコープ外).
- **U-008 起票時の dueDate の二重指定をサーバが許容するか**:
  - クライアントが `dueDate: "tomorrow"` を明示送信する形になる. `POST /api/v1/tasks` は既に dueDate 受理済み (BL-001) なので問題なし.
  - **保守側デフォルト案**: 明示送信する. 互換のため.
- **U-009 ConflictDialog 表示後の挙動**:
  - 今日ビューと同じく「サーバの現行値を受け入れる」「サーバの現行値で再送する」の 2 経路を用意する.
  - **保守側デフォルト案**: 今日ビューと同じ `useConflictDialog` をそのまま使う.
- **U-010 サーバ側 dueDate パラメータの不正値ハンドリング**:
  - 不正値時に 400 を返すか, 無視 (= フィルタなし) するか.
  - **保守側デフォルト案**: 既存 `trashed` パラメータの寛容なバリデーション (`"true" | "false" | "all"` 以外は既定値) と整合させ, 不正値は無視 (= 全件返す) とする. クライアントは常に "today" / "tomorrow" のいずれかを送る前提.
- **U-011 デザイントークン化のタイミング**:
  - 本 BL の暫定 CSS を BL-046 でトークン化する前提で `/* TODO(BL-046) */` マーカーを残す (focus-view と同じ手法).
  - **保守側デフォルト案**: 暫定値 (`border-radius: 16px`, `font-size: 24px` 等) を直書きし `/* TODO(BL-046): --xxx */` を付ける.
