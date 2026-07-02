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
  - 実際の CI run (PR の Checks) で 4 job すべてが success になる.
- 非ゴール:
  - lint job への build step 追加 (Biome は domain 成果物に依存しないため不要. job の軽さを保つ).
  - ルートの `npm run ci` script へのビルド工程追加 (ローカルは通常 `domain/dist/` が残存して
    動作する. クリーン環境の再現は `npm run clean:dist` が domain の再ビルドまで行うため
    既存手段で足りる).
  - CI の job 構成・トリガ・キャッシュ戦略の変更 (ci-automated-gate の仕様を維持する).
  - domain のパッケージ構成 (`exports` が `dist/` を指す設計) の変更.

## 要件

- 機能要件:
  - `.github/workflows/ci.yml` の typecheck / vitest / playwright の 3 job は,
    `install dependencies` (`npm ci`) の直後・各 job 本体コマンドの前に
    `npm run build -w domain` を実行する step を持つ.
  - lint job には build step を置かない.
  - job 名 (`typecheck` / `lint` / `vitest` / `playwright`) は変更しない
    (ブランチ保護の Required status checks が参照する識別子のため).
- 非機能要件:
  - domain のビルドは `tsc` 単発であり, 各 job の所要時間への影響は数秒〜十数秒程度に収まる想定.
    ci-automated-gate の「通常時 5 分以内」の目安を維持する.

## 受け入れ基準

> この成果物は CI 定義 (YAML) であり, 振る舞いテスト (vitest) を生まない.
> 完了判定は「テスト green」ではなく, **実際の CI run が green になること**と
> auditor による workflow 定義の実在確認による.

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
シナリオ: playwright job がクリーンチェックアウトで成功する
  Given 同上のクリーンチェックアウトの CI ランナー
  When  playwright job が npm ci → npm run build -w domain → ブラウザ取得 → npx playwright test
        を順に実行する
  Then  webServer (server dev 起動 / web build) が domain 解決失敗で落ちることはなく,
        job が success で終了する
```

```
シナリオ: lint job は変更なしで green を維持する
  Given lint job の step 構成に build step が追加されていない
  When  CI が走る
  Then  lint job は従来どおり success で終了する
```

```
シナリオ: PR の CI run 全体が green になる
  Given 本変更を含む feature ブランチの PR がある
  When  CI が完走する
  Then  PR の Checks 一覧で typecheck / lint / vitest / playwright の 4 job すべてが
        success として表示される
```

### チェックリスト (補助)

- [ ] `.github/workflows/ci.yml` の typecheck / vitest / playwright job に
      `npm run build -w domain` の step が install 直後にある.
- [ ] lint job には build step が無い.
- [ ] job 名が 4 つとも従来のまま変わっていない.
- [ ] 本変更の PR で実際の CI run が 4 job green になっている (run URL を記録する).

## 想定される追加失敗の扱い

CI はこれまで一度も green になっていないため, domain 起因の失敗を解消した後に
別原因の失敗 (特に playwright job) が露出する可能性がある. その場合:

- 露出した失敗の原因を切り分け, domain ビルド不在に起因しないと判定したものは
  本 feature の scope 外として backlog に別項目で記録する.
- その場合でも「domain 起因の失敗 (TS6305 / `@todica/domain` 解決失敗) が消えていること」は
  CI ログで確認する. ただし本 feature の完了 (Done) は上記シナリオどおり
  **4 job すべて green** をもって判定する (別原因の修正が先行して必要なら,
  その項目の完了を待って本 feature を Done にする).

## 未決事項 / 確認待ち

- なし (backlog の方針・再現確認により変更内容は確定済み).
