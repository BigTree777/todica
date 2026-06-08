# タスク: Android ラップ（Capacitor サーバモード + Play Internal Testing 提出）

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

### T-01: Capacitor パッケージのインストール

- [ ] ルート `package.json` の `devDependencies` に `@capacitor/cli` を追加する
- [ ] ルート `package.json` の `dependencies` に `@capacitor/core`・`@capacitor/android` を追加する
- [ ] `@capacitor/preferences` を `dependencies` に追加する
- [ ] `npm install` を実行してインストールを確認する

### T-02: capacitor.config.ts の作成

- [ ] モノレポルートに `capacitor.config.ts` を新規作成する
  - `appId`: `"com.todica.app"`
  - `appName`: `"Todica"`
  - `webDir`: `"web/dist"`
  - `server.androidScheme`: `"https"`

### T-03: Android プロジェクトの生成

- [ ] `npm run build -w web` を実行して `web/dist/` を生成する
- [ ] `npx cap add android` を実行して `android/` ディレクトリを生成する
- [ ] `android/` が生成されたことを確認する（`android/app/build.gradle` の存在確認）

### T-04: .gitignore の更新

- [ ] ルートの `.gitignore` に以下を追加する:
  - `android/key.properties`
  - `*.keystore`
  - `*.jks`
  - `android/local.properties`
  - `android/.gradle/`
  - `android/app/build/`

### T-05: Android SDK バージョンの設定

- [ ] `android/app/build.gradle` の `minSdkVersion` を 26 に設定する
- [ ] `android/app/build.gradle` の `targetSdkVersion` を 34 に設定する
- [ ] `android/app/build.gradle` の `compileSdkVersion` を 34 に設定する

### T-06: ネットワークセキュリティ設定

- [ ] `android/app/src/main/res/xml/network_security_config.xml` を確認し、`cleartext` 通信の設定が `server.androidScheme: 'https'` と整合していることを確認する
- [ ] `android/app/src/main/AndroidManifest.xml` に `android:networkSecurityConfig` が設定されていることを確認する（Capacitor デフォルト設定で含まれる場合はそのまま）

### T-07: Preferences による動的設定（main.tsx 改修）

- [ ] `web/src/main.tsx` にプラットフォーム検出ロジックを追加する:
  - `Capacitor.isNativePlatform()` で実行環境を判定する
  - ネイティブの場合は `@capacitor/preferences` の `Preferences.get({ key: 'serverUrl' })` と `Preferences.get({ key: 'authToken' })` を `await` して値を取得する
  - Web の場合は `import.meta.env.VITE_API_BASE_URL`・`import.meta.env.VITE_AUTH_TOKEN` を使用する（従来通り）
- [ ] 取得した `serverUrl`・`authToken` を Repository インスタンスの構築に使用する
- [ ] `serverUrl` が空文字または null の場合に初期ルートを `/setup` にするロジックを追加する
- [ ] `App` コンポーネントのルートを `/setup` または `/today` に動的に設定できるようにする

### T-08: SetupView の実装

- [ ] `web/src/ui/setup-view/setup-view.tsx` を新規作成する
  - `SetupViewProps` インターフェース（`onSetupComplete: (serverUrl: string, authToken: string) => void`）を定義する
  - サーバ URL の `<input type="url">` フィールドを実装する
  - 認証トークンの `<input type="password">` フィールドを実装する
  - 「接続する」ボタンを実装する
  - ボタンクリック時に `Preferences.set({ key: 'serverUrl', value: ... })` と `Preferences.set({ key: 'authToken', value: ... })` を呼び出す
  - 保存完了後に `onSetupComplete(serverUrl, authToken)` を呼び出す
  - `<h1>サーバ設定</h1>` を持つ構造にする
  - 入力値が空のとき「接続する」ボタンを無効化する

### T-09: ルーティングへの /setup 追加

- [ ] `web/src/main.tsx` の `Routes` に `/setup` → `SetupView` ルートを追加する
- [ ] `SetupView` の `onSetupComplete` コールバックで Repository インスタンスを再構築し、`/today` にナビゲートする

### T-10: SettingsView へのサーバ接続設定セクション追加

- [ ] `web/src/ui/settings-view/settings-view.tsx` に「サーバ接続設定」セクションを追加する:
  - `Capacitor.isNativePlatform()` が `true` の場合のみセクションを表示する
  - 初期表示時に `Preferences.get({ key: 'serverUrl' })` と `Preferences.get({ key: 'authToken' })` で現在値を読み取る
  - サーバ URL（`type="url"`）と認証トークン（`type="password"`）の入力フィールドを表示する
  - 「保存」ボタンクリックで `Preferences.set()` に書き込む
  - 保存後に `window.location.reload()` を呼び出して設定を反映させる

