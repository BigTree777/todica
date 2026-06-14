# タスク: OSS 公開準備 (oss-release-prep)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

### 1. LICENSE ファイルの追加

- [ ] リポジトリルートに `LICENSE` ファイルを作成する
  - MIT License のテキストを記述する
  - 著作権年: 2026、著作権者: BigTree777

### 2. package.json へのフィールド追加

- [ ] ルートの `package.json` に `author`・`license`・`repository` フィールドを追加する
  - `"author": "BigTree777"`
  - `"license": "MIT"`
  - `"repository": { "type": "git", "url": "https://github.com/BigTree777/todica.git" }`
- [ ] `domain/package.json` に `author`・`license`・`repository` フィールドを追加する
  - repository には `"directory": "domain"` を加える
- [ ] `server/package.json` に `author`・`license`・`repository` フィールドを追加する
  - repository には `"directory": "server"` を加える
- [ ] `web/package.json` に `author`・`license`・`repository` フィールドを追加する
  - repository には `"directory": "web"` を加える

### 3. 依存ライセンス確認と記録

- [ ] `docs/developer/oss/` ディレクトリを作成する
- [ ] `npx license-checker --json` を実行し、全依存パッケージのライセンスを取得する
- [ ] 取得結果をもとに `docs/developer/oss/dependency-licenses.md` を作成する
  - 確認実施日・コマンド・実行環境を冒頭に記載する
  - パッケージ一覧テーブル（パッケージ名 / バージョン / ライセンス / 備考）を記載する
  - コピーレフト非互換ライセンスの有無と判定結論を記載する
- [ ] コピーレフト非互換パッケージが存在する場合は対処する（代替パッケージへの差し替えまたは除去）

### 4. 秘密情報スキャンと記録

- [ ] `git ls-files | grep "\.env"` を実行し、`.env` ファイルが Git 管理されていないことを確認する
- [ ] ソースコード中にハードコードされた認証トークン・パスワード・API キーがないことを grep で確認する
- [ ] `docs/developer/oss/secret-scan-report.md` を作成する
  - 調査日時・調査者・調査対象ブランチ / コミット範囲を記載する
  - 調査手順（実行したコマンド）を記載する
  - 調査結果（検出なし、または検出ありと対処）を記載する
  - `.gitignore` で除外済みのファイル種別を確認・記録する

### 5. README.md の整備

- [ ] `README.md` のプレースホルダーをすべて実際の内容に置き換える
  - プロジェクトの説明と目的を記述する
  - 主要機能の一覧を記述する
  - セットアップ手順（前提条件・クローン・`npm install`）を記述する
  - サーバの起動方法を記述し、環境変数と初回設定は `docs/user/deploy-guide.md` へ誘導する
  - Web クライアントのビルド方法（`npm run build -w web`）を記述する
  - Android ビルド方法（`npm run android:bundle`）を記述する
  - MIT ライセンス表記と `LICENSE` ファイルへの参照リンクを記述する
  - 開発者向けドキュメント（`docs/developer/index.md`）へのリンクを記述する
- [ ] "TODO:" のプレースホルダーが残っていないことを確認する

### 6. CONTRIBUTING.md の作成

- [ ] リポジトリルートに `CONTRIBUTING.md` を作成する
  - 前提条件（Node.js バージョン等）を記述する
  - 開発環境のセットアップ手順（クローン・`npm install`・`.env` 設定）を記述する
  - テストの実行方法（`npm test`・`npm run typecheck`・`npm run lint`）を記述する
  - コミットメッセージ規約（Conventional Commits）を記述し、`docs/developer/git-workflow.md` への参照リンクを貼る
  - ブランチ戦略（GitHub Flow）の概要を記述する
  - プルリクエスト提出前のチェックリストを記述する

## テスト

- [ ] 受け入れ基準（spec.md）を各シナリオごとに目視で確認する
  - `LICENSE` ファイルの存在・MIT テキスト・著作権者表記を確認する
  - `dependency-licenses.md` のパッケージ一覧に "TODO:" が残っていないことを確認する
  - `secret-scan-report.md` の手順を実際に再実行し、検出なしを確認する
  - `README.md` に "TODO:" プレースホルダーが残っていないことを確認する
  - 各 `package.json` に `author` / `license` / `repository` フィールドがあることを確認する
  - `CONTRIBUTING.md` に必須セクションが揃っていることを確認する

## ドキュメント

- [ ] `docs/developer/oss/dependency-licenses.md` の完成を確認する
- [ ] `docs/developer/oss/secret-scan-report.md` の完成を確認する

## 仕上げ

- [ ] 受け入れ基準（[spec.md](spec.md)）を全て満たすことを確認する
- [ ] レビュー依頼

## 経緯

- OSS 公開準備時点の README 案では、固定 token を含む環境変数を起動手順へ直接記載する方針だった。
- 当時の起動例では `AUTH_TOKEN=... npm start` を案内していた。
