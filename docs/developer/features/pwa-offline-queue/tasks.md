# タスク: PWA 化 + オフライン書込キュー

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

---

## フェーズ A: PWA 基盤

### A-1: 依存パッケージの追加

- [ ] `web/` に `vite-plugin-pwa` を devDependency として追加する（`npm install -D vite-plugin-pwa -w @todica/web`）
- [ ] `web/` に `workbox-window` を dependency として追加する（SW 更新通知用）

### A-2: PWA アイコン画像の用意

- [ ] `web/public/icons/pwa-192.png`（192×192px）を作成 / 配置する
- [ ] `web/public/icons/pwa-512.png`（512×512px, maskable 兼用）を作成 / 配置する

### A-3: `vite.config.ts` への `VitePWA` プラグイン追加

- [ ] `vite.config.ts` に `VitePWA` を import し、`plugins` 配列に追加する
- [ ] `registerType: 'prompt'` を設定する（SW 更新をユーザーに確認する方式）
- [ ] `injectManifest` モードを指定し、`swSrc: 'src/sw/service-worker.ts'` を設定する
- [ ] Manifest オブジェクト（name / short_name / start_url / display / background_color / theme_color / icons）を設定する
- [ ] `devOptions.enabled: true` を設定し、開発環境でも SW が動作するようにする

### A-4: カスタム Service Worker ファイルの作成（フェーズ A 分）

- [ ] `web/src/sw/service-worker.ts` を新規作成する
- [ ] Workbox の `precacheAndRoute(self.__WB_MANIFEST)` でシェルを pre-cache する設定を書く
- [ ] `NavigationRoute` と `createHandlerBoundToURL('/index.html')` で SPA の navigate fallback を設定する

### A-5: SW 更新通知バナーの実装

- [ ] `web/src/ui/pwa-update-banner/pwa-update-banner.tsx` を新規作成する
- [ ] `useRegisterSW`（`virtual:pwa-register/react`）を使い、`needRefresh` が `true` のとき「アップデートがあります。再読み込みしますか？」バナーを表示するコンポーネントを実装する
- [ ] 「再読み込み」ボタンクリック時に `updateServiceWorker(true)` を呼ぶ
- [ ] `web/src/main.tsx` のルートに `<PwaUpdateBanner />` を追加する

### A-6: フェーズ A の動作確認・テスト

- [ ] `npm run build -w @todica/web && npx serve web/dist` でビルド後のアプリを起動し、Chrome DevTools の Application > Manifest タブでマニフェストが正しく読み込まれることを確認する
- [ ] Chrome のアドレスバーに「インストール」ボタンが表示されることを確認する
- [ ] DevTools の Application > Service Workers タブで SW が `activated` 状態になることを確認する
- [ ] ネットワークをオフライン（DevTools の Network > Offline）にしてリロードし、アプリが表示されることを確認する

---

## フェーズ B: TanStack Query 導入

### B-1: 依存パッケージの追加

- [ ] `@tanstack/react-query` を `web/` に dependency として追加する
- [ ] `@tanstack/react-query-devtools` を `web/` に devDependency として追加する

### B-2: QueryClient のセットアップ

- [ ] `web/src/query-client.ts` を新規作成し、`QueryClient` を以下の設定で生成してエクスポートする:
  - `queries.staleTime: 30_000`
  - `queries.gcTime: 300_000`
  - `queries.retry: 1`
  - `queries.networkMode: 'offlineFirst'`
  - `mutations.retry: 0`
- [ ] `web/src/main.tsx` を編集し、`<QueryClientProvider client={queryClient}>` でルートを囲む
- [ ] 開発環境のみ `<ReactQueryDevtools />` を追加する

### B-3: TodayView を TanStack Query に置換

