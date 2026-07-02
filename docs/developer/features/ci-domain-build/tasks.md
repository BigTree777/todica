# タスク: CI で domain をビルドしてから typecheck / vitest / playwright を実行する

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [x] `.github/workflows/ci.yml` の typecheck job に `build domain` step
      (`npm run build -w domain`) を `install dependencies` の直後に追加する.
- [x] 同 vitest job に同じ step を `install dependencies` の直後に追加する.
- [x] 同 playwright job に同じ step を `install dependencies` の直後
      (`cache playwright browsers` より前) に追加する.
- [x] lint job に build step が追加されていないこと, 4 job の job 名が不変であることを確認する.
- [x] playwright job の `timeout-minutes` を 30 にする (plan.md「重要な決定」参照).

## 検証

> 振る舞いテスト (vitest) は作成しない (plan.md「テスト方針」参照).
> Done 判定は spec.md「受け入れ基準」のとおり: typecheck / vitest / lint green +
> playwright job のテスト実行到達. playwright job の green 化は BL-145 で扱う.

- [ ] PR の実 CI run で typecheck / vitest / lint の 3 job が success になることを確認する.
      run URL をここに記録する: https://github.com/BigTree777/todica/actions/runs/28565796297
- [ ] 同 run の playwright job が起動失敗を脱してテスト実行に到達していること
      (spec 単位の pass / fail が報告されていること) を確認する.
- [ ] domain 起因のエラー (TS6305 / `Cannot find package '@todica/domain/*'`) が
      4 job いずれの CI ログにも出ていないことを確認する.
- [ ] playwright job の残失敗 (e2e の `.env` 暗黙依存) が backlog に BL-145
      (feature: e2e-env-self-contained 想定) として記録されていることを確認する.

## ドキュメント

- [ ] 追加のドキュメント更新は不要 (CI ゲートの構成仕様は ci-automated-gate 側が正典であり,
      job 分割・トリガ・job 名に変更が無いため. playwright job の timeout 判断は
      本 feature の plan.md に記録済み).

## 仕上げ

- [ ] 受け入れ基準（spec.md）を全て満たすことを確認
- [ ] auditor による実在確認 (workflow 定義が仕様どおりであること) とレビュー依頼
