# 設計・実装計画: タスクカードに「プロジェクト変更」 UI を追加

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

`<TaskCard>` 内の `<span className="project-chip">` を, 起票カード (`<TaskFormCard>`) と
完全同形の `<select>` control に置換する. control の選択値変化を親 view に
`onChangeProject(next: string | null)` で流し, 親 view は既存 `updateMutation` 経由で
`PATCH /api/v1/tasks/:id { projectId }` を発行する. サーバ API / Repository / Domain /
共通 CSS は無改修. tokens.css も無改修.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | **無改修**. `PATCH /api/v1/tasks/:id` の `projectId` 受理は既存 (`web/src/repositories/task-repository.ts:304`). |
| DB / Domain | **無改修**. |
| Repository | **無改修**. `taskRepository.update(cmd)` を流用. |
| 共通 CSS (`web/src/ui/day-view/day-view.css`) | **無改修**. `.project-chip` ルール本文は触らない. |
| トークン (`web/src/styles/tokens.css`) | **無改修**. |
| TaskCard CSS (`web/src/ui/task-card/task-card.css`) | **原則無改修**. BL-066 で導入済みの `.task-card__header select` ルールがそのまま新規 `<select>` に適用される. 必要なら `.task-card__header .project-chip` (BL-063 D-003) のコメントだけ追記する (= chip 自体が消えるため). |
| `<TaskCard>` (`web/src/ui/task-card/task-card.tsx`) | `.task-card__header` 内 chip span を `<select>` + visually-hidden `<label>` に置換. `TaskCardProps` に `projects: Project[]` / `onChangeProject: (next: string \| null) => void` を必須追加. 既存 `project: Project \| null` は維持 (NFR-COMPAT 余地). |
| `<TaskFormCard>` (`web/src/ui/task-card/task-form-card.tsx`) | **無改修** (REQ-8). |
| `today-view.tsx` | `useQuery(["projects"])` の結果を TaskCard に `projects` として渡す. `handleChangeProject(task, next)` ハンドラを実装し `updateMutation` 経由で PATCH. 2 箇所 (focusedTask 強調 / otherTasks 一覧) の TaskCard 呼び出しを更新. |
| `tomorrow-view.tsx` | 同上. PATCH 成功時の invalidate 先は既存 `invalidateAfterMoveToToday` を流用 (`["tomorrow"]`/`["today"]`/`["focus"]`). |
| `focus-view.tsx` | 同上. `useQuery(["projects"])` は既存. `handleChangeProject` を実装し既存 `updateMutation` 経由で PATCH. |
| 既存テスト | `<TaskCard>` を直 render する 4 ファイル + view 経由 3 ファイル + `task-card-hotfix.test.tsx` を本 BL のテスト追加と同時に追従更新する. |

## 設計詳細

### データモデル

- 追加データ無し. `Task.projectId: string | null` の既存型を使う.
- `Project[]` も既存型 (`web/src/repositories/project-repository.ts:12-18`) を使う.

### `<TaskCard>` API 拡張

```ts
export interface TaskCardProps {
  task: Task;
  project: Project | null;            // 既存 (chip 表示用. 新しい control では参照しないが API 互換のため維持 / D-006)
  projects: Project[];                // 新規必須 (REQ-9). control の option 列挙.
  onChangeProject: (next: string | null) => void;  // 新規必須 (REQ-9).
  // ... 既存 prop はそのまま
}
```

### `<TaskCard>` JSX 構造

```jsx
<div className="task-card__header">
  {/* 旧: project && <span className="project-chip">{project.name}</span> */}
  <label htmlFor={`task-project-${task.id}`} className="visually-hidden">
    プロジェクト
  </label>
  <select
    id={`task-project-${task.id}`}
    value={task.projectId ?? ""}
    onChange={(e) => {
      const v = e.target.value;
      onChangeProject(v === "" ? null : v);
    }}
  >
    <option value="">プロジェクトなし</option>
    {projects.map((p) => (
      <option key={p.id} value={p.id}>{p.name}</option>
    ))}
  </select>
  {showPriority && onSetPriority && (
    <div className="task-card__header__priority">
      <PriorityStars ... />
    </div>
  )}
</div>
```

