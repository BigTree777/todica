# 仕様: リセット時刻のサーバ TZ 解釈 + UI 整理

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-091
- 由来要件: FR-041 (境界時刻の設定 / UI ラベル変更による意味の改変は無し), FR-043 (繰越), FR-051 (completedCount リセット), NFR-020 (冪等性)
- 関連 ADR: [ADR-0011](../../adr/0011-day-boundary-time-source.md) (T3 ハイブリッド時刻設計)
- 関連先行 feature:
  - [`../settings-day-boundary/spec.md`](../settings-day-boundary/spec.md) (BL-009. `dayBoundaryTime` の設定・取得. TZ に関する非ゴール記述は本 feature を参照する)
  - [`../daily-reset/spec.md`](../daily-reset/spec.md) (BL-010. リセット判定・実行. TZ 解釈の正本は本 feature とする)
  - [`../android-local-mode/spec.md`](../android-local-mode/spec.md) (BL-020. Local Reset Usecase. ローカルモード側の TZ 解釈も本 feature と同方針で揃える)

## 背景 / 課題

ユーザーが SettingsView で `dayBoundaryTime = "04:00"` を入力した場合, ユーザーは「サーバプロセスのローカル TZ (運用上は JST) の 04:00」で日次リセットが発火することを期待している. しかし実装上は `calcTodayBoundaryAt(nowIso, dayBoundaryTime)` が `${dateStr}T${dayBoundaryTime}:00.000Z` と末尾 `Z` を固定で付与しており, `clock.now()` (`SystemClock` は `new Date().toISOString()` を返す UTC ISO) と比較する際に `dayBoundaryTime` も **UTC として** 解釈される. 結果として JST 04:00 (= UTC 19:00 前日) を越えても日次リセットが発火せず, JST 13:00 (= UTC 04:00) で初めて発火する.

`daily-reset/spec.md` は非ゴール「タイムゾーン変換は行わない. UTC または `clock.now()` が返す時刻をそのまま使う」, `settings-day-boundary/spec.md` は非ゴール「タイムゾーン設定は将来の feature」と書き, タイムゾーン解釈は明示的に先送り宣言されている. ただしユーザーは「Web 入力を UTC とする仕様を決めた覚えはない」状態であり, 現状は仕様の宣言と利用者の期待が乖離している.

加えて SettingsView では:

- `<label>境界時刻</label>` というラベルがユーザー向けには直感的でない (「リセット時刻」のほうがリセット動作との対応が明示的).
- input 欄とは別に `<div className="settings-view__current"><span>{settings.dayBoundaryTime}</span></div>` が現在値を薄く表示しており, input 欄が同じ値を保持・編集できるため二重表示になっている.

本 feature では (1) TZ 解釈の修正, (2) UI ラベルとユーザー向け文言の整理, (3) SettingsView の重複表示撤去, の 3 点を一括で対応する.

## ゴール / 非ゴール

### ゴール

- **G-1: サーバ TZ 解釈の確定 (TZ 解釈の修正)**
  - サーバの日次リセット判定で, `dayBoundaryTime` を **サーバプロセスのローカル TZ** (Node.js プロセスが認識している TZ. `TZ` 環境変数または OS 設定で決まる) の壁時計時刻として解釈する.
  - `clock.now()` の戻り値 (UTC ISO) はサーバプロセスのローカル TZ で年・月・日・時・分に分解し, `dayBoundaryTime` (HH:MM) との比較もそのローカル TZ 上の壁時計時刻同士で行う.
  - サーバ TZ が JST (`Asia/Tokyo`) のとき `dayBoundaryTime = "04:00"` であれば, JST 04:00 をまたいだ最初のリセット判定でリセットが発火する.
  - 既存 spec の非ゴール記述 (`daily-reset/spec.md`「タイムゾーン変換は行わない」/ `settings-day-boundary/spec.md`「タイムゾーン設定は将来 feature」) は本 feature を参照する形に置き換え, 「サーバプロセスの TZ をローカル TZ として既定採用する」を正本とする. ユーザー向けタイムゾーン入力 UI, multi-TZ 対応, タイムゾーン名のサーバ保存等の本格対応は引き続き別 BL とする.
