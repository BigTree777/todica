# 永続化実装

> 抽象アーキテクチャ上の「永続化機構」コンポーネント（サーバ側 / Android ローカルモード端末内）を, どのデータベース・接続ライブラリ・マイグレーションツールで実装するかを示す.
> 抽象側の方針（永続化が必要な箇所 / 論理スキーマ / マイグレーション運用ポリシー）は重複して書かない. 抽象側を参照すること.

## 1. 対応する抽象概念

- データベース概要（抽象）: [`overview.md`](overview.md).
- 論理スキーマ: [`schema.md`](schema.md).
- マイグレーション運用ポリシー（抽象）: [`migration-policy.md`](migration-policy.md).
- 抽象アーキテクチャでの位置: [`../module-boundaries.md`](../module-boundaries.md) §2「永続化アダプタ層」, §4.1「サーバ infra/persistence」, §4.4「android infra/local-store」.

## 2. 採用技術

### 2.1 サーバ側永続化

| 項目 | 採用 | 代替案 |
| --- | --- | --- |
| 永続化機構 | SQLite（WAL モード, サーバプロセス内蔵） | PostgreSQL / ファイル KVS |
| 接続ライブラリ | **`better-sqlite3` + `drizzle-orm`** | Prisma / 生 SQL |
| 配置 | サーバホスト上の単一ファイル `/var/lib/todica/todica.db` | （別案は採らない） |
| 動作モード | WAL（Write-Ahead Logging） | デフォルトのロールバックジャーナル |
| マイグレーションツール | **`drizzle-kit`**（TypeScript スキーマ定義から SQL マイグレーションを生成） | 手書き SQL スクリプト |
| マイグレーション実行タイミング | サーバ起動時に自動適用（CLI: `npm run migrate`） | （別案は採らない） |
| バックアップ | SQLite ファイルの定期コピー（cron） | DB レベルのレプリケーション |

### 2.2 Android ローカルモード端末内永続化

| 項目 | 採用 | 代替案 |
| --- | --- | --- |
| 永続化機構 | SQLite（**`@capacitor-community/sqlite`** プラグイン経由） | Room / sqflite / drift |
| 接続ライブラリ | Capacitor SQLite プラグインの JS API + **`drizzle-orm` の sqlite-proxy ドライバ**（サーバと同じスキーマ定義を共有） | 生 SQL |
| 配置 | Android 端末のアプリプライベートストレージ | （他アプリ・他端末から見える領域は採らない） |
| マイグレーションツール | **`drizzle-kit`**（サーバと共通. 生成された SQL を Capacitor SQLite プラグインの `executeSet` で実行） | プラグイン固有マイグレーション機構 |
| マイグレーション実行タイミング | アプリ起動時に自動適用 | （別案は採らない） |

## 3. 物理スキーマ

スキーマは **TypeScript 上で Drizzle の `sqliteTable` で定義する**（サーバ側 / Android ローカル側で同一の定義を共有）. `drizzle-kit` が CREATE TABLE / インデックス SQL を生成し, マイグレーションファイルとしてリポジトリに保存する.

### テーブル一覧（[`schema.md`](schema.md) と対応）

| テーブル名 | 主キー | 主なインデックス |
| --- | --- | --- |
| `tasks` | `id` TEXT | `(due_date, priority)`, `project_id`, `trashed_at`, `routine_id` |
| `projects` | `id` TEXT | `trashed_at` |
| `routines` | `id` TEXT | `trashed_at` |
| `counter` | `id` TEXT（固定値 `"singleton"`） | （単一レコードのため不要） |
| `settings` | `id` TEXT（固定値 `"singleton"`） | （同上） |
| `focus_selection` | `id` TEXT（固定値 `"singleton"`） | （同上） |

### 列の型対応（論理 → 物理）

| 論理型 | SQLite 物理型 | 備考 |
| --- | --- | --- |
| string | `TEXT` | UTF-8 |
| number / integer | `INTEGER` | `version` 等の楽観ロックも `INTEGER` |
| 列挙（"today" / "highest" 等） | `TEXT` + CHECK 制約 | Drizzle の `text({ enum: [...] })` で型安全 |
| ISO 8601 日時 | `TEXT` | アプリ側で文字列のまま扱う |
| nullable | `NULL` 許可 | Drizzle の `.notNull()` で必須化 |

### 同期メタデータ（全テーブル共通）

[`schema.md`](schema.md) の §「同期メタデータ」に従い, 各テーブルに `version INTEGER NOT NULL DEFAULT 1`, `updated_at TEXT NOT NULL` を持たせる. 書き込み API のサーバ実装はトランザクション内で `version = version + 1`, `updated_at = now()` を必ず行う.

### スキーマバージョン

