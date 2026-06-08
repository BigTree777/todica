# 設計・実装計画: 境界時刻の設定

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md), API は [`../../architecture/api/overview.md`](../../architecture/api/overview.md), DB は [`../../architecture/database/schema.md`](../../architecture/database/schema.md) を参照.

## 方針概要

- **Settings を独立した単一レコード** (`id = "singleton"`) として SQLite に追加. 物理スキーマ (drizzle) と Repository を新設し, `get()` 内の lazy upsert で 1 件を常に確保する (BL-006 / BL-008 の FocusRepository / CounterRepository と同じパターン).
- **`GET /api/v1/settings` を実装**. 読取専用 (Idempotency-Key / If-Match 不要).
- **`PATCH /api/v1/settings` を実装**. `dayBoundaryTime` フィールドのみを更新対象とし, 楽観ロック (`If-Match` + `version`) と冪等性 (`Idempotency-Key`) を適用する.
- **Web クライアント側 SettingsView を新規作成**. `/settings` ルートに配置し, 現在の設定値表示とフォーム更新を提供する.
- **本 feature では境界時刻を日付計算に適用しない**. 設定値の保存・返却のみを担う. 適用は BL-010 (リセット処理) / BL-020 (Android ローカルモード) の責務.

## 既存実装の調査結果

| 項目 | 現状 | 本実装で変更 |
| --- | --- | --- |
| Settings 論理スキーマ | `architecture/database/schema.md` に骨格定義あり | `dayBoundaryTime` フィールドを追加確定 |
| Settings 物理スキーマ (drizzle) | `server/src/db/schema.ts` に未定義 | `settings` テーブル + マイグレーションを追加 |
| Settings Repository | 未定義 | `server/src/data/settings-repository.ts` を新設 |
| `GET /api/v1/settings` ハンドラ | 未実装 (openapi.yaml に骨格のみ) | 新規実装 |
| `PATCH /api/v1/settings` ハンドラ | 未実装 (openapi.yaml に骨格 `PUT` として定義) | 新規実装 (`PATCH` に変更. D-001 参照) |
| OpenAPI `Settings` スキーマ | properties が空 (`type: object, description` のみ) | `dayBoundaryTime` / `version` / `updatedAt` で詳細化 |
| Web: SettingsView | 存在しない | 新規作成 (`web/src/ui/settings-view/`) |
| Web: SettingsRepository | 存在しない | 新規作成 (`web/src/repositories/settings-repository.ts`) |

### 参考実装 (既存 singleton パターン)

BL-006 の `DrizzleFocusRepository` と BL-008 の `DrizzleCounterRepository` が singleton レコードの lazy upsert パターンの参考になる.

- `get()`: `SELECT` して存在しなければ `INSERT` して返す (upsert 相当).
- `update(settings: Settings)`: `UPDATE` で全フィールドを上書き.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 新規実装 `GET /api/v1/settings`. 新規実装 `PATCH /api/v1/settings` (既存 OpenAPI の `PUT` を `PATCH` に変更). `openapi.yaml` の `Settings` スキーマを具体化 (`dayBoundaryTime`, `version`, `updatedAt`). エラーコード `INVALID_DAY_BOUNDARY_TIME` を追加. |
| DB | `settings` テーブルを drizzle スキーマに追加 (`id` PK, `day_boundary_time` TEXT NOT NULL DEFAULT "04:00", `updated_at` TEXT NOT NULL, `version` INTEGER NOT NULL DEFAULT 1). マイグレーションを 1 本追加. singleton レコードは lazy upsert で確保 (D-002). |
| サーバ | `server/src/data/settings-repository.ts` を新設. `server/src/infra/persistence/drizzle/settings-repository.ts` を新設. `server/src/app.ts` に `GET /api/v1/settings`, `PATCH /api/v1/settings` ハンドラを追加. `AppDeps` に `settingsRepository: SettingsRepository` を追加. |
| Web UI | `web/src/repositories/settings-repository.ts` を新設 (インターフェース + HTTP 実装). `web/src/ui/settings-view/settings-view.tsx` を新規作成. ルーティング設定に `/settings` を追加. |
| ドキュメント | `docs/developer/architecture/api/openapi.yaml` の `/settings` ブロックを詳細化. `Settings` スキーマに `dayBoundaryTime` / `version` / `updatedAt` を追加. `ErrorCode` enum に `INVALID_DAY_BOUNDARY_TIME` を追加. |

