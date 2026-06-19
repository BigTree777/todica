# API

> Todica のサーバとクライアントの間の API の方針と実装. 決定根拠: [ADR-0010](../../adr/0010-api-design.md).
> 全体構成は [`../overview.md`](../overview.md), 詳細スキーマは [`openapi.yaml`](openapi.yaml).
>
> 本書は **抽象方針 (§1〜§6) と具体実装 (§7〜§10) を 1 ファイルにまとめる** (§11 は関連リンク). 抽象側の合意 (リソース・認証・バージョニング・応答区分) を先に示し, 後段で HTTP / OpenAPI / ヘッダ等の具体に落とす.

## 1. 方針

- Todica は **本人運用サーバとそのクライアント（Web / Android サーバモード）の間で API 通信を行う**（[ADR-0006](../../adr/0006-distribution-topology.md)）.
- ただし **共有 SaaS としての外部公開 API は提供しない**（project.md §8 Out of Scope "共有 SaaS としてのホスティング提供" を遵守）. 本 API は Todica の本体構成の一部としての内部 API である.
- マルチテナント化はしない. 認証は単一ユーザー前提の最小実装（CORE-2 と整合）.

## 2. 通信契約

- **要求 / 応答**: クライアントが要求を送り, サーバが応答を返す同期型の対話を基本とする.
- **トランスポート**: 暗号化された通信路を必須とする.
- **エンコーディング**: 文字列は UTF-8. 日時は ISO 8601 文字列（タイムゾーン込み）.
- **エラー表現**: 通信規約上の「成功 / 失敗の区分」と, 構造化された詳細情報を返す. 詳細フォーマットは feature spec / openapi.yaml で確定.

## 3. 認証

- **方式**: パスワード認証で取得した opaque token を Bearer ヘッダで送る（[ADR-0010](../../adr/0010-api-design.md) Au1 系の本実装）.
- パスワード本体は bcrypt ハッシュとしてサーバ DB の `app_password` テーブルに 1 行だけ持つ. クライアントはパスワード平文を送信し, サーバが bcrypt で照合する.
- 認証成功でサーバが 32 byte 乱数の opaque token を発行し, `sessions` テーブルに `(token, expires_at)` で永続化する. クライアントは token を保存し, 以降の要求のヘッダ（`Authorization: Bearer <token>`）に付して送信する.
- token の有効期限は約 30 日. 期限切れの token は 401 で弾かれ, クライアントは再ログインする.
- 初期パスワードは **ブラウザの InitialSetupView から設定する**（サーバ起動時の env 経由 seed は行わない）. 詳細は `docs/developer/features/initial-password-setup/spec.md` 参照.
- パスワード変更は SettingsView 経由（現在 PW + 新 PW + 確認 PW）. 成功時にサーバは全 `sessions` を一括 DELETE して全端末を強制ログアウトさせる.
- マルチテナント化しないため,「ユーザー識別」は行わず, token の有効性のみで認可する.
- 「自宅 LAN / VPN 越しでしか使わない」と本人が決めた場合は認証なしの構成も許容する（[ADR-0010](../../adr/0010-api-design.md) Au3 代替案）.

## 4. バージョニング

- **方式**: パスバージョン（`/api/v1/...`）.
- 破壊的変更時は新バージョン（`/api/v2/...`）を並行運用する. 旧バージョンの維持期間は短くて構わない（個人運用のため）.
- 非破壊的なフィールド追加は同一バージョンで行う.

## 5. リソース概観

詳細パス・パラメータ・レスポンススキーマは feature spec と [`openapi.yaml`](openapi.yaml) で確定する. 本書ではリソースと操作の輪郭のみ示す.

