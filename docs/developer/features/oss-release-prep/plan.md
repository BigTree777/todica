# 設計・実装計画: OSS 公開準備 (oss-release-prep)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

コード変更は最小限（`package.json` へのフィールド追加のみ）とし、残りはすべてファイル追加で完結させる。
依存ライセンスの確認は `npx license-checker` を使い、その出力を人手で整理して
`docs/developer/oss/dependency-licenses.md` に記録する。
秘密情報スキャンは `git log` + `grep` による手動調査で行い、結果を
`docs/developer/oss/secret-scan-report.md` に記録する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| ルート | `LICENSE` / `README.md` / `CONTRIBUTING.md` を追加・更新 |
| `package.json`（ルートおよび各 workspace） | `author` / `license` / `repository` フィールドを追加 |
| `docs/developer/oss/` | `dependency-licenses.md` / `secret-scan-report.md` を新規作成 |
| API | なし |
| DB | なし |
| モジュール | なし |
| UI | なし |

## 設計詳細

### LICENSE ファイル

MIT License のテキストをそのまま記述する。著作権年は追加時点の年（2026）、著作権者は `BigTree777` とする。

### 依存ライセンス確認

```
npx license-checker --production --json
```

を実行し、各パッケージのライセンスを抽出する。`--production` フラグで
`devDependencies` を含む全パッケージを対象にする（devDependencies は
リポジトリに含まれるためスキャン対象に含める）。

MIT 互換ライセンスの範囲: MIT / ISC / BSD-2-Clause / BSD-3-Clause / Apache-2.0 / 0BSD / CC0-1.0 / CC-BY-4.0 / Unlicense。

コピーレフト非互換ライセンスの範囲（要対処）: GPL-2.0 / GPL-3.0 / LGPL-2.0 / LGPL-2.1 / LGPL-3.0 / AGPL-3.0。

`docs/developer/oss/dependency-licenses.md` の構成:
1. 確認実施日・コマンド・実行環境
2. パッケージ一覧テーブル（パッケージ名 / バージョン / ライセンス / 備考）
3. 判定結論（互換性あり / 要対処）

### 秘密情報スキャン

以下のパターンを `git log -p` の出力に対して `grep` で検索する。

```
grep -rE "(password|secret|token|api_key|apikey|private_key)\s*=\s*['\"][^'\"]{8,}" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" \
  --exclude-dir=node_modules .
```

加えて `.env` ファイルが Git 管理されていないことを `git ls-files | grep "\.env"` で確認する。

`docs/developer/oss/secret-scan-report.md` の構成:
1. 調査日時・調査者・調査対象ブランチ / コミット範囲
2. 調査手順
3. 調査結果（検出なし / 検出ありと対処）
4. 除外対象の確認（`.gitignore` で除外済みのファイル一覧）

### README.md の構成

```
# Todica
<1〜2 行の説明>

## 特徴
<主要機能の箇条書き>

## セットアップ
### 前提条件
### クローン・インストール
### サーバの起動
### Web クライアントのビルド
### Android ビルド

## ドキュメント
<開発者向けドキュメントへのリンク>

## ライセンス
<MIT License と LICENSE ファイルへのリンク>
```

環境変数（`AUTH_TOKEN` / `DATABASE_PATH` / `PORT`）の説明は
`docs/operations/env-reference.md`（server-foundation feature で作成予定）へ参照リンクを貼る形とし、README には最小限の手順のみ記載する。

### package.json の追加フィールド

workspace の `"private": true` はそのまま維持する。`license` フィールドは
npm の慣習に従い `"MIT"` という文字列値とする。
`repository.directory` は各 workspace のルート相対パス（`"domain"` / `"server"` / `"web"`）を設定する。

### CONTRIBUTING.md の構成

```
# コントリビューション

## 前提条件
## 開発環境のセットアップ
## テストの実行
## コミットメッセージ規約
## ブランチ戦略
## プルリクエストのチェックリスト
```

## 重要な決定

- ライセンスは MIT を選定する。商用・非商用を問わず自由な利用・改変・再頒布を許可する最もシンプルな選択肢であり、依存パッケージの大多数も MIT であるため互換性の問題が最小化される。
- `license-checker` は npx で一時実行する。継続的な監視は現時点のスコープ外とし、devDependencies への追加は行わない。
- `package.json` に `"private": true` が設定された workspace については、`license` フィールドは npm publish 時に使用されないが、ファイルとして参照可能にするために追加する。

## リスク / 代替案

| リスク | 対策 |
| --- | --- |
| `license-checker` がすべてのパッケージのライセンスを正しく取得できない | 取得できなかったパッケージは GitHub リポジトリの `LICENSE` ファイルを直接確認し、手動で記録する |
| GPLv3 依存パッケージが発見された場合 | devDependencies であれば配布物に含まれないため実用上問題ない旨を記録し、可能なら MIT 互換の代替パッケージに差し替える |
| 秘密情報が過去のコミットに含まれる場合 | 該当コミットを `git filter-repo` で除去し、リポジトリを強制プッシュする（その場合はユーザーに判断を仰ぐ） |

## テスト方針

本 feature はコード変更を含まないため、自動テスト（vitest）の追加は行わない。
受け入れ基準はすべて目視確認で担保する。

- `LICENSE` ファイルの存在・内容を目視確認する。
- `dependency-licenses.md` のパッケージ一覧がロックファイルと整合していることを確認する。
- `secret-scan-report.md` の手順を実際に実行し、検出なしを確認する。
- `README.md` に "TODO:" のプレースホルダーが残っていないことを確認する。
- 各 `package.json` に `author` / `license` / `repository` があることを確認する。
- `CONTRIBUTING.md` に必須セクションが揃っていることを確認する。