注意: `<select>` を常に描画するため,
header 子要素数は最低でも `<label>` + `<select>` + (optional `PriorityStars` wrapper) になる.
`.task-card__header__priority` の `margin-left: auto` (BL-063 D-001) が引き続き機能して
`<select>` が左 / PriorityStars が右の配置を維持する.

### 親 view のハンドラ

`today-view.tsx` / `tomorrow-view.tsx` / `focus-view.tsx` で同形のハンドラを実装する:

```ts
const handleChangeProject = useCallback(
  async (task: Task, next: string | null) => {
    if (task.projectId === next) return;  // REQ-7 同値短絡
    const cmd: UpdateTaskCommand = {
      id: task.id,
      ifMatch: task.version,
      patch: { projectId: next },
    };
    try {
      await updateMutation.mutateAsync(cmd);
    } catch {
      // onError で処理済み (ConflictDialog / notifyError).
    }
  },
  [updateMutation],
);
```

`updateMutation` は各 view に既に存在し, name 編集や priority 編集と同じインスタンスを共有する.
invalidate 戦略も既存 (today: `["today"]`/`["focus"]`. tomorrow: `["tomorrow"]`/`["today"]`/`["focus"]`. focus: `["today"]`/`["focus"]`) をそのまま流用する.

### 処理フロー

1. ユーザーが TaskCard 内 `<select>` で別 option を選択.
2. `<select>` の `onChange` が発火. `e.target.value` が `""` / `"p1"` / `"p2"` 等.
3. `<TaskCard>` 内で `""` → `null`, 文字列 → そのまま, に変換し `onChangeProject(next)` を呼ぶ.
4. 親 view の `handleChangeProject(task, next)` が同値短絡 (REQ-7) をチェック.
5. 短絡しない場合 `updateMutation.mutateAsync({ id, ifMatch: version, patch: { projectId: next } })`.
6. offline-queue に PATCH エントリを enqueue (既存ロジック).
7. online なら `repository.update(cmd)` を呼ぶ → 200 で `updated task` 返却 → onSuccess で invalidate.
8. offline なら enqueue のみで楽観成功.
9. 412 (online) は `OptimisticLockError` → `ConflictError` 変換 → `ConflictDialog` open.
10. invalidate により `["today"]` / `["focus"]` / `["tomorrow"]` (場合に応じて) が再フェッチ
    → `<TaskCard>` の `task.projectId` が更新値で再描画 → `<select>` の value も追従.

### 例外 / エラー処理

- 既存 `updateMutation` の `onError` を完全に再利用. 追加の handler は無し.
- ConflictDialog の "サーバ値を受け入れる" / "サーバ値で再試行" 経路はそのまま動く
  (ConflictDialog 自体は patch の中身を意識しないため `projectId` でも問題なし).

### CSS

- 新規ルール無し.
- BL-066 で既に書かれている `.task-card__header select { min-height: 24px; padding: var(--space-xs) var(--space-sm); font-size: var(--font-size-small); border: 1px solid var(--color-border); border-radius: var(--radius-lg); appearance: none; -webkit-appearance: none; }` がそのまま適用される.
- BL-066 D-001 のコメント (「TaskCard 表示側の `.task-card__header` 配下には `<select>` が DOM 構造上存在しないため, このセレクタは起票カードにのみマッチする」) は本 BL によって **前提が変わる**. コメント更新が必要 (P-001).

## 重要な決定

