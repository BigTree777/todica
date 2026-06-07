# 設計・実装計画: タスク CRUD

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす. アーキテクチャ全体は [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md), API 設計は [`../../architecture/api/overview.md`](../../architecture/api/overview.md) を参照.

## 方針概要

- BL-001 の実装に必要な **最小限の基盤**（Hono サーバ起動 + better-sqlite3 + drizzle-orm + Bearer 認証ミドルウェア / React + Vite ボイラープレート + TanStack Query + React Router + Repository 抽象）を本機能のスコープに含めて立ち上げる（**案 A 採用**, 後述「前提と基盤の扱い」参照）.
- サーバ側はアーキテクチャ層構成（API → アプリケーション → ドメイン ← Repository インターフェース ← 永続化アダプタ）に従い, タスク CRUD ユースケースを実装. 全書き込みは 1 トランザクション・冪等性キー処理・楽観ロック検証を伴う.
- Web クライアントは TanStack Query の `useQuery` / `useMutation` でサーバ状態を扱い, 「起票フォーム」「タスク一覧（簡易）」「編集ダイアログ」「期限切替トグル」「削除ボタン」を最小 UI として提供. **本機能の UI は「今日ビュー」の体裁を兼ねた最小ビューに留め, 並び順や現在のタスク選択は BL-005 / BL-006 で本実装する**.

## 前提と基盤の扱い

### 採用案: 案 A（BL-001 に最小基盤セットアップを含める）

CLAUDE.md の指示「バックログを順番に消化していってください」を踏まえ, **案 A** を採用する.

### 根拠

- **動作確認可能な最小単位を早期に確立する必要がある**: BL-001 は「タスク CRUD」という Todica の中核機能であり, これがエンドツーエンドで動かないと後続のすべての BL（BL-002 優先度, BL-003 完了アクション, BL-005 今日ビュー, BL-006 フォーカス, BL-010 リセット, BL-011 ゴミ箱 等）が動作確認できない. 基盤 BL（BL-013 / BL-014 / BL-015）を先行で完了させる「案 B」を取ると, **本物のドメイン要件で基盤を検証する機会を失い, 過剰実装 / 不足実装のリスクが上がる**.
- **TDD の "失敗するテスト → 通す" サイクルを最小スコープで回す**: 案 A であれば, 受け入れ基準（spec.md）→ 失敗するテスト（test-designer）→ 通す（implementer, 基盤含む）→ 監査（auditor）の 1 サイクルで, タスク CRUD と最小基盤を同時に green 化できる.
- **基盤拡充は段階的に行えば良い**: 認証トークンのローテーション運用（BL-013 詳細）, PWA 化・オフライン書込みキュー（BL-018）, OpenAPI からの型生成パイプライン整備（BL-015 詳細）といった「広義の基盤」は本機能の green 化に必須ではないため, 後続イテレーションで残り部分を整える.

### 本機能で含める「最小基盤」の範囲

| 領域 | 含めるもの | 含めないもの（後続 BL へ） |
| --- | --- | --- |
| サーバ起動 | Hono サーバの最小起動・ポート公開・systemd 等の常駐は実装しない（開発時の `node` 起動のみ） | systemd ユニット定義・本番ホスティング設定（BL-013） |
| 認証 | Bearer トークン検証ミドルウェア（環境変数の固定トークンと一致する場合のみ通す） | トークンローテーション運用手順（BL-013） |
| 永続化 | better-sqlite3 + drizzle-orm + drizzle-kit によるスキーマ定義・初期マイグレーション（`tasks`, `projects` のみ. 他テーブルは後続 BL が追加） | バックアップ運用（BL-013）・ Android ローカルモード（BL-019 / BL-020） |
| API 基盤 | Hono の `zod-openapi` で OpenAPI とハンドラ型を一致させる仕組み. 共通ミドルウェア（認証, `Idempotency-Key` 処理, `If-Match` 楽観ロックヘルパ, エラー → JSON 変換） | 全エンドポイントの OpenAPI 詳細スキーマ整備（BL-015）. 本機能では `/tasks` 系のみ追記 |
| クライアント基盤 | React + Vite ボイラープレート, TanStack Query Provider, React Router の最小ルーティング（今日ビュー兼用の `/` パス 1 つ）, `fetch` ベースの API クライアント, Repository インターフェース | PWA 化・Service Worker・IndexedDB 書込キュー（BL-018）. 本機能では同期 API として動くことのみ保証 |
| ドメイン層共有 | サーバとクライアントが共通参照できるドメインモジュール（Task 型, 状態遷移関数, バリデーション）を monorepo 内に置く. 物理レイアウトは implementer の判断 | Project / Routine / Counter / Reset 等のドメイン（後続 BL） |

