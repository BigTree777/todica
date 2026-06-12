# 仕様: ルーティン編集モードでの優先度変更 (routine-card-edit-priority)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-069
  - 依存 BL:
    - BL-068 (routine-card-edit-fields) — `<RoutineFormCard>` を `<PriorityStars />` に統一 + `<RoutineCard>` 編集モードに曜日選択を追加. 本 BL は同モードに**優先度変更**を追加する直接の継続.
    - BL-061 (routine-card-component) — `<RoutineCard>` / `<RoutineFormCard>` / `routine-card.css` の本体.
    - BL-040 (priority-star-ui) — `<PriorityStars />` コンポーネント / `Priority` 型のマッピング.
    - BL-017 (routine) — `RoutineRepository.update()` の API. `UpdateRoutineCommand.defaultPriority?` の patch は既に対応済み.
  - 関連 feature:
    - [`../routine-card-edit-fields/spec.md`](../routine-card-edit-fields/spec.md) (BL-068) — 本 BL の起点. D-011 (編集モードの優先度変更は非ゴール) を本 BL で逆転する.
    - [`../routine-card-component/spec.md`](../routine-card-component/spec.md) (BL-061) — `<RoutineCard>` API.
    - [`../priority-star-ui/spec.md`](../priority-star-ui/spec.md) (BL-040) — `<PriorityStars />` の API.
    - [`../routine/spec.md`](../routine/spec.md) (BL-017) — `RoutineRepository.update()` API 仕様 (`defaultPriority?` 受理済み).
  - 上位要件: NFR-010 (一貫した UI / 最小手数) / FR-ROUTINE / FR-003, FR-004 (優先度).
  - 関係しない feature: TaskCard 系 (BL-059) / ProjectCard 系 (BL-060) / 共通 button (BL-067) には触れない.

## 背景 / 課題

BL-068 で以下 2 件を実装した.

1. `<RoutineFormCard>` (起票カード) の優先度入力を `<select>` → `<PriorityStars />` に統一.
2. `<RoutineCard isEditing={true}>` (編集モード) の form DOM に曜日選択 UI (7 checkbox) を追加し, routines-view の `editingDaysOfWeek` state + `updateMutation` の `daysOfWeek` 送信経路を新設.

しかし BL-068 D-011 で「編集モードでの `defaultPriority` 変更は user 要求に含まれないため非ゴール (必要なら別 BL)」と据え置いた. 結果として現状は以下の非対称が残る.

| | 名称 | 曜日 | 優先度 |
| --- | --- | --- | --- |
| 起票 (`<RoutineFormCard>`) | 編集可 | 編集可 | 編集可 (PriorityStars / BL-068) |
| 編集 (`<RoutineCard isEditing>`) | 編集可 | 編集可 (BL-068) | **編集不可** ← 本 BL |

user 要求: 「ルーティンは優先度も変更できなくてはなりません」.

= 編集モードでも `defaultPriority` を `<PriorityStars />` 経由で変更可能にし, 起票時と編集時で routine の 3 フィールド (name / daysOfWeek / defaultPriority) すべてが editable に揃う状態を実現する.

### 方針の核

本 BL は以下を実現する.

