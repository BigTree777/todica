# 開発者ドキュメント

> Todica の開発に参加する人向けのドキュメント全体マップ.

## 読む順序

1. [`project.md`](project.md) — プロジェクトの目的・スコープ・用語
2. [`requirements.md`](requirements.md) — 機能要件・非機能要件
3. [`setup.md`](setup.md) — 開発環境の構築
4. [`architecture/overview.md`](architecture/overview.md) — クライアント・サーバ型の全体構成
5. 担当領域の詳細（下記）へ

## カテゴリ

| 領域 | ドキュメント |
| --- | --- |
| プロダクト計画 | [`planning/roadmap.md`](planning/roadmap.md), [`planning/backlog.md`](planning/backlog.md) |
| アーキテクチャ（抽象） | [`architecture/overview.md`](architecture/overview.md), [`architecture/module-boundaries.md`](architecture/module-boundaries.md), [`architecture/domain-model.md`](architecture/domain-model.md) |
| アーキテクチャ（実装） | [`architecture/server/overview.md`](architecture/server/overview.md), [`architecture/web-client/overview.md`](architecture/web-client/overview.md), [`architecture/android-client/overview.md`](architecture/android-client/overview.md), [`architecture/api/overview.md`](architecture/api/overview.md), [`architecture/database/overview.md`](architecture/database/overview.md) |
| データベース | [`architecture/database/overview.md`](architecture/database/overview.md), [`architecture/database/schema.md`](architecture/database/schema.md), [`architecture/database/migration-policy.md`](architecture/database/migration-policy.md) |
| API | [`architecture/api/overview.md`](architecture/api/overview.md), [`architecture/api/openapi.yaml`](architecture/api/openapi.yaml) |
| Git ワークフロー | [`git-workflow.md`](git-workflow.md) |
| 品質 | [`quality/test-strategy.md`](quality/test-strategy.md), [`quality/acceptance-criteria.md`](quality/acceptance-criteria.md) |
| 意思決定記録 | [`adr/`](adr/_template.md) |
| 機能ごと | [`features/`](features/_template/spec.md) |
