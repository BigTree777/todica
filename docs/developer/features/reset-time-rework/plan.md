# 設計・実装計画: リセット時刻のサーバ TZ 解釈 + UI 整理

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

- TZ 解釈はサーバプロセスのローカル TZ (Node.js プロセスが認識する TZ. `TZ` 環境変数 / OS 設定) を「正本の TZ」として採用する. ドメイン層には `Intl.DateTimeFormat` で wall clock を取り出して比較する純関数を置き, ユースケース層がそれを呼ぶ.
- UI 変更はラベル文言と DOM 構造の小さな差し替えのみ. props / state / repository / OpenAPI / DB schema は触らない.
- 既存 spec (`daily-reset` / `settings-day-boundary`) の非ゴール記述は「サーバ TZ をローカル TZ として既定採用する」へ最小決定として更新する. ユーザー設定としての TZ 入力 UI は引き続き別 BL.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 無改修 (OpenAPI / エンドポイント / リクエスト・レスポンス schema は据え置き). |
| DB | 無改修 (`settings.dayBoundaryTime` / `counter.lastResetExecutedAt` の型・カラム名は据え置き). |
| ドメイン / モジュール | `server/src/use-cases/daily-reset.ts` の `calcTodayBoundaryAt` / `needsDailyReset` を, サーバ TZ 上の壁時計比較に置き換える. 必要に応じて TZ ヘルパ純関数を切り出す. `web/src/usecases/local-reset-usecase.ts` は同方針 (= 端末 TZ 上の壁時計比較) を維持・整合確認. |
| UI | `web/src/ui/settings-view/settings-view.tsx`: ラベル「境界時刻」→「リセット時刻」. `<div className="settings-view__current">` ブロックの撤去. `web/src/ui/settings-view/settings-view.css` の `.settings-view__current` を削除. |
| docs (user) | `docs/user/faq.md` の「境界時刻」→「リセット時刻」. 他 user-facing で同表記があれば追従. |
| docs (developer) | `docs/developer/features/daily-reset/spec.md` 非ゴール「タイムゾーン変換は行わない」と「スコープ境界の明示」内の Gherkin (該当部分) を削除し, 本 feature (`reset-time-rework`) への参照リンクに置き換える. `docs/developer/features/settings-day-boundary/spec.md` 非ゴール「タイムゾーン設定は将来の feature」を更新. 内部識別子の説明は据え置き. ADR-0011 への追記は不要 (T3 ハイブリッドの大方針は維持). |
| テスト | `server` 側: `calcTodayBoundaryAt` / `needsDailyReset` / `maybeRunDailyReset` のテストに「サーバ TZ = JST のとき」「サーバ TZ = UTC のとき」のケースを追加. `web` 側: SettingsView のラベル変更・重複表示撤去に対応するテスト更新. Local Reset Usecase の TZ ケースを既存テストの延長で確認. |

## 設計詳細

### データモデル

- 変更なし. `settings.dayBoundaryTime` は HH:MM の文字列のまま. `counter.lastResetExecutedAt` は UTC ISO 文字列のまま (永続化形式は変えない).
- 「サーバ TZ」は永続化しない. プロセス起動時の `process.env.TZ` (もしくは `Intl.DateTimeFormat().resolvedOptions().timeZone`) を都度参照する.

### 処理フロー (サーバ日次リセット判定)

1. ユースケース層 `maybeRunDailyReset(deps)` が `now = deps.clock.now()` (UTC ISO) と `settings.dayBoundaryTime` を取得する.
2. `maybeRunDailyReset` が `getServerTimeZone()` を呼んでサーバ TZ を解決する. このヘルパは `process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone` を返す (TZ 名解決ロジックの所在は呼び出し側に置き, ドメイン純関数には持ち込まない).
3. `calcTodayBoundaryAt(nowIso, dayBoundaryTime, timeZone)` で「サーバ TZ 上の当日の境界時刻」を UTC ISO 文字列として算出する. 関数は副作用を持たない純関数で, TZ 名は引数で受け取る (`process.env` / `Intl` を内部で参照しない). アルゴリズムは下記.
4. `needsDailyReset(nowIso, lastResetExecutedAt, todayBoundaryAtIso)` で要否判定. 比較は UTC ISO 文字列の lex 比較 = 時間順序比較で成立する (既存と同じ).
5. 必要ならリセット処理本体 (繰越, completedCount=0, lastResetExecutedAt 更新, purgeTrash 呼び出し) を実行.

### `calcTodayBoundaryAt` のアルゴリズム (サーバ TZ 上の壁時計時刻 → UTC ISO)

入力: `nowIso` (UTC ISO), `dayBoundaryTime` (HH:MM), `timeZone` (IANA TZ 名).
出力: 「サーバ TZ 上で当日 (= nowIso をサーバ TZ で見たときの YYYY-MM-DD) の HH:MM」に相当する瞬間を UTC ISO で表した文字列.

