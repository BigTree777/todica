# 計画: Service Worker 登録コードを main.tsx に追加

## 影響範囲

| ファイル | 変更内容 |
|---|---|
| `web/src/main.tsx` | `registerSW` の import + 呼び出し |
| `web/src/vite-env.d.ts` | `vite-plugin-pwa/client` 型参照を追加 |
| `vitest.config.ts` | `virtual:pwa-register` の alias |
| `web/__tests__/mocks/pwa-register.ts` (新規) | no-op スタブ |
| `__tests__/structure/sw-register.test.ts` (新規) | main.tsx に registerSW 呼び出しが存在することを assert |

## 設計詳細

### main.tsx の registerSW 呼び出し

```ts
import { registerSW } from "virtual:pwa-register";

registerSW({
  onNeedRefresh() { /* SwUpdateDialog が表示する */ },
  onOfflineReady() { /* 現状無音 */ },
});
```

`SwUpdateDialog` は `navigator.serviceWorker.ready` を直接 polling しているので onNeedRefresh の重複起動を避けるため no-op で良い.

### vitest alias

```ts
resolve: {
  alias: {
    "virtual:pwa-register": resolve(__dirname, "web/__tests__/mocks/pwa-register.ts"),
  },
},
```

### no-op スタブ

`registerSW(options?: RegisterSWOptions): () => Promise<void>` の型互換を満たすだけ. 実装は空関数.

## 重要な決定

- **D-1**: onNeedRefresh callback で UI を出さない. SwUpdateDialog の polling 経路と二重起動を避ける.
- **D-2**: vitest で virtual モジュールを alias 経由でスタブする (環境変数や `vi.mock` ではなく config レベルで一度だけ解決).
- **D-3**: ADR は不要 (既存の PWA 構成を補完する fix).

## テスト方針

- 構造テストで main.tsx に `registerSW(` の呼び出しが存在することを grep ベース検証.
- 既存テスト全件 green を維持.
- prod build の SW 出力確認は手動 (ビルド成果物のスナップショットは持たない方針).
