# 設計・実装計画: env 廃止 + ブラウザからの初期パスワード設定

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md), API は [`../../architecture/api/overview.md`](../../architecture/api/overview.md), DB は [`../../architecture/database/schema.md`](../../architecture/database/schema.md) を参照.

## 方針概要

- **env と seed コードを物理削除する**. `APP_PASSWORD_HASH` 環境変数と `server/src/password-seed.ts` を撤去し, サーバの起動経路から「env から hash を読む」分岐を消す.
- **未初期化状態を 1 級の状態として扱う**. `app_password` が空であることを「起動失敗 (exit 1)」ではなく「初期設定モード」として扱う. クライアントが状態を判別するための専用エンドポイント `GET /api/v1/auth-state` を新設する.
- **初期設定経路を `POST /api/v1/password` に同居させる**. 既存のパスワード変更 API を 2 モードに分岐し, DB 空のときだけ「認証不要 + `currentPassword` 不要 + auto-login token 返却」のフローを許可する. 別エンドポイントを新設せず, 既存の hash 生成 / DB 更新 / sessions 操作のロジックを最大限流用する.
- **クライアントは起動時に 1 回だけ `auth-state` を見る**. 結果に応じて `InitialSetupView` / `LoginView` / 本体のいずれかに分岐する. その後のセッション中に再度 `auth-state` を fetch しない (= 起動時 1 回のスナップショットで十分).
- **`InitialSetupView` は LoginView とは別コンポーネントとして書く**. UI 要件と振る舞いが異なる (現在 PW 欄なし / 確認入力あり / 成功時に自動ログイン / 表示文言が異なる) ため, コンポーネント共有はせず重複を許容する. コード重複の解消は将来 BL に委ねる.

## 既存実装の調査結果

| 項目 | 現状 | 本実装で変更 |
| --- | --- | --- |
| パスワード初期 seed | `server/src/main.ts` で `APP_PASSWORD_HASH` env を読み, `password-seed.ts` の `seedPasswordIfEmpty(repo, envHash, now)` を呼ぶ. seed 後も DB 空なら `process.exit(1)` | env 読み込みと seed 呼び出しを削除. DB 空でも `process.exit(1)` しない. `password-seed.ts` 自体を削除 |
| `GET /api/v1/auth-state` | 存在しない | 新設 (認証不要 / 200 OK / `{ initialized: boolean }`) |
| `POST /api/v1/password` | Bearer 認証必須 + `currentPassword` 必須 + 既存ハッシュとの bcrypt 照合 + 新ハッシュ保存 + sessions 全削除 + 200 OK | 2 モード化. DB 空: 認証不要 + `currentPassword` 不要 + 新ハッシュ保存 + auto-login token 発行 + 200 OK + token 返却. DB あり: 既存仕様を維持 |
| `POST /api/v1/login` | DB hash が `null` のとき 500 INTERNAL_ERROR | DB hash が `null` のとき 412 INITIAL_SETUP_REQUIRED に変更 |
| authMiddleware の素通しパス | `/api/v1/login`, `/healthz`, `/api/` 以外のパス | `/api/v1/auth-state` を素通しに追加. `/api/v1/password` は条件付き素通し (DB 空のときだけ skip) |
| Web 起動時の auth 判定 | `currentMode === "server" && !token && !config.needsSetup` で LoginView 表示 | 起動初期化中に `fetchAuthState(baseUrl)` を呼び, `initialized: false` のときは LoginView ではなく `InitialSetupView` を表示 |
| `web/src/auth/password-client.ts` | `changePassword` のみ | `setupInitialPassword(baseUrl, newPassword)` を追加 |
| `web/src/auth/auth-state-client.ts` | 存在しない | 新設 (`fetchAuthState(baseUrl)`) |
| `web/src/ui/initial-setup-view/` | 存在しない | 新設 (コンポーネント + CSS + テスト) |
| `web/src/main.tsx` | token 有無で LoginView / 本体に分岐 | `initialized` で `InitialSetupView` / `LoginView` / 本体に 3 分岐 |
| Capacitor `SetupView` 完了後の遷移 | `navigate("/", { replace: true })` で LoginView 経路に入る | `auth-state` を見て `InitialSetupView` / `LoginView` を振り分ける |

