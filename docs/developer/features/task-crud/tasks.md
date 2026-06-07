# タスク: タスク CRUD

> [`plan.md`](plan.md) を実行可能な単位に分解する. TDD（失敗するテストを書く → 通す → リファクタ）を前提とし, 各タスクは原則 1 PR で扱える粒度にする. 完了したらチェックを入れる.
> サブエージェント分担の目安: T-test- は test-designer, T-impl- は implementer, T-doc- / T-finish- は管理者または implementer.

## ドラフト時点での未決事項

spec.md §「未決事項 / 確認待ち」の U-001 〜 U-007 は plan.md §「重要な決定」で保守側案を採用済みだが, 実装前に **ユーザー最終確認** を取りたい. 特に以下:

- [ ] U-005（タスク名の長さ・文字種）: 1〜200 文字 / 制御文字除外 の方針で良いかユーザー確認.
- [ ] U-003（削除の If-Match と既削除冪等）: 「既削除レコードへの再 DELETE は no-op 204」の方針で良いかユーザー確認.

上記が確定したら以下の実装タスクへ進む.

## 仕様 / 設計確定

- [x] spec.md 起票（本ドキュメント）
- [x] plan.md 起票（本ドキュメント）
- [ ] auditor によるドラフトレビュー（spec / plan の整合性確認）
- [ ] OpenAPI（`docs/developer/architecture/api/openapi.yaml`）の `/tasks` 系を本機能の決定（D-001 〜 D-010）に合わせて詳細化（リクエスト / レスポンススキーマ, エラー code 一覧の追記）

## 実装（バックエンド）

### 基盤セットアップ（案 A 範囲. plan.md §「前提と基盤の扱い」）

- [ ] サーバ用 Node.js プロジェクトを初期化（`package.json`, TypeScript 設定, Biome 設定）
- [ ] Hono の最小サーバを起動できる骨格を作成（ヘルスチェック `GET /healthz`）
- [ ] Bearer 認証ミドルウェア（環境変数 `TODICA_AUTH_TOKEN` と一致するときのみ通過）
- [ ] better-sqlite3 + drizzle-orm の接続とトランザクション境界ヘルパ
- [ ] drizzle-kit のスキーマ定義（`tasks`, `projects`, `idempotency_keys` の最小 3 テーブル）と初期マイグレーション生成
- [ ] Hono zod-openapi 統合の最小構成（ハンドラと OpenAPI 型の一致を担保）
- [ ] Idempotency-Key ミドルウェア（応答キャッシュ + 24h 期限）
- [ ] If-Match ミドルウェアヘルパ（欠落時 400 / 数値変換 / 比較関数）
- [ ] エラー → JSON 変換のグローバルハンドラ（`{ code, message }` 形式）

### ドメイン共有層

- [ ] `domain/clock` の `Clock` インターフェース定義と `SystemClock` / `FakeClock` 実装
- [ ] `domain/task` の Task 型定義（spec.md / plan.md §データモデル準拠）
- [ ] `domain/task/create` 純関数（既定値補完 + バリデーション）
- [ ] `domain/task/update` 純関数（部分上書き + バリデーション + version + 1 + updatedAt 更新, createdAt 不変）
- [ ] `domain/task/trash` 純関数（trashedAt / trashedReason セット, version + 1）
- [ ] バリデーション関数（name 長さ・制御文字, dueDate 値域, priority 値域）

### Repository / 永続化アダプタ

- [ ] `TaskRepository` インターフェース定義（insert / findById / list / update）
- [ ] `ProjectRepository` インターフェース（exists のみ）
- [ ] Drizzle 具象実装（tasks / projects テーブルアクセス）
- [ ] テスト用 in-memory SQLite セットアップヘルパ

### アプリケーション層（usecase）

- [ ] `CreateTaskUseCase`（projectId 参照確認 → ドメイン生成 → 永続化 → 1 トランザクション）
- [ ] `UpdateTaskUseCase`（findById → version 検証 → projectId 参照確認 → ドメイン更新 → 永続化）
- [ ] `DeleteTaskUseCase`（findById → 既削除なら 204 冪等 / それ以外は version 検証 → trash → 永続化）
- [ ] `ListTasksUseCase`（`?trashed=true|false|all` フィルタで一覧取得 + 暫定 3 段ソート）

### API レイヤ（Hono ハンドラ）

- [ ] `POST /api/v1/tasks`（zod 検証 + IdempotencyKey 必須 + UseCase 呼び出し + 201）
- [ ] `GET /api/v1/tasks`（クエリ `trashed` パース + UseCase + 200）
- [ ] `PATCH /api/v1/tasks/{id}`（IfMatch + IdempotencyKey 必須 + zod 検証 + 200 / 400 / 404 / 412）
- [ ] `DELETE /api/v1/tasks/{id}`（IfMatch + IdempotencyKey + 204 / 404 / 412 / 既削除冪等）
- [ ] エラー code（`INVALID_TASK_NAME` / `INVALID_DUE_DATE` / `PROJECT_NOT_FOUND` / `TASK_NOT_FOUND` / `MISSING_IF_MATCH` / `MISSING_IDEMPOTENCY_KEY` / `UNAUTHORIZED`）の組み込み

## 実装（フロントエンド）

### 基盤セットアップ（案 A 範囲）

- [ ] Vite + React + TypeScript ボイラープレートを生成（Biome 設定込み）
- [ ] React Router で `/` ルートのみ定義（今日ビュー兼用の最小ビュー）
- [ ] TanStack Query の QueryClientProvider セットアップ
- [ ] `fetch` ベースの API クライアント（Authorization ヘッダ自動付与, Idempotency-Key の自動生成, If-Match 引数受け取り）
- [ ] OpenAPI からの型生成パイプラインの最小実装（`openapi-typescript` 実行スクリプト）

