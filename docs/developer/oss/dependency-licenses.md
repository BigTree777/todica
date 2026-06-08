# 依存パッケージライセンス一覧

すべての直接依存パッケージのライセンスを記載します。MIT 互換ライセンスのみを使用しています。

## ルート（devDependencies）

| パッケージ | バージョン | ライセンス |
| --- | --- | --- |
| @biomejs/biome | ^1.9.4 | MIT |
| @hono/node-server | ^2.0.4 | MIT |
| @testing-library/jest-dom | ^6.6.3 | MIT |
| @testing-library/react | ^16.1.0 | MIT |
| @testing-library/user-event | ^14.5.2 | MIT |
| @types/better-sqlite3 | ^7.6.12 | MIT |
| @types/node | ^22.10.2 | MIT |
| @types/react | ^18.3.18 | MIT |
| @types/react-dom | ^18.3.5 | MIT |
| @vitest/coverage-v8 | ^2.1.8 | MIT |
| better-sqlite3 | ^11.7.0 | MIT |
| drizzle-kit | ^0.30.1 | Apache-2.0 |
| drizzle-orm | ^0.38.3 | Apache-2.0 |
| hono | ^4.6.14 | MIT |
| jsdom | ^25.0.1 | MIT |
| msw | ^2.7.0 | MIT |
| react | ^18.3.1 | MIT |
| react-dom | ^18.3.1 | MIT |
| react-router-dom | ^6.28.0 | MIT |
| typescript | ^5.7.2 | Apache-2.0 |
| vitest | ^2.1.8 | MIT |
| zod | ^3.24.1 | MIT |

## ルート（dependencies）

| パッケージ | バージョン | ライセンス |
| --- | --- | --- |
| @capacitor/android | ^8.4.0 | MIT |
| @capacitor/cli | ^8.4.0 | MIT |
| @capacitor/core | ^8.4.0 | MIT |
| @capacitor/preferences | ^8.0.1 | MIT |

## domain workspace

`domain/package.json` には独自の `dependencies` / `devDependencies` はありません。ルートの devDependencies（TypeScript・vitest 等）を共有しています。

## server workspace

`server/package.json` には独自の `dependencies` はありません。ルートの `@hono/node-server`・`better-sqlite3`・`drizzle-orm`・`hono` 等を共有しています。

## web workspace（dependencies）

| パッケージ | バージョン | ライセンス |
| --- | --- | --- |
| @capacitor-community/sqlite | ^8.1.0 | MIT |
| @tanstack/react-query | ^5.101.0 | MIT |
| idb | ^8.0.3 | ISC |
| react-router-dom | ^6.28.0 | MIT |

## web workspace（devDependencies）

| パッケージ | バージョン | ライセンス |
| --- | --- | --- |
| @tanstack/react-query-devtools | ^5.101.0 | MIT |
| @vitejs/plugin-react | ^4.7.0 | MIT |
| fake-indexeddb | ^6.2.5 | MIT |
| vite | ^5.4.21 | MIT |
| vite-plugin-pwa | ^1.3.0 | MIT |
| workbox-expiration | ^7.4.1 | MIT |
| workbox-precaching | ^7.4.1 | MIT |
| workbox-routing | ^7.4.1 | MIT |
| workbox-strategies | ^7.4.1 | MIT |
| workbox-window | ^7.4.1 | MIT |

## ライセンス互換性

- MIT: 商用・非商用を問わず自由に利用可能。ライセンス表示が必要。
- Apache-2.0: 商用・非商用を問わず自由に利用可能。ライセンス表示とNOTICEファイルの保持が必要。MIT と互換。
- ISC: MIT と実質的に同等。MIT と互換。

**結論: すべての依存パッケージは MIT 互換ライセンスであり、本プロジェクトの MIT ライセンスでの公開に問題はありません。**
