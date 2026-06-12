# 設計・実装計画: ルーティン編集モードでの優先度変更 (routine-card-edit-priority)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

BL-068 で導入された `<RoutineCard>` の編集モード DOM + `routines-view.tsx` の `editingDaysOfWeek` state + `updateMutation` の引数型拡張パターンを, そのまま `editingDefaultPriority` に対しても適用する. presentation 層 + view の state 拡張のみで完結し, `<PriorityStars />` (BL-040) を再利用するため新規 component / 新規 CSS / tokens.css の追加なし (NFR-NO-NEW-COMPONENTS / NFR-NO-NEW-CSS-RULES / NFR-NO-NEW-TOKENS).

`WebRoutineRepository.update()` の `UpdateRoutineCommand.defaultPriority?: string` は BL-017 で既に対応済み (routine-repository.ts L30) のため repository / mutation 経路 / domain / server の改修不要 (NFR-COMPAT / G-9).

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (NFR-COMPAT) |
| DB | 変更なし |
| domain | 変更なし |
| サーバ (`server/`) | 変更なし |
| Repository (`web/src/repositories/routine-repository.ts`) | 変更なし (NFR-COMPAT / BL-017 で `UpdateRoutineCommand.defaultPriority?: string` は対応済み) |
| `<PriorityStars />` (`web/src/ui/priority-stars/`) | 変更なし (NFR-PRIORITY-STARS-COMPAT / BL-040) |
| `<RoutineFormCard>` (`web/src/ui/routine-card/routine-form-card.tsx`) | 変更なし (BL-068 で `<PriorityStars idPrefix="routine-create">` 化済み / REQ-8) |
| トークン (`web/src/styles/tokens.css`) | **変更なし** (NFR-NO-NEW-TOKENS / G-10) |
| CSS (`web/src/ui/routine-card/routine-card.css`) | **変更なし** (NFR-NO-NEW-CSS-RULES / G-11 / REQ-6 / D-007) |
| 編集 (`web/src/ui/routine-card/routine-card.tsx`) | `isEditing=true` ブランチの form DOM に `<PriorityStars value={editingDefaultPriority} onChange={onEditingDefaultPriorityChange} groupLabel="優先度" idPrefix="routine-edit" />` を挿入 (曜日 div の直後 / 保存 button の直前 / D-001). `RoutineCardProps` に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void` を追加. import 追加 (PriorityStars / Priority). 詳細は P-001 (REQ-1 / REQ-2 / D-001 / D-002) |
| 編集 (`web/src/ui/routines-view/routines-view.tsx`) | state 追加 (`editingDefaultPriority`), `openEdit()` / `cancelEdit()` / `handleSaveEdit()` 追従, `updateMutation` の mutationFn 引数型に `defaultPriority: Priority` 追加 (body / `repository.update(cmd)` 経路も追従). `<RoutineCard>` に props 渡しを追加. 詳細は P-002 (REQ-3 / REQ-4 / D-003 / D-004 / D-005 / D-006) |
| 新規 単体テスト (`web/__tests__/routine-card-edit-priority.test.tsx`) | jsdom DOM レンダ + 結合レンダ + 型 grep + 不変性 assert の 4 系統で AC-1 〜 AC-23 を網羅. 詳細は P-003 (D-008) |
| 既存単体テスト追従 (`web/__tests__/routine-card-edit-fields.test.tsx`) | (a) `RoutineCardProps` interface 文字列 grep (AC-14 系) に `editingDefaultPriority` / `onEditingDefaultPriorityChange` を追加. (b) AC-11 DOM 順 assert を `label → input → div.day-checkboxes → 保存 → キャンセル` → `label → input → div.day-checkboxes → div[role="radiogroup"] → 保存 → キャンセル` に追従. (c) AC-17 結合 `updateMutation` 引数 assert に `defaultPriority` を追加 (BL-068 AC-6 / AC-7 系). 詳細は P-004 (R-001 / R-002) |
| 既存単体テスト追従 (`web/__tests__/routine-card-component.test.tsx`) | `RoutineCardProps` interface 文字列 grep + `<RoutineCard isEditing>` の編集モード DOM 系 assert に `<PriorityStars />` (= `div[role="radiogroup"]`) 存在を追加. 詳細は P-004 |
| 既存 spec 追従 (`docs/developer/features/routine-card-edit-fields/spec.md`) | D-011 節に「本 BL (BL-069 / routine-card-edit-priority) で逆転」の注釈 1 行を追加 (REQ-5 / AC-19) |
| E2E (`e2e/routines.spec.ts`) | grep で優先度操作の有無を確認後, 修正不要なら無修正 (BL-068 でも同じ確認方針 / R-003) |
| E2E (`e2e/routine-card-edit-fields.spec.ts`) | 既存編集フローシナリオに対する影響を確認. 新たな PriorityStars 操作はないため無修正で通る想定. 必要なら初期値 assert (= editingDefaultPriority が routine.defaultPriority で初期化) を追加 |
| 新規 E2E (`e2e/routine-card-edit-priority.spec.ts`) | (a) 編集モードで PriorityStars が表示される, (b) 優先度変更 → 保存 → reload → 反映されている, (c) 名前のみ変更 → defaultPriority は変更前の値で送信, (d) id 衝突 0 件 の 4 シナリオを新規追加 (D-009 / R-003) |
| E2E (`e2e/secondary-views-style.spec.ts`) | 無修正 (BL-061 で routines を AC-4 / AC-5 から除外済み) |
| E2E (`e2e/a11y.spec.ts`) | 無修正. 既存スキャンが violations 0 件のまま通る想定 (NFR-A11Y / AC-20) |

## 設計詳細

### データモデル

変更なし. 本 BL は presentation 層 + view の state 拡張のみ.

### 処理フロー (DOM 構造 + コンポーネント API)

#### `<RoutineCard>` API 変更後 (REQ-1 / REQ-2 / G-1 / G-2)

```tsx
// web/src/ui/routine-card/routine-card.tsx
import type { Priority } from "@todica/domain/task";          // ← 追加 (BL-069)
import { PriorityStars } from "../priority-stars/priority-stars.js";  // ← 追加 (BL-069)
import type { WebRoutine } from "../../repositories/routine-repository.js";
import "./routine-card.css";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface RoutineCardProps {
  routine: WebRoutine;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (next: string) => void;
  editingDaysOfWeek: number[];                                  // BL-068
  onEditingDaysOfWeekChange: (next: number[]) => void;          // BL-068
  /** 編集モードの defaultPriority (親が state を持つ) (BL-069 G-2). */
  editingDefaultPriority: Priority;                             // ← 追加
  /** 編集モードの優先度変更ハンドラ (BL-069 G-2 / D-006). */
  onEditingDefaultPriorityChange: (next: Priority) => void;     // ← 追加
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
    editingDefaultPriority,                                     // ← 追加
    onEditingDefaultPriorityChange,                             // ← 追加
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
        <form onSubmit={onSaveEdit} aria-label="ルーティン名称変更フォーム" className="routine-card__form-inline">
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
          <PriorityStars                                          {/* ← 追加 (BL-069 / REQ-1 / D-002) */}
            value={editingDefaultPriority}
            onChange={onEditingDefaultPriorityChange}
            groupLabel="優先度"
            idPrefix="routine-edit"
          />
          <button type="submit">保存</button>
          <button type="button" onClick={onCancelEdit}>キャンセル</button>
        </form>
      </Tag>
    );
  }

  // 表示モードは無改修.
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

