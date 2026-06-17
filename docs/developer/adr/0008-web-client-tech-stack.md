## ADR-0008: Web クライアント技術スタック（サーバ接続前提）

> ADR-0006 で確定した「Web は自前サーバ接続必須」を前提に, Web クライアントの言語・UI フレームワーク・ビルドを選定する.

- 状態: 承認（2026-06-07）
- 日付: 2026-06-05
- 決定者: プロジェクトオーナー（個人開発）

## 背景 / 状況

- Web クライアントは **常に自前サーバに接続** する（ADR-0006）. ブラウザ単独でデータを完結させない.
- ただし通信断時にも最小限の読み取り表示・楽観的更新が許容されるべき（個人運用のサーバ可用性は SLA 100% ではない）. キャッシュ層を持つ.
- 開発者は個人 1 人. OSS で公開（NFR-050）.
- サーバ側を Node.js + TypeScript で書く想定（ADR-0007 推奨案）であるため, クライアントも TypeScript にすると DTO 型を共有できる利点が大きい.
- ADR-0003（旧）の前提（Web を Capacitor で Android にラップして 1 コードで配布）は崩れた. Android は別 ADR（0009）で扱うため, 本 ADR では **Web 単独としての最適解** を考える.

## 検討した選択肢

| 選択肢 | 利点 | 欠点 |
| --- | --- | --- |
| A: TypeScript + React + Vite（SPA. 永続化はサーバ + IndexedDB 等のローカルキャッシュ） | エコシステムが厚く OSS 事例が豊富. ライブラリ選定の自由度が高い. React Query / SWR 等のサーバ状態管理ライブラリで通信キャッシュ・楽観 UI が定型化できる. サーバ側 TS との型共有が容易. | React 自体の学習曲線とランタイムサイズ. Hooks の流儀に慣れが必要. |
| B: TypeScript + Svelte / SvelteKit | バンドルサイズが小さく, 個人 OSS のロード性能で有利. リアクティビティの記述が簡潔. | 周辺ライブラリ事例が React に比べて少ない. SvelteKit の SSR / ルーティング前提を持ち込むと個人運用の構成が重くなる側面. |
| C: TypeScript + Vue 3 + Vite | テンプレ + Composition API で個人 1 人にも書きやすい. エコシステムも厚い. | React と比べると OSS 事例数で劣る. サーバ状態管理ライブラリ（Pinia + Vue Query 等）の選択肢が React より絞られる. |

## 決定

**A（TypeScript + React + Vite, PWA）を採用する.** ライブラリ・配信方式まで本 ADR で確定する.

### 採用ライブラリ・ツール（確定）

| 役割 | 採用 | 備考 |
| --- | --- | --- |
| 言語 | TypeScript | サーバ（Hono / ADR-0007）と DTO 型共有 |
| UI フレームワーク | React | エコシステム・事例量・型共有のしやすさ |
| ビルド | Vite | 開発速度・HMR |
| ルーティング | React Router | de facto |
| サーバ状態管理 | TanStack Query | キャッシュ・楽観 UI・リトライ・ミューテーション管理 |
| クライアント状態管理 | React 組込み（useState / useReducer / Context） | 規模的に追加ライブラリ不要 |
| HTTP クライアント | 標準 `fetch` | TanStack Query と組合せ. Axios は採用しない |
| テストランナー | Vitest | Vite と統合 |
| Lint / Format | Biome | 単一ツールで Lint + Format |
| PWA | `vite-plugin-pwa`（Workbox ベース） | Service Worker / Manifest 生成 |
| クライアント永続化 | IndexedDB（Service Worker 経由のキャッシュ + 書込キュー） | `idb` ライブラリ（薄いラッパー） |
| アイコン | `lucide-react` | カード系アクション button のアイコン化（✓ / 🗑️ / 📌 / ⏭ / ⏮ / ✕ / +） |

### PWA としての配信

- **Web Manifest** を持ち, Android / iOS / Desktop からホーム画面にインストールできる.
- **Service Worker** で:
  - シェル（HTML / JS / CSS）を pre-cache（オフライン起動可能）
  - API レスポンスを stale-while-revalidate で読み取りキャッシュ
  - **書込みは Background Sync API + IndexedDB キュー** で「オンライン復帰時に自動再送」を実現
- インストール後はネイティブアプリ的に独立ウィンドウで起動する.
- ADR-0006 の「Web は自前サーバ接続必須」は引き続き有効. ただし PWA インストール + オフライン書込キューによって **「通信断中も操作を継続でき, 復帰時にサーバへ反映される」** ことを保証する.

### オフライン書込キュー（採用）

通信断時の振る舞いを次のとおり確定する.

- **読み取り**: TanStack Query の cache + Service Worker のキャッシュで耐える. 正本はサーバ.
- **書き込み**: クライアント側 IndexedDB に書込キューを保持し, 接続復帰時に Background Sync で自動再送する.
  - 書き込み API は **冪等性キー（`Idempotency-Key` ヘッダ）必須**（再送による二重登録を防ぐ. 詳細は ADR-0010）.
  - **競合解決**: 楽観ロック（クライアントの `If-Match: <version>` をサーバが検証）. 衝突時はサーバ側の値を正本としてクライアントに返し, **UI でユーザーに「サーバ値で上書き / クライアント値を再送」を確認**.
  - **同期メタデータ**: Task / Project / Routine / Counter / Settings / FocusSelection の各エンティティに `version`（整数, 楽観ロック用）を追加. `updatedAt`（ISO 8601, 既存）を同期判断にも兼用する. クライアント生成 ID は `id` 自体を UUID v4 にし, `Idempotency-Key` も同値を使う（schema.md 反映）.

## 結果 / 影響

- 良い影響
  - サーバ・クライアントが同じ言語で書け, 型共有 / DTO 共有が現実的になる.
  - PWA + オフライン書込キューにより, サーバ可用性 100% でなくても操作が継続できる.
  - PWA はインストール可能なため, **Android への配信を PWA / TWA（Trusted Web Activity）で代替できる可能性** がある（ADR-0009 で再評価）.
- トレードオフ / 注意点
  - オフライン書込キューと楽観ロックを採用するため, スキーマに `version`（楽観ロック用整数）を追加し, API 全体に冪等性キーを必須化する必要がある（schema.md / ADR-0010 に反映）.
  - 競合解決 UI（サーバ値 vs クライアント値の選択）の実装コストが追加で発生する. 単一ユーザー前提なので衝突頻度は低いが, ロジックは必要.
  - Service Worker のキャッシュ無効化（リリース時の更新通知 UX）は実装段階で運用パターンを確定する.
- 関連: [`0006-distribution-topology.md`](0006-distribution-topology.md), [`0007-server-tech-stack.md`](0007-server-tech-stack.md), [`0009-android-client-tech-stack.md`](0009-android-client-tech-stack.md), [`0010-api-design.md`](0010-api-design.md)
