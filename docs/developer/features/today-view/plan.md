# 設計・実装計画: 今日ビュー（入口・優先度順表示・"次の 1 つ" の一意化）

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md), API は [`../../architecture/api/overview.md`](../../architecture/api/overview.md) を参照.

## 方針概要

- **サーバ側に専用エンドポイント `/api/v1/today` を新設**し, 「`dueDate = "today"` かつ `trashedAt = null` のタスクを本仕様の並び順で返す + 並びの先頭を `nextTaskId` で明示する」レスポンスを返す. クライアントが知っているべき仕様（絞り込み・並び順）をサーバ側に閉じ込めることで, 別クライアント（Android サーバモード）でも同じ意味論を保証する.
- **並び順の本仕様は `priority → createdAt → id`** に統一し, BL-001 の暫定 3 段ソート（`dueDate → priority → createdAt`）を恒久的に置き換える. `dueDate` キーは今日ビューでは不要（today のみで構成）, 一覧 API でも振る舞いを統一して矛盾を避ける（D-003 参照）.
- **UI 側 `TodayView` の責務を本仕様に揃える**. 現状の「`/api/v1/tasks` 全件 + クライアント側 3 段ソート」を「`/api/v1/today` 取得 + サーバ並びをそのまま表示」に置き換える. 既存のタスク行操作（編集・期限切替・完了・削除・優先度変更）は維持し, 各操作の成功時に今日ビューを再フェッチする.
- **FocusSelection（BL-006）は読み書きしない**. 本機能の責務は「並びの先頭が一意に決まり, 取得結果に `nextTaskId` として明示される」までで, それを使って "現在のタスク" を選ぶ・繰り上げる操作は BL-006 が担う.

## 既存実装の調査結果

| 項目 | 暫定実装（BL-001 で導入） | 本実装で変更 |
| --- | --- | --- |
| 表示対象 | `dueDate = "today"` と `"tomorrow"` の **両方** を表示 | `dueDate = "today"` のみに絞る |
| 並び順 | `dueDate (today→tomorrow) → priority → createdAt` の 3 段 | `priority → createdAt → id` の 3 段（`dueDate` を外す） |
| ソート実行場所 | クライアント側 `web/src/ui/today-view/today-view.tsx` の `sortTasks` 関数 + サーバ側 `server/src/app.ts` の `sortTasks` 関数（二重実装） | サーバ側に統一. クライアントはサーバ並びをそのまま使う |
| データ取得 API | `GET /api/v1/tasks?trashed=false` | `GET /api/v1/today` 新設. `GET /api/v1/tasks` は依然存在するがソート規則を本仕様に合わせて統一（D-003） |
| 「次の 1 つ」 | 暗黙（並びの先頭. 概念として未明示） | レスポンスに `nextTaskId` プロパティで明示（spec.md U-004 案 (b)） |
| `/today` ルーティング | サーバ側未実装. openapi.yaml に骨格のみ. クライアント側 `/` ルートが TodayView | `/api/v1/today` を実装. クライアントは引き続き `/` ルートを TodayView に紐付ける（FR-010） |

### 暫定実装の所在

