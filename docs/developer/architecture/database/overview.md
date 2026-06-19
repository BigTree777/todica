# データベース

> Todica のデータ層の方針と永続化実装. エンティティ定義は [`schema.md`](schema.md), 変更運用は [`migration-policy.md`](migration-policy.md) を参照.
> 採用方式の決定根拠は [ADR-0007](../../adr/0007-server-tech-stack.md)（サーバ側）と [ADR-0009](../../adr/0009-android-client-tech-stack.md)（Android ローカルモード）.
>
> 本書は **抽象方針 (§1〜§7) と具体実装 (§8〜§11) を 1 ファイルにまとめる** (§12 は関連リンク). 抽象側の合意 (永続化箇所・配置・整合性方針) を先に示し, 後段で SQLite / Drizzle / 物理スキーマ等の具体に落とす.

## 1. 永続化が必要な箇所

Todica はクライアント・サーバ型構成（[ADR-0006](../../adr/0006-distribution-topology.md)）であり, 永続化が必要な箇所は次の 2 つに分かれる.

| 箇所 | 役割 | 採用方式の決定 ADR |
| --- | --- | --- |
| サーバ側永続化 | Web クライアント / Android サーバモード のデータ正本. | [ADR-0007](../../adr/0007-server-tech-stack.md) |
| Android ローカルモード端末内永続化 | サーバを使わない Android 単独利用時のデータ. Web とは独立. | [ADR-0009](../../adr/0009-android-client-tech-stack.md) |

## 2. 配置と接続

### 2.1 サーバ側

- 配置: 本人運用の自前サーバホスト上に置く.
- 接続方法: サーバプロセスが永続化機構のクライアント経由で開く. 抽象としては「サーバプロセス内蔵」または「外部プロセスに接続」のいずれの形態も許容する.
- データ規模: 個人 1 人ぶん（数 MB 〜 数十 MB 程度を想定）.
- バックアップ: 永続化機構が提供するスナップショット・ファイルコピー等で定期的に保全する. 詳細は §8 で扱う.

### 2.2 Android ローカルモード

- 配置: Android 端末内のアプリプライベートストレージ. 他アプリ・他端末から見えない.
- 接続方法: 端末内永続化機構を介してアプリプロセスから直接アクセスする.
- データ規模: 同上（個人 1 人ぶん）.

## 3. スキーマの位置づけ

- サーバ側 / Android ローカルモードのいずれも **同じ論理スキーマ** を共有する. エンティティ定義（タスク・プロジェクト・ルーティン・カウンタ・設定・フォーカス参照）は両者で共通.
- ただし **同期メタデータ** の有無に差がある. 詳細は [`schema.md`](schema.md) を参照.
- さらに `settings.dayBoundaryTimezone` 列は **Android ローカルモードのみ** が持つ（サーバモードは `process.env.TZ` で TZ を解決するため列を持たない）. これは同期メタデータではなくエンティティ列の差である（[`schema.md`](schema.md) §Settings 参照）.
- 論理スキーマは [`schema.md`](schema.md) に書く. 物理スキーマ（具体的な型定義・インデックス・DDL）は §9 で扱う.

## 4. ER 概要（論理）

```
Project 1 --- 0..* Task
                |
                | （プロジェクト未指定の場合は単独タスク）
                v
              (Project = null) も許容

Routine 1 --- 0..* Task （Routine から生成された当日のタスク）
                       ※ Routine 由来 Task は当日限り

Trash: 各エンティティ（Task / Project / Routine）が「ゴミ箱状態」を持つ
       （= 別エンティティではなく, 状態フラグ + ゴミ箱化日時で表す）

Counter: 「今日の完了タスク数」と「最後にリセットを実行した境界時刻」を持つ
         （単一レコード）

Settings: 「境界時刻」「タイムゾーン」などのユーザー設定を持つ
          （単一レコード）

FocusSelection: 「現在のタスク」参照（単一レコード）
```

## 5. データ整合性の方針

- **トランザクション**: 同じユースケース内の複数テーブル更新は 1 トランザクションで atomic に行う. 永続化機構が提供するトランザクション機能を用いる.
- **冪等性**: リセット処理は「最後に処理した境界時刻」を Counter（または隣接の進捗レコード）に記録し, 二重実行されても二重繰越を起こさない（NFR-020, FR-043, FR-051）.
- **ID**: ドメイン層がエンティティ ID を生成する（永続化側に自動採番を任せない. テスト容易性 / リセット冪等性のため）. UUID v4 を採用. クライアント先行採番により `Idempotency-Key` と一致させる.
- **ユーザー ID / テナント ID は持たない**（CORE-2 と整合）. サーバ側スキーマも単一ユーザー前提でフィールドを持たない.