### 参考実装

- `server/src/app.ts` 既存 `POST /api/v1/login` のトークン発行ロジック (`randomBytes(32).toString("hex")` / `expiresAt = now + 30 day` / `sessionRepository.create({...})`). 初期設定モードでも同等のロジックで auto-login token を払い出す.
- `server/src/app.ts` 既存 `POST /api/v1/password` (`bcrypt.hashSync(newPassword, 12)` / `setHash` / `sessionRepository.deleteAll()`). 初期設定モードでは `deleteAll` は呼ばない (sessions は最初から空のため).
- `web/src/auth/login-client.ts` の専用エラークラス + fetch ラッパの構造. `setupInitialPassword` も同パターンで書く.
- `web/src/ui/login-view/login-view.tsx` の a11y 配線 (`role="alert"` / `aria-busy` / `aria-invalid` / `aria-describedby` / autofocus). `InitialSetupView` も同じパターンで構成する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 新規: `GET /api/v1/auth-state` (認証不要). 既存変更: `POST /api/v1/password` を 2 モード化. `POST /api/v1/login` を DB 空時に 412 INITIAL_SETUP_REQUIRED を返すように変更. |
| DB | 既存スキーマに変更なし. `app_password` テーブルはそのまま使う. |
| サーバ | `server/src/main.ts` から `APP_PASSWORD_HASH` env と seed 呼び出しを削除. `server/src/password-seed.ts` を削除. `server/src/app.ts` の `authMiddleware` / `idempotencyMiddleware` / login / password ハンドラを修正. |
| Web UI | `web/src/auth/auth-state-client.ts` を新設. `web/src/auth/password-client.ts` に `setupInitialPassword` を追加. `web/src/ui/initial-setup-view/` を新設. `web/src/main.tsx` の `App` / `init` に `auth-state` 分岐を組み込む. Capacitor `SetupView` 経路の遷移先も `auth-state` で振り分ける. |
| ドキュメント | `docs/user/deploy-guide.md` / `docs/user/quick-start.md` / `docs/user/faq.md` / `docs/developer/setup/server.md` / `.env.example` 等から `APP_PASSWORD_HASH` 記載を削除し, 「初回アクセスで初期設定」「初回アクセス窓のセキュリティ注意」を追記. `docs/developer/architecture/api/openapi.yaml` に `GET /api/v1/auth-state` と `POST /api/v1/password` の 2 モード分岐を反映. |

## 設計詳細

### サーバ — `main.ts`

- `process.env.APP_PASSWORD_HASH` の参照を削除する.
- `import { seedPasswordIfEmpty } from "./password-seed.js"` を削除する.
- `await seedPasswordIfEmpty(...)` を削除する.
- DB が空かどうかを起動時に確認する分岐 (`if ((await passwordRepository.getHash()) === null) { ... process.exit(1) }`) を削除する.
- `PasswordRepository` は引き続き構築して `createApp` に渡す (経路は変えない).
- `server/src/password-seed.ts` をファイルごと削除する.

### サーバ — `app.ts` (`GET /api/v1/auth-state`)

- ルート: `GET /api/v1/auth-state`.
- 認証: なし (authMiddleware の素通しパスに含める).
- レスポンス: 常に 200 OK. ボディは `{ initialized: boolean }`.
- 実装:
  ```ts
  app.get("/api/v1/auth-state", async (c) => {
    const hash = await deps.passwordRepository.getHash();
    return c.json({ initialized: hash !== null }, 200);
  });
  ```
- `authMiddleware` の早期通過パスに `/api/v1/auth-state` を加える.

### サーバ — `app.ts` (`POST /api/v1/password` の 2 モード分岐)