## 設計詳細

### データモデル

`settings` テーブル (drizzle スキーマ):

```ts
// server/src/db/schema.ts に追加
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().notNull(), // 固定値 "singleton"
  dayBoundaryTime: text("day_boundary_time").notNull().default("04:00"),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});
```

- 単一レコード前提のため CHECK 制約は不要 (PK が固定値 `"singleton"`).
- `dayBoundaryTime` の値域バリデーション (`"00:00"` 〜 `"23:59"`) は API ハンドラ層で行う. DB 層では文字列として保存するのみ.
- `version` カラムは楽観ロックに使う.

### Repository インターフェース

```ts
// server/src/data/settings-repository.ts (新設)
export interface Settings {
  id: string;              // 固定値 "singleton"
  dayBoundaryTime: string; // "HH:MM" 形式 (例: "04:00")
  updatedAt: string;       // ISO 8601
  version: number;
}

export interface SettingsRepository {
  /** singleton レコードを返す. 未存在時は dayBoundaryTime = "04:00" で lazy upsert して返す. */
  get(): Promise<Settings>;
  /** singleton レコードを丸ごと上書きする. アプリ層が dayBoundaryTime / version / updatedAt を渡す前提. */
  update(settings: Settings): Promise<void>;
}
```

- `get()` は FocusRepository / CounterRepository と同じ lazy upsert パターン (D-002).
- BL-010 (日次リセット) が境界時刻を読む際も同じ `get()` を使う.

### API リソース定義

#### `GET /api/v1/settings`

- 認証必須. Idempotency-Key / If-Match 不要 (読取専用).
- 200 OK:
  ```json
  {
    "settings": {
      "id": "singleton",
      "dayBoundaryTime": "04:00",
      "version": 1,
      "updatedAt": "2026-06-08T08:00:00.000Z"
    }
  }
  ```
- 401 UNAUTHORIZED: 認証なし.

#### `PATCH /api/v1/settings`

- 認証必須. `Idempotency-Key` ヘッダ必須. `If-Match` ヘッダ必須.
- リクエストボディ:
  ```json
  { "dayBoundaryTime": "06:00" }
  ```
- 200 OK: 更新後の Settings を返す.
  ```json
  {
    "settings": {
      "id": "singleton",
      "dayBoundaryTime": "06:00",
      "version": 2,
      "updatedAt": "2026-06-08T09:00:00.000Z"
    }
  }
  ```
- 400 INVALID_DAY_BOUNDARY_TIME: `dayBoundaryTime` が形式違反 / 範囲外.
- 400 INVALID_REQUEST_BODY: リクエストボディが無効 (フィールド不足など).
- 401 UNAUTHORIZED: 認証なし.
- 412 Precondition Failed: `If-Match` の version 不一致. レスポンスボディに現在の `{ settings }` を含める (D-004).

#### バリデーション仕様

`dayBoundaryTime` の正規表現: `^([01]\d|2[0-3]):[0-5]\d$`

- `([01]\d)`: 00 〜 19 の時
- `(2[0-3])`: 20 〜 23 の時
- `[0-5]\d`: 00 〜 59 の分

形式違反 / 範囲外はすべて 400 `INVALID_DAY_BOUNDARY_TIME` を返す.

### 処理フロー

#### 1. Settings 取得 (`GET /api/v1/settings`)

```
クライアント (任意)
  └─ HTTP GET /api/v1/settings
      ├─ middleware/auth: Bearer 検証 → 401 if NG
      └─ server: get-settings ハンドラ
          ├─ settingsRepository.get() → Settings (未存在なら lazy upsert で初期値を返す)
          └─ 200 OK { settings }
```

#### 2. Settings 更新 (`PATCH /api/v1/settings`)

