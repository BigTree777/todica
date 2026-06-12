# 設計・実装計画: 全カードのインライン常時編集化 (inline-edit-all-cards)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`<TaskCard>` / `<ProjectCard>` / `<RoutineCard>` の 3 系統で「編集モード」概念 (= `isEditing` / `editing*` / 「変更」「保存」「キャンセル」 button) を撤去し,
**表示時の DOM に input / checkbox / PriorityStars を常時配置**して直接編集を可能にする.
保存タイミングは「テキスト = blur PATCH / 状態系 (曜日 / 優先度) = 即時 PATCH」 (= 案 e). 各親 view (today / tomorrow / focus / projects / routines) は
旧 `editingId` 系 state と `openEdit` / `cancelEdit` / `handleSaveEdit` handler を削除し, 代わりに `handleNameBlur` / (routines のみ) `handleDaysOfWeekChange` / `handleDefaultPriorityChange` を新設する.
1 PR でまとめて提出する (= 採用案 α).

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 無改修 (既存 `PATCH /api/v1/tasks/:id` / `PATCH /api/v1/projects/:id` / `PATCH /api/v1/routines/:id`). |
| DB | 無改修. |
| domain | 無改修. |
| repositories | 無改修 (`task-repository.ts` / `project-repository.ts` / `routine-repository.ts` の interface 不変). |
| UI components | `<TaskCard>` / `<ProjectCard>` / `<RoutineCard>` の props と JSX を再設計. |
| UI views | `today-view.tsx` / `tomorrow-view.tsx` / `focus-view.tsx` / `projects-view.tsx` / `routines-view.tsx` の state / handler / JSX 再設計. |
| CSS | `.project-card--editing` / `.routine-card--editing` / `.project-card__form-inline` / `.routine-card__form-inline` / `.project-card__actions__edit` / `.routine-card__actions__edit` の各セレクタ撤去. 既存 `.task-card` / `.project-card` / `.routine-card` 系の他のルールは維持. |
| 起票カード | `<TaskFormCard>` / `<ProjectFormCard>` / `<RoutineFormCard>` は無改修. |
| ConflictDialog / notifyError | 無改修. blur 経路でも既存 `mapConflict` / `useConflictDialog` が動く. |
| tokens.css | 無改修. |
| テスト | `web/__tests__/inline-edit-all-cards.test.tsx` 新規 + 既存 card 系 / view 系の追従. |
| E2E | `e2e/conflict-handling.spec.ts` / `e2e/projects.spec.ts` / `e2e/routines.spec.ts` / `e2e/tasks.spec.ts` の編集経路追従. |
| 仕様注釈 | BL-042 spec に「BL-070 で逆転」注釈 1 行追記. |

## 設計詳細

### `<TaskCard>` API 変更

```ts
// 追加 (必須):
onNameBlur: (next: string) => void;
```

- 撤去: なし.
- 維持: すべての既存 prop (variant / showPriority / showSetFocus / actionSet / dueDateMode / onSetPriority / onSetFocus / onDelete / onToggleDueDate / onComplete / as / aria-label).

JSX 変更 (`task-card__title` 内のみ):

```diff
- <div className="task-card__title">
-   <span>{task.name}</span>
- </div>
+ <div className="task-card__title">
+   <input
+     key={`task-name-${task.id}-${task.name}`}
+     type="text"
+     defaultValue={task.name}
+     onBlur={/* P-001 (iii): 空文字なら DOM 値を task.name に書き戻してから onNameBlur(next) */}
+     aria-label={`${task.name} の名前`}
+   />
+ </div>
```

- input は uncontrolled (`defaultValue` + entity.id / entity.name を含む `key`). blur ハンドラの確定形 (空文字時の DOM 書き戻しによる元値復元) は P-001 を参照.
- PriorityStars / actions は無改修.

### `<ProjectCard>` API 変更

```ts
// 撤去 (6 件):
isEditing: boolean;
editingName: string;
onEditingNameChange: (next: string) => void;
onStartEdit: () => void;
onCancelEdit: () => void;
onSaveEdit: (e: React.FormEvent) => void;

// 追加 (1 件):
onNameBlur: (next: string) => void;

// 維持 (3 件):
project: Project;
onDelete: () => void;
as?: "li" | "div";
```

JSX 全置換:

