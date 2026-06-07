# Android クライアント実装

> 抽象アーキテクチャ上の「Android クライアント」コンポーネント（ローカルモード / サーバモードの両対応）を, どの実装方式・端末内永続化機構・モード切替方式で実装するかを示す.
> 抽象側の責務（UI 層 / アプリケーション層 / データソース抽象 / API クライアントアダプタ / ローカル永続化アダプタ / モード切替）は重複して書かない. 抽象側を参照すること.

## 1. 対応する抽象概念

- 抽象アーキテクチャ概要: [`../overview.md`](../overview.md) §2「構成方針」, §5.2「Web / Android サーバモード」, §5.3「Android ローカルモード」.
- モジュール境界: [`../module-boundaries.md`](../module-boundaries.md) §3「クライアント側の層と責務」, §4.4「Android クライアントのモジュール一覧」.
- 永続化機構（ローカルモード端末内）: [`../database/overview.md`](../database/overview.md).
- API 通信契約（サーバモード時）: [`../api/overview.md`](../api/overview.md).

## 2. 採用技術

| レイヤ | 採用 | 代替案 |
| --- | --- | --- |
| 実装方式 | Capacitor で Web 実装（TypeScript + React）を Android にラップ | ネイティブ Kotlin + Jetpack Compose / Flutter |
| ローカルモード端末内永続化 | Capacitor SQLite プラグイン（`@capacitor-community/sqlite` 等） — 詳細は [`../database/overview.md`](../database/overview.md) | Room / sqflite / drift |
| サーバモード API クライアント | Web と同じ TypeScript 実装の API クライアントを再利用 | プラットフォーム固有のクライアント |
| モード切替方式 | 設定画面でいつでも切替可能. **切替 = 初期化**（旧モードの端末内データを全消去, 同期は行わない） | 初回起動時のみ選択 |
| モード保存先 | Capacitor Preferences | （他案は採らない） |
| 配布 | Google Play Store | （他の配布チャネルは扱わない） |

## 3. 採用理由 / 参照 ADR

- 実装方式: [ADR-0009](../../adr/0009-android-client-tech-stack.md)
  - Web と同一コードベースで個人 1 人開発のコスト重複を最小化（NFR-031 と整合, ADR-0009 §決定 A）.
  - ローカル / サーバ両モードの切替を「データソース抽象の実装入れ替え」で吸収できる（ADR-0009 §「ローカル / サーバモードの実装方針」, [`../module-boundaries.md`](../module-boundaries.md) §5.3）.
- 端末内永続化: [ADR-0009](../../adr/0009-android-client-tech-stack.md) §「ローカルモード時の永続化」.
- モード切替方式: [ADR-0009](../../adr/0009-android-client-tech-stack.md) §「ローカル / サーバモードの実装方針」（いつでも切替可. 切替 = 初期化. 同期しないことが単純さの根拠）.
- API プロトコル / 認証（サーバモード時）: [ADR-0010](../../adr/0010-api-design.md).
- 配布構成: [ADR-0006](../../adr/0006-distribution-topology.md).
- 境界時刻処理の時刻基準（ローカルモード時）: [ADR-0011](../../adr/0011-day-boundary-time-source.md).

## 4. 実装上の注意点

- **WebView ベースの体感制約**: ネイティブと比べた UI 体感（ハプティクス・アニメーション）は限定的になる. OS 通知 / Push 通知は Out of Scope なので致命傷ではない（[ADR-0009](../../adr/0009-android-client-tech-stack.md) §結果 / 影響）.
- **モード切替 = 初期化**: モード切替はユーザーが設定画面でいつでも行えるが, 切替時に「現在のモードのデータは初期化されます」と確認ダイアログを必須で出す. 確認後は旧モードの端末内データを全消去してから新モードに入る. ローカル ⇔ サーバの同期は行わない（これが「いつでも切替可能」を単純に保つ根拠）.
- **サーバモード時のオフライン耐性**: Web クライアントと同じく Service Worker + IndexedDB 書込キュー + Background Sync で実現（[ADR-0008](../../adr/0008-web-client-tech-stack.md)）. Capacitor の WebView でも PWA の Service Worker は動作する.
- **ローカルモード時の書込み**: 書込キュー不要. 端末内 SQLite に直接反映する（端末内が正本）.
- **データソース抽象の切替点**: モードに応じて Repository の実装（API クライアントアダプタ / ローカル永続化アダプタ）を注入する. UI / アプリケーション層はモードを直接 if 分岐しない（[`../module-boundaries.md`](../module-boundaries.md) §5.3）.
- **ローカルモードの Clock**: 端末時刻を Clock 抽象の実装として注入する. リセット処理は「アプリ起動時」と「フォアグラウンド境界時刻到達時」の両経路を持つ（[ADR-0011](../../adr/0011-day-boundary-time-source.md)）.
- **プラグイン保守ウォッチ**: Capacitor の SQLite プラグインはコミュニティ製のため, 採用後にメンテナンス状況を継続的にウォッチする（[ADR-0009](../../adr/0009-android-client-tech-stack.md) §結果 / 影響）.
- **Play Store 公開要件**: Google Play Store の審査基準・ターゲット SDK バージョン等の要件は本書では網羅しない. 公開直前の運用ドキュメントで扱う.
- **データ持ち込みは仕様化外**: 「Web で IndexedDB に溜めたデータを Android ローカルに持ち込む」「ローカルモードのデータをサーバに移送する」は本実装では対応しない. 必要になれば feature spec で扱う.

## 5. 関連ドキュメント

- 抽象アーキテクチャ: [`../overview.md`](../overview.md), [`../module-boundaries.md`](../module-boundaries.md)
- Web クライアント実装（共有元）: [`../web-client/overview.md`](../web-client/overview.md)
- 永続化実装: [`../database/overview.md`](../database/overview.md)
- API 実装: [`../api/overview.md`](../api/overview.md)
- ADR: [`../../adr/0006-distribution-topology.md`](../../adr/0006-distribution-topology.md), [`../../adr/0009-android-client-tech-stack.md`](../../adr/0009-android-client-tech-stack.md), [`../../adr/0010-api-design.md`](../../adr/0010-api-design.md), [`../../adr/0011-day-boundary-time-source.md`](../../adr/0011-day-boundary-time-source.md)
