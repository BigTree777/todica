# スキーマ定義（論理）

> Todica のエンティティ定義. **論理レベル** （どんなフィールドを持つか・型カテゴリ・制約・関連）を記述する.
> 物理レベル（具体的な型・インデックス・DDL）は [`overview.md`](overview.md) に書く.
> 概要は [`overview.md`](overview.md) を先に読むこと.

## 共通方針

- 本書のスキーマは **サーバ側永続化と Android ローカルモード端末内永続化の両方で共通** に使う. 物理的にはテーブル定義が別 DB に同居するが, 論理は同一.
- ID: 文字列（UUID v4. ドメイン層で採番. クライアントが先行採番してオフライン書込キュー → サーバ側で同じ ID を `Idempotency-Key` として扱う）.
- 日時: ISO 8601 文字列で保持する（タイムゾーン情報を含めること）.
- 「ゴミ箱状態」は別エンティティではなく, **対象エンティティの `trashedAt`（ゴミ箱に入った日時）が `null` でないこと** で表す. これにより, FR-060（ゴミ箱経由）と FR-061（復元）を「`trashedAt` を立てる / 解除する」という同一機構で扱える.
- **マルチユーザー前提のフィールドを持たない**（CORE-2 と整合）. すなわち `userId` / `tenantId` / `ownerId` 等のカラムは作らない.
- 本書は型カテゴリ（string / number / 列挙 / null 可否）のみを示す. 永続化機構ごとの具体的な型・インデックス・DDL は [`overview.md`](overview.md) を参照.

### 同期メタデータ（全エンティティ共通. サーバ側 / Android ローカル側ともに保持）

PWA + オフライン書込キュー + 楽観ロック（[ADR-0008](../../adr/0008-web-client-tech-stack.md)）のため, 全エンティティ（Task / Project / Routine / Counter / Settings / FocusSelection）に次のフィールドを持たせる. 全エンティティの共通フィールドは `id` / `version` / `createdAt` / `updatedAt` の 4 つ. **`version` は本節の記述で代表し各表では繰り返さない. `id` / `createdAt` / `updatedAt` は各表で再掲する.**

| フィールド | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `version` | integer | 必須, 初期値 1 | 楽観ロック用バージョン番号. 書き込みごとに +1. クライアントは `If-Match: <version>` で送信し, サーバが現行値と照合して衝突検知. |
| `updatedAt` | string (ISO 8601) | 必須 | 最終更新日時. 監査用途と, 同期/競合解決の判断に用いる. API レスポンス・DB カラム共に同一名（DB は snake_case の `updated_at`）. |

これらは **サーバ側 SQLite と Android ローカル側 SQLite の両方に物理カラムとして存在** する.
- サーバモード時: クライアントから `If-Match` で送られる `version` をサーバが検証.
- Android ローカルモード時: クライアント単体で完結するため衝突は基本起きないが, 将来サーバへ移行する選択肢を閉じないため同じスキーマを保持する.

---

## Task（タスク）

最小単位の作業項目. プロジェクトに属するか, 単独タスクとして存在する（FR-001, FR-008）. ルーティンから自動生成されたものも Task として表現する（後述 `origin` 参照）.

| フィールド | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | string | PK, 必須 | タスク ID |
| `name` | string | 必須, 編集可（FR-009） | タスク名 |
| `projectId` | string \| null | 任意 | 所属プロジェクト. `null` の場合はプロジェクト外タスク（FR-001, project.md §8 In Scope） |
| `dueDate` | "today" \| "tomorrow" | 必須 | 期限. 値域は今日 / 明日のみ（FR-002, FR-005） |
| `priority` | "highest" \| "normal" \| "later" | 必須 | 優先度 3 段階（FR-003, FR-004） |
| `origin` | "manual" \| "routine" | 必須 | 由来. `"routine"` はルーティン由来タスク（FR-033 の対象判定に使う） |
| `routineId` | string \| null | `origin = "routine"` のとき必須 | 生成元ルーティンへの参照. ただしルーティン履歴は持たない（FR-034）ので, 表示用の弱参照に留める |
| `createdAt` | string (ISO 8601) | 必須 | 作成日時 |
| `updatedAt` | string (ISO 8601) | 必須 | 更新日時 |
| `trashedAt` | string (ISO 8601) \| null | 任意 | ゴミ箱状態の起点. `null` でなければゴミ箱にある（FR-060, FR-061） |
| `trashedReason` | "completed" \| "deleted" \| null | 任意 | ゴミ箱化の理由. 完了（FR-006）か削除（FR-007）か. `trashedAt` と同時に意味を持つ |

- 状態遷移
  - 起票 → 通常状態（`trashedAt = null`）.
  - 完了アクション（FR-006）: `trashedAt = now`, `trashedReason = "completed"`. 完了数カウントを +1.
  - 削除アクション（FR-007）: `trashedAt = now`, `trashedReason = "deleted"`. カウントには加算しない.
  - 復元（FR-061）: `trashedAt = null`, `trashedReason = null`. 完了済み Task（`trashedReason = "completed"`）の復元も可能だが, **完了カウントは戻さない**（既に集計済みのため. NFR-020 整合）.
  - リセット時の自動完全削除（FR-062）: ストアから物理削除.
