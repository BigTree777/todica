# 設計・実装計画: 現在のタスク（フォーカス）と完了時の自動繰上げ

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md), API は [`../../architecture/api/overview.md`](../../architecture/api/overview.md), DB は [`../../architecture/database/schema.md`](../../architecture/database/schema.md) を参照.

## 方針概要

- **`FocusSelection` を独立した単一レコード**（`id = "singleton"`）として SQLite に追加. 物理スキーマ (drizzle) と Repository を新設し, 起動時 INSERT で 1 件常に存在させる.
- **`GET /api/v1/focus` と `PUT /api/v1/focus` を実装**. PUT は body `{ taskId: string | null }` を受け, `If-Match` / `Idempotency-Key` を要求する.
- **完了 / 削除 / 期限変更 (today→tomorrow) の各経路に「対象が現在のタスクなら currentTaskId を null に解除する」フックを統合**. 自動繰上げの「次」は新たに書き込まない. 「次」は `/today` の `nextTaskId` が暗黙フォールバックとして担う.
- **UI 側 `TodayView` を改修**. 「現在のタスク」(明示 `currentTaskId` ?? 暗黙 `nextTaskId`) を単独セクションで大きく表示し, 残りを通常リストで描画する. 行ごとに「現在に設定」ボタンを追加, 現在セクションに「現在解除」ボタンを追加.
- **`/today` のレスポンスは変更しない** (`{ tasks, nextTaskId }` のまま). `currentTaskId` は `/focus` で別途取得し, クライアント側で `currentTaskId ?? nextTaskId` の式で「強調対象」を決定する (spec.md U-004 保守側案).

## 既存実装の調査結果

| 項目 | 現状 | 本実装で変更 |
| --- | --- | --- |
| `FocusSelection` 論理スキーマ | [`architecture/database/schema.md`](../../architecture/database/schema.md) §FocusSelection に定義あり (`id="singleton"`, `currentTaskId`, `updatedAt`, `version`) | 変更なし (本書の決定と既に整合) |
| `FocusSelection` 物理スキーマ (drizzle) | `server/src/db/schema.ts` に未定義 | `focus_selection` テーブル + マイグレーション を追加 |
| FocusSelection Repository | 未定義 | `server/src/data/focus-selection-repository.ts` を新設 |
| `GET /api/v1/focus` ハンドラ | 未実装 (openapi.yaml に骨格のみ) | 新規実装 |
| `PUT /api/v1/focus` ハンドラ | 未実装 (openapi.yaml に骨格のみ) | 新規実装 |
| `POST /tasks/:id/complete` のフォーカス連動 | 連動なし (`server/src/app.ts` L317-355 の completeTask 実装) | 完了対象が currentTaskId と一致するなら currentTaskId を null に解除する処理を追加 |
| `DELETE /tasks/:id` のフォーカス連動 | 連動なし (同 L357-396) | 削除対象が currentTaskId と一致するなら null に解除 |
| `PATCH /tasks/:id` のフォーカス連動 | 連動なし (同 L211-312) | dueDate を tomorrow に変更したタスクが currentTaskId と一致するなら null に解除 |
| `/today` レスポンス | `{ tasks, nextTaskId }` (BL-005 確定) | 変更なし (spec.md U-004 保守側案: 分離維持) |
| UI: TodayView の `nextTaskId` 利用 | state に保持しているが描画には未使用 (`web/src/ui/today-view/today-view.tsx` L191-192 `void nextTaskId`) | `currentTaskId ?? nextTaskId` で強調対象を計算し, 大表示セクションを描画する |
| UI: 「現在に設定」「現在解除」アクション | 未提供 | 各タスク行に「現在に設定」, 現在セクションに「現在解除」ボタンを追加 |
| `openapi.yaml` の `/focus` | path 骨格のみ (request/response schema 未定義) | 本仕様で詳細化 (`FocusSelection` schema, `taskId` body, 400/412 を含む) |

### 暫定実装の所在