| リソース | 主な操作 | 由来 FR |
| --- | --- | --- |
| `/api/v1/tasks` | 一覧取得 / 起票 / 編集 / 完了（POST `:id/complete`） / 削除（DELETE `:id`. ゴミ箱に移す） | FR-001 〜 FR-009, FR-014 |
| `/api/v1/today` | 今日ビュー（タスク一覧 + 並び順 + フォーカス参照）取得 | FR-010 〜 FR-013 |
| `/api/v1/focus` | 現在のタスク参照（取得 / 更新） | FR-012, FR-013 |
| `/api/v1/projects` | 一覧 / 作成 / 編集 / 削除（DELETE `:id`. ゴミ箱化 = soft delete. 配下 Task は `projectId` を `null` 化するカスケード NULL 固定） | FR-020, FR-022, FR-060, FR-061 |
| `/api/v1/routines` | 一覧 / 作成 / 編集 / 削除（DELETE `:id`. ゴミ箱化 = soft delete. 配下の未ゴミ箱 Task は `routineId` を `null` 化するデタッチ = カスケード NULL 固定） | FR-030, FR-031, FR-035, FR-060 |
| `/api/v1/trash` | 一覧（`{ tasks, projects, routines }`） / 復元（POST `:id/restore`. Task / Project / Routine 共用. サーバが id から判別） / 手動空にする | FR-061, FR-062 |
| `/api/v1/counter` | 今日の完了数取得 | FR-040 |
| `/api/v1/settings` | 境界時刻設定の取得 / 更新 | FR-042 |
| `/api/v1/reset` | リセット処理の手動起動（保守用. 通常は境界時刻で自動起動）| FR-043, NFR-020 |

復元（FR-061）は各リソース個別の `:id/restore` ではなく `POST /api/v1/trash/{id}/restore` に一本化する（サーバが id から Task / Project / Routine を判別する）. OpenAPI 定義と実装ハンドラの path / method 集合一致はドリフト検出テストで担保する.

すべての応答は **単一ユーザー前提のスキーマ**. ユーザー ID / テナント ID 等のフィールドは持たない.

## 6. 応答の意味区分と HTTP ステータスコード

抽象側の応答区分を, 実装では次の HTTP ステータスコードで表現する.

| 抽象上の区分 | HTTP コード |
| --- | --- |
| 取得成功 / 更新成功 | 200 OK |
| 作成成功 | 201 Created |
| 更新成功（本文なし） | 204 No Content |
| 入力エラー | 400 Bad Request |
| 認証エラー | 401 Unauthorized |
| 未存在 | 404 Not Found |
| 競合（楽観ロック不一致） | 412 Precondition Failed |
| サーバ内部エラー | 500 Internal Server Error |

---

## 7. 採用技術

| 項目 | 採用 | 代替案 |
| --- | --- | --- |
| プロトコル | REST + JSON over HTTP | GraphQL / tRPC / 単純 RPC |
| トランスポート | HTTPS（TLS 終端はリバースプロキシで実施. Caddy / Nginx + Let's Encrypt 等） | プライベートネットワーク内の HTTP（Au3 代替案採用時のみ） |
| シリアライズ | UTF-8 JSON | （別案は採らない） |
| 認証 | 単一 Bearer トークン（`Authorization: Bearer <token>`） | 単純パスワード認証 + セッション / 認証なし（プライベート公開のみ） |
| バージョニング | URL パスバージョン（`/api/v1/...`） | バージョン無し |
| 仕様表現 | OpenAPI 3.x（[`openapi.yaml`](openapi.yaml)） | （別形式は採らない） |
| エラー表現 | HTTP ステータスコード + JSON ボディ（例: `{ "code": "INVALID_DUE_DATE", "message": "..." }`） | （詳細フォーマットは feature spec / openapi.yaml で確定） |
| 日時表現 | ISO 8601 文字列（タイムゾーン込み） | （別案は採らない） |
| サーバ側 OpenAPI 整合 | 手書き `openapi.yaml`（spec-first）+ 実装との集合一致を CI のドリフト検出テストで担保 | zod-openapi / hono-openapi での生成（採用しない） |
| クライアント側 API 型 | `@todica/domain` の共有型 + repository 層の手書き型 | `openapi-typescript` での生成（採用しない） |

## 8. 実装上の注意点

