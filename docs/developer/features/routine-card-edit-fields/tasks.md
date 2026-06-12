# タスク: ルーティンの優先度 UI 統一 + 編集モードでの曜日変更 (routine-card-edit-fields)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

### `<RoutineFormCard>` の優先度 UI 置換

- [x] T-01: `web/src/ui/routine-card/routine-form-card.tsx` で `import type { Priority } from "@todica/domain/task";` を追加.
- [x] T-02: 同ファイルで `import { PriorityStars } from "../priority-stars/priority-stars.js";` を追加.
- [x] T-03: `RoutineFormCardProps.defaultPriority` を `string` → `Priority` に変更. `onDefaultPriorityChange` を `(next: string) => void` → `(next: Priority) => void` に変更.
- [x] T-04: `RoutineFormCardProps.priorityId?: string` prop を撤去. 関数本体の `priorityId = "routine-priority"` default 値も撤去.
- [x] T-05: JSX 内 `<div className="routine-card__priority-row">{...}</div>` を撤去. 中身の `<label htmlFor={priorityId}>優先度</label>` + `<select id={priorityId} ...>...</select>` を完全削除.
- [x] T-06: 同位置に `<PriorityStars value={defaultPriority} onChange={onDefaultPriorityChange} groupLabel="優先度" idPrefix="routine-create" />` を挿入.

### `<RoutineCard>` 編集モードに曜日選択 UI を追加

- [x] T-07: `web/src/ui/routine-card/routine-card.tsx` の `RoutineCardProps` に `editingDaysOfWeek: number[]` / `onEditingDaysOfWeekChange: (next: number[]) => void` を追加.
- [x] T-08: 関数本体の destructuring に `editingDaysOfWeek` / `onEditingDaysOfWeekChange` を追加.
- [x] T-09: `isEditing=true` ブランチの `<form>` 内, `<input>` の直後に `<div className="routine-card__day-checkboxes" role="group" aria-label="曜日">{DAY_LABELS.map((label, day) => <label key={day}><input type="checkbox" checked={editingDaysOfWeek.includes(day)} onChange={() => { const next = editingDaysOfWeek.includes(day) ? editingDaysOfWeek.filter((d) => d !== day) : [...editingDaysOfWeek, day].sort((a, b) => a - b); onEditingDaysOfWeekChange(next); }} />{label}</label>)}</div>` を追加. DOM 順は input → 曜日 → 保存 → キャンセル (D-005).

### `routine-card.css` の不要セレクタ撤去

- [x] T-10: `web/src/ui/routine-card/routine-card.css` から `.routine-card__priority-row` セレクタ (空ルール) を撤去.
- [x] T-11: 同ファイルから `.routine-card__select` セレクタ (空ルール) を撤去.

### `routines-view.tsx` の state / mutation 拡張

- [x] T-12: `web/src/ui/routines-view/routines-view.tsx` に `import type { Priority } from "@todica/domain/task";` を追加.
- [x] T-13: `useState<string>("normal")` で初期化されている `newDefaultPriority` を `useState<Priority>("normal")` に型変更.
- [x] T-14: `useState<number[]>([])` で `editingDaysOfWeek` / `setEditingDaysOfWeek` を新設.
- [x] T-15: `openEdit(routine)` 関数内に `setEditingDaysOfWeek(routine.daysOfWeek);` を追加.
- [x] T-16: `cancelEdit()` 関数内に `setEditingDaysOfWeek([]);` を追加.
- [x] T-17: `updateMutation` の `mutationFn` 引数型を `{ id: string; ifMatch: number; name: string }` → `{ id: string; ifMatch: number; name: string; daysOfWeek: number[] }` に拡張.
- [x] T-18: 同 mutationFn 内 `body: JSON.stringify({ name: cmd.name })` を `body: JSON.stringify({ name: cmd.name, daysOfWeek: cmd.daysOfWeek })` に変更.
- [x] T-19: `handleSaveEdit()` 内に `if (editingDaysOfWeek.length === 0) return;` の early return を追加 (REQ-3-2 / AC-8).
- [x] T-20: 同関数の `updateMutation.mutateAsync({ ... })` 呼び出しに `daysOfWeek: editingDaysOfWeek` を追加.
- [x] T-21: `useCallback` deps 配列に `editingDaysOfWeek` を追加 (handleSaveEdit / cancelEdit).
- [x] T-22: JSX `<RoutineCard ... />` に props `editingDaysOfWeek={editingDaysOfWeek}` / `onEditingDaysOfWeekChange={setEditingDaysOfWeek}` を追加.

## テスト

### 単体テスト

- [x] T-23: 新規 `web/__tests__/routine-card-edit-fields.test.tsx` を作成. 以下の (a) 〜 (f) 系統で AC-1 〜 AC-25 を網羅 (D-007 / P-004).
  - [ ] (a) CSS 直読み: AC-12 (`.routine-card__priority-row` / `.routine-card__select` 撤去) / AC-13 (維持セレクタ存在).
  - [ ] (b) `<RoutineFormCard>` jsdom レンダ: AC-1 / AC-3 / AC-24.
  - [ ] (c) `<RoutineCard isEditing>` jsdom レンダ: AC-4 / AC-5 / AC-10 / AC-11.
  - [ ] (d) 型 / interface / state grep (readFileSync): AC-2 / AC-14 / AC-15 / AC-16 / AC-17 / AC-23.
  - [ ] (e) 結合レンダ (`<RoutinesView>` + stub): AC-6 / AC-7 / AC-8 / AC-9 / AC-25.
  - [ ] (f) 不変性 assert (readFileSync): AC-18 / AC-19.