### Repository / API クライアント

- [ ] `TaskRepository` インターフェース（クライアント側. サーバと共有可なら共有, さもなくば別建て）
- [ ] `HttpTaskRepository` 実装（POST / GET / PATCH / DELETE を呼び出す）

### UI / ユースケース

- [ ] 今日ビュー風の最小レイアウト（タイトル + 起票フォーム + タスクリスト）
- [ ] 起票フォーム（タスク名のみ必須, プロジェクト選択は任意, 期限の既定は today）と `useMutation`（楽観 UI で一覧に仮レコード追加）
- [ ] タスク一覧コンポーネント（暫定 3 段ソートでの表示）
- [ ] タスク編集ダイアログ（名称変更）と `useMutation`（If-Match 自動付与, 楽観 UI 差分更新）
- [ ] 期限切替トグル（today ↔ tomorrow）と `useMutation`
- [ ] 削除ボタンと `useMutation`（楽観 UI で一覧から除外）
- [ ] 412 を受け取った際の最小フィードバック UI（「サーバ側で更新されました. 再読み込みしてください」と通知 + 再フェッチ. 詳細 UI は BL-018 で本実装）

## テスト

### 単体（ドメイン層）

- [ ] `domain/task/create` の正常系・各バリデーション失敗系
- [ ] `domain/task/update` の差分適用 / version + 1 / createdAt 不変 / updatedAt 更新
- [ ] `domain/task/trash` の状態遷移
- [ ] バリデーション関数（name / dueDate / priority）の境界値

### 結合（サーバ）

- [ ] `POST /tasks` 正常系（spec.md「タスク名のみで起票できる」シナリオ）
- [ ] `POST /tasks` プロジェクト指定（spec.md「プロジェクトを指定できる」シナリオ）
- [ ] `POST /tasks` 不在プロジェクト → 400 PROJECT_NOT_FOUND
- [ ] `POST /tasks` dueDate 値域違反 → 400 INVALID_DUE_DATE
- [ ] `POST /tasks` 空 name → 400 INVALID_TASK_NAME
- [ ] `POST /tasks` 冪等性（同 Idempotency-Key 2 回 → 1 件のみ）
- [ ] `PATCH /tasks/{id}` 名称編集 → version + 1, createdAt 不変
- [ ] `PATCH /tasks/{id}` 期限切替 today → tomorrow
- [ ] `PATCH /tasks/{id}` 期限切替 tomorrow → today
- [ ] `PATCH /tasks/{id}` 期限値域外 → 400 INVALID_DUE_DATE
- [ ] `PATCH /tasks/{id}` 古い version → 412 + 現行 task ボディ
- [ ] `PATCH /tasks/{id}` If-Match 欠落 → 400 MISSING_IF_MATCH
- [ ] `PATCH /tasks/{id}` 存在しない id → 404 TASK_NOT_FOUND
- [ ] `DELETE /tasks/{id}` → 204 + trashedAt セット + 物理削除されていない
- [ ] `DELETE /tasks/{id}` 既削除レコード → 204 no-op
- [ ] `DELETE /tasks/{id}` 完了数カウントが増えない（カウント Repository 未呼び出し or Counter 未実装環境で正常完了）
- [ ] `GET /tasks` 既定では trashedAt = null のみ返す
- [ ] `GET /tasks?trashed=true` で trashed 済みのみ返す
- [ ] 認証なしリクエスト → 401

### 単体（クライアント）

- [ ] 起票フォーム描画 → 必須は name のみ, 期限は today / tomorrow の 2 値のみ提供
- [ ] 起票フォーム送信 → POST が指定形式で送られる（MSW で検証）
- [ ] 編集ダイアログ送信 → PATCH が If-Match 付きで送られる
- [ ] 期限切替トグル → PATCH に `{ dueDate }` のみ送られる
- [ ] 削除ボタン → DELETE が送られる
- [ ] 412 受領時に再フェッチが走る

### E2E

- [ ] サーバ + Web クライアント + ファイル SQLite の起動スクリプト
- [ ] 起票フォーム最小性のシナリオ
- [ ] 起票 → 一覧反映のシナリオ
- [ ] 名称編集 → 一覧反映のシナリオ
- [ ] 期限切替 → 期限値が更新されるシナリオ
- [ ] 削除 → 一覧から消えるシナリオ
- [ ] テストランナー（Playwright 等）の選定結果を `docs/developer/quality/test-strategy.md` に反映

## ドキュメント

- [ ] `docs/developer/architecture/api/openapi.yaml` の `/tasks` 系を request/response schema 込みで詳細化
- [ ] エラー code 一覧（本機能で導入したもの）を api/overview.md §「エラー詳細スキーマ」例に追記
- [ ] 必要であれば `docs/developer/quality/test-strategy.md` の TODO（ツール選定・実行方法・CI）を本機能の選定結果で更新
- [ ] `docs/developer/planning/backlog.md` の BL-001 / BL-004 / BL-012 を「Done」に更新（マージ後）

## 仕上げ

- [ ] spec.md の受け入れ基準（Gherkin シナリオ）すべてに対応するテストが green
- [ ] OpenAPI 定義と実装の整合性チェック（zod-openapi の型一致 / 手動レビュー）
- [ ] auditor によるレビュー依頼（受け入れ基準カバレッジ・コード品質・モジュール境界遵守）
- [ ] PR を作成し main へマージ（マージ条件: 全テスト green + auditor 承認）
