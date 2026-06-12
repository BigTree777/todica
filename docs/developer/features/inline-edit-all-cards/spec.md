# 仕様: 全カード (Task / Project / Routine) のインライン常時編集化 (inline-edit-all-cards)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-070
  - 依存 BL:
    - BL-042 (task-card-actions) — 「編集」 button 撤去. spec 内で「代替 UI は別 BL で扱う」と明言した経路の本実装.
    - BL-059 (task-card-component) — `<TaskCard>` / `<TaskFormCard>` ペア. 本 BL は TaskCard 表示に input を恒常配置するため API 拡張.
    - BL-060 (project-card-component) — `<ProjectCard>` / `<ProjectFormCard>`. 本 BL で `isEditing` 系 props を全撤去.
    - BL-061 (routine-card-component) — `<RoutineCard>` / `<RoutineFormCard>`. 本 BL で `isEditing` / `editing*` 系 props を全撤去.
    - BL-068 (routine-card-edit-fields) — 編集モードでの曜日変更 / 優先度 PriorityStars 化. 本 BL で「編集モード」概念ごと撤去するため上位の方針転換となる.
    - BL-069 (routine-card-edit-priority) — 編集モードでの優先度変更. 本 BL で同上.
    - BL-031 (web-error-handling) — `ConflictDialog` 経路.
    - BL-034 (error-notification) — `notifyError` 経路.
    - BL-016 (project-crud) / BL-017 (routine) — 既存 PATCH endpoint. 本 BL では API 無改修.
  - 関連 feature:
    - [`../task-card-actions/spec.md`](../task-card-actions/spec.md) (BL-042) — 「編集」 button 撤去 / 「代替経路は別 BL」と明記された箇所.
    - [`../task-card-component/spec.md`](../task-card-component/spec.md) (BL-059) — `<TaskCard>` の 3 段ゾーン.
    - [`../project-card-component/spec.md`](../project-card-component/spec.md) (BL-060) — ProjectCard の `isEditing` 採用方針.
    - [`../routine-card-component/spec.md`](../routine-card-component/spec.md) (BL-061) — RoutineCard の `isEditing` 採用方針.
    - [`../routine-card-edit-fields/spec.md`](../routine-card-edit-fields/spec.md) (BL-068) — 編集モードでの曜日 / PriorityStars.
    - [`../routine-card-edit-priority/spec.md`](../routine-card-edit-priority/spec.md) (BL-069) — 編集モードでの優先度.
  - 上位要件: NFR-010 (一貫した UI / 最小手数).
  - 関係しない feature: 共通 button (BL-067) / form 起票カード (TaskFormCard / ProjectFormCard / RoutineFormCard) / domain / server API / focus-view の actions.

## 背景 / 課題

user 要求: **「編集は常に可能にしたい. これはすべてのカードで共通. 変更ボタンは不要」**.

現状, 全 3 系統 (Task / Project / Routine) のカードで「編集」体験が一貫していない:

### TaskCard (BL-059)

- 表示は `<span>{task.name}</span>` のみ (= 編集経路なし).
- 名称編集は BL-042 で「編集」 button が撤去された際に「代替 UI は別 BL で扱う想定」と明言されていたが, **代替経路は未実装**. 結果として **タスク名は変更不能** (= 起票時のみ確定).
- 優先度 `<PriorityStars />` は即時 PATCH 済 (= BL-040).

### ProjectCard (BL-060)

- 表示モード: `<span>{project.name}</span>` + 「変更」「削除」 button.
- 編集モード (`isEditing=true`): `<input>` + 「保存」「キャンセル」 button.
- isEditing 切替 + 3 button (変更 / 保存 / キャンセル) で UI 操作が多い.

### RoutineCard (BL-061 / BL-068 / BL-069)

- 表示モード: `<span>{routine.name}</span>` + 曜日表示 (read-only) + 「変更」「削除」 button.
- 編集モード: name input + 曜日 checkbox 7 個 + PriorityStars + 「保存」「キャンセル」.
- 編集モードでだけ曜日と PriorityStars が現れる. ユーザは曜日 1 つ変えるためにも「変更 → 編集モード → 保存」の 3 操作が必要.

### user 要求の本旨

**全 3 系統のカードで「編集モード」概念を撤去し, 表示モードのまま全フィールドを直接編集可能にする**.
これに合わせて「変更 / 保存 / キャンセル」 button をすべて撤去する.

### 採用方針 (user と合意済み)

1. **「編集モード」概念の撤去**:
   - `isEditing` prop / `editing*` 系 prop / `openEdit` / `cancelEdit` / `handleSaveEdit` を全撤去.
   - 「変更」「保存」「キャンセル」 button をすべて撤去.

2. **保存タイミング: 案 e (フィールドの性質で分岐)**:
   - **状態系フィールド (即時 PATCH)**: 曜日 checkbox / 優先度 PriorityStars.
     - 既に TaskCard の PriorityStars は即時 PATCH. RoutineCard の曜日 / PriorityStars も同流儀に統一.
     - 理由: click 1 回で値が確定するため即時送信が UX 上自然 (連打懸念は実質ない).
   - **テキストフィールド (blur で PATCH)**: name input.
     - 理由: 1 文字ごとに PATCH するのは API 負荷 / UX 共に問題. blur 経路が標準的.

## ゴール / 非ゴール

### ゴール

- **G-1 (TaskCard 表示で name の常時編集)**:
  `<TaskCard>` の `task-card__title` 内 `<span>{task.name}</span>` を `<input value={task.name} onBlur={...} />` に置換する. blur 時に `onNameBlur(next)` を呼ぶ.

- **G-2 (ProjectCard の編集モード撤去)**:
  `<ProjectCard>` から `isEditing` / `editingName` / `onEditingNameChange` / `onStartEdit` / `onCancelEdit` / `onSaveEdit` の 6 prop を撤去. 表示時に常に `<input value={project.name} onBlur={...} />` を描画. 「変更」「保存」「キャンセル」 button を全撤去. 「削除」 button のみ残す. 新 prop `onNameBlur` を追加.

