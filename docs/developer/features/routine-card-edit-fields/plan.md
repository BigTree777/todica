# 設計・実装計画: ルーティンの優先度 UI 統一 + 編集モードでの曜日変更 (routine-card-edit-fields)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

BL-061 で導入された `<RoutineCard>` / `<RoutineFormCard>` / `routine-card.css` の 3 ファイルに対し, 2 つの user 改善要求 (優先度の `<PriorityStars />` 化 / 編集モードの曜日選択 UI 追加) を最小改修で実現する.

新規 component / 新規 CSS ファイル / tokens.css への新規トークンは作らない (NFR-NO-NEW-COMPONENTS / NFR-NO-NEW-TOKENS / D-001). 既存 `<PriorityStars />` (BL-040) を再利用し, 曜日選択 UI は既存 `.routine-card__day-checkboxes` CSS を `<RoutineCard>` 編集モード DOM にも適用する (G-8). `RoutineRepository.update()` は BL-017 で既に `daysOfWeek?` patch を受理しており API 改修不要 (NFR-COMPAT / G-6 / G-10).

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (NFR-COMPAT) |
| DB | 変更なし |
| domain | 変更なし |
| サーバ (`server/`) | 変更なし |
| Repository (`web/src/repositories/routine-repository.ts`) | 変更なし (NFR-COMPAT / BL-017 で daysOfWeek patch は対応済み) |
| `<PriorityStars />` (`web/src/ui/priority-stars/`) | 変更なし (NFR-PRIORITY-STARS-COMPAT / BL-040) |
| トークン (`web/src/styles/tokens.css`) | **変更なし** (NFR-NO-NEW-TOKENS / G-11) |
| 編集 (`web/src/ui/routine-card/routine-form-card.tsx`) | `<select id="routine-priority">` + `<label>` + `.routine-card__priority-row` ラッパを撤去, `<PriorityStars value={defaultPriority} onChange={onDefaultPriorityChange} groupLabel="優先度" idPrefix="routine-create" />` に置換. `defaultPriority` prop 型を `string` → `Priority` に変更, `priorityId?` prop を撤去. import 追加 (PriorityStars / Priority). 詳細は P-001 (REQ-1 / REQ-6 / D-002 / D-003) |
| 編集 (`web/src/ui/routine-card/routine-card.tsx`) | `isEditing=true` ブランチの form DOM に `<div className="routine-card__day-checkboxes" role="group" aria-label="曜日">` + 7 個の checkbox `<label>` を追加. DOM 順は input → 曜日 → 保存 → キャンセル (D-005). `RoutineCardProps` に `editingDaysOfWeek: number[]` / `onEditingDaysOfWeekChange: (next: number[]) => void` を追加. DAY_LABELS 定数は既存利用を維持. 詳細は P-002 (REQ-2 / REQ-5) |
| 編集 (`web/src/ui/routine-card/routine-card.css`) | `.routine-card__priority-row` / `.routine-card__select` の 2 セレクタを撤去 (BL-061 で空ルールだったもの / REQ-7). 他は無改修 (D-008) |
| 編集 (`web/src/ui/routines-view/routines-view.tsx`) | state 追加 (`editingDaysOfWeek`), `openEdit()` / `cancelEdit()` / `handleSaveEdit()` 追従, `updateMutation` の mutationFn 引数型に `daysOfWeek: number[]` 追加 (body も追従). `newDefaultPriority` state 型を `string` → `Priority` に変更. `<RoutineCard>` に props 渡しを追加. `<RoutineFormCard>` の props は型変更 (defaultPriority / onDefaultPriorityChange). import 追加 (`Priority` 型). 詳細は P-003 (REQ-3 / REQ-4 / D-006 / D-012) |
| 新規 単体テスト (`web/__tests__/routine-card-edit-fields.test.tsx`) | CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-25 を網羅. 詳細は P-004 (D-007) |
| 既存単体テスト追従 (`web/__tests__/routine-card-component.test.tsx`) | (a) `<select id="routine-priority">` 系 assert を `<PriorityStars />` 存在 assert に置換, (b) `<RoutineCardProps>` interface 系 assert に `editingDaysOfWeek` / `onEditingDaysOfWeekChange` 追加, (c) 編集モード DOM 系 assert に曜日 checkbox 群を追加, (d) `RoutineFormCardProps.defaultPriority` 型 assert を `string` → `Priority` に追従, (e) `.routine-card__priority-row` / `.routine-card__select` の存在 assert を撤去 (= 不在 assert へ逆転). 詳細は P-004 (D-007 / D-010) |
| 既存 spec 追従 (`docs/developer/features/routine-card-component/spec.md`) | D-008-2 節に「本 BL (BL-068 / routine-card-edit-fields) で逆転」の注釈 1 行を追加 (R-002 / REQ-6 / AC-23) |
| E2E (`e2e/routines.spec.ts`) | 作成フォームでの優先度操作を `<select>` 経由 → `<PriorityStars />` の `getByRole("radio", { name: /^星 \d/ })` 経由に追従. 詳細は P-005 (R-003) |
| 新規 E2E (`e2e/routine-card-edit-fields.spec.ts`) | (a) 編集モードで曜日選択 UI が表示される, (b) 曜日を変更して保存 → 再読込で反映される, (c) 名前のみ変更 → daysOfWeek は変更前の値で送信される, (d) 曜日 0 件で保存ボタンを押しても変更されない, の 4 シナリオを新規追加 (R-003) |
| E2E (`e2e/secondary-views-style.spec.ts`) | 無修正 (BL-061 で routines を AC-4 / AC-5 から除外済み) |
| E2E (`e2e/a11y.spec.ts`) | 無修正. 既存スキャンが violations 0 件のまま通る想定 (NFR-A11Y / AC-22) |