### 案 A を採らない場合のメモ（参考）

- 案 B（基盤を先行）を採るなら BL-013/014/015 を 1 サイクルで先に完了させ, 本機能の spec はそのまま使えるが「依存: BL-013/014/015 完了後」と明記する形になる. 採用しない理由は上記.
- 案 C（基盤を 1 つの feature に合体）も可能だが, 案 A と比べてスコープが膨らみ, 動く機能の確認が遅れる. 採用しない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 新規エンドポイント（OpenAPI 追記）: `GET /api/v1/tasks` / `POST /api/v1/tasks` / `PATCH /api/v1/tasks/{id}` / `DELETE /api/v1/tasks/{id}`. Idempotency-Key と If-Match の共通ミドルウェア. エラーコード `INVALID_DUE_DATE` / `INVALID_TASK_NAME` / `PROJECT_NOT_FOUND` / `TASK_NOT_FOUND` / `MISSING_IF_MATCH` を定義. `POST /tasks/{id}/complete` / `POST /tasks/{id}/restore` は本機能ではスタブのみ（404 を返さない実装は後続 BL）. |
| DB | 新規テーブル `tasks` および参照整合用の最小 `projects`（`id`, `name`, `version`, `created_at`, `updated_at`, `trashed_at` のみ. 編集・削除 UI は BL-016）. drizzle-kit でマイグレーション `0000_initial.sql` を生成. `tasks.(due_date, priority)`, `tasks.project_id`, `tasks.trashed_at` インデックス. |
| モジュール | サーバ: `server/api/tasks/*` (エンドポイント), `server/middleware/auth` (Bearer 検証), `server/middleware/idempotency` (キー処理), `server/app/task-usecases/*` (起票・編集・削除), `server/data/repositories/task-repository.ts` (インターフェース), `server/data/repositories/project-repository.ts` (参照用), `server/infra/persistence/drizzle/*` (具象). ドメイン共有: `domain/task` (Task 型・状態遷移・バリデーション), `domain/clock` (Clock 抽象). クライアント: `web/ui/today-view/*` (最小ビュー兼起票フォーム), `web/app/task-usecases/*` (TanStack Query mutation), `web/data/repositories/task-repository.ts`, `web/infra/api-client/*`. |
| UI | 単一ページ（`/`）に「起票フォーム + 一覧 + 各タスク行に編集 / 期限切替 / 削除」を載せた最小ビュー. 並び順は `dueDate` (today→tomorrow), `priority` (highest→normal→later), `createdAt` (昇順) の 3 段ソート（NFR-013 担保のため決定論的に. ただし最終的な並び順仕様は BL-005 で確定するため, 本機能では暫定実装と位置付ける）. |
| ドキュメント | OpenAPI `openapi.yaml` に `/tasks` 系の request/response schema と Task スキーマを追記. `database/schema.md` の Task / Project 節は既に存在するため変更最小（必要に応じて補足）. 本機能用の ADR は新規作成しない（PATCH セマンティクスと冪等性キー方針は本 plan.md に書ききる）. |

## 設計詳細

### データモデル

`docs/developer/architecture/database/schema.md` の Task エンティティ定義を本機能の対象とする. 再掲（同期メタデータ込み）.

**Task（`tasks` テーブル）**

