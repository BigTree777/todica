# 仕様: GitHub Actions による品質ゲート自動化 (ci-automated-gate)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-107

## 背景 / 課題

- リポジトリに `.github/workflows/` が存在せず, PR の品質確認は提出者の手元実行に依存する.
- `.github/pull_request_template.md` には「テストすべて green」のチェック行があるが手動運用で,
  「すべて」を vitest だけで満たしたつもりになる余地が残る.
  実例として web の login UI 必須化に際し Playwright を流さずに submit され,
  `e2e/smoke.spec.ts` を含む広範な E2E が failed のまま main に取り込まれ,
  後続 PR を多数経て BL-104 まで検知できなかった.
- 個別開発者の規律ではなく, リモートでの強制的なゲートとして
  typecheck / lint / vitest / Playwright を毎 PR で必ず実行する仕組みが必要.

## ゴール / 非ゴール

- ゴール:
  - すべての PR と main への push で typecheck / lint / vitest / Playwright を
    GitHub Actions 上で自動実行し, 失敗を必須ゲートとして可視化する.
  - 開発者がローカルでも同じ 4 種を 1 コマンドで再現できる (`npm run ci`) 統合 script を用意する.
  - PR テンプレートを「自動ゲートに準拠する」内容に揃え, 手動で「テスト green」をチェックする運用を廃する.
- 非ゴール:
  - リリース自動化 (タグ打ち / npm publish / Play Store 配信 等) は対象外.
  - クロスブラウザ E2E (firefox / webkit) は対象外. Playwright は当面 chromium のみ.
  - Android (Gradle) ビルドの CI 化は対象外.
  - GitHub のブランチ保護ルール (Required status checks) 設定そのものは
    リポジトリ管理者の GitHub UI 操作であり, このリポジトリのコード変更では完結しない.
    本機能は「ブランチ保護で参照できる安定した job 名と成功条件」を提供するところまでを担う.

## 要件

### 機能要件

- `.github/workflows/ci.yml` を新設し, 次のトリガで起動する.
  - `pull_request` (デフォルトの opened / synchronize / reopened)
  - `push` (branches: `main`)
- 1 つのワークフロー内に, 次の独立した job を並列に配置する. それぞれが PR の status check として
  GitHub UI に出る単位になる.
  - `typecheck`: 全 workspace の TypeScript 型検査.
  - `lint`: Biome による lint チェック.
  - `vitest`: 全 workspace の単体・コンポーネントテスト.
  - `playwright`: `e2e/` 配下の E2E テスト (chromium のみ).
- 各 job は同一のセットアップ手順 (Node 固定 + 依存インストール) を踏んだ上で,
  該当する 1 コマンドを実行する.
- Playwright job は `npx playwright install --with-deps chromium` 相当でブラウザを取得する.
- 依存インストールと Playwright ブラウザは GitHub Actions のキャッシュで再利用する.
- `package.json` に統合 script `npm run ci` を追加し, ローカルで 4 種すべてを順次実行できるようにする.
- `.github/pull_request_template.md` から「テストがすべて green」を手で押す行を撤去し,
  「CI ゲートが green であること」を前提とする文言に揃える.

### 非機能要件

- 1 回の CI 実行は通常時 5 分以内に完了する (キャッシュヒット時の目安).
- 4 job 並列実行とし, 単一 job の失敗が他 job をキャンセルしないこと (失敗箇所をまとめて確認できる).
- Node ランタイムは 24 系を `actions/setup-node@v4` で固定する. ローカル `package.json` の
  `engines` 指定とずれない値にする (具体値は「未決事項」参照).
- 同一 PR で連続 push されたときに古いワークフロー実行をキャンセルする
  `concurrency` 設定を有効にする (CI 待ち行列の無駄を抑える).

## 受け入れ基準

```
シナリオ: PR を開くと 4 ジョブが自動起動する
  Given main から派生した feature ブランチがあり, 任意の差分が含まれる
  When  そのブランチで GitHub に PR を開く
  Then  PR の Checks 一覧に typecheck / lint / vitest / playwright の 4 job が表示され,
        いずれも自動でキューに入って実行が始まる
```

