# 仕様: Service Worker 登録コードを main.tsx に追加

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-096

## 背景 / 課題

`web/vite.config.ts` で `VitePWA({ registerType: "prompt", strategies: "injectManifest" })` を設定しているが, `import { registerSW } from "virtual:pwa-register"` を呼び出すコードが `web/src/main.tsx` および全コードベースに存在しない. 結果として Service Worker が一切登録されず:

- precaching (PWA-002) が動かない
- Background Sync (WQ-005) が動かない
- SwUpdateDialog (BL-092) の waiting 検知が発火しない
- AppShell 右上更新ボタン (BL-093) の `getRegistration()` が常に null

実機で PWA としての機能がすべて停止している.

## ゴール / 非ゴール

### ゴール

- `main.tsx` に `registerSW` を呼び出すコードを追加し SW を登録する.
- 既存テスト群が green を維持する (vitest 環境では `virtual:pwa-register` を no-op スタブに alias).
- 新規 SW が available になったときの UI は既存 `SwUpdateDialog` (BL-092) が `navigator.serviceWorker.ready` 経由で polling して処理する.

### 非ゴール

- SW 本体 (`web/src/sw/service-worker.ts`) のロジック変更.
- SwUpdateDialog / AppShell reload button の改修 (これらは SW が動けば自動で機能する).
- onOfflineReady の UI 通知 (現状無音で運用).

## 要件

- **FR-1**: `web/src/main.tsx` が `virtual:pwa-register` から `registerSW` を import して呼び出す.
- **FR-2**: `registerSW` の `onNeedRefresh` / `onOfflineReady` callback は no-op で良い (SwUpdateDialog が waiting を見るため).
- **FR-3**: vitest 環境では `virtual:pwa-register` を `web/__tests__/mocks/pwa-register.ts` の no-op スタブに alias する.
- **FR-4**: `web/src/vite-env.d.ts` に `vite-plugin-pwa/client` の型参照を追加して TypeScript の解決を可能にする.
- **FR-5**: 既存テスト全件 green, lint / typecheck 0.

## 受け入れ基準

```
シナリオ: main.tsx に registerSW が呼ばれている
  Given web/src/main.tsx
  When  grep "registerSW(" を実行する
  Then  ヒット 1 件以上
```

```
シナリオ: vitest が virtual:pwa-register を解決できる
  Given vitest.config.ts に alias が設定されている
  When  npx vitest run を実行する
  Then  "Failed to resolve import" エラーが発生せず全件 green
```

```
シナリオ: prod build で SW が生成される
  Given npm run build -w web
  When  dist/ を確認する
  Then  sw.js (または相当の SW ファイル) が出力される
```
