# 仕様: 残り 4 本 HTTP Repository を `authedFetch` 経由に統一

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-076
- 依存元: BL-074 (app-login / `authedFetch` 導入)

## 背景 / 課題

BL-074 で導入した `web/src/auth/authed-fetch.ts` は 401 応答を捕捉した時点で `auth-storage.clearToken()` を呼び出し, `todica:auth-expired` Custom Event を `window` に dispatch する仕組みである. `AppWithAuth` 側の listener が当該イベントを受けて LoginView に戻すことで「期限切れ token をユーザに体感させない」運用を実現する.

しかし BL-074 監査時のスコープ調整により, `authedFetch` への移行は `HttpTaskRepository` 1 本のみで完了し, 残り 4 本 (`HttpSettingsRepository` / `HttpProjectRepository` / `HttpRoutineRepository` / `HttpTrashRepository`) は生 `fetch` 直叩きのまま残った. これにより以下の挙動不揃いが本番で発生している.

- TaskRepository を経由する今日ビューでは, 期限切れ token で API を叩くと自動的に LoginView へ戻る (AC-4 production 経路が成立している).
- 一方プロジェクト一覧 / 設定 / ルーティン / ゴミ箱の各ビューでは, 同じ期限切れ token で API を叩いても 401 が単なるエラー通知として表示されるだけで, token は localStorage / Preferences に残り続け, リロードしてもログイン状態が継続しているように振る舞う.

この不整合は「ビューによって挙動が異なる」というユーザ体験の劣化と, 「期限切れ token が掃除されない」というセキュリティ衛生上の弱点を同時に生んでいる. 本 BL では残り 4 本も `HttpTaskRepository` と同じパターンで `authedFetch` 経由に切り替え, 全 5 本で 401 → token 破棄 + LoginView 復帰の振る舞いを揃える.

加えて, BL-074 で `HttpTaskRepository.constructor` の `authToken` 引数は後方互換のため optional unused のまま残されている. 本 BL では 4 本の移行と同時に, 全 5 本の constructor から `authToken` を撤去し, `main.tsx` の生成箇所も整理する.

## ゴール / 非ゴール

- ゴール:
  - `HttpSettingsRepository` / `HttpProjectRepository` / `HttpRoutineRepository` / `HttpTrashRepository` の全 fetch 呼び出しを `authedFetch` 経由に切り替える.
  - 上記 4 本と `HttpTaskRepository` の calc 5 本すべての constructor 引数から `authToken` を撤去する.
  - 4 本それぞれについて, 401 応答を引き当てたときに `auth-storage.clearToken()` と `todica:auth-expired` イベント dispatch が発火することを単体テストで担保する.
  - 既存 Repository 単体テスト 4 ファイルを `setAuthStorage` + `WebAuthStorage` で auth storage に token を seed するパターンに統一する.
- 非ゴール:
  - ローカルモード Repository (BL-020 `LocalSettingsRepository` / `LocalProjectRepository` / `LocalRoutineRepository` / `LocalTrashRepository` / `LocalTaskRepository`) には触れない. 本 BL は HTTP 経路の Repository のみが対象.
  - 既存 API のエンドポイントパス / HTTP method / リクエスト body / レスポンス型などの仕様は一切変更しない (`server/` 側の改修は無い).
  - domain 層 / server 層 / SetupView / SettingsView / RoutinesView / ProjectsView / TrashView / `AppWithAuth` の UI 配線には触れない.
  - 401 以外のエラー (4xx / 5xx) のハンドリング方針は既存のまま (本 BL のスコープ外).
  - shadow / hover / transition / animation / a11y 表現は無変更.

## 要件

### 機能要件

- **FR-1 / settings**: `HttpSettingsRepository` の `getSettings` / `patchSettings` が `authedFetch` 経由でリクエストを送る. 401 を受けた時点で `auth-storage.clearToken()` + `todica:auth-expired` dispatch が発火する.
- **FR-2 / project**: `HttpProjectRepository` の `list` / `create` / `update` / `delete` が `authedFetch` 経由でリクエストを送る. 401 を受けた時点で `auth-storage.clearToken()` + `todica:auth-expired` dispatch が発火する.
- **FR-3 / routine**: `HttpRoutineRepository` の `list` / `create` / `update` / `delete` が `authedFetch` 経由でリクエストを送る. 401 を受けた時点で `auth-storage.clearToken()` + `todica:auth-expired` dispatch が発火する.
- **FR-4 / trash**: `HttpTrashRepository` の `list` / `restore` / `empty` が `authedFetch` 経由でリクエストを送る. 401 を受けた時点で `auth-storage.clearToken()` + `todica:auth-expired` dispatch が発火する.
- **FR-5 / constructor**: 5 本すべての Repository (`HttpTaskRepository` / `HttpSettingsRepository` / `HttpProjectRepository` / `HttpRoutineRepository` / `HttpTrashRepository`) の constructor から `authToken` 引数を完全に撤去する (BL-074 で optional のまま残っていた task 側も含む). `main.tsx` の `buildHttpRepos` も同時に整理し, `baseUrl` のみを渡す形にする.
- **FR-6 / API 互換**: エンドポイントパス / method / Authorization 以外のヘッダ (`Content-Type` / `Idempotency-Key` / `If-Match`) / request body / response 型はすべて従来と同じ. Authorization ヘッダは `authedFetch` 側が `auth-storage` から token を都度読んで自動付与する.