```
シナリオ: 全 job が green の PR ではゲートが通る
  Given 上記 4 job がすべてローカルで成功する状態の PR がある
  When  CI が完走する
  Then  4 job すべてが success として PR の Checks に表示され,
        ブランチ保護ルールで「これらを必須」に設定した環境ではマージ可能状態になる
```

```
シナリオ: 1 job でも失敗するとゲートは通らない
  Given PR の差分が, 例えば lint 違反 (Biome の rule に反する) を含む
  When  CI が走る
  Then  lint job が failure として表示され, 他の 3 job は引き続き実行され結果が出る
   And  ブランチ保護で「これら 4 job 成功必須」設定下では PR は「Merge できない」UI 状態になる
```

```
シナリオ: Playwright の login 共通化を前提として E2E が green になる
  Given e2e/global-setup により storageState が事前に保存されている既存スペック群がある
  When  CI の playwright job が `npx playwright test` を実行する
  Then  chromium プロジェクトの全 spec が pass する
```

```
シナリオ: ローカルでも CI と同じ 4 種を 1 コマンドで再現できる
  Given 開発者がリポジトリルートに居る
  When  `npm run ci` を実行する
  Then  typecheck / lint / vitest / Playwright が順次走り, 1 つでも失敗すれば
        exit code 0 以外で終了する
```

```
シナリオ: PR テンプレートが自動ゲート前提に揃っている
  Given `.github/pull_request_template.md` を開く
  When  「マージ前チェック」セクションを読む
  Then  「テストがすべて green」をユーザが手で押すチェックボックスは存在せず,
        代わりに CI 4 job (typecheck / lint / vitest / playwright) が green であることを
        前提とする文言になっている
```

```
シナリオ: 同一 PR の連続 push で古い実行が自動キャンセルされる
  Given ある PR が CI 実行中である
  When  同じブランチに新しい commit が push される
  Then  古いワークフロー実行はキャンセルされ, 新しい commit に対する実行のみが残る
```

### チェックリスト (補助)

- [ ] `.github/workflows/ci.yml` が存在する.
- [ ] ワークフローの job 名が `typecheck` / `lint` / `vitest` / `playwright` で固定されている
      (ブランチ保護で必須化する側が参照する識別子であるため改名しない).
- [ ] `package.json` に `ci` script が存在し, 4 種を順次走らせる.
- [ ] PR テンプレートに手動「テスト green チェック行」が無い.

## 確定事項

仕様策定時点の管理者判断で次のとおり確定する.

- Node の固定値: `node-version: '24'` (24 系の LTS ラインに追随). `.nvmrc` の追加は本機能の範囲外.
- `package.json` の `engines` は追加しない. 既存設定を保ち本機能の影響範囲を CI 周辺に閉じる.
- `npm run ci` の停止戦略: `&&` 連結で fail-fast. 順番は typecheck → lint → vitest → Playwright.
- Playwright ブラウザのキャッシュキー: `playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}`.
  `@playwright/test` のバージョンは `package-lock.json` に含まれるため lockfile ハッシュで間接的に反映する.
- npm キャッシュ: `actions/setup-node@v4` の `cache: 'npm'` + `package-lock.json`.
- 依存インストール: `npm ci`.
- E2E 失敗時の trace / report: 失敗時のみ `playwright-report/` と `test-results/` を
  `actions/upload-artifact@v4` で保存する.
- ブランチ保護: GitHub UI 側でリポジトリ管理者が `typecheck` / `lint` / `vitest` / `playwright`
  の 4 job を Required status checks に設定する. リポジトリのコード側では job 名の不変性を保証するに留める.
- vitest の coverage: CI では収集しない. 既存依存は残す.
- PR テンプレートの文言: 「マージ前チェック」セクション冒頭に
  「このリポジトリでは GitHub Actions の CI ゲート (typecheck / lint / vitest / playwright) が
   green であることがマージ条件です.」を置き, 手動「テスト green チェック」行を削除する.
