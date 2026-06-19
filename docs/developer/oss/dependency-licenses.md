# 依存パッケージライセンス一覧

直接依存パッケージのライセンスを記載する。配布物（Web ビルド / Android アプリ）に乗る
ランタイム依存はすべて permissive ライセンス（MIT / ISC / Apache-2.0）であり、本プロジェクトの
MIT ライセンスでの公開・配布に支障はない。コピーレフト系（MPL-2.0 / CC-BY-4.0）は a11y テスト・
ビルドツールの dev / 推移依存に限られ、配布物には含まれない（後述「コピーレフト依存の扱い」）。

ライセンスは `node_modules` のインストール済みパッケージの `license` フィールドに基づく。

## ルート（dependencies）

| パッケージ | バージョン | ライセンス |
| --- | --- | --- |
| @capacitor/android | ^8.4.0 | MIT |
| @capacitor/cli | ^8.4.0 | MIT |
| @capacitor/core | ^8.4.0 | MIT |
| @capacitor/preferences | ^8.0.1 | MIT |

## ルート（devDependencies）

| パッケージ | バージョン | ライセンス |
| --- | --- | --- |
| @axe-core/playwright | ^4.11.3 | MPL-2.0 |
| @biomejs/biome | ^2.5.0 | MIT OR Apache-2.0 |
| @hono/node-server | ^2.0.4 | MIT |
| @playwright/test | ^1.60.0 | Apache-2.0 |
| @testing-library/jest-dom | ^6.6.3 | MIT |
| @testing-library/react | ^16.1.0 | MIT |
| @testing-library/user-event | ^14.5.2 | MIT |
| @types/bcrypt | ^6.0.0 | MIT |
| @types/better-sqlite3 | ^7.6.13 | MIT |
| @types/js-yaml | ^4.0.9 | MIT |
| @types/node | ^25.9.3 | MIT |
| @types/react | ^19.2.17 | MIT |
| @types/react-dom | ^19.2.3 | MIT |
| @vitest/coverage-v8 | ^4.1.9 | MIT |
| better-sqlite3 | ^12.11.1 | MIT |
| drizzle-kit | ^0.31.10 | MIT |
| drizzle-orm | ^0.45.2 | Apache-2.0 |
| hono | ^4.6.14 | MIT |
| js-yaml | ^4.2.0 | MIT |
| jsdom | ^25.0.1 | MIT |
| msw | ^2.7.0 | MIT |
| react | ^19.2.7 | MIT |
| react-dom | ^19.2.7 | MIT |
| react-router-dom | ^6.28.0 | MIT |
| rimraf | ^6.1.3 | BlueOak-1.0.0 |
| typescript | ^5.7.2 | Apache-2.0 |
| vite | ^8.0.16 | MIT |
| vite-node | ^6.0.0 | MIT |
| vitest | ^4.1.9 | MIT |

## web workspace（dependencies）

| パッケージ | バージョン | ライセンス |
| --- | --- | --- |
| @capacitor-community/sqlite | ^8.1.0 | MIT |
| @tanstack/react-query | ^5.101.0 | MIT |
| idb | ^8.0.3 | ISC |
| lucide-react | ^0.460.0 | ISC |
| react-router-dom | ^6.28.0 | MIT |

## web workspace（devDependencies）

| パッケージ | バージョン | ライセンス |
| --- | --- | --- |
| @tanstack/react-query-devtools | ^5.101.0 | MIT |
| @vitejs/plugin-react | ^5.2.0 | MIT |
| fake-indexeddb | ^6.2.5 | Apache-2.0 |
| vite | ^8.0.16 | MIT |
| vite-plugin-pwa | ^1.3.0 | MIT |
| workbox-expiration | ^7.4.1 | MIT |
| workbox-precaching | ^7.4.1 | MIT |
| workbox-routing | ^7.4.1 | MIT |
| workbox-strategies | ^7.4.1 | MIT |
| workbox-window | ^7.4.1 | MIT |

## server workspace（dependencies）

| パッケージ | バージョン | ライセンス |
| --- | --- | --- |
| @hono/node-server | （ルートに合わせる） | MIT |
| bcrypt | ^6.0.0 | MIT |
| hono | （ルートに合わせる） | MIT |

`server` / `domain` workspace に固有の devDependencies は無く、ルートの devDependencies
（TypeScript・vitest 等）を共有する。`@todica/domain` はモノレポ内部パッケージ。

## コピーレフト依存の扱い

スキャンで検出されたコピーレフト系ライセンスは、いずれも **dev / ビルドツールに限られ、配布物
（Web バンドル・Android アプリ）には含まれない**ため、本プロジェクトの MIT 配布に義務を課さない。

| パッケージ | ライセンス | 種別 | 扱い |
| --- | --- | --- | --- |
| @axe-core/playwright（および推移依存 axe-core） | MPL-2.0 | dev（a11y テスト） | 配布物に含まれない |
| lightningcss（`vite` 経由の推移依存） | MPL-2.0 | build ツール | 配布物に含まれない |
| caniuse-lite（`browserslist` 経由の推移依存） | CC-BY-4.0 | build データ | 配布物に含まれない |
| jszip（`@capacitor-community/sqlite` → `jeep-sqlite` 経由の推移依存） | MIT OR GPL-3.0-or-later | デュアル | **MIT を選択** するため GPL 義務なし |

MPL-2.0 はファイル単位の弱コピーレフトで、MPL ライセンスのファイル自体を改変・再配布する場合に
そのソース開示義務が生じる。本プロジェクトはこれらを改変せず、ビルド / テスト時に利用するのみで
配布物に同梱しないため、義務は発生しない。

## ライセンス互換性

- **MIT**: 商用・非商用を問わず自由に利用可能。著作権表示の保持が必要。
- **ISC**: MIT と実質同等の permissive。MIT と互換。
- **Apache-2.0**: 自由に利用可能。著作権表示と NOTICE ファイルの保持が必要。MIT と互換。
- **BlueOak-1.0.0**: permissive（OSI 承認）。MIT と互換。
- **MIT OR Apache-2.0**: デュアルライセンス。いずれかを選択可。MIT 互換。
- **MPL-2.0 / CC-BY-4.0**: 上記「コピーレフト依存の扱い」のとおり dev / build のみで、配布物に含まれない。

**結論: 配布物に乗るランタイム依存はすべて MIT 互換の permissive ライセンスであり、本プロジェクトの
MIT ライセンスでの公開・配布に支障はない。**