1. **`<RoutineCard>` 編集モードに `<PriorityStars />` を追加** する. `<select>` には戻さない (BL-068 で確定した起票側の `<PriorityStars />` 統一と整合 / D-002).
2. **props 追加**: `RoutineCardProps` に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void` を追加 (BL-068 で曜日に対して行った G-4 と同形 / D-003 / D-006).
3. **routines-view.tsx の state 追加**: `editingDefaultPriority` を新設し, `openEdit(routine)` で `routine.defaultPriority` を初期化, `cancelEdit()` でリセット, `handleSaveEdit()` で `updateMutation` に送信.
4. **`updateMutation` の mutationFn 引数型と offline-queue body に `defaultPriority: Priority` を追加** (BL-068 で `daysOfWeek` に対して行った G-6 と同形).
5. **BL-068 D-011 の逆転を spec に記録** (= 「BL-069 で逆転」を BL-068 spec D-011 節に注釈追記).

`<PriorityStars />` は BL-040 の API を再利用する (新規 component / 新規 CSS は作らない / NFR-NO-NEW-COMPONENTS). `WebRoutineRepository.update()` の `UpdateRoutineCommand.defaultPriority?: string` は BL-017 / routine-repository.ts:30 で対応済みのため無改修 (NFR-COMPAT).

## ゴール / 非ゴール

### ゴール

- **G-1 (RoutineCard 編集モードに `<PriorityStars />` を追加)**: `<RoutineCard isEditing={true}>` の編集 form 内に `<PriorityStars value={editingDefaultPriority} onChange={onEditingDefaultPriorityChange} groupLabel="優先度" idPrefix="routine-edit" />` を追加する.
- **G-2 (編集モードの defaultPriority state を親に上げる)**: `RoutineCardProps` に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void` を追加する. 親 `routines-view.tsx` が `useState<Priority>("normal")` で state を持つ.
- **G-3 (`openEdit()` / `cancelEdit()` / `handleSaveEdit()` の追従)**: `openEdit(routine)` で `setEditingDefaultPriority(routine.defaultPriority)` を呼び初期値を当てる. `cancelEdit()` で `setEditingDefaultPriority("normal")` にリセット (起票側の `newDefaultPriority` 初期値と同じ). `handleSaveEdit()` で `updateMutation.mutateAsync({ id, ifMatch, name, daysOfWeek, defaultPriority })` を呼び `defaultPriority` も送信する.
- **G-4 (`updateMutation` の mutationFn 引数型に `defaultPriority: Priority` を追加)**: `routines-view.tsx` の `updateMutation` の `mutationFn` 引数型を `{ id; ifMatch; name; daysOfWeek }` → `{ id; ifMatch; name; daysOfWeek; defaultPriority: Priority }` に拡張する. `body: JSON.stringify({ name, daysOfWeek, defaultPriority })` に追従する. `WebRoutineRepository.update()` の `UpdateRoutineCommand.defaultPriority?` は BL-017 で既に対応済みのため repository 側は無改修.
- **G-5 (編集モードの DOM 順を拡張)**: 編集 form 内の DOM 順は `visually-hidden label → input → 曜日 (div.routine-card__day-checkboxes) → 優先度 (PriorityStars radiogroup) → 保存 → キャンセル` (D-001 / BL-068 D-005 を「優先度」追加で拡張).
- **G-6 (`<PriorityStars />` の groupLabel / idPrefix を確定)**: 編集モードの `<PriorityStars />` は `groupLabel="優先度"` / `idPrefix="routine-edit"` を渡す. 起票側 (`<RoutineFormCard>`) の `idPrefix="routine-create"` (BL-068 D-002) と区別することで「同じ画面に起票カードと編集カードが同時 render される場合の id 衝突」を回避 (D-002).
- **G-7 (BL-068 D-011 の逆転 / 記録)**: BL-068 D-011 で確定した「編集モードの優先度変更は非ゴール」を本 BL で逆転する. BL-068 spec.md の D-011 節に「本 BL (BL-069 / routine-card-edit-priority) で逆転」の注釈 1 行を追加する (= history を残す).
- **G-8 (a11y 違反 0 件維持)**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.
- **G-9 (NFR-COMPAT 維持)**: `WebRoutineRepository` / mutation 経路 / `ConflictDialog` / `notifyError` / offline-queue の API は無改修.
- **G-10 (tokens.css 無改修)**: `web/src/styles/tokens.css` を変更しない.
- **G-11 (新規 component / 新規 CSS なし)**: 新規 React コンポーネント / 新規 CSS ファイル / `routine-card.css` への新規セレクタ追加なし. 既存 `<PriorityStars />` (BL-040) を再利用する.

### 非ゴール

- **`<RoutineCard>` / `<RoutineFormCard>` / `routine-card.css` 以外の component 改修**: スコープ外.
- **TaskCard 系 (BL-059) / ProjectCard 系 (BL-060)**: 触れない.
- **`<PriorityStars />` 本体の改修**: 無改修 (BL-040 NFR-COMPAT).
- **`<RoutineFormCard>` (起票カード) の改修**: 無改修. BL-068 で `<PriorityStars />` 化済み.
- **共通 button スタイル (BL-067)**: 別 BL.
- **`WebRoutineRepository` / `RoutineConflictError` / mutation 経路の API 拡張**: 無改修 (既存 patch を活用).
- **domain / server API**: 無改修.
- **`routine-card.css` の新規セレクタ追加**: しない. 既存 selectors のみで構成 (= `<PriorityStars />` 本体の `priority-stars.css` で visual が担保される).
- **編集モードでの新規共通コンポーネント化 (`<RoutineEditForm>` 等)**: 別 BL.
- **編集モードに「リセット」ボタン追加**: 別 BL. cancelEdit ですべてリセットすれば足りる.
- **tokens.css への新規トークン追加**: G-10.

## 要件

### 機能要件

- **REQ-1 (`<RoutineCard>` 編集モードに `<PriorityStars />` を追加 / G-1 / G-5)**

  `web/src/ui/routine-card/routine-card.tsx` の `isEditing=true` ブランチを以下のように変更する.

  - **追加する DOM** (曜日選択 UI の直後 / 保存 button の直前 / G-5 / D-001):
    ```jsx
    <PriorityStars
      value={editingDefaultPriority}
      onChange={onEditingDefaultPriorityChange}
      groupLabel="優先度"
      idPrefix="routine-edit"
    />
    ```

  - import 追加: `import { PriorityStars } from "../priority-stars/priority-stars.js";` + `import type { Priority } from "@todica/domain/task";`.
  - 編集モードの DOM 順 (D-001): `<label.visually-hidden> → <input> → <div.routine-card__day-checkboxes> → <PriorityStars radiogroup> → <button type="submit"> → <button type="button">`.
  - **表示モードは無改修**. 表示モード DOM (= `.routine-card__main` + `.routine-card__actions`) には変更を加えない.

- **REQ-2 (`RoutineCardProps` に editingDefaultPriority 系 props 追加 / G-2)**

  `RoutineCardProps` interface に以下を追加する:

  ```ts
  /** 編集モードの defaultPriority (親が state を持つ) (BL-069 G-2). */
  editingDefaultPriority: Priority;
  /** 編集モードの優先度変更ハンドラ (BL-069 G-2). */
  onEditingDefaultPriorityChange: (next: Priority) => void;
  ```

  - 既存 props (`routine` / `isEditing` / `editingName` / `onEditingNameChange` / `editingDaysOfWeek` / `onEditingDaysOfWeekChange` / `onStartEdit` / `onCancelEdit` / `onSaveEdit` / `onDelete` / `as`) は維持する.
  - 関数本体の destructuring に `editingDefaultPriority` / `onEditingDefaultPriorityChange` を追加する.

