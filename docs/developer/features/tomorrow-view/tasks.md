# タスク: 「明日のタスク」独立ビュー (tomorrow-view)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 順番は **TDD**: 失敗するテストを書く → 実装で green 化する → リファクタの順に並べる. test-designer / implementer に渡す.

## 失敗するテストを書く (red)

### サーバ統合テスト (Vitest)

- [ ] T-001: `server/__tests__/integration/tasks.test.ts` に `?dueDate` シナリオを追加する.
  - シナリオ A (受け入れ基準: dueDate=tomorrow): 事前にタスク A (dueDate="today") / B (dueDate="tomorrow") を起票. `GET /api/v1/tasks?dueDate=tomorrow` の応答 `tasks` 配列が `[B]` のみであることを確認.
  - シナリオ B (受け入れ基準: dueDate=today): 同じ前提で `GET /api/v1/tasks?dueDate=today` の応答が `[A]` のみであることを確認.
  - シナリオ C (受け入れ基準: 未指定 / 既存挙動): 同じ前提で `GET /api/v1/tasks` (dueDate なし) の応答が `[A, B]` 両方を含むことを確認. 並び順は priority → createdAt → id のサーバ側ソート規則に従う.
  - シナリオ D (受け入れ基準: 不正値 / 寛容バリデーション): `GET /api/v1/tasks?dueDate=yesterday` の応答が C と同じく `[A, B]` 両方を含むこと. 既存 `?trashed` の不正値挙動と整合.
  - シナリオ E (trashed との直交性): タスク B (dueDate=tomorrow) を delete してゴミ箱に入れた状態で `GET /api/v1/tasks?dueDate=tomorrow` (trashed 未指定 = 既定 "false") の応答に B が含まれないことを確認. `?dueDate=tomorrow&trashed=true` で逆に B が含まれることを確認.

### クライアント単体テスト (Vitest + React Testing Library)

- [ ] T-002: `web/__tests__/tomorrow-view.test.tsx` を新規作成し `<TomorrowView />` 単体テストを書く. `web/__tests__/today-view.test.tsx` の `renderWithQueryClient` / `makeMockTaskRepository` / `makeMockProjectRepository` のパターンを踏襲する.
  - シナリオ A (REQ-1 一覧描画): `repository.list({ dueDate: "tomorrow" })` が `[B (highest), A (normal), D (later)]` を返すモックで, `<ul aria-label="明日のタスク一覧">` の `<li>` がこの順で 3 件描画される. クライアントで再ソートしない (モック戻り値の順番をそのまま使う) ことを確認.
  - シナリオ B (REQ-1 サーバ呼び出し): `repository.list` が `{ dueDate: "tomorrow" }` 引数で 1 回呼ばれることを spy で確認.
  - シナリオ C (REQ-2 起票フォームの構成): `queryByRole("textbox", { name: /タスク名/ })` / `queryByRole("combobox", { name: /プロジェクト/ })` / `queryByRole("combobox", { name: /優先度/ })` / `queryByRole("button", { name: /追加/ })` が全て存在する. **`queryByRole("combobox", { name: /期限|明日|today|tomorrow/ })` が null** (期限 UI が無いこと).
  - シナリオ D (REQ-2 起票成功): タスク名「明日の買い物」を入力し「追加」を押す → `repository.create` が `{ name: "明日の買い物", dueDate: "tomorrow", projectId: null, priority: "normal", id: <生成> }` で 1 回呼ばれる.
  - シナリオ E (REQ-2 invalidate): 起票成功後に `["tomorrow"]` query が invalidate される (`repository.list` が 2 回目の呼び出しを受ける).
  - シナリオ F (REQ-4 「今日にする」): 一覧描画した状態で「今日にする」ボタンを `userEvent.click` → `repository.update` が `{ id: task.id, ifMatch: task.version, patch: { dueDate: "today" } }` で 1 回呼ばれる.
  - シナリオ G (REQ-4 invalidate): 「今日にする」成功後に `["tomorrow"]` / `["today"]` / `["focus"]` の 3 query が invalidate される (D-004).
  - シナリオ H (REQ-5 削除): 「削除」ボタンを `userEvent.click` → `repository.delete` が `{ id, ifMatch }` で 1 回呼ばれる.
  - シナリオ I (REQ-5 invalidate): 削除成功後に `["tomorrow"]` が invalidate される. `["focus"]` は invalidate されない (D-006).
  - シナリオ J (REQ-6 空状態): `repository.list` が `[]` を返すモックで「明日のタスクはありません」が表示される. 同時に起票フォーム (タスク名 / プロジェクト / 優先度 / 追加ボタン) は表示されたままであることを確認.
  - シナリオ K (REQ-3 アクション数): 一覧描画状態で 1 件目の `<li>` 内の `getAllByRole("button")` が「削除」「今日にする」の 2 つのみ. 「完了」「明日にする」「明日へ」「優先度切替」「編集」「現在に設定」が存在しないこと (`queryByRole` で null) を確認.
  - シナリオ L (REQ-7 ConflictDialog / update 経路): `repository.update` が `OptimisticLockError` を throw するモックで「今日にする」押下後に `ConflictDialog` が表示される (見出し / role / aria-label で確認).
  - シナリオ M (REQ-7 ConflictDialog / delete 経路): `repository.delete` が `OptimisticLockError` を throw するモックで「削除」押下後に `ConflictDialog` が表示される.
  - シナリオ N (REQ-7 / BL-034 notifyError): `repository.update` (もしくは create / delete) が一般エラーを throw するモックで, ボタン押下後に `notifyError` が呼ばれる (`error-notification` モジュールを `vi.spyOn` で監視).
  - シナリオ O (D-014 routine 由来タスクも区別なく表示): tasks 配列に `origin: "routine"` の tomorrow タスクを混ぜても通常通り描画され, 「今日にする」「削除」が押せることを確認.

