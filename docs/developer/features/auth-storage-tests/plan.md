# 設計・実装計画: auth-storage-tests

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

production コード (`web/src/auth/authed-fetch.ts` / `web/src/auth/auth-storage.ts`) は無改修.
新規 2 テストファイルのみ追加して BL-074 の auth モジュールの分岐カバレッジを確保する.
`authedFetch` は `setAuthStorage` で mock storage を注入し `global.fetch` を `vi.fn` で差し替える.
`CapacitorAuthStorage` は `@capacitor/preferences` を `vi.mock` でモジュールごと置換する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| モジュール (production) | 変更なし (`authed-fetch.ts` / `auth-storage.ts` 共に touch しない) |
| モジュール (テスト) | `web/src/auth/authed-fetch.test.ts` 新規 / `web/src/auth/capacitor-auth-storage.test.ts` 新規 |
| UI | 変更なし |
| CI / build | 変更なし (既存の vitest / typecheck / lint フローに乗る) |

### 変更ファイル表

| 種別 | パス | 概要 |
| --- | --- | --- |
| 新規 | `web/src/auth/authed-fetch.test.ts` | `authedFetch` 単体テスト (AC-1〜AC-7) |
| 新規 | `web/src/auth/capacitor-auth-storage.test.ts` | `CapacitorAuthStorage` 単体テスト (AC-8〜AC-12) |
| 新規 | `docs/developer/features/auth-storage-tests/spec.md` | 本仕様 |
| 新規 | `docs/developer/features/auth-storage-tests/plan.md` | 本計画 (この文書) |
| 新規 | `docs/developer/features/auth-storage-tests/tasks.md` | タスク分解 |
| 改修 | (なし) | production コード / 既存テストは無改修 |

## 設計詳細

### `web/src/auth/authed-fetch.test.ts` の構成

- 配置: `web/src/auth/authed-fetch.test.ts` (production ファイルと同居. 既存テストの慣習に従う).
- import:
  - `vitest` から `afterEach` / `beforeEach` / `describe` / `expect` / `it` / `vi`.
  - production から `AUTH_EXPIRED_EVENT` / `authedFetch` / `setAuthStorage` を import.
  - `AuthStorage` 型を type-only import.
- セットアップ:
  - `beforeEach`:
    1. `vi.restoreAllMocks()` で前テストの spy をクリア.
    2. `global.fetch` を `vi.fn()` で差し替える (各テストで `mockResolvedValue` を上書き).
    3. mock storage (`getToken` / `setToken` / `clearToken` / `subscribe` を持つ object) を生成し
       `setAuthStorage(mockStorage)` で注入する. `getToken` は `vi.fn().mockResolvedValue("tkn-1")`
       のように個別テストで上書き可能とする.
  - `afterEach`:
    1. `setAuthStorage(null)` で次テストへの漏れを防ぐ.
    2. `vi.unstubAllGlobals()` / `vi.restoreAllMocks()` で global.fetch を戻す
       (`vi.stubGlobal("fetch", ...)` を使う場合は `unstubAllGlobals`).
- Response 生成: `new Response(JSON.stringify({}), { status: 200 })` の形で `vi.fn().mockResolvedValue` に渡す.
- 401 イベント観測:
  - `window.addEventListener(AUTH_EXPIRED_EVENT, spy)` で spy を仕掛け, `afterEach` で
    `window.removeEventListener` する.
- assert スタイル: 既存 `auth-storage.test.ts` / `login-client.test.ts` のコメント形式
  (`(AC-N)` を test 名末尾に付ける) を踏襲.

### `web/src/auth/capacitor-auth-storage.test.ts` の構成

- 配置: `web/src/auth/capacitor-auth-storage.test.ts`.
  既存 `auth-storage.test.ts` は WebAuthStorage 専用なのでファイル分離する (D-6 参照).
- import:
  - `vitest` から `beforeEach` / `describe` / `expect` / `it` / `vi`.
  - production から `CapacitorAuthStorage` を import.
- モジュールモック:
  - ファイル先頭で `vi.mock("@capacitor/preferences", () => ({ Preferences: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } }))` を宣言.
  - 各 test 内で `const { Preferences } = await import("@capacitor/preferences");` で spy を取得し,
    `mockResolvedValue` で個別シナリオの返り値を組む.
- セットアップ:
  - `beforeEach` で `vi.clearAllMocks()` (D-5).
- round-trip (AC-12) シナリオでは module-scoped な変数 (例: `let storedValue: string | null = null;`)
  を `Preferences.set` mock 内で更新し, `Preferences.get` mock がそれを返す形で実装する.

### 重要な決定 (D-1〜D-6)

- **D-1: 1 PR / 1 commit (test 追加のみ)**
  BL-078 はテスト追加のみのスコープ. PR は `feature/auth-storage-tests` 単一ブランチで切り,
  commit も 1 件 (`test(auth-storage-tests): ...`) でまとめる. production 改修と混ぜない.
- **D-2: production コード無改修方針**
  `authed-fetch.ts` / `auth-storage.ts` は touch しない. 既存テスト群との衝突や挙動差分を防ぐ.
  もし `vi.mock` で動的 import を mock しきれない問題が出た場合でも, production の dynamic import
  パターン (`await import("@capacitor/preferences")`) はそのまま残し, テスト側で対応する.
- **D-3: `authedFetch` の 401 hand-off の既存間接テストとの重複は受容**
  `app-login-production-path.test.tsx` や BL-076 系の auth-expired テストでも 401 hand-off は
  間接検証されている. 今回 AC-3 で `authedFetch` 単位の直接検証を追加するが, この重複は
  「単体カバー欠落の解消」というスコープゴール優先で受容する. 既存テストの整理は別 BL.