- **G-3 (RoutineCard の編集モード撤去)**:
  `<RoutineCard>` から `isEditing` / `editingName` / `onEditingNameChange` / `editingDaysOfWeek` / `onEditingDaysOfWeekChange` / `editingDefaultPriority` / `onEditingDefaultPriorityChange` / `onStartEdit` / `onCancelEdit` / `onSaveEdit` の 10 prop を撤去. 表示時に常に `<input value={routine.name} onBlur={...} />` + 7 曜日 checkbox + PriorityStars を描画. 「変更」「保存」「キャンセル」 button を全撤去. 「削除」 button のみ残す. 新 prop `onNameBlur` / `onDaysOfWeekChange` / `onDefaultPriorityChange` を追加.

- **G-4 (即時 PATCH と blur PATCH の分離)**:
  - 即時 PATCH: 曜日 checkbox click / PriorityStars click.
  - blur PATCH: name input.
  - いずれも実値変更時のみ PATCH を送る (= 同値 blur は no-op / D-001).

- **G-5 (views の handler 再設計)**:
  - `projects-view.tsx` から `editingId` / `editingName` / `openEdit` / `cancelEdit` / `handleSaveEdit` state / handler を撤去. `<ProjectCard>` に `onNameBlur` を渡す.
  - `routines-view.tsx` から `editingId` / `editingName` / `editingDaysOfWeek` / `editingDefaultPriority` / `openEdit` / `cancelEdit` / `handleSaveEdit` state / handler を撤去. `<RoutineCard>` に `onNameBlur` / `onDaysOfWeekChange` / `onDefaultPriorityChange` を渡す.
  - `today-view.tsx` / `tomorrow-view.tsx` / `focus-view.tsx` で `<TaskCard>` に `onNameBlur` を渡す.

- **G-6 (空文字 blur の扱い)**:
  空文字 blur は **元値復元** とする. PATCH は送らず, 直前の値を input に書き戻す (= UI 上の自動巻き戻し). 詳細は D-002.

- **G-7 (conflict ハンドリングの維持)**:
  blur 経由 PATCH でも既存の `ConflictDialog` 経路を流用する. 名称変更の 412 は各 view の `updateMutation` の `OptimisticLockError` 変換に同居する (= 「変更」 button 経由と同じ経路で動く).

- **G-8 (起票カードは無改修)**:
  `<TaskFormCard>` / `<ProjectFormCard>` / `<RoutineFormCard>` は無改修. 「追加」 button は維持 (= 新規作成は submit が必要).

- **G-9 (focus-view の振る舞い維持)**:
  `<TaskCard variant="focus" actionSet="minimal">` でも name input は出る (= 名称編集経路はある). actions は「削除」「完了」の 2 ボタンを維持. BL-037 (focus-view) の actions 制約と本 BL の「name input 常時表示」は独立.

- **G-10 (BL-042 の「代替経路は別 BL」を本 BL が実装で履行)**:
  BL-042 spec で言及されていた「タスク名編集の代替経路」は本 BL が提供する. BL-042 spec に注釈 1 行を追記する (= R-001).