```jsx
<Tag className="project-card">
  <label htmlFor={`project-name-${project.id}`} className="visually-hidden">プロジェクト名</label>
  <input
    key={`project-name-${project.id}-${project.name}`}
    id={`project-name-${project.id}`}
    type="text"
    className="project-card__input"
    defaultValue={project.name}
    placeholder="プロジェクト名"
    onBlur={/* P-001 (iii): 空文字なら DOM 値を project.name に書き戻してから onNameBlur(next) */}
  />
  <div className="project-card__actions">
    <button type="button" className="project-card__actions__delete" onClick={onDelete}>
      削除
    </button>
  </div>
</Tag>
```

- 編集 form (`<form aria-label="プロジェクト名称変更フォーム">`) は撤去.
- `.project-card--editing` modifier 撤去.
- `.project-card__actions__edit` セレクタ撤去.
- `<span class="project-card__name">` 撤去.

### `<RoutineCard>` API 変更

```ts
// 撤去 (10 件):
isEditing: boolean;
editingName: string;
onEditingNameChange: (next: string) => void;
editingDaysOfWeek: number[];
onEditingDaysOfWeekChange: (next: number[]) => void;
editingDefaultPriority: Priority;
onEditingDefaultPriorityChange: (next: Priority) => void;
onStartEdit: () => void;
onCancelEdit: () => void;
onSaveEdit: (e: React.FormEvent) => void;

// 追加 (3 件):
onNameBlur: (next: string) => void;
onDaysOfWeekChange: (next: number[]) => void;
onDefaultPriorityChange: (next: Priority) => void;

// 維持 (3 件):
routine: WebRoutine;
onDelete: () => void;
as?: "li" | "div";
```

JSX 全置換 (= 編集モード分岐削除 / 常時表示モードのみ):

```jsx
<Tag className="routine-card">
  <div className="routine-card__main">
    <label htmlFor={`routine-name-${routine.id}`} className="visually-hidden">ルーティン名</label>
    <input
      key={`routine-name-${routine.id}-${routine.name}`}
      id={`routine-name-${routine.id}`}
      type="text"
      className="routine-card__input"
      defaultValue={routine.name}
      placeholder="ルーティン名"
      onBlur={/* P-001 (iii): 空文字なら DOM 値を routine.name に書き戻してから onNameBlur(next) */}
    />
    <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
      {DAY_LABELS.map((label, day) => (
        <label key={day}>
          <input
            type="checkbox"
            checked={routine.daysOfWeek.includes(day)}
            onChange={() => {
              const next = routine.daysOfWeek.includes(day)
                ? routine.daysOfWeek.filter((d) => d !== day)
                : [...routine.daysOfWeek, day].sort((a, b) => a - b);
              onDaysOfWeekChange(next);
            }}
          />
          {label}
        </label>
      ))}
    </div>
    <PriorityStars
      value={routine.defaultPriority}
      onChange={onDefaultPriorityChange}
      groupLabel={`${routine.name} の優先度`}
      idPrefix={`routine-${routine.id}`}
    />
  </div>
  <div className="routine-card__actions">
    <button type="button" className="routine-card__actions__delete" onClick={onDelete}>
      削除
    </button>
  </div>
</Tag>
```

- 編集モード分岐 (`if (isEditing)`) を完全撤去.
- 編集 form / 「保存」「キャンセル」 button 撤去.
- `.routine-card--editing` / `.routine-card__form-inline` modifier 撤去.
- `.routine-card__actions__edit` セレクタ撤去.
- `.routine-card__days-label` 撤去 (= read-only 表示は不要 / checkbox が常時表示).

### 親 view の handler 再設計

#### `today-view.tsx` (focus / 一覧の TaskCard で TaskCard を使う側)

- handler 追加: `handleNameBlur(task, next)`.

```ts
const handleNameBlur = useCallback(
  async (task: Task, next: string) => {
    if (next === "" || next === task.name) return;  // D-001 / D-002
    await updateMutation.mutateAsync({
      id: task.id,
      ifMatch: task.version,
      patch: { name: next },
    });
  },
  [updateMutation],
);
```

- JSX で各 `<TaskCard>` に `onNameBlur={(next) => handleNameBlur(task, next)}` を渡す.

#### `tomorrow-view.tsx` / `focus-view.tsx`

- today と同じ handler を追加. TaskCard 利用箇所に `onNameBlur` を渡す.

#### `projects-view.tsx`

