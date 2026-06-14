# 計画: SW アップデート確認 UI を画面中央のダイアログ化

## 方針概要

既存の `PwaUpdateBanner` の SW update 検出ロジックを再利用し, 表示部分のみ `<dialog>` + `showModal()` に置き換える.

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `web/src/ui/sw-update-dialog/sw-update-dialog.tsx` | 新規 |
| `web/src/ui/sw-update-dialog/sw-update-dialog.css` | 新規 (中央配置 + overlay) |
| `web/src/app.tsx` | 4 箇所の `<PwaUpdateBanner />` を `<SwUpdateDialog />` に置換 + import 変更 |
| `web/src/ui/pwa-update-banner/` | ディレクトリごと削除 |
| `web/__tests__/sw-update-dialog.test.tsx` | 新規 |
| 既存 `web/src/ui/pwa-update-banner/pwa-update-banner.test.tsx` があれば削除 |

## 設計詳細

### Component

```tsx
export function SwUpdateDialog(): JSX.Element | null {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready.then((reg) => {
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(w);
          }
        });
      });
    });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (waitingWorker && !dialog.open) dialog.showModal();
    if (!waitingWorker && dialog.open) dialog.close();
  }, [waitingWorker]);

  const handleReload = () => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  };
  const handleClose = () => setWaitingWorker(null);

  return (
    <dialog
      ref={dialogRef}
      className="sw-update-dialog"
      aria-label="アップデート"
      onCancel={handleClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) handleClose();
      }}
    >
      <p>アップデートがあります。再読み込みしますか？</p>
      <div className="sw-update-dialog__actions">
        <button className="button button--primary" onClick={handleReload}>再読み込み</button>
        <button className="button button--ghost" onClick={handleClose}>あとで</button>
      </div>
    </dialog>
  );
}
```

### CSS

中央配置. native `<dialog>` の default で画面中央に showModal される. 背景 overlay (`::backdrop`) もネイティブで提供される. 最小 padding と max-width を指定.

## 重要な決定

- **D-1**: 既存 `PwaUpdateBanner` を削除. リネームではなく置換 (ファイル / ディレクトリ全削除).
- **D-2**: SW 更新検出ロジックは既存 `PwaUpdateBanner` から移植 (挙動同等).
- **D-3**: ADR は作らない.

## テスト方針

- jsdom では `showModal` が未実装のため `web/__tests__/setup.ts` の polyfill を流用.
- 検証ケース: open / reload click / close click / a11y 属性.