- **REQ-3 (`routines-view.tsx` の state / handler 拡張 / G-3)**

  `web/src/ui/routines-view/routines-view.tsx` を以下のように変更する.

  - **state 追加**:
    ```ts
    const [editingDefaultPriority, setEditingDefaultPriority] = useState<Priority>("normal");
    ```

  - **`openEdit(routine)` 拡張**:
    ```ts
    const openEdit = useCallback((routine: WebRoutine) => {
      setEditingId(routine.id);
      setEditingName(routine.name);
      setEditingDaysOfWeek(routine.daysOfWeek);
      setEditingDefaultPriority(routine.defaultPriority);    // ← 追加
    }, []);
    ```

  - **`cancelEdit()` 拡張**:
    ```ts
    const cancelEdit = useCallback(() => {
      setEditingId(null);
      setEditingName("");
      setEditingDaysOfWeek([]);
      setEditingDefaultPriority("normal");                   // ← 追加 (D-005)
    }, []);
    ```

  - **`handleSaveEdit()` 拡張**:
    ```ts
    const handleSaveEdit = useCallback(
      async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingId) return;
        const routine = routines.find((r) => r.id === editingId);
        if (!routine) return;
        if (editingDaysOfWeek.length === 0) return;
        await updateMutation.mutateAsync({
          id: editingId,
          ifMatch: routine.version,
          name: editingName,
          daysOfWeek: editingDaysOfWeek,
          defaultPriority: editingDefaultPriority,           // ← 追加
        });
        cancelEdit();
      },
      [editingId, editingName, editingDaysOfWeek, editingDefaultPriority, routines, updateMutation, cancelEdit],
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
      editingDefaultPriority={editingDefaultPriority}        // ← 追加
      onEditingDefaultPriorityChange={setEditingDefaultPriority}  // ← 追加
      onStartEdit={() => openEdit(routine)}
      onCancelEdit={cancelEdit}
      onSaveEdit={handleSaveEdit}
      onDelete={() => handleDelete(routine)}
    />
    ```

- **REQ-4 (`updateMutation` の mutationFn 引数型と body に defaultPriority を追加 / G-4)**

  `routines-view.tsx` の `updateMutation` の mutationFn 引数型を以下のように拡張する.

  - **変更前** (現行 L131):
    ```ts
    mutationFn: async (cmd: {
      id: string;
      ifMatch: number;
      name: string;
      daysOfWeek: number[];
    }) => { ... }
    ```

  - **変更後**:
    ```ts
    mutationFn: async (cmd: {
      id: string;
      ifMatch: number;
      name: string;
      daysOfWeek: number[];
      defaultPriority: Priority;                              // ← 追加
    }) => { ... }
    ```

  - body / enqueue の JSON にも `defaultPriority` を含める:
    ```ts
    body: JSON.stringify({
      name: cmd.name,
      daysOfWeek: cmd.daysOfWeek,
      defaultPriority: cmd.defaultPriority,                  // ← 追加
    }),
    ```

  - `repository.update(cmd)` の引数は `UpdateRoutineCommand` に互換 (`defaultPriority?: string` を `Priority` (= "highest" | "normal" | "later") として渡す形 / `Priority` は `string` の subtype のため transparent).

- **REQ-5 (BL-068 D-011 を逆転して記録 / G-7)**

  - `docs/developer/features/routine-card-edit-fields/spec.md` の D-011 節 (= 「`<RoutineCard>` 編集モードでの defaultPriority 編集 / 非ゴール」) に注釈を追記する.
  - 注釈内容: 「**BL-069 (routine-card-edit-priority) で逆転**: 本決定は BL-069 で逆転し, 編集モードに `<PriorityStars editingDefaultPriority />` を追加した. 詳細は `../routine-card-edit-priority/spec.md` REQ-1 / D-001 を参照」の 1 行を D-011 節末尾に追加する. 本文は維持 (= history を残す).

- **REQ-6 (`routine-card.css` への変更なし)**

  - `<PriorityStars />` 本体は専用 CSS (`priority-stars.css`) を持つため `routine-card.css` への新規セレクタ追加は不要.
  - 編集 form `.routine-card__form-inline` の `align-items: center` で `<PriorityStars />` (button 3 個) も垂直中央寄せに乗る挙動を許容する (= D-007 / BL-068 D-008 と同方針).
  - 視覚的に窮屈な場合の追加 CSS は本 BL では追加しない (D-007 / 将来 BL).

- **REQ-7 (新規 component / 新規 CSS なし / G-11)**

  - 新規 React コンポーネントは作らない.
  - 新規 CSS ファイルは作らない.
  - `routine-card.css` への新規セレクタ追加なし.
  - tokens.css への新規トークン追加なし.

- **REQ-8 (起票側 `<RoutineFormCard>` は無改修)**

  - `<RoutineFormCard>` (= 起票カード) の優先度 UI は BL-068 で `<PriorityStars />` 化済み. 本 BL では一切触れない.
  - `idPrefix="routine-create"` (BL-068 D-002) は維持. 本 BL の編集モード `idPrefix="routine-edit"` と衝突しないように区別する (G-6 / D-002).

### 非機能要件

