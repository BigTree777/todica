# タスク: 「現在のタスク」独立ビュー化 (focus-view)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 順番は **TDD**: 失敗するテストを書く → 実装で green 化する → リファクタの順に並べる. test-designer / implementer に渡す.

## 失敗するテストを書く (red)

### 単体テスト (Vitest + React Testing Library)

- [ ] T-001: `web/__tests__/focus-view.test.tsx` を新規作成し, `<FocusView />` 単体テストを書く. `web/__tests__/today-view.test.tsx` の `renderWithQueryClient` / `makeMockTaskRepository` / `makeMockProjectRepository` のパターンを踏襲する.
  - シナリオ A (REQ-1 / REQ-3 暗黙フォールバック): `currentTaskId = null` で `nextTaskId = A.id`, A が `{name: "牛乳", projectId: "p1"}`, projects に p1 が存在する状態でレンダリング → 見出し「現在のタスク」が表示される / タスク名「牛乳」が表示される / プロジェクト名 (p1 の name) が表示される / 下部に「削除」「完了」の 2 ボタンが表示される.
  - シナリオ B (REQ-3 明示設定): `currentTaskId = B.id` で `nextTaskId = A.id` の時, B が表示される (currentTaskId が優先).
  - シナリオ C (REQ-2 空状態): `tasks = []`, `nextTaskId = null`, `currentTaskId = null` の時に「現在のタスクはありません」が表示される. 「削除」「完了」ボタンが存在しない (`queryByRole("button", { name: "削除" })` が null).
  - シナリオ D (REQ-4 アクション数): 通常状態で `screen.getAllByRole("button")` の中身が「削除」「完了」のみであり, 「編集」「優先度切替」「明日へ」「今日へ」「現在解除」「現在に設定」が無いことを確認.
  - シナリオ E (REQ-7 起票フォーム無し): `queryByRole("textbox", { name: /タスク名/ })` / `queryByRole("combobox", { name: /プロジェクト|期限|優先度/ })` / `queryByRole("button", { name: /追加/ })` が全て null.
  - シナリオ F (REQ-5 完了): 「完了」ボタンを `userEvent.click` → `repository.complete` が `{ id: focusedTask.id, ifMatch: focusedTask.version }` で 1 回呼ばれる / 成功後に `today` / `focus` の query が invalidate される (mock repository の `today` / `getFocus` が再度呼ばれる).
  - シナリオ G (REQ-6 削除): 「削除」ボタンを `userEvent.click` → `repository.delete` が `{ id, ifMatch }` で 1 回呼ばれる / 成功後に再フェッチが走る.
  - シナリオ H (D-001 setFocus を呼ばない): 完了 / 削除のいずれの操作後も `repository.setFocus` の呼び出し回数が 0 であることを確認.
  - シナリオ I (REQ-8 ConflictDialog): `repository.complete` (もしくは `delete`) が `OptimisticLockError` を throw するモックを設定し, ボタン押下後に `ConflictDialog` が表示される (見出し / role / aria-label で確認).
  - シナリオ J (BL-034 notifyError): `repository.complete` が一般エラーを throw するモックを設定し, ボタン押下後に `notifyError` が呼ばれる (`error-notification` モジュールを `vi.spyOn` で監視).

### 結合テスト

- [ ] T-002: `web/__tests__/router.test.tsx` を確認し, `/focus` の遷移テストが placeholder の「準備中 (BL-037)」を assert している場合は実コンポーネントの見出し「現在のタスク」 + 「削除」「完了」ボタンの存在に追従させる.
  - BL-036 でこのテストが追加されていなければ T-002 は skip.

### E2E (任意, Playwright)

- [ ] T-003 (任意): `e2e/focus-view.spec.ts` を新規作成し以下を red 状態で書く.
  - シナリオ K: タスク 1 件を起票 → `/focus` 遷移 → そのタスク名が大きく表示される.
  - シナリオ L: `/focus` で「完了」を押す → タスクがゴミ箱に移る / 今日のタスクが 0 件なら空状態に遷移.
  - シナリオ M: `/focus` で「削除」を押す → タスクがゴミ箱に移る / 同様に次のタスクへ繰り上がる.
  - シナリオ N: 今日のタスクが 0 件の時 `/focus` に「現在のタスクはありません」が表示される.

### 既存 sidebar-nav E2E の追従

- [ ] T-004: `e2e/sidebar-nav.spec.ts` 内で `/focus` 遷移後の assert が「準備中 (BL-037)」テキストを参照している場合は, 本 BL での実コンポーネント置換に合わせて見出し「現在のタスク」のみを assert する形に更新する.
  - 見出し「現在のタスク」のみを使っている場合は無改修.

## 実装で green 化する (green)

### モジュール新規追加