- state 撤去: `editingId` / `editingName`.
- handler 撤去: `openEdit` / `cancelEdit` / `handleSaveEdit`.
- handler 追加: `handleNameBlur(project, next)`:

```ts
const handleNameBlur = useCallback(
  async (project: Project, next: string) => {
    if (next === "" || next === project.name) return;
    await updateMutation.mutateAsync({
      id: project.id,
      ifMatch: project.version,
      name: next,
    });
  },
  [updateMutation],
);
```

- JSX で `<ProjectCard project={project} onNameBlur={(next) => handleNameBlur(project, next)} onDelete={() => handleDelete(project)} />` に変える.

#### `routines-view.tsx`

- state 撤去: `editingId` / `editingName` / `editingDaysOfWeek` / `editingDefaultPriority`.
- handler 撤去: `openEdit` / `cancelEdit` / `handleSaveEdit`.
- handler 追加:

```ts
const handleNameBlur = useCallback(
  async (routine: WebRoutine, next: string) => {
    if (next === "" || next === routine.name) return;
    await updateMutation.mutateAsync({
      id: routine.id,
      ifMatch: routine.version,
      name: next,
      daysOfWeek: routine.daysOfWeek,           // 既存 mutation 引数 shape を維持
      defaultPriority: routine.defaultPriority, // 既存 mutation 引数 shape を維持
    });
  },
  [updateMutation],
);

const handleDaysOfWeekChange = useCallback(
  async (routine: WebRoutine, next: number[]) => {
    if (next.length === 0) return;  // BL-068 D-016 の silent return 維持
    await updateMutation.mutateAsync({
      id: routine.id,
      ifMatch: routine.version,
      name: routine.name,
      daysOfWeek: next,
      defaultPriority: routine.defaultPriority,
    });
  },
  [updateMutation],
);

const handleDefaultPriorityChange = useCallback(
  async (routine: WebRoutine, next: Priority) => {
    await updateMutation.mutateAsync({
      id: routine.id,
      ifMatch: routine.version,
      name: routine.name,
      daysOfWeek: routine.daysOfWeek,
      defaultPriority: next,
    });
  },
  [updateMutation],
);
```

- JSX で `<RoutineCard routine={routine} onNameBlur={...} onDaysOfWeekChange={...} onDefaultPriorityChange={...} onDelete={...} />` に変える.

### CSS 変更

- `web/src/ui/project-card/project-card.css`:
  - 撤去: `.project-card--editing` / `.project-card__form-inline` / `.project-card__actions__edit` / `.project-card__name`.
  - 維持: `.project-card` (基底 4 宣言 + flex 横並び) / `.project-card__actions` / `.project-card__input` / `.project-card__input::placeholder` / `.visually-hidden` / `.project-card--form` / `.project-card__submit` / `.project-card__actions__delete`.
- `web/src/ui/routine-card/routine-card.css`:
  - 撤去: `.routine-card--editing` / `.routine-card__form-inline` / `.routine-card__actions__edit` / `.routine-card__days-label` / `.routine-card__name` (本 BL 時点で空ルールであれば撤去).
  - 維持: `.routine-card` (基底) / `.routine-card--form` / `.routine-card__main` (引き続き左ブロック) / `.routine-card__actions` / `.routine-card__input` / `.routine-card__input::placeholder` / `.routine-card__day-checkboxes` / `.routine-card__form-row` / `.visually-hidden` / `.routine-card__select` / `.routine-card__submit` / `.routine-card__actions__delete`.
- `web/src/ui/task-card/task-card.css`:
  - 変更なし (= 既存 `.task-card__title` のルールはそのまま. input が `<span>` を置換するだけで, font / レイアウトは既存 BL-059 V-4 / V-7 の `--font-size-h2` 等を継承).
  - 必要に応じ `.task-card__title input` / `.project-card__input` / `.routine-card__input` に input 固有の継承スタイルを追加する (border / background / padding を `.task-card` 系の visual と整合させる程度). 詳細は実装時に確定.

### 処理フロー

#### Project の name 変更フロー (blur 経由)