- [ ] `today-view.tsx` の `useEffect` + `useState` によるデータ取得を `useQuery({ queryKey: ['today'], queryFn: () => repository.today() })` に置き換える
- [ ] `getFocus()` の取得を `useQuery({ queryKey: ['focus'], queryFn: () => repository.getFocus() })` に置き換える
- [ ] `projectRepository.list()` の取得を `useQuery({ queryKey: ['projects'], queryFn: () => projectRepository.list() })` に置き換える
- [ ] タスク追加（`handleCreate`）を `useMutation` に置き換え、`onSuccess` で `queryClient.invalidateQueries(['today'])` を呼ぶ
- [ ] タスク更新（`handleSaveEdit`, `handleToggleDueDate`, `handleCyclePriority`）を `useMutation` に置き換え、`onSuccess` で `today` / `focus` を invalidate する
- [ ] タスク削除（`handleDelete`）を `useMutation` に置き換え、`onSuccess` で `today` / `focus` を invalidate する
- [ ] タスク完了（`handleComplete`）を `useMutation` に置き換え、`onSuccess` で `today` / `focus` / `counter` を invalidate する
- [ ] フォーカス設定（`handleSetFocus`）を `useMutation` に置き換え、`onSuccess` で `today` / `focus` を invalidate する
- [ ] 楽観 UI（削除・完了時の即時除外）を `onMutate` + ロールバック用 `onError` で実装する
- [ ] `isLoading` / `isError` 状態を UI に反映する（ローディングスピナー / エラーメッセージ）

### B-4: ProjectsView を TanStack Query に置換

- [ ] `projects-view.tsx` のデータ取得を `useQuery({ queryKey: ['projects'], ... })` に置き換える
- [ ] プロジェクト作成 / 更新 / 削除を `useMutation` に置き換え、`onSuccess` で `projects` を invalidate する

### B-5: RoutinesView を TanStack Query に置換

- [ ] `routines-view.tsx` のデータ取得を `useQuery({ queryKey: ['routines'], ... })` に置き換える
- [ ] ルーティン作成 / 更新 / 削除を `useMutation` に置き換え、`onSuccess` で `routines` を invalidate する

### B-6: TrashView を TanStack Query に置換

- [ ] `trash-view.tsx` のデータ取得を `useQuery({ queryKey: ['trash'], ... })` に置き換える
- [ ] ゴミ箱 mutation（復元 / 空にする）を `useMutation` に置き換え、`onSuccess` で `trash` / `tasks` / `today` を invalidate する

### B-7: SettingsView を TanStack Query に置換

- [ ] `settings-view.tsx` のデータ取得を `useQuery({ queryKey: ['settings'], ... })` に置き換える
- [ ] 設定保存を `useMutation` に置き換え、`onSuccess` で `settings` を invalidate する

### B-8: フェーズ B のテスト

- [ ] 既存の View テスト（`*-view.test.tsx`）が引き続き green であることを確認する（`npm test -w @todica/web`）
- [ ] `QueryClientProvider` でラップした上で既存テストが動作するよう、テスト用の `wrapper` 設定を追加する（必要な場合）
- [ ] TodayView の `useQuery` がデータ取得後にタスク一覧を表示することを Vitest + Testing Library でテストする
- [ ] TodayView の mutation 成功後にクエリが invalidate されることを `queryClient.invalidateQueries` のスパイでテストする

---

## フェーズ C: 読み取りキャッシュ（stale-while-revalidate）

### C-1: Service Worker に API キャッシュストラテジーを追加

- [ ] `web/src/sw/service-worker.ts` に `StaleWhileRevalidate` ストラテジーを追加する
- [ ] 対象: `GET /api/v1/*` にマッチするルート
- [ ] キャッシュ名: `api-cache`、`ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 86400 })` を設定する

### C-2: オフラインステータスフックの実装

- [ ] `web/src/hooks/use-network-status.ts` を新規作成し、`navigator.onLine` + `online` / `offline` イベントを監視して `isOnline: boolean` を返すフックを実装する

### C-3: オフラインバナーの実装

- [ ] `web/src/ui/offline-banner/offline-banner.tsx` を新規作成する
- [ ] `useNetworkStatus()` を使い、`isOnline === false` のとき「オフライン中 - 表示データは最終同期時のものです」バナーを表示するコンポーネントを実装する
- [ ] `web/src/main.tsx` のルートに `<OfflineBanner />` を追加する

### C-4: フェーズ C のテスト

- [ ] `use-network-status.ts` の単体テスト: `window.dispatchEvent(new Event('offline'))` で `isOnline` が `false` になることを Vitest でテストする
- [ ] `offline-banner.tsx` の単体テスト: `isOnline === false` のときバナーが表示され、`true` のとき非表示になることをテストする

---

## フェーズ D: 書込キュー + Background Sync

### D-1: 依存パッケージの追加

- [ ] `idb` を `web/` に dependency として追加する（`npm install idb -w @todica/web`）
- [ ] `fake-indexeddb` を `web/` に devDependency として追加する（テスト用）