- サーバ: `server/src/app.ts` L182-192（`GET /api/v1/tasks`）, L405-419（`sortTasks`）.
- クライアント: `web/src/ui/today-view/today-view.tsx` L39-50（`sortTasks` / `PRIORITY_ORDER` / `DUE_DATE_ORDER`）, L73-82（一覧取得）, L178（`sorted = sortTasks(tasks)`）.
- リポジトリ: `web/src/repositories/task-repository.ts` L134-144（`list()` が `/api/v1/tasks` を叩く）.
- テスト: `web/__tests__/today-view.test.tsx`（NFR-013 の確認テストは task-priority で追加済. dueDate 込みの並び確認はない）.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 新規エンドポイント `GET /api/v1/today` を実装. レスポンス: `{ tasks: Task[], nextTaskId: string \| null }`. クエリパラメータなし. 既存 `GET /api/v1/tasks` のサーバソートは `priority → createdAt → id` に統一（`dueDate` を第一キーから外す, D-003）. `openapi.yaml` の `/today` 骨格を本仕様で詳細化. |
| DB | スキーマ変更なし. 既存インデックスの活用 / 追加検討: `idx_tasks_due_priority`（既存）を `(due_date, trashed_at, priority, created_at, id)` に近い構成へ見直す（任意, パフォーマンス向上目的のみ. v0.1.0 のデータ規模では必須ではないため auditor 判断で見送り可）. |
| モジュール | サーバ: `server/src/app.ts` に `GET /api/v1/today` ハンドラを追加. `sortTasks` 関数を新仕様に差し替え（`dueDate` キー削除）. ドメイン共有: `domain/today` 相当のヘルパ（`filterToday(tasks)` / `sortToday(tasks)` / `pickNextTaskId(tasks)` の純関数）を追加し, サーバ・クライアント双方から参照可能にする（任意. 採用しない場合はサーバ層に閉じ込める）. クライアント: `web/src/repositories/task-repository.ts` に `today()` メソッドを追加（`GET /api/v1/today` を叩く）. `web/src/ui/today-view/today-view.tsx` の取得処理を `repository.today()` に切り替え, `sortTasks` 関数を撤去（サーバ並びを尊重）. `/` ルーティングは既存のまま. |
| UI | `TodayView` の表示対象が today のみになることに伴い, 既存 UI の文言（「今日」見出しのまま）は変えない. 期限切替トグルは引き続き提供するが, 切替後にタスクが今日ビューから消える挙動を確認する（再フェッチ）. 「次の 1 つ」を視覚的に強調する UI（例: 先頭タスクのハイライト）は本 feature では **任意**（NFR-011 のフォーカス時単独大表示は BL-006 の責務. 本 feature は最小実装として `nextTaskId` をデータとして公開するに留める）. |
| ドキュメント | `docs/developer/architecture/api/openapi.yaml` の `/today` ブロックに request/response schema を追記. `docs/developer/planning/backlog.md` の BL-005 を「Done」へ更新（マージ後）. ADR は不要（並び順仕様は spec.md / plan.md に書ききり, ADR-0010 の延長としての細部. ただし「ソート規則の統一」は monorepo 全体に影響するため必要に応じて軽量な ADR 化を検討. D-006 参照）. |

## 設計詳細

### データモデル

スキーマ変更なし. 既存 `tasks` テーブル（`server/src/db/schema.ts`）の以下のフィールドのみを利用する.

- `id`（PK, UUID v4）
- `name`
- `project_id`（null 可）
- `due_date`（`"today"` / `"tomorrow"`）
- `priority`（`"highest"` / `"normal"` / `"later"`）
- `origin`（`"manual"` / `"routine"`）
- `created_at`（ISO 8601）
- `trashed_at`（null = 通常状態）

### 処理フロー

#### 1. 今日ビュー取得（GET /api/v1/today）

```
クライアント UI（TodayView 起動 / 各書き込み mutation 成功）
  └─ web/app/today-usecase（または useQuery 直接）
      └─ TanStack Query useQuery(['today'])
          └─ web/repositories/task-repository.today()
              └─ HTTP GET /api/v1/today
                  ├─ middleware/auth: Bearer 検証 → 401 if NG
                  └─ server/api/today/get-today:
                      ├─ task-repository.list({ trashed: "false" }) で全 active タスクを取得
                      │   （現状の TaskRepository.list を流用. 追加メソッドは作らない）
                      ├─ filterToday(tasks): dueDate === "today" のみに絞る
                      ├─ sortToday(tasks): priority → createdAt → id の 3 段で安定ソート
                      ├─ nextTaskId = tasks[0]?.id ?? null
                      └─ 200 OK { tasks, nextTaskId }
```

**疑似コード**:

```ts
// server/src/today.ts (or inline in app.ts)
function filterToday(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.dueDate === "today" && t.trashedAt === null);
}

const PRIORITY_ORDER: Record<Priority, number> = { highest: 0, normal: 1, later: 2 };

function sortToday(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const p = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
    if (p !== 0) return p;
    const c = a.createdAt.localeCompare(b.createdAt);
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
}

function pickNextTaskId(tasks: Task[]): string | null {
  return tasks[0]?.id ?? null;
}
```