## 6. 命名規約

- テーブル名: snake_case 複数形（例: `tasks`, `projects`, `routines`, `counter`, `settings`, `focus_selection`）.
- カラム名: snake_case で統一する. クライアント側コードとの変換は ORM / DTO レイヤで行う.
- 主キー: 各テーブルで `id`（文字列, UUID v4）. Counter / Settings / FocusSelection のように単一レコードのものは固定 ID（例: `"singleton"`）を用いる.

## 7. バックアップ・エクスポート

- サーバ側: 永続化機構の状態を定期的に保全する. 実装詳細は §8.1 と運用ドキュメントで扱う.
- Android ローカルモード: 「ローカルからサーバへの移行」「サーバからローカルへのエクスポート」は本プロジェクトの保証範囲外（[ADR-0009](../../adr/0009-android-client-tech-stack.md): モード切替 = 初期化）.

---

## 8. 採用技術

### 8.1 サーバ側永続化

| 項目 | 採用 | 代替案 |
| --- | --- | --- |
| 永続化機構 | SQLite（WAL モード, サーバプロセス内蔵） | PostgreSQL / ファイル KVS |
| 接続ライブラリ | **`better-sqlite3` + `drizzle-orm`** | Prisma / 生 SQL |
| 配置 | サーバホスト上の単一ファイル. パスは env `DATABASE_PATH` で指定（既定 `./todica.db`. 本番は `/var/lib/todica/todica.db` 等を推奨） | （別案は採らない） |
| 動作モード | WAL（Write-Ahead Logging） | デフォルトのロールバックジャーナル |
| マイグレーションツール | **`drizzle-kit`**（TypeScript スキーマ定義から SQL マイグレーションを生成） | 手書き SQL スクリプト |
| マイグレーション実行タイミング | サーバ起動時に自動適用（`main.ts`）. 明示実行はリポジトリルートで `npm run migrate`（サーバを起動せず `server/src/migrate.ts` が drizzle `migrate()` を実行） | （別案は採らない） |
| バックアップ | SQLite ファイルの定期コピー（cron） | DB レベルのレプリケーション |

### 8.2 Android ローカルモード端末内永続化

| 項目 | 採用 | 代替案 |
| --- | --- | --- |
| 永続化機構 | SQLite（**`@capacitor-community/sqlite`** プラグイン経由） | Room / sqflite / drift |
| 接続ライブラリ | Capacitor SQLite プラグインの JS API（`web/src/repositories/local-db.ts` で薄くラップし, マイグレーション定義の `up()` から生 SQL を `execute` / `query` / `run` で実行） | `drizzle-orm` の sqlite-proxy ドライバ（採用しない: サーバ schema との同期は手動運用） |
| 配置 | Android 端末のアプリプライベートストレージ | （他アプリ・他端末から見える領域は採らない） |
| マイグレーションツール | `web/src/repositories/local-migrations/` 配下に「1 ファイル = 1 バージョン」のマイグレーション定義を置き, `__local_migrations` テーブルで適用済みバージョンを記録する自前 version runner が起動時に順方向適用する（`drizzle-kit` を流用しない自前管理） | `drizzle-kit` 生成 SQL の流用（採用しない: スキーマ進行を Android 側で独立に追跡する） |
| マイグレーション実行タイミング | アプリ起動時に自動適用 | （別案は採らない） |

#### マイグレーション機構（version runner）

Android ローカル側は, サーバ側の `drizzle-kit` を流用せず, 自前の version runner で順方向のスキーマ移行を管理する.

