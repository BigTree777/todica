# 仕様: Android ラップ（Capacitor サーバモード + Play Internal Testing 提出）

- 状態: 確定
- 関連: BL-019
- 由来要件: NFR-030（Google Play Store 規約適合）/ NFR-031（同一コードベースから Android 配布）/ ADR-0009（Capacitor で Web 実装をラップ）

## 背景 / 課題

BL-018 で Web クライアント（React + Vite + PWA）が実装済みである。
ADR-0009 は「Capacitor で Web 実装を Android にラップする」方針を確定している。
しかし現時点では Android アプリとして配布する手段がなく、Google Play Store への提出経路も存在しない。

BL-019 のスコープは「サーバモード」すなわち、既存の Web クライアントをそのまま Capacitor の WebView に乗せて Android アプリ化し、Play Internal Testing（内部テスト）へ提出できる状態にすることである。

ローカルモード（端末内 SQLite 直接操作）は BL-020 で対応する。

## ゴール / 非ゴール

### ゴール

- モノレポのルートに `capacitor.config.ts` を配置し、Capacitor プロジェクトを初期化する。
- `npx cap add android` で Android プロジェクト（`android/` ディレクトリ）を生成する。
- `npx cap sync android` で `web/dist/` のビルド成果物を Android プロジェクトに同期する。
- Android エミュレーターおよび実機でアプリが起動し、サーバに接続してタスク操作ができる。
- 初回起動時にサーバ URL を入力する「サーバ設定画面（SetupView）」を実装する。
- 署名済み AAB（Android App Bundle）を生成し、Play Internal Testing にアップロードできる形式にする。
- ビルド手順・署名手順を `docs/developer/android-build.md` にドキュメント化する。

### 非ゴール

- ローカルモード（BL-020）
- iOS 対応
- Google Play Store への公開（BL-023）
- プッシュ通知・バックグラウンド同期（Capacitor プラグイン拡張）
- 認証方式の変更（認証は共通の `LoginView` と sessions テーブルによる opaque token フローを利用する）

## 要件

### 機能要件

- FR-AND-001: `@capacitor/core`・`@capacitor/cli`・`@capacitor/android` をモノレポに追加し、`capacitor.config.ts` を作成する。
- FR-AND-002: `capacitor.config.ts` の `webDir` は `web/dist` を指す。`appId` は `com.todica.app`、`appName` は `Todica`、`server.androidScheme` は `https` とする。
- FR-AND-003: `npx cap add android` コマンドで `android/` ディレクトリが生成される。
- FR-AND-004: Android アプリ初回起動時（サーバ URL 未設定時）にサーバ URL の入力を促す SetupView を表示する。入力値は Android の Preferences（`@capacitor/preferences`）に永続化し、完了後は LoginView へ遷移する。
- FR-AND-005: LoginView で `/api/v1/login` にパスワードを送信し、取得した opaque token を `authStorage` に保存した後、TodayView に遷移してタスクの表示・作成・完了・削除ができる。
- FR-AND-006: サーバ URL 設定済みの場合（2 回目以降の起動）は SetupView をスキップし、token があれば TodayView、なければ LoginView に遷移する。
- FR-AND-007: SettingsView に「サーバ接続設定」セクションを追加し、保存済みのサーバ URLを変更できる。認証 token の再発行はログアウト後の再ログインで行う。
- FR-AND-008: `android/app/build.gradle` にリリース署名設定（`signingConfigs.release`）を追加し、`./gradlew bundleRelease` で AAB ファイルが生成される。
- FR-AND-009: 生成された AAB ファイルは Google Play Internal Testing にアップロードできる形式（署名済み）である。

### 非機能要件

- NFR-030: Google Play Store の審査要件（ターゲット API レベル・権限宣言等）を満たす `AndroidManifest.xml` 設定を行う。
- NFR-031: `web/` ディレクトリの既存コードを変更せずに（または最小限の条件分岐追加のみで）Android アプリ化できる。
- NFR-AND-001: `web/` の既存テスト（Vitest）はすべて green を維持する。
- NFR-AND-002: Android プロジェクト（`android/`）はバージョン管理に含める。ただし署名用 keystore ファイル（`.jks` / `.keystore`）は `.gitignore` に追加しリポジトリに含めない。
- NFR-AND-003: `minSdkVersion` は 26（Android 8.0）以上、`targetSdkVersion` は最新安定版（34 以上）とする。

