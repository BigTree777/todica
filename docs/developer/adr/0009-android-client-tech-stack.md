## ADR-0009: Android クライアント技術スタック（ローカル / サーバ両モード対応）

> ADR-0006 で確定した「Android はローカルモードとサーバモードのいずれかを選べる」要件を満たす技術スタックを選定する.

- 状態: 承認（2026-06-07）
- 日付: 2026-06-05
- 決定者: プロジェクトオーナー（個人開発）

## 背景 / 状況

- Android クライアントは **ローカルモード** と **サーバモード** の 2 つを取り得る（ADR-0006）.
  - ローカルモード: 端末内 DB のみ使用. サーバを使わない. Web とは独立.
  - サーバモード: 自前サーバに接続. Web と同じデータを見る.
- 最終目標は Google Play Store 公開（NFR-030, project.md §1, §11 CONSTRAINT-003）.
- 開発者は個人 1 人. 学習・保守コストを最小化したい（CONSTRAINT-001, NFR-032）.
- 「コードを大きく作り直さずに Android アプリ化できる」という ASM-003 / NFR-031 はある程度尊重する. ただし「Web と完全に同一コードベース」を絶対条件にはしない（ADR-0006 の決定により, Web には別の最適解があり得るため）.
- データモデル（タスク / プロジェクト / ルーティン / カウンタ / 設定）はサーバ側と同じ構造を共有する（architecture/database/schema.md）. ローカルモードはこの構造を端末内 DB に持つ.

## 検討した選択肢

| 選択肢 | 利点 | 欠点 |
| --- | --- | --- |
| A: Web と同じ TypeScript + React 実装を **Capacitor で Android にラップ**. ローカルモードは Capacitor のストレージプラグイン（SQLite / Secure Storage 等）で端末内永続化. サーバモードは Web と同じ API クライアントを使う. | 1 コードベース（Web ↔ Android）で済むため個人 1 人開発の負荷が最小. Web で動くものをそのまま Android で配布できる経路（NFR-031）が明確. ローカルモード / サーバモードの切替は同じ TypeScript レイヤで抽象化できる. | WebView ベースのため OS ネイティブの体感（ハプティクス・アニメーション）は限定的. Capacitor プラグインの選定 / 保守コストが乗る. |
| B: Android ネイティブ実装（Kotlin + Jetpack Compose）. ローカルモードは Room/SQLite, サーバモードは同じ自前サーバの REST/JSON を叩く. | Android のネイティブ体感が最も良い. Play Store 審査・公開のフローが最も枯れている. | Web と別コードベースになり, ロジック（リセット処理 / 繰越 / フォーカス繰り上げ等）を Kotlin で重複実装する必要がある. 個人 1 人開発のコストが最も重い. |
| C: Flutter（Dart）で Web / Android 両対応 | 1 コードベースで両プラットフォーム対応. Android はネイティブに近い体感. | Dart 言語固定で Web 側のエコシステム（OSS 公開時の貢献者層）と乖離する. Web ビルドの初期 HTML/JS が大きく, OSS の Web 体験としてはやや重い. サーバ側 TypeScript との DTO 型共有も別経路（codegen）が必要. |

## 決定

**A（Capacitor で Web 実装を Android ラップ）を採用する.** ADR-0008 の Web 実装（React + Vite + PWA）と同一 TypeScript / React コードベースを共有する.

- 採用理由
  - 個人 1 人開発の最大の制約はコード重複であり, Web と Android を同一実装で書けることが最も効く.
  - ローカル / サーバ両モードを「データソース抽象の実装入れ替え」で吸収できるため, 2 モード対応のコストが現実的に収まる.
  - NFR-031（同一コードベースから Android 配布可能）を最も直線的に満たせる.
- 代替案を取らない理由
  - B（ネイティブ Kotlin）/ C（Flutter）はコード重複が大きく, 個人 1 人開発で維持できない.

## ローカルモード / サーバモードの実装方針

- クライアント内に **「データソース」抽象** を 1 つ置く（`TaskRepository` / `ProjectRepository` 等. architecture/module-boundaries.md のデータアクセス層と同義）.
- ローカルモードでは **Capacitor SQLite プラグイン**（`@capacitor-community/sqlite`）を介した端末内 DB アダプタを, サーバモードでは **HTTP API クライアントアダプタ** を, それぞれデータソース抽象の実装として注入する.
- **モード切替: いつでも可能. ただし「切替 = 初期化」と定義する**.
  - ユーザーは設定画面でいつでもモードを切り替えられる.
  - 切替時はユーザーに「現在のモードのデータは初期化されます」と確認ダイアログを出す.
  - 確認後, 旧モードの端末内データを全消去（ローカルモード時は SQLite を空にする / サーバモード時は端末内キャッシュ + 書込キューを空にする. サーバ側のデータには触れない）.
  - **ローカル ⇔ サーバの同期は行わない**（複雑性の唯一の根拠. 同期を持たないからこそ「切替可能」が単純に保てる）.
- サーバモード時のオフライン耐性は ADR-0008 と同方針（Service Worker + IndexedDB 書込キュー + Background Sync）. Capacitor の WebView でも PWA の Service Worker は動作する.
- ローカルモード時はオフライン書込キュー不要（端末内 SQLite が正本のため）. 書込みは直接 SQLite に反映する.
- 同期メタデータ（`version` / `updatedAt`）はサーバモード時のみ意味を持つ. ローカルモードでは保持はするが楽観ロック検証はクライアント単独で完結.

## ローカルモード時の永続化

- A（Capacitor）: 公式 / コミュニティの SQLite プラグイン（@capacitor-community/sqlite 等）を主候補とする. データ規模に対して十分で, スキーマは architecture/database/schema.md と共有可能.
- B（ネイティブ Kotlin）: Room / SQLite.
- C（Flutter）: sqflite / drift.

## 結果 / 影響

- 良い影響
  - 1 コードベースで Web / Android を維持できる（推奨案）.
  - データソース抽象を 1 段噛ませることで, ローカル / サーバの両モードに同じユースケース層が乗る.
- トレードオフ / 注意点
  - WebView ベースである以上, OS ネイティブの体感は限定的（OS の通知や Push 通知は Out of Scope なので致命傷ではない）.
  - Capacitor プラグインの安定性は時期によって差がある. 採用後にプラグインのメンテ状態をウォッチする必要がある.
  - 「Web 側で IndexedDB に保存していたデータを Android に持ち込みたい」というユースケースは, 仕様化されていないので本 ADR では扱わない.
- 関連: [`0006-distribution-topology.md`](0006-distribution-topology.md), [`0007-server-tech-stack.md`](0007-server-tech-stack.md), [`0008-web-client-tech-stack.md`](0008-web-client-tech-stack.md), [`0010-api-design.md`](0010-api-design.md), [`../architecture/overview.md`](../architecture/overview.md), [`../architecture/module-boundaries.md`](../architecture/module-boundaries.md)

## 補足: モード切替を「初期化」とした根拠

「いつでも切替可能」と「切替時の同期ロジック不要」を両立させるための核心は **「ローカルとサーバを同期させない」** という設計判断にある.

- 同期があると: 切替時に「どちらの値が新しいか」「衝突した場合どうするか」というロジックが必要 → 複雑化
- 同期がない: 切替時は単に旧モードのデータを破棄して新モードを空から始めるだけ → 単純

ユーザーには「モード切替 = リセット相当の操作」であることを UI で明示する. 「両モードのデータを保持したい」場合はモードを固定するか, 個別エクスポート（将来 feature）に委ねる.
