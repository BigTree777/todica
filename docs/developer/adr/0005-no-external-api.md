## ADR-0005: 外部 API を持たない（api/ フォルダの扱い）

> 本 ADR は「Todica はクライアント単体で完結し HTTP API を一切持たない」という前提で書かれていたが, 構成前提が「Web=自前サーバ接続必須 / Android=ローカル or サーバ選択可」に修正されたため Superseded とする. API の方針は [ADR-0010](0010-api-design.md) で改めて扱う（「共有 SaaS としての外部公開 API は持たないが, 自分自身のサーバとクライアントの間の内部 API は持つ」という整理に変わる）.

- 状態: 廃止（→ [ADR-0010](0010-api-design.md)）
- 日付: 2026-06-05（廃止: 2026-06-05）
- 決定者: プロジェクトオーナー（個人開発）

## 背景 / 状況

- Todica は PM ツールとの自動連携を持たない（FR-070）.
- 単一ユーザー・ローカル前提（NFR-021, NFR-002）であり, 共有 SaaS としてのホスティングも行わない（OOS-012）.
- 端末間同期・サーバ通信のいずれも要件にない. クライアントの中だけで処理が閉じる.
- 既存の `docs/developer/architecture/api/overview.md` および `docs/developer/architecture/api/openapi.yaml` はテンプレ流用の雛形で, 「REST API を持つ前提」の文面が残っている.

## 検討した選択肢

| 選択肢 | 利点 | 欠点 |
| --- | --- | --- |
| A: `api/` フォルダを残しつつ, overview に「Todica は外部 API を持たない」と明示する. `openapi.yaml` は削除する. | フォルダ自体は将来の拡張余地として残せる. テンプレ由来のミスリーディングな雛形を排除できる. | 何もない `api/` が残ることに違和感を覚える人はいるかもしれない. |
| B: `api/` フォルダごと削除する | リポジトリのノイズが減る. | 将来「外部公開 API を持つかもしれない」局面で再度フォルダを切り直す手間が出る. index.md からのリンクも修正が要る. |

## 決定

A を採用する.

- `api/overview.md` を「Todica は外部 API を持たない」と明示する内容に書き換える.
- `api/openapi.yaml` は削除する（雛形のまま残しても意味がなく, ミスリードのもとになるため）.
- `index.md` の API カテゴリは, 現状の「openapi.yaml も指す」表記から「`api/overview.md` のみ」に整理する（リンク先存在の不整合を避けるため. index 自体の更新は本 ADR の付随作業として実施）.

## 結果 / 影響

- 良い影響
  - 「外部 API を持たない」という設計判断がドキュメント上でも一義的になる.
  - 雛形の REST 前提 / OpenAPI 前提が他のドキュメント（architecture, feature spec）に引用される事故を防げる.
- トレードオフ / 注意点
  - 将来, 外部公開 API を持つ局面が来た場合は本 ADR を Supersede する新規 ADR で扱う.
- 関連: [`../architecture/api/overview.md`](../architecture/api/overview.md), [`../architecture/overview.md`](../architecture/overview.md), FR-070, NFR-002, NFR-021, OOS-012

## 廃止理由（2026-06-05 追記）

本 ADR の前提だった「Todica は単一ユーザー・ローカルアプリでサーバ通信を行わない」は誤りであった. 修正後の前提では次のとおりとなる.

- Web クライアントは自前サーバに接続し, サーバ上の API を介してデータを読み書きする.
- Android クライアントは「ローカルモード」では API を使わないが, 「サーバモード」では Web と同じ自前サーバ API に接続する.

したがって「外部 API を持たない」という結論は不成立で, 次のように整理し直す.

- **共有 SaaS としての外部公開 API は持たない**（project.md §8 Out of Scope "共有 SaaS としてのホスティング提供" は引き続き遵守）.
- **本人運用の自前サーバとクライアントの間の API は持つ**. これは「外部 API」ではなく「Todica の本体構成の一部としての内部 API」である.

詳細は [ADR-0010](0010-api-design.md), `architecture/api/overview.md` を参照.