### 結合テスト

- [ ] T-003: `web/__tests__/router.test.tsx` を確認し, `/tomorrow` の遷移テストが placeholder の「準備中 (BL-038)」を assert している場合は実コンポーネントの見出し「明日のタスク」 + 起票フォーム (もしくは空状態テキスト) の存在に追従させる.
  - BL-036 でこのテストが追加されていなければ T-003 は skip.

### E2E (任意, Playwright)

- [ ] T-004 (任意): `e2e/tomorrow-view.spec.ts` を新規作成し以下を red 状態で書く.
  - シナリオ P (起票): 起動 → `/tomorrow` 遷移 → タスク名「牛乳」入力 + 「追加」 → 一覧に「牛乳」が出る.
  - シナリオ Q (「今日にする」移送): `/tomorrow` で「今日にする」を押す → タスクが `/tomorrow` から消える → `/today` に遷移するとそのタスクが今日タスク一覧に出る.
  - シナリオ R (削除): `/tomorrow` で「削除」を押す → タスクが `/tomorrow` から消える → `/trash` に遷移するとゴミ箱に出る.
  - シナリオ S (空状態): tomorrow タスク 0 件で「明日のタスクはありません」が表示される.

### 既存 sidebar-nav E2E の追従

- [ ] T-005: `e2e/sidebar-nav.spec.ts` 内で `/tomorrow` 遷移後の assert が「準備中 (BL-038)」テキストを参照している場合は, 本 BL での実コンポーネント置換に合わせて見出し「明日のタスク」のみを assert する形に更新する.
  - 見出し「明日のタスク」のみを使っている場合は無改修.

## 実装で green 化する (green)

### サーバ補強

- [ ] T-006: `server/src/data/task-repository.ts` の `ListTasksFilter` 型に `dueDate?: "today" | "tomorrow"` を追加 (plan.md §「サーバ補強の手順」手順 1).
  - 既存呼び出し (`{ trashed: "false" }` 等) は無改修で通ること.

- [ ] T-007: `server/src/infra/persistence/drizzle/task-repository.ts` の `list()` の where 句を修正 (plan.md §「サーバ補強の手順」手順 2).
  - 既存の `trashed` 3 分岐 (`"true"` / `"false"` / `"all"`) に `filter.dueDate` の AND 条件を組み合わせる.
  - `filter.dueDate` が undefined なら既存挙動 (dueDate 絞り込みなし) を保つ.
  - `filter.trashed === "all"` かつ `filter.dueDate === undefined` の組み合わせで where 句が空になるケースもケアする (全件返す).

