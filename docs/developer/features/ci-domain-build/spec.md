# 仕様: CI で domain をビルドしてから typecheck / vitest / playwright を実行する (ci-domain-build)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-144
- 関連: [`../ci-automated-gate/spec.md`](../ci-automated-gate/spec.md) (CI ゲート本体の仕様)

## 背景 / 課題

- CI (`.github/workflows/ci.yml`) が全 run で failure になっている (直近 100 run に success ゼロ.
  lint job のみ green).
- 原因: `@todica/domain` (`domain/package.json`) の `exports` が `domain/dist/` を指すが,
  `dist/` は gitignore 対象であり, CI workflow は `npm ci` 直後に各 job のコマンドを実行するため
  **domain のビルド工程が無い**. クリーンチェックアウトでは次の失敗になる.
  - typecheck job: `TS6305: Output file 'domain/dist/...' has not been built` が大量発生.
  - vitest job: `Cannot find package '@todica/domain/task'` 等で 25 suite が読み込み失敗.
  - playwright job: webServer (`playwright.config.ts`) が `npm run dev -w server` /
    `npm run build -w web` を起動し, いずれも domain に依存するため failure (同一原因の可能性が高い).
  - lint job (Biome): domain の成果物に依存せず green.
- ローカルでは過去ビルドの `domain/dist/` が残るため全ゲート green になり, 齟齬に気づけない.
- 再現確認済み: `domain/dist/` の退避 + `domain/tsconfig.tsbuildinfo` の削除で同一エラーを再現し,
  `npm run build -w domain` (domain の build script は `tsc`) 実行後に `npm run typecheck` が
  exit 0 になることを確認済み. なお `domain/tsconfig.json` は `composite: true` のため
  tsbuildinfo が残っていると dist 不在でも再 emit されないが, CI のクリーンチェックアウトでは
  tsbuildinfo も存在しないため問題にならない.

## ゴール / 非ゴール

- ゴール:
  - CI の typecheck / vitest / playwright 各 job が, 依存インストール後に domain をビルドしてから
    各コマンドを実行する構成にする.
  - 実際の CI run (PR の Checks) で typecheck / vitest / lint の 3 job が success になる.
  - playwright job が domain 起因の起動失敗 (`Cannot find package '@todica/domain/*'` による
    webServer 起動不能) を脱し, テスト実行に到達する.
- 非ゴール:
  - lint job への build step 追加 (Biome は domain 成果物に依存しないため不要. job の軽さを保つ).
  - playwright job の green 化. domain ビルド解消後に残る失敗は独立した原因
    (e2e の `.env` 暗黙依存. 詳細は「想定される追加失敗の扱い」参照) であり,
    別バックログ項目 BL-145 (feature: e2e-env-self-contained 想定) で解消する.
  - ルートの `npm run ci` script へのビルド工程追加 (ローカルは通常 `domain/dist/` が残存して
    動作する. クリーン環境の再現は `npm run clean:dist` が domain の再ビルドまで行うため
    既存手段で足りる).
  - CI の job 分割・トリガ・キャッシュ戦略の変更 (ci-automated-gate の仕様を維持する.
    ただし playwright job の `timeout-minutes` は要件どおり調整する).
  - domain のパッケージ構成 (`exports` が `dist/` を指す設計) の変更.

## 要件

- 機能要件:
  - `.github/workflows/ci.yml` の typecheck / vitest / playwright の 3 job は,
    `install dependencies` (`npm ci`) の直後・各 job 本体コマンドの前に
    `npm run build -w domain` を実行する step を持つ.
  - lint job には build step を置かない.
  - job 名 (`typecheck` / `lint` / `vitest` / `playwright`) は変更しない
    (ブランチ保護の Required status checks が参照する識別子のため).
  - playwright job の `timeout-minutes` は 30 とする (playwright green 前提の正常運用に
    十分な余裕を持たせた上限値. 大量失敗 × retries の状態では 30 分でも cancel され得る.
    判断の詳細は plan.md「重要な決定」参照).
- 非機能要件:
  - domain のビルドは `tsc` 単発であり, 各 job の所要時間への影響は数秒〜十数秒程度に収まる想定.
    ci-automated-gate の「通常時 5 分以内」の目安を維持する.

## 受け入れ基準

> この成果物は CI 定義 (YAML) であり, 振る舞いテスト (vitest) を生まない.
> 完了判定は「テスト green」ではなく, **実際の CI run の結果**と
> auditor による workflow 定義の実在確認による.
>
> 本 feature の Done は「**typecheck / vitest / lint job が green** かつ
> **playwright job が起動失敗 (`Cannot find package '@todica/domain/*'`) を脱して
> テスト実行に到達すること**」で判定する. playwright job 自体の green 化は
> BL-145 (e2e-env-self-contained 想定) の完了条件であり, 本 feature には含めない.

