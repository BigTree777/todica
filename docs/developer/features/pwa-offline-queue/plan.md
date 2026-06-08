# 設計・実装計画: PWA 化 + オフライン書込キュー

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

5 つの独立したフェーズに分割して段階的に導入する。各フェーズは単独でテスト可能・デプロイ可能
な単位とし、次フェーズの前提が壊れないことを結合テストで保証する。既存の
`TaskRepository` / `ProjectRepository` 等のインターフェースは維持し、内部実装のみ変更する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API（サーバ） | 変更なし（Idempotency-Key / If-Match は実装済み） |
| DB（サーバ） | 変更なし |
| `web/package.json` | `vite-plugin-pwa`・`idb`・`@tanstack/react-query`・`workbox-*` を追加 |
| `web/vite.config.ts` | `vite-plugin-pwa` プラグインの追加・Manifest / SW 設定 |
| `web/src/main.tsx` | `QueryClientProvider` でルートをラップ |
| `web/src/repositories/` | 各 Repository の HTTP 実装はそのまま。書込キュー層を `offline-queue.ts` として追加 |
| `web/src/ui/` | 各 View の `useState` + `fetch` を `useQuery` / `useMutation` に置換 |
| `web/src/sw/` | Service Worker ロジック（Workbox ストラテジー設定）を新規追加 |
| `web/src/ui/conflict-dialog/` | 衝突解決ダイアログコンポーネントを新規追加 |
| `web/public/` | PWA アイコン画像（192×192 / 512×512）を追加 |

## 設計詳細

### フェーズ A: PWA 基盤

#### Manifest 設定（`vite.config.ts` 内 `VitePWA` プラグイン）

```
name:       "Todica"
short_name: "Todica"
start_url:  "/"
display:    "standalone"
background_color: "#ffffff"
theme_color: "#000000"
icons:
  - src: /icons/pwa-192.png,  sizes: 192x192, type: image/png
  - src: /icons/pwa-512.png,  sizes: 512x512, type: image/png
  - src: /icons/pwa-512.png,  sizes: 512x512, type: image/png, purpose: maskable
```

#### Service Worker: pre-cache 対象

Workbox の `generateSW` モードを使い、ビルド成果物（HTML / JS / CSS / フォント）を
自動 pre-cache する。`navigateFallback: '/index.html'` を設定し、SPA のルーティングに
対応する。

#### SW 更新通知

`vite-plugin-pwa` の `useRegisterSW` フックを `main.tsx` または専用コンポーネントで
呼び出し、`needRefresh` が `true` になったときにバナーを表示する。ユーザーが承認した際に
`updateServiceWorker()` を呼んで即座に新 SW に切り替える。

### フェーズ B: TanStack Query 導入

#### QueryClient 設定

```
defaultOptions:
  queries:
    staleTime:  30_000   # 30 秒（同一キーの再フェッチを抑制）
    gcTime:     300_000  # 5 分（アンマウント後のキャッシュ保持）
    retry:      1        # ネットワークエラー時の自動リトライ回数
  mutations:
    retry: 0             # ミューテーションは自動リトライしない（書込キューが担う）
```

#### クエリキー設計

| クエリキー | 対応 API | 更新トリガー |
| --- | --- | --- |
| `['today']` | `GET /api/v1/today` | タスク系 mutation 成功時 |
| `['focus']` | `GET /api/v1/focus` | `setFocus` mutation 成功時 |
| `['tasks']` | `GET /api/v1/tasks` | タスク系 mutation 成功時（TrashView 等） |
| `['projects']` | `GET /api/v1/projects` | プロジェクト系 mutation 成功時 |
| `['routines']` | `GET /api/v1/routines` | ルーティン系 mutation 成功時 |
| `['trash']` | `GET /api/v1/trash` | タスク系 / ゴミ箱系 mutation 成功時 |
| `['counter']` | `GET /api/v1/counter` | タスク完了 mutation 成功時 |
| `['settings']` | `GET /api/v1/settings` | 設定 mutation 成功時 |

#### View の置換方針

各 View は現在 `useEffect` + `useState` でデータ取得・管理している。置換後は以下の形になる。

- 読み取り: `useQuery({ queryKey, queryFn })` で取得。`data` / `isLoading` / `isError` を参照。
- 書き込み: `useMutation({ mutationFn, onSuccess })` で実行。`onSuccess` で `queryClient.invalidateQueries` を呼ぶ。
- 楽観 UI: 現在の即時 `setTasks` による楽観更新は `useMutation` の `onMutate` / `onError` コールバックで同等に実現する。

View のプロップスインターフェース（`TodayViewProps` 等）と外部から観測できる動作は変えない。

### フェーズ C: 読み取りキャッシュ（stale-while-revalidate）

Workbox の `NetworkFirst` または `StaleWhileRevalidate` ストラテジーを
`GET /api/v1/*` に適用する。

- `StaleWhileRevalidate`: キャッシュが存在すればそれを即座に返し、バックグラウンドで
  最新を取得してキャッシュを更新する。読み取り表示の初速を優先する。
- キャッシュストア名: `api-cache`、最大エントリ数: 50、有効期間: 24 時間

オフライン判定は `navigator.onLine` および `online` / `offline` イベントで行い、
TanStack Query の `networkMode: 'offlineFirst'` を合わせて設定することで、オフライン中でも
キャッシュから `useQuery` の `data` を返せるようにする。

オフライン中は各 View の最上部に「オフライン中 - 表示データは最終同期時のものです」
バナーを表示する。このバナーはグローバルに `useNetworkStatus` フックで制御する。

### フェーズ D: 書込キュー + Background Sync

#### IndexedDB スキーマ

データベース名: `todica-offline-queue`、バージョン: 1

