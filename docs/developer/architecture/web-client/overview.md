# Web クライアント実装

> 抽象アーキテクチャ上の「Web クライアント」コンポーネントを, どの言語・フレームワーク・ビルド・キャッシュ機構で実装するかを示す.
> 抽象側の責務（UI 層 / アプリケーション層 / データソース抽象 / API クライアントアダプタ / 読み取りキャッシュ）は重複して書かない. 抽象側を参照すること.

## 1. 対応する抽象概念

- 抽象アーキテクチャ概要: [`../overview.md`](../overview.md) §2「構成方針」, §5.2「Web クライアント / Android サーバモード の層構成」, §7.5「オフライン耐性」.
- モジュール境界: [`../module-boundaries.md`](../module-boundaries.md) §3「クライアント側の層と責務」, §4.3「Web クライアントのモジュール一覧」.
- API 通信契約: [`../api/overview.md`](../api/overview.md).

## 2. 採用技術（[ADR-0008](../../adr/0008-web-client-tech-stack.md) で全て確定）

| レイヤ | 採用 | 代替案 |
| --- | --- | --- |
| 言語 | TypeScript | （採らない） |
| UI フレームワーク | React | Svelte / SvelteKit, Vue 3 |
| ビルド | Vite | （React と組合せの de facto） |
| 配信形態 | **PWA**（インストール可能 / オフライン起動可能） | 通常 SPA |
| サーバ状態管理 | TanStack Query | SWR |
| クライアント状態 | React 組込み（useState / useReducer / Context） | Zustand / Redux |
| HTTP クライアント | 標準 `fetch` | Axios |
| ルーティング | React Router | TanStack Router |
| アイコン | lucide-react | Heroicons / Material Symbols / 手書き SVG |
| 書込みキュー永続化 | IndexedDB（`idb` ラッパー経由） | localStorage |
| Service Worker | `vite-plugin-pwa`（Workbox ベース） | 手書き SW |
| テスト | Vitest | Jest |
| Lint / Format | Biome | ESLint + Prettier |

## 3. 採用理由 / 参照 ADR

- 言語 / UI フレームワーク / ビルド: [ADR-0008](../../adr/0008-web-client-tech-stack.md)
  - サーバ側と TypeScript を揃えることで DTO 型を共有できる（ADR-0008 §決定）.
  - サーバ状態管理（フェッチ・キャッシュ・楽観 UI）の事例量が React で最も厚い（ADR-0008 §決定）.
  - SPA + クライアントサイドルーティングで, 個人運用のホスティングを最小に保つ.
- 永続キャッシュの位置づけ: [ADR-0008](../../adr/0008-web-client-tech-stack.md) §「サーバ通信・オフライン耐性の方針」.
  - 第一段はメモリキャッシュ（サーバ状態管理ライブラリ）.
  - 第二段は永続キャッシュで, 「ブラウザを開き直しても直前の今日ビューを即座に表示できる」程度に留める. **書き込みの正本にはしない**（[`../module-boundaries.md`](../module-boundaries.md) §5.3 と整合）.
- API プロトコル / 認証 / バージョニング: [ADR-0010](../../adr/0010-api-design.md). 詳細は [`../api/overview.md`](../api/overview.md).
- 配布構成（Web は常にサーバ接続必須）: [ADR-0006](../../adr/0006-distribution-topology.md).

## 4. 実装上の注意点

- **オフライン書込みキュー**: 通信断時の書き込みは IndexedDB のキューに保存し, Service Worker の Background Sync API で接続復帰時に自動再送する. 各書き込みには冪等性キー（`Idempotency-Key` = エンティティの `id`）を付与し, サーバ側で二重実行を防ぐ（[ADR-0008](../../adr/0008-web-client-tech-stack.md) §「オフライン書込キュー」, [ADR-0010](../../adr/0010-api-design.md)）.
- **楽観ロック + 競合解決 UI**: 書き込み時はクライアントが保持する `version` を `If-Match` で送り, サーバが衝突を検知したら 412 Precondition Failed を返す. レスポンスボディに含まれるサーバ側現行値をクライアントが受け取り, 「サーバ値で上書き / クライアント値を強制再送」をユーザーに確認する UI を出す.
- **楽観 UI の位置**: 楽観 UI はクライアントのアプリケーション層（TanStack Query の mutation）で起動する. UI 層は直接 API クライアントを呼ばない（[`../module-boundaries.md`](../module-boundaries.md) §3, §5.1）.
- **DTO 型の共有方法**: OpenAPI 定義（[`../api/openapi.yaml`](../api/openapi.yaml)）から `openapi-typescript` 等でクライアント型を生成する. OpenAPI が正本.
- **PWA インストール促進**: 初回訪問から数回後にインストールバナーを表示（プラットフォーム標準の install プロンプトを利用）.
- **Service Worker のキャッシュ更新**: 新バージョン配信時はバージョン文字列をマニフェスト / SW に埋め込み, 新 SW が controller になる際に UI でユーザーへ更新通知を表示してリロード誘導する.
- **Clock 抽象の注入**: 「今日 / 翌日」の判定はドメイン層の Clock 抽象を介す. UI 層から直接 `new Date()` などのプラットフォーム時刻 API を呼ばない（[`../module-boundaries.md`](../module-boundaries.md) §6）.
- **OS ネイティブ機能（Push 通知 / OS 通知 / バイブ）に依存しない**: ブラウザ標準 API の範囲で動かす（プロジェクト Out of Scope）.

## 5. 関連ドキュメント

- 抽象アーキテクチャ: [`../overview.md`](../overview.md), [`../module-boundaries.md`](../module-boundaries.md)
- API 実装: [`../api/overview.md`](../api/overview.md)
- Android クライアント実装: [`../android-client/overview.md`](../android-client/overview.md)
- ADR: [`../../adr/0006-distribution-topology.md`](../../adr/0006-distribution-topology.md), [`../../adr/0008-web-client-tech-stack.md`](../../adr/0008-web-client-tech-stack.md), [`../../adr/0010-api-design.md`](../../adr/0010-api-design.md)
