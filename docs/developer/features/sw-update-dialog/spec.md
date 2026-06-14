# 仕様: SW アップデート確認 UI を画面中央のダイアログ化

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-092

## 背景 / 課題

Service Worker (BL-018 / BL-032) が新しい precache を検知したとき, `PwaUpdateBanner` がページ上部に `<div role="alert">` で再読み込み確認を表示する. しかし他の通知 (OfflineBanner / ErrorNotification) と階層が同じため重要操作として強調されておらず, 画面中央のモーダルダイアログのほうが視認性が高い.

## ゴール / 非ゴール

### ゴール

- 既存の `PwaUpdateBanner` を `<dialog>` + `showModal()` ベースのモーダルダイアログに置き換える.
- 画面中央表示 + フォーカスのダイアログ内固定 + Escape / overlay click で dismiss.
- `role="dialog"` + `aria-modal="true"` + `aria-label="アップデート"` の a11y パターン.
- ボタンは「再読み込み」(primary) と「あとで」(ghost) の 2 択.

### 非ゴール

- SW 本体 (precache / NavigationRoute / 書込キュー) のロジックの変更.
- SW 更新検知タイミングの変更.
- アップデート無しでも常時押せる更新ボタン (= BL-093 の責務).

## 要件

- **FR-1**: 新規 component `web/src/ui/sw-update-dialog/sw-update-dialog.tsx` を新設.
- **FR-2**: `<dialog>` の `showModal()` で画面中央モーダル化.
- **FR-3**: 「再読み込み」で `waitingWorker.postMessage({ type: "SKIP_WAITING" })` + `window.location.reload()`.
- **FR-4**: 「あとで」/ Escape / overlay click で `close()`.
- **FR-5**: 既存の `PwaUpdateBanner` を撤去し, `web/src/app.tsx` の 4 箇所のマウントを `SwUpdateDialog` に差し替える.
- **FR-6**: `role="dialog"` + `aria-modal="true"` + `aria-label="アップデート"`.

## 受け入れ基準

```
シナリオ: アップデート検知でダイアログが開く
  Given waiting 中の SW が存在する
  When  コンポーネントがマウントされる
  Then  <dialog open> が画面中央に表示される
```

```
シナリオ: 再読み込みボタンで SW skipWaiting + reload
  Given ダイアログが open
  When  「再読み込み」をクリックする
  Then  waitingWorker.postMessage({ type: "SKIP_WAITING" }) と window.location.reload() が呼ばれる
```

```
シナリオ: 「あとで」で dialog が閉じる
  Given ダイアログが open
  When  「あとで」をクリックする
  Then  dialog.close() が呼ばれる
```

```
シナリオ: a11y 属性が揃う
  Given ダイアログが open
  When  DOM を確認する
  Then  role="dialog" / aria-modal="true" / aria-label="アップデート" が付く
```