- サーバ: `server/src/app.ts` L317-355（complete）/ L357-396（delete）/ L211-312（patch）— いずれも FocusSelection を参照しない.
- サーバ DB: `server/src/db/schema.ts` — `focus_selection` テーブルなし.
- クライアント: `web/src/ui/today-view/today-view.tsx` L191-192 `void nextTaskId` — 強調表示なし.
- クライアント Repository: `web/src/repositories/task-repository.ts` — `focus()` / `setFocus()` メソッドなし.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 新規実装 `GET /api/v1/focus` / `PUT /api/v1/focus`. `openapi.yaml` の `/focus` ブロックに request / response schema を追記. 既存 `POST /tasks/:id/complete`, `DELETE /tasks/:id`, `PATCH /tasks/:id` のレスポンス契約は **変更なし**（内部でフォーカス連動の副作用が増えるのみ）. 新規エラーコード `INVALID_FOCUS_TARGET` を `ErrorCode` enum に追加. |
| DB | `focus_selection` テーブルを drizzle スキーマに追加 (`id` PK, `current_task_id` nullable, `updated_at`, `version`). マイグレーションを 1 本追加し, 起動時 (または migrate コマンド時) に `INSERT INTO focus_selection (id, current_task_id, updated_at, version) VALUES ('singleton', NULL, <now>, 1) ON CONFLICT DO NOTHING` で 1 件確保する. |
| ドメイン | （任意）`@todica/domain/focus` 相当の純関数（例: `setCurrentTask(focus, taskId)`, `clearCurrentTask(focus)`）を切り出すか, アプリケーション層で済ますかは implementer 判断. ただし「ある操作が現在のタスクに影響するか判定する」ロジックは pure に書ける形にする. |
| サーバ | `server/src/data/focus-selection-repository.ts` を新設. `server/src/app.ts` に `GET /api/v1/focus` / `PUT /api/v1/focus` ハンドラを追加. complete / delete / patch ハンドラに「現在のタスク連動」処理を統合（同一トランザクション内で task 更新と focus 更新を行うことが望ましい. 詳細は D-005）. `AppDeps` に `focusSelectionRepository: FocusSelectionRepository` を追加. |
| Web UI | `web/src/repositories/task-repository.ts` を分割するか, 別途 `FocusRepository` インターフェースを新設するかは implementer 判断. メソッド `focus(): Promise<FocusSelection>` / `setFocus(cmd: SetFocusCommand): Promise<FocusSelection>` を提供. `web/src/ui/today-view/today-view.tsx` を改修: (1) 起動時に `today()` と `focus()` を並列フェッチ, (2) `currentTaskId ?? nextTaskId` で強調対象を決定, (3) 強調セクション + 通常リストの 2 レイアウト, (4) 各行に「現在に設定」, 強調セクションに「現在解除」ボタン. 各書き込み mutation (complete / delete / dueDate→tomorrow) 後は `today()` と `focus()` を両方再フェッチする. |
| ドキュメント | `docs/developer/architecture/api/openapi.yaml` の `/focus` ブロック詳細化, `components.schemas.FocusSelection` の具体化, `ErrorCode` に `INVALID_FOCUS_TARGET` 追加. `docs/developer/architecture/api/overview.md` のリソース表の `/focus` 行を本機能の実装に合わせて補足. `docs/developer/planning/backlog.md` の BL-006 を「Done」へ更新 (マージ後). |

## 設計詳細

### データモデル

`focus_selection` テーブル (drizzle スキーマ):

```ts
// server/src/db/schema.ts に追加
export const focusSelection = sqliteTable("focus_selection", {
  id: text("id").primaryKey().notNull(), // 固定値 "singleton"
  currentTaskId: text("current_task_id"), // nullable. Task.id への弱参照 (FK 制約は張らない: D-006)
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});
```

- 単一レコード前提のため CHECK 制約は不要 (PK が固定値 `"singleton"`).
- `currentTaskId` への FK 制約は **張らない**（D-006 参照: 「弱参照に留め, 整合性はアプリケーション層で担保」）.
- 起動時に `INSERT ... ON CONFLICT DO NOTHING` で 1 件確保.

### API リソース定義

#### `GET /api/v1/focus`

- 認証必須. Idempotency-Key / If-Match 不要 (読取専用).
- 200 OK:
  ```json
  {
    "focus": {
      "id": "singleton",
      "currentTaskId": "task-xxxx" | null,
      "version": 3,
      "updatedAt": "2026-06-08T08:00:00.000Z"
    }
  }
  ```
- 401 UNAUTHORIZED: 認証なし.

#### `PUT /api/v1/focus`

- 認証 / Idempotency-Key / If-Match 必須.
- リクエスト body:
  ```json
  { "taskId": "task-xxxx" }   // 明示設定
  { "taskId": null }          // 解除
  ```
