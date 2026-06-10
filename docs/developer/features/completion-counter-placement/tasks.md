# タスク: 完了タスク数カウンタの配置見直し

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [ ] `web/src/ui/today-view/today-view.css` を新規作成し、`.today-view__header` と
      `.today-view__completion-count` のスタイル（デザイントークン参照）を定義する。
- [ ] `today-view.tsx` の `<header>` 内インラインスタイルを `className="today-view__header"` に移行し、
      `today-view.css` を import する。
- [ ] カウンタ要素（`<div aria-label="今日の完了タスク数"><span>今日の完了: {completionCount}</span></div>`）
      を `<header>` の外から内に移動し、`<span className="today-view__completion-count" aria-label="今日の完了タスク数">今日の完了: {completionCount}</span>` に変更する。
      h1 と「＋プロジェクトの追加」ボタンの間に配置する。

## テスト

- [ ] `web/__tests__/today-view.test.tsx` の BL-008 describe ブロック全件（完了数表示の 5 シナリオ）が green であることを確認する。
- [ ] カウンタが header の子孫に存在することを確認する単体テストを追加する（spec.md「配置」シナリオに対応）。
- [ ] `e2e/state-restoration.spec.ts` の完了数リロード復元テストが green であることを確認する。

## ドキュメント

- [ ] `docs/developer/planning/backlog.md` の BL-047 を `In Progress` から `Done` に更新し、
      実施内容のメモを追記する（tasks.md 完了後）。

## 仕上げ

- [ ] 受け入れ基準（spec.md）の全シナリオを満たすことを確認する。
- [ ] `grep 'TODO(BL-046)' web/src/` に新たな漏れがないことを確認する（今回追加する CSS ファイルに
      トークン未参照の暫定値を残さない）。
- [ ] レビュー依頼（auditor への依頼）。
