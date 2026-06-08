# 仕様: Google Play Store 公開対応 (play-store-release)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-023 / NFR-030, CONSTRAINT-003

## 背景 / 課題

Todica の最終目標は Google Play Store への公開であり（project.md §1, §11 CONSTRAINT-003）、
BL-019（Android サーバモード）・BL-020（Android ローカルモード）・BL-022（OSS 公開準備）の
完了により Android アプリとしての実装は整った。

Play Store に公開するためには、技術的な実装の完成だけでなく、以下のストア固有の要件を満たす
必要がある。

- Google Play Console への登録と AAB アップロードに必要なメタデータ・画像の準備
- プライバシーポリシーの作成と外部 URL での公開（Google Play は必須要件として要求する）
- データセーフティセクションへの記入（2022 年以降 Google Play の必須項目）
- Google Play ポリシーへの適合確認とチェックリストの整備

これらが未整備のままでは審査に提出できず、公開ゴールに到達できない。

## ゴール / 非ゴール

- ゴール:
  - プライバシーポリシーを作成し、GitHub Pages 経由でアクセス可能な URL で公開する
  - Play Console のデータセーフティセクション記入に必要な情報をドキュメント化する
  - ストア掲載情報（アプリ名・説明文・カテゴリ等）を定義したドキュメントを作成する
  - スクリーンショット要件と用意すべき画像の仕様をドキュメント化する
  - Play Store ポリシー適合確認チェックリストを作成する
  - 上記の成果物が整ったことをもって「公開申請可能な状態」とみなす
- 非ゴール:
  - Play Console への実際のアカウント登録・アプリ登録操作（手動で行う）
  - スクリーンショット画像ファイルそのものの作成（仕様書でキャプチャ要件を定義するのみ）
  - Google Play Developer アカウントの費用支払い（手動で行う）
  - 公開後の審査通過の保証（審査はGoogle が行う）
  - リリースビルドの署名鍵管理（BL-019 で完了済み）

## 要件

### 機能要件

- FR-001: プライバシーポリシーを `docs/privacy-policy.md` に作成する。以下の項目を含める。
  - アプリが収集・処理するデータの種類と目的
  - データの保存場所（端末内またはユーザー運用のサーバ）
  - 第三者へのデータ送信の有無（送信しない旨を明記）
  - データの削除方法（アプリ削除でデータが削除される旨）
  - 連絡先情報
  - 最終更新日
- FR-002: GitHub Pages を通じてプライバシーポリシーを公開するための設定を行う。
  - `docs/` ディレクトリを GitHub Pages のソースとして使用できる構成にする
  - 公開 URL のパターンを `https://bigtree777.github.io/todica/privacy-policy` として文書化する
  - Play Console に入力する URL を `docs/developer/features/play-store-release/store-listing.md` に明記する
- FR-003: データセーフティ情報を `docs/developer/features/play-store-release/data-safety.md` に記録する。Play Console の記入フォームに対応する以下の情報を含める。
  - 収集するデータの種類（なし or 種別リスト）
  - 共有するデータの種別（なし）
  - データのセキュリティ（暗号化の有無・削除リクエストへの対応）
  - データの独立監査の有無
- FR-004: ストア掲載情報を `docs/developer/features/play-store-release/store-listing.md` に定義する。以下を含める。
  - アプリ名（30 文字以内）
  - 短い説明文（80 文字以内）
  - 詳細説明文（4000 文字以内）
  - カテゴリ
  - タグ（最大 5 つ）
  - 連絡先メールアドレス
  - プライバシーポリシー URL
- FR-005: スクリーンショット要件を `docs/developer/features/play-store-release/store-listing.md` 内に定義する。Play Store の必須要件を満たす以下の情報を含める。
  - 電話スクリーンショット: 最低 2 枚・最大 8 枚、PNG または JPEG、最小辺 320dp・最大辺 3840dp
  - 7 インチタブレット・10 インチタブレットのスクリーンショット: 任意（電話のみで申請可）
  - フィーチャーグラフィック: 1024 × 500 px PNG または JPEG（必須）
  - アイコン: 512 × 512 px PNG（32 bit、アルファチャンネルあり）
  - キャプチャすべき画面の一覧（今日ビュー・フォーカスビュー・プロジェクトビュー等）
