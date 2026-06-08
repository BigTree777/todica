# 設計・実装計画: プロジェクト管理（作成・名称変更・削除）

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

既存の `projects` テーブルおよび `ProjectRepository` インターフェースを拡張して CRUD 操作を追加する。
サーバ側は task-crud と同一パターン（Idempotency-Key・If-Match・楽観ロック）に統一する。
Web クライアント側は独立した `ProjectRepository` を新設し、TodayView の起票フォームをテキスト入力からセレクトボックスに変更する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | `POST/GET/PATCH/DELETE /api/v1/projects` の 4 エンドポイントを追加 |
| DB | `projects` テーブルのスキーマは変更なし（既存定義を流用）。カスケード NULL の実行はアプリケーション層で担保 |
| サーバ - data 層 | `ProjectRepository` インターフェースに `insert / list / findById / update / delete / nullifyProjectId` を追加 |
| サーバ - infra 層 | `DrizzleProjectRepository` に上記メソッドを実装 |
| サーバ - app 層 | `app.ts` に `/api/v1/projects` 系ハンドラを追加 |
| Web - repository 層 | `web/src/repositories/project-repository.ts` を新設 |
| Web - UI 層 | `TodayView` の起票フォームをテキスト入力→セレクトボックスに変更。`ProjectsView` を新設 |
| Web - ルーティング | `main.tsx` に `/projects` ルートを追加 |

## 設計詳細

### データモデル

既存の `projects` テーブル（`server/src/db/schema.ts`）を流用する。スキーマ変更は不要。

```
Project {
  id:        string   (UUID v4, クライアント採番)
  name:      string   (1〜200 文字、制御文字 [\x00-\x1F\x7F] 禁止)
  version:   number   (楽観ロック用, 初期値 1, 更新時 +1)
  createdAt: string   (ISO 8601 UTC)
  updatedAt: string   (ISO 8601 UTC)
  trashedAt: string | null   (既存フィールド。BL-016 では書き込まない。論理削除ではなく物理削除を採用)
}
```

#### D-001: trashedAt フィールドの扱い

BL-016 ではアーカイブを非ゴールとしているため、削除は `trashedAt` を使った論理削除ではなく**物理削除**を採用する。
`trashedAt` フィールドは BL-001 で既存スキーマに含まれているが、BL-016 の DELETE では書き込まない。
`DrizzleProjectRepository.exists()` が `trashedAt IS NULL` を条件にしているため、
物理削除後は `exists()` が正しく false を返す（整合性に問題なし）。

#### D-002: 同名プロジェクトの許容

プロジェクト名の一意性制約は設けない。同名プロジェクトを複数作成することを許容する。

### API 設計

#### POST /api/v1/projects

- 認証必須（既存 authMiddleware で処理済み）
- Idempotency-Key 必須（既存 idempotencyMiddleware で処理済み）
- リクエストボディ: `{ id: string, name: string }`
  - `id` はクライアント（UUID v4）が採番して送信する（task-crud パターンに統一）
- バリデーション:
  - `name` が文字列でない → 400 `INVALID_PROJECT_NAME`
  - `name` が空文字 → 400 `INVALID_PROJECT_NAME`
  - `name` が 200 文字超 → 400 `INVALID_PROJECT_NAME`
  - `name` に制御文字（`\x00-\x1F\x7F`）を含む → 400 `INVALID_PROJECT_NAME`
- 成功: 201 `{ project }`

#### GET /api/v1/projects

- 認証必須
- ソート: `name` 昇順（コレーション依存の ASCII ソート。SQLite の既定コレーション BINARY を使用）
- 成功: 200 `{ projects: Project[] }`

#### PATCH /api/v1/projects/{id}

- 認証必須
- If-Match 必須（欠落時 400 `MISSING_IF_MATCH`）
- Idempotency-Key 必須
- リクエストボディ: `{ name: string }`
- 処理フロー:
  1. `findById(id)` → 存在しない場合 404 `PROJECT_NOT_FOUND`
  2. `version !== ifMatch` → 412 `{ project: current }`
  3. name バリデーション → 400 `INVALID_PROJECT_NAME`
  4. `update(project)` → 200 `{ project }`

#### DELETE /api/v1/projects/{id}

- 認証必須
- If-Match 必須（欠落時 400 `MISSING_IF_MATCH`）
- Idempotency-Key 必須
- 処理フロー:
  1. `findById(id)` → 存在しない場合 404 `PROJECT_NOT_FOUND`
  2. `version !== ifMatch` → 412 `{ project: current }`
  3. トランザクション内で:
     a. `nullifyProjectId(id)` — 該当 `projectId` を持つ全タスクの `projectId` を null に更新（version / updatedAt は変更しない）
     b. `delete(id)` — projects テーブルから物理削除
  4. 204 No Content

#### D-003: カスケード NULL のトランザクション保証