## 設計詳細

### データモデル

変更なし. 本 BL は presentation 層 + view の state 拡張のみ.

### 処理フロー (DOM 構造 + コンポーネント API)

#### `<RoutineFormCard>` API 変更後 (REQ-1 / G-1 / G-2)

```tsx
// web/src/ui/routine-card/routine-form-card.tsx
import type { Priority } from "@todica/domain/task";
import { PriorityStars } from "../priority-stars/priority-stars.js";
import "./routine-card.css";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface RoutineFormCardProps {
  name: string;
  onNameChange: (next: string) => void;
  daysOfWeek: number[];
  onToggleDay: (day: number) => void;
  defaultPriority: Priority;                             // ← string から Priority へ
  onDefaultPriorityChange: (next: Priority) => void;     // ← string から Priority へ
  onSubmit: (e: React.FormEvent) => void;
  inputId?: string;
  // priorityId?: string;                                 // ← 撤去 (D-002)
  formAriaLabel?: string;
}

export function RoutineFormCard(props: RoutineFormCardProps): JSX.Element {
  const {
    name,
    onNameChange,
    daysOfWeek,
    onToggleDay,
    defaultPriority,
    onDefaultPriorityChange,
    onSubmit,
    inputId = "routine-name",
    formAriaLabel = "ルーティン作成フォーム",
  } = props;

  return (
    <form
      onSubmit={onSubmit}
      aria-label={formAriaLabel}
      className="routine-card routine-card--form"
    >
      <div className="routine-card__form-row routine-card__form-row--name">
        <label htmlFor={inputId} className="visually-hidden">ルーティン名</label>
        <input
          id={inputId}
          type="text"
          className="routine-card__input"
          value={name}
          placeholder="ルーティン名"
          onChange={(e) => onNameChange(e.target.value)}
          required
        />
        <button type="submit" className="routine-card__submit">追加</button>
      </div>
      <div className="routine-card__form-row routine-card__form-row--options">
        <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
          {DAY_LABELS.map((label, day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={daysOfWeek.includes(day)}
                onChange={() => onToggleDay(day)}
              />
              {label}
            </label>
          ))}
        </div>
        <PriorityStars
          value={defaultPriority}
          onChange={onDefaultPriorityChange}
          groupLabel="優先度"
          idPrefix="routine-create"
        />
      </div>
    </form>
  );
}
```

- 撤去対象 DOM: `<div className="routine-card__priority-row">{...}</div>` (旧 BL-061 REQ-2).
- 追加対象 DOM: `<PriorityStars ... />`.
- prop 型変更: `defaultPriority` / `onDefaultPriorityChange` を `Priority` 型に.
- prop 撤去: `priorityId?` (D-002).

#### `<RoutineCard>` API 変更後 (REQ-2 / G-3 / G-4)

