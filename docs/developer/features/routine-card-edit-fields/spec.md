# 仕様: ルーティンの優先度 UI 統一 + 編集モードでの曜日変更 (routine-card-edit-fields)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-068
  - 依存 BL:
    - BL-061 (routine-card-component) — `<RoutineCard>` / `<RoutineFormCard>` / `routine-card.css` の本体. 本 BL の直接の対象.
    - BL-040 (priority-star-ui) — `<PriorityStars />` コンポーネント / `Priority` 型のマッピング.
    - BL-017 (routine) — `RoutineRepository.update()` の API. daysOfWeek の patch は既に対応済み.
  - 関連 feature:
    - [`../routine-card-component/spec.md`](../routine-card-component/spec.md) (BL-061) — 本 BL の起点. D-008-2 (優先度 label 可視維持) を本 BL で逆転する.
    - [`../priority-star-ui/spec.md`](../priority-star-ui/spec.md) (BL-040) — `<PriorityStars />` の API.
    - [`../routine/spec.md`](../routine/spec.md) (BL-017) — `RoutineRepository.update()` API 仕様.
  - 上位要件: NFR-010 (一貫した UI / 最小手数) / FR-ROUTINE / FR-003, FR-004 (優先度).
  - 関係しない feature: TaskCard 系 (BL-059) / ProjectCard 系 (BL-060) / 共通 button (BL-067) には触れない.

## 背景 / 課題

BL-061 で `<RoutineCard>` / `<RoutineFormCard>` のペアコンポーネントを新設しルーティン UI の枠組みを整えたが, user から 2 件の改善要求が出ている.

### 改善要求 1: 優先度表記をタスクと統一

- 現状 `<RoutineFormCard>` の優先度入力は `<select>` (BL-061 REQ-2 / D-008-2):
  ```jsx
  <div class="routine-card__priority-row">
    <label htmlFor="routine-priority">優先度</label>
    <select id="routine-priority" ...>
      <option value="highest">最優先</option>
      <option value="normal">普通</option>
      <option value="later">後回し</option>
    </select>
  </div>
  ```
- 一方タスク側 (`<TaskFormCard>`) は BL-040 で `<PriorityStars />` (☆☆☆ の 3 星評価式) に統一されている. ルーティンの優先度表記とタスクの優先度表記がコードベース内で乖離しており UI 一貫性 (NFR-010) が崩れている.
- user は「ルーティン作成カードの優先度もタスクと同じ星 3 つ UI に揃える」ことを要求.

### 改善要求 2: 編集モードで曜日変更

- 現状 `<RoutineCard isEditing={true}>` の編集モード DOM (BL-061 REQ-1) は name input のみ:
  ```jsx
  <form aria-label="ルーティン名称変更フォーム" class="routine-card__form-inline">
    <label htmlFor={editInputId} class="visually-hidden">ルーティン名</label>
    <input id={editInputId} type="text" class="routine-card__input" ... required />
    <button type="submit">保存</button>
    <button type="button" onClick={onCancelEdit}>キャンセル</button>
  </form>
  ```
- BL-061 では「編集モードでの曜日 / 優先度の編集」を非ゴールとして据え置いた (`spec.md` 非ゴール節). ルーティンを作成後に「やっぱり月→月+火曜にしたい」「日曜だけにしたい」と思った user は, 一度削除して作り直す必要がある.
- user は「編集モードで曜日も変更できる」ことを要求.
- 一方サーバ側 (`RoutineRepository.update()`) は既に `daysOfWeek?: number[]` の patch を受理する API 設計 (BL-017 完了済み) であり, presentation 層の改修だけで完結する.

### 方針の核

本 BL は以下を実現する.

1. **`<RoutineFormCard>` の優先度入力を `<select>` から `<PriorityStars />` に置換**する. prop 型 `defaultPriority: string` を `defaultPriority: Priority` (= `@todica/domain/task` の 3 値) に変更する.
2. **`<RoutineCard>` の編集モード DOM に曜日選択 UI (7 チェックボックス) を追加**する. props を増やして `editingDaysOfWeek: number[]` / `onEditingDaysOfWeekChange: (next: number[]) => void` を受け取り, 親 (`routines-view.tsx`) が state を持つ.
3. `routines-view.tsx` で編集モード state に `editingDaysOfWeek` を追加し, `openEdit()` 初期化と `handleSaveEdit()` での送信を行う. `RoutineRepository.update()` の API は既存対応済みのため無改修.
4. BL-061 D-008-2 (優先度 label 可視維持) を逆転し, `<PriorityStars />` 内部の `groupLabel` で a11y を担保する.

優先度に関しては BL-040 の `<PriorityStars />` を再利用する (新規 component / 新規 CSS は作らない). 曜日選択 UI は `<RoutineFormCard>` で既に実装済みの DOM パターンを `<RoutineCard>` 編集モードに展開する (新規 component 化は行わない / D-001).

## ゴール / 非ゴール

### ゴール