- **G-2: Android ローカルモードの整合 (TZ 解釈の修正)**
  - Android ローカルモード (BL-020) の Local Reset Usecase (`web/src/usecases/local-reset-usecase.ts`) が UTC 比較に依存している箇所があれば, クライアントプロセスのローカル TZ で壁時計時刻を取り出して比較する方針 (= サーバ側の G-1 と同じ精神) に揃える.
- **G-3: UI ラベルの統一 (UI ラベル変更)**
  - SettingsView の `<label>境界時刻</label>` を「リセット時刻」に変更する.
  - ユーザー向けドキュメント (`docs/user/faq.md` 等) の「境界時刻」表記を「リセット時刻」に統一する.
  - 内部識別子 (`dayBoundaryTime` プロパティ名 / `calcTodayBoundaryAt` 関数名 / OpenAPI の Settings スキーマ / DB カラム名 / domain 型名等) は **無改修**. ユーザーに見える文言だけを変更する.
- **G-4: SettingsView の重複表示撤去 (UI 整理)**
  - `web/src/ui/settings-view/settings-view.tsx` の `<div className="settings-view__current">...</div>` を撤去する.
  - 関連 CSS クラス (`.settings-view__current`) と既存テスト (例: `web/__tests__/settings-view.test.tsx` のこのブロックを参照しているケース) を整合させる.
  - 現在値は input 欄の `value` で表示と編集を兼ねる構造に統一する.

### 非ゴール

- **タイムゾーン入力 UI / multi-TZ 設定の追加**: ユーザーが UI からタイムゾーンを選ぶ機能は別 BL. 本 feature ではサーバプロセスの TZ を採用するのみ.
- **DST (夏時間) の精緻な扱い**: JST 運用を前提とし, DST は考慮しない. サーバ TZ が DST 持ち地域 (`America/New_York` 等) のときに切替日付の境界判定が前後 1 時間ずれる可能性があるが, 本 feature ではこれを許容する. DST 切替時刻周辺の境界判定挙動を厳密化する必要が出たら別 BL で対応する.
- **内部識別子の rename**: `dayBoundaryTime` を `resetTime` 等に改名しない. OpenAPI フィールド名 / DB カラム名 / TypeScript プロパティ名 / 関数名は全て据え置く.
- **境界時刻に関する他の責務の見直し**: タスク繰越 (FR-043) / completedCount リセット (FR-051) / ゴミ箱清算 (FR-062) のロジック自体は変更しない. 比較の TZ 基準だけを変える.
- **本ターン外のクライアントモード**: サーバ TZ が変わったとき, クライアントが TZ を取得・表示する仕組みは作らない (サーバ側で計算済みの状態だけクライアントが受け取る ADR-0011 の方針を維持).
- **重複表示撤去後の補助的 read-only 表示**: SettingsView は input 欄の `value` のみで現在値の表示と編集を兼ね, 別途 read-only 表示は持たない.

## 要件

### 機能要件

- **FR-G1-1: サーバ TZ 上の壁時計時刻で境界判定する**
  - サーバ日次リセットは `clock.now()` をサーバプロセスのローカル TZ に解釈し直し, その TZ 上の年月日と `dayBoundaryTime` (HH:MM) を組み合わせて「今日の境界時刻」を決める.
  - 比較対象 (`counter.lastResetExecutedAt`, `clock.now()`) も同一の TZ 基準で扱う. UTC ISO のまま素朴な文字列比較で済む現行構造に縛られない.
- **FR-G1-2: 既存仕様文書の更新**
  - `daily-reset/spec.md` の非ゴール「タイムゾーン変換は行わない」と「スコープ境界の明示」内の Gherkin (「本 feature ではタイムゾーン変換を行わない」旨) は削除し, 本 feature (`reset-time-rework`) への参照リンクに置き換える. TZ 解釈の正本は本 feature の受け入れ基準とする.
  - `settings-day-boundary/spec.md` の非ゴール「タイムゾーン設定は将来の feature」を, 本 feature の決定 (サーバ TZ をローカル TZ として暗黙採用. UI からの選択は引き続き非ゴール) に整合する記述へ書き換える.
  - 既存仕様の責務範囲は縮小せず, 既存の受け入れ基準の意味は維持する.
