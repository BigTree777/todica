# API 概要

> Todica のサーバとクライアントの間の API の方針. 決定根拠: [ADR-0010](../../adr/0010-api-design.md).
> 全体構成は [`../overview.md`](../overview.md), 詳細スキーマは [`openapi.yaml`](openapi.yaml).
>
> 本書は技術非依存（tech-agnostic）の API 方針を記述する. 具体的なプロトコル・シリアライズ形式・トランスポートの選定は [`implementation.md`](implementation.md) を参照.

## 1. 方針

- Todica は **本人運用サーバとそのクライアント（Web / Android サーバモード）の間で API 通信を行う**（[ADR-0006](../../adr/0006-distribution-topology.md)）.
- ただし **共有 SaaS としての外部公開 API は提供しない**（project.md §8 Out of Scope "共有 SaaS としてのホスティング提供" を遵守）. 本 API は Todica の本体構成の一部としての内部 API である.
- マルチテナント化はしない. 認証は単一ユーザー前提の最小実装（CORE-2 と整合）.

## 2. 通信契約

- **要求 / 応答**: クライアントが要求を送り, サーバが応答を返す同期型の対話を基本とする. 具体的なプロトコル・シリアライズ形式は [`implementation.md`](implementation.md) を参照.
- **トランスポート**: 暗号化された通信路を必須とする.
- **エンコーディング**: 文字列は UTF-8. 日時は ISO 8601 文字列（タイムゾーン込み）.
- **エラー表現**: 通信規約上の「成功 / 失敗の区分」と, 構造化された詳細情報を返す. 詳細フォーマットは feature spec / openapi.yaml で確定.

## 3. 認証

- **方式**: 単一認証トークン（[ADR-0010](../../adr/0010-api-design.md) 推奨案）.
- クライアントは要求ごとに認証トークンを付して送信する.
- トークンの発行・保管・ローテーションは運用手順として別途整備する（feature / 運用ドキュメントの責務）.
- マルチテナント化しないため, 「ユーザー識別」は行わず, トークンの有無のみで認可する.
- 「自宅 LAN / VPN 越しでしか使わない」と本人が決めた場合は認証なしの構成も許容する（[ADR-0010](../../adr/0010-api-design.md) Au3 代替案）.

## 4. バージョニング

- **方式**: パスバージョン（`/api/v1/...`）.
- 破壊的変更時は新バージョン（`/api/v2/...`）を並行運用する. 旧バージョンの維持期間は短くて構わない（個人運用のため）.
- 非破壊的なフィールド追加は同一バージョンで行う.

## 5. リソース概観

詳細パス・パラメータ・レスポンススキーマは feature spec と [`openapi.yaml`](openapi.yaml) で確定する. 本書ではリソースと操作の輪郭のみ示す.

| リソース | 主な操作 | 由来 FR |
| --- | --- | --- |
| `/api/v1/tasks` | 一覧取得 / 起票 / 編集 / 完了（POST `:id/complete`） / 削除（DELETE `:id`. ゴミ箱に移す） / 復元（POST `:id/restore`） | FR-001 〜 FR-009, FR-014, FR-061 |
| `/api/v1/today` | 今日ビュー（タスク一覧 + 並び順 + フォーカス参照）取得 | FR-010 〜 FR-013 |
| `/api/v1/focus` | 現在のタスク参照（取得 / 更新） | FR-012, FR-013 |
| `/api/v1/projects` | 一覧 / 作成 / 編集 / 削除 / 復元 | FR-020, FR-022, FR-060, FR-061 |
| `/api/v1/routines` | 一覧 / 作成 / 編集 / 削除 / 復元 | FR-030, FR-031, FR-035 |
| `/api/v1/trash` | 一覧 / 手動空にする | FR-061, FR-062 |
| `/api/v1/counter` | 今日の完了数取得 | FR-040 |
| `/api/v1/settings` | 境界時刻設定の取得 / 更新 | FR-042 |
| `/api/v1/reset` | リセット処理の手動起動（保守用. 通常は境界時刻で自動起動）| FR-043, NFR-020 |

すべての応答は **単一ユーザー前提のスキーマ**. ユーザー ID / テナント ID 等のフィールドは持たない.

## 6. 応答の意味区分（規約）

| 区分 | 用途 |
| --- | --- |
| 取得成功 | 既存のリソースを取り出した |
| 作成成功 | 新規のリソースを作った |
| 更新成功（本文なし） | 削除 / 完了 等で本文返却がない |
| 入力エラー | バリデーション違反 |
| 認証エラー | 認証トークン未提示 / 無効 |
| 未存在 | 指定リソースが存在しない |
| 競合 | 楽観的更新 / リセット冪等性で衝突した |
| サーバ内部エラー | サーバ側不明エラー |

具体的な通信規約上のコード（例えば HTTP ステータスコード）への対応付けは [`implementation.md`](implementation.md) と [`openapi.yaml`](openapi.yaml) で扱う.

## 7. OpenAPI 定義

- [`openapi.yaml`](openapi.yaml) に骨格を置く. リソース・認証スキームのみを初期版として記載し, 個別エンドポイントの request / response スキーマは feature spec の進行に合わせて追記する.
- 「OpenAPI 定義に書かれていない API は存在しない」を原則とする（仕様外実装の混入を防ぐ）.
- OpenAPI を仕様表現として採用した決定および実装上の扱いは [`implementation.md`](implementation.md) を参照.

## 8. 関連

- 決定根拠 ADR: [`../../adr/0010-api-design.md`](../../adr/0010-api-design.md)
- 構成決定 ADR: [`../../adr/0006-distribution-topology.md`](../../adr/0006-distribution-topology.md)
- 旧 ADR（廃止）: [`../../adr/0005-no-external-api.md`](../../adr/0005-no-external-api.md)
- 実装詳細: [`implementation.md`](implementation.md)
- アーキテクチャ全体像: [`../overview.md`](../overview.md)
- モジュール境界: [`../module-boundaries.md`](../module-boundaries.md)
- 由来要件: FR-001 〜 FR-070, NFR-020, NFR-021, NFR-031, NFR-032, OOS-012