```
クライアント (SettingsView フォーム送信)
  └─ HTTP PATCH /api/v1/settings
      ├─ middleware/auth: Bearer 検証 → 401 if NG
      ├─ middleware/idempotency: Idempotency-Key 検証 → 既処理なら保存応答
      └─ server: patch-settings ハンドラ
          ├─ body バリデーション → dayBoundaryTime が無ければ 400 INVALID_REQUEST_BODY
          ├─ dayBoundaryTime 形式バリデーション → 正規表現不一致なら 400 INVALID_DAY_BOUNDARY_TIME
          ├─ current = settingsRepository.get()
          ├─ If-Match 検証 → 412 if current.version != If-Match (レスポンスに { settings: current })
          ├─ updated = { ...current, dayBoundaryTime, version: current.version + 1, updatedAt: now }
          ├─ settingsRepository.update(updated)
          └─ 200 OK { settings: updated }
```

### UI 設計 (SettingsView)

```
[ 設定 ]
[ 境界時刻 ]
  現在の値: "04:00"
  [フォーム入力: HH:MM]  [保存]

(エラー時)
  "境界時刻は HH:MM 形式 (00:00 〜 23:59) で入力してください"
```

- `GET /api/v1/settings` で初期値を取得して表示する.
- フォーム送信時に `PATCH /api/v1/settings` を呼ぶ.
- 成功後に `GET /api/v1/settings` で最新値を再フェッチして表示を更新する (サーバ正本値の信頼).
- バリデーション違反 (400) はフォームにエラーメッセージを表示する.
- 412 (version 不一致) は PatchConflictError.settings（412 ボディから取得した最新値）を直接 state に反映し、追加の GET リクエストはしない（D-004）。ユーザーに再試行を促す.
- レイアウト・スタイルは implementer 裁量. 「境界時刻の設定値が表示される」「フォームで更新できる」「エラーが表示される」が成り立つこと.

### 例外 / エラー処理

| HTTP ステータス | code | 発生条件 |
| --- | --- | --- |
| 200 | - | GET 成功 / PATCH 成功 |
| 400 | `INVALID_REQUEST_BODY` | リクエストボディが無効 (dayBoundaryTime フィールド不足など) |
| 400 | `INVALID_DAY_BOUNDARY_TIME` | dayBoundaryTime が形式違反 / 範囲外 |
| 401 | `UNAUTHORIZED` | 認証なし |
| 412 | - | If-Match の version 不一致 (レスポンスボディに { settings: current }) |
| 500 | `INTERNAL_ERROR` | 予期せぬ例外 |

## 重要な決定

- **D-001: `PUT /api/v1/settings` を `PATCH /api/v1/settings` に変更する**.
  - 理由: Settings は将来タイムゾーンなどのフィールドが追加される可能性があり, 部分更新の意味論が適切. 既存 OpenAPI の `PUT` は骨格のみで実装は存在しないため, 変更コストはゼロ.
  - 不採用案: `PUT` を踏襲する. フィールドが 1 つしかない現状では差はないが, 将来の拡張時に全フィールド必須の `PUT` は不便になる.
- **D-002: singleton レコードを lazy upsert で確保する**.
  - 理由: BL-006 の `DrizzleFocusRepository` と BL-008 の `DrizzleCounterRepository` が同じパターンを採用している. マイグレーションとアプリ起動ロジックを分離でき, `get()` が常に安全に呼べる.
  - 実装: `get()` 内で `SELECT → INSERT ... ON CONFLICT DO UPDATE SET ... WHERE false` または `INSERT OR IGNORE` してから `SELECT` する, 既存パターンに従う.
  - 不採用案: マイグレーション内 `INSERT OR IGNORE` で確保. 起動コードが不要になるが, マイグレーション SQL の実行タイミングに依存する.
- **D-003: バリデーションは API ハンドラ層で行う**.
  - 理由: DB 層は文字列として保存するのみ. ドメインルール (`"00:00"` 〜 `"23:59"` の HH:MM 形式) はアプリ層が担う. Repository は値の正当性を前提とした薄い CRUD に留める.
  - 正規表現: `^([01]\d|2[0-3]):[0-5]\d$`
