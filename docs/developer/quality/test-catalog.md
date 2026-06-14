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
| `server/__tests__/unit/session-repository.test.ts` | 10 | SessionRepository の create / findValidByToken / deleteByToken・期限境界 (strict >) ・deleteAll (全削除 / 冪等 no-op) | BL-074, BL-079 |
| `server/__tests__/unit/password-repository.test.ts` | 6 | PasswordRepository の getHash (空時 null) / setHash (INSERT + UPDATE upsert) / 単一行 singleton 保証 / updated_at 反映 | BL-079 |

### 統合テスト（API エンドポイント）

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `server/__tests__/integration/startup.test.ts` | 2 | サーバ起動・Bearer 認証の基本疎通 (sessions lookup: Bearer 無し → 401) | BL-013, 074 |
| `server/__tests__/integration/healthz.test.ts` | 2 | `GET /healthz` の正常応答 | BL-013 |
| `server/__tests__/integration/login.test.ts` | 12 | `POST /api/v1/login` 正常系 / 401 / body 不正 400 / 未初期化時 412 `INITIAL_SETUP_REQUIRED` | BL-074, 080 |
| `server/__tests__/integration/auth-state.test.ts` | 4 | `GET /api/v1/auth-state` が DB のパスワード有無を認証なしで返す | BL-080 |
| `server/__tests__/integration/logout.test.ts` | 6 | `POST /api/v1/logout` 正常系 (sessions DELETE) / 二重 logout 401 / Bearer 無し 401 / Idempotency-Key 除外 | BL-074 |
| `server/__tests__/integration/auth-middleware.test.ts` | 9 | sessions lookup 版 authMiddleware: Bearer 無し 401 / 有効 token 200 / 期限切れ 401 / strict > 境界 / sessions に存在しない文字列 Bearer 401 / 素通しパス | BL-074 |
| `server/__tests__/integration/tasks.test.ts` | 43 | タスク CRUD・優先度・期限・楽観ロック・冪等性・2 階層制約 | BL-001〜003, 007, 012, 015 |
| `server/__tests__/integration/today.test.ts` | 25 | `GET /today` の並び順・completionCount・自動リセット統合 | BL-005, 008, 010 |
| `server/__tests__/integration/focus.test.ts` | 24 | フォーカス設定・解除・自動解除（完了/削除/期限変更時） | BL-006 |
| `server/__tests__/integration/counter.test.ts` | 11 | 完了数カウント +1・削除時非加算・Idempotency-Key 重複防止 | BL-008 |
| `server/__tests__/integration/settings.test.ts` | 14 | 境界時刻の取得・更新・バリデーション・楽観ロック | BL-009 |
| `server/__tests__/integration/reset.test.ts` | 12 | 日次リセット API・冪等性・未完了繰越・ゴミ箱清算 | BL-010 |
| `server/__tests__/integration/trash.test.ts` | 26 | ゴミ箱一覧・復元・空にする・purgeTrash | BL-011 |
| `server/__tests__/integration/projects.test.ts` | 24 | プロジェクト CRUD・名称変更・削除 | BL-016 |
| `server/__tests__/integration/routines.test.ts` | 18 | ルーティン CRUD・編集 | BL-017 |
| `server/__tests__/integration/password.test.ts` | 30 | `POST /api/v1/password`: 通常変更に加え、DB 空時の認証不要初期設定・auto-login・入力検証 | BL-079, 080 |

---

## Web 層

### Repository / auth

| ファイル | 件数 | 保証内容 | 関連 BL |
|---|---|---|---|
| `web/__tests__/http-task-repository.test.ts` | 4 | HttpTaskRepository の CRUD・楽観ロックエラー変換 (auth-storage seed パターン) | BL-001, 074 |
| `web/src/auth/auth-storage.test.ts` | 8 | WebAuthStorage の localStorage 保存・取得・破棄・listener パターン | BL-074 |
| `web/src/auth/authed-fetch.test.ts` | 7 | authedFetch の単体テスト: 引数透過 / 200 透過 / 401 で clearToken + `todica:auth-expired` dispatch / 非 401 素通し / setAuthStorage(null) no-op / getToken=null で Authorization 非付与 / 呼出側 Authorization 上書き禁止 | BL-074, 078 |
| `web/src/auth/capacitor-auth-storage.test.ts` | 5 | CapacitorAuthStorage の単体テスト (`vi.mock("@capacitor/preferences")`): getToken / setToken / clearToken が key="authToken" で Preferences.get/set/remove を叩く・listener notify・set→get round-trip | BL-074, 078 |
| `web/src/auth/login-client.test.ts` | 6 | login(password) で /api/v1/login 呼出・200 で token 返却・401 で InvalidPasswordError・ネットワークエラー / logout(token) で Bearer 付き POST | BL-074 |
| `web/src/auth/auth-state-client.test.ts` | 6 | auth-state 取得、レスポンス検証、ネットワーク・HTTP エラー | BL-080 |
| `web/src/auth/password-client.test.ts` | 12 | 通常変更と認証なし初期パスワード設定クライアント | BL-079, 080 |
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
| `web/__tests__/settings-view.test.tsx` | 19 | SettingsView（境界時刻・モード切替・ログアウトボタン・パスワード変更フォーム: セクション表示 / 3 input + autocomplete / 必須空で送信不可 / 新 PW != 確認入力で送信不可 + alert / 正常 submit で changePassword 呼出 / 成功で onPasswordChanged / 401 で alert / changePassword Props なしでセクション非表示） | BL-009, 019〜020, 074, 079 |
| `web/__tests__/settings-view-dead-path-removed.test.tsx` | 1 | SettingsView から BL-019 由来の旧 props 経路に紐づく DOM 要素が消えていることを regression guard する (AC-1) | BL-075 |
| `web/src/ui/setup-view/setup-view.test.tsx` | 9 | SetupView（URL + `/healthz` 検証のみに簡素化・ローカルモード選択） | BL-019〜020, 074 |
| `web/src/ui/login-view/login-view.test.tsx` | 8 | LoginView（パスワード入力・正常送信・401 エラー・ネットワークエラー・aria-busy・autofocus・aria-invalid/describedby） | BL-074 |
| `web/src/ui/initial-setup-view/initial-setup-view.test.tsx` | 12 | 初期パスワード設定フォームの検証、送信、エラー、a11y | BL-080 |
| `web/__tests__/app-login.test.tsx` | 10 | token と auth-state による起動分岐、初期設定 auto-login、401・パスワード変更後の遷移 | BL-074, 079, 080 |
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
| `__tests__/release/prod-startup.test.ts` | 3 | domain + server を build し、env なし起動 → 初期パスワード設定 → 認証付き API 疎通を検証 | BL-074, 080 |

---

## skip 状況

テストの skip 件数は 0 を目標とする。

やむを得ず skip を残す場合は、現在も有効な理由を timeless なコメントで明記する。変更履歴や作業番号に依存する表現は使わず、テストを実行できない条件と解除条件を記述する。