```
user が input に "学習" を入力
  → blur 発火
  → ProjectCard が onNameBlur("学習") を呼ぶ
  → projects-view の handleNameBlur(project, "学習")
    → if (next === "" || next === project.name) return;  // D-001 / D-002
    → updateMutation.mutateAsync({ id, ifMatch, name: "学習" })
      → repository.update(...) で PATCH /api/v1/projects/:id
        → 成功: invalidate ["projects"] / TanStack Query 再フェッチ → ProjectCard 再描画 (input value = 新名)
        → 412: mapConflict → ProjectConflictError → useConflictDialog で dialog 起動 (BL-031 / BL-033)
        → other: notifyError("通信に失敗しました") (BL-034)
```

#### Routine の曜日 click フロー (即時)

```
user が "水" checkbox を click
  → RoutineCard が onDaysOfWeekChange([1,2,3]) を呼ぶ
  → routines-view の handleDaysOfWeekChange(routine, [1,2,3])
    → if (next.length === 0) return;
    → updateMutation.mutateAsync({ id, ifMatch, name, daysOfWeek: [1,2,3], defaultPriority })
      → repository.update(...) で PATCH /api/v1/routines/:id
        → 成功 / 412 / other: 同上
```

#### 空文字 blur (元値復元)

```
user が input を全消し → blur
  → ProjectCard の blur ハンドラが next === "" を検知
    → DOM 値を project.name (= 元値) に同期的に書き戻す (P-001 (iii) / 表示復元)
    → 続けて onNameBlur("") を呼ぶ (= D-001: カードは常に blur 値を流す)
  → projects-view の handleNameBlur(project, "")
    → if (next === "" || next === project.name) return;  // 短絡
  → PATCH 送られない
  → input の表示は元値 (= カード側で書き戻し済み. 親 state / key は不変のため再マウントは起きない)
```

### 例外 / エラー処理

- 412 (OptimisticLockError):
  - 既存の各 view `updateMutation` の `onError` で `ConflictError` 系に変換され `ConflictDialog` を開く.
  - 名称 blur 経由でも「変更」 button 経由と同じ経路で動く.
- 401 / network error:
  - 既存の `notifyError("通信に失敗しました")` 経路に流れる.
- name に空文字 / 同値:
  - 親 view handler で短絡. domain / server には到達しない.

## 重要な決定

仕様参照: [`spec.md`](spec.md) の D 章.

- D-001 〜 D-013 は spec.md で確定. 主要な実装判断:
  - D-001 / D-002: 同値 / 空文字の **PATCH 抑制** は **親 view 側** で行う. カードは「常に blur 値を流す純な presentational」. ただし空文字 blur 時の **表示の元値復元** はカード側の blur ハンドラが DOM 書き戻しで担う (詳細は P-001 (iii)).
  - D-003: 412 は既存 `ConflictDialog` 経路をそのまま流用.
  - D-009: TaskCard input は `aria-label` で関連付け / Project / Routine は entity id を suffix にした visually-hidden label + id 関連付け.
  - D-011: 1 PR でまとめて提出 (採用案 α).
  - D-012: 状態系 (曜日 / PriorityStars) 即時 PATCH / テキスト (name) blur PATCH (採用案 e).

## P 章 (実装計画上の判断)