- 検索の論理要件: 「期限と優先度の組合せで今日ビューに並べる」「プロジェクトで絞り込む」「ゴミ箱状態で絞り込む」が成り立つこと. 具体的なインデックス定義は [`overview.md`](overview.md).

---

## Project（プロジェクト）

タスクに文脈を与える集合（FR-008, FR-020）. 不要になればゴミ箱経由で削除する（FR-021 のとおり, アーカイブは持たない）.

| フィールド | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | string | PK, 必須 | プロジェクト ID |
| `name` | string | 必須, 編集可（FR-022） | プロジェクト名 |
| `createdAt` | string (ISO 8601) | 必須 | 作成日時 |
| `updatedAt` | string (ISO 8601) | 必須 | 更新日時 |
| `trashedAt` | string (ISO 8601) \| null | 任意 | ゴミ箱状態の起点（FR-060, FR-061） |

- プロジェクト削除時, 紐づく Task の扱いは **UI でユーザーに確認** する（カスケードゴミ箱化 / Task を独立化 のいずれかをユーザーが選ぶ. データモデル上の自動カスケードは行わない. 詳細は本書 §確定事項）.
- 検索の論理要件: ゴミ箱状態での絞り込みが成り立つこと.

---

## Routine（ルーティン）

繰り返す作業の定義. 指定曜日に Task を自動生成する（FR-030, FR-031）. 実施履歴・ストリークは持たない（FR-034, OOS-008）.

| フィールド | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | string | PK, 必須 | ルーティン ID |
| `name` | string | 必須, 編集可（FR-035） | ルーティン名 |
| `generateOnWeekdays` | ("mon" \| "tue" \| "wed" \| "thu" \| "fri" \| "sat" \| "sun")[] | 必須（1 つ以上）, 編集可（FR-035） | 生成する曜日（FR-030, FR-031） |
| `defaultPriority` | "highest" \| "normal" \| "later" | 必須, 編集可（FR-035） | 生成時の既定優先度（FR-030） |
| `lastGeneratedForDate` | string (YYYY-MM-DD) \| null | 任意 | 最後にタスクを生成した「Todica 上の日付」. 二重生成を防ぐ運用フラグ |
| `createdAt` | string (ISO 8601) | 必須 | 作成日時 |
| `updatedAt` | string (ISO 8601) | 必須 | 更新日時 |
| `trashedAt` | string (ISO 8601) \| null | 任意 | ルーティン自体の削除. ゴミ箱経由（FR-060） |

- ルーティン由来タスクは Task テーブルに `origin = "routine"` として生成する. ルーティン自体はそのまま残り, 翌日も同じ仕組みで生成される.
- ルーティン由来タスクが当日中に未実施でも, リセット時に持ち越さない（FR-033 / FR-043）. これは Task 側で「`origin = "routine"` かつ未完了」を判定して破棄することで実現する.
- 検索の論理要件: ゴミ箱状態での絞り込み, 当日の生成対象判定（曜日条件）が成り立つこと.

---

## Counter（今日の完了数 / リセット進捗）

「今日の完了タスク数」（FR-040）と, リセット処理の冪等性（NFR-020）のための進捗値を持つ. **単一レコード**（固定 ID `"singleton"`）.

| フィールド | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | string | PK, 固定値 `"singleton"` | 単一レコード識別子 |
| `completedCount` | number | 必須, 0 以上の整数 | 「今日の完了タスク数」（FR-040, FR-006） |
| `lastResetExecutedAt` | string (ISO 8601) \| null | 任意 | 最後に「リセット処理」を実行した境界時刻（NFR-020, FR-043） |
| `updatedAt` | string (ISO 8601) | 必須 | 更新日時 |

- `completedCount` はリセット時に 0 にする（FR-043）.
- `lastResetExecutedAt` はリセット処理の冪等性に使う. 次回リセット判定は「現在時刻が `lastResetExecutedAt` の次の境界時刻を超えているか」で行う.
- サーバ側 / Android ローカルモードのいずれでも同じ意味. Clock の実装が異なるだけ（[ADR-0011](../../adr/0011-day-boundary-time-source.md)）.

---

## Settings（設定）

ユーザー設定. 設定項目は最小限（NFR-012）. **単一レコード**（固定 ID `"singleton"`）.

| フィールド | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | string | PK, 固定値 `"singleton"` | 単一レコード識別子 |
| `dayBoundaryTime` | string ("HH:mm") | 必須 | 「今日」と「翌日」を切り替える境界時刻（FR-041, FR-042） |
| `dayBoundaryTimezone` | string (IANA) | 必須 | 境界時刻の解釈に用いるタイムゾーン |
| `updatedAt` | string (ISO 8601) | 必須 | 更新日時 |