- 編集モード DOM 順 (D-001 / AC-6): `visually-hidden label → input → div.routine-card__day-checkboxes → div[role="radiogroup"] (PriorityStars) → 保存 → キャンセル`.
- 表示モードは無改修.
- `idPrefix="routine-edit"` で起票側 `idPrefix="routine-create"` (BL-068) と区別 (D-002 / AC-21 / NFR-IDPREFIX-DISJOINT).

#### `routines-view.tsx` 変更後 (REQ-3 / REQ-4 / G-3 / G-4)

```tsx
// 抜粋 (差分のみ).

// state 追加 (D-004)
const [editingDefaultPriority, setEditingDefaultPriority] = useState<Priority>("normal");

// updateMutation の mutationFn 引数型拡張 (REQ-4)
const updateMutation = useMutation({
  mutationFn: async (cmd: {
    id: string;
    ifMatch: number;
    name: string;
    daysOfWeek: number[];
    defaultPriority: Priority;                                  // ← 追加
  }) => {
    const idempotencyKey = generateId();
    void safeEnqueue({
      url: `${baseUrl}/api/v1/routines/${cmd.id}`,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "Idempotency-Key": idempotencyKey,
        "If-Match": String(cmd.ifMatch),
      },
      body: JSON.stringify({
        name: cmd.name,
        daysOfWeek: cmd.daysOfWeek,
        defaultPriority: cmd.defaultPriority,                   // ← 追加
      }),
      idempotencyKey,
    });
    if (!navigator.onLine) return undefined;
    const result = await mapConflict(
      idempotencyKey,
      () => repository.update(cmd),                             // ← cmd は UpdateRoutineCommand に互換 (BL-017)
      (err) => (err instanceof RoutineConflictError ? err.currentRoutine : undefined),
    );
    void safeDequeueByKey(idempotencyKey);
    return result;
  },
  // onSuccess / onError は無改修.
});

// openEdit を拡張 (D-003)
const openEdit = useCallback((routine: WebRoutine) => {
  setEditingId(routine.id);
  setEditingName(routine.name);
  setEditingDaysOfWeek(routine.daysOfWeek);
  setEditingDefaultPriority(routine.defaultPriority);           // ← 追加
}, []);

// cancelEdit を拡張 (D-005)
const cancelEdit = useCallback(() => {
  setEditingId(null);
  setEditingName("");
  setEditingDaysOfWeek([]);
  setEditingDefaultPriority("normal");                          // ← 追加 (初期値と同じ / D-005)
}, []);

// handleSaveEdit を拡張
const handleSaveEdit = useCallback(
  async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const routine = routines.find((r) => r.id === editingId);
    if (!routine) return;
    if (editingDaysOfWeek.length === 0) return;                 // BL-068 維持
    await updateMutation.mutateAsync({
      id: editingId,
      ifMatch: routine.version,
      name: editingName,
      daysOfWeek: editingDaysOfWeek,
      defaultPriority: editingDefaultPriority,                  // ← 追加
    });
    cancelEdit();
  },
  [editingId, editingName, editingDaysOfWeek, editingDefaultPriority, routines, updateMutation, cancelEdit],
);

// JSX <RoutineCard> 渡しに props 追加
<RoutineCard
  key={routine.id}
  routine={routine}
  isEditing={editingId === routine.id}
  editingName={editingName}
  onEditingNameChange={setEditingName}
  editingDaysOfWeek={editingDaysOfWeek}
  onEditingDaysOfWeekChange={setEditingDaysOfWeek}
  editingDefaultPriority={editingDefaultPriority}               // ← 追加
  onEditingDefaultPriorityChange={setEditingDefaultPriority}    // ← 追加
  onStartEdit={() => openEdit(routine)}
  onCancelEdit={cancelEdit}
  onSaveEdit={handleSaveEdit}
  onDelete={() => handleDelete(routine)}
/>
```