- **P-001 (input の controlled / uncontrolled 扱いと D-002 元値復元の実現方式)** (auditor 指摘により再設計 / 2026-06-12 改訂):
  - 経緯:
    - 当初の採用案は (i) 「`value={entity.name}` + `onChange={() => {}}` (noop)」だった. しかし controlled input は onChange が入力値を state に反映しない限り React が毎 render で DOM 値を `value` prop に戻すため, **user の入力自体が不能**になる. 実装段階で実現不可と判明し撤回.
    - implementer は (ii) 「`defaultValue` + entity.name を含む `key`」 (uncontrolled) に切り替えて実装した. しかし **空文字 blur で親 handler が短絡 (PATCH しない) すると, 親 state も `key` も変わらず再マウント契機が無いため input が空のまま残り**, spec D-002 / AC-15 (元値復元) に違反する. auditor が実機 fail を確認.
    - 本改訂で (iii) を採用案として確定する.
  - 候補:
    - (i) controlled: `value={entity.name}` + `onChange={() => {}}` (noop) + `onBlur`.
    - (ii) uncontrolled: `defaultValue={entity.name}` + `key` に entity.id と entity.name を混ぜる. blur ハンドラは `onNameBlur(next)` を呼ぶのみ.
    - (iii) (ii) に加え, blur ハンドラ内で **空文字のとき `event.currentTarget.value = entity.name` を同期的に書き戻す** (= カード側の表示復元).
    - (iv) (ii) に加え, `key` に復元用カウンタ state を混ぜ, 空文字 blur 時にカウンタを進めて強制再マウントする.
    - (v) controlled + ローカル draft state: `useState(entity.name)` + `onChange={setDraft}` + 空文字 blur 時 `setDraft(entity.name)`. entity.name 変化への追従は `key` 再マウントで行う.
  - 採用: **(iii)**. Task / Project / Routine の 3 カードで統一する.
  - 各候補の判定:
    - (i) **実現不可** (却下). noop onChange の controlled input は入力不能 (上記経緯).
    - (ii) **D-002 違反** (却下). 空文字 blur の短絡時に state も `key` も変わらず, input が空のまま残る (上記経緯).
    - (iii) **採用**. uncontrolled input では値の正本は DOM であり, `input.value` への直接代入は uncontrolled の正規の値設定手段 (React は mount 時の `defaultValue` 以外で値に触れないため衝突しない). 追加 state / onChange 不要で 3 カードとも blur ハンドラ内の数行で済む. blur ハンドラ内の同期処理なので `event.currentTarget` も有効.
    - (iv) 却下. カウンタ state の置き場所が問題になる. カードに置けば (iii) と同じ判定をしたうえで state + 再マウントという重い機構を足すだけ. 親に置けば「短絡したことをカードへ通知する」経路 (entity ごとのカウンタ map 等) が 5 view に必要になり, D-001 の責務分担 (カードは純 presentational / 親は PATCH 可否判断) が崩れる.
    - (v) 却下. 3 カードに useState + onChange + keystroke ごとの再 render を追加するが, 空文字判定は結局カード側 blur ハンドラに必要で, (iii) に対して得るものが無い.
  - 確定実装 (3 カード共通の形):

    ```jsx
    <input
      key={`...-${entity.id}-${entity.name}`}
      type="text"
      defaultValue={entity.name}
      onBlur={(e) => {
        const next = e.currentTarget.value;
        if (next === "") {
          // D-002: 空文字は親が PATCH を短絡し state も key も変わらないため,
          // カード側で DOM 値を正本値 (entity.name) に書き戻して表示を復元する.
          e.currentTarget.value = entity.name;
        }
        onNameBlur(next); // D-001: カードは常に blur 値を流す (空文字も含む)
      }}
    />
    ```

  - D-001 との責務分担:
    - **PATCH 実行可否の判断** (同値 / 空文字の短絡) は引き続き **親 view** が担う (D-001 不変. カードは空文字でも `onNameBlur` を呼ぶ).
    - **表示の元値復元** (D-002 の見た目側) は **カード** が担う. カードは props で正本値 (`entity.name`) を知っており, 入力欄の表示はカードの presentational 責務なので D-001 の抽象は崩れない.
    - `next === ""` の判定がカード (表示復元) と親 (PATCH 抑制) の両方に現れるが, それぞれ独立した責務であり重複を許容する.
  - `key` に entity.name を含める理由 (= (ii) から維持): PATCH 成功 → invalidate / refetch で entity.name が変わったとき input を再マウントし, 表示をサーバ正本に同期する. 412 / network error で entity.name が変わらない場合は再マウントされず user の入力値が input に残る (= ConflictDialog 解決後または再 blur でリトライ可能).
  - 注意 (入力中の表示): 入力中に別フィールドの即時 PATCH (曜日 / 優先度) で refetch が走っても, name が変わらない限り `key` 不変で再マウントされず編集中の値は保持される. 別経路で name 自体が変わった場合は `key` 変化で再マウントされ編集中の値は破棄される (= サーバ正本への同期を優先. 単一ユーザ運用では実質起きない).
  - 注意 (spec 記述との関係): spec D-002 / AC-15 の「React の再描画で元値に戻る」という機構説明は旧採用案 (i) 前提の記述である. 検証可能な要求は「空文字 blur 後に PATCH が送られず, 入力欄の表示が元値に戻る」ことであり, 本方式 (iii) はこれを満たす. spec の要求自体は変更しない.

