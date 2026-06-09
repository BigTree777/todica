# バックログ

> 課題・要望の一覧。優先度と状態で管理する。粒度が大きいものは機能ごとに
> [`../features/`](../features/_template/spec.md) へ切り出す。

## 凡例

- 優先度: P0(必須) / P1(高) / P2(中) / P3(低)
  - P0 = v0.1.0 に含める / P1 = v0.2.0 / P2 = v0.3.0〜v0.4.0 / P3 = v0.5.0 以降
- 状態: Todo / Doing / Done / Hold
- リリース対応は [`roadmap.md`](roadmap.md) の「リリース計画」を参照.

## 一覧

| ID | タイトル | 優先度 | 状態 | メモ |
| --- | --- | --- | --- | --- |
| BL-001 | タスク CRUD（起票・名称編集・期限切替・削除） | P0 | Done | FR-001, FR-002, FR-005, FR-007, FR-009 / v0.1.0 / `features/task-crud/` 完了. サーバ API + ドメイン + Web UI（TodayView）すべて実装済み |
| BL-002 | タスク優先度（3 段階の付与・変更） | P0 | Done | FR-003, FR-004 / v0.1.0 / `features/task-priority/` 完了. サーバ PATCH priority + TodayView の優先度サイクルボタン実装済み |
| BL-003 | タスク完了アクション（ゴミ箱経由 + カウント +1） | P0 | Done | FR-006, FR-060 / v0.1.0 / `features/task-complete/` (カウント +1 は BL-008 待ち) |
| BL-004 | 2 階層固定（サブタスク・ネストを持たない構造保証） | P0 | Done | FR-008, OOS-003 / v0.1.0 / BL-001 (`features/task-crud/`) 内で完了. Task に parentTaskId フィールドを持たず, API でも受理しない (server/__tests__/integration/tasks.test.ts) |
| BL-005 | 今日ビュー（入口・優先度順表示・"次の 1 つ" の一意化） | P0 | Done | FR-010, FR-011, NFR-013 / v0.1.0 / `features/today-view/` 完了. /api/v1/today 新設, 並び順 priority → createdAt → id |
| BL-006 | 現在のタスク（フォーカス）と完了時の自動繰上げ | P0 | Done | FR-012, FR-013, NFR-011 / v0.1.0 / `features/focus-task/` 完了. GET/PUT /focus + /today に currentTaskId 同梱 + complete/delete/期限 tomorrow で自動解除 |
| BL-007 | 今日 → 明日 への期限切替（今日ビュー導線） | P0 | Done | FR-005, FR-014 / v0.1.0 / BL-001 + BL-005 + BL-006 で完了. PATCH /tasks/{id} dueDate 受理 (BL-001), 「明日へ」「今日へ」トグルボタンと today 後の refetch (BL-005), today→tomorrow で focus 自動解除 (BL-006) |
| BL-008 | 今日の完了タスク数カウントの表示 | P0 | Done | FR-040 / v0.1.0 / `features/completion-counter/` 完了. counter テーブル + GET /counter + complete で +1 + /today に completionCount 同梱 + UI 「今日の完了: N」表示 |
| BL-009 | 境界時刻の設定（ユーザー設定値） | P0 | Done | FR-041, FR-042, NFR-012 / v0.1.0 / `features/settings-day-boundary/` 完了. GET/PATCH /settings + dayBoundaryTime (HH:MM) + SettingsView |
| BL-010 | 日次リセット処理（カウント 0 クリア + 未完了繰越 + ゴミ箱清算）の冪等実行 | P0 | Done | FR-043, FR-051, FR-062, NFR-020 / v0.1.0 / `features/daily-reset/` 完了. POST /reset + GET /today 自動実行. purgeTrash スタブは BL-011 で充填 |
| BL-011 | ゴミ箱（閲覧・復元・手動「空にする」） | P0 | Done | FR-060, FR-061, FR-062 / v0.1.0 / `features/trash/` 完了. GET /trash + POST /trash/:id/restore + DELETE /trash + purgeTrash 本実装 |
| BL-012 | タスク削除アクション（ゴミ箱経由・カウント非加算） | P0 | Done | FR-007, FR-060 / v0.1.0 / BL-001 の DELETE ハンドラ（trashedReason="deleted"）と BL-008 のカウント非加算テスト（counter.test.ts "DELETE では+1しない"）で完了 |
| BL-013 | サーバ基盤（Hono + better-sqlite3 + drizzle-orm + 単一認証トークン + HTTPS） | P0 | Done | NFR-002, NFR-020, NFR-021, NFR-032 / v0.1.0 / ADR-0007, ADR-0010 / `features/server-foundation/` 完了 |
| BL-014 | Web クライアント基盤（React + Vite + React Router） | P0 | Done | NFR-010, NFR-013 / v0.1.0 / ADR-0008 / `features/web-client-foundation/` 完了. react-router-dom v6 導入, TrashView + ルーティング設定 |
| BL-015 | API 基盤（REST + Idempotency-Key + If-Match 楽観ロック + OpenAPI） | P0 | Done | NFR-020 / v0.1.0 / ADR-0010. BL-001〜BL-011 で REST + Idempotency-Key + If-Match + OpenAPI 全実装済み |
| BL-016 | プロジェクト管理（作成・名称変更・削除. アーカイブなし） | P1 | Done | FR-020, FR-021, FR-022 / v0.2.0 / `features/project-crud/` 完了. POST/GET/PATCH/DELETE /projects + ProjectsView + TodayView プロジェクト選択 |
| BL-017 | ルーティン機能（定義・編集・指定曜日の自動生成・翌日非持越・履歴なし） | P1 | Done | FR-030, FR-031, FR-033, FR-034, FR-035 / v0.2.0 / `features/routine/` 完了. POST/GET/PATCH/DELETE /routines + 日次リセット統合 + RoutinesView |
| BL-018 | PWA 化 + オフライン書込キュー（Service Worker + IndexedDB + Background Sync） | P2 | Done | NFR-031 前提 / v0.3.0 / ADR-0008 / `features/pwa-offline-queue/` 完了. vite-plugin-pwa + TanStack Query + IndexedDB 書込キュー + ConflictDialog 実装済み. PR #19 |
| BL-019 | Android ラップ（Capacitor サーバモード + Play Internal Testing 提出） | P2 | Done | NFR-030, NFR-031, RISK-002 対策 / v0.4.0 / ADR-0009 / `features/android-server-mode/` 完了. Capacitor + SetupView + SettingsView サーバ設定 + android/ 生成 + 署名設定 / auditor Pass |
| BL-020 | Android ローカルモード（@capacitor-community/sqlite + 端末内リセット処理） | P3 | Done | NFR-021, FR-043, FR-051, FR-062 / v0.5.0 / ADR-0009, ADR-0011 / `features/android-local-mode/` 完了. Local Repository 実装 + LocalResetUsecase + local-db.ts DDL + main.tsx モード分岐 / auditor Pass |
| BL-021 | PM ツール非連携の明示（FR-070 への適合確認） | P1 | Done | FR-070, OOS-010 / v0.2.0 / auditor 確認済み: API・UI・ドキュメント全観点で適合、追加実装不要 |
| BL-022 | OSS 公開準備（LICENSE・依存関係棚卸し・秘密情報取扱い・公開 README） | P3 | Done | NFR-050 / v1.0.0 / `features/oss-release-prep/` 完了. LICENSE + README + CONTRIBUTING + dependency-licenses.md + secret-scan-report.md + package.json フィールド / auditor Pass |
| BL-023 | Google Play Store 公開対応（プライバシーポリシー・データセーフティ・審査対応） | P3 | Done | NFR-030, CONSTRAINT-003 / v1.0.0 / `features/play-store-release/` 完了. privacy-policy.md + store-listing.md + data-safety.md + policy-checklist.md / auditor Pass |
| BL-024 | v1.0.0 安定化（1 か月以上のドッグフーディング + 要件カバレッジ最終監査） | P3 | Done | SC-001, FR-001〜FR-070 / NFR-001〜NFR-050 全件 / v1.0.0 / `features/v1-stabilization/` 完了. coverage-audit.md + test-results.md + release-checklist.md / auditor Pass. v1.0.0 タグ打鍵はドッグフーディング手動確認後 |
| BL-025 | E2E テスト基盤導入（Playwright + 全層疎通スモーク + CORS 修正） | P1 | Done | NFR-020 補強 / `feature/e2e-tests` ブランチで完了. Playwright + chromium 導入 (`playwright.config.ts`, `e2e/smoke.spec.ts`), `hono/cors` を `server/src/app.ts` の authMiddleware 前に追加, 「タスクを追加すると今日の一覧に表示される」スモークテストが green. このスモーク 1 件で CORS preflight / env 配線 / 認証 / migration 適用 / DB 永続化 / UI 再描画の全層が同時に検証される |
| BL-026 | 機能別 E2E スモークテスト群（happy path を実ブラウザで網羅） | P1 | Done | NFR-020 補強 / `feature/e2e-tests-functional` ブランチで完了. e2e/tasks.spec.ts (4 件: 優先度/期限切替/編集/削除) + e2e/projects.spec.ts (1 件: カスケード null) + e2e/trash.spec.ts (2 件: 復元/空にする) + e2e/settings.spec.ts (1 件: 境界時刻更新) + e2e/routines.spec.ts (2 件: 作成/削除) を追加. 既存 smoke を含めて合計 11 件 全 pass (5.3s). ルーティンの「翌日タスク自動生成」と境界時刻変更が `/today` に与える挙動の検証は時間制御 hook が必要なため BL-027 に移管 |
| BL-027 | クロスレイヤ整合性 E2E テスト群（Playwright 側で書ける範囲） | P2 | Done | `feature/e2e-tests-crosslayer` ブランチで完了. e2e/state-restoration.spec.ts (3 件: 完了数/focus/settings のリロード復元) + e2e/idempotency.spec.ts (1 件: 同 Idempotency-Key の 2 回目応答再生) + e2e/offline-queue.spec.ts (1 件: offline 起票 → online で flush) を追加, 合計 5 件 green. **2 タブ同時編集 ConflictDialog / 401 UI 反応 / offline PATCH の 3 項目は実装側に既存バグがあり E2E で「現状で起きないこと」を testing する形になるため BL-031 (web app の conflict/error handling 修復) に切り出した** |
| BL-028 | PWA / Service Worker E2E テスト (dev で testable な範囲) | P2 | Done | `feature/e2e-tests-pwa` ブランチで完了. e2e/pwa.spec.ts 2 件: (a) `/manifest.webmanifest` が name/short_name/start_url/display/icons (192/512) の PWA installable 要件を満たす, (b) `/dev-sw.js?dev-sw` が precache / NavigationRoute / StaleWhileRevalidate / 書込キュー sync の 4 機能を含む. **SW の実 activated 検証 / オフライン navigation / Lighthouse 監査 / install prompt / 更新 prompt** は Playwright 1.60 のデフォルト headless が `chromium-headless-shell` を使い SW が起動しないため検証不能. これらは BL-032 で full Chromium + prod build による別 Playwright project を立てて対応する |
| BL-029 | アクセシビリティ・パフォーマンス E2E テスト（任意） | P3 | Done | NFR-010 補強 / `feature/e2e-tests-a11y-perf` ブランチで完了. `@axe-core/playwright` を導入. e2e/a11y.spec.ts (5 件: today/projects/trash/routines/settings で WCAG 2.1 AA 違反 0 件) + e2e/keyboard.spec.ts (1 件: Tab + 入力 + Enter のみでタスク追加) + e2e/perf.spec.ts (1 件: 1000 件タスク投入下で `/today` が 13 ms 応答 → 1 秒以下を余裕でクリア) を追加. E2E 25 件 全 green. 「編集 / 完了がキーボードのみで完結」は ARIA 設計の見直しが必要なため最低限の起票のみカバーした |
| BL-030 | E2E テスト用 server 側 hook の整備（時間制御 + force reset + 再起動シミュレーション） | P2 | Done | `feature/test-hooks` ブランチで完了. `TEST_NOW` 環境変数で `FakeClock` を注入し, `/api/v1/test/clock/{,set,advance}` の 3 エンドポイントで時刻を任意に進められるようにした (idempotency middleware は `/api/v1/test/` を除外). これを使った e2e/boundary-time.spec.ts (3 件: 未完了繰越 / カウンタリセット / ルーティン自動生成) を追加. **force reset エンドポイントは clock advance で代替したため不要だった**. **server 再起動シミュレーションは Playwright で server プロセスを kill/restart する仕組み構築が大ごとで, migration 冪等性は BL-025 で手動検証済みのため ROI が低く本 BL からは外した** (必要が出た時は別 BL で扱う) |
| BL-031 | Web アプリの conflict / error handling UI 修復（today-view 部分対応） | P2 | Done | `feature/web-error-handling` ブランチで完了 (today-view の中核 mutation のみ). (a) **online 412 → ConflictDialog**: `today-view.tsx` の update/delete/complete 3 mutation で `OptimisticLockError` を catch して `findEntryByKey()` で queue 内 entry を引き `ConflictError(entry, error.currentTask)` に変換するように修復. (b) **offline PATCH の If-Match 欠落**: 同 4 mutation (update/delete/complete/setFocus) で `If-Match` を header に乗せるよう変更し body から ifMatch を除去. E2E (e2e/conflict-handling.spec.ts) で「2 タブ同時編集 → ConflictDialog 出現」「offline PATCH → online flush → server 反映」が green. **未対応 (BL-033 に切り出し)**: 同様の (a) 修復を projects/routines/trash/settings の各 view にも適用 (それぞれ独自の Conflict 系エラー型を持つ). **(c) 401 / ネットワークエラー時の UI 反応**: UI 設計判断 (toast / banner / 静かな refetch) を要するため BL-034 に切り出し |
| BL-033 | conflict 変換修復を他 view にも展開 (BL-031 の残り) | P3 | Todo | BL-031 で today-view の update/delete/complete のみ修復した. projects/routines/trash view の同 mutation, および settings view の `PatchConflictError`, trash view の `RestoreConflictError` も同様に ConflictDialog 経路に乗せる. 修復後 E2E (BL-026 / BL-027 で書けなかった「プロジェクト名衝突」「ルーティン名衝突」等の 2 タブ編集シナリオ) を追加する |
| BL-034 | 401 / ネットワークエラー時の UI 反応 (BL-031 (c) から切り出し) | P3 | Todo | 現在は 401 / fetch network error が `onError` で素通りされ, フォームが reset されるだけで failure が user に伝わらない. UI 設計判断を要する (toast / バナー / 静かな refetch にして手書きの結果を上書き表示 等). 設計確定後に対応する E2E (誤 token で操作 → エラー表示確認) を追加する |
| BL-032 | PWA E2E テストの full Chromium + prod build 対応 | P3 | Todo | BL-028 から切り出し. Playwright 1.60 のデフォルト headless は `chromium-headless-shell` で SW が起動せず, 更に dev モードは `precacheAndRoute([])` で空のためオフライン navigation も不能. 対応案: (1) playwright.config.ts に専用 project を追加し `channel: "chromium"` か `headless: false` を指定して full Chromium を強制. (2) `npm run build -w web && npm run preview -w web` 相当の prod build 静的 serve で webServer を立てる. (3) lighthouse npm package を導入し PWA 監査スコアを assert. 検証対象: SW activated 到達, オフライン navigation でシェル提供, install prompt の `beforeinstallprompt` 発火, 更新通知の prompt 戦略, Lighthouse PWA スコア >= 90 |