- **G-11 (a11y 違反 0 件維持)**:
  `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持する.

- **G-12 (1 PR でまとめる)**:
  3 系統横断の API 変更が連動するため, 1 PR でまとめて提出する (= 採用案 α). spec / plan / tasks にも明示.

### 非ゴール

- **TaskFormCard / ProjectFormCard / RoutineFormCard (起票カード) の改修**: 無改修. 「追加」 button は維持.
- **domain / server / API の変更**: 既存 PATCH endpoint をそのまま使う. ドメイン値 / Repository インターフェイス無改修.
- **共通 button スタイル (BL-067)**: 別 BL.
- **`ConflictDialog` / `notifyError` の仕組み変更**: 維持 (= 412 / 401 経路は既存通り).
- **focus-view (`/focus`) の actions 拡張**: 「削除」「完了」の 2 ボタン制約は維持 (= BL-037 / BL-059 actionSet="minimal").
- **新規の保存ボタン経路 / 「変更を保存」モーダル等の追加 UI**: 出さない.
- **routine の `daysOfWeek = []` の運用変更**: 既存 routines-view の「曜日 0 件 = silent return」を維持.
- **デザイントークン / tokens.css の改修**: 触らない.
- **shadow / hover / transition / animation の追加**: しない.

## 要件

### 機能要件

- **REQ-1 (`<TaskCard>` の name input 常時表示)**

  `web/src/ui/task-card/task-card.tsx` の `task-card__title` 内を以下のように変更する:

  ```jsx
  <div className="task-card__title">
    <input
      type="text"
      value={task.name}
      onBlur={(e) => onNameBlur(e.target.value)}
      aria-label={`${task.name} の名前`}
    />
  </div>
  ```

  - prop 追加: `onNameBlur: (next: string) => void` を **必須** prop として `TaskCardProps` に追加.
  - 既存 prop (variant / showPriority / showSetFocus / actionSet / dueDateMode / onSetPriority / onSetFocus / onDelete / onToggleDueDate / onComplete / as / aria-label) は全て維持.
  - PriorityStars (BL-040) は既に即時 PATCH (`onChange` で `onSetPriority` 経由). 本 BL では無改修.

- **REQ-2 (`<ProjectCard>` の編集モード撤去 + name input 常時表示)**

  `web/src/ui/project-card/project-card.tsx` を以下のように再設計する:

  - prop 撤去 (6 件):
    - `isEditing: boolean`
    - `editingName: string`
    - `onEditingNameChange: (next: string) => void`
    - `onStartEdit: () => void`
    - `onCancelEdit: () => void`
    - `onSaveEdit: (e: React.FormEvent) => void`
  - prop 追加 (1 件):
    - `onNameBlur: (next: string) => void` (必須).
  - prop 維持: `project: Project` / `onDelete: () => void` / `as?: "li" | "div"`.
  - 出力 DOM:

    ```html
    <li class="project-card">
      <label htmlFor="project-name-{project.id}" class="visually-hidden">プロジェクト名</label>
      <input
        id="project-name-{project.id}"
        type="text"
        class="project-card__input"
        value={project.name}
        placeholder="プロジェクト名"
      />
      <div class="project-card__actions">
        <button type="button" class="project-card__actions__delete">削除</button>
      </div>
    </li>
    ```

  - 「変更」 button は撤去. `.project-card__actions__edit` セレクタも撤去.
  - 編集 form (`<form aria-label="プロジェクト名称変更フォーム">`) / 「保存」「キャンセル」 button は撤去.
  - `.project-card--editing` modifier も撤去.
  - `<span class="project-card__name">` は撤去 (= input が常時表示でその役割を兼ねる).

- **REQ-3 (`<RoutineCard>` の編集モード撤去 + 全フィールド常時編集)**

  `web/src/ui/routine-card/routine-card.tsx` を以下のように再設計する:

  - prop 撤去 (10 件):
    - `isEditing`
    - `editingName` / `onEditingNameChange`
    - `editingDaysOfWeek` / `onEditingDaysOfWeekChange`
    - `editingDefaultPriority` / `onEditingDefaultPriorityChange`
    - `onStartEdit` / `onCancelEdit` / `onSaveEdit`
  - prop 追加 (3 件):
    - `onNameBlur: (next: string) => void` (必須).
    - `onDaysOfWeekChange: (next: number[]) => void` (必須 / 即時 PATCH 経路).
    - `onDefaultPriorityChange: (next: Priority) => void` (必須 / 即時 PATCH 経路).
  - prop 維持: `routine: WebRoutine` / `onDelete: () => void` / `as?: "li" | "div"`.
  - 出力 DOM:

    ```html
    <li class="routine-card">
      <div class="routine-card__main">
        <label htmlFor="routine-name-{routine.id}" class="visually-hidden">ルーティン名</label>
        <input
          id="routine-name-{routine.id}"
          type="text"
          class="routine-card__input"
          value={routine.name}
          placeholder="ルーティン名"
        />
        <div class="routine-card__day-checkboxes" role="group" aria-label="曜日">
          <label><input type="checkbox" checked={routine.daysOfWeek.includes(0)} />日</label>
          <label><input type="checkbox" checked={routine.daysOfWeek.includes(1)} />月</label>
          ... (火 〜 土 同様, 計 7 個)
        </div>
        <PriorityStars
          value={routine.defaultPriority}
          onChange={onDefaultPriorityChange}
          groupLabel={`${routine.name} の優先度`}
          idPrefix={`routine-${routine.id}`}
        />
      </div>
      <div class="routine-card__actions">
        <button type="button" class="routine-card__actions__delete">削除</button>
      </div>
    </li>
    ```

  - 「変更」 button は撤去. `.routine-card__actions__edit` セレクタも撤去.
  - 編集 form (`<form aria-label="ルーティン名称変更フォーム">`) / 「保存」「キャンセル」 button は撤去.
  - `.routine-card--editing` / `.routine-card__form-inline` modifier も撤去.
  - 曜日 read-only 表示用の `.routine-card__days-label` は撤去 (= checkbox が常時表示でその役割を兼ねる).
  - PriorityStars の `idPrefix` は `routine-${routine.id}` で 1 ルーティン 1 prefix とし起票側 (`routine-create`) との衝突を回避.

- **REQ-4 (即時 PATCH のフィールド)**

  - **TaskCard PriorityStars**: 既存 (BL-040) のとおり `onChange` → `onSetPriority` 即時 PATCH を維持. 本 BL では無改修.
  - **RoutineCard 曜日 checkbox**: click 1 回ごとに `onDaysOfWeekChange(next)` を呼び, 親 view が `updateMutation.mutateAsync({ ..., daysOfWeek: next })` を即時実行する.
  - **RoutineCard PriorityStars**: click 1 回ごとに `onDefaultPriorityChange(next)` を呼び, 親 view が `updateMutation.mutateAsync({ ..., defaultPriority: next })` を即時実行する.

- **REQ-5 (blur PATCH のフィールド)**

  - **TaskCard name**: input の `onBlur` で `onNameBlur(next)` を呼び, 親 view が **実値変更時のみ** `updateMutation.mutateAsync({ id, ifMatch, patch: { name: next } })` を実行する (D-001).
  - **ProjectCard name**: 同上.
  - **RoutineCard name**: 同上.

- **REQ-6 (実値変更時のみ PATCH / D-001)**

  - blur 時, input の現在値が `task.name` / `project.name` / `routine.name` と **同一** なら PATCH を送らない.
  - 実装の責務分担:
    - カードコンポーネント (TaskCard / ProjectCard / RoutineCard) は **常に** `onNameBlur(next)` を呼ぶ (= 比較しない).
    - 親 view (today / tomorrow / focus / projects / routines) の handler が `if (next === current) return;` で短絡する.
  - 理由: コンポーネント側で抑制すると親が「来ない」前提を持つ必要があり, 将来の経路追加に弱い. 抑制ロジックは「現値を知っている」親側に置く.

- **REQ-7 (空文字 blur の扱い / D-002)**

  - 空文字 ("") での blur は **元値復元** とする:
    - PATCH は送らない.
    - input の DOM 表示は React の再描画で `value={entity.name}` (= 元値) に戻る (= 親 state は変えていないため自動的に元値が表示される).
  - 理由: 「常時編集可能」は user 要求だが, domain では `name` が空文字を許さない. user が誤って全消ししても損失せず復元される UX が安全.
  - エラーバナー / トースト等の通知は出さない (= 静かな元値復元).

- **REQ-8 (conflict 412 のハンドリング / D-003)**

  - blur 経路 PATCH の `OptimisticLockError` は既存の各 view `updateMutation` の `onError` で `ConflictError` に変換され `ConflictDialog` が開く (BL-031 / BL-033).
  - ProjectConflictError / RoutineConflictError の経路も同様.
  - blur 中に conflict が出てもユーザ操作 (= フォーカスを別の場所に移しただけ) でダイアログが開くことになる. UX 上は「変更」 button 押下時と同等.

- **REQ-9 (各 view の handler 再設計)**

  - **projects-view.tsx**:
    - state 撤去: `editingId` / `editingName`.
    - handler 撤去: `openEdit` / `cancelEdit` / `handleSaveEdit`.
    - handler 新設: `handleNameBlur(project, next)` (実値変更時のみ `updateMutation`).
    - JSX 変更: `<ProjectCard>` に `isEditing` / `editingName` / `onEditingNameChange` / `onStartEdit` / `onCancelEdit` / `onSaveEdit` を渡さない. 代わりに `onNameBlur={(next) => handleNameBlur(project, next)}` を渡す.

  - **routines-view.tsx**:
    - state 撤去: `editingId` / `editingName` / `editingDaysOfWeek` / `editingDefaultPriority`.
    - handler 撤去: `openEdit` / `cancelEdit` / `handleSaveEdit`.
    - handler 新設:
      - `handleNameBlur(routine, next)` (実値変更時のみ `updateMutation`).
      - `handleDaysOfWeekChange(routine, next)` (即時 `updateMutation`).
      - `handleDefaultPriorityChange(routine, next)` (即時 `updateMutation`).
    - JSX 変更: `<RoutineCard>` に旧 `editing*` 系を渡さない. 代わりに `onNameBlur` / `onDaysOfWeekChange` / `onDefaultPriorityChange` を渡す.

  - **today-view.tsx / tomorrow-view.tsx / focus-view.tsx**:
    - 既存の `handleSetPriority(task, next)` (= updateMutation 経由) と同じ流儀で `handleNameBlur(task, next)` を新設.
    - 各 `<TaskCard>` に `onNameBlur={(next) => handleNameBlur(task, next)}` を追加.
    - focus-view では `actionSet="minimal"` でも name input は出る (= G-9).

- **REQ-10 (起票カード TaskFormCard / ProjectFormCard / RoutineFormCard の無改修)**

  - これらは既に input + 「追加」 button 構造で submit 駆動. 本 BL では一切触らない.
  - 既存テストはこれらが無改修であることを assert する.

- **REQ-11 (BL-042 spec への注釈追記 / G-10)**

  - `docs/developer/features/task-card-actions/spec.md` の「編集機能の代替 UI」記述箇所 (例: 「## ゴール / 非ゴール § 非ゴール § 編集操作の代替 UI の提供」または「未決事項 U-4」) に以下の注釈を 1 行追加する:

    > **BL-070 (inline-edit-all-cards) で逆転**: 本 spec で「別 BL で扱う」と明言したタスク名編集の代替経路は BL-070 で TaskCard の name input 常時表示として提供された.

  - その他, 関連 BL の spec への注釈はスコープ最小化のため本 BL では行わない (= D-005 で確定).

### 非機能要件

- **NFR-A11Y**: `e2e/a11y.spec.ts` の 7 view (today / tomorrow / focus / projects / routines / trash / settings) で WCAG 2.1 AA violations 0 件を維持する.
- **NFR-NO-NEW-TOKENS**: `tokens.css` を変更しない.
- **NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION**: 新規 CSS でも追加しない.
- **NFR-COMPAT**: domain / server / Repository / Mutation の引数構成は無改修.
- **NFR-PRESERVE-FORM-CARDS**: TaskFormCard / ProjectFormCard / RoutineFormCard は無改修.
- **NFR-PRESERVE-CONFLICT-DIALOG**: ConflictDialog / `useConflictDialog` / `mapConflict` / `notifyError` 経路は無改修.
- **NFR-A11Y-LABEL**: 全 input は `<label htmlFor>` (visually-hidden 可) または `aria-label` で関連付けを持つ.
- **NFR-NO-IMMEDIATE-NAME-PATCH**: name は blur 経路のみで PATCH する. 1 文字ごとの即時 PATCH は禁止する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` (vitest 単体) と `npx playwright test` (E2E) を基準とする.

