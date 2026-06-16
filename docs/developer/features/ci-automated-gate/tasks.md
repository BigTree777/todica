# タスク: GitHub Actions による品質ゲート自動化 (ci-automated-gate)

> [`plan.md`](plan.md) を実行可能な単位に分解する.

## 設計確定 (クローズ済み)

- [x] Node 固定値を `node-version: '24'` に確定.
- [x] `package.json` の `engines` は追加しない.
- [x] Playwright ブラウザのキャッシュキーを `playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}` に確定.
- [x] E2E 失敗時の `playwright-report/` / `test-results/` を `actions/upload-artifact@v4` で失敗時のみ保存.
- [x] PR テンプレート差し替え文言を spec.md「確定事項」に明記.

## テスト

- [x] `__tests__/ci-workflow.test.ts` を追加.
  - [x] `.github/workflows/ci.yml` が存在する.
  - [x] `jobs.typecheck` / `jobs.lint` / `jobs.vitest` / `jobs.playwright` の 4 つが存在する.
  - [x] 各 job のステップに想定コマンド (`npm run typecheck` / `npm run lint` /
        `npx vitest run` / `npx playwright test`) を含む文字列がある.
  - [x] Playwright job が `npx playwright install --with-deps chromium` を含む.
  - [x] `on:` が `pull_request` と `push` (`branches: [main]`) を持つ.
  - [x] `concurrency:` が宣言され `cancel-in-progress: true` を含む.
  - [x] `actions/setup-node@v4` の `node-version` が `'24'` で始まる.
- [x] `__tests__/pr-template.test.ts` を追加.
  - [x] `.github/pull_request_template.md` に「テストがすべて green」を含む行が存在しない.
  - [x] CI ゲートを示すキーワード (typecheck / lint / vitest / playwright) を
        まとめて含む文字列が存在する.
- [x] `__tests__/package-scripts.test.ts` を追加.
  - [x] ルート `package.json` の `scripts.ci` が存在する.
  - [x] `scripts.ci` に typecheck / lint / vitest / playwright のキーワードが順に含まれる.

## 実装

- [x] `.github/workflows/ci.yml` を新規作成 (plan.md 「ワークフロー構造」に沿う).
- [x] `package.json` の `scripts` に `ci` を追加.
  - 値: `"ci": "npm run typecheck && npm run lint && npx vitest run && npx playwright test"`
- [x] `.github/pull_request_template.md` を更新.
  - [x] 「テストがすべて green」の手動チェック行を削除.
  - [x] CI ゲート前提の文言を「マージ前チェック」セクション冒頭に追加.

## 検証

- [x] ローカルで `npx vitest run __tests__/` が 3 つの新規 unit test を pass することを確認.
- [x] ローカルで `npx vitest run` 全件 1757 passed (リグレッション無し) を確認.
- [ ] feature ブランチを push し, GitHub Actions 上で 4 job が起動・全部 green になることを観測する.
- [ ] わざと lint 違反を含む追加 commit を 1 本立て, `lint` job だけが failure になり
      他 3 job は実行されることを観測する. (確認後 revert.)
- [ ] 同 PR 内で連続 push し, 古いワークフロー実行が cancelled になることを観測する.

## ドキュメント

- [x] spec.md「確定事項」に未決事項の最終決定を反映.

## 仕上げ

- [x] 受け入れ基準 (spec.md) のシナリオ 7 件すべてを満たすことを確認.
- [x] `auditor` にレビューを依頼し Pass.
- [ ] (リポジトリ管理者作業) GitHub の Branch protection rules で
      `typecheck` / `lint` / `vitest` / `playwright` を Required status checks に設定する.
      この作業はコード変更ではないので, 完了後にチェックする.