- 定義配置: `web/src/repositories/local-migrations/` 配下に「1 ファイル = 1 バージョン」でマイグレーションを置く. 各定義は `{ version: number; name: string; up(db): Promise<void> }` の形を持つ. 初期スキーマ（6 テーブルの `CREATE TABLE IF NOT EXISTS` と `counter` / `settings` / `focus_selection` の singleton `INSERT OR IGNORE`）は `v001-initial.ts` が `v001` として保持する. `routines.trashed_at` 列の追加は `v002-routines-trashed-at.ts` が `v002` として保持する（`ALTER TABLE routines ADD COLUMN trashed_at TEXT` を冪等に適用する）.
- 登録一覧: `local-migrations/index.ts` の `migrations` 配列が本番の適用対象を列挙する.
- 適用済み管理: `__local_migrations` テーブル（`version` INTEGER PRIMARY KEY NOT NULL / `applied_at` TEXT NOT NULL / `name` TEXT 任意）で適用済みバージョンを記録する. runner は `SELECT MAX(version)`（不在 / NULL は 0 とみなす）を基準値とし, それより大きいバージョンの定義だけをバージョン昇順に `up()` 適用して記録する.
- 起動経路: `local-db.ts` の接続初期化が `runMigrations(conn)` を呼ぶ. テストは runner にダミー定義一覧を注入できる.
- トランザクション境界: 1 バージョン = 1 トランザクション（`begin` → `up()` → `__local_migrations` 記録 → `commit`, 失敗時は `rollback` して例外を伝播）.
- 方向: 順方向（up）のみ. down / rollback は提供しない（[`migration-policy.md`](migration-policy.md) §2 のロールバック非対応と整合）.

## 9. 物理スキーマ

スキーマは **TypeScript 上で Drizzle の `sqliteTable` で定義する**（サーバ側）. `drizzle-kit` が CREATE TABLE / インデックス SQL を生成し, マイグレーションファイルとしてリポジトリに保存する. Android ローカル側は同等の論理スキーマを `local-migrations/` 配下のマイグレーション定義（生 SQL の `CREATE TABLE IF NOT EXISTS` 等）として独立に管理し, version runner で順方向適用する（サーバ schema との同期は手動運用. §8.2「マイグレーション機構」参照）.

### テーブル一覧（[`schema.md`](schema.md) と対応）

| テーブル名 | 主キー | 主なインデックス |
| --- | --- | --- |
| `tasks` | `id` TEXT | `(due_date, priority)`, `project_id`, `trashed_at` |
| `projects` | `id` TEXT | （index なし） |
| `routines` | `id` TEXT | （index なし） |
| `counter` | `id` TEXT（固定値 `"singleton"`） | （単一レコードのため不要） |
| `settings` | `id` TEXT（固定値 `"singleton"`） | （同上） |
| `focus_selection` | `id` TEXT（固定値 `"singleton"`） | （同上） |
| `idempotency_keys` | `key` TEXT | （PK のみ. 書込 API の冪等応答キャッシュ） |
| `sessions` | `token` TEXT | （PK のみ. ログイン opaque token） |
| `app_password` | `id` TEXT（固定値 `"current"`） | （PK のみ. bcrypt ハッシュ単一行） |

### 列の型対応（論理 → 物理）

| 論理型 | SQLite 物理型 | 備考 |
| --- | --- | --- |
| string | `TEXT` | UTF-8 |
| number / integer | `INTEGER` | `version` 等の楽観ロックも `INTEGER` |
| 列挙（"today" / "highest" 等） | `TEXT` + CHECK 制約 | Drizzle の `text({ enum: [...] })` で型安全 |
| ISO 8601 日時 | `TEXT` | アプリ側で文字列のまま扱う |
| nullable | `NULL` 許可 | Drizzle の `.notNull()` で必須化 |

### 同期メタデータ（各エンティティテーブル共通）

[`schema.md`](schema.md) §「同期メタデータ」に従い, 各エンティティテーブル（`tasks` / `projects` / `routines` / `counter` / `settings` / `focus_selection`）に `version INTEGER NOT NULL DEFAULT 1`, `updated_at TEXT NOT NULL` を持たせる. 書き込み API のサーバ実装はトランザクション内で `version = version + 1`, `updated_at = now()` を必ず行う. 認証 / 冪等性の infra テーブル（`idempotency_keys` / `sessions` / `app_password`）はこの同期メタデータを持たない.

### スキーマバージョン

- サーバ側マイグレーションの連番（`drizzle-kit generate` が `0000_...`, `0001_...` 形式で出力するものをそのまま使う）.
- Android ローカル側は drizzle の SQL を流用せず, `web/src/repositories/local-migrations/` の独自 version runner で `v001` / `v002` … のバージョンを `__local_migrations` テーブルに記録しながら順方向適用する（§8.2「マイグレーション機構」参照）.

### マイグレーションファイル配置

