# 設計・実装計画: Android ラップ（Capacitor サーバモード + Play Internal Testing 提出）

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

既存の Web クライアント（`web/`）を一切書き直さず、Capacitor をモノレポのルートに追加してラップする。
サーバ URL・認証トークンの動的設定は `@capacitor/preferences` を介した Preferences 永続化と、
Android 専用のルート（`/setup`）として SetupView を実装することで実現する。
ビルドは `web/dist` を同期した後に Gradle の `bundleRelease` タスクで署名済み AAB を生成する。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| ルート | `capacitor.config.ts` を新規作成 |
| 依存関係 | ルート `package.json` に `@capacitor/core`・`@capacitor/cli`・`@capacitor/android`・`@capacitor/preferences` を追加 |
| Android プロジェクト | `android/` ディレクトリを新規生成（`npx cap add android`） |
| `web/` ルーティング | `/setup` ルートと SetupView コンポーネントを追加 |
| `web/src/main.tsx` | Capacitor Preferences からサーバ URL・認証トークンを読み取るロジックを追加 |
| `web/src/ui/settings-view/settings-view.tsx` | 「サーバ接続設定」セクションを追加 |
| ビルドスクリプト | ルート `package.json` に `android:build` スクリプトを追加 |
| `.gitignore` | `android/local.properties`・`*.keystore`・`*.jks`・`key.properties` を追加 |
| ドキュメント | `docs/developer/android-build.md` を新規作成 |

## 設計詳細

### D-001: Capacitor の配置

Capacitor はモノレポルートに配置する。`capacitor.config.ts` の `webDir` に `web/dist` を指定するため、
ルートからの相対パスで `web/dist` を参照する。

```
todica/                      ← モノレポルート
  capacitor.config.ts        ← Capacitor 設定
  android/                   ← Cap add で生成
  web/
    dist/                    ← Vite ビルド成果物（cap sync の入力）
    src/
      ui/setup-view/         ← 新規追加
```

`npx cap sync` はモノレポルートで実行し、`web/dist/` の内容を `android/app/src/main/assets/public/` に同期する。

### D-002: サーバ URL・認証トークンの動的設定

Web クライアントは現在 `import.meta.env.VITE_API_BASE_URL` と `import.meta.env.VITE_AUTH_TOKEN` を参照している。
Android アプリでは Vite の環境変数はビルド時に確定してしまうため、実行時にユーザーが入力した値を使えない。

解決策: **プラットフォーム検出 + Preferences フォールバック**

1. `@capacitor/core` の `Capacitor.isNativePlatform()` でネイティブアプリ上での実行を検出する。
2. ネイティブプラットフォームの場合は `@capacitor/preferences` の `Preferences.get({ key: 'serverUrl' })` と `Preferences.get({ key: 'authToken' })` から値を取得する。
3. 値が未設定（空文字・null）の場合は `/setup` ルートにリダイレクトする。
4. ブラウザ（Web）の場合は従来通り `import.meta.env` を使う。

この判定は `main.tsx` のアプリ初期化前に非同期で行い、`App` コンポーネントに `serverUrl` と `authToken` を渡す。

### D-003: SetupView の設計

| 項目 | 内容 |
| --- | --- |
| パス | `/setup` |
| 表示条件 | ネイティブプラットフォーム かつ Preferences にサーバ URL が未設定 |
| 入力フィールド | サーバ URL（`type="url"`）・認証トークン（`type="password"`） |
| 保存先 | `@capacitor/preferences`（`serverUrl`・`authToken` キー） |
| 保存後の遷移 | `/today` にリダイレクト（`replace`） |

**Props:**

```typescript
export interface SetupViewProps {
  onSetupComplete: (serverUrl: string, authToken: string) => void;
}
```

`onSetupComplete` コールバックで `main.tsx` 側の Repository インスタンスを再構築し、ルートを `/today` に遷移させる。

### D-004: main.tsx の改修

現在の `main.tsx` は同期的に環境変数を読み取っている。
改修後は非同期初期化フローを採用する。

```
1. Capacitor.isNativePlatform() を確認
2. ネイティブ: Preferences.get('serverUrl'), Preferences.get('authToken') を await
   Web:         import.meta.env から読み取り（従来通り）
3. serverUrl が空 かつ ネイティブ → 初期ルートを "/setup" に設定
4. それ以外 → 初期ルートを "/today" に設定
5. Repository インスタンスを serverUrl・authToken で構築
6. App をレンダリング
```

### D-005: SettingsView の改修