### 例外 / エラー処理

本 BL は presentation 層の構造再編 + state 追加のため新規例外経路は無い. 既存の `createMutation` / `updateMutation` / `deleteMutation` のエラーフロー (`RoutineConflictError` → `ConflictError` → `ConflictDialog` / `notifyError`) は無改修.

`editingDefaultPriority` は `Priority` 型 (= "highest" | "normal" | "later") のため undefined / null になるケースは無い. 初期値 `"normal"` (D-004) で型安全に初期化される.

### 重要な決定 (plan 固有)

spec.md の D 章を参照. ここでは plan 固有の決定を追記する.

- **P-001 (`RoutineCard` 変更順序)**:
  - (a) interface に `editingDefaultPriority` / `onEditingDefaultPriorityChange` を追加.
  - (b) import 追加 (`PriorityStars` / `Priority`).
  - (c) 関数本体の destructuring に追加.
  - (d) JSX 内, 編集モードの曜日 div の直後に `<PriorityStars ... />` を挿入.
  - 順序は (a) → (b) → (c) → (d) で typescript エラーが小さく追跡できる.

- **P-002 (`routines-view.tsx` 変更順序)**:
  - (a) `useState<Priority>("normal")` で `editingDefaultPriority` / `setEditingDefaultPriority` を新設.
  - (b) `updateMutation` の mutationFn 引数型に `defaultPriority: Priority` を追加.
  - (c) `body: JSON.stringify({ ... })` に `defaultPriority: cmd.defaultPriority` を追加.
  - (d) `openEdit(routine)` に `setEditingDefaultPriority(routine.defaultPriority);` を追加.
  - (e) `cancelEdit()` に `setEditingDefaultPriority("normal");` を追加.
  - (f) `handleSaveEdit()` の `updateMutation.mutateAsync({ ... })` 呼び出しに `defaultPriority: editingDefaultPriority` を追加.
  - (g) `handleSaveEdit` の `useCallback` deps 配列に `editingDefaultPriority` を追加.
  - (h) JSX `<RoutineCard ... />` に `editingDefaultPriority={editingDefaultPriority}` / `onEditingDefaultPriorityChange={setEditingDefaultPriority}` を追加.