- **FR-G2-1: Local Reset Usecase の TZ 整合**
  - `web/src/usecases/local-reset-usecase.ts` の境界判定が, クライアントプロセスのローカル TZ (端末 TZ) で壁時計時刻を扱う形になっていることを確認し, 必要なら追従修正する.
- **FR-G3-1: SettingsView ラベル変更**
  - `web/src/ui/settings-view/settings-view.tsx` の `<label htmlFor="day-boundary-time">境界時刻</label>` を「リセット時刻」に変更する.
  - `<input>` の `id` / `htmlFor` 等の内部識別子 (`day-boundary-time`) は据え置く (= 既存テストや CSS セレクタの影響を最小化する).
- **FR-G3-2: user 向け文言の統一**
  - `docs/user/faq.md` の「境界時刻」表記を「リセット時刻」に置き換える.
  - 他に user-facing なドキュメントで「境界時刻」を使っている箇所があれば同様に置き換える.
  - developer-facing なドキュメント (`docs/developer/...`) は内部識別子と整合性を取る形で原則据え置く. ただし spec / plan の更新で自然な範囲は追従する.
- **FR-G4-1: SettingsView の重複表示撤去**
  - `web/src/ui/settings-view/settings-view.tsx` の `<div className="settings-view__current" aria-label="設定値">...</div>` を削除する.
  - `.settings-view__current` の CSS ルールが他で参照されていなければ削除する.
  - input 欄 (`value={inputValue}`) が現在値の表示と編集を兼ねる.

### 非機能要件

- **NFR-冪等性 (NFR-020)**: 既存 BL-010 と同じく, リセットは複数回呼ばれても 1 回分しか反映されない. TZ 解釈を変えても冪等性は維持する.
- **NFR-互換性**: OpenAPI / DB schema / domain 型は無改修. クライアント `repositories/settings-repository.ts` の型・メソッドシグネチャも無改修.
- **NFR-退行防止**: 既存 BL-009 / BL-010 の受け入れ基準のうち, TZ に無関係なもの (バリデーション, 楽観ロック, 冪等性キー, タスク繰越, completedCount リセット等) は本 feature の適用範囲内でも同じ挙動を保つ.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. Gherkin の Given/When/Then で表現する.

### (G-1) サーバ TZ 解釈

```
シナリオ: サーバ TZ = JST, dayBoundaryTime = "04:00", JST 04:01 にリセット判定するとリセット必要と判定される
  Given サーバプロセスの TZ が Asia/Tokyo
  And   dayBoundaryTime = "04:00"
  And   clock.now() が JST 04:01 に対応する UTC ISO ("…T19:01:00.000Z" 当日前日付) を返す
  And   counter.lastResetExecutedAt = null
  When  リセット判定を行う
  Then  リセット必要と判定される
```

```
シナリオ: サーバ TZ = JST, dayBoundaryTime = "04:00", JST 03:59 にリセット判定するとリセット不要と判定される
  Given サーバプロセスの TZ が Asia/Tokyo
  And   dayBoundaryTime = "04:00"
  And   clock.now() が JST 03:59 に対応する UTC ISO を返す
  And   counter.lastResetExecutedAt = null
  When  リセット判定を行う
  Then  リセット不要と判定される
```

```
シナリオ: サーバ TZ = JST, dayBoundaryTime = "04:00", 当日 04:00 以降にリセット済みなら no-op
  Given サーバプロセスの TZ が Asia/Tokyo
  And   dayBoundaryTime = "04:00"
  And   clock.now() が当日 JST 10:00 に対応する UTC ISO を返す
  And   counter.lastResetExecutedAt が当日 JST 04:05 に対応する UTC ISO に等しい
  When  リセット判定を行う
  Then  リセット不要と判定される (冪等)
```

```
シナリオ: サーバ TZ = UTC, dayBoundaryTime = "04:00", UTC 04:01 にリセット必要
  Given サーバプロセスの TZ が UTC
  And   dayBoundaryTime = "04:00"
  And   clock.now() = "…T04:01:00.000Z" (UTC 04:01)
  And   counter.lastResetExecutedAt = null
  When  リセット判定を行う
  Then  リセット必要と判定される
  ※ サーバ TZ が UTC のときは UTC 解釈と挙動が一致する.
```

