# アーキテクチャ概要

> システムの「全体像」を 1 ページで掴むためのドキュメント。
> 個別の責務・依存ルールは [`module-boundaries.md`](module-boundaries.md) に分ける。

## システム構成

```
TODO: 構成図（コンポーネント / 外部サービス / データフロー）
例)
[Client] --> [API] --> [Service] --> [DB]
                 |
                 +--> [External API]
```

## 技術スタック

| レイヤ | 技術 | 備考 |
| --- | --- | --- |
| フロントエンド | TODO: | |
| バックエンド | TODO: | |
| データストア | TODO: | |
| インフラ | TODO: | |

## 主要な設計判断

重要な決定は ADR として記録する → [`../adr/`](../adr/_template.md)

- TODO: <代表的な設計方針の要約と ADR へのリンク>

## 関連ドキュメント

- データベース: [`../database/overview.md`](../database/overview.md)
- API: [`../api/overview.md`](../api/overview.md)