- **OpenAPI を正本にする**: 実装と OpenAPI のどちらが正かを迷わないために, **OpenAPI 定義に書かれていない API は存在しない** を運用原則とする. feature spec の進行に合わせて [`openapi.yaml`](openapi.yaml) を逐次追記する.
- **DTO 型共有**: **OpenAPI が正本**（spec-first の手書き [`openapi.yaml`](openapi.yaml)）. 実装との整合は CI のドリフト検出テスト群（path/method の集合一致 / `ErrorCode` enum / response schema のフィールド照合）で担保する. spec から型・スキーマを生成する案（`openapi-typescript` / `zod-openapi` 等）は採用しない — path/method の集合一致担保には過剰で, 生成物の管理コストが増えるため. クライアント側の API 型は `@todica/domain` の共有型と repository 層の型で表す.
- **Bearer トークンの取り扱い**: クライアント側はサーバから受け取った opaque token を localStorage / Preferences に保管し, 要求のヘッダ（`Authorization: Bearer <token>`）に付して送信する. サーバ側はミドルウェアで `sessions` テーブルを参照して有効性検証し, アプリケーション層には「認証済みかどうか」のフラグだけを渡す（ユーザー識別はしない）. パスワード平文や bcrypt ハッシュをリポジトリにコミットしない.
- **HTTPS 必須**: 本番環境では TLS 終端を必ず通す. リバースプロキシでの終端を想定する. 「認証なし + プライベートネットワーク」構成（[ADR-0010](../../adr/0010-api-design.md) Au3 代替案）を採る場合のみ HTTP 公開を許容するが, インターネット越し公開は禁止.
- **バージョニング運用**: 破壊的変更時は `/api/v2/...` を新設し, 旧バージョンを一定期間（個人運用なので 1 週間〜1 か月目安）並行運用する（[ADR-0010](../../adr/0010-api-design.md) §「バージョニング・互換性運用」）.
- **マルチテナント禁止**: レスポンススキーマに `userId` / `tenantId` / `ownerId` を持たない. サーバ側のテーブルにも持たない（CORE-2, [`../database/schema.md`](../database/schema.md) 共通方針）.
- **エラー詳細スキーマ**: エラーレスポンスの `code` 値は feature spec ごとに整備する（例: `INVALID_DUE_DATE`, `TASK_NOT_FOUND`, `RESET_ALREADY_EXECUTED`）. クライアント UI は `code` を見て人間向けメッセージに変換する.
- **冪等性 (リセット処理)**: リセット処理エンドポイント（`/api/v1/reset`）は冪等であること（NFR-020）. 既に同じ境界時刻でリセット済みなら **no-op の 200 OK を返し, レスポンスボディに「適用済み境界時刻」を含める**（クライアントが「再実行されたか」を判別できるようにする）.
- **書き込み API の Idempotency-Key**: 全書き込み（POST / PATCH / PUT / DELETE）は `Idempotency-Key` ヘッダ必須（[ADR-0010](../../adr/0010-api-design.md)）. 同じキーで処理済みなら新規実行せず保存済み応答を返す.
- **楽観ロック**: 更新系 API は `If-Match: <version>` 必須. 不一致なら 412 Precondition Failed + 現行エンティティを返す（[ADR-0010](../../adr/0010-api-design.md)）.

## 9. OpenAPI スキーマファイル

- 位置: [`openapi.yaml`](openapi.yaml)
- 共通プロトコル要素（`Idempotency-Key`, `If-Match`, 412 / 401 / 400 / 404 など）はアーキテクチャ段階で確定済み.
- 個別エンドポイントの request / response スキーマは feature spec の進行に合わせて追記する.

## 10. 採用理由 / 参照 ADR

- プロトコル / 認証 / バージョニング / OpenAPI 採用: [ADR-0010](../../adr/0010-api-design.md)
  - REST + JSON: エコシステムと事例量が最も厚く, Android がネイティブ実装に変更されても接続互換性を保てる（ADR-0010 §決定 Pr1）.
  - Bearer トークン: 単一ユーザーで最小実装. ローテーションが単純（ADR-0010 §決定 Au1）.
  - パスバージョン: クライアント / サーバの同時更新ができない場合に備える（ADR-0010 §決定 V1）.
  - OpenAPI を仕様の正本にする方針（ADR-0010 §「OpenAPI 定義の扱い」）.
- 配布構成（内部 API として位置付ける）: [ADR-0006](../../adr/0006-distribution-topology.md).

## 11. 関連

- 決定根拠 ADR: [`../../adr/0010-api-design.md`](../../adr/0010-api-design.md)
- 構成決定 ADR: [`../../adr/0006-distribution-topology.md`](../../adr/0006-distribution-topology.md)
- 旧 ADR（廃止. 経緯参考）: [`../../adr/0005-no-external-api.md`](../../adr/0005-no-external-api.md)
- アーキテクチャ全体像: [`../overview.md`](../overview.md)
- モジュール境界: [`../module-boundaries.md`](../module-boundaries.md)
- OpenAPI 定義: [`openapi.yaml`](openapi.yaml)
- サーバ実装: [`../server/overview.md`](../server/overview.md)
- Web クライアント実装: [`../web-client/overview.md`](../web-client/overview.md)
- Android クライアント実装: [`../android-client/overview.md`](../android-client/overview.md)
- 由来要件: FR-001 〜 FR-070, NFR-020, NFR-021, NFR-031, NFR-032, OOS-012