- **G-1 (RoutineFormCard の優先度 UI を `<PriorityStars />` に置換)**: `<select id="routine-priority">` + `<label htmlFor="routine-priority">優先度</label>` + ラッパ `.routine-card__priority-row` を撤去し, `<PriorityStars value={...} onChange={...} groupLabel="優先度" idPrefix="routine-create" />` に置換する.
- **G-2 (defaultPriority の型を `Priority` 化)**: `RoutineFormCardProps.defaultPriority` を `string` から `Priority` (`@todica/domain/task` 由来) に変更する. `onDefaultPriorityChange` も `(next: Priority) => void` に揃える. `routines-view.tsx` の state `newDefaultPriority` も `useState<Priority>("normal")` に変更する.
- **G-3 (RoutineCard 編集モードに曜日選択 UI を追加)**: `<RoutineCard isEditing={true}>` の DOM に `<div className="routine-card__day-checkboxes" role="group" aria-label="曜日">` + 7 個の `<label><input type="checkbox" ... />曜日名</label>` を追加する. DOM 順は「name input → 曜日 → 保存 → キャンセル」(D-005).
- **G-4 (RoutineCard 編集モードの曜日 state を親に上げる)**: `RoutineCardProps` に `editingDaysOfWeek: number[]` / `onEditingDaysOfWeekChange: (next: number[]) => void` を追加する. 親 `routines-view.tsx` が `useState<number[]>([1])` で state を持つ.
- **G-5 (`openEdit()` / `handleSaveEdit()` の追従)**: `openEdit(routine)` で `setEditingDaysOfWeek(routine.daysOfWeek)` を呼び初期値を当てる. `handleSaveEdit()` で `updateMutation.mutateAsync({ id, ifMatch, name: editingName, daysOfWeek: editingDaysOfWeek })` を呼び daysOfWeek を送信する. `cancelEdit()` で `setEditingDaysOfWeek([])` (または `[1]`) にリセット.
- **G-6 (RoutineRepository.update() に daysOfWeek を渡す)**: `WebRoutineRepository.update()` の `UpdateRoutineCommand` は既に `daysOfWeek?: number[]` を受理する (BL-017 完了済み). routines-view.tsx の `updateMutation` の `mutationFn` の引数型を `{ id, ifMatch, name, daysOfWeek }` に拡張し, body と offline-queue enqueue 経路の両方で送る.
- **G-7 (BL-061 D-008-2 の逆転 / 優先度 label 撤去)**: BL-061 D-008-2 で確定した「優先度 label を visually-hidden にしない」を本 BL で逆転する. `<label htmlFor="routine-priority">優先度</label>` 自体は撤去 (= `<PriorityStars />` の `groupLabel="優先度"` が radiogroup の aria-label に「優先度: ○○」を組み立て a11y を担保する / BL-040 REQ-4 / D-002).
- **G-8 (曜日選択 UI の DOM パターン共通化)**: `<RoutineFormCard>` と `<RoutineCard isEditing={true}>` の両方で同じ `.routine-card__day-checkboxes` クラス + 7 個の `<label><input type="checkbox" />曜日</label>` 構造を共有する. 専用 React コンポーネント `<WeekdayCheckboxes>` は本 BL では新設しない (D-001).
- **G-9 (a11y 違反 0 件維持)**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.
- **G-10 (NFR-COMPAT 維持)**: `RoutineRepository` / mutation 経路 / ConflictDialog / notifyError は無改修 (API 拡張なし / 既存 patch を活用).
- **G-11 (tokens.css 無改修)**: `web/src/styles/tokens.css` を変更しない. 既存トークンのみで構成する.

### 非ゴール

- **`<RoutineCard>` / `<RoutineFormCard>` / `routine-card.css` 以外の component 改修**: スコープ外.
- **TaskCard 系 (BL-059) / ProjectCard 系 (BL-060)**: 触れない.
- **`<PriorityStars />` 本体の改修**: 無改修 (BL-040 NFR-COMPAT).
- **編集モードでの優先度 (defaultPriority) 変更 UI の追加**: スコープ外 (本 BL は user 要求の 2 件のみ). 必要なら別 BL.
- **新規共通コンポーネント `<WeekdayCheckboxes>` の新設**: D-001 で個別実装を採用. 必要なら別 BL.
- **`RoutineRepository` / `RoutineConflictError` / mutation 経路の API 拡張**: 無改修 (既存 patch を活用).
- **domain / server API**: 無改修.
- **共通 button スタイル (BL-067)**: 別 BL.
- **`routine-card.css` の新規セレクタ追加**: 原則しない. 既存セレクタ (`.routine-card__day-checkboxes` / `.routine-card__form-inline` 等) を活用する. 編集モード form 内の曜日配置で wrap が必要な場合のみ最小限の追従 (P-002).
- **tokens.css への新規トークン追加**: G-11.

## 要件

### 機能要件

- **REQ-1 (`<RoutineFormCard>` の優先度 UI を `<PriorityStars />` に置換 / G-1 / G-2 / G-7)**

  `web/src/ui/routine-card/routine-form-card.tsx` を以下のように変更する.

  - **撤去する DOM**:
    ```jsx
    <div class="routine-card__priority-row">
      <label htmlFor={priorityId}>優先度</label>
      <select id={priorityId} class="routine-card__select" value={defaultPriority} onChange={...}>
        <option value="highest">最優先</option>
        <option value="normal">普通</option>
        <option value="later">後回し</option>
      </select>
    </div>
    ```

  - **追加する DOM**:
    ```jsx
    <PriorityStars
      value={defaultPriority}
      onChange={onDefaultPriorityChange}
      groupLabel="優先度"
      idPrefix="routine-create"
    />
    ```

  - 配置: 既存 `.routine-card__form-row--options` row 内の曜日チェックボックス群の右側 (= 元 `.routine-card__priority-row` があった位置).
  - prop 型変更:
    - `defaultPriority: string` → `defaultPriority: Priority` (`@todica/domain/task` 由来).
    - `onDefaultPriorityChange: (next: string) => void` → `onDefaultPriorityChange: (next: Priority) => void`.
  - `priorityId?: string` prop は撤去 (PriorityStars 内部の `idPrefix` で id 衝突を回避するため / D-002).
  - import 追加: `import { PriorityStars } from "../priority-stars/priority-stars.js";` + `import type { Priority } from "@todica/domain/task";`.

