# 設計・実装計画: Google Play Store 公開対応 (play-store-release)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

本 feature はコードの実装を伴わず、**ドキュメントの作成と GitHub Pages の設定**が主な作業である。
以下の 3 つのアウトプットを順に作成し、Play Console への申請提出が可能な状態を整える。

1. プライバシーポリシー（`docs/privacy-policy.md`）
2. Play Console 記入用ドキュメント（`data-safety.md`・`store-listing.md`）
3. 審査準備チェックリスト（`policy-checklist.md`）

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| モジュール | なし |
| UI | なし |
| ドキュメント | `docs/privacy-policy.md` 新規作成 |
| ドキュメント | `docs/developer/features/play-store-release/data-safety.md` 新規作成 |
| ドキュメント | `docs/developer/features/play-store-release/store-listing.md` 新規作成 |
| ドキュメント | `docs/developer/features/play-store-release/policy-checklist.md` 新規作成 |
| GitHub Pages | `docs/` ディレクトリを Pages ソースとして使用する設定 |

## 設計詳細

### プライバシーポリシー（`docs/privacy-policy.md`）

**配置方針**

- `docs/privacy-policy.md` として配置する。
- GitHub Pages を `docs/` ディレクトリをソースとして有効化することで、
  `https://bigtree777.github.io/todica/privacy-policy` でアクセスできるようになる。
- Markdown ファイルは GitHub が自動的に HTML レンダリングするため、追加のビルドツールは不要。

**記述内容の根拠**

Todica の Android アプリは以下の特性を持つため、プライバシーポリシーの記述が比較的シンプルになる。

- ローカルモード: データはすべて端末内 SQLite に保存。外部への送信なし。
- サーバモード: データはユーザー本人が運用するサーバに送信される。第三者のサーバは使用しない。
- 収集するデータ: なし（アカウント情報・位置情報・連絡先等を収集しない）
- 使用するパーミッション: インターネット通信のみ（サーバモード時）
- アナリティクス・広告 SDK: 使用しない

### データセーフティ情報（`data-safety.md`）

Play Console のデータセーフティセクションは、以下のカテゴリごとに「収集する / しない」「共有する / しない」を申告する。Todica の実態に基づいて各項目を記録する。

| カテゴリ | 収集 | 共有 | 備考 |
| --- | --- | --- | --- |
| 位置情報 | なし | なし | |
| 個人情報 | なし | なし | |
| 財務情報 | なし | なし | |
| 健康・フィットネス | なし | なし | |
| メッセージ | なし | なし | |
| 写真・動画 | なし | なし | |
| 音声・ファイル | なし | なし | |
| カレンダー | なし | なし | |
| 連絡先 | なし | なし | |
| アプリのアクティビティ | なし | なし | アナリティクスなし |
| アプリの情報とパフォーマンス | なし | なし | クラッシュレポートなし |
| デバイスまたはその他の識別子 | なし | なし | |

データのセキュリティ:
- 転送時の暗号化: サーバモード時は HTTPS（ユーザーがサーバを HTTPS で運用する想定）
- 保存時の暗号化: ローカルモードは SQLite（Android のファイルシステム暗号化に依存）
- データ削除リクエスト: アプリのアンインストールにより全データ削除（ローカルモード）。サーバモードはユーザーがサーバを停止・削除することで対応。

### ストア掲載情報（`store-listing.md`）

**アプリ名**: Todica - 今日のタスクにフォーカス（25 文字）

**短い説明文（80 文字以内）**:
今日やることに集中できる、シンプルな個人用 ToDoリスト。プロジェクトで文脈を保ちつつ、1つのタスクにフォーカス。

**カテゴリ**: 仕事効率化（Productivity）

**コンテンツレーティング**: IARC による一般向け（Everyone）

**スクリーンショット要件**

Play Store が定める最低要件と、Todica として用意すべき画面の対応:

