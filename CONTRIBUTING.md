# コントリビューションガイド

Todica へのコントリビューションを歓迎します。

## 開発環境のセットアップ

Node.js 20 以上をインストールしてから、以下を実行してください。

```bash
git clone https://github.com/BigTree777/todica.git
cd todica
npm install
```

テストの実行:

```bash
npm test
```

## コミットメッセージ規約

[Conventional Commits v1.0.0](https://www.conventionalcommits.org/) に従います。

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

主な type:

| type | 用途 |
| --- | --- |
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `refactor` | リファクタリング |
| `test` | テストの追加・修正 |
| `chore` | ビルドやツールの変更 |

コミットメッセージの本文・フッターは日本語で記述してください。

## ブランチ運用: GitHub Flow

- `main` は常にデプロイ可能な状態に保ちます。`main` へ直接コミットしないでください。
- 作業は `main` から短命なブランチを切って行います（例: `feature/<feature-name>`）。
- 変更は Pull Request 経由でレビューを受けてから `main` にマージします。

## PR チェックリスト

Pull Request を送る前に以下を確認してください。

- [ ] `npm test` が全件 green になっている
- [ ] `npm run typecheck` がエラーなし
- [ ] `npm run lint` がエラーなし
- [ ] コミットメッセージが Conventional Commits に準拠している
- [ ] 関連する仕様・ドキュメントを更新している（必要な場合）

## ライセンス

このリポジトリへのコントリビューションは [MIT](./LICENSE) ライセンスの下で公開されます。