### D-2: IndexedDB 書込キューモジュールの実装

- [ ] `web/src/offline-queue.ts` を新規作成し、`todica-offline-queue` データベース（バージョン 1）と `write-queue` オブジェクトストアを `idb` で定義する
- [ ] `QueueEntry` 型（`id?`, `url`, `method`, `headers`, `body`, `idempotencyKey`, `enqueuedAt`, `retryCount`）を定義してエクスポートする
- [ ] `enqueue(entry)` 関数を実装する（`enqueuedAt` = 現在時刻 ISO 8601、`retryCount` = 0 でストアに追加）
- [ ] `dequeue(id)` 関数を実装する（該当エントリをストアから削除）
- [ ] `getAll()` 関数を実装する（`enqueuedAt` 昇順で全エントリを取得）
- [ ] `flush()` 関数を実装する:
  - `getAll()` でエントリを取得
  - `enqueuedAt` から 7 日以上経過したエントリは `dequeue()` して除外する
  - 各エントリを順番に `fetch()` で送信する
  - 200 系: `dequeue()` してキューから削除する
  - 412: `ConflictError`（エントリ情報を含む）を throw する
  - その他エラー: `retryCount` を +1 してキューに書き戻す。`retryCount >= 5` の場合は `dequeue()` してエラーログを記録する

### D-3: useMutation への書込キュー統合（TodayView）

- [ ] タスク追加の `useMutation` の `mutationFn` を修正する:
  - `offline-queue.enqueue()` でキューに保存する
  - `navigator.onLine === true` の場合のみ即座に `repository.create()` を呼ぶ
  - `navigator.onLine === false` の場合はキューに保存して resolve する（楽観 UI 更新は `onMutate` で行う）
- [ ] タスク更新 / 削除 / 完了 / フォーカス設定の各 `useMutation` にも同様の修正を適用する

### D-4: useMutation への書込キュー統合（ProjectsView / RoutinesView）

- [ ] プロジェクト作成 / 更新 / 削除の `useMutation` にも書込キュー統合を適用する
- [ ] ルーティン作成 / 更新 / 削除の `useMutation` にも書込キュー統合を適用する

### D-5: Service Worker に Background Sync ハンドラを追加

- [ ] `web/src/sw/service-worker.ts` に `sync` イベントリスナーを追加する（タグ: `todica-write-queue`）
- [ ] `sync` イベント受信時に `clients.matchAll({ includeUncontrolled: true })` で全クライアントに `{ type: 'SYNC_QUEUE' }` メッセージを送る

### D-6: メインスレッド側の Background Sync 登録とフォールバック

- [ ] `web/src/hooks/use-sync-queue.ts` を新規作成する
- [ ] Service Worker からの `{ type: 'SYNC_QUEUE' }` メッセージを `navigator.serviceWorker.addEventListener('message', ...)` で受信し、`flush()` を呼ぶ処理を実装する
- [ ] `window.addEventListener('online', flush)` によるフォールバック再送を実装する（Background Sync 非対応環境向け）
- [ ] アプリ起動時（マウント時）に `navigator.serviceWorker.ready.then(reg => reg.sync.register('todica-write-queue'))` で Background Sync を登録する処理を追加する
- [ ] `web/src/main.tsx` または共通フックで `useSyncQueue()` を呼び出す

### D-7: フェーズ D のテスト

- [ ] `offline-queue.ts` の `enqueue` / `dequeue` / `getAll` を Vitest + `fake-indexeddb` で単体テストする
- [ ] `flush()` の正常系テスト: 全エントリが送信され、キューが空になることをテストする（`fetch` はモック）
- [ ] `flush()` の 7 日経過エントリ除外テスト: `enqueuedAt` を 8 日前に設定したエントリが除外されることをテストする
- [ ] `flush()` の retryCount 上限テスト: `retryCount === 5` のエントリが送信されずにキューから除去されることをテストする
- [ ] `flush()` の 412 テスト: `ConflictError` が throw されることをテストする（fetch モックが 412 を返す場合）
- [ ] オフライン中の mutation テスト: `navigator.onLine === false` のとき、`repository.create` が呼ばれず `enqueue` だけが呼ばれることを Vitest でテストする
- [ ] オンライン時の mutation テスト: `navigator.onLine === true` のとき、`enqueue` → `repository.create` の順で呼ばれることをテストする

