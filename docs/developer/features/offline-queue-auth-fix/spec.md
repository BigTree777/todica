# 仕様: offline-queue の認証ヘッダを auth-storage 経由に修正

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-097

## 背景 / 課題

BL-074 (auth-storage 導入) / BL-076 (5 Repository を `authedFetch` 統一) 後, UI 層 6 view (`today-view` / `tomorrow-view` / `projects-view` / `routines-view` / `trash-view` / `focus-view`) + `project-create-dialog` で:

```ts
const repo = repository as unknown as HasBaseUrlAndToken;
const authToken = repo.authToken ?? "";
// ...
void safeEnqueue({
  headers: { Authorization: `Bearer ${authToken}`, ... },
});
```

`HttpTaskRepository` 等は BL-076 で `authToken` constructor 引数を撤去済のため `repo.authToken` は常に `undefined` → 空文字フォールバック. 結果として offline 中に書き込んだ全 mutation が `Authorization: Bearer ` (空) で enqueue され, `offline-queue.ts flush()` も `entry.headers` をそのまま `fetch()` に渡すので, online 復帰時にサーバが 401 で全件却下 → MAX_RETRY=5 で drop されて消える.

= **オフライン書込キュー (BL-018) が事実上機能していない**.

## ゴール / 非ゴール

### ゴール

- UI 層 7 ファイル (6 view + 1 dialog) から `HasBaseUrlAndToken` interface / `repo.authToken` 参照を撤去.
- enqueue 時の `Authorization` ヘッダを削除 (空 token で焼き付けない).
- `offline-queue.ts flush()` を `authedFetch` 経由に変更し, flush 時に auth-storage 由来のフレッシュ token を Authorization に乗せる.

### 非ゴール

- server 側 API / SW 本体 / Repository constructor 引数 / domain 層 / auth-storage 実装の改修.
- offline-queue の retry 戦略 (MAX_RETRY=5 / 7 日 TTL) の変更.

## 要件

- **FR-1**: 7 UI ファイルに `HasBaseUrlAndToken` interface が存在しない.
- **FR-2**: 7 UI ファイルに `repo.authToken` 参照が存在しない.
- **FR-3**: 7 UI ファイルに `Authorization: ` で始まる行 (Bearer ヘッダ手動セット) が存在しない.
- **FR-4**: `offline-queue.ts flush()` が `authedFetch` を import して `fetch` の代わりに呼ぶ.
- **FR-5**: 既存テスト全件 green / lint / typecheck 0.

## 受け入れ基準

```
シナリオ: UI 層から dead path が消える
  Given 7 UI ファイル (today / tomorrow / projects / routines / trash / focus / project-create-dialog)
  When  grep "HasBaseUrlAndToken|authToken|Bearer \${authToken}" を実行する
  Then  全件 0
```

```
シナリオ: offline-queue が authedFetch 経由で flush する
  Given web/src/offline-queue.ts
  When  flush() の fetch 呼び出しを観察する
  Then  authedFetch を import して呼んでいる
```

```
シナリオ: 既存挙動の維持
  Given vitest 全件
  When  実行する
  Then  退行なし
```
