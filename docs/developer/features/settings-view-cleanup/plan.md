# 計画: SettingsView の構造・文言整理 (4 件まとめ)

## 方針概要

SettingsView 1 ファイル + その CSS のみで 4 件を一括対応.

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `web/src/ui/settings-view/settings-view.tsx` | FR-1〜4 の JSX 変更 |
| `web/src/ui/settings-view/settings-view.css` | `.settings-view__label` / `.settings-view__field-row` / `.settings-view__password-form` / `.settings-view__password-field` / `.settings-view__logout` 追加 |
| 既存テスト (`settings-view.test.tsx` / `settings-view-reset-time-label.test.tsx` / `app-login.test.tsx` / `common-button-style.test.tsx`) | 文言 / DOM 構造の追従 |
| `web/__tests__/settings-view-cleanup.test.tsx` (新規) | 4 件の整理が施されていることを直接 assert |

## 設計詳細

### FR-1 (ログアウト二重箱解消)

```tsx
<section aria-label="ログアウト" className="settings-view__logout">
  <button className="button button--ghost">ログアウト</button>
</section>
```

CSS: `.settings-view__logout` は border / padding 無し.

### FR-2 (パスワード変更フォーム縦並び)

```tsx
<div className="settings-view__password-field">
  <label htmlFor="...">現在のパスワード</label>
  <input ... />
</div>
```

CSS: `.settings-view__password-field { display: flex; flex-direction: column; gap: var(--space-xs); }` + `label { display: block; }`.

### FR-3 (「変更」統一)

`{onChangePassword === undefined ? "保存" : "更新"}` → `変更`. パスワード変更 submit の `変更する` → `変更`.

### FR-4 (リセット時刻太字 + 横変更ボタン)

```tsx
<form>
  <label htmlFor="day-boundary-time" className="settings-view__label">リセット時刻</label>
  <div className="settings-view__field-row">
    <input id="day-boundary-time" ... />
    <button>変更</button>
  </div>
</form>
```

CSS: `.settings-view__label { font-weight: bold; }`, `.settings-view__field-row { display: flex; gap; align-items: center; }`, `input { flex: 1; }`.

## 重要な決定

- **D-1**: ログアウト用に独立した `.settings-view__logout` クラスを新設 (`.settings-view__section` の枠を撤去せず別系統に分離).
- **D-2**: パスワード変更フォームの 3 ブロックは flex column パターン (CSS のみで縦並び化).
- **D-3**: リセット時刻 input と button の幅比率は `input flex: 1 + button auto`.

## テスト方針

- 既存テスト群を新しい button 文言 / DOM 構造に追従させる.
- 新規 `settings-view-cleanup.test.tsx` で 4 件の整理 (logout クラス / 縦並びクラス / 「変更」統一 / `.settings-view__label`+`.settings-view__field-row` 構造) を直接 assert.
