# 仕様: auth-storage-tests (BL-074 補完: authedFetch / CapacitorAuthStorage 単体テスト)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-078
- 前提: BL-074 (app-login) で導入済の `web/src/auth/` モジュール群

## 背景 / 課題

BL-074 で `web/src/auth/` 配下に Web 用ログイン基盤を導入し,
`WebAuthStorage` / `login-client` / `LoginView` には単体テストが書かれている.
一方で次の 2 つには単体テストが無く, branch 単位の振る舞いが守られていない.

- `web/src/auth/authed-fetch.ts`
  - 認証 token を `Authorization: Bearer` に乗せて `fetch` する薄いラッパ.
  - 401 を捕捉して `currentStorage.clearToken()` を呼び, `todica:auth-expired` Custom Event を
    `window` に dispatch する責務を持つ.
  - 401 hand-off は `app-login-production-path.test.tsx` や BL-076 系の auth-expired テスト群で
    **間接的にしか検証されていない**. `authedFetch` 自身の引数 forwarding / 200 系の透過 /
    非 401 エラーの素通し / `setAuthStorage(null)` 状態での no-op といった分岐は
    回帰時に検出する手段が無い.
- `web/src/auth/auth-storage.ts` の `CapacitorAuthStorage`
  - `@capacitor/preferences` を **dynamic import** して `getToken` / `setToken` / `clearToken` を
    `Preferences.get` / `set` / `remove` に委譲する実装.
  - `Preferences` に渡す key (`"authToken"`) が回帰時に守られない.
  - WebAuthStorage と違い jsdom localStorage で実測できないため `vi.mock` でモジュール置換が必要.

BL-078 は production コード無改修のまま, 上記 2 つに対する単体テストを追加して
分岐レベルのカバレッジを確保するスコープ.

## ゴール / 非ゴール

- ゴール:
  - `web/src/auth/authed-fetch.test.ts` を新規追加し, `authedFetch` の主要分岐 (引数透過 /
    200 透過 / 401 hand-off / 非 401 素通し / storage 未設定時 no-op) を単体カバーする.
  - `web/src/auth/capacitor-auth-storage.test.ts` を新規追加し, `CapacitorAuthStorage` の
    `getToken` / `setToken` / `clearToken` が `vi.mock` した `@capacitor/preferences` の
    `Preferences.get` / `set` / `remove` を正しい key で叩くことを単体カバーする.
  - 既存テスト (1666 件 + 既存 `WebAuthStorage` / `login-client` / `LoginView`) は無改修・回帰なし.
  - typecheck / lint が 0 エラー.
- 非ゴール:
  - production コード (`authed-fetch.ts` / `auth-storage.ts`) の挙動変更.
  - Capacitor 実機 (Android 実機 / エミュレータ) での挙動検証. `vi.mock` 経由の単体検証に閉じる.
  - 既存 `auth-storage.test.ts` (WebAuthStorage 分) の改修.
  - 401 hand-off の結合シナリオ追加 (`app-login-production-path` 等は既存のまま).
  - `createAuthStorage` (Capacitor.isNativePlatform で分岐するファクトリ) の単体テスト.
    実機分岐を mock で再現してもプロダクトの実害が読み取りづらく, スコープ外とする.

## 要件

- 機能要件:
  - `authed-fetch.test.ts` は `setAuthStorage` でモック `AuthStorage` を注入し, `global.fetch` を
    `vi.fn` でモックして `Response` インスタンスを返す方式で `authedFetch` の振る舞いを検証する.
  - `capacitor-auth-storage.test.ts` は `vi.mock("@capacitor/preferences", ...)` で
    `Preferences` をモジュールごと差し替え, `CapacitorAuthStorage` の各メソッド呼び出しが
    `Preferences.get` / `set` / `remove` を正しい引数で呼ぶことを assert する.
  - 両テストファイルとも既存テストの命名規約・コメントスタイル (受け入れ基準への出典明記) に
    倣う.
- 非機能要件:
  - vitest が jsdom 環境で green になること (リポジトリルートから `npx vitest run`).
  - 既存テスト 1666 件 + 新規分すべて green.
  - typecheck (`npm run typecheck` 相当) / lint (`npm run lint` 相当) が 0 エラー.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

### authedFetch (`web/src/auth/authed-fetch.ts`)

```
シナリオ AC-1: 引数透過 (input / init)
  Given setAuthStorage で getToken が "tkn-1" を返す AuthStorage を注入している
   And  global.fetch を vi.fn で mock し 200 Response を返すよう設定している
  When  authedFetch("/api/v1/projects", { method: "POST", body: "x" }) を呼ぶ
  Then  fetch は第 1 引数 "/api/v1/projects" と
        第 2 引数 { method: "POST", body: "x", headers: Authorization=Bearer tkn-1 } を含む形で
        1 回だけ呼ばれている
```