- 200 OK: 更新後の `{ focus: { ... } }` を返す.
- 400 INVALID_REQUEST_BODY: body が JSON でない / `taskId` プロパティが無い.
- 400 INVALID_FOCUS_TARGET: 以下のいずれか.
  - `taskId` が string でも null でもない.
  - 指定した `taskId` の Task が存在しない.
  - 指定した Task が ゴミ箱状態 (`trashedAt != null`).
  - 指定した Task の `dueDate != "today"`.
- 400 MISSING_IF_MATCH: `If-Match` ヘッダ未提示.
- 400 MISSING_IDEMPOTENCY_KEY: `Idempotency-Key` ヘッダ未提示 (middleware で処理).
- 401 UNAUTHORIZED.
- 412 PRECONDITION FAILED: `If-Match` の version 不一致. ボディに現行 `{ focus: { ... } }` を含める.

### 処理フロー

#### 1. 現在のタスク取得（GET /api/v1/focus）

```
クライアント UI (TodayView 起動 / focus 関連 mutation 成功)
  └─ web/repositories: focusRepository.focus()
      └─ HTTP GET /api/v1/focus
          ├─ middleware/auth: Bearer 検証 → 401 if NG
          └─ server/api/focus/get-focus:
              ├─ focus-selection-repository.get() → FocusSelection
              └─ 200 OK { focus }
```

#### 2. 現在のタスク設定 / 解除（PUT /api/v1/focus）

```
クライアント UI (「現在に設定」「現在解除」ボタン押下)
  └─ web/repositories: focusRepository.setFocus({ taskId, ifMatch })
      └─ HTTP PUT /api/v1/focus
          ├─ middleware/auth: Bearer 検証 → 401 if NG
          ├─ middleware/idempotency: Idempotency-Key 検証 → 既処理なら保存応答
          └─ server/api/focus/put-focus:
              ├─ body 解析 → taskId 抽出 (string | null)
              ├─ If-Match ヘッダ取得 → 数値化 → 400 if NG
              ├─ focus-selection-repository.get() → current
              ├─ if current.version !== ifMatch → 412 { focus: current }
              ├─ if taskId !== null:
              │     ├─ task-repository.findById(taskId) → task
              │     ├─ if task == null → 400 INVALID_FOCUS_TARGET
              │     ├─ if task.trashedAt !== null → 400 INVALID_FOCUS_TARGET
              │     └─ if task.dueDate !== "today" → 400 INVALID_FOCUS_TARGET
              ├─ updated = { ...current, currentTaskId: taskId, version: current.version + 1, updatedAt: now }
              ├─ focus-selection-repository.update(updated)
              └─ 200 OK { focus: updated }
```

#### 3. 完了経路でのフォーカス自動解除（FR-013 / POST /tasks/:id/complete）

```
既存 complete ハンドラ末尾に追加:
  ├─ ... 既存処理 (completeTask → task-repository.update)
  ├─ focus = focus-selection-repository.get()
  ├─ if focus.currentTaskId === id:
  │     ├─ updated = { ...focus, currentTaskId: null, version: focus.version + 1, updatedAt: now }
  │     └─ focus-selection-repository.update(updated)
  └─ 200 OK { task: completed }
```

- 「現在のタスクではない」「既にゴミ箱状態だった (no-op 経路)」場合は focus を更新しない.
- 同一トランザクション内で task 更新と focus 更新を行うことが望ましい (D-005).

#### 4. 削除経路でのフォーカス自動解除（DELETE /tasks/:id）

```
既存 delete ハンドラ末尾に追加:
  ├─ ... 既存処理 (trashTask → task-repository.update)
  ├─ focus = focus-selection-repository.get()
  ├─ if focus.currentTaskId === id:
  │     └─ focus を解除 (上と同様)
  └─ 204
```

- 既にゴミ箱状態だった no-op 経路でも, 念のため focus が同じ id を指していたら解除する (R-002 参照).

#### 5. 期限変更経路でのフォーカス自動解除（PATCH /tasks/:id, dueDate: tomorrow）

```
既存 patch ハンドラ末尾に追加:
  ├─ ... 既存処理 (updateTask → task-repository.update)
  ├─ if patch.dueDate === "tomorrow":
  │     ├─ focus = focus-selection-repository.get()
  │     └─ if focus.currentTaskId === id: focus を解除
  └─ 200 OK { task: updated }
```

