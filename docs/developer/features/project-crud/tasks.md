# タスク: プロジェクト管理（作成・名称変更・削除）

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## サーバ - データ層

- [ ] `ProjectRepository` インターフェースに `insert / findById / list / update / delete / nullifyProjectId` を追加する（`server/src/data/project-repository.ts`）
- [ ] `DrizzleProjectRepository` に上記 6 メソッドを実装する（`server/src/infra/persistence/drizzle/project-repository.ts`）
  - `list()`: `name` 昇順ソート
  - `delete(id)`: 物理削除
  - `nullifyProjectId(projectId)`: 該当タスクの `project_id` を null に更新（version / updated_at は変更しない）

## サーバ - アプリケーション層

- [ ] `AppDeps` に `projectRepository` の型を拡張版に変更する（`app.ts`）
- [ ] `POST /api/v1/projects` ハンドラを実装する（バリデーション + insert + 201）
- [ ] `GET /api/v1/projects` ハンドラを実装する（list + 200）
- [ ] `PATCH /api/v1/projects/:id` ハンドラを実装する（findById → 楽観ロック → バリデーション → update + 200）
- [ ] `DELETE /api/v1/projects/:id` ハンドラを実装する（findById → 楽観ロック → トランザクション内で nullifyProjectId + delete → 204）

## Web クライアント - Repository 層

- [ ] `web/src/repositories/project-repository.ts` を新設する（`Project` 型、`ProjectRepository` インターフェース、`HttpProjectRepository` 実装）

## Web クライアント - UI 層

- [ ] `TodayView` の起票フォームを変更する
  - `projectId` のテキスト入力をセレクトボックスに置き換える
  - `TodayViewProps` に `projectRepository: ProjectRepository` を追加する
  - マウント時に `projectRepository.list()` を並列フェッチしてセレクトボックスに表示する
  - 先頭に「（未分類）」選択肢（value = `""`、送信時 `projectId: null`）を追加する
- [ ] `web/src/ui/projects-view/projects-view.tsx` を新設する（一覧・作成フォーム・名称変更・削除）
- [ ] `web/src/main.tsx` に `/projects` ルートを追加し、`HttpProjectRepository` をインスタンス化して渡す

## テスト

- [ ] サーバ結合テスト: `POST /api/v1/projects` 正常系・バリデーション・冪等性・認証
- [ ] サーバ結合テスト: `GET /api/v1/projects` 正常系（name 昇順、空一覧）・認証
- [ ] サーバ結合テスト: `PATCH /api/v1/projects/:id` 正常系・楽観ロック衝突・If-Match なし・存在しない id・バリデーション
- [ ] サーバ結合テスト: `DELETE /api/v1/projects/:id` 正常系・カスケード NULL・楽観ロック衝突・If-Match なし・存在しない id・認証
- [ ] Web 単体テスト: `TodayView` 起票フォームにプロジェクトドロップダウンが表示される
- [ ] Web 単体テスト: `ProjectsView` 一覧表示・作成・名称変更・削除の各操作

## ドキュメント

- [ ] `docs/developer/architecture/api/openapi.yaml` に `/api/v1/projects` 系エンドポイントを追加する

## 仕上げ

- [ ] spec.md の受け入れ基準（Gherkin シナリオ）すべてに対応するテストが green
- [ ] auditor によるレビュー依頼