| フィールド | 物理型 | NULL | 説明 |
| --- | --- | --- | --- |
| `id` | TEXT (UUID v4) | NOT NULL, PK | クライアント / ドメイン採番 |
| `name` | TEXT | NOT NULL | タスク名（1 文字以上 200 文字以内, 制御文字除外. U-005 保守側案） |
| `project_id` | TEXT | NULL | プロジェクト ID. `projects.id` への参照（FK は張らないが整合性をユースケース層でチェック）|
| `due_date` | TEXT + CHECK | NOT NULL | `"today"` or `"tomorrow"` のみ |
| `priority` | TEXT + CHECK | NOT NULL | `"highest"` / `"normal"` / `"later"`. 既定 `"normal"` |
| `origin` | TEXT + CHECK | NOT NULL | `"manual"` / `"routine"`. 本機能では `"manual"` 固定 |
| `routine_id` | TEXT | NULL | `origin = "routine"` のときのみ非 null. 本機能では未使用 |
| `created_at` | TEXT (ISO 8601) | NOT NULL | 作成時刻（不変） |
| `updated_at` | TEXT (ISO 8601) | NOT NULL | 更新時刻（書き込みごとに更新） |
| `trashed_at` | TEXT (ISO 8601) | NULL | ゴミ箱に入った時刻. null なら通常状態 |
| `trashed_reason` | TEXT + CHECK | NULL | `"completed"` / `"deleted"`. 本機能では `"deleted"` のみ書く |
| `version` | INTEGER | NOT NULL, default 1 | 楽観ロック用. 書き込みごとに +1 |

インデックス:
- `idx_tasks_due_priority` on `(due_date, priority)` — 今日ビュー（BL-005）の並びと, 一覧 API の暗黙ソートに使用.
- `idx_tasks_project_id` on `(project_id)` — プロジェクト紐付けタスクの取得.
- `idx_tasks_trashed_at` on `(trashed_at)` — `?trashed=true|false` フィルタ.
- `idx_tasks_routine_id` on `(routine_id)` — 本機能では未使用だがスキーマで張っておく.

**Project（`projects` テーブル, 本機能では参照のみ）**

| フィールド | 物理型 | NULL | 説明 |
| --- | --- | --- | --- |
| `id` | TEXT | NOT NULL, PK | |
| `name` | TEXT | NOT NULL | |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |
| `trashed_at` | TEXT | NULL | |
| `version` | INTEGER | NOT NULL, default 1 | |

本機能では Project の CRUD UI / API は提供しない（BL-016）. ただし起票時の `projectId` 参照整合性チェックのため, Repository に「存在確認」メソッドのみ用意する. テスト用にプロジェクトを事前投入する seed スクリプトを最小で持つ.

### 処理フロー

#### 1. タスク起票（POST /api/v1/tasks）

```
クライアント UI（起票フォーム）
  └─ web/app/task-usecases/create-task
      └─ TanStack Query useMutation (楽観 UI で一覧に仮レコード追加)
          └─ web/infra/api-client.post('/tasks', body, headers)
              ├─ headers: Authorization: Bearer <token>, Idempotency-Key: <id>
              └─ HTTP POST /api/v1/tasks
                  ├─ server/middleware/auth: Bearer 検証 → 401 if NG
                  ├─ server/middleware/idempotency: 直近の同キー応答があれば返却
                  ├─ server/api/tasks/post-tasks: zod でリクエスト検証 → 400 if NG
                  └─ server/app/task-usecases/create-task:
                      ├─ trx 開始
                      ├─ projectId != null なら project-repository.exists で参照確認
                      │   └─ 不在なら 400 PROJECT_NOT_FOUND（ロールバック）
                      ├─ domain/task/create で Task エンティティ生成（既定値補完, name バリデーション）
                      ├─ task-repository.insert（initial version = 1, createdAt = updatedAt = clock.now()）
                      ├─ idempotency-store.save(key, response)
                      └─ trx コミット → 201 Created（task 全体を返す, U-001）
```

#### 2. タスク編集（PATCH /api/v1/tasks/{id}）

