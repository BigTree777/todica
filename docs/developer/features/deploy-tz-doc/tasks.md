# タスク: デプロイ時の TZ 明示をドキュメント化

> [`plan.md`](plan.md) を実行可能な単位に分解する.

## 実装

- [x] `.env.example` に `TZ=Asia/Tokyo` を 4 行コメント付きで追記.
- [x] `docs/user/deploy-guide.md` の env 表 (第 3 章) に `TZ` 行を追加.
- [x] `docs/user/deploy-guide.md` の systemd unit 例 (第 4 章) に `Environment=TZ=Asia/Tokyo` を追加.
- [x] `docs/user/deploy-guide.md` のトラブルシュート表 (第 11 章) にリセット未発火の症状・原因・対処を追加.
- [x] `docs/developer/setup/server.md` の env 表 (第 2 章) に `TZ` 行を追加.

## テスト

- [x] `__tests__/docs/deploy-tz-doc.test.ts` を新設し FR-1〜FR-5 を grep 検証.
- [x] `npx vitest run __tests__/docs/deploy-tz-doc.test.ts` で green (5 件).
- [x] `npx vitest run __tests__/docs/` で既存 doc test も green を維持 (22 件).

## ドキュメント

- [x] backlog.md に BL-103 行を追加.
- [x] このタスクファイルのチェックボックスを完了状態に更新.

## 仕上げ

- [x] 受け入れ基準 (spec.md) を全て満たすことを確認.
- [ ] PR 作成・マージ.
