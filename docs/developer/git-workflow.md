# Git ワークフロー規約

> このプロジェクトのブランチ運用とコミットメッセージ規約を定める。
> 概要は [`../../CLAUDE.md`](../../CLAUDE.md) の「Git 規約」を参照。本ドキュメントは詳細と引用元を示す。

採用方針:

- ブランチ運用: **GitHub Flow**
- コミットメッセージ: **Conventional Commits v1.0.0**
- バージョニング: **Semantic Versioning 2.0.0**（タグで表現）

---

## 1. ブランチ運用: GitHub Flow

`main` 一本を常にデプロイ可能に保ち、短命なブランチで作業して Pull Request 経由でマージする軽量フロー。
継続的デリバリーと相性がよく、本プロジェクトの「テスト green をマージゲートにする」方針と噛み合う。

### 手順

1. `main` から作業ブランチを作成する。
   - ブランチ名は対象 feature と対応させる: `feature/<feature-name>`（↔ `docs/developer/features/<feature-name>/`）。
   - 修正系は `fix/<topic>` など、目的が分かる名前にする。
2. 小さく頻繁にコミットする（コミット規約は後述）。
3. Pull Request を作成し、レビューと CI を通す。
4. 以下を満たしたら `main` にマージする（**マージゲート**）。
   - テストが全て green である（「テストが通る == 機能が実装されている」）。
   - `auditor` による仕様適合・品質の承認が得られている。
5. `main` は常にデプロイ可能な状態を維持する。`main` への直接コミットは禁止。

### リリース

- リリースは `main` 上のコミットに **タグ** を打って表す（例: `v1.2.0`）。
- バージョンは Semantic Versioning に従う（後述の Conventional Commits の型と対応）。

### スコープ外（将来検討）

- 複数バージョンの長期保守（LTS）や、安定化期間を伴うスケジュールリリースが必要になった場合は、
  その時点で release / maintenance ブランチの追加（Git Flow 的要素）を検討する。現時点では採用しない。

### 引用

- GitHub Flow（GitHub 公式ドキュメント）: <https://docs.github.com/en/get-started/using-github/github-flow>
- 原典の解説（Scott Chacon "GitHub Flow"）: <https://scottchacon.com/2011/08/31/github-flow.html>

---

## 2. コミットメッセージ: Conventional Commits v1.0.0

機械可読なコミット履歴により、changelog 生成やバージョン判定を自動化できる規約。
Angular のコミット規約を汎用仕様として切り出したもので、対応ツール（commitlint, semantic-release, Commitizen 等）が豊富。

### 形式

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

> **言語**: 型（`type`）は英語のまま使い、説明（description）・本文・フッターは**日本語**で記述する（CLAUDE.md「言語」参照）。ドキュメントもすべて日本語。

### 型 (type)

| type | 用途 | semver への影響 |
| --- | --- | --- |
| `feat` | 機能の追加 | MINOR |
| `fix` | バグ修正 | PATCH |
| `docs` | ドキュメントのみ | なし |
| `style` | 動作に影響しない整形 | なし |
| `refactor` | 振る舞いを変えない内部改善 | なし |
| `perf` | パフォーマンス改善 | PATCH |
| `test` | テストの追加・修正 | なし |
| `build` | ビルド・依存関係 | なし |
| `ci` | CI 設定 | なし |
| `chore` | その他雑務 | なし |

> `feat` と `fix` のみが仕様上の必須型。それ以外は Angular 規約由来の慣習で、プロジェクトで取捨選択してよい。

### 破壊的変更

次のいずれかで示す（Semantic Versioning の MAJOR に対応）。

- 型の直後に `!`: `feat!: ...` / `feat(api)!: ...`
- フッターに `BREAKING CHANGE: <説明>`

### scope

- 任意。影響範囲を示す。feature 名を入れると feature ドキュメント／ブランチと一気通貫になる。
- 例: `feat(auth): パスワードリセットを追加` ↔ ブランチ `feature/auth` ↔ `docs/developer/features/auth/`

### 例

```
feat(auth): パスワードリセット機能を追加

期限付きトークンをメール送信し、リンクから再設定できるようにする。

Closes #123
```

```
fix: ログイン時の null 参照を修正
```

```
refactor(api)!: エラーレスポンス形式を変更

BREAKING CHANGE: error.code を文字列から数値に変更した。
```

### 引用

- Conventional Commits v1.0.0（公式仕様）: <https://www.conventionalcommits.org/en/v1.0.0/>
- 日本語版: <https://www.conventionalcommits.org/ja/v1.0.0/>
- Semantic Versioning 2.0.0（公式）: <https://semver.org/lang/ja/>
- 由来となった Angular コミット規約: <https://github.com/angular/angular/blob/main/CONTRIBUTING.md#commit>

---

## 3. 自動チェック（任意）

規約を機械的に強制したい場合の代表的ツール。導入する場合はここに設定を追記する。

- **commitlint** — コミットメッセージの形式検証: <https://commitlint.js.org/>
- **Commitizen** — 規約準拠のコミットを対話生成: <https://commitizen-tools.github.io/commitizen/>
- **semantic-release** — コミットから自動でバージョン決定・changelog 生成・タグ付け: <https://semantic-release.gitbook.io/>