#### 2. クライアント UI 側の再フェッチ

各書き込み操作（create / update / delete / complete）が成功したら, TanStack Query の `queryClient.invalidateQueries({ queryKey: ['today'] })` で今日ビューを再取得する. 暫定実装では `setTasks` でローカル状態を更新していたが, **本実装ではサーバ並びを正本とする**ため楽観 UI 部分の見直しが必要（D-007 参照）.

### レスポンス形状

```yaml
# components.schemas.TodayView
type: object
required: [tasks, nextTaskId]
properties:
  tasks:
    type: array
    items:
      $ref: "#/components/schemas/Task"
    description: |
      dueDate = "today" かつ trashedAt = null のタスクを,
      priority (highest→normal→later) → createdAt (昇順) → id (昇順) の順に並べた一覧.
  nextTaskId:
    type: string
    nullable: true
    description: |
      並びの先頭要素の id. tasks が空のとき null.
      利用者・FocusSelection（BL-006）が「次の 1 つ」として参照する.
```

### 例外 / エラー処理

| HTTP ステータス | code | 発生条件 |
| --- | --- | --- |
| 200 | - | 正常応答（一覧空でも 200, `tasks: []`, `nextTaskId: null`） |
| 401 | `UNAUTHORIZED` | Bearer トークン未提示 / 不一致 |
| 500 | `INTERNAL_ERROR` | 予期せぬ例外（task-repository.list 失敗等） |

書き込み系エラーは本機能では発生しない（読み取り専用エンドポイント）.

## 重要な決定

- **D-001: `/api/v1/today` を新設する（spec.md U-001 保守側案を採用）**. 理由:
  - FR-010 / FR-011 は「今日ビュー」という意味論的に独立した概念であり, API でも 1 級概念として表現する方が後段 BL-006（FocusSelection）・別クライアント（Android）からの参照が明快.
  - `openapi.yaml` の `/today` 骨格・タグは既に分離されており, それを実体化する方が自然.
  - `/tasks?dueDate=today` 方式はクエリで意味論を担うため, NFR-001（単一ワークフロー強制）の精神「並び順を変えるクエリを増やさない」と整合させにくい（once `?dueDate=today` を許せば `?dueDate=tomorrow` / `?priority=highest` の要求が出てくるリスク）.
  - 代替案（`/tasks?dueDate=today`）の不採用理由: 上記の通り「クエリで `dueDate` を絞る」窓口を開けることは, 後段の検索機能スコープ外（OOS-004）と無用に近接する.
- **D-002: 並び順は `priority → createdAt → id` の 3 段（spec.md FR-011 / NFR-013）**. spec.md §「並び順の本仕様」と整合.
  - 第一キーから `dueDate` を外す理由: 今日ビューは today のみで構成されるため `dueDate` キーは無効. 残しても挙動不変だが, 仕様の明快さのために削除する.
  - 第三キーに `id` を採用する理由: `createdAt` 同値時の決定論性確保. `updatedAt` は編集で動くため不適, `name` も変更可能なため不適. `id` は UUIDv4 で不変であり, 利用者からは事実上不可視のタイブレーカーとして最適.