```
クライアント UI（編集ダイアログ / 期限トグル）
  └─ web/app/task-usecases/update-task
      └─ useMutation (楽観 UI: ローカルキャッシュを差分更新)
          └─ web/infra/api-client.patch('/tasks/{id}', body, headers)
              ├─ headers: Idempotency-Key: <random>, If-Match: <current version>
              └─ HTTP PATCH /api/v1/tasks/{id}
                  ├─ middleware/auth, middleware/idempotency
                  ├─ server/api/tasks/patch-tasks-id:
                  │   ├─ If-Match ヘッダ存在チェック → MISSING_IF_MATCH 400 if NG
                  │   └─ zod でリクエスト検証（部分更新フィールド. dueDate/name/projectId のみ受理. priority は BL-002 で追加）
                  └─ server/app/task-usecases/update-task:
                      ├─ trx 開始
                      ├─ task-repository.findById → 404 TASK_NOT_FOUND if NG
                      ├─ current.version !== ifMatch → 412（現行 task をボディに返す）
                      ├─ projectId 変更時は project-repository.exists で参照確認
                      ├─ domain/task/update で差分適用 + バリデーション
                      ├─ task-repository.update（version + 1, updatedAt = clock.now(), createdAt は不変）
                      └─ trx コミット → 200 OK（更新後 task を返す）
```

#### 3. タスク削除（DELETE /api/v1/tasks/{id}）

```
クライアント UI（削除ボタン）
  └─ web/app/task-usecases/delete-task
      └─ useMutation (楽観 UI: ローカル一覧から除外)
          └─ web/infra/api-client.delete('/tasks/{id}', headers)
              ├─ headers: Idempotency-Key: <random>, If-Match: <current version>
              └─ HTTP DELETE /api/v1/tasks/{id}
                  ├─ middleware/auth, middleware/idempotency
                  └─ server/app/task-usecases/delete-task:
                      ├─ trx 開始
                      ├─ task-repository.findById → 404 if NG（注: U-003 で「既削除なら 204 冪等」とした）
                      ├─ current.trashedAt != null かつ trashedReason = "deleted" → 204（no-op 冪等. version は If-Match 検証もスキップ）
                      ├─ それ以外で current.version !== ifMatch → 412
                      ├─ domain/task/trash で trashedAt = now, trashedReason = "deleted" を適用
                      ├─ task-repository.update（version + 1, updatedAt = clock.now()）
                      └─ trx コミット → 204 No Content
```

#### 4. タスク一覧取得（GET /api/v1/tasks）

```
クライアント
  └─ useQuery → api-client.get('/tasks?trashed=false')
      └─ HTTP GET /api/v1/tasks?trashed=<true|false|all>
          ├─ middleware/auth
          └─ server/app/task-usecases/list-tasks:
              ├─ task-repository.list({ trashed }) で取得
              └─ 200 OK { tasks: [...] }（並び順は dueDate → priority → createdAt の暫定 3 段ソート）
```

### 例外 / エラー処理

| HTTP ステータス | code | 発生条件 |
| --- | --- | --- |
| 400 | `INVALID_TASK_NAME` | name が空 / 長さ超過 / 制御文字を含む |
| 400 | `INVALID_DUE_DATE` | `dueDate` が `"today"` / `"tomorrow"` 以外 |
| 400 | `INVALID_PRIORITY` | `priority` が enum 外（本機能では起票時のみチェック. 編集は priority を受理しない） |
| 400 | `PROJECT_NOT_FOUND` | `projectId` が存在しない（起票・編集の両方） |
| 400 | `MISSING_IF_MATCH` | PATCH / DELETE で `If-Match` ヘッダ欠落 |
| 400 | `MISSING_IDEMPOTENCY_KEY` | 書き込みリクエストで `Idempotency-Key` ヘッダ欠落 |
| 401 | `UNAUTHORIZED` | Bearer トークン未提示 / 不一致 |
| 404 | `TASK_NOT_FOUND` | PATCH / DELETE 対象の `id` が存在しない |
| 412 | （body に現行 task） | `If-Match` の値がサーバ側 `version` と不一致 |
| 500 | `INTERNAL_ERROR` | 予期せぬ例外（ログ記録のみ. 詳細はクライアントに返さない） |

ドメイン層は例外を投げず Result 型相当で表現することを推奨（`module-boundaries.md` §6）. API レイヤで HTTP ステータスに変換する.

## 重要な決定