- サーバ側マイグレーションの連番（`drizzle-kit generate` が `0000_...`, `0001_...` 形式で出力するものをそのまま使う）.
- Android ローカル側は同じマイグレーション SQL を取り込む（サーバ用 SQL の `pragma`/`autoincrement` 等の差分は drizzle-kit の SQLite dialect で吸収済み）.

## 4. マイグレーションファイル配置

- サーバ側: `server/drizzle/` （drizzle-kit のデフォルト出力先）.
- Android 側: `android-client/drizzle/`（サーバ側と同じ SQL をビルド時に同期, またはランタイムにバンドル読み込み）.
- ファイル名: `vNNN-<short-description>.<ext>`（[`migration-policy.md`](migration-policy.md) §3 と整合）.
- 拡張子: 採用するマイグレーションツールに従う（手書き SQL なら `.sql`, ORM のマイグレーションなら `.ts` 等）.

## 5. 採用理由 / 参照 ADR

- サーバ側永続化: [ADR-0007](../../adr/0007-server-tech-stack.md) §決定 P1.
  - データ規模に対して十分（数 MB 〜 数十 MB）.
  - 別プロセス管理が不要で個人 1 人運用に最適.
  - トランザクションがリセット冪等性（NFR-020, FR-043, FR-051）の構造的担保に効く.
  - バックアップが 1 ファイルのコピーで済む.
- Android ローカルモード端末内永続化: [ADR-0009](../../adr/0009-android-client-tech-stack.md) §「ローカルモード時の永続化」.
- WAL モードの採用理由:
  - 単一ユーザーで同時書き込みの並行性は低いが, 読み取りと書き込みが並行できるため UI 応答が安定する.
  - クラッシュリカバリ特性が改善される.
- ADR-0001（PostgreSQL 採用）/ ADR-0004（IndexedDB 採用）は廃止. 経緯は [ADR-0002](../../adr/0002-supersede-postgresql-adoption.md), [ADR-0007](../../adr/0007-server-tech-stack.md), [ADR-0009](../../adr/0009-android-client-tech-stack.md) を参照.

## 6. 実装上の注意点

- **シングルプロセス前提**: 永続化機構をサーバプロセス内蔵で動かすため, 複数サーバインスタンスでの水平スケールは想定しない. 個人 1 人運用に最適化する.
- **同時書き込み**: 単一ユーザーで衝突は通常起きないが, リセット処理と通常書き込みが同時に走る可能性があるため, 全更新は明示的なトランザクション境界の中で行う（[`overview.md`](overview.md) §5）.
- **ID 採番はドメイン側**: 永続化アダプタに自動採番させない. ドメイン層が UUID 等で採番する（テスト容易性とリセット冪等性のため. [`overview.md`](overview.md) §5）.
- **マルチテナント禁止**: テーブル定義に `user_id` / `tenant_id` / `owner_id` を持たない（CORE-2, [`schema.md`](schema.md) 共通方針）.
- **マイグレーションの後方互換**: 適用済みマイグレーションは編集しない. 破壊的変更時はバージョンを進め, 既存データを新スキーマへ移行する処理を必ず書く（[`migration-policy.md`](migration-policy.md) §4）.
- **マイグレーション失敗時の安全**: 失敗時にトランザクションが abort して旧状態に戻ること. ロールバックはサポートしない（運用は再構築 / 復元）.
- **バックアップ運用**: サーバ側は SQLite ファイルを定期コピーする. 自宅サーバの場合は外部ストレージへの定期転送を推奨. 詳細手順は別途運用ドキュメントで整備する.
- **Capacitor プラグイン保守**: Android ローカル側で採用する Capacitor SQLite プラグインはコミュニティ製のため, メンテナンス状況の継続ウォッチが必要（[ADR-0009](../../adr/0009-android-client-tech-stack.md) §結果 / 影響）.
- **モード間データ移送は非対応**: サーバ ↔ Android ローカルのデータ相互移送は本プロジェクトの保証範囲外（[`schema.md`](schema.md) §確定事項）. Android のモード切替は [ADR-0009](../../adr/0009-android-client-tech-stack.md) のとおり「切替 = 初期化」.

## 7. 関連ドキュメント

- データベース概要（抽象）: [`overview.md`](overview.md)
- 論理スキーマ: [`schema.md`](schema.md)
- マイグレーション運用ポリシー（抽象）: [`migration-policy.md`](migration-policy.md)
- 抽象アーキテクチャ: [`../overview.md`](../overview.md), [`../module-boundaries.md`](../module-boundaries.md)
- サーバ実装: [`../server/overview.md`](../server/overview.md)
- Android クライアント実装: [`../android-client/overview.md`](../android-client/overview.md)
- ADR: [`../../adr/0007-server-tech-stack.md`](../../adr/0007-server-tech-stack.md), [`../../adr/0009-android-client-tech-stack.md`](../../adr/0009-android-client-tech-stack.md), [`../../adr/0002-supersede-postgresql-adoption.md`](../../adr/0002-supersede-postgresql-adoption.md)