- **D-003: 既存 `GET /api/v1/tasks` のサーバソートも `priority → createdAt → id` に統一する**. 理由: 同じ「タスクの並び」が 2 つの規則で表現されると monorepo 内で混乱する. `/tasks` の利用者（trash 閲覧, デバッグ等）にとっても本仕様が予測可能で十分. 既存テスト（task-crud / task-priority）の並び順検証が `dueDate → priority → createdAt` 前提なら, 本機能で更新する（テスト変更タスクとして tasks.md に明記）.
- **D-004: クライアント側 `sortTasks` 関数を撤去**. サーバ並びを正本とする（NFR-013 の決定論性を 1 箇所に閉じ込めるため）. クライアントは `repository.today()` の返り値をそのまま `tasks` state にセットして表示する.
- **D-005: 「次の 1 つ」はレスポンスの `nextTaskId` プロパティで明示する（spec.md U-004 案 (b) 採用）**. 理由: クライアントが配列順序の処理ロジックに依存せず id 比較で「先頭か否か」を判定できる. BL-006 FocusSelection が未選択時の既定値として `nextTaskId` をそのまま採用できる構造になる. Task 全体を二重に返す案 (c) は冗長で採らない.
- **D-006: ADR は新規作成しない**. 並び順仕様（D-002）と `/today` 採用（D-001）は本 plan.md に書ききる. ただし「`/tasks` のサーバソートを統一する（D-003）」は影響範囲が広いため, auditor の判断で必要なら ADR 化（並び順の正本所在）を検討する余地を残す.
- **D-007: 楽観 UI と再フェッチのバランス**. 現状の `TodayView` は各操作後にローカル `setTasks` で楽観 UI を打っている. 本機能では以下の方針を採る.
  - **削除 / 完了 / 期限切替（today→tomorrow）**: ローカル `setTasks` で即座に一覧から除外する（楽観 UI を維持. 視覚的応答性のため）.
  - **加えて, 操作成功時に `today` クエリを invalidate** して再取得し, `nextTaskId` などサーバ計算値を最新化する.
  - **起票 / 名称編集 / 優先度変更**: 並び順がサーバ計算なので, 楽観 UI で挿入位置を推測せず, mutation 成功時に再取得する（暫定実装の楽観 UI を一部撤回. UX 退化のおそれがあれば auditor 判断で `nextTaskId` のみサーバ・並びはローカル sort という折衷も検討可）.
- **D-008: TaskRepository に新メソッドを追加しない（できれば）**. `task-repository.list({ trashed: "false" })` を流用し, today フィルタとソートはアプリケーション層 / API ハンドラ層で行う. Repository に `listToday()` を作るとドメインの「今日」概念が永続化層に染み込み, モジュール境界の責務が崩れる. ただし将来 SQLite 側で `WHERE due_date='today' AND trashed_at IS NULL ORDER BY ...` をクエリで表現したくなれば, その時点で TaskRepository に `listToday()` を追加する（v0.1.0 のデータ規模では不要）.

## リスク / 代替案

- **R-001: クライアント楽観 UI の挙動退化（D-007 関連）**. 並び順の正本をサーバに寄せたため, 起票・優先度変更時に「並び順がサーバ往復まで決まらない」ことになる. 体感の応答性低下があれば, クライアントが同じソート関数を持って楽観計算する案に戻す余地を残す. 監査時にユーザー体験を確認.
- **R-002: D-003（`/tasks` のソート統一）の波及**. BL-001 / BL-002 / BL-003 のテストが既存ソート規則を期待しているか調査済み（既存 `today-view.test.tsx` は dueDate 込みの順序検証なし, `tasks.test.ts` は順序非依存）. 影響は軽微と判断. ただし暫定実装変更時の回帰確認をテストタスクに含める.
- **R-003: `nextTaskId` の意味論が BL-006 と食い違うリスク**. BL-006 で FocusSelection が選択中の場合, 「次の 1 つ」は FocusSelection.currentTaskId であって `nextTaskId` ではない. 本 feature の `nextTaskId` は **「FocusSelection が未選択時の既定値計算ヒント」** という位置付けであり, "現在のタスク" そのものとは別概念. spec.md / 本 plan.md でこの境界を明示している. 監査時に文言の混乱がないか確認.
- **R-004: ルーティン由来タスクの取り扱い**. BL-017 でルーティン機能が入る際, ルーティン由来タスクが `dueDate = "today"` で生成されれば自動的に今日ビューに乗る前提. BL-017 設計時に本機能の前提を変えないよう注意する.
- **代替案 1: `/tasks?dueDate=today` で済ます**. D-001 で不採用. NFR-001 と整合させにくい.
- **代替案 2: 並び順をクライアント側で計算し続ける**. D-004 で不採用. NFR-013 の決定論性を多箇所に分散させると将来 Android クライアントとの整合性確認が増える.
- **代替案 3: tomorrow を「今日ビュー」の別タブ / 別ペインで表示**. spec.md 非ゴール. NFR-001 のシンプルさを優先し採らない. tomorrow 専用ビューの必要性が運用で判明したら別 BL として起票する.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md). 本機能では以下のレベル分けで整理する.

