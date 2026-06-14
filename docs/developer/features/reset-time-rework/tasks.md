# タスク: リセット時刻のサーバ TZ 解釈 + UI 整理

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

### サーバ TZ 解釈 (G-1)

- [x] `server/src/use-cases/daily-reset.ts` に `getServerTimeZone()` ヘルパを追加する. 実装は `process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone` を返すだけの薄いラッパとする.
- [x] `calcTodayBoundaryAt(nowIso, dayBoundaryTime, timeZone)` を純関数として実装する. `timeZone` を引数で受け取り, 内部で `process.env` / グローバル状態を参照しない. 「サーバ TZ 上の当日 YYYY-MM-DD」を `Intl.DateTimeFormat` で取り出し, `HH:MM` を組み合わせて UTC ISO に正規化する (アルゴリズムは plan.md 参照).
- [x] `maybeRunDailyReset` 内で `getServerTimeZone()` を呼んで TZ を解決し, その結果を `calcTodayBoundaryAt` の `timeZone` 引数として渡す.
- [x] `needsDailyReset` のシグネチャ・挙動は据え置き (比較対象 ISO の意味だけ変わる) を確認する.
- [x] `purgeTrash` 側で `calcTodayBoundaryAt` を呼んでいる箇所があれば同期して TZ 引数を渡す.
- [x] サーバ起動時 (`server/src/main.ts` or `server/src/app.ts`) に「解決した TZ」を 1 行ログ出力する (運用上の確認用).

### Local Reset Usecase の整合 (G-2)

- [x] `web/src/usecases/local-reset-usecase.ts` の `calcPreviousBoundary` 呼び出し側が `timezone` 引数に端末 TZ (`Intl.DateTimeFormat().resolvedOptions().timeZone`) をフォールバックとして渡しているかを確認する.
- [x] サーバ由来の `dayBoundaryTimezone` に依存するパスが残っていれば, 「端末 TZ をフォールバックとして使う」方針に揃える.

### UI: ラベル変更 (G-3)

- [x] `web/src/ui/settings-view/settings-view.tsx` の `<label htmlFor="day-boundary-time">境界時刻</label>` を「リセット時刻」に変更する (htmlFor / id は据え置き).
- [x] `docs/user/faq.md` の「境界時刻」表記を「リセット時刻」に置き換える.
- [x] `docs/user/` 配下を grep して他に「境界時刻」表記があれば置き換える.

### UI: 重複表示撤去 (G-4)

- [x] `web/src/ui/settings-view/settings-view.tsx` から `<div className="settings-view__current" aria-label="設定値">...</div>` ブロックを削除する.
- [x] `web/src/ui/settings-view/settings-view.css` の `.settings-view__current` ルールを削除する.
- [x] `grep "settings-view__current" web/` が 0 件 (または `*.test.*` のみ) であることを確認する.

## テスト

### 単体テスト (server)

- [x] `calcTodayBoundaryAt` の純関数テストに JST / UTC のケースを追加する.
- [x] `needsDailyReset` の挙動が TZ 切替後も冪等であることを確認するケースを追加する.

### 統合テスト (server)

- [x] `maybeRunDailyReset`: サーバ TZ = JST のとき `clock.now()` が JST 03:59 / 04:01 / 10:00 で挙動が想定通りに切り替わるテスト.
- [x] `POST /api/v1/reset` の `appliedBoundaryAt` が「サーバ TZ 上の境界時刻を UTC ISO で表した値」になっているテスト.
- [x] `GET /api/v1/today` 経由の自動リセットも同じ TZ 解釈で動くことの確認.

### 単体テスト (web)

- [x] `web/__tests__/settings-view.test.tsx` で `getByLabelText(/境界時刻/)` を `/リセット時刻/` に置換する.
- [x] `web/__tests__/settings-view.test.tsx` に「`aria-label="設定値"` を持つ独立ブロックが存在しないこと」を保証するテストを追加する.
- [x] 保存後の最新値が input 欄に反映されることをテストする (回帰確認).

### 単体テスト (Local Reset)

- [x] `web/src/usecases/local-reset-usecase.test.ts` で端末 TZ = JST + `dayBoundaryTime = "04:00"` の境界判定ケースを確認する (既存にあるなら据え置き).

## ドキュメント

- [x] `docs/developer/features/daily-reset/spec.md` 非ゴール「タイムゾーン変換は行わない. UTC または `clock.now()` が返す時刻をそのまま使う」を削除し, 「タイムゾーン解釈は [`../reset-time-rework/spec.md`](../reset-time-rework/spec.md) を参照」に置き換える.
- [x] `docs/developer/features/daily-reset/spec.md` 「スコープ境界の明示」セクション内の Gherkin (「本 feature ではタイムゾーン変換を行わない」旨) を削除し, 同じく `reset-time-rework` への参照リンクに置き換える.
- [x] `docs/developer/features/settings-day-boundary/spec.md` 非ゴール「タイムゾーン設定は将来の feature」を, 「サーバ TZ をローカル TZ として既定採用 (`reset-time-rework` で決定). UI からの選択は引き続き非ゴール」に書き換える.
- [x] `docs/user/faq.md` を含む user-facing ドキュメントで「境界時刻」→「リセット時刻」を反映する (G-3 と重複可).
- [x] developer-facing ドキュメント (`docs/developer/architecture/...` 等) の「境界時刻」表記は内部識別子と紐づくため原則据え置き. ただし本 feature の spec / plan / tasks との相互リンクが整合するかを確認する.

## 仕上げ

- [x] 受け入れ基準 (spec.md) を全て満たすことを確認.
- [x] 既存テスト + 新規テストが全件 green.
- [x] typecheck / lint 0.
- [x] auditor レビュー依頼.