```
シナリオ: POST /api/v1/reset の appliedBoundaryAt はサーバ TZ 04:00 を UTC ISO 表現に正規化した値を返す
  Given サーバプロセスの TZ が Asia/Tokyo
  And   dayBoundaryTime = "04:00"
  And   clock.now() が JST 04:01 に対応する UTC ISO を返す
  When  POST /api/v1/reset を送る
  Then  200 OK で { executed: true, appliedBoundaryAt: <JST 当日 04:00 に対応する UTC ISO> } が返る
  ※ 文字列表現は UTC ISO 8601. 値の意味はサーバ TZ 上の壁時計 04:00.
```

### (G-2) Local Reset Usecase の整合

```
シナリオ: 端末 TZ = JST のローカルモードで dayBoundaryTime = "04:00" のとき JST 04:01 でリセットが発火する
  Given Android ローカルモードで端末 TZ が Asia/Tokyo
  And   settings.dayBoundaryTime = "04:00"
  And   counter.lastResetExecutedAt = null
  And   clock.now() が JST 04:01 に対応する UTC ISO を返す
  When  Local Reset Usecase の起動時判定を行う
  Then  リセット処理が実行される
```

### (G-3) UI ラベル変更

```
シナリオ: SettingsView の入力欄ラベルが「リセット時刻」になっている
  Given SettingsView を開く
  When  画面を確認する
  Then  入力欄のラベルテキストが「リセット時刻」と表示されている
  And   入力欄の id は "day-boundary-time" のまま (内部識別子は据え置き)
```

```
シナリオ: docs/user/faq.md の「日次リセットの時刻は変えられますか?」回答が「リセット時刻」表記になっている
  Given docs/user/faq.md を開く
  When  該当の Q/A を確認する
  Then  「境界時刻」という文言が「リセット時刻」に置き換わっている
```

### (G-4) SettingsView の重複表示撤去

```
シナリオ: SettingsView に独立した「設定値」表示ブロックが存在しない
  Given SettingsView を開く
  When  画面を確認する
  Then  aria-label="設定値" を持つ <div className="settings-view__current"> 相当の要素は存在しない
  And   現在値は入力欄の value として表示されている (例: "04:00")
```

```
シナリオ: 保存後の最新値は入力欄に反映される
  Given SettingsView が開かれており input 欄に "04:00" が表示されている
  When  ユーザーが input 欄に "06:00" を入力して保存操作をする
  And   サーバが 200 OK で dayBoundaryTime = "06:00" を返す
  Then  入力欄の value が "06:00" になっている
  And   別の「現在値表示ブロック」は表示されない (= 二重表示しない)
```

### 既存挙動の維持

```
シナリオ: dayBoundaryTime のバリデーション・楽観ロック・冪等性は本 feature の影響を受けない
  Given BL-009 / BL-010 の受け入れ基準で TZ に依存しないシナリオ群
  When  本 feature の実装下で同じシナリオを実行する
  Then  全て BL-009 / BL-010 と同じ結果になる
```

```
シナリオ: 内部識別子は据え置き
  Given OpenAPI の Settings スキーマ / DB schema / TypeScript 型
  When  ソースを検索する
  Then  `dayBoundaryTime` というプロパティ名 / カラム名 / フィールド名が定義されている
  And   `calcTodayBoundaryAt` という関数名が定義されている (引数として `timeZone` を受け取る)
```

## 確定事項

- **TZ 解釈**: サーバプロセスのローカル TZ (Node.js プロセスが認識する `process.env.TZ` または OS 設定) を「正本の TZ」として採用する.
- **DST**: 考慮しない (非ゴールに記載).
- **重複表示撤去後の UX**: input 欄の `value` のみで現在値を表示・編集する. 別の read-only 表示は追加しない (非ゴールに記載).
- **`calcTodayBoundaryAt` のシグネチャ**: TZ 名 (`string`) を引数に追加した純関数 `calcTodayBoundaryAt(nowIso, dayBoundaryTime, timeZone)` とする. デフォルト値 `process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone` の解決は呼び出し側 `maybeRunDailyReset` (server) で行う. アルゴリズムの詳細は [`plan.md`](plan.md) を参照.
- **`daily-reset/spec.md` の Gherkin**: 「本 feature ではタイムゾーン変換を行わない」旨の記述および非ゴール記述は削除し, 本 feature (`reset-time-rework`) への参照リンクに置き換える.
