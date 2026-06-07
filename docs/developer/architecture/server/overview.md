# サーバ実装

> 抽象アーキテクチャ上の「サーバ」コンポーネントを, どの言語・フレームワーク・運用形態で実装するかを示す.
> 抽象側の責務（API レイヤ / アプリケーション層 / ドメイン層 / データアクセス層 / 永続化アダプタ）は重複して書かない. 抽象側を参照すること.

## 1. 対応する抽象概念

- 抽象アーキテクチャ概要: [`../overview.md`](../overview.md) §2「構成方針」, §5.1「サーバの層構成」.
- モジュール境界: [`../module-boundaries.md`](../module-boundaries.md) §2「サーバ側の層と責務」, §4.1「サーバのモジュール一覧」.
- 永続化機構: [`../database/implementation.md`](../database/implementation.md).
- API 通信契約: [`../api/implementation.md`](../api/implementation.md).

## 2. 採用技術

| レイヤ | 採用 | 代替案（採用していない選択肢） |
| --- | --- | --- |
| 言語 | TypeScript（Node.js ランタイム） | Go / Python (FastAPI) / Rust (Axum) |
| Web フレームワーク | Hono（[ADR-0007](../../adr/0007-server-tech-stack.md) で確定） | Fastify / Express |
| 永続化機構 | SQLite（WAL モード, サーバプロセス内蔵） — 詳細は [`../database/implementation.md`](../database/implementation.md) | PostgreSQL / ファイル KVS |
| ホスティング | 安価な VPS（$5/月程度. 例: ConoHa / Vultr / Hetzner 等） を第一候補, 自宅サーバを予備候補 | 無料枠 PaaS / クラウド BaaS |
| TLS 終端 | リバースプロキシ（Caddy / Nginx + Let's Encrypt 等） | クラウドロードバランサ |
| プロセス監視 | **systemd**（VPS 上で常駐ユニットとして起動・再起動を管理） | pm2 / コンテナオーケストレーション |

## 3. 採用理由 / 参照 ADR

- 言語・フレームワーク・永続化機構・ホスティング: [ADR-0007](../../adr/0007-server-tech-stack.md)
  - 言語: クライアント側と TypeScript を揃え DTO 型を共有できることが個人 1 人開発の生産性に効く（ADR-0007 §決定）.
  - フレームワーク: Hono に確定（ADR-0007 §決定）.
  - 永続化機構: データ規模が小さく, トランザクションでリセット冪等性（NFR-020）を担保しやすく, 別プロセス管理が不要（ADR-0007 §決定 P1）.
  - ホスティング: 月額固定費を抑えつつサーバを完全に握れる（ADR-0007 §決定 H1）.
- API 設計（プロトコル・認証・バージョニング）: [ADR-0010](../../adr/0010-api-design.md). 詳細は [`../api/implementation.md`](../api/implementation.md).
- 配布構成（クライアント・サーバ型の単一インスタンス）: [ADR-0006](../../adr/0006-distribution-topology.md).
- 境界時刻処理の時刻基準: [ADR-0011](../../adr/0011-day-boundary-time-source.md).

## 4. 実装上の注意点

- **マルチテナント禁止**: 認証ミドルウェアでトークンの有無のみを判定する. リクエストオブジェクトに「ユーザー ID」「テナント ID」を載せない. アプリケーション層以降は単一ユーザー前提のコードに保つ（CORE-2, project.md §8 Out of Scope）.
- **トランザクション境界**: 1 ユースケース = 1 トランザクションを基本に, リセット処理 / タスク完了など複数テーブル更新を atomic に行う（NFR-020）. トランザクション境界はアプリケーション層が指定し, 永続化アダプタが具体的に開始・コミットする.
- **シングルプロセス前提**: 永続化機構をサーバプロセス内蔵で動かすため, 水平スケール（複数サーバインスタンス）は想定しない. 個人 1 人運用に最適化する.
- **境界時刻処理（lazy 起動）**: 次回クライアントアクセス時に未実行の境界時刻があれば自動実行する経路と, 定期実行（cron 等）で補強する経路の双方を持つ. 詳細は [ADR-0011](../../adr/0011-day-boundary-time-source.md).
- **認証トークンの取り扱い**: Bearer トークンはリポジトリにコミットしない. 環境変数 / 秘密管理ファイル経由でサーバに渡す. ローテーション手順は別途運用ドキュメントで整備する.
- **OS / セキュリティ更新**: VPS / 自宅サーバいずれでも OS 更新・依存パッケージ更新は本人責任. 自動更新の方針は運用ドキュメントに分離する.
- **バックアップ**: 永続化機構のスナップショット（SQLite ファイルのコピー）を定期取得する. 手順は [`../database/implementation.md`](../database/implementation.md).
- **OpenAPI スキーマとの整合**: API レイヤの公開エンドポイントは [`../api/openapi.yaml`](../api/openapi.yaml) と一致させる. 「OpenAPI に書かれていない API は存在しない」を運用原則とする.

## 5. 関連ドキュメント

- 抽象アーキテクチャ: [`../overview.md`](../overview.md), [`../module-boundaries.md`](../module-boundaries.md)
- 永続化実装: [`../database/implementation.md`](../database/implementation.md)
- API 実装: [`../api/implementation.md`](../api/implementation.md)
- ADR: [`../../adr/0006-distribution-topology.md`](../../adr/0006-distribution-topology.md), [`../../adr/0007-server-tech-stack.md`](../../adr/0007-server-tech-stack.md), [`../../adr/0010-api-design.md`](../../adr/0010-api-design.md), [`../../adr/0011-day-boundary-time-source.md`](../../adr/0011-day-boundary-time-source.md)
