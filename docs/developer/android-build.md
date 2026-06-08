# Android ビルド手順

Capacitor を使って Web クライアントを Android アプリとしてビルドし、Google Play Internal Testing に提出する手順。

## 前提条件

- Java 11 以上（OpenJDK 推奨）
- Android SDK（`ANDROID_HOME` 環境変数を設定済み）
- Node.js 20 以上

## 初回セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. keystore の生成

リリース署名に使う keystore を生成する。生成したファイルは **リポジトリに含めず**、安全な場所に保管すること。

```bash
keytool -genkey -v \
  -keystore todica-release.jks \
  -alias todica \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### 3. key.properties の作成

`android/key.properties` を新規作成する（`.gitignore` に含まれているためコミットされない）。

```properties
storePassword=<keystoreのパスワード>
keyPassword=<keyのパスワード>
keyAlias=todica
storeFile=<todica-release.jks の絶対パスまたは android/ からの相対パス>
```

例（keystore を `android/` ディレクトリに配置した場合）:

```properties
storePassword=mysecurepassword
keyPassword=mysecurepassword
keyAlias=todica
storeFile=../todica-release.jks
```

### 4. build.gradle への署名設定追加

`android/app/build.gradle` の先頭（`plugins` ブロックの前）に以下を追加:

```groovy
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

`android` ブロック内に `signingConfigs` を追加し、`buildTypes.release` に設定:

```groovy
android {
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
}
```

## 日常ビルド手順

### Web クライアントを同期して Android に反映する

```bash
npm run android:sync
```

このコマンドは以下を順に実行する:
1. `npm run build -w web` — Vite で `web/dist/` を生成
2. `npx cap sync android` — `web/dist/` を `android/app/src/main/assets/public/` に同期

### AAB（リリースビルド）を生成する

```bash
npm run android:bundle
```

生成された AAB は以下のパスに出力される:

```
android/app/build/outputs/bundle/release/app-release.aab
```

## Google Play Internal Testing への提出

1. [Google Play Console](https://play.google.com/console) でアプリを作成する（アプリの作成は初回のみ）。
2. 「内部テスト」トラックを選択し、生成した `app-release.aab` をアップロードする。
3. バージョンコードを毎回インクリメントする（`android/app/build.gradle` の `versionCode`）。

## HTTP ローカルサーバへの接続

`capacitor.config.ts` で `server.androidScheme: 'https'` を設定しているため、HTTP（非 HTTPS）サーバへの接続はデフォルトでブロックされる。

LAN 内の HTTP サーバに接続する必要がある場合は、`android/app/src/main/res/xml/network_security_config.xml` を編集してプライベート IP レンジを許可する:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">192.168.0.0/16</domain>
        <domain includeSubdomains="true">10.0.0.0/8</domain>
    </domain-config>
</network-security-config>
```

その後 `AndroidManifest.xml` の `<application>` タグに `android:networkSecurityConfig="@xml/network_security_config"` が設定されていることを確認する。

## トラブルシューティング

### `Could not find tools.jar` エラー

`JAVA_HOME` が JDK（JRE ではなく）を指していることを確認する。

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
```

### `SDK location not found` エラー

`android/local.properties` に `sdk.dir` が設定されていない。以下を実行して自動生成する:

```bash
npx cap sync android
```

または手動で `android/local.properties` を作成する（このファイルは `.gitignore` に含まれているため手動作成が必要）:

```properties
sdk.dir=/path/to/android/sdk
```

### Service Worker が Android で動作しない

`capacitor.config.ts` の `server.androidScheme` が `https` に設定されているか確認する。HTTP スキームでは Service Worker が登録されない。