- サーバ側: `server/drizzle/` （drizzle-kit のデフォルト出力先）.
- Android 側: `web/src/repositories/local-migrations/`（「1 ファイル = 1 バージョン」の `up()` 定義. `__local_migrations` テーブルで適用済みバージョンを記録. §8.2 参照）.
- ファイル名はサーバ側が drizzle-kit 生成の命名（`<NNNN>_<short-description>.sql` 形式. 例: `0000_initial.sql`）, Android ローカル側が `vNNN-<short-description>.ts`（例: `v001-initial.ts`）に従う. [`migration-policy.md`](migration-policy.md) §3 の「`vNNN-...`」表記はツール非依存の抽象表現であり, サーバ側は drizzle-kit 命名, Android 側は `vNNN` 命名として実装する.

## 10. 採用理由 / 参照 ADR

- サーバ側永続化: [ADR-0007](../../adr/0007-server-tech-stack.md) §決定 P1.
  - データ規模に対して十分（数 MB 〜 数十 MB）.
  - 別プロセス管理が不要で個人 1 人運用に最適.
  - トランザクションがリセット冪等性（NFR-020, FR-043, FR-051）の構造的担保に効く.
  - バックアップが 1 ファイルのコピーで済む.
- Android ローカルモード端末内永続化: [ADR-0009](../../adr/0009-android-client-tech-stack.md) §「ローカルモード時の永続化」.
- WAL モードの採用理由:
  - 単一ユーザーで同時書き込みの並行性は低いが, 読み取りと書き込みが並行できるため UI 応答が安定する.
  - クラッシュリカバリ特性が改善される.
- 旧 ADR-0004（IndexedDB 採用）は廃止. 採用方式の最新決定は [ADR-0007](../../adr/0007-server-tech-stack.md), [ADR-0009](../../adr/0009-android-client-tech-stack.md) を参照.

## 11. 実装上の注意点

- **シングルプロセス前提**: 永続化機構をサーバプロセス内蔵で動かすため, 複数サーバインスタンスでの水平スケールは想定しない. 個人 1 人運用に最適化する.
- **同時書き込み**: 単一ユーザーで衝突は通常起きないが, リセット処理と通常書き込みが同時に走る可能性があるため, 全更新は明示的なトランザクション境界の中で行う（§5）.
- **ID 採番はドメイン側**: 永続化アダプタに自動採番させない. ドメイン層が UUID v4 で採番する（§5）.
- **マルチテナント禁止**: テーブル定義に `user_id` / `tenant_id` / `owner_id` を持たない（CORE-2, [`schema.md`](schema.md) 共通方針）.
- **マイグレーションの後方互換**: 適用済みマイグレーションは編集しない. 破壊的変更時はバージョンを進め, 既存データを新スキーマへ移行する処理を必ず書く（[`migration-policy.md`](migration-policy.md) §4）.
- **マイグレーション失敗時の安全**: 失敗時にトランザクションが abort して旧状態に戻ること. ロールバックはサポートしない（運用は再構築 / 復元）.
- **バックアップ運用**: サーバ側は SQLite ファイルを定期コピーする. 自宅サーバの場合は外部ストレージへの定期転送を推奨. 詳細手順は別途運用ドキュメントで整備する.
- **Capacitor プラグイン保守**: Android ローカル側で採用する Capacitor SQLite プラグインはコミュニティ製のため, メンテナンス状況の継続ウォッチが必要（[ADR-0009](../../adr/0009-android-client-tech-stack.md) §結果 / 影響）.
- **モード間データ移送は非対応**: サーバ ↔ Android ローカルのデータ相互移送は本プロジェクトの保証範囲外（[`schema.md`](schema.md) §確定事項）. Android のモード切替は [ADR-0009](../../adr/0009-android-client-tech-stack.md) のとおり「切替 = 初期化」.

## 12. 関連ドキュメント

- 論理スキーマ詳細: [`schema.md`](schema.md)
- マイグレーション運用: [`migration-policy.md`](migration-policy.md)
- 抽象アーキテクチャ: [`../overview.md`](../overview.md), [`../module-boundaries.md`](../module-boundaries.md)
- サーバ実装: [`../server/overview.md`](../server/overview.md)
- Android クライアント実装: [`../android-client/overview.md`](../android-client/overview.md)
- ADR: [`../../adr/0006-distribution-topology.md`](../../adr/0006-distribution-topology.md), [`../../adr/0007-server-tech-stack.md`](../../adr/0007-server-tech-stack.md), [`../../adr/0009-android-client-tech-stack.md`](../../adr/0009-android-client-tech-stack.md), [`../../adr/0011-day-boundary-time-source.md`](../../adr/0011-day-boundary-time-source.md)
