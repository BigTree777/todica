# データベース概要

> Todica のデータ層の方針. エンティティ定義は [`schema.md`](schema.md), 変更運用は [`migration-policy.md`](migration-policy.md) を参照.
> 採用方式の決定根拠は [ADR-0007](../../adr/0007-server-tech-stack.md)（サーバ側）と [ADR-0009](../../adr/0009-android-client-tech-stack.md)（Android ローカルモード）.
>
> 本書は技術非依存（tech-agnostic）のデータ層方針を記述する. 具体的な永続化機構・接続ライブラリ・物理スキーマは [`implementation.md`](implementation.md) を参照.

## 1. 永続化が必要な箇所

Todica はクライアント・サーバ型構成（[ADR-0006](../../adr/0006-distribution-topology.md)）であり, 永続化が必要な箇所は次の 2 つに分かれる.

| 箇所 | 役割 | 採用方式の決定 ADR |
| --- | --- | --- |
| サーバ側永続化 | Web クライアント / Android サーバモード のデータ正本. | [ADR-0007](../../adr/0007-server-tech-stack.md) |
| Android ローカルモード端末内永続化 | サーバを使わない Android 単独利用時のデータ. Web とは独立. | [ADR-0009](../../adr/0009-android-client-tech-stack.md) |

> 具体的な永続化機構と接続方法は [`implementation.md`](implementation.md) を参照.

## 2. 配置と接続

### 2.1 サーバ側

- 配置: 本人運用の自前サーバホスト上に置く.
- 接続方法: サーバプロセスが永続化機構のクライアント経由で開く. 抽象としては「サーバプロセス内蔵」または「外部プロセスに接続」のいずれの形態も許容する.
- データ規模: 個人 1 人ぶん（数 MB 〜 数十 MB 程度を想定）.
- バックアップ: 永続化機構が提供するスナップショット・ファイルコピー等で定期的に保全する. 詳細は実装側で定める.

### 2.2 Android ローカルモード

- 配置: Android 端末内のアプリプライベートストレージ. 他アプリ・他端末から見えない.
- 接続方法: 端末内永続化機構を介してアプリプロセスから直接アクセスする.
- データ規模: 同上（個人 1 人ぶん）.

## 3. スキーマの位置づけ

- サーバ側 / Android ローカルモードのいずれも **同じ論理スキーマ** を共有する. エンティティ定義（タスク・プロジェクト・ルーティン・カウンタ・設定・フォーカス参照）は両者で共通.
- ただし **同期メタデータ** の有無に差がある. 詳細は [`schema.md`](schema.md) を参照.
- 論理スキーマは [`schema.md`](schema.md) に書く. 物理スキーマ（具体的な型定義・インデックス・DDL）は [`implementation.md`](implementation.md) に書く.

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
- **ID**: ドメイン層がエンティティ ID を生成する（永続化側に自動採番を任せない. テスト容易性 / リセット冪等性のため）. 重複しにくい方式（UUID 等）を推奨.
- **ユーザー ID / テナント ID は持たない**（CORE-2 と整合）. サーバ側スキーマも単一ユーザー前提でフィールドを持たない.

## 6. 命名規約

- テーブル名: snake_case 複数形（例: `tasks`, `projects`, `routines`, `counter`, `settings`, `focus_selection`）.
- カラム名: snake_case で統一する. クライアント側コードとの変換は ORM / DTO レイヤで行う.
- 主キー: 各テーブルで `id`（文字列, UUID 想定）. Counter / Settings / FocusSelection のように単一レコードのものは固定 ID（例: `"singleton"`）を用いる.

## 7. バックアップ・エクスポート

- サーバ側: 永続化機構の状態を定期的に保全する. 実装の詳細は [`implementation.md`](implementation.md) と運用ドキュメントで扱う.
- Android ローカルモード: 「ローカルからサーバへの移行」「サーバからローカルへのエクスポート」は feature 仕様化が必要（本書では仕様化しない）. 初期は **未対応** とし, モード切替時は再インストール扱いとする（[ADR-0009](../../adr/0009-android-client-tech-stack.md) 推奨案）.

## 8. 関連ドキュメント

- 論理スキーマ詳細: [`schema.md`](schema.md)
- マイグレーション運用: [`migration-policy.md`](migration-policy.md)
- 永続化実装詳細: [`implementation.md`](implementation.md)
- 配布構成: [`../../adr/0006-distribution-topology.md`](../../adr/0006-distribution-topology.md)
- サーバ側技術スタック: [`../../adr/0007-server-tech-stack.md`](../../adr/0007-server-tech-stack.md)
- Android クライアント技術スタック: [`../../adr/0009-android-client-tech-stack.md`](../../adr/0009-android-client-tech-stack.md)
- 境界時刻処理: [`../../adr/0011-day-boundary-time-source.md`](../../adr/0011-day-boundary-time-source.md)
