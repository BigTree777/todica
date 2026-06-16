# タスク: 起票カードを + ボタン展開式に変更する

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

### AppShell

- [ ] `web/src/ui/app-shell/app-shell.tsx` に `useLocation` / `useSearchParams` を追加し、
      `isCreateRoute(pathname)` ヘルパで現在ルートを判定する (D-002)。
- [ ] + ボタン (`.app-shell__create`) を更新ボタンの左側に追加する。
      `aria-label` をルートに応じて切替 (D-006), `aria-expanded` を
      `searchParams.get("create") === "1"` から導出する (REQ-12)。
- [ ] + ボタン押下時に `setSearchParams` で `create=1` を立てるハンドラを実装する
      (他クエリ保持)。
- [ ] 非対象ルート (/focus, /settings, /trash, /setup, /login など) では + ボタンを
      render しない (D-002 / REQ-2)。
- [ ] `web/src/ui/app-shell/app-shell.css` に `.app-shell__create` のスタイルを追加する
      (D-003 / REQ-14 / REQ-15)。shadow / hover / transition は使わない。

### today-view

- [ ] `web/src/ui/today-view/today-view.tsx` に `useSearchParams` を導入し、
      `formOpen` を導出する (D-001)。
- [ ] `<TaskFormCard>` を `{formOpen && (...)}` で条件付き描画に変更する (REQ-4)。
- [ ] `<TaskFormCard>` props に `onCancel` を渡す。`onCancel` は `setSearchParams` で
      `create` を削除する (REQ-5 / REQ-9)。
- [ ] フォーム展開時 (`formOpen` true への遷移) に先頭 input (`#task-name`) に
      focus を移す `useEffect` を追加する (REQ-10)。
- [ ] `formOpen` true 中の `keydown: Escape` ハンドラを追加し、フォームを閉じる
      (REQ-6)。閉じた経路がキャンセル / Escape の場合は + ボタンに focus を戻す
      (REQ-13 / D-005)。
- [ ] `createMutation` onSuccess で `setSearchParams` を呼び、`create` を削除する
      (REQ-7 / D-004)。失敗時は何もしない (フォーム保持 / REQ-8)。
- [ ] フォームを閉じる際に name / projectId / priority の各 state をクリアする
      (REQ-9)。

### tomorrow-view

- [ ] `web/src/ui/tomorrow-view/tomorrow-view.tsx` に today-view と同じ
      formOpen / onCancel / Escape / 成功時 close / focus 復帰の各処理を追加する。
- [ ] `<TaskFormCard>` を条件付き描画に変更する (REQ-4)。

### projects-view

- [ ] `web/src/ui/projects-view/projects-view.tsx` に同様の formOpen / onCancel /
      Escape / 成功時 close / focus 復帰の各処理を追加する。
- [ ] `<ProjectFormCard>` を条件付き描画に変更する (REQ-4)。

### routines-view

- [ ] `web/src/ui/routines-view/routines-view.tsx` に同様の formOpen / onCancel /
      Escape / 成功時 close / focus 復帰の各処理を追加する。
- [ ] `<RoutineFormCard>` を条件付き描画に変更する (REQ-4)。

### FormCard 共通

- [ ] `<TaskFormCard>` に `onCancel: () => void` props を追加する。
      カード内に「キャンセル」ボタンを追加する (REQ-5)。
- [ ] `<ProjectFormCard>` に同等の `onCancel` props と「キャンセル」ボタンを追加する。
- [ ] `<RoutineFormCard>` に同等の `onCancel` props と「キャンセル」ボタンを追加する。

## テスト

### 新規テスト

- [ ] 単体: AppShell の + ボタン表示 / 非表示 / aria-label / aria-expanded を
      ルート別に検証 (AC-1 / AC-2 / AC-3 / AC-12)。
- [ ] 単体: + 押下で `?create=1` がついた URL に遷移する (AC-4 / AC-5)。
- [ ] 単体 (today-view): 初期状態で `<TaskFormCard>` が描画されない (AC-11)。
- [ ] 単体 (today-view): `?create=1` 付き URL で `<TaskFormCard>` が描画され、
      先頭 input に focus が移る (AC-4)。
- [ ] 単体 (today-view): キャンセル / Escape で `<TaskFormCard>` が消え、
      + ボタンに focus が戻る (AC-6 / AC-7)。
- [ ] 単体 (today-view): 起票成功で自動 close され、入力欄が空になる (AC-8)。
- [ ] 単体 (today-view): 起票失敗時にフォームと入力値が保持される (AC-9)。
- [ ] 単体: tomorrow-view / projects-view / routines-view でも同様のシナリオを検証。
- [ ] E2E: 4 ビューで + → 入力 → 追加 → 一覧反映 の main path
      (`tasks.spec.ts`, `projects.spec.ts`, `routines.spec.ts`,
      `tomorrow-view.spec.ts`, `today-view-create-form.spec.ts`)。
- [ ] E2E: /focus, /settings, /trash で + ボタンが見えない (AC-3)。
- [ ] E2E: + / 更新 / ハンバーガーの 3 ボタンが重ならない (AC-10)。

### 既存テスト追従 (spec の「既存テスト追従が必要なファイル」を参照)

- [ ] `e2e/tasks.spec.ts` を + 押下ステップ込みに更新。
- [ ] `e2e/projects.spec.ts` を + 押下ステップ込みに更新。
- [ ] `e2e/routines.spec.ts` を + 押下ステップ込みに更新。
- [ ] `e2e/tomorrow-view.spec.ts` を + 押下ステップ込みに更新。
- [ ] `e2e/today-view-create-form.spec.ts` を + 押下ステップ込みに更新。
- [ ] `e2e/remove-inline-project-create.spec.ts` の起票フォーム関連箇所を更新。
- [ ] `e2e/keyboard.spec.ts` のタスク起票キーボード操作箇所を更新。
- [ ] `e2e/a11y.spec.ts` の起票フォーム関連箇所を更新。
- [ ] `web/__tests__/today-view.test.tsx` を + 押下込みに更新。
- [ ] `web/__tests__/tomorrow-view.test.tsx` を + 押下込みに更新。
- [ ] `web/__tests__/unified-day-view.test.tsx` を + 押下込みに更新。
- [ ] `web/__tests__/task-form-card-select.test.tsx` を + 押下込みに更新
      (フォームを開く必要があれば)。
- [ ] `web/__tests__/task-form-grid-layout.test.tsx` を + 押下込みに更新
      (同上)。
- [ ] `web/__tests__/task-form-select-compact.test.tsx` を + 押下込みに更新
      (同上)。
- [ ] `web/__tests__/routine-form-card-header-layout.test.tsx` を + 押下込みに更新
      (同上)。
- [ ] `web/__tests__/inline-edit-all-cards.test.tsx` の起票フォーム関連箇所を更新。

## ドキュメント

- [ ] `docs/developer/planning/backlog.md` の BL-104 を Doing → Done に進める
      (実装完了時)。
- [ ] 必要に応じて関連 feature (`hamburger-nav`, `reload-button` 等) の spec /
      plan に「現在状態」として + ボタンとの位置関係を追記する (履歴表現は使わない)。

## 仕上げ

- [ ] 受け入れ基準 AC-1 〜 AC-11 を満たすことを確認する。
- [ ] lint / typecheck 0 エラーを確認する。
- [ ] vitest 全件 green を確認する。
- [ ] Playwright 全件 green を確認する。
- [ ] `auditor` にレビュー依頼。