- **NFR-COMPAT**: `WebRoutineRepository` / `UpdateRoutineCommand` / `RoutineConflictError` / mutation 経路 / `ConflictDialog` / offline-queue / `notifyError` は無改修. `UpdateRoutineCommand.defaultPriority?: string` は BL-017 で対応済み (G-9).
- **NFR-NO-NEW-TOKENS**: tokens.css を変更しない (G-10).
- **NFR-NO-NEW-COMPONENTS**: 新規 React コンポーネント / 新規 CSS ファイルを作らない (G-11).
- **NFR-NO-NEW-CSS-RULES**: `routine-card.css` に新規セレクタを追加しない. 既存セレクタの修正もしない (REQ-6 / G-11).
- **NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION**: `.routine-card` 系セレクタに新規 `box-shadow` / `:hover` / `transition` / `animation` を追加しない (BL-061 / BL-068 整合).
- **NFR-FORM-ARIA-LABEL-PRESERVE**: 作成 form の `aria-label="ルーティン作成フォーム"` と編集 form の `aria-label="ルーティン名称変更フォーム"` は**維持** (BL-061 / BL-068 整合).
- **NFR-NAME-INPUT-PRESERVE**: 編集 form の name input の placeholder「ルーティン名」と visually-hidden label「ルーティン名」は維持 (BL-068 NFR-NAME-INPUT-PRESERVE 整合).
- **NFR-DAY-LABEL-PRESERVE**: 編集 form の曜日 checkbox 7 個の label テキスト「日」「月」「火」「水」「木」「金」「土」は維持 (BL-068 NFR-DAY-LABEL-PRESERVE 整合).
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する (G-8).
- **NFR-DOM-COMPATIBLE-LI**: 一覧の各行は引き続き `<li>` 直下に配置する (= `<RoutineCard as="li">`). 既存テストの `<li>` ベース取得が壊れない.
- **NFR-PRIORITY-STARS-COMPAT**: `<PriorityStars />` 本体 (BL-040) を無改修.
- **NFR-IDPREFIX-DISJOINT**: 編集モードの `<PriorityStars idPrefix="routine-edit">` は起票カードの `idPrefix="routine-create"` (BL-068) と DOM 上で id が衝突しない (G-6 / D-002).
- **NFR-PRESERVE-SHELL**: BL-045 の `.routines-view` / `.routines-view h1` / `.routines-view__list` / `.routines-view__empty` のルール本文は無改修.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` (vitest 単体) と `npx playwright test` (E2E) を基準とする.

```
シナリオ AC-1: <RoutineCard isEditing=true> の編集 form に <PriorityStars /> が render される
  Given <RoutineCard isEditing={true} editingDefaultPriority="normal" onEditingDefaultPriorityChange={mock} ... /> を render する
  When  編集 form 内を観察する
  Then  div[role="radiogroup"] (PriorityStars) が編集 form 内に存在する
   かつ その radiogroup の aria-label に「優先度」を含む
   かつ 編集 form 内に <select> 系の優先度入力は存在しない
```

```
シナリオ AC-2: 編集モードの初期表示で routine.defaultPriority が PriorityStars に選択状態で反映される
  Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="highest", version=1) が 1 件存在する
  When  「変更」 button を click し editing モードへ遷移する
  Then  編集 form 内の PriorityStars の aria-label が「優先度: 最優先」または等価な現在値表示である (BL-040 REQ-4 / D-002 準拠)
   かつ "highest" に対応する radio が aria-checked="true" になる
```

```
シナリオ AC-3: PriorityStars の操作で onEditingDefaultPriorityChange が Priority 型で呼ばれる
  Given <RoutineCard isEditing={true} editingDefaultPriority="normal" onEditingDefaultPriorityChange={mock} ... /> を render する
  When  「最優先」 (highest) に対応する radio (= 星 3 つ目) を click する
  Then  mock が "highest" (Priority 型) で 1 回呼ばれる
  When  「後回し」 (later) に対応する radio を click する
  Then  mock が "later" で次に呼ばれる
```

```
シナリオ AC-4: 編集 → 優先度変更 → 保存 で defaultPriority が updateMutation 経由で送信される
  Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="normal", version=1) が 1 件存在する
   かつ updateMutation を spy する
  When  「変更」 button を click し editing モードへ遷移する
   かつ 優先度を「最優先」 (highest) に変更する
   かつ 「保存」 button を click する
  Then  updateMutation.mutateAsync が { id, ifMatch: 1, name: "A", daysOfWeek: [1], defaultPriority: "highest" } で 1 回呼ばれる
```

```
シナリオ AC-5: cancelEdit で editingDefaultPriority がリセットされる
  Given 編集モードで優先度を "later" に変更した状態にある
  When  「キャンセル」 button を click する
  Then  編集モードを抜け表示モードに戻る
   かつ routines-view.tsx 内の editingDefaultPriority state が "normal" にリセットされる (D-005 / 起票側初期値と同じ)
   かつ 表示モードの該当ルーティンの defaultPriority は変更前の値のまま (= 通信が走らなかったため変更なし)
```

```
シナリオ AC-6: 編集モードの DOM 順は input → 曜日 → 優先度 → 保存 → キャンセル である (D-001)
  Given <RoutineCard isEditing={true} editingDaysOfWeek={[1]} editingDefaultPriority="normal" ... /> を render する
  When  編集 form 内の direct children を DOM 順に観察する
  Then  1 番目の child は label.visually-hidden (htmlFor=input) である
   かつ 2 番目の child は input (type=text / name input) である
   かつ 3 番目の child は div.routine-card__day-checkboxes である
   かつ 4 番目の child は div[role="radiogroup"] (PriorityStars) である
   かつ 5 番目の child は button[type="submit"] (保存) である
   かつ 6 番目の child は button[type="button"] (キャンセル) である