```tsx
// web/src/ui/routine-card/routine-card.tsx
import type { WebRoutine } from "../../repositories/routine-repository.js";
import "./routine-card.css";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface RoutineCardProps {
  routine: WebRoutine;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (next: string) => void;
  editingDaysOfWeek: number[];                              // ← 追加 (G-4)
  onEditingDaysOfWeekChange: (next: number[]) => void;      // ← 追加 (G-4 / D-006)
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (e: React.FormEvent) => void;
  onDelete: () => void;
  as?: "li" | "div";
}

export function RoutineCard(props: RoutineCardProps): JSX.Element {
  const {
    routine,
    isEditing,
    editingName,
    onEditingNameChange,
    editingDaysOfWeek,
    onEditingDaysOfWeekChange,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
    as = "li",
  } = props;

  const Tag = as as "li";
  const className = `routine-card${isEditing ? " routine-card--editing" : ""}`;
  const editInputId = `routine-edit-${routine.id}`;

  if (isEditing) {
    return (
      <Tag className={className}>
        <form
          onSubmit={onSaveEdit}
          aria-label="ルーティン名称変更フォーム"
          className="routine-card__form-inline"
        >
          <label htmlFor={editInputId} className="visually-hidden">ルーティン名</label>
          <input
            id={editInputId}
            type="text"
            className="routine-card__input"
            value={editingName}
            placeholder="ルーティン名"
            onChange={(e) => onEditingNameChange(e.target.value)}
            required
          />
          <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
            {DAY_LABELS.map((label, day) => (
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
            ))}
          </div>
          <button type="submit">保存</button>
          <button type="button" onClick={onCancelEdit}>キャンセル</button>
        </form>
      </Tag>
    );
  }

  const daysLabel = routine.daysOfWeek.map((d) => DAY_LABELS[d]).join("・");

  return (
    <Tag className={className}>
      <div className="routine-card__main">
        <span className="routine-card__name">{routine.name}</span>
        <span className="routine-card__days-label">{daysLabel}</span>
      </div>
      <div className="routine-card__actions">
        <button type="button" className="routine-card__actions__edit" onClick={onStartEdit}>変更</button>
        <button type="button" className="routine-card__actions__delete" onClick={onDelete}>削除</button>
      </div>
    </Tag>
  );
}
```

- 編集モード DOM 順: `visually-hidden label → input → div.routine-card__day-checkboxes → 保存 → キャンセル` (D-005 / AC-11).
- toggle ロジックは `<RoutineCard>` 内で完結 (D-006). 親は `setEditingDaysOfWeek` をそのまま渡せる.
- 表示モードは無改修.

#### `routine-card.css` 変更 (REQ-7 / D-008)

撤去: `.routine-card__priority-row` / `.routine-card__select` の 2 セレクタ.

```css
/* 撤去 */
- .routine-card__priority-row { /* 空ルール */ }
- .routine-card__select { /* 空ルール */ }
```

他のセレクタは無改修. 既存 `.routine-card__day-checkboxes` (display: flex / flex-wrap: wrap / gap: var(--space-sm)) は `<RoutineCard>` 編集モードでも同じ visual で適用される.

#### `routines-view.tsx` 変更 (REQ-3 / REQ-4 / G-4 / G-5)

```tsx
// 抜粋. 差分のみ示す.

import type { Priority } from "@todica/domain/task";    // ← 追加

// state 追加
const [editingDaysOfWeek, setEditingDaysOfWeek] = useState<number[]>([]);

// 型変更
const [newDefaultPriority, setNewDefaultPriority] = useState<Priority>("normal");
// ↑ 旧: useState<string>("normal")

// updateMutation の mutationFn 引数型拡張
const updateMutation = useMutation({
  mutationFn: async (cmd: {
    id: string;
    ifMatch: number;
    name: string;
    daysOfWeek: number[];                                // ← 追加
  }) => {
    const idempotencyKey = generateId();
    void safeEnqueue({
      url: `${baseUrl}/api/v1/routines/${cmd.id}`,
      method: "PATCH",
      headers: { ... },
      body: JSON.stringify({ name: cmd.name, daysOfWeek: cmd.daysOfWeek }),  // ← daysOfWeek 追加
      idempotencyKey,
    });
    if (!navigator.onLine) return undefined;
    const result = await mapConflict(
      idempotencyKey,
      () => repository.update(cmd),    // ← cmd は { ..., daysOfWeek } を含む / UpdateRoutineCommand に互換 (BL-017)
      (err) => (err instanceof RoutineConflictError ? err.currentRoutine : undefined),
    );
    void safeDequeueByKey(idempotencyKey);
    return result;
  },
  // onSuccess / onError は無改修
});

// openEdit を拡張
const openEdit = useCallback((routine: WebRoutine) => {
  setEditingId(routine.id);
  setEditingName(routine.name);
  setEditingDaysOfWeek(routine.daysOfWeek);              // ← 追加
}, []);

// cancelEdit を拡張
const cancelEdit = useCallback(() => {
  setEditingId(null);
  setEditingName("");
  setEditingDaysOfWeek([]);                              // ← 追加
}, []);

// handleSaveEdit を拡張
const handleSaveEdit = useCallback(
  async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const routine = routines.find((r) => r.id === editingId);
    if (!routine) return;
    if (editingDaysOfWeek.length === 0) return;          // ← 追加 (REQ-3-2 / AC-8)
    await updateMutation.mutateAsync({
      id: editingId,
      ifMatch: routine.version,
      name: editingName,
      daysOfWeek: editingDaysOfWeek,                     // ← 追加
    });
    cancelEdit();
  },
  [editingId, editingName, editingDaysOfWeek, routines, updateMutation, cancelEdit],
);

// JSX <RoutineCard> 渡しに props 追加
<RoutineCard
  key={routine.id}
  routine={routine}
  isEditing={editingId === routine.id}
  editingName={editingName}
  onEditingNameChange={setEditingName}
  editingDaysOfWeek={editingDaysOfWeek}                  // ← 追加
  onEditingDaysOfWeekChange={setEditingDaysOfWeek}       // ← 追加
  onStartEdit={() => openEdit(routine)}
  onCancelEdit={cancelEdit}
  onSaveEdit={handleSaveEdit}
  onDelete={() => handleDelete(routine)}
/>

// JSX <RoutineFormCard> の prop 型は型変更のみで使い方は変えない
<RoutineFormCard
  name={newName}
  onNameChange={setNewName}
  daysOfWeek={newDaysOfWeek}
  onToggleDay={toggleDay}
  defaultPriority={newDefaultPriority}                   // ← Priority 型
  onDefaultPriorityChange={setNewDefaultPriority}        // ← Priority 型
  onSubmit={handleCreate}
/>

// createMutation は無改修 (defaultPriority: string をそのまま送る / D-012)
```