| 画像種別 | 要件 | Todica で用意する画面 |
| --- | --- | --- |
| 電話スクリーンショット | 2〜8 枚、PNG/JPEG、最小辺 320dp・最大辺 3840dp | 今日ビュー、フォーカスビュー（現在のタスク）、プロジェクトビュー、ゴミ箱・設定ビュー |
| フィーチャーグラフィック | 1 枚必須、1024 × 500 px、PNG または JPEG | アプリの雰囲気を伝える横長バナー |
| アイコン | 1 枚必須、512 × 512 px、PNG（32 bit） | アプリアイコン（既存の `android/app/src/main/res/` のものを 512 × 512 に書き出す） |

### ポリシー適合確認チェックリスト（`policy-checklist.md`）

以下の観点を審査提出前に確認するチェックリストとして記録する。

1. **ターゲット API レベル**: Google Play は毎年最低 targetSdkVersion を引き上げる。2025 年時点で新規アプリは API 35 以上を要求される。`android/app/build.gradle` の `targetSdkVersion` を確認する。
2. **IARC コンテンツレーティング**: Play Console 上で IARC の質問に回答する。Todica は暴力・ギャンブル・性的コンテンツを含まないため「Everyone」相当になる想定。
3. **パーミッション**: `android/app/src/main/AndroidManifest.xml` に宣言されているパーミッションが最小限であることを確認する（`INTERNET` のみの想定）。
4. **プライバシーポリシー**: Play Console の「アプリのコンテンツ」セクションに URL を登録済みであることを確認する。
5. **データセーフティ**: Play Console のデータセーフティセクションに記入済みであることを確認する。
6. **広告**: 広告 SDK を使用していないことを確認する。
7. **請求・サブスクリプション**: アプリ内課金を使用していないことを確認する。
8. **未成年者への配慮**: 子供向けアプリではない旨を Play Console で申告する。

### GitHub Pages の設定方針

リポジトリが public になった後、GitHub リポジトリの Settings > Pages で以下を設定する。

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

この設定により `docs/` 以下の Markdown ファイルが `https://bigtree777.github.io/todica/` 以下で参照できるようになる。プライバシーポリシーは `docs/privacy-policy.md` として配置するため、URL は `https://bigtree777.github.io/todica/privacy-policy` となる（GitHub Pages は拡張子なしでもアクセス可）。

実際の疎通確認は BL-024（v1.0.0 安定化）の最終公開作業フェーズで行う（リポジトリ public 化後）。

## 重要な決定

- Todica は個人データ・アカウント情報・位置情報等を一切収集しないため、データセーフティセクションの全カテゴリを「収集しない / 共有しない」として申告する。この事実はプライバシーポリシーにも明記する。
- プライバシーポリシーのホスティングは GitHub Pages を使用する。別途 Web サービスを立てるコストを避け、リポジトリと同一の場所で管理できることを優先する（CONSTRAINT-002 に沿った判断）。
- スクリーンショット画像ファイルの実作成は本 feature のスコープ外とし、キャプチャ要件の定義のみを行う。実際の画像作成はプロジェクトオーナーが手動で行う。

## リスク / 代替案

- **GitHub Pages の URL が変わるリスク**: リポジトリ名変更やアカウント変更があると URL が変わり、Play Console の登録情報の更新が必要になる。リポジトリ名・アカウント名は変更しない前提で進める。
- **Play Store ポリシー改定**: Google が審査基準を変更した場合、policy-checklist.md の内容が陳腐化する。チェックリストには作成日を明記し、申請前に最新ポリシーを確認する旨を注記する。
- **代替案 - 独自ドメインでのホスティング**: カスタムドメインを取得して Cloudflare Pages 等でホストする案もあるが、個人負担コスト（CONSTRAINT-002）と運用手間（CONSTRAINT-001）を考慮し、GitHub Pages を優先する。

## テスト方針

本 feature は実装コードを含まないため、自動テストは存在しない。受け入れ基準の確認は以下の手動チェックで行う。

- `docs/privacy-policy.md` のファイル存在と内容の目視確認
- `store-listing.md` の文字数カウント（アプリ名 ≤ 30 文字、短い説明文 ≤ 80 文字）
- `data-safety.md` の全カテゴリ記入漏れがないことの目視確認
- `policy-checklist.md` の全チェック項目の存在確認
- `store-listing.md` のプライバシーポリシー URL の記載確認
