# タスク: タスクカードに「プロジェクト変更」 UI を追加

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。
>
> 担当の振り分け:
> - `test-designer`: 「テスト」セクション (失敗するテストの新規作成 / 既存テストの追従更新).
> - `implementer`: 「実装」セクション (テストを green 化するコード変更).
> - `project-designer`: 「ドキュメント」セクション (本 spec / plan / 関連 docs の整合).
> - `auditor`: 「仕上げ」セクション (spec 適合 + 既存テスト互換 + 品質ゲートの最終確認).

## テスト (test-designer 担当)

### 新規テストファイル

- [x] `web/__tests__/task-card-project-change.test.tsx` を新設する.
  - jsdom 環境で `<TaskCard>` を直 render する DOM レンダ AC と,
    `<TodayView>` / `<TomorrowView>` / `<FocusView>` を mock repository 付きで render する
    統合 AC を 1 ファイルに収める (`task-card-component.test.tsx` と同形).
  - spec の受け入れ基準シナリオを以下のテストケースに 1:1 で展開する.
    - AC-1: `task.projectId="p1"` で render → `<select>` 1 個 / value="p1" / option 3 個
      (なし / α / β) を assert.
    - AC-2: `task.projectId=null` で render → `<select>` 1 個 / value="" / 先頭 option
      selected.
    - AC-3: カード内に `.project-chip` class を持つ要素が 0 個.
    - AC-4: `<select>` で「プロジェクトβ」 (value="p2") を選択 →
      `onChangeProject` mock が `"p2"` で呼ばれる.
    - AC-5: `<select>` で「プロジェクトなし」 (value="") を選択 →
      `onChangeProject` mock が **`null`** で呼ばれる (空文字でないこと).
    - AC-6 (同値短絡): 親 view 経由 (TodayView) で同じ option を「再選択」する経路で
      `taskRepository.update` が呼ばれないこと.
    - AC-7 (today PATCH 到達): TodayView 経由でプロジェクト変更 →
      `taskRepository.update` が
      `{ id, ifMatch: version, patch: { projectId: "p2" } }` で呼ばれる. 成功後
      `queryClient.invalidateQueries({ queryKey: ["today"] })` と `["focus"]` が呼ばれる
      (= mock spy で確認).
    - AC-8 (tomorrow PATCH 到達 + invalidate): TomorrowView 経由でプロジェクト変更 →
      `taskRepository.update` が呼ばれ, invalidate 先が
      `["tomorrow"]` / `["today"]` / `["focus"]` の 3 つ.
    - AC-9 (focus PATCH 到達): FocusView 経由で focusedTask のプロジェクト変更 →
      `taskRepository.update` 呼出 + `["today"]` / `["focus"]` invalidate.
    - AC-10 (412 → ConflictDialog): TodayView 経由で repository.update が
      `OptimisticLockError` を throw する fixture を組み, `ConflictDialog` の open に
      到達することを assert (= 既存 `task-card-component` test の ConflictDialog assert と
      同形).
    - AC-11 (label 関連付け): `<label>` の `htmlFor` と `<select>` の `id` 一致. label の
      class に `visually-hidden` が含まれる.
    - AC-12 (id 衝突回避): 一覧に 2 タスク (id="task-a" / "task-b") を出し, 各 `<select>`
      の id が `task-project-task-a` / `task-project-task-b` で互いに異なる.
    - AC-13 (routine 由来でも有効): `task.origin="routine"` のタスクで `<select>` が
      存在 / disabled でない.
    - AC-14 (オフライン経路): `navigator.onLine=false` で TodayView 経由でプロジェクト変更
      → `enqueue` (offline-queue) に PATCH エントリが積まれ, `notifyError` が呼ばれない
      (= 既存 task-card-component test の offline 系と同形).
    - AC-15 (`.project-chip` ルール本文の不変性): `web/src/ui/day-view/day-view.css` の
      `.project-chip` ルール本文を `extractRuleBody` で抽出し, BL-056 当時の宣言と
      一致することを assert (NFR-CHIP-PRESERVE).
    - AC-16 (`tokens.css` の不変性): `web/src/styles/tokens.css` のサイズが本 BL 前と
      同一であること (簡易) もしくは特定トークン宣言の存在確認.
    - AC-17 (起票カード `<TaskFormCard>` への非波及): `<TaskFormCard>` を直 render し
      `<select>` の構造 / option 順序 / class が本 BL 前と同じ.
  - 検証スタイルは `task-card-component.test.tsx` の `extractRuleBody` /
    `renderWithQueryClient` ヘルパを踏襲する (P-005 / 自前定義).