- FR-006: Google Play ポリシー適合確認チェックリストを `docs/developer/features/play-store-release/policy-checklist.md` に作成する。以下の観点を含める。
  - ターゲット API レベル（現在の Google Play の最低要件への適合）
  - アプリのコンテンツレーティング（IARC 評価）
  - 不正行為ポリシー（過大な権限要求がないこと）
  - プライバシーポリシーの存在と内容の適合
  - データセーフティセクションの記入完了
  - パーミッション宣言の妥当性（`AndroidManifest.xml` の確認項目）
  - 広告ポリシー（広告なし、子供向け広告非使用の確認）

### 非機能要件

- NFR-030（Play Store 公開）: 本 feature の成果物が揃った状態で Play Console からアプリ申請が提出できること。
- NFR-SEC: プライバシーポリシーにユーザーの個人情報を実際に収集していない事実が正確に反映されていること。
- NFR-CONSTRAINT-003: Google Play Developer Program Policy に準拠すること。

## 受け入れ基準

```
シナリオ: プライバシーポリシーファイルが作成されている
  Given  リポジトリの docs/privacy-policy.md を確認する
  When   ファイルの内容を読む
  Then   収集するデータの種類に関する記述がある
  And    第三者へのデータ送信をしない旨が明記されている
  And    データの保存場所（端末内またはユーザー運用サーバ）が明記されている
  And    連絡先情報が記載されている
  And    最終更新日が記載されている

シナリオ: プライバシーポリシーの公開 URL が文書化されている
  Given  docs/developer/features/play-store-release/store-listing.md が存在する
  When   ファイルを読む
  Then   プライバシーポリシー URL の項目がある
  And    URL が "https://bigtree777.github.io/todica/privacy-policy" と一致する

シナリオ: データセーフティ情報が記録されている
  Given  docs/developer/features/play-store-release/data-safety.md が存在する
  When   ファイルを読む
  Then   収集するデータの種類の項目がある
  And    共有するデータの項目がある
  And    データの暗号化に関する記述がある
  And    削除リクエストへの対応方法が記載されている

シナリオ: ストア掲載情報が定義されている
  Given  docs/developer/features/play-store-release/store-listing.md が存在する
  When   ファイルを読む
  Then   アプリ名が定義されており 30 文字以内である
  And    短い説明文が定義されており 80 文字以内である
  And    詳細説明文が定義されている
  And    カテゴリが定義されている
  And    連絡先メールアドレスが記載されている

シナリオ: スクリーンショット要件が定義されている
  Given  docs/developer/features/play-store-release/store-listing.md を読む
  When   スクリーンショットのセクションを確認する
  Then   必要なスクリーンショットの枚数要件が記載されている
  And    フィーチャーグラフィックのサイズ要件（1024 × 500 px）が記載されている
  And    アイコンのサイズ要件（512 × 512 px）が記載されている
  And    キャプチャすべき画面の一覧がある

シナリオ: ポリシー適合確認チェックリストが作成されている
  Given  docs/developer/features/play-store-release/policy-checklist.md が存在する
  When   ファイルを読む
  Then   ターゲット API レベルの確認項目がある
  And    IARC コンテンツレーティングの確認項目がある
  And    パーミッション宣言の確認項目がある
  And    プライバシーポリシーの確認項目がある
  And    データセーフティセクションの確認項目がある
  And    不正行為ポリシーの確認項目がある
  And    広告ポリシーの確認項目がある
```

## 未決事項 / 確認待ち

- GitHub Pages の有効化はリポジトリが public になった後に実施する。public 化前は URL への実際のアクセスは不可能であるため、本 feature では URL の文書化のみを行い、実際の疎通確認は BL-024（v1.0.0 安定化）の最終公開作業とする。
- Play Console の開発者アカウント登録（一回限りの $25 登録料）は本 feature の外とする。
- IARC コンテンツレーティングの回答内容は policy-checklist.md に想定回答を記録するが、実際の提出は Play Console 上で行う。
