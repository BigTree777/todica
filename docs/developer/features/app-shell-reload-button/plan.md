# 計画: 画面右上にアイコンのみの更新ボタンを配置

## 方針概要

`app-shell.tsx` に reload button を追加し, `app-shell.css` に `position: fixed; top; right` で右上配置. クリック handler はインラインで SW update 確認 + reload.

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `web/src/ui/app-shell/app-shell.tsx` | reload button + handler 追加 |
| `web/src/ui/app-shell/app-shell.css` | `.app-shell__reload` 右上配置 |
| `web/__tests__/app-shell-reload-button.test.tsx` | 新規 |

## 設計詳細

### JSX

```tsx
<button
  type="button"
  className="app-shell__reload"
  aria-label="アップデートを確認して再読み込み"
  onClick={handleReloadCheck}
>
  ↻
</button>
```

ハンバーガーボタンの直後に配置.

### handler

```ts
const handleReloadCheck = async () => {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      } else if (registration) {
        await registration.update();
      }
    } catch {
      // ignore: SW が利用できない環境
    }
  }
  window.location.reload();
};
```

### CSS

```css
.app-shell__reload {
  position: fixed;
  top: var(--space-sm);
  right: var(--space-sm);
  z-index: 200;
  background: none;
  border: none;
  font-size: var(--font-size-h2);
  cursor: pointer;
  padding: var(--space-xs);
  color: var(--color-fg);
}
```

ハンバーガー (左上) と同じスタイル / size で右上配置.

## 重要な決定

- **D-1**: Unicode `↻` (U+21BB) を採用. アイコンライブラリ依存なし.
- **D-2**: メニュー開時にも更新ボタンは消さない (右上は menu パネルと重ならない).
- **D-3**: ADR は作らない.

## テスト方針

- button の存在 / aria-label / 日本語不含 / click → reload を検証.
- waiting SW を mock した状態で SKIP_WAITING + reload が呼ばれることを検証.