### 既存テストの追従更新 (test-designer または implementer どちらでも可 / 実施は同 commit)

- [x] `web/__tests__/task-card-zone-layout.test.tsx`: `<TaskCard>` の直 render 呼出に
  `projects={[]}` / `onChangeProject={vi.fn()}` を追加. TS コンパイル red を解消する.
- [x] `web/__tests__/task-card-component.test.tsx`: 同上の必須 prop 追加. かつ
  `.project-chip` の DOM 存在を前提とする AC があれば「`<select>` 存在」に書き換える.
  既存の `.project-chip` を CSS 直読みする AC は維持 (= ルールは残置).
- [x] `web/__tests__/task-card-actions-reorder.test.tsx`: 必須 prop 追加.
- [x] `web/__tests__/task-card-hotfix.test.tsx`:
  - CSS 直読み系 (`.task-card__header .project-chip { font-size }` ルール本体) は **維持**.
  - DOM レンダ系で「`<span class="project-chip">` が描画される」前提があれば
    「`<select>` 内 selected option が描画される」に書き換える.
- [x] `web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx` /
  `focus-view.test.tsx` / `unified-day-view.test.tsx`:
  - mock projectRepository.list が `[]` を返す既存ケースで, 新規 `<select>` が
    既存テスト query (`getByRole("combobox")` 等) と衝突しないか確認.
  - 必要なら新規追加 `<select>` を識別するために `getByLabelText("プロジェクト")` 等
    label ベースの query を導入する.
  - mock task-repository の `update` spy が `{ projectId: ... }` patch を受け取らない
    パスでも green を維持するように, 既存 update spy を緩く検証する.

## 実装 (implementer 担当)

### `<TaskCard>` 本体 (`web/src/ui/task-card/task-card.tsx`)

- [x] `TaskCardProps` に以下を追加.
  - `projects: Project[];` (必須)
  - `onChangeProject: (next: string | null) => void;` (必須)
- [x] 既存 `project: Project | null` は **削除しない** (D-006).
- [x] `.task-card__header` 内の旧
  `project && <span className="project-chip">{project.name}</span>` を
  `<label htmlFor>` + `<select>` 構造に置換する. plan.md §「`<TaskCard>` JSX 構造」のとおり.
- [x] `<select>` の `onChange` で `e.target.value` を取得し, `""` を `null` に変換して
  `onChangeProject` を呼ぶ (REQ-5 / D-003).
- [x] `<label>` は `.visually-hidden` (既存 utility).
- [x] `id` は `task-project-${task.id}` (D-009).
- [x] header の他の子要素 (`task-card__header__priority` wrapper) と
  `margin-left: auto` の関係を壊さないこと (= PriorityStars wrapper の現状維持).

### 親 view ハンドラ追加

- [x] `web/src/ui/today-view/today-view.tsx`:
  - `handleChangeProject = useCallback((task, next) => ...)` を追加.
    - `task.projectId === next` で短絡 (REQ-7).
    - 既存 `updateMutation.mutateAsync({ id, ifMatch: version, patch: { projectId: next } })`
      を呼ぶ (try/catch で reject を吸収).
  - focusedTask 用 `<TaskCard>` 呼出に `projects={projects}` /
    `onChangeProject={(next) => handleChangeProject(focusedTask, next)}` を追加.
  - otherTasks 用 `<TaskCard>` 呼出に同上を追加.
- [x] `web/src/ui/tomorrow-view/tomorrow-view.tsx`:
  - `handleChangeProject` を追加 (TodayView と同形 / 短絡含む).
  - `<TaskCard>` 呼出に `projects={projects}` /
    `onChangeProject={(next) => handleChangeProject(task, next)}` を追加.
- [x] `web/src/ui/focus-view/focus-view.tsx`:
  - `handleChangeProject = useCallback((next) => ...)` を追加 (focusedTask 単独なので
    task は closure で参照).
    - `focusedTask == null` で no-op.
    - `focusedTask.projectId === next` で短絡.
    - `updateMutation.mutateAsync(...)` 呼出.
  - `<TaskCard>` 呼出に `projects={projectsData ?? []}` /
    `onChangeProject={handleChangeProject}` を追加.

