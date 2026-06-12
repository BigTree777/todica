# タスク: ルーティン編集モードでの優先度変更 (routine-card-edit-priority)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 実装

### `<RoutineCard>` 編集モードに `<PriorityStars />` を追加

- [x] T-01: `web/src/ui/routine-card/routine-card.tsx` で `import type { Priority } from "@todica/domain/task";` を追加.
- [x] T-02: 同ファイルで `import { PriorityStars } from "../priority-stars/priority-stars.js";` を追加.
- [x] T-03: `RoutineCardProps` interface に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void` を追加.
- [x] T-04: 関数本体の destructuring に `editingDefaultPriority` / `onEditingDefaultPriorityChange` を追加.
- [x] T-05: `isEditing=true` ブランチの `<form>` 内, `<div className="routine-card__day-checkboxes">` の直後 / `<button type="submit">保存` の直前に `<PriorityStars value={editingDefaultPriority} onChange={onEditingDefaultPriorityChange} groupLabel="優先度" idPrefix="routine-edit" />` を挿入. DOM 順は label → input → div.day-checkboxes → PriorityStars → 保存 → キャンセル (D-001).
- [x] T-06: 表示モード (`isEditing=false` ブランチ) は無改修であることを確認.

### `routines-view.tsx` の state / mutation 拡張

- [x] T-07: `web/src/ui/routines-view/routines-view.tsx` で `useState<Priority>("normal")` で `editingDefaultPriority` / `setEditingDefaultPriority` を新設 (D-004).
- [x] T-08: `updateMutation` の `mutationFn` 引数型を `{ id; ifMatch; name; daysOfWeek }` → `{ id; ifMatch; name; daysOfWeek; defaultPriority: Priority }` に拡張.
- [x] T-09: 同 mutationFn 内 `body: JSON.stringify({ name: cmd.name, daysOfWeek: cmd.daysOfWeek })` を `body: JSON.stringify({ name: cmd.name, daysOfWeek: cmd.daysOfWeek, defaultPriority: cmd.defaultPriority })` に変更.
- [x] T-10: `openEdit(routine)` 関数内に `setEditingDefaultPriority(routine.defaultPriority);` を追加.
- [x] T-11: `cancelEdit()` 関数内に `setEditingDefaultPriority("normal");` を追加 (D-005).
- [x] T-12: `handleSaveEdit()` の `updateMutation.mutateAsync({ ... })` 呼び出しに `defaultPriority: editingDefaultPriority` を追加.
- [x] T-13: `handleSaveEdit` の `useCallback` deps 配列に `editingDefaultPriority` を追加 (P-009).
- [x] T-14: JSX `<RoutineCard ... />` に `editingDefaultPriority={editingDefaultPriority}` / `onEditingDefaultPriorityChange={setEditingDefaultPriority}` を追加.

### `routine-card.css` / tokens.css / WebRoutineRepository は無改修であることを確認

- [x] T-15: `web/src/ui/routine-card/routine-card.css` を **無改修** で維持 (NFR-NO-NEW-CSS-RULES / G-11 / REQ-6).
- [x] T-16: `web/src/styles/tokens.css` を **無改修** で維持 (NFR-NO-NEW-TOKENS / G-10).
- [x] T-17: `web/src/repositories/routine-repository.ts` を **無改修** で維持 (NFR-COMPAT / G-9).
- [x] T-18: `web/src/ui/priority-stars/priority-stars.tsx` / `priority-stars.css` を **無改修** で維持 (NFR-PRIORITY-STARS-COMPAT).
- [x] T-19: `web/src/ui/routine-card/routine-form-card.tsx` を **無改修** で維持 (REQ-8 / BL-068 で `<PriorityStars idPrefix="routine-create">` 化済み).

## テスト

### 単体テスト

- [x] T-20: 新規 `web/__tests__/routine-card-edit-priority.test.tsx` を作成. 以下の (a) 〜 (d) 系統で AC-1 〜 AC-23 を網羅 (D-008 / P-003).
  - [ ] (a) `<RoutineCard isEditing>` jsdom レンダ: AC-1 / AC-2 / AC-3 / AC-5 / AC-6 / AC-11.
  - [ ] (b) 結合 (`<RoutinesView>` + stub) jsdom レンダ: AC-4 / AC-7 / AC-8 / AC-9 / AC-21 / AC-22 / AC-23.
  - [ ] (c) 型 / interface / state grep (readFileSync): AC-10 / AC-12 / AC-13 / AC-19.
  - [ ] (d) 不変性 assert (readFileSync): AC-14 / AC-15 / AC-16.

### 既存単体テスト追従

- [x] T-21: `web/__tests__/routine-card-edit-fields.test.tsx` (BL-068) で:
  - [ ] `RoutineCardProps` interface 文字列 grep に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void` を追加 (3 件).
  - [ ] AC-11 DOM 順 assert を `label → input → div.day-checkboxes → 保存 → キャンセル` → `label → input → div.day-checkboxes → div[role="radiogroup"] → 保存 → キャンセル` に追従 (1 件).
  - [ ] AC-6 / AC-7 結合 `updateMutation` 引数 assert に `defaultPriority` を追加 (2 件).