### 例外 / エラー処理

本 BL は presentation 層の構造再編 + state 追加のため, 新規例外経路は無い. 既存の `createMutation` / `updateMutation` / `deleteMutation` のエラーフロー (`RoutineConflictError` → `ConflictError` → `ConflictDialog` / `notifyError`) は無改修.

編集モードで曜日 0 件のとき `handleSaveEdit()` は何もせずに return する (REQ-3-2 / AC-8). user 通知 (toast / aria-live) は本 BL では追加しない (既存の作成フォーム `handleCreate` でも同様の silent return をしているため整合).

### 重要な決定 (plan 固有)

spec.md の D 章を参照. ここでは plan 固有の決定を追記する.

- **P-001 (RoutineFormCard 変更順序)**: (a) prop 型変更 (`defaultPriority` / `onDefaultPriorityChange` → `Priority`), (b) import 追加 (`PriorityStars` / `Priority`), (c) `<div className="routine-card__priority-row">` ラッパ撤去, (d) `<PriorityStars ... />` 追加, (e) `priorityId?` prop 撤去 + 受け取り箇所と default 値除去. 順序は (a) → (b) → (c) → (d) → (e) の流れで実装すると typescript エラーが小さく追跡できる.

- **P-002 (RoutineCard 編集モード DOM の追加)**:
  - `<RoutineCard>` の編集モード DOM への曜日 checkbox 群追加は, 既存 form 内 `<input>` の後 + `<button type="submit">` の前に挿入する.
  - `.routine-card__day-checkboxes` の既存 CSS (`display: flex / flex-wrap: wrap / gap`) で 7 個の checkbox が自動 wrap. name input が `flex: 1` で残り幅を占有しているため, 曜日 wrap で 2 段になる可能性がある (画面幅が狭いとき).
  - 視覚的に窮屈な場合の追加 CSS (例: `.routine-card__form-inline { flex-wrap: wrap }`) は本 BL では追加しない (D-008). 必要なら別 BL で対応.

- **P-003 (`routines-view.tsx` の state 追加)**:
  - `useState<number[]>([])` で `editingDaysOfWeek` を初期化. 初期値が `[]` でも編集モードに入る前は `<RoutineCard isEditing={false}>` のため 7 個 checkbox は render されない. `openEdit(routine)` で `setEditingDaysOfWeek(routine.daysOfWeek)` を呼ぶことで実際の編集時に正しい初期値が入る.
  - 不採用案: `useState<number[]>([1])` (BL-061 の `newDaysOfWeek` と同様の月曜デフォルト). 編集モードの初期値は `openEdit()` で必ず上書きされるため意味がない.