## 受け入れ基準

### AC-AND-001: Capacitor プロジェクト初期化

```
シナリオ: capacitor.config.ts が正しい値を持つ
  Given モノレポルートに capacitor.config.ts が存在する
  When  ファイルの内容を確認する
  Then  appId が "com.todica.app" である
  And   appName が "Todica" である
  And   webDir が "web/dist" である
  And   server.androidScheme が "https" である
```

```
シナリオ: android/ ディレクトリが生成されている
  Given capacitor.config.ts が存在する
  When  npx cap add android を実行済みである
  Then  android/ ディレクトリが存在する
  And   android/app/build.gradle が存在する
  And   android/app/src/main/AndroidManifest.xml が存在する
```

### AC-AND-002: Web アセット同期

```
シナリオ: web/dist の成果物が Android プロジェクトに同期される
  Given npm run build が web/dist/ に成果物を出力済みである
  When  npx cap sync android を実行する
  Then  android/app/src/main/assets/public/ 以下に index.html が存在する
```

### AC-AND-003: SetupView（初回起動）

```
シナリオ: サーバ URL 未設定時に SetupView が表示される
  Given Android アプリを初回起動する（Preferences にサーバ URL が未設定）
  When  アプリが起動する
  Then  SetupView が表示される
  And   「サーバ URL」入力欄が存在する
  And   「接続する」ボタンが存在する
```

```
シナリオ: SetupView でサーバ URL を入力して保存するとログイン画面に遷移する
  Given SetupView が表示されている
  When  サーバ URL に有効な URL を入力する
  And   「接続する」ボタンをタップする
  Then  サーバ URL が Preferences に保存される
  And   LoginView に遷移する
```

```
シナリオ: サーバ URL 設定済みの場合は SetupView をスキップする
  Given Preferences にサーバ URL が保存され、`authStorage` に有効な opaque token がある
  When  Android アプリを起動する
  Then  SetupView は表示されない
  And   TodayView が表示される
```

### AC-AND-004: タスク操作（サーバモード）

```
シナリオ: Android アプリからタスクの一覧が表示できる
  Given サーバが稼働中でサーバ URL が設定済みかつ LoginView で認証済みである
  When  Android アプリを起動してタスク一覧を開く
  Then  サーバに登録されているタスクが TodayView に表示される
```

```
シナリオ: Android アプリからタスクを作成できる
  Given TodayView が表示されている
  When  新しいタスク名を入力して追加する
  Then  タスクがサーバに保存され、一覧に反映される
```

```
シナリオ: Android アプリからタスクを完了できる
  Given TodayView にタスクが 1 件表示されている
  When  タスクの完了チェックボックスをタップする
  Then  タスクの完了状態がサーバに反映される
```

### AC-AND-005: SettingsView のサーバ設定変更

```
シナリオ: SettingsView からサーバ URL を変更できる
  Given SettingsView の「サーバ接続設定」セクションが表示されている
  When  サーバ URL を編集して保存する
  Then  新しい URL が Preferences に保存される
  And   次回の API リクエストから新しいサーバ URL が使用される
  And   認証 token はログアウト後の LoginView で再発行できる
```

### AC-AND-006: AAB ビルド

```
シナリオ: bundleRelease で署名済み AAB が生成される
  Given android/ ディレクトリに署名設定（keystore）が構成されている
  When  android/ ディレクトリ内で ./gradlew bundleRelease を実行する
  Then  android/app/build/outputs/bundle/release/app-release.aab が生成される
```

```
シナリオ: 生成された AAB は Google Play の要件を満たす
  Given app-release.aab が生成されている
  When  bundletool または Google Play Console で検証する
  Then  署名が有効である
  And   targetSdkVersion が 34 以上である
  And   minSdkVersion が 26 以上である
```

## 未決事項 / 確認待ち

- **認証情報の入力 UX**: SetupView はサーバ URL の設定に限定し、パスワード入力と token 発行は共通の LoginView に集約する。
- **Capacitor のバージョン**: v6 系（最新安定版）を採用する予定。v7 がリリースされている場合は採用を検討するが、安定性を優先して v6 系とする。
- **`android/` のコミット方針**: 生成直後の `android/` は多数のファイルを含む。`.gitignore` で除外するファイル（`android/local.properties`・keystore ファイル等）を明確にする必要がある。