- 既存ハンドラの先頭で `await deps.passwordRepository.getHash()` を 1 回だけ呼ぶ.
- 結果が `null` (= 初期設定モード) のとき:
  - `authMiddleware` を素通り済みであることを前提とする (= middleware 側でも `/api/v1/password` を「DB 空のときだけ素通し」する分岐を持つ).
  - JSON パースと `newPassword: string` の型検査. 失敗時は 400.
  - `currentPassword` の検査は行わない (受理しても無視).
  - `bcrypt.hashSync(newPassword, 12)` で新ハッシュを生成.
  - `passwordRepository.setHash(newHash, clock.now())` で DB 保存.
  - auto-login token を発行: `randomBytes(32).toString("hex")`, `expiresAt = nowMs + 30 day`, `sessionRepository.create({ token, expiresAt, createdAt: nowMs })`.
  - 200 OK + `{ token, expiresAt }` を返す.
- 結果が非 `null` (= 通常モード) のとき:
  - 既存仕様を維持. `currentPassword` 必須 / Bearer 認証必須 / sessions 全削除 / 200 OK + 空ボディ.

### サーバ — `app.ts` (`authMiddleware` の修正)

- 認証スキップパスの判定を以下に拡張する:
  - 既存: `/api/` 外, `/api/v1/login`.
  - 追加: `/api/v1/auth-state` を常に素通し.
  - 追加: `/api/v1/password` は **DB 空のときだけ** 素通し (`await deps.passwordRepository.getHash() === null`).
- middleware 内で `getHash()` を都度叩くコストが気になる場合は, `password` ハンドラ側で「authMiddleware 通過時にハッシュ取得済み」を仮定せず, ハンドラ側でも再取得して判定する (二重チェック許容).

### サーバ — `app.ts` (`POST /api/v1/login` の 412 分岐)

- 現在: `passwordRepository.getHash()` が `null` のときは 500 INTERNAL_ERROR.
- 変更後: `null` のときは 412 INITIAL_SETUP_REQUIRED を返す.
- レスポンスボディ: `{ code: "INITIAL_SETUP_REQUIRED", message: "initial password setup is required" }`.
- 既存の 400 (body 不正) / 401 (誤パスワード) / 200 (成功) はそのまま.

### サーバ — `idempotencyMiddleware` への影響

- 既存実装で `/api/v1/password` は Idempotency-Key の必須対象外として扱われている. 本 feature でもその扱いを継続する.
- 初期設定モードでは sessions が空のため, race 制御は middleware 側では行わない. アプリケーションは「DB 空 + setHash 成功」を 1 度だけ起こす想定で問題ない. 同時 race の影響は `INSERT OR REPLACE` 系の upsert で結果整合的に最後の書き込みが勝つ.

### Web — `auth-state-client.ts` (新設)