- **D-001 (UI 形態): `<select>` 採用**. spec の「確定した UI 形態」セクションに採用理由を記載済み.
- **D-002 (option 構造): 起票カードと完全同形**. 先頭 `<option value="">プロジェクトなし</option>` + 既存プロジェクト一覧. これにより起票時と編集時の操作モデルが一致する.
- **D-003 (`onChangeProject` の値型): `string | null`**. `<select>` の DOM 値 `""` は親に渡る前に `null` に変換する (REQ-5). 親側で `""` を condition 分岐する必要を無くす.
- **D-004 (必須 prop): `projects` / `onChangeProject` は必須**. 任意にすると親が忘れて変更不能 control が出るため. 親が `[]` を渡せば実質「プロジェクトなし」のみの control になり, no-op の `onChangeProject` を渡せば read-only に近づけられる (= 将来 read-only モードが必要になった時の足場).
- **D-005 (同値短絡の所在): 親側に置く**. `<TaskCard>` は `onChangeProject(next)` を常に呼ぶ. 親が `next === task.projectId` を見て短絡する (= `handleNameBlur` / `handleSetPriority` の既存パターンと一致 / REQ-7).
- **D-006 (既存 `project: Project | null` prop の扱い): 維持**. 撤去すると既存テスト / API の breaking change が大きい. 新しい control は `task.projectId` から `<option>` を selected にするため `project` は厳密には不要だが, 将来的に「現在のプロジェクト名を強調表示する」拡張をした際に再利用できるよう温存する.
- **D-007 (`.project-chip` ルールの扱い): 残置**. ルール本文は触らない (NFR-CHIP-PRESERVE). 表示側で利用されなくなるが, 起票カード側でも `.project-chip` は使われていないため死コード化する. 削除は別 BL (将来) の責務 (= 余分な cleanup を本 BL に混ぜない / spec 非ゴール).
- **D-008 (label の隠し方): `.visually-hidden`** を使う. 起票カード `<TaskFormCard>` と同じ手法. CSS は既存 utility をそのまま流用 (`web/src/ui/task-card/task-card.css` 内 `.visually-hidden`).
- **D-009 (control id の命名): `task-project-${task.id}`**. 一覧内で衝突しないこと, label との関連付け, task id を含めて debug 時の追跡しやすさが目的. `task-name` / `task-id` 等の既存 id とも衝突しない.
- **D-010 (routine タスクの扱い): 制限なし**. spec REQ-12 のとおりプロジェクト変更は origin に依存しない. `task.origin === "routine"` で `<select>` を disable しない.
- **D-011 (E2E スコープ): vitest 中心**. Playwright は smoke (1 経路 / 例: today で「プロジェクトなし → α」「α → なし」を回す) のみ. 既存の Playwright spec を破らない範囲で最小追加.

ADR の起票要否: 本 BL の方針 (chip → `<select>`) は BL-065 (project-toggle-removal) の起票カード側決定の自然な延長で, 新規アーキテクチャ判断とまでは言えない. **ADR 化はしない**.

## リスク / 代替案

### リスク

- **既存テスト連鎖更新**: `<TaskCard>` の必須 prop 増加で, 直 render している既存テスト
  5 ファイル (`task-card-*.test.tsx`) + view 経由テスト 3〜4 ファイルが TS コンパイル
  エラーで red 化する. 本 BL のスコープで一括追従する (tasks.md にタスク化済み).
- **`.task-card__header .project-chip` font-size override (BL-063 D-003) の死コード化**:
  `.project-chip` を持つ `<span>` が DOM から消えるため当該セレクタは作用対象を失う.
  ルール本文を消すと BL-063 の test が red 化する可能性があるため, 本 BL では **残置** する.
  コメントだけ追記する (P-001).
- **header 子要素数増加**: `.task-card__header` 配下の子要素が常時 `<label>` + `<select>` の
  2 つに増える (旧: chip span 1 つだけ, または 0 個). 既存テストで「header 配下の `<span>`
  数 = 1」「`<select>` 数 = 0」を assert している箇所があれば red 化する. 事前確認の
  上, 追従修正をタスク化済み.
- **モバイル native ピッカーの UX**: iOS Safari / Android Chrome の native `<select>` は
  ピッカー UI を OS に委譲する. デスクトップ Chrome / Firefox とは見た目が異なるが,
  これは起票カード側で既に発生済みの挙動であり, 新規リスクではない.

### 代替案 (不採用)

- **chip 表示と control を併存**: 表示側 chip span + 「変更」 button を残す. UI 要素が
  増えて header layout への影響が大きく, 削除 / 完了 button との auto-margin パターンへの
  影響確認も増える. 採用しない.