- **D-001: 案 A 採用（BL-001 に最小基盤を含める）**. 上述「前提と基盤の扱い」のとおり.
- **D-002: PATCH のセマンティクス = 単純な部分上書き**. `name` / `dueDate` のフィールドが送られたものだけ更新する. `projectId` のみ `null` を明示的に送ることで紐付け解除可能とする. JSON Merge Patch / JSON Patch といった RFC 形式は採用しない（実装簡素化と OpenAPI の表現容易性を優先. U-002 保守側案）.
- **D-003: 削除は「ゴミ箱状態への遷移」として実装. 既削除レコードへの再 DELETE は no-op 冪等扱い**. U-003 保守側案を採用. これにより `Idempotency-Key` による再送 + 既削除状態が両立する.
- **D-004: ID はクライアント / ドメイン採番（UUID v4）, `Idempotency-Key` と同一値**. ADR-0010 と `database/schema.md` §共通方針および §同期メタデータの規定どおり.
- **D-005: タスク名のバリデーション = 1〜200 文字, 制御文字（`\n` / `\r` / `\t` / NUL）を含まない UTF-8 文字列**. U-005 保守側案. 必要なら ADR 不要レベルの判断としてここで固定するが, ユーザー確認が取れた時点で本決定を最終化する.
- **D-006: 一覧 API のクエリは `?trashed=true|false|all`（既定 false）のみ**. U-006 保守側案. 今日ビュー的なフィルタは `/today`（BL-005）の責務とする.
- **D-007: ルーティン由来タスクへの編集・削除は通常タスクと同じ振る舞い**. U-007 保守側案. 本機能の API は `origin` で挙動を分岐させない.
- **D-008: ドメインの Clock は引数で注入**. サーバ実装は `() => new Date().toISOString()` を返す `SystemClock` をユースケースに注入. テストでは固定時刻を返す `FakeClock` を注入する.
- **D-009: 起票の 201 レスポンスには task 全体を返す**. U-001 保守側案.
- **D-010: Idempotency-Key の保管期間は 24 時間**. 起票・編集・削除の応答全体を `idempotency_keys` テーブル相当に保管し, 同じキーで再リクエストされたら保管済み応答を返す. 保管期間内に重複したら同じ HTTP ステータス + ボディを返す（spec.md の起票冪等性シナリオを満たす）. **失敗応答 (400 / 404 / 412) もキャッシュ対象** とする（同じキーでの再送が成功・失敗で振る舞いを変えないために. 認証失敗 401 はミドルウェアの順序上 idempotency 処理より前で返るため対象外）.
- **本機能では ADR を新規作成しない**. ADR が必要な大規模判断は出ていない. PATCH セマンティクス（D-002）と削除冪等性（D-003）は本 plan.md に書ききる.

## リスク / 代替案

- **R-001: 最小基盤を「含めすぎる / 含めなさすぎる」リスク**. 案 A の境界線は「タスク CRUD のテストを green にする最小集合」に厳格に絞る. PWA 化や OpenAPI クライアント生成パイプライン整備など, テストが要求しないものは含めない. 不明瞭な場合は auditor 段階で再判断する.
- **R-002: 並び順仕様の暫定実装**. 本機能で実装する `dueDate → priority → createdAt` の暫定 3 段ソートは BL-005（今日ビュー）で本決定される際に変更される可能性がある. 暫定であることを implementer / auditor に明示し, 必要なら BL-005 着手時に差し替える.
- **R-003: Idempotency-Key 保管テーブルの設計**. 24 時間保持は固定（D-010）だが, スキーマ詳細（応答ボディの JSON 保管, TTL のクリア処理）は本機能内で確定. 実装はシンプルに `(key TEXT PK, response_status INTEGER, response_body TEXT, created_at TEXT)` とし, リクエスト処理時に古いエントリを掃除する（cron 等は導入しない）.
- **R-004: 楽観ロックの実装漏れ**. PATCH / DELETE で `If-Match` を強制する箇所が複数あるため, 共通ミドルウェア（`requireIfMatch`）を作る. 実装者がエンドポイントごとに書き忘れない構造を取る.
- **代替案: GraphQL / tRPC**. 採用しない（ADR-0010 のとおり REST + OpenAPI で確定済み）.
- **代替案: better-sqlite3 ではなく PostgreSQL を使う**. 採用しない（ADR-0007 で SQLite に確定済み）.