```
シナリオ AC-2: 200 応答の透過
  Given 上記モック構成で fetch が 200 Response を返す
  When  authedFetch を呼ぶ
  Then  返り値の Response.status は 200
   And  currentStorage.clearToken は呼ばれていない
   And  window で "todica:auth-expired" イベントは dispatch されていない
```

```
シナリオ AC-3: 401 → clearToken + auth-expired event dispatch
  Given setAuthStorage で getToken="tkn-1" の AuthStorage を注入している
   And  fetch が 401 Response を返すように mock している
   And  window.addEventListener("todica:auth-expired", spy) を仕掛けている
  When  authedFetch を呼ぶ
  Then  返り値の Response.status は 401
   And  AuthStorage.clearToken が 1 回呼ばれている
   And  "todica:auth-expired" イベントが 1 回 dispatch されている
```

```
シナリオ AC-4: 非 401 エラーは素通し (token 保持 / event 非 dispatch)
  Given setAuthStorage で AuthStorage を注入している
   And  fetch が 500 Response を返すように mock している
   And  "todica:auth-expired" listener を仕掛けている
  When  authedFetch を呼ぶ
  Then  返り値の Response.status は 500
   And  AuthStorage.clearToken は呼ばれていない
   And  "todica:auth-expired" イベントは dispatch されていない
```

```
シナリオ AC-5: setAuthStorage(null) 状態の no-op
  Given setAuthStorage(null) で storage を未設定にしている
   And  fetch が 401 Response を返すように mock している
  When  authedFetch を呼ぶ
  Then  fetch は Authorization ヘッダ無しで呼ばれる
   And  AuthStorage.clearToken の呼び出しは発生しない (storage 自体が null のため)
   And  "todica:auth-expired" イベントは dispatch される
        (clearToken 呼出は storage 有無で条件分岐しても event dispatch は走る現行挙動)
```

```
シナリオ AC-6: getToken が null のとき Authorization 非付与
  Given setAuthStorage で getToken=null を返す AuthStorage を注入している
   And  fetch が 200 Response を返すように mock している
  When  authedFetch を呼ぶ
  Then  fetch は Authorization ヘッダ無しで呼ばれる
   And  返り値の Response.status は 200
```

```
シナリオ AC-7: 呼出側が Authorization を既に設定済みなら上書きしない
  Given setAuthStorage で getToken="tkn-1" を返す AuthStorage を注入している
   And  fetch が 200 Response を返すように mock している
  When  authedFetch("/x", { headers: { Authorization: "Bearer caller-token" } }) を呼ぶ
  Then  fetch に渡る Authorization ヘッダは "Bearer caller-token" のまま
```

### CapacitorAuthStorage (`web/src/auth/auth-storage.ts`)

```
シナリオ AC-8: getToken は Preferences.get({ key: "authToken" }) を呼び value を返す
  Given vi.mock で Preferences.get が { value: "tkn-stored" } を返すよう設定している
  When  new CapacitorAuthStorage().getToken() を呼ぶ
  Then  Preferences.get は { key: "authToken" } 引数で 1 回呼ばれる
   And  返り値は "tkn-stored"
```

```
シナリオ AC-9: getToken は Preferences.get が { value: null } を返したら null を返す
  Given vi.mock で Preferences.get が { value: null } を返すよう設定している
  When  CapacitorAuthStorage.getToken() を呼ぶ
  Then  返り値は null
```

```
シナリオ AC-10: setToken は Preferences.set({ key: "authToken", value: token }) を呼ぶ
  Given vi.mock で Preferences.set を spy 化している
  When  CapacitorAuthStorage.setToken("tkn-new") を呼ぶ
  Then  Preferences.set は { key: "authToken", value: "tkn-new" } で 1 回呼ばれる
   And  subscribe している listener は "tkn-new" で呼ばれる
```

```
シナリオ AC-11: clearToken は Preferences.remove({ key: "authToken" }) を呼ぶ
  Given vi.mock で Preferences.remove を spy 化している
   And  subscribe している listener を仕掛けている
  When  CapacitorAuthStorage.clearToken() を呼ぶ
  Then  Preferences.remove は { key: "authToken" } で 1 回呼ばれる
   And  listener は null で 1 回呼ばれる
```

```
シナリオ AC-12: setToken → getToken の round-trip (mock state 経由)
  Given vi.mock で Preferences が内部 state を保持する形で .set/.get を実装している
  When  CapacitorAuthStorage.setToken("tkn-rt") → getToken() を順に呼ぶ
  Then  getToken の返り値は "tkn-rt"
```

### 共通 (回帰防止)

```
シナリオ AC-13: 既存テストが回帰しない
  Given main から派生した feature ブランチに新規 2 ファイルを追加した状態
  When  リポジトリルートから `npx vitest run` を実行する
  Then  既存テスト + 新規分すべて green である
   And  typecheck は 0 エラー
   And  lint は 0 エラー
```

## 未決事項 / 確認待ち

- なし.
