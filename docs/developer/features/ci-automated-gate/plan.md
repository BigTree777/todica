# 設計・実装計画: GitHub Actions による品質ゲート自動化 (ci-automated-gate)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

- `.github/workflows/ci.yml` 1 本にまとめ, `typecheck` / `lint` / `vitest` / `playwright` の
  4 job を並列に持つ構成にする. job 間に依存関係は持たず, 失敗してもキャンセルしない.
- 各 job は同一の前準備 (checkout → Node セットアップ + npm キャッシュ → `npm ci`) を踏み,
  その上で job 固有の 1 コマンドだけを実行する.
- ローカル再現用に `package.json` の `scripts.ci` を追加し, CI と同じ 4 種を順次実行する.
- PR テンプレートからは「手動でテスト green チェック」を撤去し, CI ゲート前提の文言に揃える.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| CI | `.github/workflows/ci.yml` を新規作成 |
| ドキュメント | `.github/pull_request_template.md` の「マージ前チェック」を CI ゲート前提に書き換え |
| ルート設定 | `package.json` に `scripts.ci` を追加 (内部で既存 script を順次呼ぶ) |
| API | 変更なし |
| DB | 変更なし |
| UI | 変更なし |
| domain / server / web のソース | 変更なし |
| テスト | `.github/workflows/ci.yml` の構造を検証する単体テストを追加 (詳細は「テスト方針」) |

## 設計詳細

### ワークフロー構造

- 名前: `CI` (workflow `name`).
- トリガ:
  - `pull_request:` (デフォルト. `branches:` 指定はしない)
  - `push: { branches: [main] }`
- 並列性:
  - `concurrency:`
    - `group: ci-${{ github.workflow }}-${{ github.ref }}`
    - `cancel-in-progress: true`
- 共通設定:
  - 全 job が `runs-on: ubuntu-latest`.
  - 全 job が `timeout-minutes` を持つ. 暫定値は spec の「5 分以内」に合わせ
    typecheck/lint/vitest は 10 分, playwright は 15 分 (Playwright install 込みの余裕枠).
- 4 job:
  - `typecheck`: `npm run typecheck`
  - `lint`: `npm run lint`
  - `vitest`: `npx vitest run`
  - `playwright`: `npx playwright install --with-deps chromium` → `npx playwright test`
- 各 job の前準備:
  1. `actions/checkout@v4`
  2. `actions/setup-node@v4` (`node-version: '24'`, `cache: 'npm'`)
  3. `npm ci`
- Playwright job のみ, `actions/cache@v4` で `~/.cache/ms-playwright` をキャッシュ.
  キー: `playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}`.
  ヒットしなければ `--with-deps chromium` でインストール.

### `package.json` 統合 script

- 追加する script:
  - `"ci": "npm run typecheck && npm run lint && npx vitest run && npx playwright test"`
- 採用理由:
  - 既存の各 script (`typecheck` / `lint`) はそのまま CI からも使い, ローカルとの
    乖離を作らない.
  - `&&` で fail-fast にし, ローカルでの待ち時間を抑える.
- Playwright ブラウザ未導入のローカル環境では `npx playwright test` 内で失敗するため,
  README または onboarding に「初回のみ `npx playwright install chromium` が必要」を
  メモする (ドキュメント作業は本機能の範囲外, 必要なら別 backlog).

### PR テンプレート

- 撤去する行: 「テストがすべて green (「テストが通る == 機能が実装されている」)」.
- 置き換える前提文 (暫定):
  > このリポジトリでは GitHub Actions の CI ゲート
  > (typecheck / lint / vitest / playwright) が green であることがマージ条件です.
- 残すチェック行:
  - 仕様 (spec.md) の受け入れ基準を満たす
  - `auditor` による検証・承認を得た
  - コミットメッセージが Conventional Commits 準拠
  - 関連ドキュメントを更新した

### ワークフロー構造の検証テスト