### CSS (`web/src/ui/task-card/task-card.css`)

- [x] **基本は無改修**. BL-066 で導入済みの `.task-card__header select` ルールが
  そのまま新規 `<select>` に適用される.
- [x] BL-066 D-001 のコメント (= 「表示側 TaskCard には `<select>` が存在しない」前提) を
  本 BL の前提に追従するよう **コメントだけ更新** する (P-001):
  - 旧: 「TaskCard 表示側 (`<TaskCard>`) の `.task-card__header` 配下には `<select>` が
    DOM 構造上存在しないため」
  - 新: 「`<TaskCard>` (表示) と `<TaskFormCard>` (起票) の両方が `.task-card__header`
    配下に `<select>` を持つ. 本 ルールはどちらにも適用される (BL-108)」
- [x] BL-063 D-003 の `.task-card__header .project-chip { font-size }` ルールは **削除しない**.
  `<span class="project-chip">` が DOM から消えるため作用対象を失うが,
  `.project-chip` 自体は将来再利用余地のため残置 (D-007).
- [x] `.visually-hidden` utility は既存 (`web/src/ui/task-card/task-card.css` に定義済み)
  を流用. 追加宣言不要.

### 共通 CSS / トークン

- [x] `web/src/ui/day-view/day-view.css`: **無改修** (NFR-CHIP-PRESERVE).
- [x] `web/src/styles/tokens.css`: **無改修** (NFR-TOKENS-PRESERVE).

### Repository / Domain / Server

- [x] **無改修**. `taskRepository.update` の `projectId` 受理は既存 (`task-repository.ts:304`).

## ドキュメント (project-designer 担当)

- [x] 本 `spec.md` / `plan.md` / `tasks.md` の整合確認 (本タスクで完了).
- [x] `docs/developer/planning/backlog.md` の BL-108 行に進行状況を反映するかは管理者判断
  (本タスクの完了報告と同時に管理者が更新する想定).
- [x] 他機能 docs (`features/task-card-component/` 等) の影響反映は **不要**.
  当該 docs は BL-059 当時の決定の正典として timeless 表記で残す (history は backlog に集約).
- [x] ADR 起票: **不要** (plan.md §「重要な決定」末尾の判断のとおり).
- [x] `docs/developer/project.md` の編集: **不要** (CLAUDE.md 禁止条項).

## 仕上げ (auditor 担当)

- [x] spec.md の受け入れ基準シナリオ (UI 表示 / 変更ハンドラ / 親 view 適用 / 競合 /
  オフライン / a11y / 視覚言語 / routine / 既存テスト互換性) を全件満たすこと.
- [x] 既存テスト互換性: spec.md の「更新を要する既存テスト」リストが過不足なく追従され,
  vitest 全件 green / Playwright 全件 green であること.
- [x] 不変性: `web/src/ui/day-view/day-view.css` (`.project-chip` ルール本文) /
  `web/src/styles/tokens.css` / `web/src/ui/task-card/task-form-card.tsx` が本 BL で
  変更されていないこと (git diff で確認).
- [x] 品質ゲート:
  - `npm run typecheck` 0 エラー.
  - `npm run lint` 0 警告 0 エラー.
  - `npx vitest run` 全件 green.
  - `npm -w e2e test` 全件 green (Playwright).
- [x] a11y: TaskCard 内 `<select>` に `<label>` 関連付けがあり, label が `.visually-hidden`
  で視覚的に隠されつつ accessible name を保つこと (DOM 検査).
- [x] 視覚言語: `<select>` が起票カード `<TaskFormCard>` 内 `<select>` と同じ見た目
  (`.task-card__header select` ルール経由) であること.
- [x] BL-108 「完了の目安」 (backlog.md 記載) を満たすこと:
  - 4 view (今回は 3 view; projects-view は task を出していない) で chip / control を
    操作するとプロジェクト一覧 (「なし」含む) が表示される.
  - 選択すると PATCH 成功 → 一覧の chip 表示が即座に更新される.
  - リロード後も新 projectId が永続化されている.
  - vitest / Playwright 全件 green / lint / typecheck 0 / auditor PASS.
- [x] レビュー依頼.