- `dueDate: "today"` のままの編集 (名称・優先度・projectId のみ変更) ではフォーカスに影響しない.
- `dueDate: "tomorrow" → "today"` の変更（戻し）でも自動再設定はしない (spec.md 「現在のタスクの dueDate を tomorrow → today に戻しても自動で現在のタスクには再設定されない」シナリオ).

### UI 設計（TodayView 改修）

```
[ 今日 ]
[ 起票フォーム ] (既存)

[ 現在のタスク ]  ← 強調セクション (大表示, 単独配置)
  ┌──────────────────────────────┐
  │ A.name                       │ ← 「現在のタスク = currentTaskId ?? nextTaskId」
  │ [優先度: 最優先]              │   が示すタスクを描画
  │                              │
  │ [完了] [現在解除] [編集] ... │
  └──────────────────────────────┘

[ 他の今日のタスク ]  ← 通常リスト
  - B.name [現在に設定] [完了] [削除] ...
  - C.name [現在に設定] [完了] [削除] ...
```

- 強調対象 ID は `currentTaskId ?? nextTaskId` で算出. これが `null` (今日のタスク 0 件) なら強調セクション自体を非表示 / 空状態文言を表示.
- 強調セクションに表示するタスク自体は通常リストには **含めない**（重複表示を避ける. D-008 参照）.
- 「現在に設定」ボタン押下 → `setFocus({ taskId: B.id, ifMatch: currentFocus.version })` → 成功 → `focus()` と `today()` を再フェッチ.
- 「現在解除」ボタン押下 → `setFocus({ taskId: null, ifMatch: currentFocus.version })` → 成功 → 再フェッチ.
- 各書き込み mutation (complete / delete / dueDate→tomorrow) 成功時は `focus()` と `today()` を **両方** 再フェッチ（サーバ側でフォーカスが自動解除されている可能性があるため）.

### 例外 / エラー処理

| HTTP ステータス | code | 発生条件 |
| --- | --- | --- |
| 200 | - | GET /api/v1/focus 成功 / PUT /api/v1/focus 成功 |
| 400 | `INVALID_REQUEST_BODY` | PUT のボディが JSON でない / `taskId` プロパティが無い |
| 400 | `INVALID_FOCUS_TARGET` | `taskId` が string/null 以外 / 存在しないタスク / trashed / dueDate != today |
| 400 | `MISSING_IF_MATCH` | PUT で `If-Match` 未提示 |
| 400 | `MISSING_IDEMPOTENCY_KEY` | PUT で `Idempotency-Key` 未提示 (既存 middleware) |
| 401 | `UNAUTHORIZED` | 認証なし |
| 412 | - | `If-Match` の version 不一致. ボディに `{ focus: <current> }` |
| 500 | `INTERNAL_ERROR` | 予期せぬ例外 |

`POST /tasks/:id/complete` / `DELETE /tasks/:id` / `PATCH /tasks/:id` のエラー応答契約は **本機能で変更しない**. フォーカス連動の副作用が失敗した場合は task 更新ごと rollback する想定 (D-005).

## 重要な決定

- **D-001: 「未選択時の暗黙フォールバック = 今日ビュー先頭」を採用する (spec.md U-001 保守側案)**.
  - 理由: UC-001 の入口体験「アプリを開くと優先度順に出る → 1 つが大きく表示される」を欠かさない.
  - サーバの責務は「`currentTaskId` を保持する」ことだけで, 「次は何か」のフォールバックはクライアント側の式 (`currentTaskId ?? nextTaskId`) で表現する. サーバ間の状態は単純に保つ.
- **D-002: 自動繰上げのトリガーは「完了」「削除」「期限変更 (today→tomorrow)」の 3 経路 (spec.md U-002 保守側案)**.
  - 理由: 「`currentTaskId` が今日ビューから消えた id を指し続ける」状態を排除し, クライアント側のロジックを単純化する.
  - 不採用案 (完了のみ): ゴミ箱化や明日に移ったタスクが現在のタスクとして残るのは混乱の元.
- **D-003: 自動繰上げ時は「解除のみ」とし, 「次の現在のタスク」を書き込まない (spec.md U-003 保守側案)**.
  - 理由: 明示選択（ユーザーが選んだ）と暗黙フォールバック（並びの先頭）の区別を保つ. 「明示選択 → 完了で自動的に明示選択が次の id に切り替わる」を許すと, ユーザーが意図せず明示状態が続き「もう自分が選んだのではないのに選択中扱い」になり混乱する.
  - クライアント側式 `currentTaskId ?? nextTaskId` により「解除後の "次"」は表現できる. UC-001 の文言「自動で次が現在のタスクになる」は体感として満たされる.