---

## フェーズ E: 衝突解決 UI

### E-1: ConflictDialog コンポーネントの実装

- [ ] `web/src/ui/conflict-dialog/conflict-dialog.tsx` を新規作成する
- [ ] `props` として `open: boolean`, `localValue: Record<string, unknown>`, `serverValue: Record<string, unknown>`, `onAcceptServer: () => void`, `onRetryWithServer: () => void` を定義する
- [ ] ダイアログが `open === true` のとき以下の内容でレンダリングする:
  - 「変更が衝突しました」のタイトル
  - サーバの値の概要表示（`serverValue.name` 等、エンティティ名）
  - クライアントの値の概要表示
  - 「サーバの値を採用」ボタン（`onAcceptServer` を呼ぶ）
  - 「クライアントの値で再送」ボタン（`onRetryWithServer` を呼ぶ）

### E-2: ConflictDialog を mutation の onError に接続

- [ ] `web/src/hooks/use-conflict-dialog.ts` を新規作成する
- [ ] `conflictEntry: QueueEntry | null`, `serverValue: Record<string, unknown> | null`, `open: boolean` を `useState` で管理する
- [ ] `openDialog(entry, serverValue)` / `closeDialog()` 関数をエクスポートする
- [ ] `onAcceptServer()` 関数を実装する: `dequeue(entry.id)` → `queryClient.invalidateQueries` → `closeDialog()`
- [ ] `onRetryWithServer()` 関数を実装する: サーバ値の `version` を `If-Match` に設定して `fetch` 再送 → 成功時に `dequeue` + `invalidateQueries` + `closeDialog()`
- [ ] TodayView の各 mutation の `onError` コールバックで `ConflictError` を検出し、`openDialog()` を呼ぶ

### E-3: ConflictDialog をルートに追加

- [ ] `web/src/main.tsx` に `<ConflictDialog>` を追加し、`useConflictDialog()` と接続する（または各 View に個別配置する）

### E-4: フェーズ E のテスト

- [ ] `conflict-dialog.tsx` の単体テスト: `open === true` のときダイアログが表示されることをテストする
- [ ] `conflict-dialog.tsx` の単体テスト: 「サーバの値を採用」ボタンクリックで `onAcceptServer` が呼ばれることをテストする
- [ ] `conflict-dialog.tsx` の単体テスト: 「クライアントの値で再送」ボタンクリックで `onRetryWithServer` が呼ばれることをテストする
- [ ] `use-conflict-dialog.ts` の単体テスト: `openDialog` で `open === true` になることをテストする
- [ ] `use-conflict-dialog.ts` の単体テスト: `onAcceptServer` で `dequeue` が呼ばれ、クエリが invalidate されることをテストする

---

## 受け入れ基準の確認

- [ ] フェーズ A: Chrome のアドレスバーに「インストール」ボタンが表示される（手動確認）
- [ ] フェーズ A: オフライン（DevTools の Offline）でリロードしてもアプリが表示される（手動確認）
- [ ] フェーズ B: 既存の全 View テスト（`*.test.tsx`）が green である（`npm test -w @todica/web`）
- [ ] フェーズ C: オフライン時に前回のタスク一覧が表示され、「オフライン中」バナーが出る（手動確認）
- [ ] フェーズ D: オフライン中にタスクを追加し、オンライン復帰後にサーバに反映される（手動確認）
- [ ] フェーズ D: 同一 Idempotency-Key を 2 回送っても重複タスクが作成されない（手動確認）
- [ ] フェーズ E: 412 衝突が発生したとき、衝突解決ダイアログが表示される（手動確認）
- [ ] フェーズ E: 「クライアントの値で再送」でサーバに変更が反映される（手動確認）
- [ ] spec.md の全受け入れ基準シナリオを満たすことを確認する

## ドキュメント

- [ ] `docs/developer/architecture/module-boundaries.md` に `offline-queue` モジュールの依存関係を追記する
- [ ] `docs/developer/adr/` に必要に応じて新 ADR を追加する（`injectManifest` モード採用の判断等）

## 仕上げ

- [ ] `npm test -w @todica/web` が全て green であることを確認する
- [ ] ビルドエラーがないことを確認する（`npm run build -w @todica/web`）
- [ ] レビュー依頼
