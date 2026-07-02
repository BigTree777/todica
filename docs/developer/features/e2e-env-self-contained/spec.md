# 仕様: e2e-env-self-contained（e2e の `.env` 暗黙依存の解消）

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-145
- 前提資料: [`../ci-domain-build/spec.md`](../ci-domain-build/spec.md) の「切り分け済み」節（BL-144 からの切り出し経緯と実測データ）

## 背景 / 課題

CI の playwright job で、UI 経由のデータ操作を伴う spec が大量に失敗する
（timeout 30 分の run で cancel までに 46 spec の失敗を観測。CI での完走実績なし。
15 分 run 2 本で失敗一覧が file / title / 失敗モードとも一致しており、失敗は決定的）。

原因は e2e 構成の `.env` 暗黙依存である:

- web アプリは `web/src/bootstrap.ts` で `VITE_API_BASE_URL` を読み、
  未定義なら `""` にフォールバックする（ブラウザからの API 呼び出しが同一 origin に飛ぶ）。
- この値は gitignore 済みの root `.env` にのみ定義されており
  （`VITE_API_BASE_URL=http://localhost:3000`）、vite の `envDir` は
  リポジトリルートを指す（`web/vite.config.ts`）。
- `playwright.config.ts` の webServer のうち vite dev（5173）と
  vite build + preview（4173）は `env` 未指定のため、`.env` の無いクリーン環境（CI）では
  ブラウザからの全 API 呼び出しが vite の origin に飛んで失敗し、UI 系 spec が全滅する
  （request fixture で :3000 を直叩きする perf / idempotency 等の spec は pass する）。

再現・修正効果は検証済み: ローカルで `.env` を退避すると CI と同一の失敗が同一モードで
再現し、両 webServer の `env` に `VITE_API_BASE_URL` を明示すると失敗 spec
（keyboard / login / smoke / pwa-prod）が全 pass する。
TZ（UTC/JST）・CI フラグ・フルスイート実行はいずれも無関係と切り分け済み。

## ゴール / 非ゴール

- ゴール:
  - e2e スイートが `.env` に依存せず自己完結し、クリーン環境（CI）で green になること。
  - CI の playwright job が green になること（4 job すべて green）。
- 非ゴール:
  - `web/src/bootstrap.ts` のフォールバック仕様の変更
    （`""` フォールバックは Capacitor / native モード等の設計に関わるため触らない）。
  - vite proxy の導入。
  - `.env.example` の整備（必要なら backlog に別項目として起こす）。

## 要件

- 機能要件:
  - `playwright.config.ts` の webServer のうち vite dev（5173）と
    vite build + preview（4173）の 2 エントリに、
    `env: { VITE_API_BASE_URL: "http://localhost:3000" }` を明示する。
  - server 側 webServer（3000）が既に `env` を明示している
    （`DATABASE_PATH` / `TEST_NOW`）のと同型のパターンに揃える。
- 非機能要件:
  - ローカルの `.env` の有無・値に関わらず e2e の結果が変わらないこと
    （webServer の `env` は明示値が優先される。サーバ側ポート 3000 は既に固定前提であり衝突しない）。
  - 変更は e2e 構成（`playwright.config.ts`）のみに閉じ、アプリ本体・CI workflow に手を入れない。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
シナリオ: クリーン環境相当（.env 無し）でフルスイートが green
  Given ローカルで root の `.env` を一時退避し、`.env` が存在しない状態にする
  When  playwright のフルスイートを実行する
  Then  全 spec が pass する（UI 系 spec・pwa-prod を含む）
```

```
シナリオ: 実 CI run で 4 job すべて green
  Given 本変更を含む PR を作成する
  When  その PR の CI（typecheck / lint / vitest / playwright）が実行される
  Then  4 job すべてが success で終了する（playwright job が timeout cancel されず完走する）
```

```
シナリオ: ローカルの .env が存在しても結果が変わらない
  Given root に `.env`（`VITE_API_BASE_URL=http://localhost:3000`）が存在する
  When  playwright のフルスイートを実行する
  Then  全 spec が pass する（明示 env が優先され、挙動が変わらない）
```

## 完了判定の扱い

本 feature の成果物は e2e 構成の設定変更であり、振る舞いテスト（vitest）を生まない。
「テスト green == 実装済み」の対応が成立しないため、完了判定は次で行う:

- PR の実 CI run で 4 job すべて green であることの確認。
- `auditor` による変更の実在確認（`playwright.config.ts` の該当 2 エントリに
  `env` が明示されていること）。

## 未決事項 / 確認待ち

- なし（backlog の方針・ローカル再現・修正効果の検証により変更内容は確定済み）。