- **P-003 (新規テスト `web/__tests__/routine-card-edit-priority.test.tsx`)**:
  - BL-068 の `routine-card-edit-fields.test.tsx` と同じ実装スタイル.
  - 構造:
    - (a) `<RoutineCard isEditing>` jsdom レンダ: AC-1 / AC-2 / AC-3 / AC-5 / AC-6 / AC-11.
    - (b) 結合 (`<RoutinesView>` + stub) jsdom レンダ: AC-4 / AC-7 / AC-8 / AC-9 / AC-21 / AC-22 / AC-23.
    - (c) 型 / interface / state grep (readFileSync + 文字列 contains): AC-10 / AC-12 / AC-13 / AC-19.
    - (d) 不変性 assert (readFileSync 方式): AC-14 (`routine-card.css` 差分なし) / AC-15 (`tokens.css` 差分なし) / AC-16 (`routine-repository.ts` / `priority-stars.{tsx,css}` 差分なし).

- **P-004 (既存テスト追従)**:
  - **`web/__tests__/routine-card-edit-fields.test.tsx` (BL-068)**:
    - **追加対象 assertion (約 5 件)**:
      - `RoutineCardProps` interface 文字列 grep (BL-068 AC-14) に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void` を追加.
      - `<RoutineCard isEditing>` の DOM 順 assert (BL-068 AC-11) を `label → input → div.day-checkboxes → div[role="radiogroup"] → 保存 → キャンセル` に追従.
      - 結合 (`<RoutinesView>`) フローの `updateMutation` 引数型 assert (BL-068 AC-6 / AC-7) に `defaultPriority: <値>` を追加.
    - **既存 assertion の維持**: BL-068 AC-4 / AC-5 / AC-8 / AC-9 / AC-10 / AC-12 / AC-13 / AC-15 / AC-16 / AC-18 / AC-19 / AC-20 / AC-21 / AC-22 / AC-25 系の assertion は変更なし.
    - 詳細件数は実装時に grep で確定 (5 件前後想定).
  - **`web/__tests__/routine-card-component.test.tsx` (BL-061)**:
    - **追加対象 assertion (約 3 件)**:
      - `RoutineCardProps` interface 文字列 grep に `editingDefaultPriority` / `onEditingDefaultPriorityChange` を追加.
      - `<RoutineCard isEditing>` の DOM assert に `<PriorityStars />` (= `div[role="radiogroup"]`) の存在 assert を追加.
    - 既存「BL-061 NFR-DAY-LABEL-PRESERVE / 編集フォーム aria-label / DAY_LABELS」系 assertion は無修正で通る.
  - **`docs/developer/features/routine-card-edit-fields/spec.md` (BL-068)**:
    - D-011 節 (= 「`<RoutineCard>` 編集モードでの defaultPriority 編集 / 非ゴール」) の末尾に「**BL-069 (routine-card-edit-priority) で逆転**: 本決定は BL-069 で逆転し, 編集モードに `<PriorityStars editingDefaultPriority />` を追加した. 詳細は `../routine-card-edit-priority/spec.md` REQ-1 / D-001 を参照」の注釈を追加.

- **P-005 (新規 E2E `e2e/routine-card-edit-priority.spec.ts`)**:
  - シナリオ:
    - (a) 編集モード遷移後, 編集 form 内に `<PriorityStars />` (= radiogroup) が表示される. radiogroup の現在値が routine.defaultPriority と一致する.
    - (b) 月曜 + normal のルーティンを編集モードで優先度を highest に変更 → 保存 → reload → 再度編集モードで PriorityStars の現在値が highest になっている.
    - (c) 名前のみ変更 (優先度操作なし) → 保存 → reload → defaultPriority は変更前の値が維持されている.
    - (d) 起票カード PriorityStars の radio button id が `routine-create-...` prefix, 編集カード PriorityStars の id が `routine-edit-...` prefix で衝突しない (`document.querySelectorAll` で id 集合の重複 0 件を assert).
  - BL-068 `e2e/routine-card-edit-fields.spec.ts` と同じ実装スタイル.

- **P-006 (PR 提出単位 / 単一 PR)**:
  - 単一 PR で完結. BL-068 既存テスト追従と本 BL の新規テスト追加を同 PR で行う (D-011).

- **P-007 (`idPrefix` の選定 / `"routine-edit"`)**:
  - 静的な `"routine-edit"` で十分 (= 同時編集対象は editingId 1 件のみ).
  - 起票側 `"routine-create"` (BL-068) と衝突しない静的な命名で AC-21 (NFR-IDPREFIX-DISJOINT) を担保.

- **P-008 (型 narrowing の追跡)**:
  - `routine.defaultPriority` は `WebRoutine` interface で `"highest" | "normal" | "later"` (= `Priority` 型 と等価) のため `setEditingDefaultPriority(routine.defaultPriority)` は型エラーなく通る (routine-repository.ts L12).
  - `editingDefaultPriority` を `repository.update(cmd)` の引数として渡すとき, `UpdateRoutineCommand.defaultPriority?: string` (L30) に対し `Priority` (= `"highest" | "normal" | "later"`) は `string` の subtype のため透過に通る (D-010 整合).

- **P-009 (`useCallback` deps 配列の更新漏れリスク)**:
  - `handleSaveEdit` の deps 配列に `editingDefaultPriority` を追加し忘れると, BL-068 で曜日に対して起きた lint warning と同じ症状になる. P-002 (g) で明示的に追加.

### 既存テスト / E2E の追従修正

#### `web/__tests__/routine-card-edit-fields.test.tsx`

- `RoutineCardProps` interface 文字列 grep に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void` を追加 (3 件).
- AC-11 DOM 順 assert を `label → input → div.day-checkboxes → 保存 → キャンセル` → `label → input → div.day-checkboxes → div[role="radiogroup"] → 保存 → キャンセル` に追従 (1 件).
- AC-6 / AC-7 結合 `updateMutation` 引数 assert に `defaultPriority` を追加 (2 件).
- 約 5 件前後の追従.

