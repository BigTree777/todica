# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 言語

- **コミットメッセージとドキュメントの内容はすべて日本語で記述する。** 例外は設けない。
- Conventional Commits の型（`feat`, `fix` など）は英語のまま使い、説明（description）・本文・フッターを日本語で書く。
- **ファイル名・ディレクトリ名は英語で固定する**（kebab-case 推奨。例: `git-workflow.md`, `module-boundaries.md`）。日本語のファイル名は使わない。

## 開発方針

### 1. マルチエージェント開発

**このリポジトリでは、メインエージェントが「管理者」として振る舞う。**
管理者は自分で実装・テスト作成・仕様策定を行わず、下表のサブエージェントに委譲し、
全体を進行・調整する。各サブエージェントの詳細な役割は `.claude/agents/*.md` を正典とする
（この節は管理者のためのオーケストレーション指針であり、各サブエージェントの定義ではない）。

#### 管理者の責務

- 全体の進行管理と、各サブエージェントへの委譲判断。
- 成果物（仕様・テスト・実装・監査結果）の受け渡しと、不備があれば差し戻し。
- 完了条件（後述）を満たすまでフローを回す。

#### 委譲先サブエージェント

| サブエージェント | 委譲する作業 |
| --- | --- |
| `project-designer` | 仕様（スペック）の策定、アーキテクチャ・機能分解の設計 |
| `test-designer` | 受け入れ基準からのテスト設計（TDD の失敗するテストを用意） |
| `implementer` | テストを通す実装（実行手段は implementer の定義に従う） |
| `auditor` | コードレビュー、仕様適合・品質の検証 |
| `architecture-reviewer` | architecture（設計ドキュメント）と code（実装）の横断整合レビュー。乖離時に doc / code / spec のどれを直すかを双方向に判定する |

#### 標準フロー

管理者は次の順で委譲する。各ステップの成果物を確認し、問題があれば前段へ差し戻す。

1. `project-designer` に仕様策定を依頼（`docs/developer/features/<feature-name>/` に spec → plan → tasks）。
2. `test-designer` に、確定した仕様から失敗するテストの作成を依頼。
3. `implementer` に、テストを通す（green 化する）実装を依頼。
4. `auditor` に、仕様適合・テストの妥当性・品質の検証を依頼。
5. 監査で差し戻しがあれば該当するサブエージェントへ戻し、完了条件を満たすまで繰り返す。

`architecture-reviewer` は上記の per-feature フローとは別軸の **横断レビュー** である。リリース前・アーキ変更時・整合監査依頼時に管理者が起動し、`architecture` 全体と `code` 全体を直接突き合わせる。`auditor` が spec を正として code を検証するのに対し、`architecture-reviewer` は spec / architecture 自体の妥当性も疑い、乖離があれば doc・code・spec のどれを直すべきかを判定する（上方修正も提言できる）。

### 2. スペックドリブン開発

- 実装の前に仕様を確定させる。仕様 → 計画 → タスクの順で進める。
- 仕様・計画・タスクは `docs/developer/features/<feature-name>/` に置く（`_template/` をコピーして使う）。

### 3. TDD で実装する

- 「失敗するテストを書く → 通す → リファクタ」のサイクルで実装する。
- テスト設計者が用意したテストを、実装者が通していく。

### 4. 完了の定義: 「テストが通る == 機能が実装されている」

- テストが通ることをもって機能が実装されたとみなす。この対応関係を重視する。
- したがってテストは仕様を正しく表現している必要がある。
- ただしこの対応は **振る舞いテストを持つ成果物にのみ** 成立する。ツール・基盤・ドキュメント等、振る舞いテストを生まない成果物は「テスト green」では完了を判定できないため、`auditor` / `architecture-reviewer` が実在を直接確認する。

### 5. 実装の実行手段（管理者が選ぶ）

実装フェーズの実行手段は **管理者 (メインの claude)** が選ぶ。`implementer` サブエージェントが内部で切り替えるのではない。

- 実装の選択肢は次の 2 通り:
  1. **管理者が直接 `codex-rescue` スキル / `codex:codex-rescue` サブエージェントを呼ぶ**。
  2. **管理者が `implementer` サブエージェントに依頼する**（implementer は claude として直接実装する。codex-rescue を呼ばない）。
- `codex-rescue` から `claude` への委譲連鎖は無い。codex-rescue は単独のスキル / エージェントであり, 失敗時に別エージェントへ自動フォールバックする仕組みは持たない。
- `implementer` は「codex-rescue 利用可否を判定して切替える」ようなロジックを持たない。管理者が依頼した時点で claude として実装することが確定している。
- 詳細は `.claude/agents/implementer.md` を参照。

## Git 規約

詳細は [`docs/developer/git-workflow.md`](docs/developer/git-workflow.md) を参照（引用元リンクあり）。概要は以下のとおり。

### ブランチ運用: GitHub Flow

- `main` は常にデプロイ可能な状態に保つ。`main` へ直接コミットしない。
- 作業は `main` から短命なブランチを切って行う。ブランチ名は対象 feature と対応させる（例: `feature/<feature-name>` ↔ `docs/developer/features/<feature-name>/`）。
- 変更は Pull Request 経由でレビューを受けてから `main` にマージする。
- **マージ条件: テストが全て green（「テストが通る == 機能が実装されている」）＋ `auditor` の承認。**
- リリースは `main` 上のタグ（`v0.1.0` など、セマンティックバージョニング）で表す。

### コミットメッセージ: Conventional Commits v1.0.0

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

- 主要な型: `feat`（→ semver MINOR） / `fix`（→ PATCH）。破壊的変更は `type!` または `BREAKING CHANGE:` フッター（→ MAJOR）。
- その他の型: `docs` / `style` / `refactor` / `perf` / `test` / `build` / `ci` / `chore`。
- scope には feature 名を入れてよい（例: `feat(auth): ...` ↔ `docs/developer/features/auth/`）。

## 注意事項

### `docs/developer/project.md` の編集は原則禁止

`docs/developer/project.md` はプロジェクトの目的・スコープ・前提を定める基盤ドキュメントである。
ここが変わると後続の仕様・設計・実装すべての前提が揺らぐため、**原則として編集しない**。

- 通常の開発フロー（仕様・テスト・実装）では `project.md` に触れない。
- 記述の誤り・前提の変更などでどうしても編集が必要な場合は、**自己判断で変更せず、必ずユーザーに確認を取ってから**行う。
- 各サブエージェントも同様に `project.md` を変更対象に含めない。仕様の追加・変更は `docs/developer/features/<feature-name>/` 側で行う。