- [ ] T-008: `server/src/app.ts` の `GET /api/v1/tasks` で dueDate query を読む (plan.md §「サーバ補強の手順」手順 3).
  - `c.req.query("dueDate")` を読み, `"today"` / `"tomorrow"` のみ受理.
  - それ以外は undefined (寛容バリデーション / D-002).
  - `taskRepository.list({ trashed, ...(dueDate ? { dueDate } : {}) })` の形で渡す.
  - ソート (`sortTasks`) は無改修.

### クライアント repository 拡張

- [ ] T-009: `web/src/repositories/task-repository.ts` の `TaskRepository.list()` シグネチャを `list(filter?: { dueDate?: "today" | "tomorrow" }): Promise<Task[]>` に変更.
  - optional 引数で既存呼び出しを壊さない (D-011).
  - `HttpTaskRepository.list()` の本実装で URL に `?dueDate=...` を乗せる (`URL` + `searchParams.set`).
  - `LocalTaskRepository` 等の代替実装は optional 引数を無視してよいが, 型は追従させる.

### クライアント UI 新規追加

- [ ] T-010: `web/src/ui/tomorrow-view/tomorrow-view.tsx` を新規作成 (plan.md §「TomorrowView コンポーネント設計」).
  - props: `{ repository: TaskRepository, projectRepository: ProjectRepository }`.
  - `useQuery(["tomorrow"], () => repository.list({ dueDate: "tomorrow" }))` でタスク取得 (D-003).
  - `useQuery(["projects"], () => projectRepository.list())` でプロジェクト取得.
  - フォーム state: name / projectId / priority (期限 state は持たない / D-012).
  - `createMutation` / `updateMutation` / `deleteMutation` を `today-view.tsx` の雛形から踏襲し以下を満たす:
    - `safeEnqueue` で書込キューに enqueue (offline 対応, BL-018).
    - `!navigator.onLine` で楽観成功.
    - online 時に `OptimisticLockError` を catch して `findEntryByKey` + `ConflictError` 変換 (BL-031).
    - `onSuccess`:
      - create → `["tomorrow"]` invalidate (D-005).
      - update → `["tomorrow"]` / `["today"]` / `["focus"]` invalidate (D-004).
      - delete → `["tomorrow"]` invalidate (D-006).
    - `onError`: `ConflictError` なら `useConflictDialog.openDialog`, それ以外なら `notifyError("通信に失敗しました")` (BL-034).
  - `setFocus` は呼ばない (明日タスクは focus 対象外).
  - `handleCreate` で `dueDate: "tomorrow"` を強制送信 (D-012 / spec U-008).
  - `handleMoveToToday` で `patch: { dueDate: "today" }` を送信 (REQ-4).
  - `handleDelete` で `repository.delete` を呼ぶ (REQ-5).
  - JSX 構造:
    - `<section aria-label="明日のタスク" className="tomorrow-view">`
      - `<h1>明日のタスク</h1>`
      - `<form aria-label="明日のタスク起票フォーム" className="tomorrow-view__form">` (タスク名 / プロジェクト / 優先度 / 追加, 期限 UI 無し)
      - `<ul aria-label="明日のタスク一覧" className="tomorrow-view__list">` (空状態 / 各カード)
        - 空状態: `<li className="tomorrow-view__empty">明日のタスクはありません</li>` (REQ-6)
        - カード: project 名 + タスク名 + `[優先度: ...]` ラベル + 「削除」「今日にする」の 2 ボタン (D-013 / REQ-3)
      - `<ConflictDialog ... />`

- [ ] T-011: `web/src/ui/tomorrow-view/tomorrow-view.css` を新規作成 (plan.md §「CSS 設計」).
  - `.tomorrow-view` (flex column, gap).
  - `.tomorrow-view__form` (border + radius + padding + flex column / 起票フォーム枠).
  - `.tomorrow-view__list` (list-style none, gap).
  - `.tomorrow-view__item` (border + radius + padding + flex 横並び / カード).
  - `.tomorrow-view__empty` (中央寄せ / 薄色 / padding).
  - 各値に `/* TODO(BL-046): --xxx */` マーカーを残す (D-010).

### 既存ファイル変更