### T-11: Web アセット同期の確認

- [ ] `npx cap sync android` を実行する
- [ ] `android/app/src/main/assets/public/index.html` が存在することを確認する

### T-12: エミュレーターでの動作確認

- [ ] Android エミュレーター（API 34）を起動する
- [ ] `npx cap run android` または Android Studio で実機インストール・起動を確認する
- [ ] 初回起動時に SetupView が表示されることを確認する（AC-AND-003）
- [ ] サーバ URL と認証トークンを入力して「接続する」をタップし、TodayView に遷移することを確認する
- [ ] タスクの一覧表示・作成・完了が動作することを確認する（AC-AND-004）
- [ ] アプリを再起動したとき SetupView がスキップされ TodayView が表示されることを確認する

### T-13: 署名用 keystore の生成

- [ ] `keytool` コマンドで新規 keystore を生成する:
  ```
  keytool -genkey -v -keystore todica-release.jks -alias todica -keyalg RSA -keysize 2048 -validity 10000
  ```
- [ ] 生成した `todica-release.jks` をリポジトリ外の安全な場所に保存する
- [ ] `android/key.properties` ファイルを作成し、`storeFile`・`storePassword`・`keyAlias`・`keyPassword` を記入する（このファイルはコミットしない）

### T-14: build.gradle への署名設定追加

- [ ] `android/app/build.gradle` の先頭に `key.properties` の読み込みを追加する:
  ```groovy
  def keystorePropertiesFile = rootProject.file("key.properties")
  def keystoreProperties = new Properties()
  keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
  ```
- [ ] `android.signingConfigs.release` ブロックを追加する（`storeFile`・`storePassword`・`keyAlias`・`keyPassword`）
- [ ] `android.buildTypes.release.signingConfig` を `signingConfigs.release` に設定する

### T-15: AAB のビルドと検証

- [ ] `android/` ディレクトリで `./gradlew bundleRelease` を実行する
- [ ] `android/app/build/outputs/bundle/release/app-release.aab` が生成されることを確認する（AC-AND-006）
- [ ] `bundletool` または Android Studio の Build Analyzer で署名の有効性と targetSdkVersion を確認する

### T-16: ビルドスクリプトの追加

- [ ] ルート `package.json` の `scripts` に以下を追加する:
  - `"android:sync": "npm run build -w web && npx cap sync android"`
  - `"android:bundle": "npm run android:sync && cd android && ./gradlew bundleRelease"`

## テスト

### T-17: SetupView の単体テスト

- [ ] `web/src/ui/setup-view/setup-view.test.tsx` を新規作成する:
  - `@capacitor/preferences` の `Preferences.set` を `vi.mock` でモックする
  - サーバ URL と認証トークンを入力して「接続する」ボタンをクリックしたとき `Preferences.set` が正しいキー・値で呼ばれることを検証する
  - `onSetupComplete` コールバックが入力値を引数として呼ばれることを検証する
  - URL が空のとき「接続する」ボタンが無効化されていることを検証する

### T-18: main.tsx のプラットフォーム分岐テスト

- [ ] `Capacitor.isNativePlatform()` が `false` を返すモック環境（既存テスト環境）で、既存テストが引き続き green であることを確認する
- [ ] `Capacitor.isNativePlatform()` が `true` を返す場合に Preferences から値を読み取るロジックの単体テストを作成する（`@capacitor/core` と `@capacitor/preferences` を `vi.mock` でモック）

### T-19: 既存テストの green 確認

- [ ] `npm test` を実行し、`web/` の全テストが green であることを確認する（NFR-AND-001）

## ドキュメント

### T-20: android-build.md の作成

- [ ] `docs/developer/android-build.md` を新規作成し、以下の内容を記述する:
  - 前提条件（Android SDK のパス・Java バージョン・環境変数 `ANDROID_HOME`）
  - 初回セットアップ手順（パッケージインストール・`cap add android`・keystore 生成）
  - 日常ビルド手順（`npm run android:sync`・`npm run android:bundle`）
  - 署名設定手順（`key.properties` の作成方法）
  - Play Internal Testing への提出手順（AAB のアップロード先・バージョン設定）
  - HTTP ローカルサーバへの接続方法（`network_security_config.xml` の設定）
  - トラブルシューティング（よくあるエラーと対処法）

## 仕上げ

- [ ] AC-AND-001〜AC-AND-006 の受け入れ基準をすべて満たすことを確認する
- [ ] `npm test` で全テストが green であることを確認する
- [ ] `android/` の不要ファイル（ビルドキャッシュ等）が `.gitignore` でリポジトリから除外されていることを確認する
- [ ] `docs/developer/android-build.md` が手順として機能することを第三者視点でレビューする
- [ ] レビュー依頼