- **P-002 (即時 PATCH の逐次化)**:
  - 曜日 click を素早く 2 回行うと, 1 回目の PATCH が完了する前に 2 回目が走り, 2 回目が古い version で 412 になる可能性がある.
  - 候補:
    - (i) 何もしない: 412 が出たら ConflictDialog が開く (= user に体験させる).
    - (ii) parent state に楽観的更新を入れ, mutation を逐次化.
    - (iii) debounce.
  - 採用: **(i) 何もしない** (本 BL では).
  - 理由: 1 click ごとに `await mutateAsync` で同期実行する (= React の handler 内で await している間は次の click が来ても mutation は queue されない). 実機で問題が顕在化したら別 BL で楽観的更新を導入する.

- **P-003 (PriorityStars idPrefix 衝突回避)**:
  - 既存: 起票 RoutineFormCard は `idPrefix="routine-create"`, 編集 RoutineCard (BL-068 / BL-069) は `idPrefix="routine-edit"`.
  - 本 BL: 編集モード概念撤去で全 routine 1 件ごとに固有 prefix が必要 → `idPrefix={`routine-${routine.id}`}`.
  - 同様に TaskCard は既に `idPrefix={`task-${task.id}`}` (BL-059 / 既存).

- **P-004 (アクセシビリティ補強)**:
  - TaskCard input の `aria-label` は `task.name` を含む動的文字列 (`${task.name} の名前`). タスク名が変わると aria-label も変わる.
  - axe スキャンでは aria-label の存在のみが必要. 内容変動は問題なし.

- **P-005 (BL-042 spec への注釈追記の具体的場所)**:
  - 候補箇所:
    - (a) `## 背景 / 課題` 末尾.
    - (b) `## ゴール / 非ゴール § 非ゴール § 編集操作の代替 UI の提供`.
    - (c) `## 未決事項 / 確認待ち § U-4`.
  - 採用: **(b) と (c) の両方** に 1 行ずつ. (a) は背景説明であり注釈位置として弱い.
  - 注釈文 (案):
    > **BL-070 (inline-edit-all-cards) で逆転**: 本 BL で言及した「タスク名編集の代替経路」は BL-070 で「TaskCard の name input 常時表示 + blur PATCH」として実装された. 「カードタップ → ダイアログ起動」案は採用されなかった.

- **P-006 (既存テスト追従のスコープ列挙)**:
  - 追従対象 (vitest):
    - `web/__tests__/task-card-component.test.tsx` (BL-059)
    - `web/__tests__/task-card-hotfix.test.tsx` (BL-063)
    - `web/__tests__/task-card-zone-layout.test.tsx` (BL-057)
    - `web/__tests__/task-card-design.test.tsx` (BL-052)
    - `web/__tests__/project-card-component.test.tsx` (BL-060)
    - `web/__tests__/routine-card-component.test.tsx` (BL-061)
    - `web/__tests__/routine-card-edit-fields.test.tsx` (BL-068)
    - `web/__tests__/routine-card-edit-priority.test.tsx` (BL-069)
    - `web/src/ui/projects-view/projects-view.test.tsx`
    - `web/src/ui/routines-view/routines-view.test.tsx`
    - `web/__tests__/today-view.test.tsx` (もしあれば)
    - `web/__tests__/tomorrow-view.test.tsx` (もしあれば)
  - 追従対象 (E2E / Playwright):
    - `e2e/conflict-handling.spec.ts` (BL-031 / BL-033) — 「名称変更」 button 経由フローを「input blur」フローに置換.
    - `e2e/projects.spec.ts` — 編集経路.
    - `e2e/routines.spec.ts` — 編集経路 (曜日 / 優先度 / name).
    - `e2e/tasks.spec.ts` — タスク名編集経路.
  - 追従しない (= 無関係):
    - `e2e/a11y.spec.ts` (= violations 0 の維持のみ確認).
    - `e2e/secondary-views-style.spec.ts` (= 旧 BL-045 系統 / 構造には触れない).

- **P-007 (CSS 撤去セレクタの roll-up)**:
  - `project-card.css`:
    - `.project-card--editing` / `.project-card__form-inline` / `.project-card__actions__edit` / `.project-card__name`.
  - `routine-card.css`:
    - `.routine-card--editing` / `.routine-card__form-inline` / `.routine-card__actions__edit` / `.routine-card__days-label` / `.routine-card__name`.
  - `task-card.css`:
    - 撤去なし. ただし必要に応じ `.task-card__title input` の整え (border / background) を追加.

- **P-008 (PR サイズと git ワークフロー)**:
  - 1 PR (= 採用案 α). branch: `feature/inline-edit-all-cards`.
  - commit 分割は実装者の判断に委ねるが, 望ましいのは「Card 3 種の API 変更」「View 5 種の handler 再設計」「テスト追従」「BL-042 spec 注釈追記」の 4 commit 程度.