#### `web/__tests__/routine-card-component.test.tsx`

- `RoutineCardProps` interface 文字列 grep に `editingDefaultPriority` 系を追加 (2 件).
- `<RoutineCard isEditing>` の DOM assert に `<PriorityStars />` (radiogroup) 存在を追加 (1 件).
- 約 3 件前後の追従.

#### `docs/developer/features/routine-card-edit-fields/spec.md`

- D-011 節に「BL-069 で逆転」の注釈 1 行追加 (P-004).

#### `e2e/routines.spec.ts`

- 既存編集フローシナリオは name のみで優先度操作なし想定. grep で確認後, 修正不要なら無修正 (R-003).

#### `e2e/routine-card-edit-fields.spec.ts` (BL-068)

- 既存シナリオ (a) (b) (c) (d) は無修正で通る想定. 念のため初期値 assert (= 編集モード遷移後に editingDefaultPriority が routine.defaultPriority で初期化される) を追加することも検討 (任意).

#### 新規 `e2e/routine-card-edit-priority.spec.ts`

- 4 シナリオ追加 (P-005 / D-009).

#### `e2e/secondary-views-style.spec.ts` / `e2e/a11y.spec.ts`

- BL-061 で routines を AC-4 / AC-5 から除外済み. a11y は violations 0 件のまま. 無修正.