- **REQ-2 (`<RoutineCard>` 編集モードに曜日選択 UI を追加 / G-3 / G-4 / G-8)**

  `web/src/ui/routine-card/routine-card.tsx` の `isEditing=true` ブランチを以下のように変更する.

  - **props 追加** (`RoutineCardProps`):
    ```ts
    /** 編集モードの daysOfWeek (親が state を持つ). */
    editingDaysOfWeek: number[];
    /** 編集モードの曜日 toggle ハンドラ. */
    onEditingDaysOfWeekChange: (next: number[]) => void;
    ```

  - **編集モードの DOM** (`isEditing=true`):
    ```html
    <li class="routine-card routine-card--editing">
      <form aria-label="ルーティン名称変更フォーム" class="routine-card__form-inline">
        <label htmlFor="routine-edit-{routine.id}" class="visually-hidden">ルーティン名</label>
        <input id="routine-edit-{routine.id}" type="text" class="routine-card__input"
               value={editingName} placeholder="ルーティン名" required />
        <div class="routine-card__day-checkboxes" role="group" aria-label="曜日">
          <label><input type="checkbox" checked={editingDaysOfWeek.includes(0)} ... />日</label>
          <label><input type="checkbox" checked={editingDaysOfWeek.includes(1)} ... />月</label>
          ... (火 / 水 / 木 / 金 / 土 と同様)
        </div>
        <button type="submit">保存</button>
        <button type="button" onClick={onCancelEdit}>キャンセル</button>
      </form>
    </li>
    ```

  - DOM 順: `input → 曜日 → 保存 → キャンセル` (D-005).
  - `routine-card__day-checkboxes` は `<RoutineFormCard>` と同形 (G-8). 既存 CSS (`.routine-card__day-checkboxes { display: flex; flex-wrap: wrap; gap: var(--space-sm) }`) をそのまま流用する.
  - 曜日 checkbox の toggle ロジックは親側に持たせる (= `onEditingDaysOfWeekChange(next)` で親が `setEditingDaysOfWeek(next)` する).
  - 曜日 label テキストは「日」〜「土」を維持 (NFR-DAY-LABEL-PRESERVE / BL-061 NFR-DAY-LABEL-PRESERVE 整合).

- **REQ-3 (`routines-view.tsx` の state 追加 / G-4 / G-5)**

  `web/src/ui/routines-view/routines-view.tsx` を以下のように変更する.

  - **state 追加**:
    ```ts
    const [editingDaysOfWeek, setEditingDaysOfWeek] = useState<number[]>([]);
    ```

  - **`openEdit(routine)` 拡張**:
    ```ts
    const openEdit = useCallback((routine: WebRoutine) => {
      setEditingId(routine.id);
      setEditingName(routine.name);
      setEditingDaysOfWeek(routine.daysOfWeek);
    }, []);
    ```

  - **`cancelEdit()` 拡張**:
    ```ts
    const cancelEdit = useCallback(() => {
      setEditingId(null);
      setEditingName("");
      setEditingDaysOfWeek([]);
    }, []);
    ```

  - **`toggleEditingDay(day)` 新設**:
    ```ts
    const toggleEditingDay = useCallback((day: number) => {
      setEditingDaysOfWeek((prev) => {
        if (prev.includes(day)) return prev.filter((d) => d !== day);
        return [...prev, day].sort((a, b) => a - b);
      });
    }, []);
    ```

    `<RoutineCard>` に渡す `onEditingDaysOfWeekChange` は次の値そのものを受け取る形にする (= `toggleEditingDay(day)` を直接渡すのではなく, `<RoutineCard>` 内で次の配列を計算するか, 親に day を伝える 2 方式. D-006 で「親に day を伝える」を採用).
    実装方針 (D-006 採用): `<RoutineCard>` の `onEditingDaysOfWeekChange` props は「次の配列」を受け取る型 `(next: number[]) => void` で揃え, `<RoutineCard>` 内部で「現在の配列から day を toggle した次の配列」を計算する.

  - **`handleSaveEdit()` 拡張**:
    ```ts
    const handleSaveEdit = useCallback(
      async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingId) return;
        const routine = routines.find((r) => r.id === editingId);
        if (!routine) return;
        if (editingDaysOfWeek.length === 0) return; // 曜日 0 件は不許可 (REQ-3-2)
        await updateMutation.mutateAsync({
          id: editingId,
          ifMatch: routine.version,
          name: editingName,
          daysOfWeek: editingDaysOfWeek,
        });
        cancelEdit();
      },
      [editingId, editingName, editingDaysOfWeek, routines, updateMutation, cancelEdit],
    );
    ```

  - **`<RoutineCard>` への props 渡し追加**:
    ```jsx
    <RoutineCard
      key={routine.id}
      routine={routine}
      isEditing={editingId === routine.id}
      editingName={editingName}
      onEditingNameChange={setEditingName}
      editingDaysOfWeek={editingDaysOfWeek}
      onEditingDaysOfWeekChange={setEditingDaysOfWeek}
      onStartEdit={() => openEdit(routine)}
      onCancelEdit={cancelEdit}
      onSaveEdit={handleSaveEdit}
      onDelete={() => handleDelete(routine)}
    />
    ```

  - **`newDefaultPriority` state の型変更**:
    ```ts
    const [newDefaultPriority, setNewDefaultPriority] = useState<Priority>("normal");
    ```

    import 追加: `import type { Priority } from "@todica/domain/task";`.

  - **REQ-3-2 (曜日 0 件の不許可)**: 編集モードで曜日 0 件で保存ボタンを押した場合は何もしない (= `handleSaveEdit` で early return). 既存の作成フォーム (`handleCreate`) で `newDaysOfWeek.length === 0` のチェックがあるのと整合 (現行 L202 `if (newDaysOfWeek.length === 0) return;`). ボタンの disabled 化は本 BL では行わない (UI 統一性のためアラート / 視覚 cue は別 BL).

- **REQ-4 (`updateMutation` の mutationFn 引数型拡張 / G-6)**

  `routines-view.tsx` の `updateMutation` の mutationFn 引数型を以下のように拡張する.

  - **変更前** (現行 L129):
    ```ts
    mutationFn: async (cmd: { id: string; ifMatch: number; name: string }) => { ... }
    ```

  - **変更後**:
    ```ts
    mutationFn: async (cmd: { id: string; ifMatch: number; name: string; daysOfWeek: number[] }) => { ... }
    ```

  - body / enqueue の JSON も両方で `daysOfWeek` を含めるよう変更:
    ```ts
    body: JSON.stringify({ name: cmd.name, daysOfWeek: cmd.daysOfWeek }),
    ```

    およびそれを `repository.update(cmd)` に渡す (cmd は `UpdateRoutineCommand` に互換).

  - `WebRoutineRepository.update()` の `UpdateRoutineCommand` は既に `daysOfWeek?: number[]` を受理する (BL-017 完了済み / repository.ts L29). 本 BL では `daysOfWeek` を必須として送る (= optional から required へ運用変更. API は optional を受理し続けるため backward compatible).