## リスク / 代替案

### R-001 (BL-042 spec 注釈追記の作業)

- 本 BL 完了時に BL-042 spec へ「BL-070 で逆転」注釈を 1 行追加する.
- 追加場所は P-005 で確定 (= `## ゴール / 非ゴール § 非ゴール § 編集操作の代替 UI の提供` と `## 未決事項 / 確認待ち § U-4` の 2 か所).
- 注釈は実装履歴の追跡可能性を担保するためのもの.

### R-002 (E2E `e2e/conflict-handling.spec.ts` の追従コスト)

- 旧経路: `getByRole("button", { name: "名称変更" })` → click → input → `getByRole("button", { name: "保存" })` → click.
- 新経路: `getByLabel("プロジェクト名")` または `getByRole("textbox", { name: /プロジェクト名/ })` → fill → blur (= `keyboard.press("Tab")` 等).
- 412 の発生条件は同じだが, トリガーが「保存 button click」から「blur」に変わるため, 既存 spec の手順を全行追従する必要がある.

### R-003 (今後の操作系拡張への波及)

- 「常時編集可能 + blur 保存」モデルが定着すると, 将来別の入力 (例: 期限 / プロジェクト変更) も同じパターンで「カード上の常時編集」を要求される可能性がある.
- 本 BL では name / 曜日 / 優先度のみが対象. 他フィールドは別 BL で個別判断.

### R-004 (実機 UI の見た目チェック未実施 / 想定との乖離)

- 仕様策定のみで実装に進まない. 実機の input が並ぶ見た目は本 spec では検証していない.
- 実装後にレビューで「煩雑」と判定された場合, U-1 で扱う将来 BL に切り出す.

### 代替案

- (a) 「編集モード」を維持しつつ「変更」 button だけ撤去し, カード click で編集モード突入: spec の方針と矛盾 (= 「変更」 button 撤去だけでは「常時編集可能」にならない).
- (b) 名前変更だけ別の経路 (例: モーダル): user 要求の「ボタン不要」と矛盾.
- (c) 全 PATCH を debounce で自動保存 (= 入力中 500ms idle で送信): 「いつ保存されたか」の認知が曖昧化 / UX 説明コスト大.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト

- `web/__tests__/inline-edit-all-cards.test.tsx` (vitest):
  - (a) jsdom DOM レンダ assert (各カード単体): AC-1 〜 AC-10.
  - (b) view 適用 assert (state / handler / JSX): AC-12 〜 AC-14.
  - (c) 親 handler 経由 PATCH assert (mock Repository): AC-15 〜 AC-19.
  - (d) ConflictDialog 経路 assert (412 mock): AC-20.
  - (e) 起票カード差分 0 件 assert: AC-11.
  - (f) BL-042 spec 注釈 assert: AC-21.
  - (g) tokens.css / Repository 不変性 assert: AC-23.

### 既存テスト追従

- P-006 に列挙. 追従の優先度:
  1. 各 card 系単体テスト (jsdom): API 変更で大量失敗するため最優先.
  2. 各 view 系単体テスト: 編集経路を blur 経路に書き換え.
  3. E2E: シナリオを blur 駆動に追従.

### TDD サイクルの想定

1. test-designer が `inline-edit-all-cards.test.tsx` (失敗テスト) と既存テスト追従パッチ (red 状態) を用意.
2. implementer がカード API + view + CSS 撤去を順次実装し全件 green 化.
3. auditor が spec 適合 / E2E / a11y を検証.

### 重点確認項目

- (1) 全 3 系統で `isEditing` / `editing*` 系 prop が完全撤去されていること.
- (2) 全 3 系統で 「変更」「保存」「キャンセル」 button が DOM に存在しないこと.
- (3) 全 3 系統で name input が常時表示され, blur で onNameBlur が呼ばれること.
- (4) RoutineCard の曜日 / PriorityStars が常時表示され, click で即時 PATCH が走ること.
- (5) 同値 / 空文字 blur で PATCH が送られないこと.
- (6) 412 で ConflictDialog が開くこと.
- (7) 起票カード 3 種が無改修であること.
- (8) a11y violations が 0 件であること.
- (9) BL-042 spec に注釈 1 行が追記されていること.