```
シナリオ AC-1: TaskCard 表示で name input が常時表示される
  Given <TaskCard task={...} onNameBlur={...} ... /> を render する
  When  出力 DOM を観察する
  Then  task-card__title 内に <input type="text"> が 1 個存在する
   かつ input の value 属性が task.name と一致する
   かつ <span>{task.name}</span> 要素は存在しない (= input が span を置換)
```

```
シナリオ AC-2: TaskCard input の blur で onNameBlur が次の値で呼ばれる
  Given <TaskCard task={{...name: "古い"}} onNameBlur={spy} ... /> を render する
  When  input に "新しい" を入力し blur する
  Then  spy が 1 回 "新しい" を引数に呼ばれる
```

```
シナリオ AC-3: ProjectCard で「変更」「保存」「キャンセル」 button が存在しない
  Given <ProjectCard project={...} onNameBlur={...} onDelete={...} /> を render する
  When  ボタンを観察する
  Then  accessibleName が「変更」の button が存在しない
   かつ accessibleName が「保存」の button が存在しない
   かつ accessibleName が「キャンセル」の button が存在しない
   かつ accessibleName が「削除」の button が 1 個存在する
```

```
シナリオ AC-4: ProjectCard で name input が常時表示される
  Given <ProjectCard project={{id: "p1", name: "仕事"}} ... /> を render する
  When  出力 DOM を観察する
  Then  <input id="project-name-p1" type="text" value="仕事"> が存在する
   かつ <label class="visually-hidden" htmlFor="project-name-p1">プロジェクト名</label> が存在する
   かつ <form aria-label="プロジェクト名称変更フォーム"> は存在しない
```