- **D-4: `CapacitorAuthStorage` の export 状態**
  `web/src/auth/auth-storage.ts` 27 行付近で `export class CapacitorAuthStorage extends BaseAuthStorage`
  となっており **既に export 済み**. 「テスト用 export 追加」は不要. もし将来 export を絞る変更が
  入った場合に限り spec / plan を改訂しテスト用 export 追加を許容する (現時点では発生しない).
- **D-5: `vi.mock` の reset 戦略**
  `beforeEach` で `vi.clearAllMocks()` を呼び, 各テストで `mockResolvedValue` / `mockResolvedValueOnce` を
  個別に組む. round-trip シナリオでは module-scoped state も同 hook で初期化する.
- **D-6: Capacitor 用テストはファイル分離**
  既存 `auth-storage.test.ts` は jsdom localStorage 前提で `vi.mock` を一切使っていない.
  そこに `vi.mock("@capacitor/preferences", ...)` を足すと WebAuthStorage 側の test に副作用が
  乗るリスクがあるため, `capacitor-auth-storage.test.ts` として別ファイルで切る.
  (`vi.mock` の hoisting がファイル単位で閉じる挙動を活かす.)

### 処理フロー / シーケンス

#### authedFetch (production 側. 確認用に整理)

```
caller → authedFetch(input, init)
  → headers = new Headers(init.headers)
  → if currentStorage:
       token = await currentStorage.getToken()
       if token && !headers.has("Authorization"):
         headers.set("Authorization", `Bearer ${token}`)
  → res = await fetch(input, { ...init, headers })
  → if res.status === 401:
       if currentStorage: await currentStorage.clearToken()
       if window: window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  → return res
```

テスト側はこのフローを分岐網羅する形で各 AC を 1 つの `it(...)` に対応させる.

#### CapacitorAuthStorage (production 側)

```
getToken:
  Preferences = await import("@capacitor/preferences").Preferences
  { value } = await Preferences.get({ key: "authToken" })
  return value ?? null

setToken(token):
  Preferences = await import(...)
  await Preferences.set({ key: "authToken", value: token })
  notify(token)

clearToken:
  Preferences = await import(...)
  await Preferences.remove({ key: "authToken" })
  notify(null)
```

### 例外 / エラー処理

- `global.fetch` を mock した状態で `mockRejectedValue(new Error(...))` を投げるケースは
  本スコープでは扱わない (現行 `authedFetch` 自身はネットワーク例外を捕捉しないため,
  fetch 例外はそのまま caller (Repository) に伝播する. これは BL-074 の Repository 層
  テストで間接検証済).
- `Preferences.get` が reject するケースは扱わない (実機分岐の検証範囲外).

## リスク / 代替案

- リスク 1: `vi.mock("@capacitor/preferences", ...)` の hoisting が他テストに干渉する.
  - 緩和策: D-6 のとおりファイル分離する. `auth-storage.test.ts` 側に副作用が乗らないよう
    `capacitor-auth-storage.test.ts` を独立ファイルにする.
- リスク 2: `global.fetch` の差し替え戦略違いで他テストに漏れる.
  - 緩和策: `afterEach` で `vi.unstubAllGlobals()` / `vi.restoreAllMocks()` を呼ぶ.
- リスク 3: dynamic import の mock が解決できない (`vi.mock` のスコープミス).
  - 緩和策: ファイル先頭で `vi.mock` を宣言. test 内では `await import("@capacitor/preferences")` で
    spy を取得する. 既存 vitest 環境 (jsdom + ESM) で同パターンの動作実績を確認する.
- 代替案 (採用しない): `CapacitorAuthStorage` の dynamic import を constructor 注入に変更して
  mock を簡素化する案. D-2 (production 無改修方針) と矛盾するため採用しない.
- 代替案 (採用しない): MSW で 401 を再現して authedFetch を結合テスト化する案. 単体カバレッジ
  欠落の解消というスコープゴールに対しオーバーキル. 既存 `login-client.test.ts` で MSW パターンは
  整備済だが authedFetch では `vi.fn` + Response 直返しで十分.

## スコープ境界

- 含む: 新規 2 テストファイル / 本 features 配下の 3 文書 (spec / plan / tasks).
- 含まない:
  - production コード (`authed-fetch.ts` / `auth-storage.ts`) の改修.
  - 既存 `auth-storage.test.ts` (WebAuthStorage 分) の改修.
  - Capacitor 実機 / Android エミュレータでの挙動検証.
  - `createAuthStorage` ファクトリの単体テスト.
  - 401 hand-off の結合テスト追加 (既存の `app-login-production-path.test.tsx` を活かす).
  - BL-076 系 auth-expired ハンドラ周りの改修.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

- レイヤ: 単体テスト (vitest, jsdom 環境).
- 実行: リポジトリルートから `npx vitest run` (`project_vitest_run_location` メモに従う).
- カバー粒度:
  - `authedFetch`: AC-1〜AC-7 を 1 AC = 1 `it(...)` で対応させる. test 名末尾に `(AC-N)` を付ける.
  - `CapacitorAuthStorage`: AC-8〜AC-12 を 1 AC = 1 `it(...)` で対応させる.
- 既存テストとの分離: `vi.mock` を使う Capacitor テストはファイル分離 (D-6).
- 受け入れ判定: 新規 2 ファイル + 既存 1666 件すべて green. typecheck / lint 0 エラー.

## 未決事項

- なし.