```

```
シナリオ AC-7: 編集 → 名前のみ変更 → 保存 でも defaultPriority は変更前の値で送信される
  Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="highest", version=1) が 1 件存在する
  When  「変更」 button を click し editing モードへ遷移する
   かつ 名前を "B" に変更する (優先度は触らない)
   かつ 「保存」 button を click する
  Then  updateMutation.mutateAsync が { id, ifMatch: 1, name: "B", daysOfWeek: [1], defaultPriority: "highest" } で 1 回呼ばれる
   かつ defaultPriority も「変更前の値 highest」で送信される (= openEdit で初期化された値)
```

```
シナリオ AC-8: 編集モードで曜日 0 件のときは「保存」を押しても mutation は呼ばれない (BL-068 AC-8 維持)
  Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="normal", version=1) が 1 件存在する
  When  「変更」 button を click し editing モードへ遷移する
   かつ 月曜の checkbox を uncheck する (editingDaysOfWeek=[])
   かつ 優先度を "later" に変更する
   かつ 「保存」 button を click する
  Then  updateMutation.mutateAsync は呼ばれない (= BL-068 REQ-3-2 の silent return が維持)
   かつ 編集モードのままである
```

```
シナリオ AC-9: openEdit で editingDefaultPriority が routine.defaultPriority で初期化される
  Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="later", version=1) が 1 件存在する
  When  「変更」 button を click し editing モードへ遷移する
  Then  routines-view.tsx 内の editingDefaultPriority state が "later" で初期化される
   かつ PriorityStars 上で "later" に対応する radio が aria-checked="true" になる
```

```
シナリオ AC-10: RoutineCardProps に editingDefaultPriority / onEditingDefaultPriorityChange が追加されている
  Given web/src/ui/routine-card/routine-card.tsx を開いた
  When  RoutineCardProps の interface を観察する
  Then  editingDefaultPriority: Priority の宣言を含む
   かつ onEditingDefaultPriorityChange: (next: Priority) => void の宣言を含む
   かつ 既存の routine / isEditing / editingName / onEditingNameChange / editingDaysOfWeek / onEditingDaysOfWeekChange / onStartEdit / onCancelEdit / onSaveEdit / onDelete / as は維持されている
   かつ import type { Priority } from "@todica/domain/task" を含む
```

```
シナリオ AC-11: routine-card.tsx 編集モードの <PriorityStars /> 呼び出しに groupLabel / idPrefix が指定されている (REQ-1 / G-6)
  Given web/src/ui/routine-card/routine-card.tsx を開いた
  When  isEditing=true ブランチ内の <PriorityStars ... /> 呼び出しを観察する
  Then  value={editingDefaultPriority} を含む
   かつ onChange={onEditingDefaultPriorityChange} を含む
   かつ groupLabel="優先度" を含む
   かつ idPrefix="routine-edit" を含む (起票側 "routine-create" と区別 / NFR-IDPREFIX-DISJOINT)
```

```
シナリオ AC-12: routines-view.tsx が editingDefaultPriority state を持ち <RoutineCard> に渡す (REQ-3)
  Given web/src/ui/routines-view/routines-view.tsx を開いた
  When  ファイル本文を観察する
  Then  useState<Priority>("normal") の editingDefaultPriority 宣言を含む (D-004 整合)
   かつ openEdit 内で setEditingDefaultPriority(routine.defaultPriority) を呼ぶ
   かつ cancelEdit 内で setEditingDefaultPriority("normal") を呼ぶ (D-005)
   かつ handleSaveEdit 内で updateMutation.mutateAsync の引数に defaultPriority: editingDefaultPriority を含む
   かつ <RoutineCard ... editingDefaultPriority={editingDefaultPriority} onEditingDefaultPriorityChange={setEditingDefaultPriority} ... /> の使用を含む
```

```
シナリオ AC-13: updateMutation の mutationFn 引数型と body に defaultPriority が含まれる (REQ-4)
  Given routines-view.tsx を開いた
  When  updateMutation の mutationFn 引数型と body を観察する
  Then  { id: string; ifMatch: number; name: string; daysOfWeek: number[]; defaultPriority: Priority } の宣言を含む
   かつ body の JSON.stringify に defaultPriority が含まれる
   かつ repository.update(cmd) の呼び出しは無改修 (UpdateRoutineCommand に互換)
```

```
シナリオ AC-14: routine-card.css に新規セレクタが追加されていない (REQ-6 / NFR-NO-NEW-CSS-RULES)
  Given web/src/ui/routine-card/routine-card.css を本 BL の前後で diff を取る
  When  差分を観察する
  Then  新規セレクタの追加が 0 件である
   かつ 既存セレクタの宣言修正が 0 件である
```

```
シナリオ AC-15: tokens.css を変更していない (NFR-NO-NEW-TOKENS)
  Given web/src/styles/tokens.css を本 BL の前後で diff を取る
  When  差分を観察する
  Then  差分が無い
```

```
シナリオ AC-16: WebRoutineRepository / Repository API / RoutineConflictError は無改修 (NFR-COMPAT)
  Given web/src/repositories/routine-repository.ts を本 BL の前後で diff を取る
  When  差分を観察する
  Then  WebRoutineRepository / UpdateRoutineCommand / RoutineConflictError の export 型に差分が無い
   かつ <PriorityStars /> 本体 (priority-stars.tsx / priority-stars.css) に差分が無い
