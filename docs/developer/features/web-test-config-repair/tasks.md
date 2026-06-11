# タスク: web workspace の vitest 実行基盤修復 (web-test-config-repair)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 事前確認

- [ ] `vitest.config.ts` (ルート) が現状の内容で BL-054 完了時点と一致していることを確認する (= 本 BL では触らない出発点を固定)
- [ ] `web/__tests__/setup.ts` の中身が jsdom 前提で書かれていることを確認し, 本 BL 内では変更不要であることを確認する
- [ ] `web/package.json` の `scripts.test` が `"vitest run"` であることを確認する (本 BL では変更しない)

## 実装

- [ ] `web/vitest.config.ts` を新規作成する
  - [ ] `vitest/config` から `defineConfig` を import する
  - [ ] `test.globals: true` を指定する (AC-5)
  - [ ] `test.environment: "jsdom"` を指定する (AC-3)
  - [ ] `test.include: ["**/*.test.ts", "**/*.test.tsx"]` を指定する (AC-6)
  - [ ] `test.setupFiles: ["./__tests__/setup.ts"]` を指定する (AC-4)
  - [ ] ヘッダコメントに「`npm test -w web` 単体実行を成立させるための最小設定」「ルート設定とは独立に動作する」旨を日本語で残す
  - [ ] `coverage` / `environmentMatchGlobs` を**持たせない** (plan D-006, D-003)

## 検証 (実コマンド実行)

- [ ] `npm test -w web` を実行し, exit 0 で全件 green になることを確認する (AC-1)
- [ ] `npm test` (ルート) を実行し, exit 0 で全件 green になることを確認する (AC-2)
- [ ] BL-054 完了時点の単体テスト件数と比較し, 件数が同等以上であることを目視確認する

## 無改修の確認 (差分検査)

- [ ] `vitest.config.ts` (ルート) に差分が無いことを確認する (AC-7)
- [ ] `web/__tests__/setup.ts` に差分が無いことを確認する (AC-8)
- [ ] `web/package.json` に差分が無いことを確認する (AC-9)
- [ ] `web/src/` / `domain/src/` / `server/src/` に差分が無いことを確認する (AC-10)

## lint / typecheck

- [ ] `npm run lint` が exit 0 になることを確認する (BL-048 修復済みの状態維持)
- [ ] `npm run typecheck` が exit 0 になることを確認する (BL-048 修復済みの状態維持)

## ドキュメント

- [ ] `docs/developer/planning/backlog.md` に BL-055 行が追加されていることを確認する (本 BL 起票時点で追加済み)
- [ ] 完了後に backlog.md の BL-055 行を `Done` に更新し, 完了メモ (採用構成・件数・auditor 結果等) を追記する

## 仕上げ

- [ ] 受け入れ基準 (spec.md の AC-1〜AC-10) を全て満たすことを確認する
- [ ] auditor にレビュー依頼
