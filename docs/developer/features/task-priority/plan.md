# 設計・実装計画: タスク優先度（3 段階の付与・変更）

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす. BL-001（タスク CRUD）が既に main にマージ済であることを前提とし, **BL-001 で確立した経路（POST / PATCH / Idempotency-Key / If-Match / version 採番 / 暫定ソート）を再利用** する.

## 方針概要

- 本機能はデータモデルや基盤を増やさない. **PATCH エンドポイントを `priority` フィールド対応に拡張** し, **Web UI に優先度の指定・変更操作を追加** する, 最小差分の機能拡張である.
- 受け入れ基準のほとんどは BL-001 既存の経路（ドメイン `createTask` / `validatePriority`, サーバの Idempotency-Key / If-Match ミドルウェア, 暫定 3 段ソート）の上に成立する.

## 既存実装の調査結果

> 「BL-002 で新たに必要なもの」を最小化するために, BL-001 マージ済の実装を実際に読み取り, FR-003 / FR-004 / 関連 NFR に対する充足状況を一覧化する.

### 調査対象ファイル

- `domain/src/task/index.ts`（ドメイン: Task 型, `createTask`, `updateTask`, `trashTask`, `validatePriority`）
- `server/src/app.ts`（API ハンドラ: POST / GET / PATCH / DELETE `/api/v1/tasks`）
- `server/__tests__/integration/tasks.test.ts`（結合テスト）
- `web/src/repositories/task-repository.ts`（`UpdateTaskCommand.patch` の型）
- `web/src/ui/today-view/today-view.tsx`（今日ビュー UI）
- `web/__tests__/today-view.test.tsx`（UI 単体テスト）
- `docs/developer/architecture/api/openapi.yaml`（`Task` / `TaskInput` / `TaskPatch` スキーマ）

### 充足状況

| 項目 | 既存実装の状態 | BL-002 で追加が必要か | 備考 |
| --- | --- | --- | --- |
| Task 型に `priority: "highest" | "normal" | "later"` | 既存 | 不要 | `domain/src/task/index.ts` L11-12, L24-37 |
| `createTask` で priority を受理（既定 `"normal"`） | 既存 | 不要 | `domain/src/task/index.ts` L141-143 |
| `validatePriority` 純関数（enum 違反は `INVALID_PRIORITY`） | 既存 | 不要 | `domain/src/task/index.ts` L111-125 |
| POST `/api/v1/tasks` で `priority` を受理し enum 違反を 400 で弾く | 既存 | 不要 | `server/src/app.ts` L126, L135-145 |
| POST のレスポンスに `priority` が含まれる | 既存 | 不要 | `createTask` 結果をそのまま返却（同 L178） |
| **PATCH `/api/v1/tasks/{id}` で `priority` を受理** | **未実装** | **必要** | `server/src/app.ts` の PATCH ハンドラは `name / dueDate / projectId` のみを `patch` に積む（L267-270）. `priority` フィールドは無視される / 反映されない. |
| **ドメイン `updateTask` で `priority` の部分上書き** | **未実装** | **必要** | `UpdateTaskInput` に `priority?` が無い（L49-53）, `updateTask` も priority を扱わない（L166-190）. |
| PATCH 共通基盤（If-Match / Idempotency-Key / 楽観ロック / version+1） | 既存 | 不要 | BL-001 の経路をそのまま使う. |
| OpenAPI `TaskInput.priority` 定義 | 既存 | 不要 | `openapi.yaml` L554-557 |
| **OpenAPI `TaskPatch.priority` 定義** | **未実装** | **必要** | `openapi.yaml` L559-570 に priority が無い. |
| 暫定 3 段ソート（dueDate → priority → createdAt） | 既存 | 不要 | サーバ `server/src/app.ts` L352-362, クライアント `today-view.tsx` L27-35 |
| **Web `UpdateTaskCommand.patch.priority`** | **未実装** | **必要** | `web/src/repositories/task-repository.ts` L20-29 に priority が無い. |
| **Web `HttpTaskRepository.update` で priority を body に積む** | **未実装** | **必要** | 同ファイル L149-153 に priority 行が無い. |
| **Web UI: 起票フォームに優先度 select** | **未実装** | **必要** | `today-view.tsx` の起票フォームは name / projectId / dueDate のみ（L144-178）. |
| **Web UI: タスク行に優先度変更操作** | **未実装** | **必要** | `today-view.tsx` の `<li>` は span + 編集 / 期限切替 / 削除のみ（L199-214）. |
| **Web UI: タスク行に現在の優先度表示** | **未実装** | **必要** | 同上. |
| 結合テスト: priority 関連の網羅シナリオ | **部分的** | **追加** | `tasks.test.ts` は priority を seed 値として使うのみ. spec.md の「priority 省略で normal」「priority を highest に PATCH」「PATCH で値域外 → 400」等のシナリオは未追加. |
| UI 単体テスト: 優先度の指定・変更 | **未実装** | **追加** | `today-view.test.tsx` は priority に触れない. |