「サーバ接続設定」セクションを条件付きで表示する。

- `Capacitor.isNativePlatform()` が `true` の場合のみセクションを表示する。
- 現在の設定値を `Preferences.get()` で読み取って初期値として表示する。
- 「保存」ボタンクリックで `Preferences.set()` に書き込む。
- 保存後はページをリロード（`window.location.reload()`）して Repository を新しい設定で再構築する。

### D-006: Android プロジェクト設定

#### AndroidManifest.xml

NFR-030 を満たすために以下の設定を行う:

- `android:usesCleartextTraffic="false"` — HTTPS を強制（server.androidScheme: 'https' と対応）
- ローカルネットワーク（HTTP）への接続が必要な場合は `network_security_config.xml` で許可リストを管理する

#### build.gradle の署名設定

```
signingConfigs {
    release {
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

署名情報は `android/key.properties` から読み取る。このファイルは `.gitignore` に追加してリポジトリに含めない。

#### SDK バージョン

- `minSdkVersion`: 26（Android 8.0）
- `targetSdkVersion`: 34（NFR-AND-003）
- `compileSdkVersion`: 34

### D-007: ビルドフロー

```
# 1. Web クライアントをビルド
npm run build -w web

# 2. Android プロジェクトに同期
npx cap sync android

# 3. AAB をビルド（android/ ディレクトリで実行）
cd android && ./gradlew bundleRelease
```

ルート `package.json` に以下のスクリプトを追加する:

```json
{
  "android:sync": "npm run build -w web && npx cap sync android",
  "android:bundle": "npm run android:sync && cd android && ./gradlew bundleRelease"
}
```

### D-008: ネットワークセキュリティ設定

Capacitor のデフォルト設定では `cleartext` 通信が一部許可されている。
サーバモードでは HTTPS を前提とするため、`server.androidScheme: 'https'` を設定済みである（FR-AND-002）。
ローカルネットワーク内の HTTP サーバへの接続要件がある場合（開発者が自宅 LAN のサーバに HTTP で接続する等）は `network_security_config.xml` でプライベート IP レンジを許可する。

### D-009: .gitignore 追加項目

```
# Android 署名
android/key.properties
*.keystore
*.jks

# Android ローカル設定
android/local.properties

# Capacitor 生成物（ビルドキャッシュ）
android/.gradle/
android/app/build/
```

## 重要な決定

- **Capacitor はモノレポルートに配置する。** `web/` に配置すると `webDir` の解決が複雑になるため、ルートが適切。
- **Preferences による動的設定を採用する。** Vite ビルド時の環境変数では Android 実行時のサーバ URL をユーザーが変更できないため。ブラウザと Android で初期化パスを分岐させる。
- **既存の Web テストは変更しない。** `Capacitor.isNativePlatform()` はブラウザ環境では `false` を返すため、テスト環境に影響を与えない。
- **`android/` ディレクトリはリポジトリに含める。** Capacitor の公式推奨に従い、生成された Android プロジェクトをバージョン管理する。CI/CD での再現性確保のため。

## リスク / 代替案

- **Capacitor バージョンの非互換**: v6 は Jetpack WebView を使用。将来 v7 が出た場合は移行が必要。→ `package.json` のバージョンを固定して管理する。
- **Service Worker の動作**: Capacitor の WebView でも PWA の Service Worker は動作する（ADR-0009 確認済み）。ただし `capacitor.config.ts` で `androidScheme: 'https'` を設定する必要がある（HTTP スキームでは SW が登録されない）。
- **HTTP ローカルサーバへの接続**: 開発者が LAN 内の自宅サーバに HTTP で接続したい場合、`network_security_config.xml` の追加設定が必要。ドキュメントに手順を記載する。
- **Preferences の代替**: `@capacitor/secure-storage` を使う選択肢もあるが、BL-019 スコープでは過剰。認証トークンの保護が必要になった場合は BL-020 以降で検討する。

## テスト方針

- **SetupView の単体テスト**: `@capacitor/preferences` をモックし、`onSetupComplete` コールバックが正しい引数で呼ばれることを検証する。
- **main.tsx の統合的確認**: ブラウザ環境（isNativePlatform = false）では従来通り動作することを既存テストで担保する。
- **AAB の検証**: `bundletool` または Android Studio のビルドレポートでターゲット API レベル・署名有効性を確認する（手動確認）。
- **実機 / エミュレーター確認**: AC-AND-004（タスク操作）はエミュレーターでの手動確認とする。自動化は BL-020 以降で検討する。
