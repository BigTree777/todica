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
| BL-028 | PWA / Service Worker E2E テスト | P2 | Todo | NFR-002, NFR-031 / BL-018 で実装した PWA 機能を実ブラウザで再検証. 内容: `manifest.webmanifest` valid (Lighthouse PWA 監査自動化), Service Worker 登録 + HTML/JS/CSS シェル pre-cache, 一度開いた後にオフラインで再アクセスして画面表示, Service Worker 更新通知 (vite-plugin-pwa prompt 戦略), インストールプロンプト表示. Android Capacitor 固有挙動は別ツール (Appium / Maestro) で別 backlog |
| BL-029 | アクセシビリティ・パフォーマンス E2E テスト（任意） | P3 | Todo | NFR-010 補強. 内容: キーボード操作のみでタスクの追加・編集・完了が完結する, axe による a11y 違反スキャンが TodayView / ProjectsView / TrashView で 0 件, 1000 件タスク投入下で `/today` 応答が 1 秒以内かつ UI がスムーズに描画される |
| BL-030 | E2E テスト用 server 側 hook の整備（時間制御 + force reset + 再起動シミュレーション） | P2 | Todo | BL-027 から切り出し. server 側にテスト目的のコード追加が必要なため別ブランチ・別 PR で扱う. 内容: テスト用 clock 注入 (環境変数経由で `now()` を上書き) または `POST /api/v1/reset?force=true` 相当のエンドポイント追加, Playwright 配下から server プロセスの停止・再起動を制御する仕組み. 完成後 BL-027 で deferred とした「server 再起動でデータ保持」「境界時刻またぎでのリセット連動 (ルーティン自動生成 / 未完了繰越 / カウンタリセット)」を E2E 化する |
| BL-031 | Web アプリの conflict / error handling UI 修復（BL-027 の E2E で発見されたバグ群） | P2 | Todo | BL-027 E2E 整備中に, 既存実装の以下のギャップが顕在化した. (a) **online 412 の ConflictDialog 経路が dead code**: today/projects/trash/routines view の updateMutation は `onError` で `instanceof ConflictError` をチェックしているが, 直接 fetch の `HttpTaskRepository` は 412 で `OptimisticLockError` を throw するため条件不一致でダイアログが出ない. (b) **offline PATCH の If-Match 欠落**: `today-view.tsx` の updateMutation は enqueue 時に `If-Match` を header ではなく body の `ifMatch` プロパティに入れるため, flush 時の fetch は server から 400 MISSING_IF_MATCH で reject される. (c) **401 / ネットワークエラー時に UI が無反応**: 操作した瞬間にフォームは reset され, 一覧の refetch は走らず, 失敗を user が知る手段が無い. これらを修復してから対応する E2E (2 タブ同時編集 / offline PATCH / 401 反応) を追加する |
