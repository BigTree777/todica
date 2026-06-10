# タスク: 「現在に設定」操作の導線再設計 (set-focus-gesture)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。
> ブランチ: `feature/set-focus-gesture` (BL-043 専用. 他 BL の作業を混ぜない).

## テスト (test-designer: 失敗するテストを先に用意する)

- [x] 新規 `e2e/set-focus-gesture.spec.ts` を作成し, 以下のシナリオを red の状態で用意する (spec §受け入れ基準と対応):
  - [x] AC-1: 一覧の各カードに「現在のタスクにする」button が 1 個ずつ存在し, 強調セクションには存在しない. 「削除 / 明日にする / 完了」の 3 アクションボタンは不変.
  - [x] AC-2: 一覧側タスク B の「現在のタスクにする」クリックで強調セクションに B が表示され, `GET /api/v1/focus` の `currentTaskId` が B.id になる (API 直叩きで検証).
  - [x] AC-3: 設定後にサイドバーから `/focus` へ遷移すると B が大表示される. focus-view のボタンは「削除 / 完了」の 2 つのまま.
  - [x] AC-5: キーボードのみ (Tab + Enter) で focus 設定が完結する (`e2e/keyboard.spec.ts` のパターン踏襲).
  - [x] AC-6: origin="routine" のタスクも focus に昇格できる (ルーティン定義 API でセットアップ).
  - [x] AC-7: `/tomorrow` に「現在のタスクにする」button が存在しない.
  - [x] AC-8: 「現在解除」「現在に設定」の button がどの view にも存在しない. 明示 focus 中のタスクを完了すると自動解除され, 並び先頭が強調される.
  - [x] AC-9: `page.route` で `PUT /api/v1/focus` に 412 / ネットワーク失敗を注入し, 「通信に失敗しました」バナー表示と, その後の再試行成功を検証する.
- [x] `e2e/state-restoration.spec.ts` の skip 中テスト「リロード後も明示的に設定したフォーカス対象が復元される」を skip 解除し, ラベルを「現在のタスクにする」に更新する (AC-4).
- [x] 上記テストが現状の実装で fail する (red) ことを確認する.

## 実装 (implementer: テストを green 化する)

- [x] `web/src/ui/today-view/today-view.tsx` に `setFocusMutation` を再導入する (git `4f2089c~1` の旧実装が下敷き. enqueue / dequeue / offline 分岐は既存 4 mutation と同型).
  - [x] `SetFocusCommand` の import を復活させる.
  - [x] onSuccess: `["today"]` / `["focus"]` を invalidate (既存 `invalidateAll`).
  - [x] onError: `notifyError("通信に失敗しました")` に加えて `["focus"]` を invalidate する (plan D-005. 旧実装との差分).
- [x] `handleSetFocus(taskId: string)` を再導入する (focus 未ロード時は no-op. 解除用の `null` 引数経路は実装しない. plan D-003).
- [x] タスク一覧 (`<ul aria-label="タスク一覧">`) の各カードに `<button type="button">現在のタスクにする</button>` を追加する (配置はアクション 3 ボタンより前 / `PriorityStars` の後. `/* TODO(BL-046) */` マーカーを付ける).
- [x] 強調セクション / `tomorrow-view` / `focus-view` に変更が無いことを確認する (spec REQ-1 / REQ-5 / REQ-6).

## テスト実行 (green 化の確認)

- [x] `e2e/set-focus-gesture.spec.ts` 全シナリオ green.
- [x] `e2e/state-restoration.spec.ts` (skip 解除分含む) green.
- [x] `e2e/a11y.spec.ts` で WCAG 2.1 AA violations 0 件を維持 (AC-10).
- [x] 既存 E2E スイート全体 + web の単体テスト (`vitest`) が green (回帰なし).
- [x] lint / typecheck が通る. (注: 新規/変更ファイル単体では新規違反なし. リポジトリ全体の `npm run lint` / `npm run typecheck` は main 時点から既存エラーで失敗する状態にあり, 本 BL 起因ではない. 別途対処が望ましい)

## ドキュメント

- [x] `docs/developer/planning/backlog.md` の BL-043 を Done に更新し, 実施内容の要約を備考に記す.
- [x] (該当すれば) ユーザー向けドキュメントに「現在のタスクにする」操作を追記する. (確認の結果, `docs/user/` は具体ボタン名を持たない抽象記述のため追記不要と判断)

## 仕上げ

- [x] 受け入れ基準 (spec.md AC-1〜AC-10) を全て満たすことを確認.
- [x] spec.md / plan.md の状態を「確定」に更新 (auditor 承認後).
- [x] auditor にレビュー依頼 (観点: FR-012 カバレッジ / foundation REQ-3・REQ-5 との整合 / 解除 UI 非提供の妥当性 / キーボード経路).
- [x] PR 作成 → マージ後にブランチ削除.