```

```
シナリオ AC-17: BL-068 / BL-061 / BL-040 既存テスト全件 green (追従修正後)
  Given /routines が引き続きレンダリング可能
  When  ルートから npm test (vitest 全件) を実行する
  Then  すべて green である
   かつ BL-068 routine-card-edit-fields.test.tsx の追従修正後の assertion が green である
   かつ BL-061 routine-card-component.test.tsx の追従修正後の assertion が green である
   かつ BL-040 priority-stars.test.tsx は無修正で green である
```

```
シナリオ AC-18: 既存 E2E 全件 green (追従修正後)
  Given Playwright が起動可能
  When  npx playwright test を実行する
  Then  すべて green である
   かつ e2e/routines.spec.ts (BL-026 / BL-068) は無修正で green である (= 既存編集フローは name のみで優先度操作なし想定)
   かつ e2e/routine-card-edit-fields.spec.ts (BL-068) は無修正で green である
   かつ 新規 e2e/routine-card-edit-priority.spec.ts が green である (= 編集モードでの優先度変更フロー)
   かつ e2e/a11y.spec.ts の /routines スキャンが violations 0 件である
```

```
シナリオ AC-19: BL-068 spec の D-011 を本 BL で逆転した記録が残っている (G-7 / REQ-5)
  Given docs/developer/features/routine-card-edit-fields/spec.md を開いた
  When  D-011 節を観察する
  Then  「BL-069 で逆転」または「routine-card-edit-priority で逆転」の言及が追記されている
   かつ 本 BL (routine-card-edit-priority) の spec.md へのリンクが存在する
```

```
シナリオ AC-20: アクセシビリティ違反 0 件を維持する (NFR-A11Y)
  Given /routines をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts)
  Then  すべてのスキャンで violations.length === 0
   かつ 編集モードに遷移して PriorityStars を含む状態でスキャンしても violations.length === 0
```

```
シナリオ AC-21: 編集モードと起票モードの PriorityStars が同時に DOM に出現しても id が衝突しない (G-6 / NFR-IDPREFIX-DISJOINT)
  Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="normal", version=1) が 1 件存在する
  When  「変更」 button を click し editing モードへ遷移する
  Then  起票カード側 PriorityStars の radio button id は "routine-create-..." prefix で始まる
   かつ 編集カード側 PriorityStars の radio button id は "routine-edit-..." prefix で始まる
   かつ 同一 id を持つ radio button は存在しない (document.querySelectorAll で id 重複 0 件)
```

```
シナリオ AC-22: BL-068 確定の name 変更 / 曜日変更経路が引き続き維持されている
  Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="normal", version=1) が 1 件存在する
  When  「変更」 button を click し editing モードへ遷移する
   かつ name を "B" / 曜日を [1, 2] / 優先度を "highest" に変更する
   かつ 「保存」 button を click する
  Then  updateMutation.mutateAsync が { id, ifMatch: 1, name: "B", daysOfWeek: [1, 2], defaultPriority: "highest" } で 1 回呼ばれる
   かつ name / daysOfWeek / defaultPriority の 3 フィールドすべてが PATCH に乗る
```

```
シナリオ AC-23: BL-068 AC-25 の NFR-FORM-ARIA-LABEL-PRESERVE / NFR-DAY-LABEL-PRESERVE / NFR-NAME-INPUT-PRESERVE が引き続き満たされる
  Given /routines を render する
  When  作成 form / 編集 form を観察する
  Then  作成 form の aria-label は「ルーティン作成フォーム」である
   かつ 編集 form の aria-label は「ルーティン名称変更フォーム」である
   かつ 編集 form 内の曜日 7 個の label テキスト (日〜土) が維持されている
   かつ 編集 form 内の name input に placeholder="ルーティン名" と visually-hidden label「ルーティン名」が維持されている
