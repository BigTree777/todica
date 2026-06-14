# 仕様: サーバ CORS の origin 許可リスト化 (cors-origin-allowlist)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-086

## 背景 / 課題

`server/src/app.ts` の `cors({ origin: "*", allowHeaders: [..., "Authorization", ...] })`
は全 origin に対して Authorization ヘッダの送信を許可している。
Bearer トークンを `localStorage` (Web) / `@capacitor/preferences` (Android) に保管するクライアント構成では,
トークン有効期間中に悪意あるサイトを開かれた場合、そのサイトの JS から
`fetch("https://todica.example.com/api/...", { headers: { Authorization: "Bearer ..." } })` を発行する preflight が
標準で 204 を返してしまう (実際の Authorization ヘッダは攻撃者が知り得ないが、XSS 等で漏れた token を
他オリジンから利用できる経路を不必要に広げている)。

`docs/developer/project.md` は単一ユーザ本人運用を前提とするものの、
デフォルトで「全 origin × Authorization 許可」は過剰であり、本番デプロイ運用者が origin を絞れる設定点を提供したい。

## ゴール / 非ゴール

- ゴール:
  - 環境変数 `ALLOWED_ORIGINS` (カンマ区切り) を新設し、本番運用者が明示的に許可する origin を完全一致で指定できるようにする。
  - 未指定時の既定挙動として、dev (Vite `http://localhost:5173`) と Capacitor (`capacitor://localhost`) を許可する。
  - 同一オリジン配信 (nginx で Web と API を同一ドメインに載せる構成) を引き続き素通りで支える。
  - 既存の認証フロー (sessions / Bearer) には触れない。
- 非ゴール:
  - 認証方式の変更 (Cookie 化 / SameSite 化 / CSRF token 導入)。
  - allowHeaders / exposeHeaders / maxAge の見直し (現状値を維持)。
  - ワイルドカード (`*.example.com` / 正規表現) のサポート。完全一致のみ。
  - `Access-Control-Allow-Credentials: true` の付与 (Bearer 運用なので不要)。
  - 動的な許可リスト更新 (DB / API での書き換え)。プロセス起動時の環境変数で固定する。

## 要件

### 機能要件

- FR-001: `ALLOWED_ORIGINS` 環境変数が未定義または空文字のとき、CORS 許可 origin の既定値は
  `http://localhost:5173` (Vite dev) と `capacitor://localhost` (Capacitor Android) の 2 件である。
- FR-002: `ALLOWED_ORIGINS` が定義されているとき、カンマ区切りで分割し各要素を前後トリムした結果を許可 origin リストとする。
  空要素は無視する。
- FR-003: 許可 origin リストとの判定は完全一致 (case sensitive。`Origin` ヘッダの値そのままと文字列等価) で行う。
- FR-004: `Origin` ヘッダが許可 origin リストに含まれるとき、レスポンスに `Access-Control-Allow-Origin: <その origin>` を付ける。
- FR-005: `Origin` ヘッダが許可 origin リストに含まれないとき、`Access-Control-Allow-Origin` を付けない (ブラウザ側で CORS エラーとなる)。
- FR-006: `Origin` ヘッダが存在しない (同一オリジンからの fetch / curl 等の non-browser クライアント) リクエストは
  `Access-Control-Allow-Origin` の付与有無に関わらずアプリケーション層まで到達する (ブラウザ判定は走らないため実害が無い)。
- FR-007: `allowHeaders` / `exposeHeaders` / `maxAge` は現状値 (`["Content-Type", "Authorization", "Idempotency-Key", "If-Match"]`
  / `["ETag"]` / `600`) を維持する。
- FR-008: `GET /healthz` を含め、CORS ミドルウェアの適用範囲は現状と同じ全パス (`app.use("*", ...)`) を維持する。

### 非機能要件

- NFR-001 (セキュリティ): 全 origin に対する Authorization 許可をやめ、デフォルトで dev / Capacitor のみに絞ることで
  本番デプロイ時のクロスオリジン経路の既定値を最小化する。
