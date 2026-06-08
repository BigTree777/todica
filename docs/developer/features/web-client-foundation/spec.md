# 仕様: Web クライアント基盤（ルーティング + TrashView）

- 状態: 確定
- 関連: BL-014
- 由来要件: NFR-010（React + Vite）/ NFR-013（レスポンシブ・高速 UI）/ BL-009（SettingsView）/ BL-011（ゴミ箱 API）

## 背景 / 課題

BL-001〜BL-011 で TodayView・SettingsView・ゴミ箱 API（サーバ側）は実装済みである。
しかし `web/src/main.tsx` は TodayView を直接マウントするだけで、複数ビュー間の遷移手段がない。
ユーザーは `/settings` や `/trash` に URL 直打ちしてもルートが解決されず、SettingsView・TrashView にアクセスできない。

本 feature の目的は react-router-dom を導入してルーティングを確立し、
ゴミ箱 API（BL-011）に対応する TrashView を新規作成することで、
複数ビューを持つ Web アプリとして完成させることである。

## ゴール / 非ゴール

### ゴール

- `react-router-dom` を導入し、`/`・`/today`・`/settings`・`/trash` のルートを確立する。
- `web/src/main.tsx` を `BrowserRouter` + `Routes` で書き換え、ルーティングを機能させる。
- TrashView コンポーネント（`web/src/ui/trash-view/trash-view.tsx`）を新規作成する。
  - ゴミ箱一覧の表示（GET /api/v1/trash）
  - 個別タスクの復元ボタン（POST /api/v1/trash/:id/restore）
  - 「ゴミ箱を空にする」ボタン（DELETE /api/v1/trash）
- TrashRepository インターフェース + HttpTrashRepository を新規作成する。
- TodayView・SettingsView の既存テストを破壊しない。

### 非ゴール

- TanStack Query の導入（既存の `useState + useEffect` パターンを維持する）
- ナビゲーション UI（ヘッダ・サイドバー等）のスタイリング（機能優先）
- TrashView からの TrashView 以外への遷移（`<Link>` によるナビゲーション）
- 認証フロー・ログイン画面の実装

## 要件

### 機能要件

- `react-router-dom` を `package.json` に追加し、`BrowserRouter` を使ってルーティングを設定する。
- `/` へのアクセスは `/today` にリダイレクトする。
- `/today` は TodayView をレンダリングする。
- `/settings` は SettingsView をレンダリングする。
- `/trash` は TrashView をレンダリングする。
- TrashView は初回マウント時に `TrashRepository.list()` を呼び出してゴミ箱タスクを一覧表示する。
- TrashView の復元ボタンをクリックすると `TrashRepository.restore()` を呼び出し、成功後に一覧を再取得する。
- TrashView の「ゴミ箱を空にする」ボタンをクリックすると `TrashRepository.empty()` を呼び出し、成功後に一覧を再取得する。

### 非機能要件

- 既存コンポーネント（TodayView・SettingsView）のインターフェース（props）は変更しない。
- TrashView のテストは既存パターン（モック TrashRepository を props 注入）と同形にする。
- `react-router-dom` 以外の新規依存を追加しない。

## 受け入れ基準

### ルーティング

```
シナリオ: "/" へのアクセスは "/today" にリダイレクトされ TodayView が表示される
  Given ブラウザが "/" を開く
  When  ルーティングが解決される
  Then  URL が "/today" になり TodayView がレンダリングされる
```

```
シナリオ: "/today" にアクセスすると TodayView が表示される
  Given ブラウザが "/today" を開く
  When  ルーティングが解決される
  Then  TodayView がレンダリングされる（<h1>今日</h1> が存在する）
```

```
シナリオ: "/settings" にアクセスすると SettingsView が表示される
  Given ブラウザが "/settings" を開く
  When  ルーティングが解決される
  Then  SettingsView がレンダリングされる（<h1>設定</h1> が存在する）
```

```
シナリオ: "/trash" にアクセスすると TrashView が表示される
  Given ブラウザが "/trash" を開く
  When  ルーティングが解決される
  Then  TrashView がレンダリングされる（<h1>ゴミ箱</h1> が存在する）
```

---

### TrashView: 一覧表示

```
シナリオ: マウント時にゴミ箱のタスク一覧が表示される
  Given TrashRepository.list() がタスク [T1, T2] を返すモックが注入されている
  When  TrashView がマウントされる
  Then  タスク T1 と T2 の名前がリスト（aria-label="ゴミ箱のタスク一覧"）に表示される
```

```
シナリオ: ゴミ箱が空のとき「ゴミ箱は空です」と表示される
  Given TrashRepository.list() が空配列を返すモックが注入されている
  When  TrashView がマウントされる
  Then  「ゴミ箱は空です」というテキストが表示される
```

---

### TrashView: タスク復元

```
シナリオ: 復元ボタンをクリックすると restore が呼ばれ一覧が更新される
  Given TrashRepository.list() がタスク [T1] を返すモックが注入されている
  And   TrashRepository.restore() が成功するモックが注入されている
  And   restore 呼び出し後の list() は空配列を返す
  When  T1 の「復元」ボタンをクリックする
  Then  TrashRepository.restore({ id: T1.id, ifMatch: T1.version }) が呼ばれる
  And   タスク一覧が再取得され「ゴミ箱は空です」と表示される
```

---

### TrashView: ゴミ箱を空にする

```
シナリオ: 「ゴミ箱を空にする」ボタンをクリックすると empty が呼ばれ一覧が更新される
  Given TrashRepository.list() がタスク [T1, T2] を返すモックが注入されている
  And   TrashRepository.empty() が成功するモックが注入されている
  And   empty 呼び出し後の list() は空配列を返す
  When  「ゴミ箱を空にする」ボタンをクリックする
  Then  TrashRepository.empty() が呼ばれる
  And   タスク一覧が再取得され「ゴミ箱は空です」と表示される
```

---

### TrashRepository（HttpTrashRepository）

```
シナリオ: list() が GET /api/v1/trash を呼び出し { tasks } を返す
  Given サーバが GET /api/v1/trash に 200 OK と { tasks: [T1] } を返す
  When  HttpTrashRepository.list() を呼ぶ
  Then  [T1] が返る
```

```
シナリオ: restore() が POST /api/v1/trash/:id/restore を Idempotency-Key と If-Match 付きで呼び出す
  Given サーバが POST /api/v1/trash/<id>/restore に 200 OK と { task: T } を返す
  When  HttpTrashRepository.restore({ id, ifMatch: 2 }) を呼ぶ
  Then  Authorization・Idempotency-Key・If-Match: 2 ヘッダを付けたリクエストが送られる
  And   T が返る
```

```
シナリオ: restore() がサーバ 412 を受けると RestoreConflictError を throw する
  Given サーバが POST /api/v1/trash/<id>/restore に 412 と { task: T } を返す
  When  HttpTrashRepository.restore({ id, ifMatch: 1 }) を呼ぶ
  Then  RestoreConflictError が throw される
  And   RestoreConflictError.currentTask が T である
```

```
シナリオ: empty() が DELETE /api/v1/trash を Idempotency-Key 付きで呼び出し 204 を返す
  Given サーバが DELETE /api/v1/trash に 204 を返す
  When  HttpTrashRepository.empty() を呼ぶ
  Then  Idempotency-Key ヘッダを付けたリクエストが送られる
  And   正常終了する（void が返る）
```

## 未決事項 / 確認待ち

特になし。