```
シナリオ AC-5: ProjectCard input の blur で onNameBlur が呼ばれる
  Given <ProjectCard project={{name: "古い"}} onNameBlur={spy} ... /> を render する
  When  input に "新しい" を入力し blur する
  Then  spy が 1 回 "新しい" を引数に呼ばれる
```

```
シナリオ AC-6: RoutineCard で「変更」「保存」「キャンセル」 button が存在しない
  Given <RoutineCard routine={...} onNameBlur={...} onDaysOfWeekChange={...}
                     onDefaultPriorityChange={...} onDelete={...} /> を render する
  When  ボタンを観察する
  Then  accessibleName が「変更」の button が存在しない
   かつ accessibleName が「保存」の button が存在しない
   かつ accessibleName が「キャンセル」の button が存在しない
   かつ accessibleName が「削除」の button が 1 個存在する
```

```
シナリオ AC-7: RoutineCard で name input + 曜日 checkbox 7 個 + PriorityStars が常時表示される
  Given <RoutineCard routine={{id: "r1", name: "朝散歩", daysOfWeek: [1,2,3],
                              defaultPriority: "normal"}} ... /> を render する
  When  出力 DOM を観察する
  Then  <input id="routine-name-r1" type="text" value="朝散歩"> が存在する
   かつ <div role="group" aria-label="曜日"> 内に <input type="checkbox"> が 7 個存在する
   かつ 曜日 1 (月) / 2 (火) / 3 (水) の checkbox が checked である
   かつ 曜日 0 (日) / 4 (木) / 5 (金) / 6 (土) の checkbox が unchecked である
   かつ PriorityStars (role=radiogroup aria-label を含む "優先度") が存在する
   かつ <form aria-label="ルーティン名称変更フォーム"> は存在しない
```

```
シナリオ AC-8: RoutineCard 曜日 click で即時 onDaysOfWeekChange が呼ばれる
  Given <RoutineCard routine={{daysOfWeek: [1,2]}} onDaysOfWeekChange={spy} ... /> を render する
  When  曜日 "水" (= day 3) の checkbox を click する
  Then  spy が 1 回 [1, 2, 3] を引数に呼ばれる
   かつ 「保存」 button 押下を経由しない (= 即時)
```

```
シナリオ AC-9: RoutineCard PriorityStars click で即時 onDefaultPriorityChange が呼ばれる
  Given <RoutineCard routine={{defaultPriority: "normal"}} onDefaultPriorityChange={spy} ... /> を render する
  When  PriorityStars の "highest" 相当の radio を click する
  Then  spy が 1 回 "highest" を引数に呼ばれる
   かつ 「保存」 button 押下を経由しない (= 即時)
```

```
シナリオ AC-10: RoutineCard input の blur で onNameBlur が呼ばれる
  Given <RoutineCard routine={{name: "古い"}} onNameBlur={spy} ... /> を render する
  When  input に "新しい" を入力し blur する
  Then  spy が 1 回 "新しい" を引数に呼ばれる
```

```
シナリオ AC-11: 起票カード TaskFormCard / ProjectFormCard / RoutineFormCard は無改修である
  Given 本 BL の実装がマージされた
  When  task-form-card.tsx / project-form-card.tsx / routine-form-card.tsx を BL-069 完了時点と比較する
  Then  各ファイルの JSX / props / className に差分が無い
   かつ 「追加」 button が引き続き存在する
```

```
シナリオ AC-12: projects-view.tsx から isEditing 系 state / handler が撤去されている
  Given web/src/ui/projects-view/projects-view.tsx を開いた
  When  ファイル本文を観察する
  Then  state `editingId` の useState 宣言が存在しない
   かつ state `editingName` の useState 宣言が存在しない
   かつ handler `openEdit` / `cancelEdit` / `handleSaveEdit` の宣言が存在しない
   かつ <ProjectCard ... isEditing={...} /> 形式の使用が存在しない
   かつ <ProjectCard ... onNameBlur={...} /> 形式の使用が存在する
```

```
シナリオ AC-13: routines-view.tsx から isEditing 系 state / handler が撤去されている
  Given web/src/ui/routines-view/routines-view.tsx を開いた
  When  ファイル本文を観察する
  Then  state `editingId` / `editingName` / `editingDaysOfWeek` / `editingDefaultPriority` の useState 宣言が存在しない
   かつ handler `openEdit` / `cancelEdit` / `handleSaveEdit` の宣言が存在しない
   かつ <RoutineCard ... isEditing={...} /> 形式の使用が存在しない
   かつ <RoutineCard ... onNameBlur={...} onDaysOfWeekChange={...} onDefaultPriorityChange={...} /> 形式の使用が存在する
```

```
シナリオ AC-14: today-view / tomorrow-view / focus-view で TaskCard が onNameBlur prop を受け取る
  Given web/src/ui/today-view/today-view.tsx を開いた
   かつ web/src/ui/tomorrow-view/tomorrow-view.tsx を開いた
   かつ web/src/ui/focus-view/focus-view.tsx を開いた
  When  <TaskCard ... /> の利用箇所を観察する
  Then  すべての利用箇所で onNameBlur={...} が渡されている
   かつ today-view の handler に handleNameBlur(task, next) 相当の宣言がある
   かつ tomorrow-view の handler に同等の宣言がある
   かつ focus-view の handler に同等の宣言がある
```

```
シナリオ AC-15: 空文字 blur の扱い: 親 view の handler が空文字を拒否し PATCH を送らない (D-002)
  Given /projects を render する
   かつ プロジェクト P (name="仕事", version=1) が表示されている
  When  input の value を "" にして blur する
  Then  ProjectRepository.update が呼ばれない (= PATCH は送らない)
   かつ 入力欄の表示は再描画で "仕事" に戻る (元値復元)
```