| ストア名 | キー | フィールド |
| --- | --- | --- |
| `write-queue` | `id`（自動採番整数） | `id`, `url`, `method`, `headers`, `body`, `idempotencyKey`, `enqueuedAt`, `retryCount` |

- `enqueuedAt`: ISO 8601 文字列。7 日経過したエントリは再送処理の先頭で破棄する。
- `retryCount`: 再送試行回数。5 回超過したエントリはエラーログを記録してキューから除去する。

#### 書込キュー層: `offline-queue.ts`

```
interface QueueEntry {
  id?: number          // IDB 自動採番
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  idempotencyKey: string
  enqueuedAt: string   // ISO 8601
  retryCount: number
}

function enqueue(entry: Omit<QueueEntry, 'id' | 'enqueuedAt' | 'retryCount'>): Promise<void>
function dequeue(id: number): Promise<void>
function getAll(): Promise<QueueEntry[]>
function flush(): Promise<void>   // キューを順番に再送する
```

`flush()` は各エントリを順番に送信し、成功したら `dequeue`、412 なら `ConflictError`
を throw、その他のエラーなら `retryCount` を +1 してキューに書き戻す。

#### 書込処理フロー

```
ユーザー操作（タスク追加 / 更新 / 削除 等）
  ↓
useMutation の mutationFn が呼ばれる
  ↓
offline-queue.enqueue() でキューに保存（IdempotencyKey は操作時点で確定済み）
  ↓
navigator.onLine === true
  → fetch を試みる
    → 成功: offline-queue.dequeue() → queryClient.invalidateQueries
    → 412:  ConflictError を throw → 衝突解決 UI へ
    → その他: retryCount++ してキューに残す → TanStack Query の onError でユーザーに通知
  ↓
navigator.onLine === false
  → キューに保存のみ（fetch しない）
  → 楽観的 UI 更新（onMutate コールバック）
  → 「オフライン中 - 復帰後に同期します」表示
```

#### Background Sync

Service Worker 内で `sync` イベントを登録する（タグ: `todica-write-queue`）。

- オンライン復帰時に `sync` イベントが発火 → SW が `clients.matchAll()` で
  メインスレッドにメッセージを送り、`flush()` を起動する。
- Background Sync 未対応環境（iOS Safari 等）では、`window.addEventListener('online', flush)`
  でアプリフォアグラウンド時にフォールバック再送する。

### フェーズ E: 衝突解決 UI

#### ConflictDialog コンポーネント

```
props:
  open: boolean
  localValue: Record<string, unknown>   // クライアントが送ろうとした値
  serverValue: Record<string, unknown>  // 412 レスポンスのサーバ現行値
  onAcceptServer: () => void
  onRetryWithServer: () => void
```

- 412 を受けたとき、`useMutation` の `onError` コールバックで `ConflictError` を検出し
  `ConflictDialog` を開く。
- `onAcceptServer`: キューのエントリを削除し、サーバ値で `queryClient.setQueryData` を更新する。
- `onRetryWithServer`: サーバ値の `version` を `If-Match` に設定してリクエストを再送する。
  再送成功で `ConflictDialog` を閉じてクエリを invalidate する。

## 重要な決定

- **generateSW vs injectManifest**: Workbox の `generateSW` モード（自動生成）を採用する。
  カスタム Service Worker ロジック（Background Sync 等）は `injectManifest` モードで
  ハンドラファイルを書く必要がある。Background Sync ロジックが必要なため `injectManifest`
  モードを採用する。カスタム SW ファイルは `web/src/sw/service-worker.ts` に置く。
- **Repository インターフェースの維持**: 書込キュー層は Repository の「外側」に置くのではなく、
  `useMutation` の `mutationFn` 内で `enqueue → fetch` の順に呼び出す形とする。
  Repository インターフェースを変更しないことで、既存のテスト（Repository モックを使う単体テスト）
  への影響をゼロにする。
- **TanStack Query の networkMode**: `networkMode: 'offlineFirst'` を設定し、オフライン中でも
  `useQuery` がキャッシュ値を `data` として返せるようにする。デフォルトの `'online'` では
  オフライン中に `useQuery` が pause し、UI が空白になるため採用しない。
- **書込キューの処理順序**: キューはエントリ追加順（`enqueuedAt` 昇順）に再送する。
  同一リソースへの複数操作（更新→削除等）は順序が重要なため、並列送信はしない。

## リスク / 代替案

- **iOS Safari の Background Sync 未対応**: `online` イベントによるフォールバックで対処するが、
  バックグラウンド時の同期は行えない。許容リスクとして記録する。
- **Service Worker のキャッシュ汚染**: Workbox のキャッシュ戦略でエントリ数・有効期間の上限を
  設けることで、古いデータが永続化されるリスクを軽減する。
- **injectManifest モードの複雑さ**: `generateSW` モードに比べて設定が増えるが、
  Background Sync のカスタムロジックが必須のため代替案はない。

## テスト方針

- フェーズ A: Playwright（E2E）で Lighthouse PWA 監査を実行し、インストール可能性を確認する
- フェーズ B: Vitest + `@testing-library/react` で `useQuery` / `useMutation` の挙動を単体テスト。
  既存の View テスト（モック Repository を Props 注入する形）は引き続き通ることを確認する
- フェーズ C: Vitest で Service Worker の Workbox ストラテジーをモックし、
  オフライン時のキャッシュヒットを単体テストする
- フェーズ D: Vitest で `offline-queue.ts` の `enqueue` / `dequeue` / `flush` を単体テストする。
  IndexedDB は `fake-indexeddb` でモックする
- フェーズ E: Vitest + `@testing-library/react` で `ConflictDialog` のレンダリングと
  `onAcceptServer` / `onRetryWithServer` コールバックの呼び出しを単体テストする
