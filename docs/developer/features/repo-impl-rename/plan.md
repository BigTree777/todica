# 計画: Drizzle Repository 実装のファイル命名

## 方針

1. 対象9ファイルを内容変更なしで `drizzle-` 接頭辞付きの名前にする。
2. サーバ起動コードとテストの import path を新しいファイル名に合わせる。
3. 旧 import path の残存と対象ディレクトリの構成を検索で確認する。
4. リポジトリ全体のテスト、lint、typecheck で互換性を確認する。

## 変更範囲

- ファイル名
- 対象実装への import path
- 本 feature のドキュメント

クラス名、Repository interface、永続化ロジック、API の振る舞いは変更範囲に含めない。