- [ ] T-012: `web/src/main.tsx` を編集.
  - `import { TomorrowViewPlaceholder } from "./ui/tomorrow-view/tomorrow-view-placeholder.js";` を削除.
  - `import { TomorrowView } from "./ui/tomorrow-view/tomorrow-view.js";` を追加.
  - `/tomorrow` ルートの element を `<TomorrowViewPlaceholder />` から `<TomorrowView repository={repos.task} projectRepository={repos.project} />` に変更.

### 既存ファイル削除

- [ ] T-013: `web/src/ui/tomorrow-view/tomorrow-view-placeholder.tsx` を削除する (D-008).

## 既存テスト + E2E の green 維持確認

- [ ] T-014: `npm test -w server` を実行し既存サーバ統合テストが全て green であることを確認.
  - 特に `server/__tests__/integration/tasks.test.ts` の `?trashed` シナリオが無改修で green を維持すること.
  - `server/__tests__/integration/today.test.ts` (BL-005) が無改修で green を維持すること (sortTasks 無改修の担保).

- [ ] T-015: `npm test -w web` を実行し既存単体テストが全て green であることを確認.
  - 特に `web/__tests__/today-view.test.tsx` が無改修で green を維持すること (today-view 不変条件 / 非ゴール担保).
  - `web/src/repositories/*.test.ts` (HttpTaskRepository / LocalTaskRepository の単体) が `list()` シグネチャ変更で型エラーや挙動破壊を起こさないこと.

- [ ] T-016: `npx playwright test` を実行し既存 E2E が引き続き green であることを確認.
  - `e2e/sidebar-nav.spec.ts` の `/tomorrow` 遷移シナリオを最優先で確認.
  - `e2e/conflict-handling.spec.ts` / `e2e/offline-queue.spec.ts` への影響は無い見込みだが念のため.

- [ ] T-017: BL-029 で導入された axe (a11y) E2E が violations 0 を維持することを確認.
  - `<section aria-label="明日のタスク">` のランドマーク / 起票フォームの `<label htmlFor>` 整合 / `<h1>` の階層 / ボタンのフォーカス可能性を確認.

## リファクタ (refactor)

- [ ] T-018: `createMutation` / `updateMutation` / `deleteMutation` の枠組みが today-view と重複している事実を確認する. 本 BL では **共通化を行わない** (D-016). 共通化は今日ビュー分解後の後続 BL (BL-042 等) で `useTaskActions` 等の hook に抽出する判断とする. 本 plan の D-016 / 代替案 4 にも記載済み.

- [ ] T-019: 暫定 CSS の値が grep 可能な `/* TODO(BL-046) */` マーカーで全てカバーされていることを最終確認.

## ドキュメント

- [ ] T-020: マージ後に `docs/developer/planning/backlog.md` の BL-038 を「Done」へ更新 (本 BL の責務外. 管理者または auditor が実施).

- [ ] T-021: 必要なら `docs/developer/features/ui-redesign-foundation/plan.md` の §「段階的移行戦略」のステップ (BL-038 完了) に対応する Done マークを更新 (任意).

## 仕上げ

- [ ] T-022: 受け入れ基準 ([`spec.md`](spec.md) §「受け入れ基準」) を全て満たすことを確認.
  - 一覧表示 (REQ-1) / 起票 (REQ-2) / 「今日にする」 (REQ-4) / 削除 (REQ-5) / アクション数の規約 (REQ-3) / 空状態 (REQ-6) / ConflictDialog (REQ-7) / 通信エラー (BL-034) / サーバ API の補強 (§サーバ補強) / 既存 view の不変条件 の各シナリオ群が全て green.

- [ ] T-023: auditor へレビュー依頼.
  - 仕様適合 (spec.md REQ-1〜REQ-7 全件 + §サーバ補強の受け入れ基準).
  - 既存 E2E + 単体テスト + サーバ統合テスト green の維持.
  - `today-view.tsx` に変更がないこと (非ゴール担保).
  - サーバ側補強の互換性 (dueDate 未指定時の既存挙動維持 / 不正値の寛容バリデーション).
  - `["tomorrow"]` / `["today"]` / `["focus"]` の invalidate 方針が D-003 〜 D-006 と整合.
  - placeholder ファイル削除済み (D-008) かつ main.tsx の import 更新済み.
  - CSS の `/* TODO(BL-046) */` マーカーが grep 可能な形で残っている (D-010).
