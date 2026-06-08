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
| BL-001 | タスク CRUD（起票・名称編集・期限切替・削除） | P0 | Todo | FR-001, FR-002, FR-005, FR-007, FR-009 / v0.1.0 / `features/task-crud/` 想定 |
| BL-002 | タスク優先度（3 段階の付与・変更） | P0 | Todo | FR-003, FR-004 / v0.1.0 / `features/task-priority/` 想定 |
| BL-003 | タスク完了アクション（ゴミ箱経由 + カウント +1） | P0 | Done | FR-006, FR-060 / v0.1.0 / `features/task-complete/` (カウント +1 は BL-008 待ち) |
| BL-004 | 2 階層固定（サブタスク・ネストを持たない構造保証） | P0 | Done | FR-008, OOS-003 / v0.1.0 / BL-001 (`features/task-crud/`) 内で完了. Task に parentTaskId フィールドを持たず, API でも受理しない (server/__tests__/integration/tasks.test.ts) |
| BL-005 | 今日ビュー（入口・優先度順表示・"次の 1 つ" の一意化） | P0 | Done | FR-010, FR-011, NFR-013 / v0.1.0 / `features/today-view/` 完了. /api/v1/today 新設, 並び順 priority → createdAt → id |
| BL-006 | 現在のタスク（フォーカス）と完了時の自動繰上げ | P0 | Done | FR-012, FR-013, NFR-011 / v0.1.0 / `features/focus-task/` 完了. GET/PUT /focus + /today に currentTaskId 同梱 + complete/delete/期限 tomorrow で自動解除 |
| BL-007 | 今日 → 明日 への期限切替（今日ビュー導線） | P0 | Done | FR-005, FR-014 / v0.1.0 / BL-001 + BL-005 + BL-006 で完了. PATCH /tasks/{id} dueDate 受理 (BL-001), 「明日へ」「今日へ」トグルボタンと today 後の refetch (BL-005), today→tomorrow で focus 自動解除 (BL-006) |
| BL-008 | 今日の完了タスク数カウントの表示 | P0 | Done | FR-040 / v0.1.0 / `features/completion-counter/` 完了. counter テーブル + GET /counter + complete で +1 + /today に completionCount 同梱 + UI 「今日の完了: N」表示 |
| BL-009 | 境界時刻の設定（ユーザー設定値） | P0 | Done | FR-041, FR-042, NFR-012 / v0.1.0 / `features/settings-day-boundary/` 完了. GET/PATCH /settings + dayBoundaryTime (HH:MM) + SettingsView |
| BL-010 | 日次リセット処理（カウント 0 クリア + 未完了繰越 + ゴミ箱清算）の冪等実行 | P0 | Done | FR-043, FR-051, FR-062, NFR-020 / v0.1.0 / `features/daily-reset/` 完了. POST /reset + GET /today 自動実行. purgeTrash スタブは BL-011 で充填 |
| BL-011 | ゴミ箱（閲覧・復元・手動「空にする」） | P0 | Done | FR-060, FR-061, FR-062 / v0.1.0 / `features/trash/` 完了. GET /trash + POST /trash/:id/restore + DELETE /trash + purgeTrash 本実装 |
| BL-012 | タスク削除アクション（ゴミ箱経由・カウント非加算） | P0 | Todo | FR-007, FR-060 / v0.1.0 / `features/task-crud/` 内 |
| BL-013 | サーバ基盤（Hono + better-sqlite3 + drizzle-orm + 単一認証トークン + HTTPS） | P0 | Todo | NFR-002, NFR-020, NFR-021, NFR-032 / v0.1.0 / ADR-0007, ADR-0010 / `features/server-foundation/` 想定 |
| BL-014 | Web クライアント基盤（React + Vite + TanStack Query + React Router） | P0 | Todo | NFR-010, NFR-013 / v0.1.0 / ADR-0008 / `features/web-client-foundation/` 想定 |
| BL-015 | API 基盤（REST + Idempotency-Key + If-Match 楽観ロック + OpenAPI） | P0 | Todo | NFR-020 / v0.1.0（基本契約） / ADR-0010 / `features/api-foundation/` 想定. キュー連携は BL-018 へ. |
| BL-016 | プロジェクト管理（作成・名称変更・削除. アーカイブなし） | P1 | Todo | FR-020, FR-021, FR-022 / v0.2.0 / `features/project-crud/` 想定 |
| BL-017 | ルーティン機能（定義・編集・指定曜日の自動生成・翌日非持越・履歴なし） | P1 | Todo | FR-030, FR-031, FR-033, FR-034, FR-035 / v0.2.0 / `features/routine/` 想定 |
| BL-018 | PWA 化 + オフライン書込キュー（Service Worker + IndexedDB + Background Sync） | P2 | Todo | NFR-031 前提, architecture §7.5 / v0.3.0 / ADR-0008 / `features/pwa-offline-queue/` 想定 |
| BL-019 | Android ラップ（Capacitor サーバモード + Play Internal Testing 提出） | P2 | Todo | NFR-030, NFR-031, RISK-002 対策 / v0.4.0 / ADR-0009 / `features/android-server-mode/` 想定 |
| BL-020 | Android ローカルモード（@capacitor-community/sqlite + 端末内リセット処理） | P3 | Todo | NFR-021, FR-043, FR-051, FR-062 / v0.5.0 / ADR-0009, ADR-0011 / `features/android-local-mode/` 想定 |
| BL-021 | PM ツール非連携の明示（FR-070 への適合確認） | P1 | Todo | FR-070, OOS-010 / v0.2.0 で監査チェック / 専用 feature は不要（既存 UI / ドキュメントで担保） |
| BL-022 | OSS 公開準備（LICENSE・依存関係棚卸し・秘密情報取扱い・公開 README） | P3 | Todo | NFR-050 / v1.0.0 / `features/oss-release-prep/` 想定 |
| BL-023 | Google Play Store 公開対応（プライバシーポリシー・データセーフティ・審査対応） | P3 | Todo | NFR-030, CONSTRAINT-003 / v1.0.0 / `features/play-store-release/` 想定 |
| BL-024 | v1.0.0 安定化（1 か月以上のドッグフーディング + 要件カバレッジ最終監査） | P3 | Todo | SC-001, FR-001〜FR-070 / NFR-001〜NFR-050 全件 / v1.0.0 / auditor 主導 |