### スコープ最小化の結論

本 feature は **「PATCH の priority 受理経路の追加」と「UI 上の優先度操作 + 表示」と「該当する追加テスト」のみ** に絞る. データモデル変更・新規エンドポイント・新規ミドルウェアは一切不要.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | **PATCH `/api/v1/tasks/{id}`** のリクエストスキーマを `priority` 対応に拡張. 既存の 200 / 400 / 404 / 412 のステータスと code（`INVALID_PRIORITY` は POST で既に確立済を流用）. 新規エンドポイント追加なし. |
| DB | 変更なし（priority カラムは BL-001 で確定済）. |
| モジュール | サーバ: `server/src/app.ts` の PATCH ハンドラに priority の検証・patch への積込みを追加. ドメイン: `domain/src/task/index.ts` の `UpdateTaskInput` / `updateTask` に priority サポートを追加. クライアント: `web/src/repositories/task-repository.ts` の `UpdateTaskCommand.patch` と `HttpTaskRepository.update` に priority を追加. UI: `web/src/ui/today-view/today-view.tsx` に優先度 select（起票）・優先度操作ボタン（一覧）・優先度ラベル表示を追加. |
| UI | 起票フォームに「優先度（任意, 既定: 普通）」select を追加. タスク一覧の各行に, 現在の優先度ラベルと優先度変更操作（cycle ボタン. 詳細は D-001）を追加. |
| ドキュメント | `docs/developer/architecture/api/openapi.yaml` の `TaskPatch` スキーマに `priority` プロパティを追加. `database/schema.md` は変更なし（priority カラムは既に定義済）. ADR は新規作成不要. |

## 設計詳細

### データモデル

変更なし. BL-001 で確定した Task の `priority` カラムをそのまま使う.

- `priority`: `TEXT + CHECK`, NOT NULL, enum = `"highest" | "normal" | "later"`, default `"normal"`（`docs/developer/architecture/database/schema.md` §Task L41）.

### 処理フロー

#### 1. PATCH /api/v1/tasks/{id} に priority を追加（差分のみ）

BL-001 の処理フロー（[`../task-crud/plan.md`](../task-crud/plan.md) §処理フロー §2）に, 以下の差分を加える.

```
... (BL-001 既存)
├─ zod でリクエスト検証（部分更新フィールド. dueDate / name / projectId / priority を受理）
   ├─ priority が指定されたが値域外 → 400 INVALID_PRIORITY（ロールバック）
└─ server/app/task-usecases/update-task:
    ├─ ... (BL-001 既存. version 検証 / projectId 参照確認)
    ├─ domain/task/update で差分適用
    │   └─ patch.priority が指定されていれば current.priority を上書き
    ├─ task-repository.update（version + 1, updatedAt 更新）
    └─ 200 OK（更新後 task を返す）
```

#### 2. Web UI: 起票フォーム

```
起票フォーム
  └─ タスク名 (required)
  └─ プロジェクト (任意)
  └─ 期限 (select: 今日 / 明日, 既定: 今日)
  └─ 優先度 (select: 最優先 / 普通 / 後回し, 既定: 普通) ← 本機能で追加
  └─ 追加ボタン
       └─ Repository.create({ id, name, projectId, dueDate, priority })
```

