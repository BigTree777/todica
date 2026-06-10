# タスク: lint / typecheck 修復

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## lint 修復

- [ ] `biome.json` の `files.ignore` に `"android/app/src/main/assets/public"` を追加する
- [ ] `biome check --write .` を実行して format / organizeImports 違反を一括機械修正する
- [ ] `domain/src/routine/index.ts` の正規表現（`/[\x00-\x1F\x7F\x80-\x9F]/`）を Unicode エスケープ記法に書き換えて `noControlCharactersInRegex` 違反を解消する
- [ ] `npm run lint` が exit 0 になることを確認する

## typecheck 修復

- [ ] `domain/tsconfig.json` の `include` から `"__tests__/**/*.ts"` を削除する
- [ ] `domain/tsconfig.test.json` を新規作成する（`composite: false`・`rootDir: "."`・`__tests__/` と `src/` を include）
- [ ] `npm run typecheck` が exit 0 になることを確認する

## 既存テストの確認

- [ ] `npm test` を実行し、すべての vitest テストが pass することを確認する

## 仕上げ

- [ ] 受け入れ基準（spec.md）を全て満たすことを確認する
- [ ] レビュー依頼