#### `e2e/boundary-time.spec.ts` / `e2e/set-focus-gesture.spec.ts`

- API 直叩きで routine を作成しているのみで UI 操作なし. 無修正.

## リスク / 代替案

### リスク

- **R-001 (BL-068 既存テスト追従漏れ)**: `routine-card-edit-fields.test.tsx` で 5 件前後の追従修正が必要. 漏れがあると CI red. 緩和策: 実装時に `git grep "editingDaysOfWeek"` で全件抽出し, 同じ位置に `editingDefaultPriority` 系を追加. AC-17 で全件 green を確認.
- **R-002 (BL-068 spec への追記が本 BL のスコープ越境に見える)**: BL-068 spec は確定済みだが, D-011 の逆転は仕様の history として記録する価値が高い. 緩和策: 本文は維持し注釈 1 行のみ追加 (P-004). AC-19 で確認.
- **R-003 (e2e/routines.spec.ts の優先度操作)**: 現状 routines.spec.ts の作成 / 編集フローに優先度操作 (`selectOption` / `.click()` 等) があるかは未確認. 緩和策: 実装時に grep で確認し, 編集の優先度操作があれば `<PriorityStars />` 経由に追従.
- **R-004 (PriorityStars の視覚的窮屈さ)**: 編集モード form 内に「name input + 7 曜日 + PriorityStars (3 個 button) + 保存 + キャンセル」が同 row flex に並ぶと, 狭い画面で wrap が頻発する可能性. 緩和策: 既存 `flex-wrap` は `.routine-card__day-checkboxes` のみで, form-inline 自体は wrap しない. 必要なら別 BL で対応 (D-007).
- **R-005 (`cancelEdit` で `"normal"` リセットが routine.defaultPriority と乖離)**: cancelEdit 時点で routine.defaultPriority が `"later"` だった場合, `editingDefaultPriority` は `"normal"` にリセットされる. ただし表示モードでは editingDefaultPriority は使われない (= 編集モード遷移時に必ず routine.defaultPriority で初期化される) ため UX 上の問題は無い (D-005).
- **R-006 (`<PriorityStars />` の idPrefix 衝突)**: 編集モード遷移時, 起票カード `idPrefix="routine-create"` (BL-068) と編集カード `idPrefix="routine-edit"` が同時に DOM に存在する. 両方とも radio button の id 命名は内部で異なる prefix を使うため衝突しない (D-002 / AC-21). 緩和策: AC-21 で id 集合の重複を assert.
- **R-007 (`UpdateRoutineCommand.defaultPriority?` の optional から required 運用への変更)**: BL-017 では `defaultPriority?: string` (= undefined で patch しない動作). 本 BL では必ず送る運用に変更. 既存呼び出し (= `handleSaveEdit` 1 か所のみ) で必ず含めるため設計上の不整合は無い (D-010).
- **R-008 (offline-queue の dequeue 経路)**: offline-queue に PATCH body を enqueue する箇所 (`safeEnqueue`) でも `defaultPriority` を含む JSON を送る必要がある. 漏れると offline 復帰時に defaultPriority が送られない. 緩和策: REQ-4 で `body: JSON.stringify({ name, daysOfWeek, defaultPriority })` に統一. AC-13 で grep 確認.
- **R-009 (TypeScript 型エラーの伝播)**: `editingDefaultPriority: Priority` 追加により, routine-card.tsx / routines-view.tsx の両方で型が必要. 緩和策: P-001 / P-002 で順序を追跡. CI typecheck で全箇所を網羅.