`Repository.create` の引数に `priority` を渡せるように `CreateTaskCommand` を拡張（既に `priority?` が型上不要なら追加, 既存型を確認のうえ最小差分で実装）.

> 補足: `CreateTaskCommand`（`web/src/repositories/task-repository.ts` L13-18）は現在 `priority` を含まない. 追加が必要. ただし `HttpTaskRepository.create` の body 組み立て（L117-127）は `cmd.dueDate !== undefined ? body.dueDate = ...` と同じパターンで priority を加えるだけ.

#### 3. Web UI: タスク行の優先度変更（cycle ボタン. D-001 採用案）

```
<li> 牛乳を買う [優先度: 普通] [編集] [明日へ] [削除] [優先度を切替]
                                                       └ クリック 1 回で normal → highest → later → normal の cycle
                                                          └ Repository.update({ id, ifMatch: task.version, patch: { priority: next } })
```

- 「優先度を切替」ボタンには現在値ラベル（最優先 / 普通 / 後回し）を併記して, クリックで次段階に遷移することを示唆する.
- 一覧側で重要な「現在の優先度を視認できる」点は ラベル `[優先度: 普通]` 等の表示でも担保（D-002）.

### 例外 / エラー処理

| HTTP ステータス | code | 発生条件 | 既存 / 新規 |
| --- | --- | --- | --- |
| 400 | `INVALID_PRIORITY` | PATCH の `priority` が enum 外（`"highest" / "normal" / "later"` 以外） | 既存 code を新たな経路（PATCH）で使う |

その他の 400 / 401 / 404 / 412 / 既存 code はすべて BL-001 で確立済の挙動を継承する.

## 重要な決定

- **D-001: 一覧行の優先度変更 UI は cycle ボタン**（クリック 1 回で `normal → highest → later → normal` を循環する）.
  - 採用理由: NFR-001（単一ワークフロー）/ NFR-010（最小手数）を最重視. select / segmented control はクリック数が増え, 画面に専用領域を取るため. cycle ボタン上のラベルに現在値を併記し, 押下で次段階に進む（U-003 保守側案を採用）.
  - 不採用案: select はモバイル端末で意図せず開く / 閉じる操作が増える. segmented control は 3 つの選択肢が常時表示されて画面が情報過多になる.
- **D-002: 起票フォームの優先度入力は select で良い**（cycle と統一しない）.
  - 採用理由: 起票時は「タスク名を打ち込んだ直後に 1 つの値を即決」したいケースが多いため, トグル循環より直接選択の方が手数が少ない. NFR-010 に整合.
- **D-003: PATCH のリクエストは BL-001 D-002 を踏襲し「単純な部分上書き」**.
  - `priority` のみを送る PATCH も, `name` / `dueDate` / `projectId` と同時送信する PATCH も受理する. 受理した値だけを `updateTask` に渡す.
- **D-004: 優先度の UI 表記は「最優先 / 普通 / 後回し」で固定**（U-002 保守側案を採用. project.md §8 In Scope の語彙と一致）.
- **D-005: 優先度に基づく行の視覚的強調（色・アイコン・太字等）は最小限**.
  - NFR-001 を侵さない範囲で, ラベル文言のみで表現することを既定とする. 配色などは BL-005（今日ビュー本実装）で再検討するため, 本機能では装飾を入れない.
- **本機能では ADR を新規作成しない**. 大規模判断（プロトコル変更, アーキ層変更等）はない.

## リスク / 代替案