- **REQ-5 (曜日 checkbox の onChange ハンドラ / G-3 / D-006)**

  `<RoutineCard>` 編集モードの曜日 checkbox は以下のハンドラを持つ:

  ```jsx
  <label key={day}>
    <input
      type="checkbox"
      checked={editingDaysOfWeek.includes(day)}
      onChange={() => {
        const next = editingDaysOfWeek.includes(day)
          ? editingDaysOfWeek.filter((d) => d !== day)
          : [...editingDaysOfWeek, day].sort((a, b) => a - b);
        onEditingDaysOfWeekChange(next);
      }}
    />
    {label}
  </label>
  ```

  - 次の配列を `onEditingDaysOfWeekChange(next)` に渡す. 親側は `setEditingDaysOfWeek(next)` をそのまま渡せる.

- **REQ-6 (BL-061 D-008-2 を逆転して優先度 label を撤去 / G-7)**

  BL-061 D-008-2 で「優先度 label は visually-hidden にせず可視のまま残す」と確定したが, 本 BL では `<PriorityStars />` への置換に伴い「優先度」テキストの可視 label 自体を撤去する.

  - 撤去対象: `<label htmlFor={priorityId}>優先度</label>` の DOM.
  - a11y 担保: `<PriorityStars />` の `groupLabel="優先度"` prop により radiogroup の aria-label が `"優先度: ○○"` 形式で組み立てられる (BL-040 REQ-4 / D-002). 支援技術には「優先度の選択肢である」ことが伝わる.
  - spec 上の記録 (G-7 / D-007): BL-061 spec.md の D-008-2 は「BL-068 で逆転」のリンクを spec へ追記する (本 BL の docs/developer/features/routine-card-component/spec.md 側に注釈 1 行を追加する追従修正 / R-002 / P-005).

- **REQ-7 (`routine-card.css` の最小改修)**

  - 既存セレクタ `.routine-card__day-checkboxes` (display: flex / flex-wrap: wrap / gap: var(--space-sm)) は無改修で `<RoutineCard>` 編集モードでも流用できる.
  - 編集モード form `.routine-card__form-inline` の `align-items: center` で曜日 checkbox 群が垂直方向中央寄せになる挙動を許容する (= D-008). 曜日 wrap で複数段になっても name input と保存 / キャンセル button は center align のまま. 視覚的に窮屈な場合は `flex-wrap: wrap` の追加検討 (P-002) を要するが本 BL では追加しない方針 (CSS 改修最小化).
  - 撤去対象: 旧 `.routine-card__priority-row` / `.routine-card__select` (BL-061 で空ルールだったセレクタ). 本 BL で `<select>` 自体を撤去するため CSS も同時撤去.
  - 維持: `.routine-card` / `.routine-card--form` / `.routine-card--editing` / `.routine-card__main` / `.routine-card__name` / `.routine-card__days-label` / `.routine-card__actions` / `.routine-card__actions__edit` / `.routine-card__actions__delete` / `.routine-card__form-inline` / `.routine-card__form-row` / `.routine-card__day-checkboxes` / `.routine-card__input` / `.routine-card__input::placeholder` / `.routine-card__submit` / `.visually-hidden`.

- **REQ-8 (新規 component / 新規 CSS 系の追加なし / D-001)**

  - 新規 React コンポーネント (`<WeekdayCheckboxes>` 等) は作らない.
  - 新規 CSS ファイルは作らない.
  - tokens.css への新規トークン追加なし.

### 非機能要件

- **NFR-COMPAT**: `RoutineRepository` / `RoutineConflictError` / mutation 経路 / ConflictDialog / offline-queue / notifyError は無改修 (API 拡張なし / 既存 patch を活用).
- **NFR-NO-NEW-TOKENS**: tokens.css を変更しない. 既存トークンのみで構成する.
- **NFR-NO-NEW-COMPONENTS**: 新規 React コンポーネント / 新規 CSS ファイルを作らない.
- **NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION**: `.routine-card` 系セレクタに新規 `box-shadow` / `:hover` / `transition` / `animation` を追加しない (BL-061 整合).
- **NFR-DAY-LABEL-PRESERVE**: 曜日 checkbox の label テキスト「日」「月」「火」「水」「木」「金」「土」は維持 (BL-061 整合 / `e2e/routines.spec.ts` L22 等の `getByLabel("月", { exact: true })`).
- **NFR-FORM-ARIA-LABEL-PRESERVE**: 作成 form の `aria-label="ルーティン作成フォーム"` と編集 form の `aria-label="ルーティン名称変更フォーム"` は**維持** (BL-061 整合).
- **NFR-NAME-INPUT-PRESERVE**: name input の placeholder「ルーティン名」と visually-hidden label「ルーティン名」は維持 (BL-061 REQ-7 整合).
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.
- **NFR-DOM-COMPATIBLE-LI**: 一覧の各行は引き続き `<li>` 直下に配置する (= `<RoutineCard as="li">`). 既存テストの `<li>` ベース取得が壊れない.
- **NFR-PRIORITY-STARS-COMPAT**: `<PriorityStars />` 本体 (BL-040) を無改修.
- **NFR-PRESERVE-SHELL**: BL-045 の `.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` のルール本文は無改修.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` (vitest 単体) と `npx playwright test` (E2E) を基準とする.

```
シナリオ AC-1: <RoutineFormCard> が <PriorityStars /> を render し <select> は不在
  Given <RoutineFormCard defaultPriority="normal" ... /> を render する
  When  出力 DOM を観察する
  Then  div[role="radiogroup"] (PriorityStars) が存在する
   かつ select#routine-priority が存在しない
   かつ <label htmlFor="routine-priority">優先度</label> が存在しない