### 代替案

- **代替案 A (編集モードに `<select>` を採用)**: BL-068 で `<PriorityStars />` 統一を確定しているため不採用.
- **代替案 B (`<PriorityStars />` を編集モードと起票モードで同じ component 化 / `<RoutinePriorityStars>` 等)**: 共通化のメリットが薄い (どちらも `<PriorityStars />` を直接呼ぶだけ). 不採用.
- **代替案 C (`editingDefaultPriority` を `<RoutineCard>` 内部 state にする)**: D-003 で却下. 親に持つ.
- **代替案 D (cancelEdit で routine.defaultPriority に戻す)**: D-005 で却下. `"normal"` にリセット.
- **代替案 E (idPrefix を `routine-edit-${routine.id}` で動的にする)**: D-002 で却下. 静的な `"routine-edit"` で衝突は起きない.
- **代替案 F (`UpdateRoutineCommand.defaultPriority?` を required に変更)**: API surface 変更. 本 BL のスコープ外. 既存 optional のままで動作する.
- **代替案 G (本 BL のスコープを「表示モードに優先度可視化」も含める)**: D-012 で却下. 別 BL に分離.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト (`web/__tests__/routine-card-edit-priority.test.tsx`)

jsdom DOM レンダ + 結合レンダ + 型 grep + 不変性 assert の 4 系統で AC-1 〜 AC-23 を網羅する.

#### (a) `<RoutineCard isEditing>` jsdom レンダ系 assert

- AC-1: 編集 form に `<PriorityStars />` (= `div[role="radiogroup"]`) が render される. `<select>` 系は存在しない.
- AC-2: `editingDefaultPriority="highest"` で render すると radiogroup の aria-label が「優先度: 最優先」または等価.
- AC-3: 「最優先」 radio click → mock が "highest" で呼ばれる. 「後回し」 radio click → mock が "later" で呼ばれる.
- AC-5: cancelEdit 後の編集モード退出を再現. 表示モードでは PriorityStars は描画されない.
- AC-6: 編集 form の DOM 順 (label → input → div.day-checkboxes → div[role="radiogroup"] → 保存 → キャンセル).
- AC-11: `routine-card.tsx` ファイル内の `<PriorityStars />` 呼び出しに `groupLabel="優先度"` / `idPrefix="routine-edit"` が含まれることを readFileSync で grep.

#### (b) 結合 (`<RoutinesView>` + stub) jsdom レンダ系 assert