- **R-001: BL-005 着手時に並び順仕様が変わるリスク**. 本機能の UI は BL-001 の暫定 3 段ソートをそのまま継承する. BL-005 で本決定された並びが priority 軸を変える場合, 本機能の UI 表示順は再検討対象となる. ただし本機能の責務は「priority 変更時に再計算が走ること」であり, 並び規則そのものではない. リスクは限定的.
- **R-002: cycle ボタンの操作性が悪い場合**. クリック 1 回で次段階に進む仕様は, 「特定の段階に一足跳びにしたい」操作（normal から later に直接行きたい）には 2 クリック必要. 利用してみて手数増を感じる場合, BL-005 の UI 再設計時に select / dropdown に切り替える余地を残す.
- **R-003: PATCH で priority が受理されるようになると, BL-001 のテスト前提が暗黙に変わるリスク**. BL-001 の結合テストは priority を PATCH しないが, 本機能で priority を受理しても **既存テストは引き続き green であるべき**（priority を patch に含めない PATCH の挙動は不変）. 既存テストが落ちる場合, 実装が部分上書き原則（D-003）を破っている兆候であり, 即座に差し戻す.
- **代替案: 優先度を別エンドポイント `POST /api/v1/tasks/{id}/priority` として分離する**. 採用しない. ADR-0010 / BL-001 D-002 の「単純な部分上書き PATCH」と整合せず, エンドポイント数が増えるだけで利点がない.
- **代替案: 起票時の既定優先度をユーザー設定にする**. 採用しない. NFR-012（設定項目最小化）に反する.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md). BL-001 で確立した「結合テスト = `server/__tests__/integration/tasks.test.ts`, UI 単体 = `web/__tests__/today-view.test.tsx`」の枠組みに乗せる.

### 単体テスト（ドメイン）

- `domain/task/updateTask` の priority 部分上書き（指定時のみ上書き, 未指定は不変, version+1, createdAt 不変）.
- `domain/task/updateTask` の priority 値域違反（`INVALID_PRIORITY` を返す）.

### 結合テスト（サーバ）

spec.md §「優先度の変更（FR-004）」の Gherkin シナリオを `tasks.test.ts` に追加する. シナリオと 1:1 で対応.

- PATCH で priority を normal → highest に変更（version+1, 他フィールド不変, createdAt 不変）.
- PATCH で priority を later → highest に変更.
- PATCH で priority を normal → later に変更.
- PATCH で priority 値域外 → 400 INVALID_PRIORITY, ストア不変.
- PATCH で name と priority を同時に変更.
- 起票時に priority 省略 → normal（spec.md「起票時の優先度」の追加シナリオ）.
- 起票時に priority = "highest" を明示.
- 起票時に priority = "later" を明示.

> 既に BL-001 で担保されているもの（priority 値域外の起票 → 400 INVALID_PRIORITY, 楽観ロック 412, If-Match 欠落 400, Idempotency-Key 欠落 400, 404 / 401）は再テストしない.

### 単体テスト（クライアント）

spec.md §「Web クライアント UI」を `today-view.test.tsx` に追加する.

- 起票フォームに「優先度」相当の任意項目が表示され, 値域が 3 段階のみであること.
- 起票フォームで優先度を「最優先」に指定して送信 → `Repository.create` の `priority` が `"highest"` で呼ばれる.
- 起票フォームで優先度を未操作のまま送信 → `priority` が `"normal"`（または省略）で呼ばれる.
- タスク行から優先度を変更 → `Repository.update` の `patch.priority` が指定値で呼ばれる, `ifMatch` が現在の `version` と一致.
- 優先度変更後の一覧並びが priority 順に再描画される.

### E2E

- 本機能では新規 E2E を追加しない（BL-001 の E2E が将来整備されたタイミングで「優先度を切り替える」シナリオを 1 つ追加する程度に留める）.

### カバレッジ目標

- ドメイン `updateTask` の priority 経路: 100%（純粋関数, シナリオ数が少ない）.
- API PATCH ハンドラの priority 経路: 主要分岐すべて（正常系 3 段階遷移 + 値域違反 + 他フィールド併用）.
- UI: spec.md の 5 シナリオが green.

### 重視するもの

- **BL-001 と重複しない網羅性**. 既に BL-001 で担保されている共通経路（楽観ロック, Idempotency-Key, 認証, 404 等）は本機能では再テストしない. 重複追加された場合は test-designer / auditor の段階で削減する.
- **PATCH の部分上書き原則の不変**. 優先度を追加したことで, priority を含まない PATCH の挙動が変わっていないことを既存テストで担保する（追加・変更しない既存テストが全件 green であることが受け入れ条件の一部）.