- [ ] T-005: `web/src/ui/focus-view/focus-view.tsx` を新規作成.
  - props: `{ repository: TaskRepository, projectRepository: ProjectRepository }`.
  - `useQuery` で `["today"]` / `["focus"]` / `["projects"]` を取得 (今日ビューと同じ query key. D-003).
  - フォーカス対象 = `focusData?.currentTaskId ?? nextTaskId`. 実体は `tasks.find(t => t.id === focusedId)`.
  - `completeMutation` / `deleteMutation` を `today-view.tsx` の雛形から踏襲し以下を満たす:
    - `safeEnqueue` で書込キューに enqueue (offline 対応, BL-018).
    - `!navigator.onLine` で楽観成功.
    - online 時に `OptimisticLockError` を catch して `findEntryByKey` + `ConflictError` 変換 (BL-031).
    - `onSuccess` で `["today"]` / `["focus"]` を invalidate.
    - `onError`: `ConflictError` なら `useConflictDialog.openDialog`, それ以外なら `notifyError("通信に失敗しました")` (BL-034).
  - `setFocus` は呼ばない (D-001).
  - JSX 構造:
    - `<section aria-label="現在のタスク" className="focus-view">`
      - `<h1>現在のタスク</h1>`
      - `<div className="focus-view__card">`
        - フォーカス対象あり: `<span className="focus-view__project">{project.name}</span>` (project があれば) + `<div className="focus-view__name">{focusedTask.name}</div>` + `<div className="focus-view__actions"><button>削除</button><button>完了</button></div>`.
        - フォーカス対象なし: `<div className="focus-view__empty">現在のタスクはありません</div>` のみ (ボタンは出さない. D-008).
      - `<ConflictDialog ... />`

- [ ] T-006: `web/src/ui/focus-view/focus-view.css` を新規作成.
  - `.focus-view` (flex column, min-height 100%).
  - `.focus-view__card` (大きな角丸枠, flex center, position relative).
  - `.focus-view__project` (副情報, 小フォント).
  - `.focus-view__name` (大フォント, 中央寄せ, word-break: normal).
  - `.focus-view__empty` (大フォント, グレー).
  - `.focus-view__actions` (position absolute, 下部に space-between で 削除 / 完了).
  - 各値に `/* TODO(BL-046): --xxx */` マーカーを残す (D-007).

### 既存ファイル変更

- [ ] T-007: `web/src/main.tsx` を編集.
  - `import { FocusViewPlaceholder } from "./ui/focus-view/focus-view-placeholder.js";` を削除.
  - `import { FocusView } from "./ui/focus-view/focus-view.js";` を追加.
  - `/focus` ルートの element を `<FocusViewPlaceholder />` から `<FocusView repository={repos.task} projectRepository={repos.project} />` に変更.

### 既存ファイル削除

- [ ] T-008: `web/src/ui/focus-view/focus-view-placeholder.tsx` を削除する (D-005).

## 既存テスト + E2E の green 維持確認

- [ ] T-009: `npm test -w web` を実行し既存単体テストが全て green であることを確認.
  - 特に `web/__tests__/today-view.test.tsx` の focus 関連テスト群が無改修で green を維持することを重視 (R-002).
- [ ] T-010: `npx playwright test` を実行し既存 E2E 25 件以上が引き続き green であることを確認.
  - `e2e/sidebar-nav.spec.ts` の `/focus` 遷移シナリオを最優先で確認.
  - `e2e/conflict-handling.spec.ts` / `e2e/offline-queue.spec.ts` への影響は無い見込みだが念のため.
- [ ] T-011: BL-029 で導入された axe (a11y) E2E が violations 0 を維持することを確認.
  - `<section aria-label="現在のタスク">` のランドマーク / `<h1>` の階層 / ボタンのフォーカス可能性を確認.

## リファクタ (refactor)

- [ ] T-012: `completeMutation` / `deleteMutation` を今日ビューと共有する hook (`useTaskActions` 等) に抽出するかを検討. 本 BL では行わず, today-view 分解の後続 BL (BL-042 等) で共通化する判断もあり. **保守側デフォルト案: 本 BL では抽出しない**. focus-view に閉じた 2 mutation のままにする.
- [ ] T-013: 暫定 CSS の値が grep 可能な `/* TODO(BL-046) */` マーカーで全てカバーされていることを最終確認.

## ドキュメント

- [ ] T-014: マージ後に `docs/developer/planning/backlog.md` の BL-037 を「Done」へ更新 (本 BL の責務外. 管理者または auditor が実施).
- [ ] T-015: 必要なら `docs/developer/features/ui-redesign-foundation/plan.md` の §「段階的移行戦略」のステップ 3 (BL-037 完了) に対応する Done マークを更新 (任意).

## 仕上げ

- [ ] T-016: 受け入れ基準 ([`spec.md`](spec.md) §「受け入れ基準」) を全て満たすことを確認.
  - フォーカス対象がある時の表示 (REQ-1 / REQ-3) / 空状態 (REQ-2) / アクション数の規約 (REQ-4) / 完了操作 (REQ-5) / 削除操作 (REQ-6) / ConflictDialog (REQ-8) / 通信エラー (BL-034) / 起票フォーム無し (REQ-7) / 既存 view 不変条件 の各シナリオ群が全て green.
- [ ] T-017: auditor へレビュー依頼.
  - 仕様適合 (spec.md REQ-1〜REQ-8 全件).
  - 既存 E2E + 単体テスト green の維持.
  - `today-view.tsx` に変更がないこと (非ゴール担保).
  - `setFocus` がクライアントから呼ばれていないこと (D-001 / FR-013 サーバ側自動解除に委ねる).
  - placeholder ファイル削除済み (D-005) かつ main.tsx の import 更新済み.