- AC-4: 編集 → 優先度 highest 変更 → 保存で updateMutation.mutateAsync が `{ ..., defaultPriority: "highest" }` で呼ばれる.
- AC-7: 名前のみ変更 → 保存で updateMutation.mutateAsync が `{ ..., defaultPriority: <変更前の値> }` で呼ばれる.
- AC-8: 曜日 0 件で「保存」を押しても updateMutation.mutateAsync が呼ばれない (BL-068 維持).
- AC-9: 「変更」 click で editingDefaultPriority が routine.defaultPriority で初期化される.
- AC-21: 編集モード遷移時に DOM 上に `routine-create-...` prefix と `routine-edit-...` prefix の radio button が共存し id が衝突しない.
- AC-22: name / 曜日 / 優先度の 3 フィールドすべての変更が PATCH に乗る.
- AC-23: BL-068 NFR-FORM-ARIA-LABEL-PRESERVE / NFR-DAY-LABEL-PRESERVE / NFR-NAME-INPUT-PRESERVE が維持されている.

#### (c) 型 / interface / state grep 系 assert (readFileSync 方式)

- AC-10: `routine-card.tsx` の `RoutineCardProps` に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void` が追加されている. `import type { Priority }` を含む.
- AC-12: `routines-view.tsx` に `useState<Priority>("normal")` で `editingDefaultPriority` 宣言 / `openEdit` 内 `setEditingDefaultPriority(routine.defaultPriority)` / `cancelEdit` 内 `setEditingDefaultPriority("normal")` / `handleSaveEdit` 内 `defaultPriority: editingDefaultPriority` / `<RoutineCard ... editingDefaultPriority={...} onEditingDefaultPriorityChange={...} ... />` が含まれる.
- AC-13: `routines-view.tsx` の `updateMutation` mutationFn 引数型に `defaultPriority: Priority` を含む. body の JSON.stringify に `defaultPriority` が含まれる.
- AC-19: `docs/developer/features/routine-card-edit-fields/spec.md` D-011 節に「BL-069 で逆転」言及あり.

#### (d) 不変性 assert (readFileSync 方式)

- AC-14: `web/src/ui/routine-card/routine-card.css` の差分が無い (= 主要セレクタ / 主要宣言が grep でヒットする + 新規セレクタが無いことを assert).
- AC-15: `web/src/styles/tokens.css` の差分が無い (BL-068 と同じ grep ベース不変性 assert).
- AC-16: `web/src/repositories/routine-repository.ts` の export シンボル (`WebRoutineRepository` / `UpdateRoutineCommand` / `RoutineConflictError`) が存在. `priority-stars.tsx` / `priority-stars.css` の差分なし.

### 既存テストへの追従

- `web/__tests__/routine-card-edit-fields.test.tsx` (BL-068): 上述 (5 件前後).
- `web/__tests__/routine-card-component.test.tsx` (BL-061): 上述 (3 件前後).
- `web/__tests__/design-tokens.test.ts`: 無修正 (BL-061 / BL-068 整合).
- `e2e/routines.spec.ts`: grep 確認後追従.
- `e2e/routine-card-edit-fields.spec.ts`: 既存シナリオは無修正で通る想定. 必要なら初期値 assert を追加.
- `e2e/secondary-views-style.spec.ts`: 無修正.
- `e2e/a11y.spec.ts`: 無修正 (NFR-A11Y / AC-20).
- 新規 E2E `e2e/routine-card-edit-priority.spec.ts`: 4 シナリオ追加 (P-005).

### 重点的に確認すること

- `<PriorityStars />` 化で a11y violations 0 件のまま (BL-040 / BL-068 整合 / NFR-A11Y / AC-20).
- 編集モードで起票カード `idPrefix="routine-create"` と編集カード `idPrefix="routine-edit"` が同時 DOM に存在しても id 衝突 0 件 (AC-21 / NFR-IDPREFIX-DISJOINT).
- BL-068 既存テストの追従漏れがないこと (R-001 緩和).
- BL-068 spec D-011 への注釈追記が記録される (R-002 / REQ-5 / AC-19).
- offline-queue の PATCH body に `defaultPriority` が含まれること (R-008 緩和 / AC-13).
- name / 曜日 / 優先度の 3 フィールドすべてが PATCH に乗ること (AC-22).