- **P-004 (新規テスト `web/__tests__/routine-card-edit-fields.test.tsx`)**:
  - CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-25 を網羅. BL-052 / 054 / 056 / 057 / 058 / 059 / 060 / 061 と同じ実装スタイル.
  - 構造:
    - (a) CSS 直読み: `extractRuleBody` ヘルパ. AC-12 (`.routine-card__priority-row` / `.routine-card__select` 撤去) / AC-13 (維持セレクタ存在).
    - (b) `<RoutineFormCard>` jsdom レンダ: AC-1 / AC-3 / AC-24.
    - (c) `<RoutineCard isEditing>` jsdom レンダ: AC-4 / AC-5 / AC-10 / AC-11.
    - (d) 型 / interface / state grep: `readFileSync` + 文字列 contains. AC-2 / AC-14 / AC-15 / AC-16 / AC-17 / AC-23.
    - (e) `<RoutinesView>` 結合レンダ: AC-6 / AC-7 / AC-8 / AC-9 / AC-25.
    - (f) 不変性 grep: AC-18 / AC-19.

- **P-005 (既存テスト追従)**:
  - **`web/__tests__/routine-card-component.test.tsx` (BL-061 / 100 件超想定)**:
    - **削除対象 assertion (約 10 件)**: `select#routine-priority` / `<label htmlFor="routine-priority">優先度</label>` / `.routine-card__priority-row` / `.routine-card__select` の存在 assert. これらを「不在 assert」に逆転する.
    - **追加対象 assertion (約 5 件)**: `<PriorityStars />` (= `div[role="radiogroup"]`) の存在 assert. `getByLabelText("優先度: 普通")` のような radiogroup aria-label 経由の取得 assert (BL-040 REQ-4 整合).
    - **interface assert 追従 (約 5 件)**: `RoutineCardProps` に `editingDaysOfWeek` / `onEditingDaysOfWeekChange` が追加されたことを文字列 grep で確認. `RoutineFormCardProps.defaultPriority` の型が `Priority` になったことを文字列 grep で確認. `priorityId?` prop が撤去されたことも確認.
    - **編集モード DOM assert 追従 (約 3 件)**: `<RoutineCard isEditing>` の DOM に `.routine-card__day-checkboxes` が含まれることを assert. 既存「編集モードは name input のみ」 assert があれば「name input + 曜日 + 保存 + キャンセル」 assert へ更新.
    - 既存 `getByLabel("月", { exact: true })` 系は無修正で通る (BL-061 NFR-DAY-LABEL-PRESERVE 整合).

  - **`docs/developer/features/routine-card-component/spec.md` (BL-061)**:
    - D-008-2 節 (line 781-782) に「**BL-068 (routine-card-edit-fields) で逆転**: 本決定は BL-068 で逆転し, `<PriorityStars />` 化と同時に「優先度」label 自体を撤去した. 詳細は `../routine-card-edit-fields/spec.md` REQ-6 / D-003 を参照」の注釈を追加. 仕様変更を「記録する」だけで本文は維持 (= history を残す).

  - **`e2e/routines.spec.ts`**:
    - L20-35 の作成フローで `page.getByLabel("優先度").selectOption("highest")` のような select 操作があれば → `page.getByRole("radio", { name: /^星 3/ }).click()` のような radiogroup 操作に変更. 現状 e2e/routines.spec.ts の作成フローは name + 曜日操作のみで優先度操作は無い可能性が高い (要確認 / R-003).
    - 詳細は実装時に grep で確認.

  - **新規 E2E (`e2e/routine-card-edit-fields.spec.ts`)**:
    - シナリオ (a): 「変更」ボタン押下後, 編集 form 内に 7 個の曜日 checkbox が表示される.
    - シナリオ (b): 月曜のみのルーティンを編集モードで月+火に変更 → 保存 → reload → 月+火が反映されていることを確認.
    - シナリオ (c): 名前のみ変更 (曜日操作なし) → 保存 → daysOfWeek は変更前の値で送信される (= reload 後も曜日が変わっていない).
    - シナリオ (d): 編集モードで全曜日を uncheck → 保存ボタン押下 → 編集モードのまま (= mutation が呼ばれない).

- **P-006 (PR 提出単位)**: 単一 PR で完結. BL-061 既存テスト追従と本 BL の新規テスト追加を同 PR で行う. 中間状態 (= 優先度だけ stars 化 / 曜日編集だけ追加) を作ると BL-061 既存テストが部分 red のまま残るリスクが高い (D-013 整合).

- **P-007 (idPrefix の選定 / "routine-create")**:
  - `<PriorityStars idPrefix="routine-create" />` を渡す. 既存 TaskFormCard では `idPrefix="create" | "tomorrow-create"` の 2 値で today/tomorrow を区別. RoutineFormCard では routines-view は 1 か所のため `"routine-create"` の 1 値で十分 (= 衝突可能性なし).
  - `<PriorityStars />` の `useId` fallback (BL-040) が動くため idPrefix 省略でも動作するが, 明示することで test 安定性 (radio button id が固定) を担保.