- **D-004: 412 レスポンスボディに現在の `{ settings }` を含める**.
  - 理由: BL-001 が 412 時に現行 task を返す方針 (`PreconditionFailed` response に entity を含める) と整合. クライアントが現在値を再取得するための追加リクエストを省ける.
  - 実装: `If-Match` 不一致検出時に `settingsRepository.get()` した値を `{ settings: current }` として 412 応答に含める.
- **D-005: 本 feature では境界時刻を日付計算に適用しない**.
  - 理由: 責務の分離. 適用ロジックが BL-010 / BL-020 で確立する前に, 設定値の保存・返却だけを安定させる.
  - 明示: 本 feature のテストでは「設定値が保存・返却される」ことのみを検証する.
- **D-006: ADR は新規作成しない**.
  - 理由: 既存 ADR-0011 (時刻基準), ADR-0004 (永続化), ADR-0010 (API 設計) で本 feature の主要判断はカバーされている. 本 plan.md に書ききる.

## リスク / 代替案

- **R-001: BL-010 (日次リセット) が `dayBoundaryTime` を読む際の整合**.
  - BL-010 は `settingsRepository.get()` で `dayBoundaryTime` を読む想定. 本 feature が正しく実装されれば問題ない.
  - 対策: `SettingsRepository.get()` のインターフェースを BL-010 が使いやすい形で設計する. 本 plan.md でインターフェースを確定しておくことで BL-010 の実装の前提を与える.
- **R-002: `PUT` → `PATCH` の変更による既存ドキュメントとの齟齬**.
  - openapi.yaml の `/settings` は `PUT` として定義されている. 本 feature で `PATCH` に変更する (D-001).
  - 対策: openapi.yaml の更新を tasks.md に含める.
- **R-003: SettingsView のルーティング実装が未確定**.
  - Web クライアントのルーティング構成 (React Router など) に依存する. 既存の `/today` ルートと同様のパターンで `/settings` を追加する.
  - 対策: implementer が既存ルーティング実装を確認して合わせる. tasks.md に明示.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 結合テスト (サーバ API)

- **対象**: `GET /api/v1/settings` / `PATCH /api/v1/settings`.
- **ツール**: Vitest + Hono Testing Helper + better-sqlite3 in-memory (既存パターン).
- **観点**: spec.md の受け入れ基準 (Gherkin) と 1:1 対応するシナリオ. 特に:
  - 初回 `GET /api/v1/settings` → 200 `{ settings: { dayBoundaryTime: "04:00", version: 1, ... } }`.
  - 認証なし → 401.
  - 有効な `dayBoundaryTime` で PATCH → 200, version が +1 になる.
  - 正規表現違反の `dayBoundaryTime` で PATCH → 400 `INVALID_DAY_BOUNDARY_TIME`.
  - `dayBoundaryTime` フィールド省略の PATCH → 400 `INVALID_REQUEST_BODY`.
  - version 不一致 → 412, レスポンスに現在の settings が含まれる.
  - 同じ Idempotency-Key で再送 → 保存済み応答, version は 1 回分だけ増える.
  - サーバ再起動後も更新値が維持される (ファイル SQLite を使う結合テスト or ドキュメントのみで担保).

### 単体テスト (クライアント)

- **対象**: `web/src/ui/settings-view/settings-view.tsx`.
- **ツール**: Vitest + React Testing Library.
- **観点**:
  - `repository.getSettings()` の戻り値に `dayBoundaryTime: "04:00"` が含まれていれば, 画面に `"04:00"` が表示される.
  - フォームに有効な値を入力して保存すると `patchSettings()` が呼ばれ, 再フェッチ後に新しい値が表示される.
  - バリデーション違反の値で保存するとエラーメッセージが表示される.
  - 412 応答時は設定値が再取得され, エラーメッセージが表示される.

### 重視するもの

- **「設定値が永続化される」こと**. NFR-012 の根幹. DB の物理レコードが更新されること.
- **バリデーションの網羅性**. `"00:00"` 〜 `"23:59"` の境界値 (最小・最大) および違反例 (1 桁の時, 分が 60 以上) を結合テストで確認する.
- **楽観ロックと冪等性**. 412 / Idempotency-Key 再送のシナリオを結合テストで確認する.
