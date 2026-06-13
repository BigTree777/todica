# テストカタログ

`npm test` で一括実行できる。

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
| `server/__tests__/unit/session-repository.test.ts` | 8 | SessionRepository の create / findValidByToken / deleteByToken・期限境界 (strict >) | BL-074 |

### 統合テスト（API エンドポイント）

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `server/__tests__/integration/startup.test.ts` | 2 | サーバ起動・Bearer 認証の基本疎通 (BL-074: sessions lookup 切替後の Bearer 無し → 401) | BL-013, 074 |
| `server/__tests__/integration/healthz.test.ts` | 2 | `GET /healthz` の正常応答 | BL-013 |
| `server/__tests__/integration/login.test.ts` | 9 | `POST /api/v1/login` 正常系 (200 + token + sessions INSERT) / 401 / body 不正 400 / Idempotency-Key 除外 / authMiddleware 素通し | BL-074 |
| `server/__tests__/integration/logout.test.ts` | 6 | `POST /api/v1/logout` 正常系 (sessions DELETE) / 二重 logout 401 / Bearer 無し 401 / Idempotency-Key 除外 | BL-074 |
| `server/__tests__/integration/auth-middleware.test.ts` | 9 | sessions lookup 版 authMiddleware: Bearer 無し 401 / 有効 token 200 / 期限切れ 401 / strict > 境界 / 旧 AUTH_TOKEN 風 Bearer 401 / 素通しパス | BL-074 |
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

### Repository / auth

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `web/__tests__/http-task-repository.test.ts` | 4 | HttpTaskRepository の CRUD・楽観ロックエラー変換 (BL-074 で `auth-storage` seed パターンに統一) | BL-001, 074 |
| `web/src/auth/auth-storage.test.ts` | 8 | WebAuthStorage の localStorage 保存・取得・破棄・listener パターン | BL-074 |
| `web/src/auth/authed-fetch.test.ts` | 7 | authedFetch の単体テスト: 引数透過 / 200 透過 / 401 で clearToken + `todica:auth-expired` dispatch / 非 401 素通し / setAuthStorage(null) no-op / getToken=null で Authorization 非付与 / 呼出側 Authorization 上書き禁止 | BL-074, 078 |
| `web/src/auth/capacitor-auth-storage.test.ts` | 5 | CapacitorAuthStorage の単体テスト (`vi.mock("@capacitor/preferences")`): getToken / setToken / clearToken が key="authToken" で Preferences.get/set/remove を叩く・listener notify・set→get round-trip | BL-074, 078 |
| `web/src/auth/login-client.test.ts` | 6 | login(password) で /api/v1/login 呼出・200 で token 返却・401 で InvalidPasswordError・ネットワークエラー / logout(token) で Bearer 付き POST | BL-074 |
| `web/src/repositories/settings-repository.test.ts` | 3 | HttpSettingsRepository の getSettings / patchSettings (Idempotency-Key + If-Match) / 412 → PatchConflictError. auth-storage seed パターン | BL-009, 076 |
| `web/src/repositories/project-repository.test.ts` | 4 | HttpProjectRepository の CRUD (auth-storage seed パターン. `new HttpProjectRepository(baseUrl)` の 1 引数) | BL-016, 076 |
| `web/src/repositories/routine-repository.test.ts` | 4 | HttpRoutineRepository の CRUD (auth-storage seed パターン. `new HttpRoutineRepository(baseUrl)` の 1 引数) | BL-017, 076 |
| `web/src/repositories/trash-repository.test.ts` | 4 | HttpTrashRepository の一覧・復元・空にする (auth-storage seed パターン. `new HttpTrashRepository(baseUrl)` の 1 引数) | BL-011, 076 |
| `web/__tests__/settings-repository-auth-expired.test.tsx` | 1 | HttpSettingsRepository.getSettings() で 401 を引いたとき auth-storage の token が破棄され `todica:auth-expired` Custom Event が dispatch される | BL-076 |
| `web/__tests__/project-repository-auth-expired.test.tsx` | 1 | HttpProjectRepository.list() で 401 を引いたとき auth-storage の token が破棄され `todica:auth-expired` Custom Event が dispatch される | BL-076 |
| `web/__tests__/routine-repository-auth-expired.test.tsx` | 1 | HttpRoutineRepository.list() で 401 を引いたとき auth-storage の token が破棄され `todica:auth-expired` Custom Event が dispatch される | BL-076 |
| `web/__tests__/trash-repository-auth-expired.test.tsx` | 1 | HttpTrashRepository.list() で 401 を引いたとき auth-storage の token が破棄され `todica:auth-expired` Custom Event が dispatch される | BL-076 |
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
| `web/__tests__/settings-view.test.tsx` | 10 | SettingsView（境界時刻・モード切替・ログアウトボタン） | BL-009, 019〜020, 074 |
| `web/__tests__/settings-view-dead-path-removed.test.tsx` | 1 | SettingsView から BL-019 由来の旧 props 経路に紐づく DOM 要素が消えていることを regression guard する (AC-1) | BL-075 |
| `web/src/ui/setup-view/setup-view.test.tsx` | 9 | SetupView（URL + `/healthz` 検証のみに簡素化・ローカルモード選択） | BL-019〜020, 074 |
| `web/src/ui/login-view/login-view.test.tsx` | 8 | LoginView（パスワード入力・正常送信・401 エラー・ネットワークエラー・aria-busy・autofocus・aria-invalid/describedby） | BL-074 |
| `web/__tests__/app-login.test.tsx` | 5 | 起動分岐: token 未保存 → LoginView / 有効 token → 本体 / 401 interceptor (`todica:auth-expired`) で LoginView 復帰 | BL-074 |
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

---

## 本番ビルド検証

dev mode (`vite-node`) では検出できない, prod build artifact + Node ランタイムでの起動可否を検証する. 既存の `server/__tests__/integration/startup.test.ts` (dev mode の起動疎通) と対になる位置付け. **本セクションは検証の記述場所を確保するもので, テスト本体の実装は別タスクで行う**.

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `__tests__/release/prod-startup.test.ts` | 3 | domain + server を `tsc` build し, `node server/dist/src/main.js` を `APP_PASSWORD_HASH` 渡しで起動 → `/healthz` 200 → `POST /api/v1/login` で token 取得 → 認証付き `/api/v1/today` 200 → Bearer 無し / 旧 AUTH_TOKEN 風文字列で 401 (AC-1 / AC-7) | -- / BL-074 |