プロジェクト削除とタスクの `projectId` null 化は**同一トランザクション**で実行する。
既存の `db?: BetterSQLite3Database` フィールドを `AppDeps` に拡張して渡す（daily-reset パターンと同様）。
テスト環境でも `db` を渡してトランザクションをテストする。

#### D-004: カスケード NULL によるタスクへの影響

- `projectId` を null に変更するだけ。タスクの他フィールド（name, dueDate, priority, version, updatedAt 等）は変更しない。
- タスクをゴミ箱に移動しない（`trashedAt` は変更しない）。
- FocusSelection への影響なし（projectId の変更は focus 解除の対象外）。

### ProjectRepository インターフェース拡張

```typescript
export interface ProjectRepository {
  exists(id: string): Promise<boolean>;          // 既存（BL-001）
  insert(project: Project): Promise<void>;       // 追加
  findById(id: string): Promise<Project | null>; // 追加
  list(): Promise<Project[]>;                    // 追加（name 昇順）
  update(project: Project): Promise<void>;       // 追加
  delete(id: string): Promise<void>;             // 追加（物理削除）
  nullifyProjectId(projectId: string): Promise<void>; // 追加（カスケード NULL）
}
```

### Web クライアント

#### ProjectRepository インターフェース（新設）

`web/src/repositories/project-repository.ts` を新設する。

```typescript
export interface Project {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectCommand { id: string; name: string; }
export interface UpdateProjectCommand { id: string; ifMatch: number; name: string; }
export interface DeleteProjectCommand { id: string; ifMatch: number; }

export interface ProjectRepository {
  list(): Promise<Project[]>;
  create(cmd: CreateProjectCommand): Promise<Project>;
  update(cmd: UpdateProjectCommand): Promise<Project>;
  delete(cmd: DeleteProjectCommand): Promise<void>;
}
```

`HttpProjectRepository` として HTTP 実装を同ファイルに提供する。

#### TodayView 起票フォームの変更

- 現行: `projectId` をテキスト入力（`<input type="text">`）で受け付けている
- 変更後: `GET /api/v1/projects` で取得したプロジェクト一覧をセレクトボックスで表示する
- 選択肢の先頭に「（未分類）」を追加し、選択値 = `null` とする
- マウント時に `projectRepository.list()` を並列フェッチする
- `TodayViewProps` に `projectRepository: ProjectRepository` を追加する

#### ProjectsView（新設）

`web/src/ui/projects-view/projects-view.tsx` を新設する。
シンプルな実装とし、以下のみ提供する:
- プロジェクト一覧表示
- 作成フォーム（name 入力 + 追加ボタン）
- 各行に名称変更ボタン（インライン編集）と削除ボタン

`/projects` ルートを `main.tsx` に追加する。

### エラーハンドリング

| 状況 | status | code / body |
| --- | --- | --- |
| 空 name / 200 文字超 / 制御文字 | 400 | `INVALID_PROJECT_NAME` |
| 存在しない id（PATCH/DELETE） | 404 | `PROJECT_NOT_FOUND` |
| If-Match 不一致 | 412 | `{ project: current }` |
| If-Match ヘッダなし | 400 | `MISSING_IF_MATCH` |
| Idempotency-Key ヘッダなし | 400 | `MISSING_IDEMPOTENCY_KEY` |
| 認証なし | 401 | `UNAUTHORIZED` |

## 重要な決定

- D-001: プロジェクト削除は論理削除（trashedAt）ではなく物理削除を採用する
  - アーカイブ（非表示化）はスコープ外のため、ソフトデリートの複雑さを持ち込まない
  - 既存の `exists()` メソッドが `trashedAt IS NULL` 条件を持つが、物理削除後は行自体が存在しないため正しく false を返す
- D-002: プロジェクト名の一意性制約なし（同名プロジェクトを複数作成可能）
- D-003: プロジェクト削除とカスケード NULL は同一トランザクションで実行する
- D-004: カスケード NULL はタスクの version / updatedAt を変更しない（projectId フィールドのみ null 化）
- D-005: `id` はクライアント（UUID v4）採番とする（POST /api/v1/tasks と同パターン）

## リスク / 代替案

- カスケード NULL でタスクの version / updatedAt を更新しない設計（D-004）は、
  クライアントが保持している旧 version でも PATCH 可能な状態が続く。
  これは仕様上の許容事項とする（タスクのデータ変化としては `projectId: null` への変化のみであり、
  ユーザー操作の観点ではタスク本体が変化したとは見なさない）。
- ProjectsView の実装は BL-016 スコープ内で最小限にとどめ、将来の機能拡張に備える。

## テスト方針

- サーバ結合テスト: 4 エンドポイントの正常系・エラー系・冪等性・楽観ロック衝突・カスケード NULL をカバーする
- Web 単体テスト: `ProjectsView` の描画、起票フォームのプロジェクト選択、`ProjectRepository` の HTTP 呼び出し
- カスケード NULL は特に重要なシナリオのため、結合テストで必ずカバーする