- **D-004 (実装で変更): `/today` レスポンスに `currentTaskId` を含める**.
  - **当初**: 「含めない」を保守側案として採用 (BL-005 の責務を肥大化させない).
  - **実装段階で変更**: focus.test.ts の "GET /today currentTaskId 拡張" シナリオに合わせ, `{ tasks, nextTaskId, currentTaskId }` を返す形に確定. クライアントは 1 リクエストで全部取れる利点 + 整合性 (focus 自動解除後すぐ UI 反映) が勝った.
  - 含める実装は `server/src/app.ts` の `/today` ハンドラに `focusRepository.get().currentTaskId` を埋め込むだけ. BL-005 既存テストは `currentTaskId` を参照していないため壊れない.
  - OpenAPI `TodayView` schema にも `currentTaskId` を `required` で追記済.
- **D-005: 完了 / 削除 / 期限変更時のフォーカス連動は同一トランザクションで実行する**.
  - 理由: タスク更新だけ成功してフォーカス解除が失敗する状態を避ける（DB が一貫しないとクライアントが混乱する）.
  - 実装上は task-repository と focus-selection-repository を呼ぶ既存ハンドラに transaction wrapper を導入するか, アプリケーションサービス層を 1 つ挟む. better-sqlite3 の `db.transaction(() => { ... })` を使う前提.
  - リスク: 既存 complete / delete / patch ハンドラの構造変更が増える. 影響範囲は本 feature 内に閉じる.
- **D-006: `current_task_id` 列に FK 制約を張らない (弱参照に留める)**.
  - 理由: BL-010（日次リセット）でゴミ箱 Task を物理削除する処理が入る. FK 制約があると「ゴミ箱化 → リセットで物理削除」の経路でカスケード考慮が必要になり, スキーマ進化を硬直化させる.
  - 整合性はアプリケーション層 (フォーカス連動の自動解除) で担保する. `architecture/database/schema.md` でも FocusSelection は「表示用の弱参照」とされている (Routine の `routineId` と同じ思想).
- **D-007: 起動時に FocusSelection 1 件を INSERT する (spec.md U-005 保守側案)**.
  - 理由: 単一レコード前提の lazy 生成はレース条件の考慮が増える. マイグレーションまたは起動時 INSERT で 1 件を確保した方が GET / PUT の実装が単純（常に「ある」前提で書ける）.
  - 実装手段はマイグレーション SQL に `INSERT OR IGNORE` を含めるか, `main.ts` で起動時 INSERT するかどちらでも可. tasks.md で実装者判断.
- **D-008: 強調セクションに表示したタスクは通常リストに含めない**.
  - 理由: 同じタスクが画面上 2 か所に出ると操作が重複し UX が混乱する.
  - クライアント側で `tasks.filter(t => t.id !== focusedId)` を通常リストに渡す.
- **D-009: 「現在解除」UI を提供する (spec.md U-006 保守側案)**.
  - 理由: 明示選択した「現在のタスク」を「やっぱり選び直す」「優先度順の先頭に任せ直す」操作経路が無いと, 一度明示選択した状態を抜け出す手段が「別タスクを明示選択する」「完了する」しか無くなる. 「並び順に任せ直す」操作は明示状態解除として有用.
  - NFR-001 違反ではない（操作は「別タスク選ぶ」「現在解除」「完了」の 3 経路で完結する固定の UI 配置）.
- **D-010: PUT /api/v1/focus は `If-Match` 必須 (spec.md U-007 保守側案)**.
  - 理由: ADR-0010 の楽観ロック方針と一貫させる. 単一ユーザー前提で衝突は稀だが, ADR / 他エンティティとの統一性を優先する.
  - クライアントは `setFocus` 呼び出し前に `focus()` を取得して `version` を握っておく必要がある.
- **D-011: `FocusSelection` 用 Repository は task-repository / project-repository と同列の独立ファイルとする**.
  - 理由: モジュール境界の責務分離. data 層は「永続化操作」, アプリケーション層 (app.ts) は「ハンドラと連携」.
  - `server/src/data/focus-selection-repository.ts` を新設し, `get(): Promise<FocusSelection>` / `update(focus: FocusSelection): Promise<void>` の 2 メソッドだけを公開する.