```
シナリオ AC-16: 同値 blur の扱い: 親 view の handler が同値を拒否し PATCH を送らない (D-001)
  Given /projects を render する
   かつ プロジェクト P (name="仕事", version=1) が表示されている
  When  input の value を変えずに blur する (= 同値)
  Then  ProjectRepository.update が呼ばれない
```

```
シナリオ AC-17: 実値変更時の blur で PATCH が送られる
  Given /projects を render する
   かつ プロジェクト P (name="仕事", version=1) が表示されている
  When  input の value を "学習" に変更し blur する
  Then  ProjectRepository.update が { id: P.id, ifMatch: 1, name: "学習" } で 1 回呼ばれる
```

```
シナリオ AC-18: RoutineCard 曜日 click で updateMutation が即時呼ばれる
  Given /routines を render する
   かつ ルーティン R (name="朝散歩", daysOfWeek=[1,2], defaultPriority="normal", version=1) が表示されている
  When  曜日 "水" (day=3) の checkbox を click する
  Then  RoutineRepository.update が { id: R.id, ifMatch: 1,
                                      daysOfWeek: [1,2,3] } を含む引数で 1 回呼ばれる
```

```
シナリオ AC-19: RoutineCard PriorityStars click で updateMutation が即時呼ばれる
  Given /routines を render する
   かつ ルーティン R (defaultPriority="normal", version=1) が表示されている
  When  PriorityStars の "highest" radio を click する
  Then  RoutineRepository.update が { id: R.id, ifMatch: 1,
                                      defaultPriority: "highest" } を含む引数で 1 回呼ばれる
```

```
シナリオ AC-20: 412 conflict 時に ConflictDialog が開く (blur 経由)
  Given /projects を render する
   かつ サーバ側で別タブが P の version を 2 に進めた
   かつ ローカル側はまだ P.version=1 と認識している
  When  input の value を "学習" に変更し blur する (= updateMutation 412 → ProjectConflictError)
  Then  ConflictDialog が開く (既存 BL-031 / BL-033 経路)
   かつ notifyError は呼ばれない
```

```
シナリオ AC-21: BL-042 spec に「BL-070 で逆転」注釈が 1 行追記されている (R-001)
  Given docs/developer/features/task-card-actions/spec.md を開いた
  When  ファイル本文を観察する
  Then  「BL-070 (inline-edit-all-cards) で逆転」または等価表現を含む行が少なくとも 1 行存在する
   かつ 注釈は「タスク名編集の代替経路」または「編集機能の代替 UI」の文脈にある
```

```
シナリオ AC-22: アクセシビリティ違反 0 件を維持する (NFR-A11Y)
  Given /today, /tomorrow, /focus, /projects, /routines, /trash, /settings がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする
  Then  すべての view で violations.length === 0
```

```
シナリオ AC-23: tokens.css / Repository / Mutation の API が無改修である
  Given 本 BL の実装がマージされた
  When  web/src/styles/tokens.css を BL-069 完了時点と比較する
   かつ web/src/repositories/project-repository.ts を比較する
   かつ web/src/repositories/routine-repository.ts を比較する
   かつ web/src/repositories/task-repository.ts を比較する
  Then  tokens.css に差分が無い
   かつ Repository の interface に差分が無い (Mutation 関数シグネチャは無改修)
```

```
シナリオ AC-24: 既存単体テスト全件 green (追従修正後)
  Given /projects / /routines / /today / /tomorrow / /focus が引き続きレンダリング可能
  When  ルートから npm test (vitest 全件) を実行する
  Then  すべて green である
   かつ 既存 task-card-component.test.tsx / project-card-component.test.tsx / routine-card-component.test.tsx 等の
        編集モード関連 assert は本 BL の API 変更に追従修正されている
```

```
シナリオ AC-25: 既存 E2E 全件 green (追従修正後)
  Given Playwright が起動可能
  When  npx playwright test を実行する
  Then  すべて green である
   かつ e2e/conflict-handling.spec.ts の「名称変更」 button 経由フローは
        「name input の blur で PATCH」経由フローに追従修正されている
   かつ e2e/projects.spec.ts / e2e/routines.spec.ts / e2e/tasks.spec.ts の編集経路が
        新 UI (input blur 駆動) に追従修正されている
```

## 重要な決定 (D 章)

- **D-001 (同値 blur で PATCH を送らない / 抑制は親側に置く)**
  - 候補:
    - (i) カード本体 (`<TaskCard>` / `<ProjectCard>` / `<RoutineCard>`) で `next === entity.name` を比較し短絡する.
    - (ii) 親 view の handler で `if (next === current) return;` で短絡する.
  - 採用: **(ii)**. カードは「常に blur 値を流す」純な presentational に保ち, 「同値抑制」「空文字復元」「conflict 経路」など PATCH 実行可否の判断は親が担う.
  - 理由: (i) はカードに「親の現値と一致したら呼ばない」という親文脈依存ルールが入り抽象が崩れる. (ii) は親が `current` を握っているので自然.

- **D-002 (空文字 blur の扱い: 元値復元)**
  - 候補:
    - (i) 元値復元 (PATCH 送らない / input は再描画で元値に戻る).
    - (ii) エラーバナー表示 + input は空のまま残す.
    - (iii) 「保存できません」のような小さい inline メッセージ.
    - (iv) ブラウザ標準 `required` で submit 不可 (= input が `required` 属性を持つ).
  - 採用: **(i) 元値復元**. PATCH を送らない + 親 state が変わらない (= entity.name のまま) → React 再描画で input value が元値に戻る.
  - 理由: 「常時編集可能」は user 要求だが domain では空 name 不可. user が意図せず全消ししても安全な側に倒す. inline メッセージ (iii) は控えめだが視覚ノイズを増やすため不採用. (ii) はモーダル / バナー連打になりうるため不採用. (iv) は submit ボタンが無い以上効果なし (HTML 仕様上 input 単独の required は form submit に紐づく).
  - 実装責務: 親 view handler で `if (next === "") return;` で短絡. input の `value={entity.name}` で React が自動的に元値を再描画する (= 親 state は touch しないため `entity.name` が表示される).

