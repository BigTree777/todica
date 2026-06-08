# タスク: Web クライアント基盤（ルーティング + TrashView）

## 実装

### T-01: react-router-dom の追加

- [ ] `web/package.json` の `dependencies` に `react-router-dom` を追加する（v6 系最新安定版）
- [ ] TypeScript 型定義（`@types/react-router-dom`）が必要な場合は `devDependencies` に追加する（v6 では内蔵されているため不要の可能性が高い）

### T-02: TrashRepository の作成

- [ ] `web/src/repositories/trash-repository.ts` を新規作成する
  - `TrashedTask` インターフェース（`id`, `name`, `trashedAt`, `trashedReason`, `version`）
  - `RestoreTaskCommand` インターフェース（`id`, `ifMatch`）
  - `TrashRepository` インターフェース（`list()`, `restore()`, `empty()`）
  - `RestoreConflictError` クラス（`currentTask: TrashedTask` を保持）
  - `HttpTrashRepository` クラス（`baseUrl`, `authToken` を受け取る）
    - `list()`: GET `/api/v1/trash` → `{ tasks: TrashedTask[] }` → `TrashedTask[]` を返す
    - `restore(cmd)`: POST `/api/v1/trash/:id/restore` に `Idempotency-Key`（UUID v4）+ `If-Match` を付ける。412 時は `RestoreConflictError` を throw
    - `empty()`: DELETE `/api/v1/trash` に `Idempotency-Key` を付ける。204 で正常終了

### T-03: TrashView の作成

- [ ] `web/src/ui/trash-view/trash-view.tsx` を新規作成する
  - `TrashViewProps` インターフェース（`repository: TrashRepository`）
  - マウント時に `repository.list()` を呼び出して `tasks` state を更新する（cancel フラグ付き cleanup）
  - `<main>` + `<h1>ゴミ箱</h1>` を持つ構造
  - `<ul aria-label="ゴミ箱のタスク一覧">` にタスク名 + 「復元」ボタン（各タスク行）
  - タスクが 0 件のとき「ゴミ箱は空です」を表示
  - 「ゴミ箱を空にする」ボタン（`repository.empty()` → 成功後に `list()` で再取得）
  - 「復元」ボタン（`repository.restore({ id, ifMatch: task.version })` → 成功後に `list()` で再取得）

### T-04: main.tsx の書き換え

- [ ] `web/src/main.tsx` を `BrowserRouter` + `Routes` を使った構成に書き換える
  - `HttpSettingsRepository`・`HttpTrashRepository` のインスタンスを `main.tsx` 内で構築する
  - ルート定義:
    - `"/"` → `<Navigate to="/today" replace />`
    - `"/today"` → `<TodayView repository={taskRepository} />`
    - `"/settings"` → `<SettingsView repository={settingsRepository} />`
    - `"/trash"` → `<TrashView repository={trashRepository} />`

## テスト

### T-05: HttpTrashRepository の単体テスト

- [ ] `web/src/repositories/trash-repository.test.ts` を新規作成する
  - `list()` が GET `/api/v1/trash` を呼び出し `TrashedTask[]` を返すことを検証
  - `restore()` が POST に `Idempotency-Key` + `If-Match` ヘッダを付けることを検証
  - `restore()` が 412 を受けたとき `RestoreConflictError` を throw することを検証
  - `empty()` が DELETE に `Idempotency-Key` ヘッダを付けることを検証

### T-06: TrashView の単体テスト

- [ ] `web/src/ui/trash-view/trash-view.test.tsx` を新規作成する
  - タスク一覧が表示されることを検証（モック `list()` が [T1, T2] を返す）
  - ゴミ箱が空のとき「ゴミ箱は空です」が表示されることを検証
  - 「復元」ボタンクリックで `restore({ id: T1.id, ifMatch: T1.version })` が呼ばれ一覧が更新されることを検証
  - 「ゴミ箱を空にする」ボタンクリックで `empty()` が呼ばれ一覧が更新されることを検証

### T-07: ルーティングの単体テスト

- [ ] `web/src/router.test.tsx`（または `web/src/main.test.tsx`）を新規作成する
  - `MemoryRouter initialEntries={["/"]}` で `/today` にリダイレクトされることを検証
  - `MemoryRouter initialEntries={["/today"]}` で TodayView（`<h1>今日</h1>`）がレンダリングされることを検証
  - `MemoryRouter initialEntries={["/settings"]}` で SettingsView（`<h1>設定</h1>`）がレンダリングされることを検証
  - `MemoryRouter initialEntries={["/trash"]}` で TrashView（`<h1>ゴミ箱</h1>`）がレンダリングされることを検証

## 仕上げ

- [ ] 既存テスト（`today-view.test.tsx`・`settings-view.test.tsx`）が引き続き green であることを確認
- [ ] `vitest run` で全テストが green であることを確認
- [ ] 受け入れ基準（`spec.md`）を全て満たすことを確認
- [ ] レビュー依頼