- **P-008 (DAY_LABELS の重複定義)**:
  - 現行 `<RoutineCard>` と `<RoutineFormCard>` の両方で DAY_LABELS を持っている (BL-061 P-011). 本 BL でも同様に維持 (= `<RoutineCard>` の編集モードで DAY_LABELS を map). 共通化は別 BL.

- **P-009 (TypeScript 型エラーの伝播)**:
  - `defaultPriority: string` → `Priority` の型変更により, routines-view.tsx の `useState<string>` を `useState<Priority>` に追従する必要がある (= REQ-3 / P-003).
  - `<RoutineFormCard ... defaultPriority={newDefaultPriority}>` の prop 受け渡しは型が一致すれば transparent.
  - `createMutation.mutateAsync({ ..., defaultPriority: newDefaultPriority })` の引数は `string` のままだが `Priority` は `string` の subtype なので互換 (D-012).

### 既存テスト / E2E の追従修正

#### `web/__tests__/routine-card-component.test.tsx`

- 旧 `<select id="routine-priority">` 存在 assert を「不在」へ逆転 + `<PriorityStars />` 存在 assert を追加.
- 旧 `<label htmlFor="routine-priority">優先度</label>` 存在 assert を「不在」へ逆転.
- `.routine-card__priority-row` / `.routine-card__select` の CSS 存在 assert を「不在」へ逆転.
- `RoutineCardProps` interface 文字列 grep に `editingDaysOfWeek` / `onEditingDaysOfWeekChange` 追加.
- `RoutineFormCardProps` interface 文字列 grep を `defaultPriority: Priority` へ追従. `priorityId?` の不在 grep を追加.
- `<RoutineCard isEditing>` の DOM assert に `.routine-card__day-checkboxes` + 7 個 checkbox 存在を追加.
- 詳細件数は実装時に grep で洗い出す (約 20 件想定).

#### `docs/developer/features/routine-card-component/spec.md`

- D-008-2 節 (line 781-782) に「BL-068 で逆転」の注釈 1 行追加. 詳細は P-005 / REQ-6.

#### `e2e/routines.spec.ts`

- 作成フォーム優先度操作の有無を grep で確認し, あれば `<PriorityStars />` 操作に追従. 無ければ無修正.

#### 新規 `e2e/routine-card-edit-fields.spec.ts`

- 4 シナリオ追加 (P-005).

#### `e2e/secondary-views-style.spec.ts`

- BL-061 で routines を AC-4 / AC-5 から除外済み. 無修正.

#### `e2e/a11y.spec.ts`

- `/routines` の WCAG 2.1 AA スキャンが violations 0 件を維持することを確認 (AC-22 / NFR-A11Y). 無修正.

#### `e2e/boundary-time.spec.ts` / `e2e/set-focus-gesture.spec.ts`

- API 直叩きで routine を作成しているのみで UI 操作なし. 無修正.

## リスク / 代替案

### リスク