- NFR-002 (運用): `.env.example` / `docs/developer/setup/server.md` / `docs/user/deploy-guide.md` の 3 箇所に
  `ALLOWED_ORIGINS` の意味と本番での設定例を記載する。運用者が `.env` を読むだけで設定方法が分かる状態を維持する。
- NFR-003 (互換性): 既存の結合テスト (`server/__tests__/integration/*.test.ts` 群) が同一の挙動で green を維持する。

## 受け入れ基準

```
シナリオ: ALLOWED_ORIGINS 未指定で Vite dev origin が許可される
  Given ALLOWED_ORIGINS が未定義
  When  Origin: http://localhost:5173 を付けて OPTIONS /api/v1/tasks を投げる
  Then  レスポンスは 204 を返す
  And   Access-Control-Allow-Origin: http://localhost:5173 がレスポンスヘッダに含まれる

シナリオ: ALLOWED_ORIGINS 未指定で Capacitor origin が許可される
  Given ALLOWED_ORIGINS が未定義
  When  Origin: capacitor://localhost を付けて OPTIONS /api/v1/tasks を投げる
  Then  レスポンスは 204 を返す
  And   Access-Control-Allow-Origin: capacitor://localhost がレスポンスヘッダに含まれる

シナリオ: ALLOWED_ORIGINS 未指定で未許可 origin が拒否される
  Given ALLOWED_ORIGINS が未定義
  When  Origin: https://evil.example.com を付けて OPTIONS /api/v1/tasks を投げる
  Then  Access-Control-Allow-Origin はレスポンスヘッダに含まれない

シナリオ: ALLOWED_ORIGINS で本番 origin を指定すると当該 origin が許可される
  Given ALLOWED_ORIGINS=https://todica.example.com
  When  Origin: https://todica.example.com を付けて OPTIONS /api/v1/tasks を投げる
  Then  Access-Control-Allow-Origin: https://todica.example.com がレスポンスヘッダに含まれる

シナリオ: ALLOWED_ORIGINS で本番 origin を指定すると dev origin は拒否される
  Given ALLOWED_ORIGINS=https://todica.example.com
  When  Origin: http://localhost:5173 を付けて OPTIONS /api/v1/tasks を投げる
  Then  Access-Control-Allow-Origin はレスポンスヘッダに含まれない

シナリオ: ALLOWED_ORIGINS にカンマ区切りで複数 origin を並べる
  Given ALLOWED_ORIGINS=https://todica.example.com, https://staging.example.com
  When  Origin: https://staging.example.com を付けて OPTIONS /api/v1/tasks を投げる
  Then  Access-Control-Allow-Origin: https://staging.example.com がレスポンスヘッダに含まれる

シナリオ: Origin ヘッダ無しの同一オリジン / curl リクエストは素通りする
  Given ALLOWED_ORIGINS=https://todica.example.com
  When  Origin ヘッダ無しで GET /healthz を投げる
  Then  レスポンスは 200 OK を返す
```

## 未決事項 / 確認待ち

- `Origin` ヘッダの値が空文字で来た場合 (Hono は内部で `c.req.header("origin") || ""` と空文字 fallback する) の扱い:
  - 採用案: 空文字は「Origin 無し相当」とみなし、許可 origin リストの判定対象から外す (= `Access-Control-Allow-Origin` を付けない)。
    同一オリジン fetch ではそもそもブラウザが Origin を送らないため、空文字を素直に未許可扱いしても実害が無い。
- backlog memo の「preflight を 403 にする」は採用しない:
  - 採用案: hono/cors の標準動作 (許可外 origin にはヘッダを付けず 204 を返す → ブラウザ側で CORS エラー) を踏襲する。
    アプリ層で 403 に書き換える追加実装は入れない。
- backlog memo の「同一オリジン = origin == host を許可する」専用ロジックは採用しない:
  - 採用案: 同一オリジン fetch はブラウザが Origin ヘッダを送らないので、FR-006 (Origin 無しは素通り) で自然に成立する。
    Host ヘッダとの比較ロジックは入れない (Host 偽装の余地を増やすデメリットの方が大きい)。