```

## 重要な決定 (D 章)

- **D-001 (編集モードの DOM 順 / input → 曜日 → 優先度 → 保存 → キャンセル)**:
  - 候補:
    - (i) `input → 曜日 → 優先度 → 保存 → キャンセル` (= BL-068 D-005 「入力 → 操作の自然順」を優先度追加で素直に拡張).
    - (ii) `input → 優先度 → 曜日 → 保存 → キャンセル` (= 起票側 `<RoutineFormCard>` の段順「曜日 → 優先度」の逆順は混乱を招く).
    - (iii) `input → 曜日 → 保存 → キャンセル → 優先度` (= 既存末尾追加.キャンセルの右に優先度がぶら下がる視覚順は不自然).
  - 採用: (i). 理由:
    - BL-068 D-005 で確定した「input → 曜日 → 保存 → キャンセル」の中の「曜日」の直後に「優先度」を挿入する形にすると, 起票側 `<RoutineFormCard>` の 2 段目 row 「曜日チェックボックス群 → PriorityStars」 (BL-068 D-009) と同じ「曜日 → 優先度」順になり, ユーザの認知負荷が最小.
    - Tab フォーカス順も「name 入力 → 曜日 → 優先度 → 保存 / キャンセル」と直感的.
    - 編集 form 全体の `.routine-card__form-inline { display: flex; align-items: center; gap }` で flex 横並びに乗る (曜日 + PriorityStars が 1 段に並ばない場合は wrap される / D-007 / R-001).

- **D-002 (`<PriorityStars />` の groupLabel と idPrefix / `idPrefix="routine-edit"`)**:
  - `groupLabel="優先度"` を渡す. BL-040 REQ-4 / D-002 により radiogroup の aria-label は「優先度: ○○」 (現在値) の形式で組み立てられる. 起票側 `<RoutineFormCard>` の `groupLabel="優先度"` (BL-068 D-002) と同じ.
  - `idPrefix="routine-edit"` を渡す. 起票側 `idPrefix="routine-create"` (BL-068 D-002) と区別することで, 編集モード遷移時に DOM 上に「起票カードの PriorityStars」と「編集カードの PriorityStars」が同時に存在する状態でも radio button の id が衝突しない (NFR-IDPREFIX-DISJOINT / AC-21).
  - 候補として `idPrefix="routine-edit-${routine.id}"` (routine 単位で動的に分ける) もあったが, 同時に編集可能なのは 1 件のみ (editingId は 1 つの routine しか持てない) のため不要 / 過剰. 静的な `"routine-edit"` で十分.

- **D-003 (`editingDefaultPriority` の親 / 子の責務分担)**:
  - 候補:
    - (i) 親 (`routines-view.tsx`) が state を持ち, `<RoutineCard>` に props 経由で値とハンドラを渡す.
    - (ii) `<RoutineCard>` 内部で local state として保持 (= BL-061 / BL-068 までの BLoB と異なる方針).
  - 採用: (i). 理由:
    - BL-068 で `editingDaysOfWeek` を同じく親に上げる方針 (D-004 / D-006) で確定済み. 名称と曜日と一貫させる.
    - `handleSaveEdit` で `defaultPriority` を `updateMutation.mutateAsync` に送る必要があり, 親側に値を保持する設計が自然.
    - `<RoutineCard>` は presentational に徹し state 管理しない (BL-061 D-003 整合).

- **D-004 (`editingDefaultPriority` state の初期値 / `"normal"`)**:
  - 候補:
    - (i) `useState<Priority>("normal")` (= 起票側 `newDefaultPriority` の初期値 `"normal"` と同じ).
    - (ii) `useState<Priority | null>(null)` (= 編集モード未遷移を null で表現).
    - (iii) `useState<Priority>("highest")` (= 任意の Priority 値).
  - 採用: (i). 理由:
    - `openEdit(routine)` で必ず `setEditingDefaultPriority(routine.defaultPriority)` で上書きされる前提のため初期値の意味は薄い.
    - ただし type 上 `Priority` (= "highest" | "normal" | "later") は null を含まないため `null` 初期値は型エラー. (ii) は不採用.
    - 起票側の `newDefaultPriority` と同じ `"normal"` で揃えるとコード上の読み手の理解が早い.
    - `cancelEdit()` でも `"normal"` にリセット (D-005).

- **D-005 (`cancelEdit()` での editingDefaultPriority のリセット / `"normal"` に戻す)**:
  - 候補:
    - (i) `setEditingDefaultPriority("normal")` (= 初期値と同じ).
    - (ii) `setEditingDefaultPriority(routine.defaultPriority)` (= cancel 時点の routine の値に戻す).
    - (iii) 何もしない (= editingDefaultPriority は次回 openEdit で必ず上書きされるためリセット不要).
  - 採用: (i). 理由:
    - 既存の `cancelEdit` で `setEditingName("")` / `setEditingDaysOfWeek([])` (BL-068) も「初期値様の値」にリセットしている. 整合性のため `setEditingDefaultPriority("normal")` も初期値様の値にリセットする.
    - 不採用案 (ii): cancelEdit の時点では `editingId` が `null` にリセットされた直後で `routine.defaultPriority` を取り出す経路がない.
    - 不採用案 (iii): 動作上は問題ないが「state が編集時の値を保持し続ける」のは debugging で混乱を招く.

- **D-006 (PriorityStars の onChange ハンドラ方式 / `setEditingDefaultPriority` 直渡し)**:
  - 候補:
    - (i) `onEditingDefaultPriorityChange={setEditingDefaultPriority}` (= 親の setter を直接渡す).
    - (ii) `onEditingDefaultPriorityChange={(next) => setEditingDefaultPriority(next)}` (= 関数 wrap).
  - 採用: (i). 理由:
    - BL-040 `<PriorityStars onChange: (next: Priority) => void>` のシグネチャと `useState<Priority>` の setter のシグネチャ `(next: Priority) => void` が一致するため直渡し可能.
    - BL-068 で `onEditingDaysOfWeekChange={setEditingDaysOfWeek}` と同じパターン.
    - boilerplate 最小.

- **D-007 (CSS 改修の最小化 / `routine-card.css` 無改修)**:
  - 編集モード form 内に新たに `<PriorityStars />` (= div[role="radiogroup"] + 3 個の button) が追加されるが, 専用 CSS は `<PriorityStars />` 本体 (`priority-stars.css` / BL-040) で完結している.
  - `routine-card.css` 内の `.routine-card__form-inline { display: flex; align-items: center; gap }` で PriorityStars も flex 横並びに乗る.
  - 視覚的に狭い画面で wrap した場合の追加 CSS (`.routine-card__form-inline { flex-wrap: wrap }` 等) は本 BL では追加しない (= BL-068 D-008 と同方針 / 必要なら別 BL).

- **D-008 (テスト方針)**:
  - 新規テストファイル `web/__tests__/routine-card-edit-priority.test.tsx` を作る.
    - (a) jsdom DOM レンダ (`<RoutineCard isEditing>` 単体): AC-1 / AC-2 / AC-3 / AC-5 / AC-6 / AC-11.
    - (b) jsdom DOM レンダ (結合 `<RoutinesView>` + stub): AC-2 / AC-4 / AC-7 / AC-8 / AC-9 / AC-21 / AC-22 / AC-23.
    - (c) 型定義の grep 系 (readFileSync): AC-10 / AC-11 / AC-12 / AC-13 / AC-19.
    - (d) 不変性 assert (readFileSync + git diff 代替): AC-14 / AC-15 / AC-16.
  - 既存テストの追従:
    - **`web/__tests__/routine-card-edit-fields.test.tsx` (BL-068)**:
      - `RoutineCardProps` interface 文字列 grep に `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange` を追加.
      - `<RoutineCard isEditing>` の DOM 順 assert (AC-11) を「label → input → div.day-checkboxes → 保存 → キャンセル」 → 「label → input → div.day-checkboxes → div[role="radiogroup"] → 保存 → キャンセル」に追従.
      - 結合 (`<RoutinesView>`) フローの `updateMutation` 引数型 assert (AC-17) に `defaultPriority` を追加.
      - 詳細な diff は plan.md / P-004.
    - **`web/__tests__/routine-card-component.test.tsx` (BL-061)**:
      - `RoutineCardProps` interface 文字列 grep に `editingDefaultPriority` 系を追加.
      - `<RoutineCard isEditing>` の DOM assert に `<PriorityStars />` 存在 (= `div[role="radiogroup"]`) を追加.
      - 詳細は plan.md / P-004.
    - **`docs/developer/features/routine-card-edit-fields/spec.md` (BL-068)**: D-011 節に「本 BL (BL-069) で逆転」の注釈 1 行を追加 (REQ-5 / AC-19).
    - **`e2e/routines.spec.ts`**: 既存編集フローは name のみで優先度操作なし想定. grep で確認後, 修正不要なら無修正.
    - **`e2e/routine-card-edit-fields.spec.ts` (BL-068)**: 編集モードでの新たな PriorityStars 操作は無いので無修正で通る想定. 必要に応じて初期値 assert (= 編集モード遷移後に editingDefaultPriority が routine.defaultPriority で初期化) を追加.

- **D-009 (新規 E2E のスコープ)**:
  - 新規 `e2e/routine-card-edit-priority.spec.ts` を追加する.
  - シナリオ:
    - (a) 編集モードで PriorityStars が表示される (AC-1).
    - (b) 編集モードで優先度を変更 → 保存 → reload → 新しい優先度が `<PriorityStars />` 上で aria-checked="true" になる (AC-4 永続化).
    - (c) 名前のみ変更 (優先度操作なし) → 保存 → 優先度は変更前の値で送信される (AC-7).
    - (d) `<PriorityStars />` の id が起票側と衝突しない (AC-21).

- **D-010 (`UpdateRoutineCommand.defaultPriority?: string` の運用変更)**:
  - 既存 API は `defaultPriority?: string` で受理 (BL-017 / routine-repository.ts L30). 本 BL では editingDefaultPriority を必ず送る運用に変更 (optional → required 運用).
  - 既存サーバ側は `undefined` のときは patch されない動作 (= 部分 patch). 本 BL の運用では必ず送るため挙動変更は無い.
  - `Priority` 型 (`"highest" | "normal" | "later"`) は `string` の subtype のため repository 側無改修で透過に渡せる (BL-068 D-012 同様).

- **D-011 (PR 提出単位 / 単一 PR)**:
  - 単一 PR で完結させる. 影響範囲が極小 (= presentation 層 + view の state 拡張のみ).
  - BL-068 既存テストの追従修正と新規テスト追加を同 PR で行う.

- **D-012 (本 BL でのスコープ拡張の余地 / 拒否)**:
  - 「編集モードに『リセット』ボタンを追加」 → 別 BL. cancelEdit で十分.
  - 「編集モードに `<select>` 戻し」 → 採用しない. BL-068 で確定した `<PriorityStars />` 統一を継続.
  - 「`<RoutineCard>` の表示モードに `<PriorityStars />` を可視化 (= 一覧上で優先度を確認できるようにする)」 → 別 BL (`features/routine-card-priority-display/` 候補). 本 BL は編集経路の対称化のみ.

- **D-013 (`<PriorityStars />` 配置位置の代替案検討と却下)**:
  - 候補:
    - (i) 編集 form 内の曜日 div の直後 / 保存 button の直前 (= D-001 採用).
    - (ii) 編集 form の外側に別 row として配置 (= `.routine-card__form-inline` を別の 2 段構成にする).
    - (iii) 編集 form の最上段 (= name input の前).
  - 採用: (i). 理由:
    - 起票側 `<RoutineFormCard>` の 2 段目 row の DOM 順 「曜日 → PriorityStars」 (BL-068 D-009) と同じ並び順.
    - 編集 form を 1 行 flex のままにできる (= `.routine-card__form-inline` を 2 段化する CSS 改修が不要).
  - 不採用案 (ii): CSS 改修が必要で NFR-NO-NEW-CSS-RULES に反する.
  - 不採用案 (iii): name input の前に「優先度」が来るのは UX 上不自然.

## 未決事項 / 確認待ち

- なし (D-001 〜 D-013 で本 BL の判断軸はすべて確定. 詳細な追従マッピングと PR 提出単位は plan.md / tasks.md で確定).
