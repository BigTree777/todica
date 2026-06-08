# タスク: Google Play Store 公開対応 (play-store-release)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## ドキュメント作成

### プライバシーポリシー

- [ ] `docs/privacy-policy.md` を新規作成する
  - 収集するデータの種類と目的を記述する
  - データの保存場所（端末内またはユーザー運用サーバ）を記述する
  - 第三者へのデータ送信をしない旨を明記する
  - データの削除方法（アプリ削除によるローカルデータ削除、サーバはユーザーが管理）を記述する
  - 連絡先情報（メールアドレスまたは GitHub Issues URL）を記述する
  - 最終更新日を記述する
- [ ] `docs/developer/features/play-store-release/store-listing.md` にプライバシーポリシー URL を記載する
  - URL: `https://bigtree777.github.io/todica/privacy-policy`

### データセーフティ

- [ ] `docs/developer/features/play-store-release/data-safety.md` を新規作成する
  - Play Console のデータセーフティセクション記入フォームの各カテゴリを網羅する
  - 収集するデータ: 全カテゴリ「収集しない」として記録する
  - 共有するデータ: 全カテゴリ「共有しない」として記録する
  - セキュリティ実践（転送時暗号化・保存時暗号化・削除リクエスト対応）を記述する
  - 独立監査の有無（なし）を記述する

### ストア掲載情報

- [ ] `docs/developer/features/play-store-release/store-listing.md` を新規作成する
  - アプリ名（30 文字以内）を定義する
  - 短い説明文（80 文字以内）を定義する
  - 詳細説明文（4000 文字以内）を作成する
  - カテゴリ（仕事効率化）を記載する
  - タグを最大 5 つ定義する
  - 連絡先メールアドレスを記載する
  - プライバシーポリシー URL を記載する
- [ ] `store-listing.md` のスクリーンショット要件セクションを記述する
  - 電話スクリーンショットの枚数・サイズ要件を記載する
  - フィーチャーグラフィックのサイズ要件（1024 × 500 px）を記載する
  - アプリアイコンのサイズ要件（512 × 512 px）を記載する
  - キャプチャすべき画面の一覧を記載する（今日ビュー・フォーカスビュー・プロジェクトビュー・設定ビュー等）

### ポリシー適合確認チェックリスト

- [ ] `docs/developer/features/play-store-release/policy-checklist.md` を新規作成する
  - ターゲット API レベルの確認項目（`android/app/build.gradle` の `targetSdkVersion` 確認）を追加する
  - IARC コンテンツレーティングの確認項目と想定回答を記載する
  - パーミッション宣言の確認項目（`AndroidManifest.xml` に `INTERNET` のみ宣言されていることの確認）を追加する
  - プライバシーポリシー登録の確認項目を追加する
  - データセーフティセクション記入の確認項目を追加する
  - 広告 SDK 不使用の確認項目を追加する
  - アプリ内課金不使用の確認項目を追加する
  - 子供向けアプリではない旨の申告確認項目を追加する
  - チェックリストの作成日と「申請前に最新 Google Play ポリシーを確認すること」の注記を追加する

## GitHub Pages 設定

- [ ] `docs/developer/features/play-store-release/store-listing.md` に GitHub Pages の設定手順を記載する
  - Settings > Pages > Source: `Deploy from a branch` / Branch: `main` / Folder: `/docs` の設定手順
  - リポジトリが public になった後に実施することを明記する
  - 設定後の疎通確認手順を記載する

## 受け入れ基準の確認

- [ ] `docs/privacy-policy.md` が存在し、spec.md の受け入れ基準の全項目を満たすことを確認する
- [ ] `data-safety.md` が存在し、全カテゴリが記入されていることを確認する
- [ ] `store-listing.md` が存在し、アプリ名が 30 文字以内・短い説明文が 80 文字以内であることを確認する
- [ ] `policy-checklist.md` が存在し、全チェック項目が存在することを確認する
- [ ] `store-listing.md` にプライバシーポリシー URL が記載されていることを確認する

## 仕上げ

- [ ] spec.md の受け入れ基準（全シナリオ）を満たすことを確認する
- [ ] backlog.md の BL-023 の状態を Done に更新する
- [ ] レビュー依頼