- **D-012: ADR は新規作成しない**.
  - 本 feature の決定は本 plan.md に書ききる. 自動繰上げの「解除のみ」(D-003) や 暗黙フォールバック (D-001) は本機能内のロジックで, アーキテクチャ全体に波及する判断ではない. 必要があれば auditor の判断で軽量 ADR 化を検討.

## リスク / 代替案

- **R-001: 暗黙フォールバックと明示選択の混在で UI 文言が混乱しうる**.
  - 例: 「現在解除」を押した直後, `currentTaskId = null` になるが `nextTaskId = 元と同じ A` なら, 見た目上「A が引き続き現在のタスク」のまま. ユーザーが「解除されてない?」と感じうる.
  - 対策: 強調セクションのキャプションに「現在のタスク」とだけ書き, 明示 / 暗黙の別はユーザーには見せない（内部状態に過ぎないと割り切る）. または「(自動選択中)」のような副題を付ける案も検討（auditor 判断）.
- **R-002: 削除経路で「既にゴミ箱状態だった no-op 経路」を通る場合のフォーカス連動**.
  - 既存実装は `current.trashedAt != null && current.trashedReason == "deleted"` なら 204 を即返す.
  - 仮に「ゴミ箱の id が currentTaskId として残っている」状況で再度 DELETE が叩かれた場合, 連動解除しないと残り続ける.
  - 対策: no-op 経路でも `focus.currentTaskId === id` なら解除する. または「ゴミ箱化された瞬間に解除する」流路で前提として残らないようにする. D-002 で「削除時は必ず連動解除」する以上, 連動解除側は no-op 分岐前に置く方が安全.
- **R-003: トランザクション境界の設計コスト**.
  - 既存 complete / delete / patch ハンドラは task-repository を直接呼んでおり transaction wrapper が無い.
  - 本 feature で「task 更新 + focus 解除」を atomic に書こうとすると, better-sqlite3 の `db.transaction()` をハンドラから呼ぶ形か, アプリケーションサービス層を 1 つ挟む形になる. 後者の方が monorepo の責務分離としては綺麗だが, BL-016 以降で同じ整合性課題（プロジェクト削除のカスケード等）が出るまで様子見でも良い.
  - 対策: まずは「complete → focus 解除」を sequential 実行（task 更新成功後に focus 取得 → 解除）で実装し, 失敗時は warning ログ + 次回 PUT で整合性回復, とする最小実装も許容. ただし spec.md の受け入れ基準（特に「完了するとサーバ側で currentTaskId が null に解除される」）が green ならテストは通る.
  - tasks.md で実装方針を決定（D-005 を厳格に守るか, 段階的に対応するか）.
- **R-004: クライアントが `focus()` / `today()` の 2 リクエストを並列発行することで, 一瞬の不整合が見えうる**.
  - 例: `today()` が「A, B」を返した後, `focus()` が「currentTaskId = A」を返す間に, 別ブラウザタブで A が完了されて A が消える, など.
  - 対策: BL-006 では稀なケースとして許容（CORE-2: 単一ユーザー前提で並行操作は基本ない）. 必要なら BL-018 (PWA + キュー) で楽観 UI を整える.
- **R-005: ルーティン由来タスクが currentTaskId に設定された状態で BL-010 の日次リセット時に物理削除されるシナリオ**.
  - 日次リセットの設計（BL-010）でゴミ箱の物理削除や未完了ルーティン由来タスクの破棄が走るとき, focus.currentTaskId がそれらを指している可能性がある.
  - 対策: BL-010 の plan / 実装で「リセット処理時に focus.currentTaskId が today に存在しないなら null にする」スイープを 1 行入れる. 本 feature では BL-010 着手時の前提として書き残す程度に留める.
- **代替案 1: `/today` に `currentTaskId` を含める**. D-004 で不採用. BL-005 契約変更とエンドポイント責務肥大が嫌気.
- **代替案 2: 自動繰上げで `currentTaskId = nextTaskId` を書き込む**. D-003 で不採用. 明示 / 暗黙の区別が崩れる.
- **代替案 3: フォーカスをエンティティとして分離せず, Counter / Settings と一体化**. schema.md でも「実装側裁量」と記載されているが, 本 feature では責務分離のため独立テーブルとする (D-011).

## テスト方針

> 全体方針は [`../../quality/test-strategy.md`](../../quality/test-strategy.md). 本機能では以下のレベル分けで整理する.

