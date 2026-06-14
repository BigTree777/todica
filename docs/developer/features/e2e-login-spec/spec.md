# 仕様: E2E (Playwright) に LoginView シナリオを追加

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-077
- 依存: BL-074 (アプリ内パスワードログインの導入)

## 背景 / 課題

BL-074 で導入したアプリ内パスワードログイン経路 (`POST /api/v1/login` / sessions テーブル / `LoginView` / `SettingsView` のログアウトボタン) は, server integration テストおよび web 単体テスト (vitest) でカバーされている. 一方で, Playwright (E2E) でブラウザ実機経由の往復シナリオは未追加であり, `e2e/` 配下に login 専用 spec が存在しない.

このため, 「実ブラウザで `LoginView` → `/api/v1/login` → 今日ビュー → `SettingsView` ログアウト → `LoginView` 戻り」までを 1 経路で連動検証する自動テストが無く, BL-074 の AC-1 / AC-2 / AC-3 / AC-5 のいずれかが将来のリファクタリングで回帰しても CI で捕捉できない. `playwright.config.ts` は空の E2E 用 DB で server を起動し, Web 起動前に初期設定 API でテスト用パスワードを登録するため, spec を追加するだけで往復シナリオを守れる状態にある.

## ゴール / 非ゴール

- ゴール:
  - Playwright で「未認証アクセス → `LoginView` 表示 → 誤ったパスワード → 401 + エラー表示 → 正しいパスワード → 今日ビュー → `SettingsView` でログアウト → `LoginView` 戻り」の往復を 1 spec で自動検証する.
  - 上記を新規 `e2e/login.spec.ts` 1 ファイルで完結させ, 既存 e2e spec / vitest / server / web のコードには影響を与えない.
  - `E2E_TEST_PASSWORD` (= `playwright.config.ts` で定義済み) を spec 側から参照可能にし, ハードコードしない.
- 非ゴール:
  - BL-074 の AC-4 (token 期限切れ → LoginView 戻り) の E2E カバー. 期限切れシナリオは vitest (server integration / web 単体) でカバー済み.
  - BL-074 の AC-6 (Android の SetupView → LoginView 2 ステップ) の E2E カバー. Playwright は Web (Chromium) のみ.
  - BL-074 の AC-7 (旧 `AUTH_TOKEN` 完全廃止) の E2E カバー. 旧トークン拒否は server integration でカバー済み.
  - 既存 e2e spec (`smoke.spec.ts` / `today-view-create-form.spec.ts` / `settings.spec.ts` 等) の構造改修.
  - クロスブラウザ (firefox / webkit) 展開. 現状の `playwright.config.ts` 方針 (chromium 限定) を踏襲する.
  - server / web の本体コード改修. テスト追加のみ.

## 要件

- 機能要件:
  - 新規 `e2e/login.spec.ts` を追加し, 以下 4 シナリオを 1 ファイル内に並べる (順序固定):
    1. 未認証アクセスで `LoginView` が表示される.
    2. 誤ったパスワードで送信 → エラーメッセージが表示され, `LoginView` に留まる.
    3. 正しいパスワード (= `E2E_TEST_PASSWORD`) で送信 → 今日ビューに遷移する.
    4. `SettingsView` の「ログアウト」ボタンを押下 → `LoginView` に戻る.
  - `E2E_TEST_PASSWORD` の値は `playwright.config.ts` から re-export 済みのリテラル, または同等の経路 (`process.env` / spec 内定数) で参照する. 直書きは禁止.
  - 各シナリオは Playwright の `test()` 単位で分割し, `test.describe.serial()` 等で連結はしない (各テストの先頭で `await page.goto("/")` から始めて独立に再現可能にする).
- 非機能要件:
  - 既存 `playwright.config.ts` の `webServer` 設定 (`DATABASE_PATH` / `TEST_NOW` と初期設定 API の実行) を流用する. 新たな env / fixture / グローバルセットアップは追加しない.
  - 追加 spec のローカル実行時間は 30 秒以内 (chromium プロジェクト全体の典型値の倍を上限の目安とする).
  - `npx playwright test e2e/login.spec.ts` 単体実行で完結する (他 spec への暗黙依存を持たない).
  - 追加 spec 完了後, 既存 e2e spec (25 本) の green 状態に回帰が無いこと.
  - typecheck / lint で 0 エラー.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: 未認証アクセスで LoginView が表示される
  Given Playwright が `.e2e-data/e2e.db` で起動した初期状態である
    And クライアントの auth-storage に token が一切保存されていない
  When  ブラウザで `/` にアクセスする
  Then  `LoginView` (見出し「ログイン」/ パスワード input / 「ログイン」 button) が表示される
    And 今日ビューの起票フォーム (`role="form"`, name "タスク起票フォーム") は表示されない
```

```
シナリオ AC-2: 誤ったパスワードを送信するとエラーが表示され LoginView に留まる
  Given AC-1 の状態である
  When  パスワード input に `E2E_TEST_PASSWORD` 以外の文字列 (例: "wrong-password") を入力する
    And 「ログイン」 button を押下する
  Then  `role="alert"` 要素に「パスワードが正しくありません」というテキストが表示される
    And `LoginView` のパスワード input が残っており, 今日ビューには遷移していない
    And `aria-invalid="true"` が input に付与されている (LoginView 既存仕様)
```

```
シナリオ AC-3: 正しいパスワードを送信すると今日ビューに遷移する
  Given AC-1 の状態である
  When  パスワード input に `E2E_TEST_PASSWORD` を入力する
    And 「ログイン」 button を押下する
  Then  今日ビューに遷移し, 「タスク起票フォーム」 (`role="form"`) が表示される
    And `LoginView` の見出し「ログイン」は表示されていない
    And ブラウザの `localStorage` の `todica.auth.token` キーに非空文字列が保存されている
```

```
シナリオ AC-4: SettingsView でログアウトすると LoginView に戻る
  Given AC-3 完了後の状態 (= 正しいパスワードでログイン済み, 今日ビュー表示中) である
  When  ナビゲーションから `/settings` に遷移する
    And `SettingsView` の「ログアウト」 button を押下する
  Then  `LoginView` (見出し「ログイン」) が再表示される
    And `localStorage.getItem("todica.auth.token")` が null である
    And 次に `/` を再訪しても今日ビューには直接到達できず, `LoginView` に留まる
```

```
シナリオ AC-5: 既存 e2e spec が回帰なく green を維持する
  Given 本 BL の変更を適用した状態である
  When  `npx playwright test` を実行する
  Then  既存 25 本の spec (smoke / today-view-create-form / settings / projects / routines / trash / ...) が全件 green である
    And 新規 `e2e/login.spec.ts` の 4 シナリオも全件 green である
```

## 未決事項 / 確認待ち

- なし
