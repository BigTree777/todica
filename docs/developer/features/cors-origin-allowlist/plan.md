# 設計・実装計画: サーバ CORS の origin 許可リスト化 (cors-origin-allowlist)

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`server/src/app.ts` の `cors({ origin: "*", ... })` を、`AppDeps` に新規追加する `allowedOrigins: string[]`
(または `app.ts` の引数として明示的に渡される文字列配列) に基づく関数 callback 形式に置き換える。
環境変数 `ALLOWED_ORIGINS` のパースは `server/src/main.ts` 側で行い、`createApp` には解決済みの配列を渡す
(テスト容易性のため、`app.ts` 内では `process.env` を直接参照しない)。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | エンドポイント追加なし。CORS レスポンスヘッダの付与条件のみ変化 |
| DB | 変更なし |
| モジュール | `server/src/app.ts` (cors() 設定), `server/src/main.ts` (環境変数読込), `server/__tests__/helpers/build-test-app.ts` (テスト helper) |
| UI | 変更なし |
| 環境変数 | `ALLOWED_ORIGINS` 新設 |
| ドキュメント | `.env.example` / `docs/developer/setup/server.md` の env 表 / `docs/user/deploy-guide.md` の env 表 |

## 設計詳細

### データモデル

なし。アプリ起動時の不変な配列 `allowedOrigins: string[]` をメモリに保持するのみ。

### 処理フロー

1. プロセス起動時 (`server/src/main.ts`):
   - `process.env.ALLOWED_ORIGINS` を読む。
   - 未定義 or 空文字 → `["http://localhost:5173", "capacitor://localhost"]` を採用 (既定)。
   - 定義済み → `,` で split し各要素を `.trim()`、空文字要素は filter で除去。
   - 結果を `createApp({ ..., allowedOrigins })` に渡す。
2. `createApp` (`server/src/app.ts`):
   - `cors({ origin: (origin) => allowOriginOrNull(origin, allowedOrigins), allowHeaders: [...同じ...], exposeHeaders: ["ETag"], maxAge: 600 })` を設定。
   - `allowOriginOrNull(origin, list)`:
     - `origin` が空文字 (Origin ヘッダ無し相当) → `null` を返す (= Access-Control-Allow-Origin を付けない。同一オリジン fetch ではブラウザがそもそも CORS チェックしないので素通りする)。
     - `origin` が `list` に完全一致で含まれる → `origin` を返す。
     - 含まれない → `null` を返す。
3. リクエスト処理時 (hono/cors 標準動作):
   - 許可された場合: `Access-Control-Allow-Origin: <origin>` 等の標準ヘッダが付与される。
   - 拒否された場合: ヘッダ未付与のまま 204 (OPTIONS) or 通常 200/4xx (それ以外) が返る。ブラウザが CORS エラーとして実利用を阻止する。

### 例外 / エラー処理

- `ALLOWED_ORIGINS` のパース失敗ケースは無い (任意文字列を完全一致リストに入れるだけ)。
  ただし `,` のみ / 空白のみといった入力では空配列になり、全 cross-origin が拒否される結果になる。
  これは「明示指定した運用者の責任」であり、警告ログは出さない (ノイズ回避)。

## 重要な決定

- 環境変数の読込位置: **`main.ts`** で行う。`app.ts` 内で `process.env` を直接参照しない。
  - 理由: `createApp` をテストから直接呼んだ際に `process.env` の状態に挙動が依存するのを避ける。
    既存の `DATABASE_PATH` / `PORT` も `main.ts` で読まれているのと同じ方針を維持する。
- 既定値の選定:
  - `http://localhost:5173`: Vite dev サーバの既定ポート (`web/vite.config.ts` の `server.port` 設定を確認した上で固定)。
  - `capacitor://localhost`: Capacitor Android が WebView で発行する Origin スキーム。
  - iOS の `ionic://localhost` 等は現状非対応 (Capacitor Android のみリリース対象のため)。将来 iOS 対応時に既定値を見直す。
- 完全一致のみサポート: ワイルドカード / 正規表現は要件外。運用者が複数 origin を許可したい場合はカンマ区切りで列挙する。
- ADR 化: しない (実装上の小さな設定変更にとどまり、project.md の前提に触れない)。

## リスク / 代替案

- リスク: 本番デプロイ運用者が `ALLOWED_ORIGINS` 設定を忘れたまま VPS デプロイすると、Web から API へのリクエストが
  CORS エラーで全失敗する可能性。
  - 緩和策: `.env.example` / `setup/server.md` / `deploy-guide.md` に「同一ドメイン配信なら設定不要、別ドメインなら必須」の判断基準を明示する。
  - 緩和策: 同一ドメイン配信 (nginx で `https://todica.example.com` 配下に Web と API を載せる構成) ではブラウザが
    Origin を送らないため `ALLOWED_ORIGINS` の値に関わらず通る (FR-006)。`deploy-guide.md` の標準構成 (6 章) はこのパターンなので
    実運用上の影響は最小化される。
- 代替案: `cors({ origin: allowedOrigins })` に配列を直接渡す (hono/cors は配列もサポート)。
  - 不採用理由: 空配列を渡すと内部の `includes("")` が false になり Origin 無しケースで `null` が返るが、
    挙動が hono/cors の内部実装に依存する。明示的に関数 callback で「空文字は null」を書いた方がテスト時の意図が伝わる。
- 代替案: 環境変数名を `CORS_ALLOWED_ORIGINS` にする。
  - 不採用理由: backlog memo / 既存 doc 記述との一貫性を優先し `ALLOWED_ORIGINS` を採用。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 新規結合テスト `server/__tests__/integration/cors.test.ts` を追加する。
  - `buildTestApp` には `allowedOrigins` を渡せる option を追加する (既定値は spec の既定値と同じ 2 件)。
  - テストケース (受け入れ基準と 1:1 で対応):
    - 既定値: `Origin: http://localhost:5173` の OPTIONS が 204 + `Access-Control-Allow-Origin` 付与。
    - 既定値: `Origin: capacitor://localhost` の OPTIONS が 204 + `Access-Control-Allow-Origin` 付与。
    - 既定値: `Origin: https://evil.example.com` の OPTIONS で `Access-Control-Allow-Origin` 未付与。
    - 明示指定: `allowedOrigins=["https://todica.example.com"]` で `Origin: https://todica.example.com` が許可。
    - 明示指定: `allowedOrigins=["https://todica.example.com"]` で `Origin: http://localhost:5173` が拒否。
    - 複数指定: `allowedOrigins=["https://todica.example.com", "https://staging.example.com"]` で staging が許可。
    - Origin 無し: `Origin` ヘッダなしの `GET /healthz` が 200 を返す。
  - 環境変数のパース処理 (`,` 区切り / トリム / 空要素除去) は `main.ts` のパース関数を export して単体テスト
    `server/__tests__/integration/startup.test.ts` 近傍 (または新規 `cors-env.test.ts`) で検証する。
- 既存の `server/__tests__/integration/*.test.ts` 群は `buildTestApp` の既定値 (= 既定の 2 件) の挙動で
  green を維持することを確認する (テストは Origin ヘッダを付けないので影響を受けないはずだが念のため CI で確認)。