### 非機能要件

- **NFR-1 / テスト**: 4 本それぞれに 401 捕捉の単体テストを 1 件ずつ追加 (合計 4 件以上の追加). `app-login-production-path.test.tsx` の `vi.spyOn(global, "fetch")` で 401 を返す mock パターンを踏襲し, 「token が auth-storage から消えること」と「`todica:auth-expired` Custom Event が dispatch されること」を assert する.
- **NFR-2 / 既存テスト互換**: 既存の 4 本の Repository 単体テスト (`web/src/repositories/{project,routine,trash}-repository.test.ts` + 新規追加する `web/src/repositories/settings-repository.test.ts`) の auth seed パターンを, `http-task-repository.test.ts` と同じ `beforeEach` で `WebAuthStorage` + `setAuthStorage` を使う形に統一する. `Authorization: Bearer ${TEST_TOKEN}` の assertion 観点は維持する (= seed した token がそのまま `Authorization` ヘッダに乗ることを担保する).
- **NFR-3 / 緑維持**: 全件テスト (既存 1662 件 + 追加分) が green を保つ. typecheck / lint は 0 エラー.
- **NFR-4 / 非機能影響なし**: UI 変更が無いため a11y / NFR-NO-SHADOW / トークン定義 / レスポンシブ表示は維持で済む.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: HttpSettingsRepository が 401 を引いたときの挙動
  Given WebAuthStorage に token "expired-token" を seed し setAuthStorage で注入している
  And   global.fetch を 401 を返す mock に差し替えている
  And   window に todica:auth-expired listener を登録している
  When  HttpSettingsRepository(baseUrl).getSettings() を呼ぶ
  Then  fetch が 1 度呼び出される
  And   auth-storage 上の token が null になっている
  And   todica:auth-expired イベントが 1 回 dispatch されている

シナリオ AC-2: HttpProjectRepository が 401 を引いたときの挙動
  Given WebAuthStorage に token "expired-token" を seed し setAuthStorage で注入している
  And   global.fetch を 401 を返す mock に差し替えている
  And   window に todica:auth-expired listener を登録している
  When  HttpProjectRepository(baseUrl).list() を呼ぶ
  Then  fetch が 1 度呼び出される
  And   auth-storage 上の token が null になっている
  And   todica:auth-expired イベントが 1 回 dispatch されている

シナリオ AC-3: HttpRoutineRepository が 401 を引いたときの挙動
  Given WebAuthStorage に token "expired-token" を seed し setAuthStorage で注入している
  And   global.fetch を 401 を返す mock に差し替えている
  And   window に todica:auth-expired listener を登録している
  When  HttpRoutineRepository(baseUrl).list() を呼ぶ
  Then  fetch が 1 度呼び出される
  And   auth-storage 上の token が null になっている
  And   todica:auth-expired イベントが 1 回 dispatch されている

シナリオ AC-4: HttpTrashRepository が 401 を引いたときの挙動
  Given WebAuthStorage に token "expired-token" を seed し setAuthStorage で注入している
  And   global.fetch を 401 を返す mock に差し替えている
  And   window に todica:auth-expired listener を登録している
  When  HttpTrashRepository(baseUrl).list() を呼ぶ
  Then  fetch が 1 度呼び出される
  And   auth-storage 上の token が null になっている
  And   todica:auth-expired イベントが 1 回 dispatch されている

シナリオ AC-5: constructor から authToken 引数が消えている
  Given 5 本すべての Http*Repository の型定義を参照する
  When  TypeScript の型レベルで constructor シグネチャを確認する
  Then  どの Repository も constructor は (baseUrl: string) の 1 引数のみで宣言されている
  And   main.tsx の buildHttpRepos も new HttpXxxRepository(baseUrl) の形で生成している

シナリオ AC-6: Repository API 互換 — 既存単体テストが全件 green
  Given 既存の web/src/repositories/{project,routine,trash}-repository.test.ts と
        web/__tests__/http-task-repository.test.ts の assertion 観点
        (Authorization: Bearer ${TEST_TOKEN} / Idempotency-Key / If-Match / 412 → *ConflictError 等)
  When  既存テスト群を「beforeEach で WebAuthStorage + setAuthStorage で token を seed する」
        パターンに統一して実行する
  Then  全件 green を維持する
  And   送信される Authorization ヘッダの値は seed した TEST_TOKEN と一致する

シナリオ AC-7: settings-repository の単体テスト新規追加
  Given web/src/repositories/settings-repository.test.ts が存在しない
  When  本 BL で AC-6 と同じ seed パターンで「getSettings が GET /api/v1/settings に
        Authorization: Bearer ${TEST_TOKEN} を付ける」「patchSettings が PATCH /api/v1/settings に
        Idempotency-Key と If-Match を付ける」「412 で PatchConflictError を throw する」を
        観点とする単体テストを追加する
  Then  追加テストはいずれも実装移行後に green になる
```

## 未決事項 / 確認待ち

- なし (本 BL は機械的な移行であり, 設計判断は BL-074 の D-13 / D-9 / D-14 を踏襲する).