```
シナリオ: typecheck job がクリーンチェックアウトで成功する
  Given domain/dist/ も tsbuildinfo も存在しないクリーンチェックアウトの CI ランナー
  When  typecheck job が npm ci → npm run build -w domain → npm run typecheck を順に実行する
  Then  TS6305 は発生せず, job が success で終了する
```

```
シナリオ: vitest job がクリーンチェックアウトで成功する
  Given 同上のクリーンチェックアウトの CI ランナー
  When  vitest job が npm ci → npm run build -w domain → npx vitest run を順に実行する
  Then  「Cannot find package '@todica/domain/*'」による suite 読み込み失敗は発生せず,
        job が success で終了する
```

```
シナリオ: playwright job が起動失敗を脱してテスト実行に到達する
  Given 同上のクリーンチェックアウトの CI ランナー
  When  playwright job が npm ci → npm run build -w domain → ブラウザ取得 → npx playwright test
        を順に実行する
  Then  webServer (server dev 起動 / web build) は domain 解決失敗
        (`Cannot find package '@todica/domain/*'`) で落ちることなく起動し,
        Playwright のテスト実行 (spec の pass / fail が個別に報告される状態) に到達する
   And  この時点で残る spec の失敗は本 feature の完了判定に含めない (BL-145 で扱う)
```

```
シナリオ: lint job は変更なしで green を維持する
  Given lint job の step 構成に build step が追加されていない
  When  CI が走る
  Then  lint job は従来どおり success で終了する
```

```
シナリオ: PR の CI run が Done 判定の状態になる
  Given 本変更を含む feature ブランチの PR がある
  When  CI が完走する
  Then  PR の Checks 一覧で typecheck / vitest / lint の 3 job が success として表示される
   And  playwright job のログに domain 起因のエラー
        (TS6305 / `Cannot find package '@todica/domain/*'`) が出ておらず,
        テスト実行結果 (spec 単位の pass / fail) が報告されている
```

### チェックリスト (補助)

- [ ] `.github/workflows/ci.yml` の typecheck / vitest / playwright job に
      `npm run build -w domain` の step が install 直後にある.
- [ ] lint job には build step が無い.
- [ ] job 名が 4 つとも従来のまま変わっていない.
- [ ] 本変更の PR で実際の CI run が Done 判定 (typecheck / vitest / lint green +
      playwright がテスト実行到達) を満たしている (run URL を記録する).

## 想定される追加失敗の扱い

CI にはこれまで success の run が無いため, domain 起因の失敗を解消すると
別原因の失敗が露出しうる. 方針: 露出した失敗の原因を切り分け, domain ビルド不在に
起因しないと判定したものは本 feature の scope 外として backlog に別項目で記録する.
その場合でも「domain 起因の失敗 (TS6305 / `@todica/domain` 解決失敗) が消えていること」は
CI ログで確認する.

### 切り分け済み: playwright job の残失敗 (e2e の `.env` 暗黙依存 → BL-145)

実測 (PR #193 の CI run, 3 回) では typecheck / vitest / lint が green になり,
playwright job は起動失敗を脱してテスト実行に到達する. ただし playwright job に
残る失敗があり, 実測の内訳は次のとおり:

- CI の playwright run は 1 本も完走していない (3 run とも job の timeout cancel で終了).
- timeout 30 分の run (28565796297) では, cancel までに 46 件の失敗 annotation を観測
  (残テストは未報告).
- timeout 15 分の run 2 本では, cancel までに報告された失敗一覧 (約 22 件) が
  file / title / 失敗モードのいずれも一致する. 失敗の決定性 (flaky ではないこと) の
  根拠はこの範囲の一致による.

根本原因は domain ビルドとは無関係の独立した問題である:

- web アプリは `web/src/bootstrap.ts` で `VITE_API_BASE_URL` (gitignore 済みの root `.env` に
  定義) を読み, 未定義なら `""` にフォールバックする.
- CI には `.env` が存在しないため, ブラウザからの全 API 呼び出しが同一 origin
  (vite の 5173) に飛んで失敗する.
- このため UI 経由でデータ操作する spec が全滅し, Playwright の request fixture で API を
  直叩きする spec (perf / idempotency 等) は pass する, というパターンと一致する.
- ローカルで `.env` を退避し部分実行 (keyboard / login 等の spec) すると, CI と同一の
  失敗が再現することを確認済み.

この e2e の `.env` 暗黙依存の解消は BL-145 (feature: e2e-env-self-contained 想定) として
切り出し, 本 feature の完了判定には含めない.

## 未決事項 / 確認待ち

- なし (backlog の方針・再現確認により変更内容は確定済み).
