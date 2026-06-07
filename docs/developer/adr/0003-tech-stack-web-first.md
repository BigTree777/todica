## ADR-0003: 技術スタックの選定（Web 先行・Android 展開を見据える）

> 本 ADR は「Web と Android を単一コードベースで配布するクライアント単体構成」を前提として記述されていたが, 構成前提が「Web=自前サーバ接続必須 / Android=ローカル or サーバ選択可」に修正されたため Superseded とする. Web クライアントの技術スタックは [ADR-0008](0008-web-client-tech-stack.md), Android クライアントの技術スタックは [ADR-0009](0009-android-client-tech-stack.md) で改めて扱う.

- 状態: 廃止（→ [ADR-0008](0008-web-client-tech-stack.md), [ADR-0009](0009-android-client-tech-stack.md)）
- 日付: 2026-06-05（廃止: 2026-06-05）
- 決定者: プロジェクトオーナー（個人開発）

## 背景 / 状況

- Web を先行プラットフォーム, Android アプリ化を Phase 4 のゴールとする（requirements.md §4, NFR-031）.
- 開発者は個人 1 人（CONSTRAINT-001, NFR-032）であり, 学習コスト・保守コストを最小化したい.
- OSS で公開する前提（NFR-050）.
- 単一ユーザー・ローカル前提（NFR-021）であるため, サーバサイドの言語選定は不要. クライアント側だけで完結する SPA / PWA を想定する.
- 永続化方式は ADR-0004 で別途決定するが, 本 ADR の技術スタックは「ブラウザの永続化 API（IndexedDB 等）に乗れること」「同一ソースから Android へ移植できること」を満たす必要がある.

## 検討した選択肢

| 選択肢 | 利点 | 欠点 |
| --- | --- | --- |
| A: TypeScript + React + Vite + PWA, Android は Capacitor / TWA でラップ | React と Vite の知見が豊富で OSS エコシステムが厚い. PWA で Web 配布が即可能. Capacitor で WebView ベースに Android 化でき, 単一コードベースを維持しやすい. 個人開発の作業量に対するリターンが高い. | WebView ベースのため Android のネイティブな体感には届かない. Capacitor の独自プラグイン採用時はそこの保守が増える. |
| B: TypeScript + Svelte / SvelteKit + Vite + PWA, Android は Capacitor | バンドルが小さく, 1 人開発でも読みやすい. 学習コストが React より低いと感じる人もいる. | エコシステムと求人/採用に比べて, 個人 OSS だと外部からのフィードバックが集まりにくい可能性. React に比べると Capacitor 周辺の事例が少ない. |
| C: Flutter（Dart）で Web / Android 両対応 | 単一フレームワークで Android がネイティブに近い体感で出せる. UI 構築力が高い. | 言語が Dart に固定され, Web 側のエコシステム（OSS 公開時の貢献者層）と乖離する. Web ビルドは生成 HTML/JS が大きく, OSS の Web 体験としてはやや重い. |

## 決定

**現時点では A（TypeScript + React + Vite + PWA, Android は Capacitor）を推奨案として提示し, B / C を代替案として併記する. 確定はユーザー判断を仰ぐ.**

- 推奨理由
  - 個人 1 人開発における習得コスト・周辺 OSS の豊富さ・PWA / Capacitor の事例量を考えると, 短期で MVP に到達できる確度が最も高い.
  - 同一コードベースから Android へ展開する（NFR-031）目的に対し, Capacitor は最も摩擦が少ない.
  - 永続化を IndexedDB に置く想定（ADR-0004 候補 A）と相性が良い.
- ただし以下のいずれかに該当する場合, 本決定は再評価する.
  - オーナーが Svelte / SvelteKit に強い好みを持つ場合は B に切り替える（コア要件は満たせる）.
  - Android のネイティブ感を最優先する場合は C を検討するが, OSS としての貢献導線・Web 表示性能とトレードオフになる.

## 結果 / 影響

- 良い影響
  - 個人 OSS として最も外部に届きやすい技術選定になる.
  - Web で動くものをそのまま Android で配布する Phase 4 の経路が成立する.
- トレードオフ / 注意点
  - WebView ベースである以上, OS ネイティブの体感（ハプティクス・通知センター連携など）は限定的になる. Todica は通知を Out of Scope としている（OOS-007 リマインダー通知）ため, この制約は許容範囲.
  - 本 ADR は外形の選定に留め, 具体的なライブラリ（状態管理・テストランナー・Lint）は feature spec / implementer の責務に委ねる.

## 廃止理由（2026-06-05 追記）

本 ADR の前提だった「クライアント単体で完結する SPA / PWA, Android は同じ Web 実装を WebView ラップで配布」は, 構成前提の修正により崩れた. 修正後の前提は次のとおり.

- Web クライアントは **必ず自前サーバに接続** する（ブラウザ単独で完結しない）.
- Android クライアントは **ローカルモード / サーバモードのいずれかを選べる** ことが要件であり, 「Web 実装をそのまま WebView でラップする」だけでは要件を満たさない可能性がある.

このため Web / Android の技術スタックは別 ADR で改めて検討する.

- Web 単独の技術スタック検討 → [ADR-0008](0008-web-client-tech-stack.md)
- Android（ローカル / サーバ両モード対応）の技術スタック検討 → [ADR-0009](0009-android-client-tech-stack.md)

- 関連: [`0006-distribution-topology.md`](0006-distribution-topology.md), [`0008-web-client-tech-stack.md`](0008-web-client-tech-stack.md), [`0009-android-client-tech-stack.md`](0009-android-client-tech-stack.md), [`../architecture/overview.md`](../architecture/overview.md)