- 配置: `__tests__/ci-workflow.test.ts` (リポジトリルートの既存 `__tests__/` 配下を想定).
- 目的: ワークフロー yaml の必須要素 (job 名, コマンド文字列, トリガ, concurrency, Node 固定)
  を string / YAML 構造として assert する. GitHub 上での実行可否は検証できないが,
  「誤って job 名を消した」「コマンドを書き換えた」を unit test で検知する.
- 実装方針:
  - `node:fs` で `.github/workflows/ci.yml` を読み, YAML パース (依存は最小限.
    既存の `vitest` で扱える形にする. YAML パーサが未導入なら導入是非を
    spec の未決事項に上げ直す. 暫定は文字列マッチで代替し, YAML 依存を増やさない).
- assert 例:
  - workflow に `jobs.typecheck` / `jobs.lint` / `jobs.vitest` / `jobs.playwright` が存在.
  - 各 job のステップに `npm run typecheck` / `npm run lint` / `npx vitest run` /
    `npx playwright test` を含む.
  - `on:` に `pull_request` と `push` の両方が含まれる.
  - `concurrency:` が宣言され, `cancel-in-progress: true` が含まれる.
  - `actions/setup-node@v4` 利用箇所で `node-version` が `'24'` で始まる文字列である.

### PR テンプレートの検証テスト

- 配置: 同じく `__tests__/pr-template.test.ts`.
- assert 例:
  - 「テストがすべて green」を含む行が存在しない.
  - 「CI ゲート」「typecheck」「lint」「vitest」「playwright」のキーワードを
    すべて含む文字列が `.github/pull_request_template.md` 内に存在する.

### `npm run ci` の検証テスト

- 配置: `__tests__/package-scripts.test.ts`.
- assert 例:
  - `package.json` の `scripts.ci` が存在し, `typecheck` / `lint` / `vitest` /
    `playwright` のキーワードを順序付きで含む.

## 重要な決定

- 4 job を分割する (1 job 内で全部を直列実行しない):
  - 理由: GitHub UI 上で「どれが落ちたか」を即時可視化するため. ブランチ保護で
    Required status checks に名前単位で並べられる.
- 失敗時の他 job キャンセルをしない:
  - 理由: 1 PR で複数失敗があるとき, まとめて確認できるほうが手戻りが減る.
- ブランチ保護 (Required status checks) 設定はリポジトリ側のコード変更では行わない:
  - 理由: GitHub の組織 / repo 設定であり, コードからは管理できない. 本機能は
    「job 名を安定させる」までを担う.
- 大きな設計判断は ADR 化しないで本 plan 内に閉じる:
  - 理由: アーキテクチャ (DB / API / クライアント技術) ではなく開発インフラの
    話に閉じている. tech-stack の変更を含まない.

## リスク / 代替案

- リスク: Playwright job がローカル環境差で flaky になる可能性.
  - 緩和: `playwright.config.ts` で `retries: 2` (CI 時) が既に設定済み. CI 上での
    実行を本機能の受け入れ基準で観測する.
- リスク: 5 分以内 SLA をキャッシュミス時に満たせない.
  - 緩和: 初回のみ超過は許容する (非機能要件は「キャッシュヒット時の目安」と明記済み).
- 代替案: 4 job を統合する 1 job (シェルで `&&` 連結) にする.
  - 不採用. 可視化と並列性のメリットを失う.
- 代替案: `pnpm` / `yarn` への切替.
  - 不採用. 既存の `npm workspaces` 前提を崩さない.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

- CI 本体は GitHub Actions 環境でしか実機検証できない. このため
  ローカルでは次の 3 種の unit test で「設定ファイルの構造」を縛る.
  1. ワークフロー yaml の構造 (job 名 / コマンド / トリガ / concurrency / Node 固定).
  2. PR テンプレートの文言 (手動チェック行が無い, CI ゲート文言を含む).
  3. `package.json` の `scripts.ci` 内容.
- 実機検証は実 PR を 1 本立て, 4 job が green であること, わざと lint 違反を
  入れた追加 commit でゲートが赤くなることを目視確認する. spec の
  「受け入れ基準」シナリオに対応.