- [x] T-22: `web/__tests__/routine-card-component.test.tsx` (BL-061) で:
  - [ ] `RoutineCardProps` interface 文字列 grep に `editingDefaultPriority` 系を追加 (2 件).
  - [ ] `<RoutineCard isEditing>` の DOM assert に `<PriorityStars />` (= `div[role="radiogroup"]`) の存在 assert を追加 (1 件).

### 結合 / E2E テスト

- [x] T-23: 新規 `e2e/routine-card-edit-priority.spec.ts` を作成. 以下の 4 シナリオを追加 (P-005 / D-009).
  - [ ] (a) 「変更」ボタン押下後, 編集 form 内に `<PriorityStars />` (radiogroup) が表示される.
  - [ ] (b) 月曜 + normal のルーティンを編集 → 優先度を highest に変更 → 保存 → reload → 再度編集モードで PriorityStars が highest 状態.
  - [ ] (c) 名前のみ変更 (優先度操作なし) → 保存 → reload → defaultPriority は変更前の値が維持されている.
  - [ ] (d) 起票カード PriorityStars (`routine-create-...`) と編集カード PriorityStars (`routine-edit-...`) の radio button id が衝突しない.
- [x] T-24: `e2e/routines.spec.ts` 内に優先度操作 (`selectOption` / 旧 select 経由) があれば `<PriorityStars />` 経由 (`getByRole("radio", ...)`) に追従修正. 無ければスキップ (R-003).
- [x] T-25: `e2e/routine-card-edit-fields.spec.ts` (BL-068) の既存 4 シナリオが無修正で通ることを確認. 必要なら編集モード遷移時の `editingDefaultPriority` 初期値 assert を追加 (任意).
- [x] T-26: `e2e/a11y.spec.ts` の `/routines` スキャンが violations 0 件のままであることを確認 (NFR-A11Y / AC-20).

### 仕様ドキュメント追従

- [x] T-27: `docs/developer/features/routine-card-edit-fields/spec.md` D-011 節末尾に「**BL-069 (routine-card-edit-priority) で逆転**: 本決定は BL-069 で逆転し, 編集モードに `<PriorityStars editingDefaultPriority />` を追加した. 詳細は `../routine-card-edit-priority/spec.md` REQ-1 / D-001 を参照」の注釈 1 行を追加 (REQ-5 / AC-19).

## ドキュメント

- [x] T-28: `docs/developer/planning/backlog.md` に BL-069 行を**追加**. ID = `BL-069`, タイトル = 「ルーティン編集モードでの優先度変更」, 優先度 = `P2`, 状態 = `Todo`, メモ = 「NFR-010 / BL-040, BL-061, BL-068, BL-017 依存 / 想定 `features/routine-card-edit-priority/`. user 要求「ルーティンは優先度も変更できなくてはなりません」. BL-068 D-011 (= 編集モードの優先度変更は非ゴール) を本 BL で逆転. **採用方針**: `<RoutineCard>` の `isEditing=true` ブランチ form 内に `<PriorityStars value={editingDefaultPriority} onChange={onEditingDefaultPriorityChange} groupLabel=\"優先度\" idPrefix=\"routine-edit\" />` を追加. `RoutineCardProps` に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void` を追加. DOM 順: input → 曜日 → 優先度 → 保存 → キャンセル (BL-068 D-005 を「優先度」追加で拡張). routines-view.tsx の state に `editingDefaultPriority` 追加 + `openEdit(routine)` で `setEditingDefaultPriority(routine.defaultPriority)` 初期化 + `cancelEdit()` で `\"normal\"` リセット + `handleSaveEdit()` で `updateMutation.mutateAsync({ ..., defaultPriority })` 送信. `updateMutation` mutationFn 引数型と offline-queue body に `defaultPriority: Priority` を追加. `WebRoutineRepository.update()` の `UpdateRoutineCommand.defaultPriority?: string` は BL-017 で対応済みのため無改修. `idPrefix=\"routine-edit\"` で起票側 (BL-068 `\"routine-create\"`) と区別し id 衝突回避. **スコープ境界**: TaskCard / TaskFormCard / ProjectCard / RoutineFormCard / WebRoutineRepository / API / domain / server / 共通 button (BL-067) には触れない. **影響**: routine-card.tsx + routines-view.tsx + 既存 routine-card-edit-fields.test.tsx (BL-068 / 5 件前後) + routine-card-component.test.tsx (BL-061 / 3 件前後) + BL-068 spec D-011 への注釈 1 行追加. 新規 `routine-card-edit-priority.test.tsx` (AC-1 〜 AC-23) + `e2e/routine-card-edit-priority.spec.ts` (4 シナリオ). 新規 component / 新規 CSS / routine-card.css 新規セレクタ / tokens.css 改修なし. **完了の目安**: (a) 編集モードで優先度が `<PriorityStars />` で変更可能, (b) defaultPriority が PATCH に乗る (offline-queue body 含む), (c) BL-068 / BL-061 既存テスト全件 green + 新規テスト全件 green + a11y violations 0 件維持, (d) 起票/編集 PriorityStars の id 衝突 0 件」.
- [x] T-29: BL-069 行は BL-068 行の直後に挿入する (= BL-068 → BL-069 の順).

## 仕上げ

- [x] T-30: 受け入れ基準 (spec.md AC-1 〜 AC-23) を全て満たすことを確認.
- [x] T-31: lint / typecheck が exit 0 であることを確認.
- [x] T-32: `auditor` サブエージェントへレビュー依頼.