- **D-003 (blur 中 conflict 412 の UI: 既存 ConflictDialog 流用)**
  - 候補:
    - (i) 既存 `ConflictDialog` をそのまま開く (= 「変更」 button 経由と同じ).
    - (ii) blur 経路用の控えめな inline 警告.
    - (iii) input の周囲に紫色のリング等視覚マーカー.
  - 採用: **(i)**. blur も「明示的なフィールド確定操作」とみなしダイアログを開く. UX 上は今までと同等.
  - 理由: 経路が複数あると user の認知負荷が上がる. 412 は「同名 entity を別経路で更新済」という強い conflict であり, ダイアログで明示的に解決させるのが安全.
  - 既存 `mapConflict` (BL-033) / `useConflictDialog` (BL-031) はそのまま使う.

- **D-004 (テスト方針)**
  - 新規テストファイル `web/__tests__/inline-edit-all-cards.test.tsx` を作る:
    - (a) jsdom DOM レンダ assert (`<TaskCard>` / `<ProjectCard>` / `<RoutineCard>` 単体): AC-1 / AC-2 / AC-3 / AC-4 / AC-5 / AC-6 / AC-7 / AC-8 / AC-9 / AC-10.
    - (b) view 適用 assert (`projects-view.tsx` / `routines-view.tsx` / `today-view.tsx` / `tomorrow-view.tsx` / `focus-view.tsx` の state / handler 削減 + 新 prop 利用): AC-12 / AC-13 / AC-14.
    - (c) 親 view の handler 経由 PATCH assert (mock Repository): AC-15 / AC-16 / AC-17 / AC-18 / AC-19.
    - (d) ConflictDialog 経路 assert (412 mock): AC-20.
    - (e) 起票カード無改修 assert (差分検出): AC-11.
    - (f) BL-042 spec 注釈 assert (テキスト直読み): AC-21.
    - (g) tokens / Repository 無改修 assert: AC-23.
  - 既存テストの追従:
    - `web/__tests__/task-card-component.test.tsx` (BL-059) / `task-card-hotfix.test.tsx` (BL-063) / `task-card-zone-layout.test.tsx` (BL-057) の name span 関連 assert を input に追従.
    - `web/__tests__/project-card-component.test.tsx` (BL-060) の `isEditing` 系 assert を撤去 / API 変更に追従.
    - `web/__tests__/routine-card-component.test.tsx` (BL-061) / `routine-card-edit-fields.test.tsx` (BL-068) / `routine-card-edit-priority.test.tsx` (BL-069) の編集モード assert を全て新流儀に追従.
    - `web/__tests__/projects-view.test.tsx` / `routines-view.test.tsx` の編集経路 (「変更」 click → input → 「保存」) を「input blur」フローに書き換え.
    - `e2e/tasks.spec.ts` (BL-026 系) の編集経路 / `e2e/projects.spec.ts` / `e2e/routines.spec.ts` の編集経路 / `e2e/conflict-handling.spec.ts` (BL-031 / BL-033) の「名称変更」 button 経由フローを「name input の blur」経由フローに追従.

- **D-005 (BL-042 以外への注釈追記範囲)**
  - 候補:
    - (i) BL-042 / BL-059 / BL-060 / BL-061 / BL-068 / BL-069 のすべてに注釈追加.
    - (ii) BL-042 (= 元々「別 BL」と明言した唯一の箇所) のみ注釈追加.
  - 採用: **(ii) BL-042 のみ**.
  - 理由: BL-059 〜 BL-069 は本 BL で API 変更を受けるが, それらの spec 中で「将来別 BL で逆転される」と明言した箇所はない. 注釈過多は spec の整合性を保ちにくくする. 本 BL の変更履歴は本 spec / backlog.md / git log で十分追跡可能.

- **D-006 (TaskFormCard / ProjectFormCard / RoutineFormCard を無改修にする理由)**
  - 起票カードは「新規作成 = submit 必要」という意味論を持ち, 既存 input + 「追加」 button 構造で十分.
  - ここに blur 即作成を入れると「フォーカスを外しただけで意図せず作成される」リスクが大きい (= user 要求の本旨「編集の常時可能化」とは別軸).
  - 表示カードのみ「編集モード」を撤去対象とする (= 既存 entity の編集経路の話).

- **D-007 (各 view の handler 再設計)**
  - projects-view / routines-view では `editingId` / `editing*` state を撤去し handler を name blur / 即時 PATCH に統一する.
  - today-view / tomorrow-view / focus-view では既存の `handleSetPriority` と同じ流儀で `handleNameBlur` を追加する. updateMutation の引数 shape (`{ id, ifMatch, patch: { name } }`) は既存と同形.
  - focus-view では `actionSet="minimal"` でも `onNameBlur` を渡す (= 名称編集は actions 数に関係なく常時可能).

- **D-008 (BL-042 で撤去された名称編集経路を本 BL が復活させる位置付け / G-10)**
  - BL-042 spec の「## 背景 / 課題」「## ゴール / 非ゴール § 非ゴール § 編集操作の代替 UI の提供」「未決事項 U-4」で「代替経路は別 BL」と明言されていた. 本 BL がその「別 BL」.
  - 復活方式は BL-042 で想定された「カードタップ → ダイアログ起動」ではなく, より軽い「常時 input 表示 + blur PATCH」を採用 (= user 要求と整合).
  - BL-042 spec への注釈は AC-21 で 1 行追記を assert する.