- **R-001 (BL-061 既存テストの追従漏れ)**: `routine-card-component.test.tsx` で 20 件前後の追従修正が必要. 漏れがあると CI red. 緩和策: 実装時に `git grep "routine-priority"` / `git grep "priority-row"` / `git grep "RoutineCardProps"` / `git grep "RoutineFormCardProps"` で全件抽出. AC-20 で全件 green を確認.
- **R-002 (BL-061 spec への追記が本 BL のスコープ越境に見える)**: BL-061 spec は確定済みだが, D-008-2 の逆転は仕様の history として記録する価値が高い. 緩和策: 本文は維持し注釈 1 行のみ追加. AC-23 で確認.
- **R-003 (e2e/routines.spec.ts の優先度操作)**: 現状 routines.spec.ts の作成フローに優先度操作 (`selectOption` / `.click()` 等) があるかは未確認. 緩和策: 実装時に grep で確認し, あれば `<PriorityStars />` 経由に追従. 無ければ無修正.
- **R-004 (曜日選択 UI の視覚的窮屈さ)**: 編集モードで `.routine-card__form-inline` の 1 段 flex に「name input + 7 曜日 + 保存 + キャンセル」が並ぶと, 画面幅が狭いと wrap して name input が縮小される可能性. 緩和策: 既存 `flex-wrap` 設定は `.routine-card__day-checkboxes` のみで, form-inline 自体は wrap しない. 必要なら別 BL で `.routine-card__form-inline { flex-wrap: wrap }` を追加 (P-002).
- **R-005 (曜日 0 件 silent return の UX)**: 編集モードで曜日 0 件のまま「保存」を押しても何も起こらないと user は戸惑う可能性. 緩和策: 既存 `handleCreate` でも同様の silent return をしているため整合 (= 一貫した仕様). 必要なら別 BL でアラート / inline message 追加.
- **R-006 (`<PriorityStars />` の idPrefix 衝突)**: `<RoutineFormCard>` で `idPrefix="routine-create"` を指定. もし将来同じ routines-view 内で複数の `<PriorityStars />` を使うと衝突するが, 現状 1 か所だけなので無リスク.
- **R-007 (TypeScript 型変更による広範な型エラー)**: `defaultPriority: string` → `Priority` の変更は routines-view 側でも追従が必要. 緩和策: P-009 で順序を追跡. CI typecheck で全箇所を網羅できる.
- **R-008 (`updateMutation` mutationFn 引数型拡張による既存呼び出しの破損)**: 現状 `handleSaveEdit` 1 か所のみで `updateMutation.mutateAsync(...)` を呼んでいる. 引数に `daysOfWeek` 追加は 1 か所だけ. 緩和策: grep で 1 か所だけであることを確認.
- **R-009 (offline queue の dequeue 経路)**: offline-queue に PATCH body を enqueue する箇所 (`safeEnqueue`) でも `daysOfWeek` を含む JSON を送る必要がある. 漏れると offline 復帰時に daysOfWeek が送られない. 緩和策: REQ-4 で `body: JSON.stringify({ name, daysOfWeek })` に統一. AC-17 で grep 確認.
- **R-010 (UpdateRoutineCommand の optional 設計)**: `WebRoutineRepository.update()` の `UpdateRoutineCommand.daysOfWeek?` は optional. 本 BL では required として送る運用変更. 既存呼び出し (= 本 BL の `handleSaveEdit` 1 か所のみ) で必ず daysOfWeek を含めるため設計上の不整合は無い.

### 代替案

- **代替案 A (新規共通 component `<WeekdayCheckboxes>` を新設)**: DRY 化できるが本 BL のスコープを越える. 不採用 (D-001).
- **代替案 B (`<PriorityStars />` を `<RoutineCard>` 編集モードにも追加)**: user 要求は「優先度はタスクと統一」「編集モードで曜日変更」の 2 件のみ. 編集モードでの優先度変更は user 要求に含まれないため非ゴール (D-011). 必要なら別 BL.
- **代替案 C (`<RoutineFormCard>` の優先度 label を visually-hidden で残す)**: D-003 で却下. radiogroup aria-label が「優先度: ○○」を担うため label は冗長.
- **代替案 D (`<RoutineCard>` の編集モードを別 component `<RoutineEditCard>` に分離)**: BL-061 D-003 で「同 component 内で isEditing で分岐」を採用済み. 本 BL でも同方針を踏襲. 不採用.
- **代替案 E (曜日 0 件で「保存」を押すとアラート表示)**: UX 改善案だが既存 `handleCreate` との一貫性を優先して silent return (R-005). 別 BL.
- **代替案 F (`UpdateRoutineCommand.daysOfWeek` を required に変更)**: API 設計の変更. 本 BL のスコープ外. 既存 optional のまま activity tests を追加せず動作する.
- **代替案 G (`<RoutineFormCard>` の `priorityId?` prop を残す)**: API surface を小さく保つため撤去 (D-002). 残しても害は無いが unused prop は技術的負債.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト (`web/__tests__/routine-card-edit-fields.test.tsx`)

CSS 直読み + jsdom DOM レンダ + 結合レンダの 3 系統で AC-1 〜 AC-25 を網羅する. BL-052 / 054 / 056 / 057 / 058 / 059 / 060 / 061 と同じ実装スタイル.

#### (a) CSS 直読み系 assert

- AC-12: `routine-card.css` から `.routine-card__priority-row` / `.routine-card__select` が**撤去**されている.
- AC-13: `routine-card.css` の維持セレクタ (`.routine-card` / `__form` / `__editing` / `__main` / `__name` / `__days-label` / `__actions` / `__form-inline` / `__form-row` / `__day-checkboxes` / `__input` / `__input::placeholder` / `__submit` / `.visually-hidden`) が引き続き存在.

#### (b) `<RoutineFormCard>` jsdom レンダ系 assert

- AC-1: `<RoutineFormCard defaultPriority="normal" ... />` を render し radiogroup (PriorityStars) 存在 / `select#routine-priority` 不在 / `<label htmlFor="routine-priority">優先度</label>` 不在.
- AC-3: PriorityStars の星 click で `onDefaultPriorityChange` が "highest" / "later" 等の Priority 文字列で呼ばれる. 同値 click は no-op (BL-040 D-003).
- AC-24: `<PriorityStars />` 呼び出しに `groupLabel="優先度"` / `idPrefix="routine-create"` が含まれる (= readFileSync + 文字列 contains 系で grep).

