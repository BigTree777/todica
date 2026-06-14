# タスク: サーバ CORS の origin 許可リスト化 (cors-origin-allowlist)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [ ] `server/src/main.ts` に `ALLOWED_ORIGINS` のパース関数を追加する
  (カンマ区切り → trim → 空要素除去。未定義/空は既定値 `["http://localhost:5173", "capacitor://localhost"]`)。
- [ ] `server/src/app.ts` の `AppDeps` に `allowedOrigins: readonly string[]` を追加し、
  `cors({ origin: ..., ... })` を関数 callback に置き換える (空文字 / 完全一致以外は `null`)。
- [ ] `cors()` の `allowHeaders` / `exposeHeaders` / `maxAge` は現状値を維持する。
- [ ] `server/__tests__/helpers/build-test-app.ts` の `buildTestApp` に `allowedOrigins` option を追加する
  (既定は spec の既定値 2 件)。

## テスト

- [ ] 新規結合テスト `server/__tests__/integration/cors.test.ts` を追加し、spec の受け入れ基準 7 件を 1:1 で網羅する。
- [ ] `ALLOWED_ORIGINS` パース関数の単体テスト (`,` 区切り / 前後空白 / 空要素 / 未定義 / 空文字) を追加する。
- [ ] 既存 `server/__tests__/integration/*.test.ts` 群が全て green であることを確認する
  (`npx vitest run` をリポジトリルートから実行)。

## ドキュメント

- [ ] `.env.example` に `ALLOWED_ORIGINS` のセクションを追加する
  (既定値、カンマ区切り、同一ドメイン配信なら設定不要、別ドメイン配信なら必須、を明示)。
- [ ] `docs/developer/setup/server.md` の env 表に `ALLOWED_ORIGINS` 行を追加し、dev で設定不要であることを記す。
- [ ] `docs/user/deploy-guide.md` の 3 章 (環境変数表) に `ALLOWED_ORIGINS` 行を追加し、
  本番で別ドメインに Web を置く場合の設定例を記す。

## 仕上げ

- [ ] 受け入れ基準 (spec.md) を全て満たすことを確認する。
- [ ] `auditor` にレビューを依頼する。