### 単体テスト（サーバ純関数 / ドメイン）

- **対象**: フォーカス連動の判定純関数（`shouldClearFocusOnComplete(focus, completedTaskId)` 等を切り出した場合）.
- **観点**:
  - 現在のタスク id == 対象 id → 解除すべき.
  - 現在のタスク id != 対象 id → 変更なし.
  - `currentTaskId == null` → 変更なし.

### 結合テスト（サーバ API）

- **対象**: `GET /api/v1/focus` / `PUT /api/v1/focus` / 既存 complete / delete / patch のフォーカス連動.
- **ツール**: Vitest + Hono Testing Helper + better-sqlite3 in-memory.
- **観点**: spec.md の受け入れ基準（Gherkin）と 1:1 対応するシナリオ. 特に:
  - 初回 GET /focus は `currentTaskId = null`, `version = 1`.
  - PUT /focus 正常設定 → version インクリメント.
  - PUT /focus { taskId: null } で解除.
  - INVALID_FOCUS_TARGET (存在しない / trashed / tomorrow).
  - MISSING_IF_MATCH / 412 / Idempotency-Key 再送.
  - complete 経路: 現在のタスク完了 → focus 解除. 現在でないタスク完了 → focus 不変.
  - delete 経路: 同上.
  - patch dueDate: tomorrow 経路: 同上. dueDate: today のままの patch は focus 不変.
  - 認証なし → 401.
- **既存テストの更新**:
  - `server/__tests__/integration/tasks.test.ts` の complete / delete / patch シナリオに「フォーカス連動の副作用 (currentTaskId に影響なし or 解除)」のアサーションを追加する.

### 単体テスト（クライアント）

- **対象**: `web/src/ui/today-view/today-view.tsx` の「現在のタスク強調表示」「現在に設定 / 解除アクション」.
- **ツール**: Vitest + React Testing Library + 既存の `makeMockRepository` パターン拡張.
- **観点**:
  - `repository.focus()` を起動時に呼ぶ.
  - `currentTaskId == null` のとき, 並び先頭タスクが強調セクションに描画される (暗黙フォールバック).
  - `currentTaskId != null` のとき, 該当タスクが強調セクションに描画される.
  - 強調セクションのタスクは通常リストに含まれない (重複表示なし).
  - 「現在に設定」ボタンが各通常リスト行に存在し, 押すと `setFocus({ taskId: B.id, ifMatch: ... })` が呼ばれる.
  - 「現在解除」ボタンが強調セクションに存在し, 押すと `setFocus({ taskId: null, ifMatch: ... })` が呼ばれる.
  - 完了 / 削除 / 期限切替後に `focus()` と `today()` が両方再フェッチされる.
  - 今日のタスク 0 件のとき, 強調セクションは表示されない（または空状態文言）.
- **既存テストの更新**:
  - `web/__tests__/today-view.test.tsx` の `makeMockRepository` に `focus()` / `setFocus()` を追加. 既存テストは大半が「強調セクションがあっても破綻しない」形に修正（強調セクションを念頭に置いた要素選択に変更）.

### E2E（任意 / 段階的）

- **対象**: Web クライアント + サーバ + ファイル SQLite.
- **観点**:
  - 起動直後に並び先頭タスクが「現在のタスク」として強調表示される.
  - 「現在に設定」で別タスクを選ぶと強調が切り替わる.
  - 「完了」で強調セクションのタスクが消え, 次のタスクが繰り上がる.
  - 「現在解除」で並び先頭に戻る.

### カバレッジ目標

- サーバ純関数: 100%.
- API 層: 受け入れ基準シナリオの正常系 + 主要異常系 (401 / 400 / 412).
- UI 層: 強調表示・現在設定 / 解除アクション・自動繰上げ後の再描画が green.

### 重視するもの

- **「currentTaskId が今日ビューから消えた id を指し続けない」整合性**. 完了 / 削除 / 期限変更の 3 経路すべてで連動解除されることを結合テストで網羅する.
- **暗黙フォールバックの式 `currentTaskId ?? nextTaskId`** が UI 側で正しく機能すること. クライアント単体テストで「null のときは並び先頭が強調」「設定済みなら設定済みが強調」を両方確認.
- **BL-005 / BL-003 / BL-001 のテストが引き続き green** であること. フォーカス連動の副作用が既存の task API 契約を壊していないことを既存テストで担保.