#### (c) `<RoutineCard isEditing>` jsdom レンダ系 assert

- AC-4: 編集モードで `.routine-card__day-checkboxes` 存在 / 7 個 checkbox 存在 / 各曜日 label テキスト存在 / `editingDaysOfWeek={[1]}` で月曜のみ checked.
- AC-5: 曜日 checkbox click で `onEditingDaysOfWeekChange` が次の配列で呼ばれる (toggle ロジック).
- AC-10: cancelEdit で曜日 state がリセット (表示モード復帰).
- AC-11: 編集 form の DOM 順 (label → input → div.day-checkboxes → 保存 → キャンセル).

#### (d) 型 / interface / state grep 系 assert (readFileSync 方式)

- AC-2: `routine-form-card.tsx` の `RoutineFormCardProps.defaultPriority: Priority` + `import type { Priority }`.
- AC-14: `routine-card.tsx` の `RoutineCardProps` に `editingDaysOfWeek` / `onEditingDaysOfWeekChange` 追加.
- AC-15: `routines-view.tsx` に state / openEdit / cancelEdit / handleSaveEdit / updateMutation の追従 + `<RoutineCard>` props 渡し.
- AC-16: `routines-view.tsx` に `useState<Priority>("normal")` + `import type { Priority }`.
- AC-17: `routines-view.tsx` の `updateMutation` mutationFn 引数型に `daysOfWeek: number[]` 含む.
- AC-23: `docs/developer/features/routine-card-component/spec.md` D-008-2 節に「BL-068 で逆転」の言及あり.

#### (e) 結合レンダ (`<RoutinesView>` + MSW or stub) 系 assert

- AC-6: 編集 → 曜日変更 → 保存 で updateMutation.mutateAsync が { ..., daysOfWeek: [1,2] } で呼ばれる.
- AC-7: 編集 → 名前のみ変更 → 保存 で updateMutation.mutateAsync が { ..., daysOfWeek: [変更前の値] } で呼ばれる.
- AC-8: 編集 → 全曜日 uncheck → 保存 で updateMutation.mutateAsync が呼ばれない.
- AC-9: 「変更」click で editingDaysOfWeek が routine.daysOfWeek で初期化される (= checkbox の checked 状態が反映).
- AC-25: 既存 form aria-label / 曜日 label / name input placeholder + visually-hidden label の維持を全部 jsdom で確認.

#### (f) 不変性 assert (readFileSync 方式)

- AC-18: `web/src/styles/tokens.css` の差分が無い (前後比較は git diff やコミット時の grep で代替. テストでは「`--color-bg` / `--color-fg-subtle` / `--font-size-small` / `--space-md` / `--space-sm` / `--space-xs` / `--radius-lg` / `--color-border` が定義されている」の grep で代替可).
- AC-19: `web/src/repositories/routine-repository.ts` の export シンボル (`WebRoutineRepository` / `UpdateRoutineCommand` / `RoutineConflictError`) が存在. `priority-stars.tsx` / `priority-stars.css` の差分なし.

### 既存テストへの追従

- `web/__tests__/routine-card-component.test.tsx` (BL-061): 上述. 約 20 件の追従修正.
- `web/__tests__/design-tokens.test.ts`: 無修正 (BL-061 整合).
- `e2e/routines.spec.ts`: 優先度操作の有無を grep 確認後追従.
- `e2e/secondary-views-style.spec.ts`: 無修正 (BL-061 で routines 除外済み).
- `e2e/a11y.spec.ts`: 無修正 (NFR-A11Y / AC-22).
- 新規 E2E `e2e/routine-card-edit-fields.spec.ts`: 4 シナリオ追加.

### 重点的に確認すること

- `<PriorityStars />` 化で a11y violations が 0 件のまま (BL-040 と同じ radiogroup 仕様で WCAG 2.1 AA を担保 / NFR-A11Y / AC-22).
- 編集モードで曜日 7 個と name input + 保存 + キャンセルが同 row に並んだときの視覚 (R-004 緩和).
- 既存 BL-061 テストの追従漏れがないこと (R-001 緩和).
- BL-061 spec の D-008-2 への注釈追記が記録される (R-002 / REQ-6 / AC-23).
- offline-queue の PATCH body に `daysOfWeek` が含まれること (R-009 緩和).
- 編集モードで曜日 0 件のとき silent return することの一貫性 (R-005 緩和).