### 単体テスト（サーバ / 共有ドメイン）

- **対象**: `filterToday(tasks)` / `sortToday(tasks)` / `pickNextTaskId(tasks)` の純関数.
- **ツール**: Vitest.
- **観点**:
  - dueDate = "today" のみ通過, "tomorrow" は除外.
  - trashedAt != null は除外.
  - priority 順: highest → normal → later.
  - 同一 priority で createdAt 昇順.
  - 同一 createdAt で id 昇順.
  - 空配列入力 → 空配列, `pickNextTaskId([]) === null`.
  - 既存 `sortTasks` の差し替えに伴う回帰確認（dueDate キー削除）.

### 結合テスト（サーバ）

- **対象**: `GET /api/v1/today` ハンドラ + SQLite メモリ DB の通し.
- **ツール**: Vitest + Hono Testing Helper + better-sqlite3 in-memory.
- **観点**: spec.md の受け入れ基準（Gherkin）と 1:1 で対応するシナリオ.
  - 今日ビューは dueDate=today のみ返す.
  - 今日ビューに trashed タスクは含まれない（deleted / completed 両方）.
  - projectId / origin に関わらず全タスクを横断的に含める.
  - 並び順: priority 昇順 → createdAt 昇順 → id 昇順.
  - `nextTaskId` が tasks[0].id と一致, 空なら null.
  - 完了後の再取得で並びが繰り上がる（先頭が次に切り替わる）.
  - 認証なし → 401.
- **既存テストの更新**:
  - `server/__tests__/integration/tasks.test.ts` のうち, 並び順検証があれば本仕様（priority → createdAt → id）に追従.

### 単体テスト（クライアント）

- **対象**: `web/src/ui/today-view/today-view.tsx` の取得経路.
- **ツール**: Vitest + React Testing Library + 既存の `makeMockRepository` パターン.
- **観点**:
  - `repository.today()` を呼ぶこと（既存 `repository.list()` ではない）.
  - サーバから受け取った並びをそのまま表示する（クライアント側で再ソートしない = `sortTasks` の撤去確認）.
  - tomorrow タスクが今日ビューに現れない（mock の today() が today のみ返す前提で UI が描画する）.
  - 期限切替 today→tomorrow を実行すると, 再取得後にそのタスクが消える（mock 側で対応した today() 結果を返す）.
- **既存テストの更新**:
  - `web/__tests__/today-view.test.tsx` の `makeMockRepository` に `today()` メソッドを追加. 既存テストは `list()` ベースだが, UI が `today()` を呼ぶよう変わるため mock の入口を切り替える.

### E2E（任意 / 段階的）

- **対象**: Web クライアント + サーバ + ファイル SQLite.
- **ツール**: Playwright（task-crud で導入予定）.
- **観点**:
  - 起動直後に今日ビューが表示される.
  - tomorrow タスクが今日ビューに出ない.
  - 並び順がサーバから受けた通り（priority 順）になる.

### カバレッジ目標

- サーバ純関数: 100%（ロジックが小さく到達容易）.
- API 層: 各受け入れ基準シナリオの正常系 + 主要異常系（401）.
- UI 層: 表示対象絞り込み・並び順反映のシナリオが green.

### 重視するもの

- **暫定 → 本実装の差し替えで既存テストが壊れないこと**. 並び順仕様変更（D-002 / D-003）が監査対象になる. tasks.md に「既存テスト回帰確認」タスクを明記.
- **「次の 1 つ」を BL-006 が無理なく利用できる契約か**. レスポンス形状 `nextTaskId` が BL-006 着手時の既定値計算に十分か, BL-006 着手前に再確認する.