- **control を `<button aria-haspopup="listbox">` + 自前 popover**: spec で詳述したとおり
  工数大 / 視覚言語不一致. 採用しない.
- **`projectId` を controlled `<input list>` (= combobox)** で文字列入力 + suggest:
  自由入力で誤 projectId を作るリスクと, 既存プロジェクト一覧との一致判定が必要になり
  複雑度大. 採用しない.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

### 新規テスト (`web/__tests__/task-card-project-change.test.tsx`)

TDD の red を作る単一ファイルを新設する. 主に DOM レンダ系の AC を検証.

- AC-1: `<TaskCard>` を `task.projectId="p1"` で render → header に `<select>` がある /
  value="p1" / option 3 個 (なし / α / β).
- AC-2: `<TaskCard>` を `task.projectId=null` で render → `<select>` value="" / 先頭 option
  selected.
- AC-3: `<TaskCard>` 内に `.project-chip` className を持つ要素が存在しない.
- AC-4: `<select>` で「プロジェクトβ」を選択 → `onChangeProject("p2")` が呼ばれる
  (`mockFn` で assert).
- AC-5: `<select>` で「プロジェクトなし」を選択 → `onChangeProject(null)` が呼ばれる
  (空文字ではない).
- AC-6: 同値選択 (= 既に selected な option の再選択) では `taskRepository.update` が
  呼ばれない (= 親側短絡). 親 view 経由でレンダする統合系で検証.
- AC-7: today-view 経由レンダで `<select>` の onChange が PATCH に到達する
  (`taskRepository.update` spy 呼出引数: `{ patch: { projectId: "p2" } }`).
- AC-8: tomorrow-view 経由レンダで同上 + invalidate 先 (`["tomorrow"]`/`["today"]`/`["focus"]`).
- AC-9: focus-view 経由レンダで focusedTask に対し PATCH 発行.
- AC-10: 412 → `OptimisticLockError` → `ConflictDialog` open (mock task-repo で 412 を返す
  fixture).
- AC-11: `<label htmlFor>` と `<select id>` の一致. label が `.visually-hidden`.
- AC-12: 同一一覧内の 2 タスクで `<select>` id が異なる (= 衝突しない).
- AC-13: `task.origin="routine"` のタスクでも `<select>` が disabled でない.

### 更新する既存テスト

- `web/__tests__/task-card-zone-layout.test.tsx`: `<TaskCard>` 直 render の必須 prop に
  `projects=[]` / `onChangeProject=vi.fn()` を追加する小修正.
- `web/__tests__/task-card-component.test.tsx`: 同上 + AC で `.project-chip` 存在前提の
  assertion があれば「`<select>` 存在」に書き換え.
- `web/__tests__/task-card-actions-reorder.test.tsx`: 必須 prop 追加.
- `web/__tests__/task-card-hotfix.test.tsx`: `.task-card__header .project-chip` の font-size
  override は CSS ルール直読み系であれば green 維持. DOM レンダ系で `<span class="project-chip">`
  の存在 / font-size を assert している箇所があれば「`<select>` の font-size」に書き換える
  (= 同じ `--font-size-small` トークンが `.task-card__header select` 経由で適用される).
- `web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx` / `focus-view.test.tsx` /
  `unified-day-view.test.tsx`: mock projectRepository.list の戻りが既存テスト想定と矛盾
  しないことを確認 + 必要なら `<select>` 追加に伴う query 競合 (= `getByRole("combobox")`
  が複数 hit する可能性) を name-based query (`getByLabelText("プロジェクト")` 等) で
  解消する.

### Playwright (`e2e/`) スコープ

新規 spec を 1 ファイル追加するか, 既存の `today-view.spec.ts` 等に 1 シナリオ追記:

- /today で既存タスクのプロジェクト `<select>` で「プロジェクトなし」を選び, リロード
  しても projectId=null が永続化されていることを確認 (= サーバ反映 + 再描画の smoke).

### 回帰範囲

- `npm run typecheck` / `npm run lint`: 0 警告 0 エラー.
- `npx vitest run`: 全件 green.
- `npm -w e2e test`: 全件 green.