### 既存単体テスト追従

- [x] T-24: `web/__tests__/routine-card-component.test.tsx` (BL-061) で:
  - [ ] 旧 `<select id="routine-priority">` 存在 assert を「不在 assert」へ逆転.
  - [ ] 旧 `<label htmlFor="routine-priority">優先度</label>` 存在 assert を「不在 assert」へ逆転.
  - [ ] `.routine-card__priority-row` / `.routine-card__select` の CSS 存在 assert を「不在 assert」へ逆転.
  - [ ] `<PriorityStars />` (= `div[role="radiogroup"]`) の存在 assert を追加.
  - [ ] `RoutineCardProps` interface 文字列 grep に `editingDaysOfWeek` / `onEditingDaysOfWeekChange` 追加.
  - [ ] `RoutineFormCardProps.defaultPriority` 型 assert を `Priority` へ追従. `priorityId?` 不在 grep 追加.
  - [ ] `<RoutineCard isEditing>` の編集モード DOM assert に `.routine-card__day-checkboxes` + 7 個 checkbox 存在を追加.
  - [ ] 既存「編集モードは name のみ」 assert があれば「name + 曜日 + 保存 + キャンセル」 assert へ更新.

### 結合 / E2E テスト

- [ ] T-25: 新規 `e2e/routine-card-edit-fields.spec.ts` を作成. 以下の 4 シナリオを追加.
  - [ ] (a) 「変更」ボタン押下後, 編集 form 内に 7 個の曜日 checkbox が表示される.
  - [ ] (b) 月曜のみのルーティンを編集 → 月+火に変更 → 保存 → reload → 月+火が反映される.
  - [ ] (c) 名前のみ変更 (曜日操作なし) → 保存 → daysOfWeek は変更前の値で反映される.
  - [ ] (d) 編集モードで全曜日を uncheck → 保存ボタン押下 → 編集モードのまま (mutation が呼ばれない).
- [x] T-26: `e2e/routines.spec.ts` 内に作成フォームの優先度操作 (`selectOption` / 旧 select 経由) があれば `<PriorityStars />` 経由 (`getByRole("radio", { name: /^星 \d/ })`) に追従修正. 無ければスキップ.
- [x] T-27: `e2e/a11y.spec.ts` の `/routines` スキャンが violations 0 件のままであることを確認 (NFR-A11Y / AC-22).

### 仕様ドキュメント追従

- [x] T-28: `docs/developer/features/routine-card-component/spec.md` D-008-2 節 (line 781-782) に「本決定は BL-068 (routine-card-edit-fields) で逆転」の注釈 1 行を追加 (R-002 / REQ-6 / AC-23).

## ドキュメント

- [x] T-29: `docs/developer/planning/backlog.md` に BL-068 行を**追加**. ID = `BL-068`, タイトル = 「ルーティンの優先度 UI 統一 + 編集モードでの曜日変更」, 優先度 = `P2`, 状態 = `Todo`, メモ = 「NFR-010 / BL-040, BL-061 依存 / 想定 `features/routine-card-edit-fields/`. 2 件の user 要求: (1) `<RoutineFormCard>` の優先度 `<select>` を `<PriorityStars />` (BL-040) に置換し prop 型を `Priority` 化 (BL-061 D-008-2 を逆転), (2) `<RoutineCard>` 編集モード DOM に曜日選択 UI (`.routine-card__day-checkboxes` 7 チェックボックス) を追加し routines-view.tsx の `editingDaysOfWeek` state を新設, `updateMutation` mutationFn 引数型に `daysOfWeek: number[]` を含めて送信. RoutineRepository の API は BL-017 で既に対応済みのため無改修. 影響: routine-form-card.tsx / routine-card.tsx / routine-card.css (`.routine-card__priority-row` / `.routine-card__select` 撤去) / routines-view.tsx + 既存 routine-card-component.test.tsx (20 件前後) と routines.spec.ts の追従. 新規 routine-card-edit-fields.test.tsx + routine-card-edit-fields.spec.ts. 完了の目安は (a) 起票カードの優先度が星 3 つ UI で表示 + Priority 型で送信, (b) 編集モードで曜日が変更可能 + daysOfWeek が PATCH に乗る, (c) BL-061 既存テスト全件 green + 新規テスト全件 green + a11y violations 0 件維持」.
- [x] T-30: BL-068 行は BL-067 行の直後に挿入する (= BL-067 → BL-068 の順).

## 仕上げ

- [x] T-31: 受け入れ基準 (spec.md AC-1 〜 AC-25) を全て満たすことを確認.
- [x] T-32: lint / typecheck が exit 0 であることを確認.
- [x] T-33: `auditor` サブエージェントへレビュー依頼.
