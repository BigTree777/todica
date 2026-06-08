# 設計・実装計画: Web クライアント基盤（ルーティング + TrashView）

## 方針概要

`react-router-dom` を導入して `main.tsx` に `BrowserRouter` + `Routes` を設置する。
TrashView は TodayView・SettingsView と同じパターン（props 注入 + `useState + useEffect`）で実装する。
TrashRepository インターフェースを新規定義し、`HttpTrashRepository` で HTTP に委譲する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| 依存関係 | `web/package.json` に `react-router-dom` を追加 |
| エントリポイント | `web/src/main.tsx` を `BrowserRouter` + `Routes` に書き換え |
| リポジトリ層 | `web/src/repositories/trash-repository.ts` を新規作成 |
| UI 層 | `web/src/ui/trash-view/trash-view.tsx` を新規作成 |
| 既存コンポーネント | TodayView・SettingsView への変更なし |
| テスト | `web/src/ui/trash-view/trash-view.test.tsx` を新規作成 |

## 設計詳細

### D-001: ルーティング構成

`main.tsx` を以下の構造に書き換える。

```
BrowserRouter
  Routes
    Route path="/"       → <Navigate to="/today" replace />
    Route path="/today"  → <TodayView repository={taskRepository} />
    Route path="/settings" → <SettingsView repository={settingsRepository} />
    Route path="/trash"  → <TrashView repository={trashRepository} />
```

各 View に注入する Repository インスタンスは `main.tsx` 内で一括構築する。
環境変数（`VITE_API_BASE_URL`・`VITE_AUTH_TOKEN`）の読み取りも同ファイルに集約する。

### D-002: TrashRepository インターフェース

```typescript
// web/src/repositories/trash-repository.ts

export interface TrashedTask {
  id: string;
  name: string;
  trashedAt: string;
  trashedReason: "deleted" | "completed";
  version: number;
}

export interface RestoreTaskCommand {
  id: string;
  ifMatch: number;
}

export interface TrashRepository {
  list(): Promise<TrashedTask[]>;
  restore(cmd: RestoreTaskCommand): Promise<TrashedTask>;
  empty(): Promise<void>;
}

export class RestoreConflictError extends Error {
  constructor(public readonly currentTask: TrashedTask) {
    super("Conflict: version mismatch on restore");
    this.name = "RestoreConflictError";
  }
}
```

**TrashedTask は Task の部分型として設計する。** BL-011 の `/trash` レスポンスは Task と同形の JSON を返すため、必要なフィールドのみ抽出したインターフェースを定義する。実装上は Task 型をそのまま使っても構わないが、TrashView が必要とするフィールドに限定する。

### D-003: HttpTrashRepository の設計

各メソッドのマッピング:

| メソッド | HTTP | エンドポイント | ヘッダ |
| --- | --- | --- | --- |
| `list()` | GET | `/api/v1/trash` | Authorization |
| `restore(cmd)` | POST | `/api/v1/trash/:id/restore` | Authorization, Idempotency-Key (UUID v4), If-Match |
| `empty()` | DELETE | `/api/v1/trash` | Authorization, Idempotency-Key (UUID v4) |

- `restore()` が 412 を受けた場合、レスポンスボディの `{ task }` を取り出して `RestoreConflictError` を throw する。
- `empty()` は 204 を正常とし、void を返す。
- UUID v4 生成は `task-repository.ts` の `uuidV4()` と同一のロジックをコピーする（共通ユーティリティへの切り出しは本 feature のスコープ外）。

### D-004: TrashView の設計

TodayView・SettingsView と同パターン（`useState + useEffect`）を採用する。

**状態:**
- `tasks: TrashedTask[]` — ゴミ箱一覧
- `loading: boolean` — 初回取得中フラグ（任意。表示上の優先度は低い）

**ライフサイクル:**
1. マウント時に `repository.list()` を呼び出して `tasks` を更新する（cancel フラグで cleanup）。
2. 復元ボタンクリック: `repository.restore({ id, ifMatch })` → 成功後に `repository.list()` で再取得。
3. 「ゴミ箱を空にする」ボタンクリック: `repository.empty()` → 成功後に `repository.list()` で再取得。

**Props:**
```typescript
export interface TrashViewProps {
  repository: TrashRepository;
}
```

**レンダリング要件:**
- `<h1>ゴミ箱</h1>` を持つ `<main>` を返す。
- タスク一覧: `<ul aria-label="ゴミ箱のタスク一覧">` にタスク名と復元ボタンを並べる。
- ゴミ箱が空のとき「ゴミ箱は空です」テキストを表示する。
- 「ゴミ箱を空にする」ボタンは常時表示する（空のときはクリックしても `empty()` を呼ぶが UI 上は問題ない）。

### D-005: テスト設計方針

既存コンポーネントテスト（`today-view.test.tsx`・`settings-view.test.tsx`）と同パターンを踏襲する。

- `vi.fn()` でモック TrashRepository を作り、`TrashViewProps.repository` に注入する。
- `@testing-library/react` の `render` + `screen` + `userEvent` を使う。
- 非同期フェッチは `await screen.findBy*` または `waitFor` で解決を待つ。
- ルーティングのテストは `MemoryRouter` を使ってルート解決をシミュレートする。

### D-006: main.tsx の書き換え

現在の `main.tsx` は `TaskRepository` のみ構築しているが、書き換え後は以下の 3 つを構築する。

- `HttpTaskRepository` — TodayView に渡す（変更なし）
- `HttpSettingsRepository` — SettingsView に渡す（新規）
- `HttpTrashRepository` — TrashView に渡す（新規）

3 つのインスタンスはすべて同じ `BASE_URL` と `AUTH_TOKEN` を使う。

## 重要な決定

- TanStack Query を導入しない。既存パターンの `useState + useEffect` を維持することで、学習コスト・バンドルサイズの増加を避ける。
- `Navigate` による `/` → `/today` のリダイレクトに `replace` を付ける。ブラウザ履歴に `/` を残さないため。
- `TrashedTask` を `Task` の部分型として別定義する。TrashView が必要とするフィールドを明示することで、将来の Task 型変更の影響を局所化する。

## リスク / 代替案

- **react-router-dom のバージョン**: v6 を採用する。v7 は API が安定しているが Remix との統合を前提とした破壊的変更が入る可能性があるため、v6 系の最新安定版を使う。
- **リダイレクト実装**: `<Navigate>` コンポーネントを使う。`loader` や `beforeLoad` は v6 では不要。

## テスト方針

- TrashView の単体テスト: モック Repository を注入して一覧表示・復元・空にするの各操作を検証する。
- ルーティングの単体テスト: `MemoryRouter` + `Routes` を組み合わせて各パスで期待するコンポーネントがレンダリングされることを検証する。
- HttpTrashRepository の単体テスト: `vi.stubGlobal('fetch', ...)` または `msw` を使って HTTP 呼び出しを検証する。
