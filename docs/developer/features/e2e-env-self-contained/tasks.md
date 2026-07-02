# タスク: e2e-env-self-contained

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [ ] `playwright.config.ts` の webServer（port 5173, `npm run dev -w web`）に
      `env: { VITE_API_BASE_URL: "http://localhost:3000" }` を追加する
- [ ] `playwright.config.ts` の webServer（port 4173, `npm run build -w web && npm run preview -w web`）に
      `env: { VITE_API_BASE_URL: "http://localhost:3000" }` を追加する

## 検証

- [ ] ローカルで root `.env` を一時退避し、playwright フルスイートが全 pass することを確認する
- [ ] `.env` を戻し、playwright フルスイートが全 pass することを確認する（非影響確認）
- [ ] `npm run lint`（warning 0）と `npm run typecheck`（pass）を確認する
- [ ] PR の実 CI run で 4 job（typecheck / lint / vitest / playwright）すべて green を確認する
      （playwright job が timeout cancel されず完走すること）

## ドキュメント

- [ ] `docs/developer/planning/backlog.md` の BL-145 を Done に更新する（PR マージ時）

## 仕上げ

- [ ] 受け入れ基準（spec.md）を全て満たすことを確認
- [ ] auditor による変更の実在確認（振る舞いテストを生まない成果物のため）