## テスト方針

> 全体方針は [`../../quality/test-strategy.md`](../../quality/test-strategy.md). 本機能では以下のレベル分けで整理する.

### 単体テスト

- **対象**: ドメイン層 `domain/task`（生成 / 更新 / ゴミ箱化 / バリデーション / 状態遷移）, `domain/clock` の FakeClock 動作.
- **ツール**: Vitest（サーバ・クライアント共通）.
- **観点**: 値域チェック（dueDate / priority）, 文字種 / 長さチェック, `version` インクリメント, `createdAt` 不変, `updatedAt` 更新, `trashedAt` セット.

### 結合テスト（サーバ）

- **対象**: アプリケーション層（usecase） + Repository 具象 + SQLite（メモリ DB）. API レイヤの zod-openapi ハンドラも含めて Hono の `app.request()` でテストする.
- **ツール**: Vitest + Hono Testing Helper + better-sqlite3 in-memory.
- **観点**:
  - 起票 → 一覧で 1 件返る.
  - 同じ Idempotency-Key で 2 回起票 → 1 件だけ作成.
  - 編集 PATCH → version + 1, name 更新, 他フィールド不変.
  - 編集で古い version → 412 + 現行 task ボディ.
  - 削除 → trashedAt セット, 一覧（trashed=false）から除外, 物理削除されていない.
  - 既削除の再 DELETE → 204 no-op.
  - dueDate 値域違反 → 400 INVALID_DUE_DATE.
  - 認証無し → 401.
  - PATCH に If-Match なし → 400 MISSING_IF_MATCH.
  - projectId 不在 → 400 PROJECT_NOT_FOUND.
  - Counter テーブルは本機能ではまだ作らない（BL-003）ため, カウント加算は「カウント加算処理が呼ばれない」ことを実装上保証. テストとしては「削除時にカウント関連の Repository を呼ばないこと」を確認するか, あるいは Counter 機能未実装環境で削除が成功することをもって担保する.

### 単体テスト（クライアント）

- **対象**: クライアント側ユースケース（楽観 UI 起動・mutation の挙動）, Repository インターフェースのモック.
- **ツール**: Vitest + React Testing Library + MSW（モックサーバ）.
- **観点**:
  - 起票フォームで送信 → POST が指定形式で送られる.
  - 編集ダイアログでの保存 → PATCH が `If-Match` 付きで送られる.
  - 期限切替トグル → PATCH が `{ dueDate: ... }` で送られる.
  - 412 を受け取ったら「現行値で上書き / 強制再送」の UI が出る（最小実装. 詳細は BL-018 で本実装）.

### E2E テスト

- **対象**: Web クライアント + サーバ + SQLite ファイル DB の通しシナリオ.
- **ツール**: Playwright（候補. implementer の選定に委ねる. test-strategy.md がまだ TODO 状態のため, 本機能の implementer 着手と並行して quality/test-strategy.md にもツール選定結果を反映する）.
- **観点**: spec.md の「Web クライアント UI」セクションのシナリオ 5 件を E2E で通す.
  - 起票フォームのフィールド最小性.
  - 起票 → 一覧反映.
  - 名称編集 → 一覧反映.
  - 期限切替 → API 送信確認.
  - 削除 → 一覧から消える.

### カバレッジ目標

- ドメイン層: 90% 以上（純粋ロジックのため到達容易）.
- usecase 層: 主要分岐すべて（起票成功 / バリデーション失敗 / 参照不在 / 冪等再送 / 楽観ロック衝突 / 削除冪等）.
- API 層: 各エンドポイントの正常系 + 主要異常系（401 / 400 / 404 / 412）.
- UI 層: 上記 E2E シナリオが通ることを主, 単体カバレッジは数値目標を設けない.

### 重視するもの

- **分岐網羅より「受け入れ基準と 1:1 対応」**: spec.md の各 Gherkin シナリオがどの結合 / E2E テストで担保されるかをトレース可能にする（test-designer が一覧を作る）.
- **冪等性と楽観ロックの境界条件**: 後続 BL の信頼性の土台になるため, ここで仕組みを確定させる.