シグネチャ: `calcTodayBoundaryAt(nowIso: string, dayBoundaryTime: string, timeZone: string): string`. 純関数とし, `process.env` / グローバル状態を内部で参照しない. `timeZone` は呼び出し側 (`maybeRunDailyReset`) が `process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone` で解決して渡す.

1. `nowIso` を `new Date(nowIso)` で `Date` オブジェクト化.
2. `Intl.DateTimeFormat("en-CA", { timeZone, year, month, day, hour, minute, hour12: false })` で `formatToParts` を呼び, サーバ TZ 上の `Y/M/D h:m` を取り出す.
3. 取り出した `Y-M-D` と `dayBoundaryTime` から「ローカル壁時計上の `Y-M-D T HH:MM:00`」の瞬間を構成し, その瞬間に対応する UTC ISO を求める.
4. UTC ISO の算出は `local-reset-usecase.ts` の `calcPreviousBoundary` と同じ「正午基準でオフセットを推定」アプローチで足りる. DST は考慮しないため, 当日中の `boundaryHour:Min` でも同じオフセットを適用する.
5. 結果を `YYYY-MM-DDTHH:MM:00.000Z` 形式で返す.

注: 既存実装が `nowIso.slice(0, 10)` で UTC 日付部分を取って末尾 `Z` 固定で連結していた箇所はこのアルゴリズムに置き換わる. 関数名 `calcTodayBoundaryAt` は維持 (内部識別子の rename 非ゴール).

### `needsDailyReset` の挙動

- 現状のままで良い (UTC ISO 文字列の lex 比較). 比較対象 (`todayBoundaryAt`) が「サーバ TZ 上の当日境界時刻を UTC ISO で表した値」に変わるだけ.

### Local Reset Usecase (BL-020) の追従

- `web/src/usecases/local-reset-usecase.ts` は既に `calcPreviousBoundary(now: Date, boundaryTime: string, timezone: string)` で TZ 引数を受ける形になっており, 端末 TZ 上の壁時計比較を行う設計が入っている. 本 feature では: (a) このユースケースの起動経路が `timezone` 引数として端末 TZ (例: `Intl.DateTimeFormat().resolvedOptions().timeZone`) を渡しているかを実機経路で確認する. (b) もし「サーバから取得した dayBoundaryTimezone」に依存しているコードパスが残っていれば, 「端末 TZ をフォールバックとして使う」方針へ整合させる.

### UI: ラベル変更

- `web/src/ui/settings-view/settings-view.tsx`:
  - 変更前: `<label htmlFor="day-boundary-time">境界時刻</label>`
  - 変更後: `<label htmlFor="day-boundary-time">リセット時刻</label>`
- `htmlFor` の値 (`day-boundary-time`) と `<input id="day-boundary-time">` は据え置く.
- 既存テスト `web/__tests__/settings-view.test.tsx` で `getByLabelText(/境界時刻/)` を使っている箇所はテスト側を `getByLabelText(/リセット時刻/)` に更新する.

### UI: 重複表示の撤去

- `web/src/ui/settings-view/settings-view.tsx`:
  - 削除対象:
    ```tsx
    {settings && (
      <div className="settings-view__current" aria-label="設定値">
        <span>{settings.dayBoundaryTime}</span>
      </div>
    )}
    ```
  - 代わりに input 欄 (`value={inputValue}`) のみが現在値の表示と編集を兼ねる.
- `web/src/ui/settings-view/settings-view.css` の `.settings-view__current` セレクタを削除する.
- 既存テストで `aria-label="設定値"` を参照しているものがあれば削除 or 「存在しないこと」を保証するテストに置き換える.

### user docs の文言統一

- `docs/user/faq.md` Q「日次リセットの時刻は変えられますか?」回答中の「境界時刻」を「リセット時刻」に置き換える.
- 他 user-facing なドキュメントを grep して同様に置換する (`docs/user/` 配下を対象とする).
- developer-facing なドキュメント (`docs/developer/`) の「境界時刻」は内部識別子と密に対応するため原則据え置く. ただし本 feature の spec 同士で参照される表現は「リセット時刻 (内部識別子は `dayBoundaryTime`)」のように両方明示しても良い.

### developer spec の整合更新 (daily-reset / settings-day-boundary)

- `docs/developer/features/daily-reset/spec.md`:
  - 非ゴール節の「タイムゾーン変換は行わない. UTC または `clock.now()` が返す時刻をそのまま使う」記述を削除し, 「タイムゾーン解釈は [`../reset-time-rework/spec.md`](../reset-time-rework/spec.md) を参照」に置き換える.
  - 「スコープ境界の明示」セクション内の Gherkin (「本 feature ではタイムゾーン変換を行わない」旨) を削除し, 同じく `reset-time-rework` への参照リンクを置く.
- `docs/developer/features/settings-day-boundary/spec.md`:
  - 非ゴール「タイムゾーン設定は将来の feature」を, 「サーバ TZ をローカル TZ として既定採用する (`reset-time-rework` で決定). UI からの選択は引き続き非ゴール」に書き換える.

### 例外 / エラー処理

