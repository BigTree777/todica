# タスク: CI で domain をビルドしてから typecheck / vitest / playwright を実行する

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [x] `.github/workflows/ci.yml` の typecheck job に `build domain` step
      (`npm run build -w domain`) を `install dependencies` の直後に追加する.
- [x] 同 vitest job に同じ step を `install dependencies` の直後に追加する.
- [x] 同 playwright job に同じ step を `install dependencies` の直後
      (`cache playwright browsers` より前) に追加する.
- [x] lint job に build step が追加されていないこと, 4 job の job 名が不変であることを確認する.

## 検証

> 振る舞いテスト (vitest) は作成しない (plan.md「テスト方針」参照).

- [ ] PR を作成し, 実 CI run で typecheck / lint / vitest / playwright の 4 job が
      success になることを確認する. run URL をここに記録する: <URL>
- [ ] domain 起因のエラー (TS6305 / `Cannot find package '@todica/domain/*'`) が
      CI ログに出ていないことを確認する.
- [ ] (playwright job が build 追加後も失敗した場合) 原因を切り分け, domain 非起因のものは
      backlog に別項目として記録する.

## ドキュメント

- [ ] 追加のドキュメント更新は不要 (CI ゲートの構成仕様は ci-automated-gate 側が正典であり,
      job 構成・トリガ・job 名に変更が無いため).

## 仕上げ

- [ ] 受け入れ基準（spec.md）を全て満たすことを確認
- [ ] auditor による実在確認 (workflow 定義が仕様どおりであること) とレビュー依頼
