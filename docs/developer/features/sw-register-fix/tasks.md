# タスク: SW 登録コード追加

## 実装

- [x] `web/src/main.tsx` に `registerSW` import + 呼び出しを追加
- [x] `web/src/vite-env.d.ts` に `vite-plugin-pwa/client` 型参照
- [x] `vitest.config.ts` に `virtual:pwa-register` の alias
- [x] `web/__tests__/mocks/pwa-register.ts` 新規 (no-op スタブ)

## テスト

- [x] `__tests__/structure/sw-register.test.ts` 新規
- [x] 既存テスト全件 green
- [x] lint / typecheck 0