```

```
シナリオ AC-2: RoutineFormCardProps.defaultPriority の型が Priority である
  Given web/src/ui/routine-card/routine-form-card.tsx を開いた
  When  RoutineFormCardProps の型定義を観察する
  Then  defaultPriority: Priority の宣言を含む
   かつ onDefaultPriorityChange: (next: Priority) => void の宣言を含む
   かつ import type { Priority } from "@todica/domain/task" を含む
```

```
シナリオ AC-3: PriorityStars の操作で onDefaultPriorityChange が Priority 型で呼ばれる
  Given <RoutineFormCard defaultPriority="normal" onDefaultPriorityChange={mock} ... /> を render する
  When  ☆3 つ目 (highest) の button を click する
  Then  mock が "highest" 文字列で 1 回呼ばれる
   かつ ☆2 つ目 (normal) を click すると "later" or "normal" ではなく "normal" の場合 no-op (D-003 / BL-040)
```

```
シナリオ AC-4: <RoutineCard isEditing=true> に曜日選択 UI (7 個の checkbox) が表示される
  Given <RoutineCard isEditing={true} editingDaysOfWeek={[1]} onEditingDaysOfWeekChange={mock} ... /> を render する
  When  編集 form 内を観察する
  Then  div.routine-card__day-checkboxes 要素が存在する
   かつ role="group" aria-label="曜日" が付与されている
   かつ checkbox <input> が 7 個存在する
   かつ 各 label のテキスト「日」「月」「火」「水」「木」「金」「土」が順番に存在する
   かつ 月曜 (index 1) の checkbox が checked である
   かつ それ以外 6 個の checkbox が unchecked である
```

```
シナリオ AC-5: 曜日 checkbox の操作で onEditingDaysOfWeekChange が次の配列で呼ばれる
  Given <RoutineCard isEditing={true} editingDaysOfWeek={[1]} onEditingDaysOfWeekChange={mock} ... /> を render する
  When  火曜 (index 2) の checkbox を click する
  Then  mock が [1, 2] の配列で 1 回呼ばれる
  When  さらに月曜 (index 1) の checkbox を click する
  Then  mock が ([1, 2] を元として) [2] の配列で次に呼ばれる
```

```
シナリオ AC-6: 編集 → 保存で daysOfWeek が updateMutation 経由で送信される
  Given /routines にルーティン (name="A", daysOfWeek=[1], version=1) が 1 件存在する
   かつ updateMutation を spy する
  When  「変更」 button を click し editing モードへ遷移する
   かつ 火曜 (index 2) の checkbox を click する
   かつ 「保存」 button を click する
  Then  updateMutation.mutateAsync が { id, ifMatch: 1, name: "A", daysOfWeek: [1, 2] } で 1 回呼ばれる
```

```
シナリオ AC-7: BL-061 確定の name 変更経路が維持されている
  Given /routines にルーティン (name="A", daysOfWeek=[1], version=1) が 1 件存在する
  When  「変更」 button を click し editing モードへ遷移する
   かつ name input を "B" に変更する
   かつ 「保存」 button を click する
  Then  updateMutation.mutateAsync が { id, ifMatch: 1, name: "B", daysOfWeek: [1] } で 1 回呼ばれる
   かつ name のみの変更でも daysOfWeek を「変更前の値」で送信する
```

```
シナリオ AC-8: 編集モードで曜日 0 件のとき「保存」を押しても mutation は呼ばれない
  Given /routines にルーティン (name="A", daysOfWeek=[1], version=1) が 1 件存在する
  When  「変更」 button を click し editing モードへ遷移する
   かつ 月曜 (index 1) の checkbox を click して unchecked にする (editingDaysOfWeek=[])
   かつ 「保存」 button を click する
  Then  updateMutation.mutateAsync は呼ばれない
   かつ 編集モードのままである
```

```
シナリオ AC-9: openEdit() で editingDaysOfWeek が routine.daysOfWeek で初期化される
  Given /routines にルーティン (name="A", daysOfWeek=[1, 3, 5], version=1) が 1 件存在する
  When  「変更」 button を click し editing モードへ遷移する
  Then  月曜 (1) / 水曜 (3) / 金曜 (5) の checkbox が checked である
   かつ 日 (0) / 火 (2) / 木 (4) / 土 (6) の checkbox が unchecked である
```

```
シナリオ AC-10: cancelEdit() で曜日 state がリセットされる
  Given 編集モードで月曜と火曜を check した状態にある
  When  「キャンセル」 button を click する
  Then  編集モードを抜け表示モードに戻る
   かつ 表示モードの曜日表示 (`.routine-card__days-label`) は routine.daysOfWeek (= 変更前の値) を表示する
```

```
シナリオ AC-11: <RoutineCard> の DOM 順は input → 曜日 → 保存 → キャンセル である (D-005)
  Given <RoutineCard isEditing={true} editingDaysOfWeek={[1]} ... /> を render する
  When  編集 form 内の direct children を DOM 順に観察する
  Then  最初の child は label.visually-hidden (htmlFor=input) である
   かつ 2 番目の child は input である
   かつ 3 番目の child は div.routine-card__day-checkboxes である
   かつ 4 番目の child は button[type="submit"] (保存) である
   かつ 5 番目の child は button[type="button"] (キャンセル) である
```

```
シナリオ AC-12: routine-card.css から .routine-card__priority-row / .routine-card__select が撤去されている
  Given web/src/ui/routine-card/routine-card.css を開いた
  When  ファイル本文を観察する
  Then  .routine-card__priority-row セレクタが定義されていない
   かつ .routine-card__select セレクタが定義されていない
```

```
シナリオ AC-13: routine-card.css の維持セレクタが引き続き存在する (REQ-7)
  Given web/src/ui/routine-card/routine-card.css を開いた
  When  ファイル本文を観察する
  Then  .routine-card セレクタが定義されている
   かつ .routine-card--form セレクタが定義されている
   かつ .routine-card--editing セレクタが定義されている
   かつ .routine-card__main / __name / __days-label / __actions セレクタが定義されている
   かつ .routine-card__form-inline / __form-row / __day-checkboxes セレクタが定義されている
   かつ .routine-card__input / __input::placeholder / __submit セレクタが定義されている
   かつ .visually-hidden セレクタが定義されている
