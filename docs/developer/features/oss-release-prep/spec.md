# 仕様: OSS 公開準備 (oss-release-prep)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-022 / NFR-050

## 背景 / 課題

Todica はオープンソースとして GitHub で公開することを目指している（project.md § 1）。
現在のリポジトリには以下の問題があり、公開できる状態にない。

- `LICENSE` ファイルが存在しない。利用者がリポジトリを複製・利用・改変する法的根拠がない。
- 依存パッケージのライセンスが未確認であり、MIT との互換性が保証されていない。
- `.env` ファイルや秘密情報がリポジトリに混入していないことが未確認である。
- `README.md` はプレースホルダーのままであり、外部の人間が内容を把握できない。
- ルートおよび各 workspace の `package.json` に `author` / `license` / `repository` フィールドがない。

## ゴール / 非ゴール

- ゴール:
  - `LICENSE` ファイル（MIT）をリポジトリルートに追加する。
  - 全依存パッケージのライセンスを確認し、MIT と互換性があることを記録する。
  - 秘密情報がリポジトリに含まれないことを確認・ドキュメント化する。
  - `README.md` を公開用として整備する。
  - ルートおよび各 workspace の `package.json` に `author` / `license` / `repository` フィールドを追加する。
  - `CONTRIBUTING.md` を作成し、コントリビューション方法を記述する。
- 非ゴール:
  - GitHub リポジトリを実際に public に変更する操作（これは手動で行う）。
  - CI/CD パイプラインの整備。
  - ライセンス自動スキャンツール（FOSSA 等）の導入・継続運用。
  - コミュニティ管理（Issue テンプレート・PR テンプレート等）の整備。

## 要件

### 機能要件

- FR-001: リポジトリルートに `LICENSE` ファイルを追加する。ライセンスは MIT とし、著作権者は "BigTree777" とする。
- FR-002: 依存パッケージ（ルートおよび domain / server / web の devDependencies・dependencies）のライセンスをすべて確認し、MIT ライセンスと互換性があることを `docs/developer/oss/dependency-licenses.md` に記録する。GPLv2 / GPLv3 等のコピーレフトライセンスを持つパッケージが検出された場合は対処方法（代替パッケージへの置き換えまたは除去）を同ドキュメントに明示する。
- FR-003: `.env` ファイル・ハードコードされた認証トークン・パスワード・API キーがリポジトリに含まれていないことを確認し、確認結果を `docs/developer/oss/secret-scan-report.md` に記録する。確認手順として `git-secrets` または手動 `grep` による調査手順を同ドキュメントに記述する。
- FR-004: `README.md` を公開用に整備する。以下の項目を含める。
  - プロジェクトの説明と目的（日本語）。
  - 主要機能の一覧。
  - セットアップ手順（前提条件・リポジトリのクローン・依存関係インストール）。
  - サーバの起動方法（環境変数の設定を含む）。
  - Web クライアントのビルド方法（`npm run build -w web`）。
  - Android ビルド方法（`npm run android:bundle`）。
  - ライセンス表記（MIT）へのリンク。
  - 開発者向けドキュメントへの参照リンク。
- FR-005: ルートの `package.json` および domain / server / web 各 workspace の `package.json` に `author`・`license`・`repository` フィールドを追加する。
  - `author`: `"BigTree777"`
  - `license`: `"MIT"`
  - `repository`: `{ "type": "git", "url": "https://github.com/BigTree777/todica.git" }` （workspace では `"directory"` フィールドも付与する）
- FR-006: `CONTRIBUTING.md` をリポジトリルートに作成する。以下を記述する。
  - 開発環境のセットアップ手順（前提条件・インストール・テスト実行方法）。
  - コミットメッセージの規約（Conventional Commits）。
  - ブランチ戦略（GitHub Flow）。
  - プルリクエスト提出前のチェックリスト（テスト通過・lint 通過）。

### 非機能要件

- NFR-050（OSS 公開）: リポジトリを GitHub で公開したとき、利用者がリポジトリを複製・利用・改変するための法的根拠（LICENSE）、使用方法（README）、貢献方法（CONTRIBUTING）をすべて参照できること。
- NFR-SEC: `docs/developer/oss/secret-scan-report.md` で確認対象とした時点のコミット範囲に秘密情報が含まれていないこと。

## 受け入れ基準

```
シナリオ: LICENSE ファイルが正しく配置されている
  Given  リポジトリルートを確認する
  When   LICENSE ファイルの内容を読む
  Then   "MIT License" の文字列が含まれる
  And    著作権年と著作権者名（BigTree777）が明記されている

シナリオ: 依存ライセンスの確認結果が記録されている
  Given  docs/developer/oss/dependency-licenses.md が存在する
  When   ファイルを読む
  Then   ルートおよび domain / server / web すべての依存パッケージが列挙されている
  And    各パッケージにライセンス種別が記載されている
  And   "コピーレフト非互換パッケージなし" またはその場合の対処結果が明記されている

シナリオ: 秘密情報スキャン結果が記録されている
  Given  docs/developer/oss/secret-scan-report.md が存在する
  When   ファイルを読む
  Then   調査手順・調査範囲・調査日時が記載されている
  And   "秘密情報の混入なし" またはその場合の修正結果が明記されている

シナリオ: README.md が公開用に整備されている
  Given  リポジトリルートの README.md を読む
  When   内容を確認する
  Then   プロジェクトの説明が記載されている
  And   セットアップ手順（クローン・npm install）が記載されている
  And   サーバの起動方法（環境変数の設定を含む）が記載されている
  And   Web クライアントのビルド方法が記載されている
  And   Android ビルド方法が記載されている
  And   "MIT" の文字列と LICENSE ファイルへの参照が記載されている
  And   "TODO:" のプレースホルダーが残っていない

シナリオ: package.json に必須フィールドが追加されている
  Given  ルートおよび domain / server / web 各 workspace の package.json を読む
  When   各ファイルを確認する
  Then   author フィールドが存在する
  And   license フィールドの値が "MIT" である
  And   repository フィールドが存在する

シナリオ: CONTRIBUTING.md が作成されている
  Given  リポジトリルートの CONTRIBUTING.md を読む
  When   内容を確認する
  Then   開発環境のセットアップ手順が記載されている
  And   コミットメッセージ規約（Conventional Commits）への言及がある
  And   プルリクエスト提出前のチェックリストが記載されている
```

## 未決事項 / 確認待ち

- なし