- 既定値は **`"04:00"`**（早朝 4 時. ユーザーの大半が就寝中で日付境界の体感に近い時刻）. ユーザーが設定で変更可能.
- Android のモード設定（ローカル / サーバ）は本テーブルに含めない（Android アプリ固有のローカル設定として別途持つ）.

---

## FocusSelection（現在のタスク参照）

「今フォーカスされているタスクは何か」を表す. **単一レコード**（固定 ID `"singleton"`）. 同時に現在のタスクになれるのは 1 つだけ（FR-012）.

| フィールド | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | string | PK, 固定値 `"singleton"` | 単一レコード識別子 |
| `currentTaskId` | string \| null | 任意 | 現在のタスク. 未選択時は `null`. Task が完了 / 削除されたら自動繰り上げ（FR-013）で更新 |
| `updatedAt` | string (ISO 8601) | 必須 | 更新日時 |

- フォーカスを別エンティティに切り出すか, Counter / Settings と一体化するかは実装側の判断で良い（**実装側裁量**）. 本書では概念として独立に書く.

---

## Session（アプリログインの opaque token）

サーバ側のみ. `POST /api/v1/login` 成功時に発行される opaque token を永続化する.

| フィールド | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `token` | string | PK, 64 文字 16 進文字列 | `crypto.randomBytes(32).toString("hex")` で生成. Bearer の照合キー |
| `expiresAt` | number (Unix epoch ms) | 必須 | 発行時刻 + 30 日. `expires_at > now` の strict > で期限判定 |
| `createdAt` | number (Unix epoch ms) | 必須 | 発行時刻 |

- 単一インスタンス / 単一ユーザ運用のため, JWT は採用せず DB 行による即時 revoke 可能な opaque token を使う ([plan D-5](../../features/app-login/plan.md)).
- ローカルモード (Android) は認証を経由しないため Session テーブルを使わない.

---

## AppPassword（現在のログインパスワード）

サーバ側のみ。現在有効な bcrypt ハッシュを単一レコードで保持する。

| フィールド | 型 | 制約 | 説明 |
| --- | --- | --- | --- |
| `id` | string | PK, 固定値 `"current"` | 単一レコード識別子 |
| `passwordHash` | string | 必須 | ログインとパスワード変更時に照合する bcrypt ハッシュ |
| `updatedAt` | number (Unix epoch ms) | 必須 | ハッシュを保存した時刻 |

- DB が空の初回アクセス時に、ブラウザから登録されたパスワードのハッシュを保存する。
- 起動後は DB を真の source とし、SettingsView から変更できる。
- ローカルモードは認証を経由しないため AppPassword テーブルを使わない。

---

## サーバ側とローカルモード側の差分

| 項目 | サーバ側 | Android ローカルモード |
| --- | --- | --- |
| 上記 6 エンティティ | 共通 | 共通 |
| ユーザー ID / テナント ID | **持たない**（単一ユーザー前提） | **持たない**（同上） |
| Clock の実装 | サーバ時刻を返す実装 | 端末時刻を返す実装 |
| リセット処理の起動経路 | API リクエスト時 lazy 起動 / 定期実行 | アプリ起動時 / フォアグラウンド境界到達時 |
| 同期メタデータ（`version` / `updatedAt`） | **保持する**（クライアント書込キューの楽観ロックに使う） | **保持する**（将来移行の選択肢を閉じないため. ローカル単独では衝突は起きない） |

「サーバモードの Android がローカルモードのデータを持ち込む」「ローカルモードの Android のデータをサーバへ移送する」というユースケースは, **保証範囲外**（[ADR-0009](../../adr/0009-android-client-tech-stack.md): モード切替 = 初期化, 同期しない）. NFR-021 はモード内（サーバならどの端末のブラウザからでも / ローカルなら端末そのものを携行）で達成し, モード間移送には踏み込まない. 後に必要になれば追加の同期メタデータ（`etag` 等）を導入する.

---

## 物理スキーマ

物理スキーマ（具体的な型・インデックス・DDL）は [`overview.md`](overview.md) を参照する.

## 確定事項（旧未決事項）

- **プロジェクトをゴミ箱に入れる際の配下 Task の扱い**: **UI でユーザーに確認する**. データモデル上の自動カスケードは行わない. ユーザーの選択（配下 Task も一緒にゴミ箱化 / Task の `projectId` を `null` にして独立化）に応じて, アプリケーション層が明示的に両エンティティを操作する. API 設計の詳細は feature spec（プロジェクト削除）で確定する.
- **モード間データ移送**: **サポートしない**. NFR-021「データの場所やアクセスする端末を制限しない」は「サーバ1台にブラウザ経由でどの端末からでもアクセス可能」「Android ローカルモードの環境（端末）自体を持っていけばどこでも使える」で達成する. サーバモードとローカルモードの間でデータを相互移送することは保証範囲外. 後に必要になれば feature として仕様化し, 同期メタデータをスキーマに追加する.