```

```
シナリオ AC-14: RoutineCardProps に editingDaysOfWeek / onEditingDaysOfWeekChange が追加されている
  Given web/src/ui/routine-card/routine-card.tsx を開いた
  When  RoutineCardProps の interface を観察する
  Then  editingDaysOfWeek: number[] の宣言を含む
   かつ onEditingDaysOfWeekChange: (next: number[]) => void の宣言を含む
   かつ 既存の routine / isEditing / editingName / onEditingNameChange / onStartEdit / onCancelEdit / onSaveEdit / onDelete / as は維持されている
```

```
シナリオ AC-15: routines-view.tsx が editingDaysOfWeek state を持ち <RoutineCard> に渡す (REQ-3)
  Given web/src/ui/routines-view/routines-view.tsx を開いた
  When  ファイル本文を観察する
  Then  useState<number[]>([...]) の editingDaysOfWeek 宣言を含む
   かつ openEdit 内で setEditingDaysOfWeek(routine.daysOfWeek) を呼ぶ
   かつ cancelEdit 内で setEditingDaysOfWeek([]) (または等価) を呼ぶ
   かつ handleSaveEdit 内で editingDaysOfWeek.length === 0 の early return を含む
   かつ updateMutation.mutateAsync に { ..., daysOfWeek: editingDaysOfWeek } を渡す
   かつ <RoutineCard ... editingDaysOfWeek={editingDaysOfWeek} onEditingDaysOfWeekChange={setEditingDaysOfWeek} ... /> の使用を含む
```

```
シナリオ AC-16: routines-view.tsx の newDefaultPriority state が Priority 型である
  Given routines-view.tsx を開いた
  When  ファイル本文を観察する
  Then  useState<Priority>("normal") の宣言を含む
   かつ import type { Priority } from "@todica/domain/task" を含む
```

```
シナリオ AC-17: updateMutation の mutationFn 引数型に daysOfWeek が含まれる (REQ-4)
  Given routines-view.tsx を開いた
  When  updateMutation の mutationFn 引数型を観察する
  Then  { id: string; ifMatch: number; name: string; daysOfWeek: number[] } の宣言を含む
   かつ body の JSON.stringify に daysOfWeek が含まれる
```

```
シナリオ AC-18: tokens.css を変更していない (NFR-NO-NEW-TOKENS)
  Given 本 BL の実装がマージされた
  When  tokens.css を BL-061 完了時点と比較する
  Then  差分が無い
```

```
シナリオ AC-19: RoutineRepository / Repository API / RoutineConflictError は無改修 (NFR-COMPAT)
  Given web/src/repositories/routine-repository.ts を開いた
  When  本 BL の前後で diff を取る
  Then  WebRoutineRepository / UpdateRoutineCommand / RoutineConflictError の export 型に差分が無い
   かつ ConflictDialog / useConflictDialog の呼び出しに差分が無い
   かつ <PriorityStars /> 本体 (priority-stars.tsx / priority-stars.css) に差分が無い
```

```
シナリオ AC-20: 既存単体テスト全件 green (追従修正後)
  Given /routines が引き続きレンダリング可能
  When  ルートから npm test (vitest 全件) を実行する
  Then  すべて green である
   かつ BL-061 routine-card-component.test.tsx の追従修正後の assertion が green である
```

```
シナリオ AC-21: 既存 E2E 全件 green (追従修正後)
  Given Playwright が起動可能
  When  npx playwright test を実行する
  Then  すべて green である
   かつ e2e/routines.spec.ts が green である
   かつ e2e/a11y.spec.ts の /routines スキャンが violations 0 件である
```

```
シナリオ AC-22: アクセシビリティ違反 0 件を維持する (NFR-A11Y)
  Given /routines をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts)
  Then  すべてのスキャンで violations.length === 0
```

```
シナリオ AC-23: BL-061 spec の D-008-2 を逆転した記録が残っている (G-7 / REQ-6)
  Given docs/developer/features/routine-card-component/spec.md を開いた
  When  D-008-2 の節を観察する
  Then  「BL-068 で逆転」または「routine-card-edit-fields で逆転」の言及が追記されている
   かつ 本 BL (routine-card-edit-fields) の spec.md へのリンクが存在する
```

```
シナリオ AC-24: <RoutineFormCard> の優先度に <PriorityStars /> が使われ groupLabel="優先度" / idPrefix="routine-create" が渡される (REQ-1)
  Given web/src/ui/routine-card/routine-form-card.tsx を開いた
  When  <PriorityStars ... /> の呼び出しを観察する
  Then  value={defaultPriority} を含む
   かつ onChange={onDefaultPriorityChange} を含む
   かつ groupLabel="優先度" を含む
   かつ idPrefix="routine-create" を含む
```

```
シナリオ AC-25: 既存 BL-061 spec の NFR-FORM-ARIA-LABEL-PRESERVE / NFR-DAY-LABEL-PRESERVE / NFR-NAME-INPUT-PRESERVE が引き続き満たされる
  Given /routines を render する
  When  作成 form / 編集 form を観察する
  Then  作成 form の aria-label は「ルーティン作成フォーム」である
   かつ 編集 form の aria-label は「ルーティン名称変更フォーム」である
   かつ 曜日 7 個の label テキスト (日〜土) が維持されている
   かつ name input に placeholder="ルーティン名" と visually-hidden label「ルーティン名」が維持されている
