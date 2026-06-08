# テストカタログ

全 42 ファイル・557 件（2026-06-08 時点）。`npm test` で一括実行できる。

バグを発見した場合は「症状の種類」列から対応ファイルを特定し、該当テストを確認する。

---

## ドメイン層

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `domain/__tests__/task.test.ts` | 41 | タスク値オブジェクト（作成・完了・削除・復元・バリデーション） | BL-001〜003, 011 |
| `domain/__tests__/routine.test.ts` | 30 | ルーティン値オブジェクト（作成・編集・曜日バリデーション） | BL-017 |

---

## サーバ層

### 単体テスト

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `server/__tests__/unit/drizzle-task-repository.test.ts` | 8 | TaskRepository の CRUD・論理削除・ゴミ箱清算 | BL-001, 011 |
| `server/__tests__/unit/drizzle-settings-repository.test.ts` | 2 | SettingsRepository の取得・更新 | BL-009 |
| `server/__tests__/unit/daily-reset.test.ts` | 9 | 境界時刻計算・リセット要否判定ロジック | BL-010 |
| `server/__tests__/unit/routine-daily-reset.test.ts` | 9 | 日次リセット時のルーティンタスク生成・翌日非持越し | BL-017 |

### 統合テスト（API エンドポイント）

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `server/__tests__/integration/startup.test.ts` | 2 | サーバ起動・Bearer 認証の基本疎通 | BL-013 |
| `server/__tests__/integration/healthz.test.ts` | 2 | `GET /healthz` の正常応答 | BL-013 |
| `server/__tests__/integration/tasks.test.ts` | 43 | タスク CRUD・優先度・期限・楽観ロック・冪等性・2 階層制約 | BL-001〜003, 007, 012, 015 |
| `server/__tests__/integration/today.test.ts` | 25 | `GET /today` の並び順・completionCount・自動リセット統合 | BL-005, 008, 010 |
| `server/__tests__/integration/focus.test.ts` | 24 | フォーカス設定・解除・自動解除（完了/削除/期限変更時） | BL-006 |
| `server/__tests__/integration/counter.test.ts` | 11 | 完了数カウント +1・削除時非加算・Idempotency-Key 重複防止 | BL-008 |
| `server/__tests__/integration/settings.test.ts` | 14 | 境界時刻の取得・更新・バリデーション・楽観ロック | BL-009 |
| `server/__tests__/integration/reset.test.ts` | 12 | 日次リセット API・冪等性・未完了繰越・ゴミ箱清算 | BL-010 |
| `server/__tests__/integration/trash.test.ts` | 26 | ゴミ箱一覧・復元・空にする・purgeTrash | BL-011 |
| `server/__tests__/integration/projects.test.ts` | 24 | プロジェクト CRUD・名称変更・削除 | BL-016 |
| `server/__tests__/integration/routines.test.ts` | 18 | ルーティン CRUD・編集 | BL-017 |

---

## Web 層

### Repository

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `web/__tests__/http-task-repository.test.ts` | 4 | HttpTaskRepository の CRUD・楽観ロックエラー変換 | BL-001 |
| `web/src/repositories/project-repository.test.ts` | 4 | HttpProjectRepository の CRUD | BL-016 |
| `web/src/repositories/routine-repository.test.ts` | 4 | HttpRoutineRepository の CRUD | BL-017 |
| `web/src/repositories/trash-repository.test.ts` | 4 | HttpTrashRepository の一覧・復元・空にする | BL-011 |
| `web/src/repositories/local-task-repository.test.ts` | 11 | LocalTaskRepository（SQLite）の CRUD・完了・フォーカス | BL-020 |
| `web/src/repositories/local-project-repository.test.ts` | 5 | LocalProjectRepository（SQLite）の CRUD | BL-020 |
| `web/src/repositories/local-routine-repository.test.ts` | 4 | LocalRoutineRepository（SQLite）の CRUD | BL-020 |
| `web/src/repositories/local-settings-repository.test.ts` | 3 | LocalSettingsRepository（SQLite）の取得・更新 | BL-020 |
| `web/src/repositories/local-trash-repository.test.ts` | 3 | LocalTrashRepository（SQLite）の一覧・復元・空にする | BL-020 |

### ユースケース

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `web/src/usecases/local-reset-usecase.test.ts` | 6 | ローカルモードの日次リセット冪等実行 | BL-020 |

### オフライン・PWA

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `web/src/offline-queue.test.ts` | 14 | IndexedDB 書込キューの enqueue・dequeue・flush | BL-018 |
| `web/src/hooks/use-network-status.test.ts` | 4 | オンライン/オフライン状態監視フック | BL-018 |
| `web/src/hooks/use-today-query.test.tsx` | 4 | TanStack Query による今日ビュークエリ | BL-018 |

### UI コンポーネント・受け入れ基準

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `web/__tests__/today-view.test.tsx` | 39 | TodayView（優先度・完了・期限切替・フォーカス・完了数・オフライン書込） | BL-002〜003, 005〜008, 016〜018 |
| `web/__tests__/settings-view.test.tsx` | 10 | SettingsView（境界時刻・サーバ設定・モード切替） | BL-009, 019〜020 |
| `web/src/ui/setup-view/setup-view.test.tsx` | 9 | SetupView（初回起動・サーバ URL バリデーション・ローカルモード選択） | BL-019〜020 |
| `web/src/ui/projects-view/projects-view.test.tsx` | 5 | ProjectsView（作成・削除・名称変更） | BL-016 |
| `web/src/ui/routines-view/routines-view.test.tsx` | 5 | RoutinesView（作成・削除・編集） | BL-017 |
| `web/src/ui/trash-view/trash-view.test.tsx` | 5 | TrashView（一覧・復元・空にする） | BL-011, 014 |
| `web/src/ui/conflict-dialog/conflict-dialog.test.tsx` | 8 | ConflictDialog（競合検出・解決 UI） | BL-018 |
| `web/src/ui/offline-banner/offline-banner.test.tsx` | 4 | OfflineBanner（オフライン中バナー表示） | BL-018 |
| `web/src/router.test.tsx` | 5 | ルーティング設定（画面遷移） | BL-014 |

---

## ドキュメント検証

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `web/__tests__/oss-release-prep.test.ts` | 35 | LICENSE・README・CONTRIBUTING・package.json フィールド・依存ライセンス・秘密情報スキャン | BL-022 |
| `web/__tests__/play-store-release.test.ts` | 36 | プライバシーポリシー・ストア掲載情報・データセーフティ・ポリシーチェックリスト | BL-023 |
| `web/__tests__/v1-stabilization.test.ts` | 26 | 要件カバレッジ監査・テスト通過記録・リリースチェックリスト | BL-024 |