- `getServerTimeZone()` が異常値 (`undefined` / 無効な TZ 名) を返したケースは Node.js が `Intl.DateTimeFormat` でエラーを投げる. 本 feature では「サーバ運用設計上, TZ は常に有効値である」前提に立ち, 起動時にこの値を一度ログ出力するに留める. 異常 TZ 名のときの代替挙動 (UTC fallback 等) はテスト対象外.

## 重要な決定

- **D-1: サーバ TZ をローカル TZ として既定採用する**
  - 入力 UI を作らない代わりに, ユーザーが「サーバ運用 = JST」を前提にできる. ADR-0011 (T3 ハイブリッド) の方針 (サーバモード時はサーバ時刻が正本) に整合.
  - 既存仕様 (`daily-reset` / `settings-day-boundary`) の非ゴール記述を本 feature で更新する. ADR-0011 本体は据え置き (大方針は変わらないため).
- **D-2: 内部識別子は無改修**
  - `dayBoundaryTime` / `calcTodayBoundaryAt` / OpenAPI フィールド名 / DB カラム名は据え置く. 変更コストを「ユーザーに見える文言」に局所化する.
- **D-3: 重複表示は撤去**
  - input 欄の `value` で現在値を兼ねる. 別の read-only 表示は持たない.
- **D-4: DST は考慮しない**
  - JST 運用前提. DST 切替時刻周辺の挙動を保証する必要が出たら別 BL.
- **D-5: ADR 化はしない**
  - 大方針 (T3 ハイブリッド) は ADR-0011 が既に決めており, 本 feature はその細則 (どの TZ を採用するか) を埋める変更. 独立 ADR は作らない.

## リスク / 代替案

- **リスク R-1: サーバ TZ が JST 以外で運用されたときに挙動が変わる**
  - 緩和策: `getServerTimeZone()` の解決結果を起動時ログに出す. 運用ドキュメントに「サーバプロセスの TZ がリセット時刻の解釈基準である」と明記する.
- **リスク R-2: 既存 server テスト (`calcTodayBoundaryAt` を UTC で固定検証している箇所) が壊れる**
  - 緩和策: テスト中で `process.env.TZ = "UTC"` を明示してから assert する形に統一すれば, UTC ケースは引き続き同じ期待値で通る. JST ケースは新規追加.
- **リスク R-3: クライアントから dayBoundaryTime の表示形式が変わって見える可能性**
  - 表示形式 (HH:MM) は不変. 「JST 04:00 のつもりで入れたものが UTC 04:00 として動いていた」現象が無くなるだけ. user docs に「サーバ TZ で解釈される」と一文追記する程度で十分.
- **代替案 A-1: 専用の TZ 設定を `settings` に追加して永続化する**
  - 不採用. UI を増やす必要があり, 本 feature のスコープが膨らむ. サーバ TZ 採用で目的 (JST 04:00 でリセット発火) は達成できる.
- **代替案 A-2: クライアントが TZ を渡し, サーバはクライアント TZ で計算する**
  - 不採用. ADR-0011 「サーバモード時はサーバ時刻が正本」と整合しないため.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

- **ドメイン純関数テスト**: `calcTodayBoundaryAt(nowIso, dayBoundaryTime, timeZone)` の単体テスト.
  - JST + `04:00` + 当日 JST 04:01 → 期待値は当日 JST 04:00 の UTC ISO.
  - JST + `04:00` + 当日 JST 03:59 → 期待値は当日 JST 04:00 の UTC ISO (= 比較で「今日の境界はまだ未到来」と判定される側).
  - UTC + `04:00` + 当日 UTC 04:01 → 期待値は当日 UTC 04:00 (= 既存 UTC 挙動と一致).
- **ユースケーステスト**: `maybeRunDailyReset` の TZ シナリオ.
  - サーバ TZ = JST のとき, `clock.now()` を JST 03:59 / 04:01 / 10:00 と切り替えてリセット判定が想定通りに切り替わるか.
  - JST 04:05 で一度実行した後の再呼び出しが no-op (冪等) であること.
- **HTTP テスト** (`server/src/app.test.ts` 系): `POST /api/v1/reset` の `appliedBoundaryAt` が「サーバ TZ 上の境界時刻を UTC ISO で表した値」になるか.
- **Local Reset Usecase テスト**: 既存テストに端末 TZ = JST の境界ケースが残っているか確認. 必要なら追加.
- **UI テスト** (`web/__tests__/settings-view.test.tsx`):
  - ラベルが「リセット時刻」と表示される.
  - `aria-label="設定値"` を持つ重複表示ブロックが存在しない.
  - 既存の保存・楽観ロック・バリデーションテストはラベル文字列の差し替えのみで通る.
- **CSS / dead code チェック**: `grep "settings-view__current" web/` が 0 件であること.
- **既存 spec 文書の整合性**: `daily-reset/spec.md` / `settings-day-boundary/spec.md` の非ゴール記述が本 feature の決定と一致していること (テストではなく auditor が確認).