```

## 重要な決定 (D 章)

- **D-001 (曜日選択 UI の共通化方針 / 個別実装を採用)**:
  - 候補:
    - (i) 新規共通コンポーネント `<WeekdayCheckboxes>` を新設して `<RoutineFormCard>` / `<RoutineCard>` 編集モードの両方で利用.
    - (ii) 個別に書く (DRY 違反だが影響範囲小).
  - 採用: (ii) 個別実装. 理由:
    - 7 個の checkbox を render する数行のコードは複雑性が低く, 共通化のコスト (= 専用 component + テスト) を上回るメリットが乏しい.
    - 親側の state 管理が `<RoutineFormCard>` (作成時の `newDaysOfWeek`) と `<RoutineCard>` (編集時の `editingDaysOfWeek`) で別なため, props 経由で同じシグネチャに揃えても 2 か所書く必要は残る.
    - `.routine-card__day-checkboxes` CSS クラスを共有することで visual 整合は担保できる (G-8).
  - 将来 routine 以外 (例えば設定の境界曜日) で曜日選択が必要になった場合は別 BL で共通 component 化を検討.

- **D-002 (PriorityStars の groupLabel と idPrefix)**:
  - `groupLabel="優先度"` を渡す. BL-040 REQ-4 / D-002 により radiogroup の aria-label は `"優先度: 普通"` (現在値 normal の場合) のように組み立てられる.
  - `idPrefix="routine-create"` を渡す. RoutineFormCard の優先度入力は 1 つだけで衝突可能性は低いが, TaskFormCard との一貫性のため明示的に prefix を指定 (BL-059 / BL-040 流儀).
  - RoutineFormCardProps の `priorityId?: string` prop は撤去 (= PriorityStars 内部で id を持つため不要 / REQ-1).

- **D-003 (RoutineFormCard の優先度 label の扱い / 完全撤去を採用)**:
  - 候補:
    - (i) `<label htmlFor={priorityId}>優先度</label>` を visually-hidden 化.
    - (ii) 完全撤去 (= `<PriorityStars />` の groupLabel に統合).
    - (iii) `<PriorityStars />` の外側に追加のラッパ div で「優先度」テキストを残す.
  - 採用: (ii) 完全撤去. 理由:
    - `<PriorityStars />` 内部の radiogroup aria-label が「優先度: ○○」を組み立てるため, 支援技術には十分伝わる (BL-040 REQ-4 / D-002).
    - 視覚 user には ☆☆☆ の見た目で「優先度の選択」と直感的に理解できる (タスク側も同じ UI 配置 / BL-059 整合).
    - BL-061 D-008-2 で確定した「優先度 label を可視のまま残す」は本 BL で逆転する (= 当時は `<select>` だったため label が必要だったが PriorityStars は self-describing).
  - 不採用案 (i): visually-hidden でも DOM 上の `<label>` は残るが, BL-040 の radiogroup aria-label と二重で「優先度」を伝えることになり redundant.
  - 不採用案 (iii): 視覚的にも redundant.

- **D-004 (編集モードの曜日選択 label の扱い / 維持を採用)**:
  - 候補:
    - (i) `role="group" aria-label="曜日"` のラッパを置く (= RoutineFormCard と同形).
    - (ii) `<label class="visually-hidden">曜日</label>` を別途追加.
    - (iii) 何も付けない.
  - 採用: (i). RoutineFormCard と同じパターン (BL-061 P-012 整合) で 7 個の checkbox を「曜日」コンテキストでまとめる. axe-core で違反しない (BL-061 R-007 整合).

- **D-005 (編集モードの DOM 順 / input → 曜日 → 保存 → キャンセル)**:
  - 候補:
    - (i) `input → 曜日 → 保存 → キャンセル` (= 入力 → 操作の自然順).
    - (ii) `曜日 → input → 保存 → キャンセル` (= 曜日が先).
    - (iii) `input → 保存 → キャンセル → 曜日` (= 既存 BL-061 の input + 保存 + キャンセル を維持し曜日は末尾).
  - 採用: (i). 理由:
    - 視覚順と Tab フォーカス順が「name 入力 → 曜日選択 → 保存 / キャンセル」となり, 直感的.
    - 編集 form 全体の `.routine-card__form-inline { display: flex; align-items: center; gap: var(--space-sm) }` で flex 横並びに乗る. 曜日 7 個が wrap した場合は 2 段になるが name input と保存 / キャンセル は同段に残る.
  - 不採用案 (iii): キャンセルの右に曜日がぶら下がる視覚順は不自然.

- **D-006 (曜日 checkbox の onChange ハンドラ方式 / 次の配列を渡す)**:
  - 候補:
    - (i) `onEditingDaysOfWeekChange: (next: number[]) => void` で次の配列そのものを渡す. RoutineCard 内で toggle ロジックを持つ.
    - (ii) `onToggleEditingDay: (day: number) => void` で day を渡す. routines-view 側で toggle ロジックを持つ.
  - 採用: (i). 理由:
    - 親側の handler が `setEditingDaysOfWeek` をそのまま渡せる (= boilerplate 最小).
    - `<RoutineFormCard>` の `onToggleDay: (day: number) => void` (BL-061) とは方式が違うが, routines-view の `toggleDay` 関数で吸収できる (= setNewDaysOfWeek 経由で同じ result).
    - `<RoutineCard>` を実装する際に「現在の配列を closure で参照する」必要が出るが, props の `editingDaysOfWeek` を直接参照すればよく難しくない.
  - 不採用案 (ii): RoutineFormCard と一貫するが, routines-view 側に `toggleEditingDay` helper を別途定義する必要があり cmd 経路が増える.

- **D-007 (テスト方針)**:
  - 新規テストファイル `web/__tests__/routine-card-edit-fields.test.tsx` を作る.
    - (a) CSS 直読み: AC-12 / AC-13 (`.routine-card__priority-row` / `__select` 撤去 + 維持セレクタ).
    - (b) jsdom DOM レンダ (`<RoutineFormCard>` 単体): AC-1 / AC-3 / AC-24.
    - (c) jsdom DOM レンダ (`<RoutineCard isEditing>` 単体): AC-4 / AC-5 / AC-10 / AC-11.
    - (d) 型定義の grep 系: AC-2 / AC-14 / AC-15 / AC-16 / AC-17 / AC-23.
    - (e) 結合系 (`/routines` を render してフロー全体): AC-6 / AC-7 / AC-8 / AC-9 / AC-25.
    - (f) 不変性 assert: AC-18 / AC-19.
  - 既存テストの追従:
    - **`web/__tests__/routine-card-component.test.tsx` (BL-061)**:
      - 旧 `<select id="routine-priority">` / `<label htmlFor="routine-priority">` を assert している箇所を `<PriorityStars />` の存在 assert に置換 (R-001).
      - `<RoutineCard>` の編集モード DOM assert に 曜日 checkbox 群を追加 (R-001).
      - `RoutineCardProps` / `RoutineFormCardProps` の interface assert を本 BL の prop 追加 / 削除に追従.
      - 詳細な diff は plan.md / P-004.
    - **`docs/developer/features/routine-card-component/spec.md` (BL-061)**: D-008-2 節に「本 BL (BL-068) で逆転」の注釈 1 行を追加 (R-002 / REQ-6).
    - **`e2e/routines.spec.ts`**: 作成フォームでの優先度操作を `getByLabel("優先度")` の `<select>` 操作 → `<PriorityStars />` の `getByRole("radio", { name: /星 \d/ })` 経由に変更. 編集 / 削除 / 曜日操作は無修正. 詳細は plan.md / P-005.

- **D-008 (CSS 改修の最小化)**:
  - `routine-card.css` で撤去するのは `.routine-card__priority-row` / `.routine-card__select` の 2 セレクタ (BL-061 で空ルールだったもの).
  - 既存セレクタ `.routine-card__day-checkboxes` は無改修で `<RoutineCard>` 編集モードでも流用可能.
  - 編集モードで曜日 7 個が name input と保存 / キャンセル button と同 row に並ぶため, `.routine-card__form-inline { flex-wrap: wrap }` の追加が視覚的に必要な可能性があるが, 本 BL では追加しない (P-002 / 必要が出た時に別 BL).
  - **BL-071 (routine-card-header-layout) で関連変更**: `<RoutineCard>` の表示モード DOM (= `.routine-card__main`) は BL-070 で「編集モード」概念が撤去された後, BL-071 で `.routine-card__main` ラッパ自体が撤去され `.routine-card__header` / `.routine-card__day-checkboxes` / `.routine-card__actions` の 3 段構造に再編された. 曜日 checkbox 群 (`.routine-card__day-checkboxes`) の CSS は本 D-008 の方針どおり無改修で BL-071 後も流用される.
  - **BL-072 (routine-form-card-header-layout) で関連変更**: `<RoutineFormCard>` (起票カード) でも `<PriorityStars />` の配置位置が, 2 段目 row (`.routine-card__form-row--options`) 内の曜日チェックボックス群右側から, 新設 `.routine-card__header` 段 (右端固定) に移動した. `groupLabel="優先度"` / `idPrefix="routine-create"` および即時 `onDefaultPriorityChange` 経路は本 BL の方針どおり無改修. 詳細は [`../routine-form-card-header-layout/spec.md`](../routine-form-card-header-layout/spec.md).

- **D-009 (`<PriorityStars />` の配置位置 / D-001 整合)**:
  - 本 BL で `<PriorityStars />` を配置する位置は, `<RoutineFormCard>` の 2 段目 row (`.routine-card__form-row--options`) 内の「曜日チェックボックス群の右側」(= 旧 `.routine-card__priority-row` があった位置).
  - DOM 構造は:
    ```jsx
    <div className="routine-card__form-row routine-card__form-row--options">
      <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">...</div>
      <PriorityStars value={...} onChange={...} groupLabel="優先度" idPrefix="routine-create" />
    </div>
    ```
  - flex の `align-items: center` で 7 個の曜日 checkbox と 3 個の星 button が垂直方向中央寄せ.

- **D-010 (既存テスト追従コストの見積もり)**:
  - `web/__tests__/routine-card-component.test.tsx` (BL-061) は 100 件超想定. 本 BL の追従対象は (a) `<select id="routine-priority">` 系 (約 10 件想定), (b) `<RoutineCardProps>` interface 系 (約 5 件), (c) 編集モード DOM 系 (約 5 件), 合計 20 件前後.
  - `e2e/routines.spec.ts` は L20-50 の作成フロー部分のみ追従. L33 の編集フローは name のみで曜日操作なしのため無修正でも通る想定. 編集での曜日操作は新規 e2e (`e2e/routine-card-edit-fields.spec.ts`) で追加カバー (D-007 / R-003).

- **D-011 (`<RoutineCard>` 編集モードでの defaultPriority 編集 / 非ゴール)**:
  - user 要求は「優先度はタスクと統一」「編集モードで曜日変更」の 2 件のみ. 「編集モードで defaultPriority 変更」は user 要求に含まれない.
  - 必要なら別 BL で追加. その時は `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange` を `RoutineCardProps` に追加するパターンになる.
  - **BL-069 (routine-card-edit-priority) で逆転**: 本決定は BL-069 で逆転し, 編集モードに `<PriorityStars editingDefaultPriority />` を追加した. 詳細は [`../routine-card-edit-priority/spec.md`](../routine-card-edit-priority/spec.md) REQ-1 / D-001 を参照.

- **D-012 (Web Routine の create 時の defaultPriority 型 / 互換性)**:
  - `WebRoutineRepository.create()` の `CreateRoutineCommand.defaultPriority: string` は無改修. routines-view.tsx 側で `Priority` 型の値 ("highest" / "normal" / "later") を渡す形になる (= string でも互換).
  - `routines-view.tsx` の `createMutation` の引数型に明示的な型 annotation を付けるかは任意 (現行コードでは `string` のまま).

- **D-013 (PR 提出単位)**:
  - 単一 PR で完結させる. 影響範囲が限定的 (presentation 層のみ) で, 中間状態 (= 優先度だけ stars 化 / 曜日編集だけ追加) を作ると BL-061 既存テストが部分 red のまま残るリスクがあるため.

## 未決事項 / 確認待ち

- なし (D-001 〜 D-013 で本 BL の判断軸はすべて確定. 詳細な追従マッピングと PR 提出単位は plan.md / tasks.md で確定).