```ts
export interface AuthState {
  initialized: boolean;
}

export async function fetchAuthState(baseUrl: string): Promise<AuthState> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/auth-state`);
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : undefined);
  }
  if (!res.ok) {
    throw new Error(`auth-state failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { initialized?: unknown };
  if (typeof body.initialized !== "boolean") {
    throw new Error("auth-state response missing initialized");
  }
  return { initialized: body.initialized };
}
```

- `NetworkError` は `web/src/auth/login-client.ts` のものを再エクスポート, または独自定義する (実装段階で選択).

### Web — `password-client.ts` (`setupInitialPassword` 追加)

```ts
export async function setupInitialPassword(
  baseUrl: string,
  newPassword: string,
): Promise<{ token: string; expiresAt: number }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/v1/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : undefined);
  }
  if (res.status === 400) {
    throw new BadRequestError();
  }
  if (!res.ok) {
    throw new Error(`initial password setup failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { token?: unknown; expiresAt?: unknown };
  if (typeof body.token !== "string" || typeof body.expiresAt !== "number") {
    throw new Error("setup response missing token or expiresAt");
  }
  return { token: body.token, expiresAt: body.expiresAt };
}
```

- 既存の `changePassword` には触らない.

### Web — `ui/initial-setup-view/initial-setup-view.tsx` (新設)

- Props:
  ```ts
  export interface InitialSetupViewProps {
    setupInitialPassword: (newPassword: string) => Promise<{ token: string; expiresAt: number }>;
    onSetupSuccess: (result: { token: string; expiresAt: number }) => void | Promise<void>;
  }
  ```
- 内部 state: `newPassword`, `confirmPassword`, `error`, `submitting`.
- 送信前バリデーション:
  - 2 入力のいずれかが空なら送信せず, 「すべての項目を入力してください」相当のエラーを表示.
  - 新パスワード !== 確認入力なら送信せず, 「新パスワードと確認入力が一致しません」相当のエラーを表示.
- 送信処理:
  - `setupInitialPassword(newPassword)` を await.
  - `BadRequestError` → 「入力に問題があります」.
  - `NetworkError` → 「サーバに接続できません」.
  - その他のエラー → 「保存に失敗しました」.
  - 成功時に `onSetupSuccess(result)` を呼ぶ.
- DOM 構造:
  ```html
  <main class="initial-setup-view">
    <h1>初期パスワード設定</h1>
    {error && <div role="alert" aria-live="assertive">...</div>}
    <form aria-label="初期パスワード設定フォーム">
      <div class="initial-setup-view__field">
        <label for="initial-setup-new">新しいパスワード</label>
        <input id="initial-setup-new" type="password" autocomplete="new-password" required ... />
      </div>
      <div class="initial-setup-view__field">
        <label for="initial-setup-confirm">新しいパスワード (確認)</label>
        <input id="initial-setup-confirm" type="password" autocomplete="new-password" required ... />
      </div>
      <button type="submit" class="button button--primary" aria-busy={submitting}>設定する</button>
    </form>
  </main>
  ```
- a11y:
  - 初回マウントで新パスワード input に focus.
  - 失敗後にも新パスワード input に focus を戻す.
  - input には `aria-invalid` / `aria-describedby` でエラーと関連付ける.

### Web — `main.tsx` の分岐

- `App` コンポーネントに以下の state を追加する:
  - `authState: { initialized: boolean } | null`. 起動時に 1 回だけ fetch する. `null` は未取得.
- `useEffect` で起動時に `fetchAuthState(baseUrl)` を呼ぶ. 完了したら state を更新する.
  - Capacitor ローカルモード (`currentMode === "local"`) のときは fetch しない. `authState` は `null` のまま無視する.
- レンダリング分岐:
  1. `currentMode === "server"` かつ `authState === null` のとき (まだ取得中): スピナーまたは空表示 (実装段階で最小限).
  2. `currentMode === "server"` かつ `authState?.initialized === false` のとき: `<InitialSetupView setupInitialPassword={...} onSetupSuccess={...} />` を全画面表示する. LoginView は出さない.
  3. `currentMode === "server"` かつ `authState?.initialized === true` かつ `!token` かつ `!needsSetup` のとき: 既存どおり `<LoginView ... />` を全画面表示する.
  4. それ以外: 既存どおり `<Routes>` の本体に入る.
- `onSetupSuccess` の中身:
  - `await authStorage.setToken(result.token)`.
  - `setToken(result.token)`, `setAuthToken(result.token)`.
  - `setAuthState({ initialized: true })` (再 fetch せず, 自己整合的に更新する).
  - `setRepos(buildHttpRepos(baseUrl))`.
  - `navigate("/today", { replace: true })`.
- Capacitor の `SetupView` 完了 (URL 検証 OK) 後は, 既存の `navigate("/", { replace: true })` をそのままにし, `App` 側の分岐 (上の 1〜4) で `auth-state` の結果に応じて自動的に `InitialSetupView` / `LoginView` を切り替える.

### 例外 / エラー処理

- サーバ DB 例外 (`getHash` / `setHash` / `sessions.create`): 500 INTERNAL_ERROR.
- bcrypt.hashSync の例外: 500 INTERNAL_ERROR (DB 書き込み前に発生するため副作用なし).
- クライアント側で `fetchAuthState` が `NetworkError` を投げたとき: 起動時にネットワーク断と判断. 既存の `OfflineBanner` 経路で扱う. `InitialSetupView` への自動遷移はせず, 一旦 LoginView も InitialSetupView も出さずに空表示 + 再試行ボタン (= 実装段階で「再試行ボタンを出す」「単に空のまま」を選ぶ. 本 plan では「空表示で OfflineBanner に任せる」を第一候補とする).

## 重要な決定

- **D-1: env の完全廃止.**
  - `APP_PASSWORD_HASH` env / `password-seed.ts` をリポジトリから物理削除する. `grep` で 0 hit を完了条件とする.
  - 理由: env を「初回 seed 用途のみ」として残す合理性が, DB 永続化 + ブラウザからの初期設定の両立で消滅したため.
- **D-2: `auth-state` の TTL は「起動時 1 回」.**
  - クライアントは起動時に 1 回だけ `fetchAuthState(baseUrl)` を呼び, セッション中はキャッシュ値を使う.
  - 理由: 「未初期化 → 初期化済み」への遷移はセッション内では `InitialSetupView` の送信成功時にしか起きず, その時は自分で `setAuthState({ initialized: true })` で更新できる. 「初期化済み → 未初期化」は運用上ありえない (DB の `app_password` を SSH で `DELETE` した場合のみ. 再現には再読込で十分).
- **D-3: 初期設定モードの `POST /api/v1/password` の認証ガード.**
  - middleware 側で「`/api/v1/password` は DB 空のときだけ skip」を実装する.
  - ハンドラ側でも `getHash()` を再取得し, DB 状態に応じた 2 モード分岐を行う (二重チェック).
  - 理由: middleware のみで判定すると, ハンドラ単体テストで middleware を差し替えた場合に意図しない挙動になりやすい. middleware + ハンドラ両方で判定する方が局所推論しやすい.
- **D-4: 初期設定完了時の auto-login.**
  - login と同じ token 発行ロジック (`randomBytes(32).toString("hex")` / 30 day expiry / `sessionRepository.create`) を初期設定モードでもそのまま使う.
  - 別エンドポイント (例: `POST /api/v1/setup` で auto-login token を返し別途 `/login` を呼ばせる) は採用しない.
  - 理由: 「初期設定 → 自動的にログイン状態に入る」体験を 1 リクエストで完結させる方が CORE-1 (迷わず使える) に沿う.
- **D-5: `POST /api/v1/login` の 412 INITIAL_SETUP_REQUIRED の body 形状.**
  - 既存 `errorJson(c, status, code, message)` を流用し, `{ code: "INITIAL_SETUP_REQUIRED", message: "initial password setup is required" }` を返す.
  - クライアントは現状 `/login` を起動直後に直接叩かない (= `auth-state` を先に見る) ため, 412 を通常体験で踏むパスは無い. ただし古いクライアントが直接 `/login` を叩いた場合の互換性のためにシグナルとして用意する.
- **D-6: race condition (deploy 後の access window) のリスクと対策.**
  - サーバ起動 → 最初にアクセスした人が初期パスワードを設定できる, という性質はアプリ側では塞がない.
  - 理由: アプリ層で「あらかじめ運用者の identity を知る」術がなく, 何らかの対策 (招待コード / pre-shared secret 等) を入れると CORE-1 / project.md の単一ユーザー前提と矛盾する.
  - 対策はドキュメント注意のみ. `docs/user/deploy-guide.md` に「サーバ起動後すぐに自分でアクセスして初期パスワードを設定すること」を明記する.
- **D-7: `InitialSetupView` と `LoginView` のコンポーネント共有.**
  - 別コンポーネントとして書く. CSS / a11y 配線 / submit ロジックは個別に持つ.
  - 理由: 振る舞いが異なる (現在 PW 欄なし / 確認入力あり / 成功時に自動ログイン / 表示文言が異なる) ため, 共有化の利得よりも条件分岐の見通しが悪くなる損失が大きい.
  - 共通化 (例: `PasswordFormFields` のようなサブコンポーネント抽出) は将来 BL に委ねる.
- **D-8: Capacitor `SetupView` 経路の動作.**
  - `SetupView` (URL 入力 + `/healthz` 検証) 完了後は, 既存の `navigate("/", { replace: true })` 動作を維持する.
  - そこから `App` 側の `auth-state` 分岐が走り, `InitialSetupView` か `LoginView` に振り分けられる.
  - Capacitor 側に Capacitor 専用の初期設定経路を新設しない.

## リスク / 代替案

- **リスク 1: deploy 後の access window で第三者が初期パスワードを取られる.**
  - 影響: パスワードを書き換えるまでの数十秒〜数分の間に, Certificate Transparency 等で新規ドメインを観測している第三者がアクセスする可能性.
  - 緩和策: ドキュメント注意 (D-6). アプリ側の追加対策はしない.
- **リスク 2: `POST /api/v1/password` の 2 モード分岐で middleware と handler の状態判定がズレる.**
  - 影響: middleware は「DB 空」と判断したが, ハンドラに着くまでに別リクエストが先に setHash してしまうケース.
  - 緩和策: ハンドラ側でも `getHash()` を取り直して再判定する (D-3 の二重チェック). 後勝ちで結果整合に収束する.
- **代替案: 初期設定モード専用エンドポイントを別に立てる (`POST /api/v1/setup`).**
  - 利点: middleware の skip 条件が単純になる.
  - 欠点: 同じ「app_password に hash を書く」操作が 2 エンドポイントに分散し, hash 生成 / sessions 操作のコードが重複する. ルーティングの整理コストもかかる.
  - 本 plan では採用しない.

## 段階分割

- **Step 1: env と seed の物理削除.**
  - `server/src/main.ts` から `APP_PASSWORD_HASH` 読み込み / `seedPasswordIfEmpty` 呼び出し / DB 空時 exit を削除.
  - `server/src/password-seed.ts` を削除.
  - 既存テスト `server/__tests__/integration/password-seed.test.ts` 等を本 feature の新規テストに置き換える (= 削除 + 新規追加).
  - AC-1 / AC-2 をカバー.
- **Step 2: `GET /api/v1/auth-state` の新設.**
  - `app.ts` の `authMiddleware` の素通しパスに `/api/v1/auth-state` を追加.
  - `GET /api/v1/auth-state` ハンドラを追加.
  - AC-3 / AC-4 をカバー.
- **Step 3: `POST /api/v1/login` の 412 分岐.**
  - DB 空のとき 412 INITIAL_SETUP_REQUIRED を返す.
  - AC-7 をカバー.
- **Step 4: `POST /api/v1/password` の 2 モード分岐.**
  - middleware の skip 条件に「DB 空のときの `/api/v1/password`」を追加.
  - ハンドラ側で DB 空時の経路 (認証不要 / `currentPassword` 無視 / 新 hash 保存 / auto-login token 発行) を実装.
  - 既存の DB あり時の経路は維持.
  - AC-5 / AC-6 をカバー.
- **Step 5: Web クライアントモジュールの追加.**
  - `web/src/auth/auth-state-client.ts` を新設.
  - `web/src/auth/password-client.ts` に `setupInitialPassword` を追加.
- **Step 6: `InitialSetupView` コンポーネントの新設.**
  - `web/src/ui/initial-setup-view/` 配下にコンポーネント + CSS + テストを追加.
  - AC-10 / AC-11 をカバー.
- **Step 7: `main.tsx` の分岐組み込み.**
  - `App` に `authState` state と `fetchAuthState` の useEffect を追加.
  - レンダリング分岐 (InitialSetupView / LoginView / 本体) を組み込む.
  - `onSetupSuccess` で token 保存 + `/today` 遷移.
  - AC-8 / AC-9 / AC-12 / AC-13 / AC-14 をカバー.
- **Step 8: ドキュメント更新.**
  - `docs/user/deploy-guide.md` / `quick-start.md` / `faq.md` / `docs/developer/setup/server.md` / `.env.example` などから env 記載を削除.
  - 「初回アクセスで初期設定」とセキュリティ注意 (D-6) を追記.
  - `docs/developer/architecture/api/openapi.yaml` に `auth-state` と `POST /api/v1/password` の 2 モードを反映.
  - AC-15 をカバー.

## 変更ファイル表

| ファイル | 変更種別 | 主な変更 |
| --- | --- | --- |
| `server/src/main.ts` | 編集 | `APP_PASSWORD_HASH` 読み込み / `seedPasswordIfEmpty` 呼び出し / DB 空時 exit を削除 |
| `server/src/password-seed.ts` | 削除 | ファイルごと撤去 |
| `server/src/app.ts` | 編集 | `authMiddleware` に `/api/v1/auth-state` 素通しと条件付き `/api/v1/password` 素通しを追加. `GET /api/v1/auth-state` ハンドラ追加. `POST /api/v1/login` を 412 INITIAL_SETUP_REQUIRED 分岐に修正. `POST /api/v1/password` を 2 モード分岐に修正 |
| `web/src/auth/auth-state-client.ts` | 新規 | `fetchAuthState(baseUrl)` |
| `web/src/auth/password-client.ts` | 編集 | `setupInitialPassword(baseUrl, newPassword)` を追加 |
| `web/src/ui/initial-setup-view/initial-setup-view.tsx` | 新規 | コンポーネント本体 |
| `web/src/ui/initial-setup-view/initial-setup-view.css` | 新規 | 最小スタイル (login-view.css 相当) |
| `web/src/main.tsx` | 編集 | `authState` state + `fetchAuthState` useEffect + 3 分岐レンダリング + `onSetupSuccess` 結線 |
| `docs/user/deploy-guide.md` | 編集 | env 記載削除 + 初回アクセス窓のセキュリティ注意 |
| `docs/user/quick-start.md` | 編集 | env 記載削除 + 初回ブラウザアクセスで初期設定するフローに更新 |
| `docs/user/faq.md` | 編集 | パスワード忘れ時の復旧手順を「app_password を DELETE → 再ブラウザアクセス」に更新 |
| `docs/developer/setup/server.md` | 編集 | env 記載削除 |
| `.env.example` | 編集 | `APP_PASSWORD_HASH` の行を削除 |
| `docs/developer/architecture/api/openapi.yaml` | 編集 | `GET /api/v1/auth-state` 追加. `POST /api/v1/password` の 2 モードと 412 INITIAL_SETUP_REQUIRED を反映 |

## 既存資産流用

- **login の token 発行ロジック**: `randomBytes(32).toString("hex")` / `expiresAt = now + 30 day` / `sessionRepository.create({...})` の 4 行を初期設定モードでも再利用する.
- **既存パスワード変更ロジック (`POST /api/v1/password`)**: `bcrypt.hashSync(newPassword, 12)` + `setHash` の流れをそのまま流用. DB 空時は `sessionRepository.deleteAll()` を呼ばないだけが差分.
- **LoginView の a11y 配線**: `role="alert"` / `aria-busy` / `aria-invalid` / `aria-describedby` / autofocus / 失敗後の input フォーカス戻しの 6 つを `InitialSetupView` でも踏襲する.
- **`web/src/auth/login-client.ts` の `NetworkError` / `InvalidPasswordError` 形**: `auth-state-client.ts` と `setupInitialPassword` でも同じ形を使う.
- **`web/src/main.tsx` の `App` の token 管理 (`authStorage.setToken` / `setToken` / `setAuthToken`)**: 初期設定成功時の `onSetupSuccess` から同じセットを呼び出して整合させる.

## スコープ境界

- パスワード強度ポリシー / パスワード履歴 / 多要素認証 / メール経由のリセットは実装しない.
- マルチユーザー対応は行わない. `app_password` は singleton のまま.
- Capacitor ローカルモード (`mode === "local"`) は本 feature の対象外. ローカルモードは認証を持たないため `auth-state` を fetch しない.
- `/api/v1/logout` の挙動は変えない.
- `app_password` テーブルのスキーマ / マイグレーションは変更しない.
- アプリ層での「最初にアクセスした人だけが初期設定できる」レース対策 (招待コード / pre-shared secret 等) は導入しない (D-6).

## 非機能 / a11y

- `InitialSetupView` の DOM 構造と a11y 配線は spec.md §NFR-IPS-3 / plan.md §「Web — `ui/initial-setup-view/initial-setup-view.tsx` (新設)」のとおり.
- input の `autocomplete` は両方とも `new-password` を指定する. ブラウザのパスワード管理に「新規パスワード保存」として認識させる.
- 送信中は `aria-busy="true"` を付与し, 二重押下を抑止する.
- エラー領域は `role="alert"` + `aria-live="assertive"` で読み上げる.
- 初回マウントで新パスワード input に focus する. 失敗後にも focus を戻す.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md). 本 feature では以下の層で検証する.

### サーバ単体テスト

- `GET /api/v1/auth-state`:
  - AC-3: DB 空で 200 OK + `{ initialized: false }`.
  - AC-4: DB ありで 200 OK + `{ initialized: true }`.
- `POST /api/v1/password` (初期設定モード):
  - AC-5: 認証ヘッダなし + `{ newPassword: "P0" }` で 200 OK + `{ token, expiresAt }`. DB に hash が書かれ, sessions に token が INSERT される.
  - 200 後に再度 `POST /api/v1/password` (Bearer なし) を叩くと, 今度は通常モードに入って 401 を返す.
  - 400 INVALID_REQUEST_BODY: 初期設定モードでも `newPassword` が文字列でない / JSON パース失敗 → 400.
- `POST /api/v1/password` (通常モード):
  - AC-6: DB ありで Bearer ヘッダなし → 401. DB の hash は変わらない.
  - 既存の AC-2 / AC-3 (password-change feature) は引き続き green.
- `POST /api/v1/login`:
  - AC-7: DB 空で `{ password: "anything" }` → 412 INITIAL_SETUP_REQUIRED. sessions に INSERT されない.
  - 既存の DB あり時の 200 / 401 / 400 は維持.

### サーバ起動テスト

- AC-1: `APP_PASSWORD_HASH` 環境変数なし + DB 空でプロセスを起動し, `/healthz` が 200 OK を返すことを確認.
- AC-2: ソースツリー (`server/src/**/*.ts`) に対する `grep -r "APP_PASSWORD_HASH"` のヒット数が 0 であることを CI または単体で確認.

### Web UI テスト (Vitest + React Testing Library)

- `InitialSetupView`:
  - AC-10: 新パスワード != 確認入力で送信ボタンを押すと `setupInitialPassword` が呼ばれない + `role="alert"` にエラー表示.
  - AC-11: 入力が空のまま送信ボタンを押すと `setupInitialPassword` が呼ばれない.
  - 正常系: 一致する 2 入力で送信ボタンを押すと `setupInitialPassword` が呼ばれ, resolve で `onSetupSuccess` が呼ばれる.
  - エラー系: `BadRequestError` / `NetworkError` / その他で対応するエラー文言が表示される.
  - a11y: input に `autocomplete="new-password"` / `aria-invalid` が正しく付く.

### Web 結線テスト (`main.tsx` 周辺)

- AC-8: `fetchAuthState` が `{ initialized: false }` を返すと `InitialSetupView` が描画される. LoginView は描画されない.
- AC-9: `InitialSetupView` の `onSetupSuccess` が呼ばれると, `authStorage.setToken` + state 更新 + `/today` 遷移が走る.
- AC-12: `fetchAuthState` が `{ initialized: true }` を返し token が無いと LoginView が描画される.
- AC-13: `fetchAuthState` が `{ initialized: true }` を返し token があると本体が直接描画される.
- AC-14: Capacitor の `SetupView` 完了 (`navigate("/")`) 後に同じ `auth-state` 分岐に乗ることを確認.

### ドキュメント検査

- AC-15: `docs/user/deploy-guide.md` に「サーバ起動後, 最初に URL に到達したユーザーが初期パスワード設定者となる」旨の注意が記載されていることを確認.

## 未決事項 / 確認待ち

なし.