- **D-009 (a11y: label htmlFor / id 関連付け / aria-label の整理)**
  - TaskCard input: id を明示せず `aria-label={`${task.name} の名前`}` で関連付ける. 理由: タスク一覧で複数 input が並ぶため id 衝突を避ける一方, label を全 input に visually-hidden で並べると DOM ノイズが増える. PriorityStars (BL-040) でも groupLabel に `${task.name} の優先度` を渡す前例があるためこれと整合.
  - ProjectCard input: id を `project-name-{project.id}` とし `<label class="visually-hidden" htmlFor>` を伴う. ProjectFormCard (起票) の id `project-name` と衝突しないよう entity id を suffix に含める.
  - RoutineCard input: id を `routine-name-{routine.id}` とし `<label class="visually-hidden" htmlFor>` を伴う. RoutineFormCard 起票側の `routine-name` と衝突しないよう entity id を suffix に含める.
  - 曜日 checkbox は既存の `<div role="group" aria-label="曜日">` 内に既存 label テキスト (日 / 月 / 火 / 水 / 木 / 金 / 土) を維持.
  - PriorityStars は `idPrefix={`routine-${routine.id}`}` で起票側 (`routine-create`) と衝突回避.

- **D-010 (TaskCard 一覧で input が並ぶことの UX 問題)**
  - 候補:
    - (i) 何もしない: ネイティブ input の見た目で並ぶ.
    - (ii) read-only 状態 (= focus 前) と active 状態 (= focus 後) で CSS を分け, 一覧時はテキストに見えるよう border-bottom のみ等の最小スタイル.
    - (iii) `<input>` 自体は出さず, click で input に切り替わる (= 「編集モード」が戻る = 採用方針と矛盾).
  - 採用: **(i) 何もしない** (本 BL では).
  - 理由: ネイティブ input は OS / ブラウザ既定で十分視認できる. CSS の細かい調整は本 BL のスコープを膨らませる. UX 問題が顕在化したら別 BL で扱う (= 将来 BL 候補).
  - ただし border / background / padding 等の visual トークン (`.task-card`) はそのまま継承されるため, 既存 visual に input が紛れる程度の見え方になる. これで十分.

- **D-011 (採用案 α: 1 PR でまとめる)**
  - 候補:
    - (α) 1 PR でまとめる (TaskCard / ProjectCard / RoutineCard 横断 + views 連動).
    - (β) 3 PR に分割 (TaskCard / ProjectCard / RoutineCard を別 PR).
    - (γ) Card 系 1 PR + View 系 1 PR の 2 PR.
  - 採用: **α (1 PR)**.
  - 理由: 各カードの API 変更と親 view の handler 再設計は同時に行う必要があり, 分割すると中間状態でテストが green にならない. 大規模になるが「カード 3 つ + view 5 つ」の改修であり, 適切なテストカバレッジで管理可能.

- **D-012 (PriorityStars / 曜日 checkbox の即時 PATCH と name blur の保存タイミングを混在させる方針 / 案 e)**
  - 候補:
    - (a) 全フィールド即時 PATCH (= 1 文字ごと name PATCH).
    - (b) 全フィールド blur PATCH (= 曜日 / 優先度も blur 待ち).
    - (c) 「保存」 button を残す (= 編集モード概念維持 / user 要求と矛盾).
    - (d) debounce (例: 500ms) でテキストも自動保存.
    - (e) 状態系 (曜日 / 優先度) は即時 PATCH / テキストは blur PATCH.
  - 採用: **e**.
  - 理由: (a) は API 連打になり負荷大. (b) は曜日 click の後フォーカスを別の場所に持っていかないと保存されず UX 上不自然. (c) は user 要求と矛盾. (d) は実装複雑度 / 「いつ保存されたか」の認知曖昧化. (e) はテキスト = blur / 状態系 = 即時 という自然な役割分担.

- **D-013 (実装手順 / 進行順)**
  - 候補:
    - (i) TaskCard → ProjectCard → RoutineCard の順.
    - (ii) Card 3 種を並行修正 → views 3 種を順次修正.
    - (iii) 親 view 側を先に修正 → カード API 変更を後で揃える.
  - 採用: **(ii)**. テストが落ちる期間を短くするため.
  - 詳細手順は plan.md / tasks.md.

## 未決事項 / 確認待ち

- **U-1 (TaskCard input が一覧で並ぶ UX の許容範囲 / D-010 の再検討余地)**
  - 採用方針は「何もしない」だが, 実機 UI レビュー時に「タスク一覧が input 群で煩雑に見える」と判定された場合, 別 BL で CSS 微調整 (border-bottom のみ / hover で border 強調等) を扱う候補がある.
  - 本 BL ではスコープ外.

- **U-2 (空文字 blur 時に notifyError を出すか / D-002 の補強)**
  - 採用方針は「静かな元値復元」. ただし user が「あれ, 保存できなかった?」と気付けないリスクはある.
  - 軽量な notifyError (例: 「空のままにはできません」) を出す案も plan 確定時に再評価する余地あり.
  - 第一候補は **静かな復元** (= 出さない).

- **U-3 (focus-view の TaskCard input がフォーカス対象として優先される問題)**
  - focus-view では 1 つのタスクしか表示されないため, ページ読み込み時に input にフォーカスが当たる挙動が想定される (= 自動 focus は React 既定では起きないが, autoFocus を付けると起きる).
  - 本 BL では `autoFocus` を **付けない** (= デフォルトの「フォーカスは body」を維持).
  - 検証は AC-22 (a11y) と E2E の「初期描画後にどの要素が `document.activeElement` か」 で間接的にカバーされる. 必要なら U-3 の補強テスト追加を plan で確定.

- **U-4 (Repository の Mutation 引数で routine の version を即時 click で送る場合の競合)**
  - 曜日 / 優先度の即時 PATCH では mutation 中に別の click が来る可能性がある (= 曜日 2 つ素早く ON にする等).
  - 既存 `updateMutation.mutateAsync` は逐次 await で繋がれていないため, 並行 PATCH で version が古いまま 412 になる可能性がある.
  - 本 BL では「即時 PATCH = 1 click ごとに `await mutateAsync`」とし, 親 view 側で逐次化する想定. 詳細は plan で確定.
