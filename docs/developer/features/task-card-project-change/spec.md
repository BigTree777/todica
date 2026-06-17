# 仕様: タスクカードに「プロジェクト変更」 UI を追加 (起票後の所属プロジェクト変更)

- 状態: 確定
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-108
- 依存:
  - BL-016 (`features/project-crud/`) — プロジェクト一覧取得 / `useQuery(["projects"])` 経路
  - BL-056 (`features/project-chip/`) — `.project-chip` の共通スタイル
  - BL-059 (`features/task-card-component/`) — `<TaskCard>` の 3 段ゾーン構造と prop API
  - BL-063 (`features/task-card-hotfix/`) — `.task-card__header .project-chip { font-size }` の specificity 上書き
  - BL-065 (`features/project-toggle-removal/`) — 起票カードのプロジェクト選択を `<select>` で表現する方式 (本 BL で同方式を表示側にも適用する)
  - BL-066 (`features/task-form-select-compact/`) — `.task-card__header select` のコンパクト化
  - BL-070 (`features/inline-edit-all-cards/`) — 表示側カードに inline 編集経路を持たせる前例 (name input)
- 由来要件: なし (新規 UI 改善 / FR 補完)
- 関連 NFR: NFR-001 (単一ワークフロー強制) / NFR-010 (最小手数の編集)

## 背景 / 課題

`<TaskCard>` (`web/src/ui/task-card/task-card.tsx:90`) は現在,
所属プロジェクトを `project && <span className="project-chip">{project.name}</span>` として
**read-only** で表示している. プロジェクト未割当 (`projectId === null`) のタスクは chip 自体を
描画しない (= header 左側が空) という挙動である.

起票時にはプロジェクトを選択できる (`<TaskFormCard>` 内の `<select id="${idPrefix}-project">`).
しかし起票後に「やっぱり別プロジェクトに移したい」「最初『なし』で起票したが後から所属させたい」
「所属プロジェクトを誤って付けた」といった編集要求に対し, UI 経路が存在しない. ユーザーは
タスクを削除して再起票するか, サーバ API を直接叩く以外に手段が無い.

サーバ API 側は既に `PATCH /api/v1/tasks/:id` で `projectId` (string | null) の更新を受理しており
(`web/src/repositories/task-repository.ts:304` の `if (cmd.patch.projectId !== undefined) body.projectId = cmd.patch.projectId;`),
ドメイン / API / Repository は **無改修** で済む. 不足しているのは TaskCard 表示側 UI と
親 view (today / tomorrow / focus) の `onChangeProject` ハンドラのみである.

BL-070 (`inline-edit-all-cards`) で「タスク名は input の blur で即時編集する」inline 編集方式が
確立済み. 本 BL はその方針を踏襲し, 表示側カードのプロジェクト chip を inline 編集可能な
control に置換する.

## ゴール / 非ゴール

### ゴール

- `<TaskCard>` (今日 / 明日 / 現在のタスクの 3 view で再利用される表示用カード) の
  プロジェクト chip 表示を, **その場でプロジェクトを変更できる control** に置換する.
- 「プロジェクトなし」 (= `projectId: null`) を含む全プロジェクトから 1 つを選択できる.
- 選択した瞬間にサーバへ `PATCH /api/v1/tasks/:id { projectId }` が発行され,
  楽観的ロック (`If-Match`) と offline 書込キュー / `ConflictDialog` 経路を
  既存の `updateMutation` 流路で経由する.
- 3 view (today / tomorrow / focus) いずれの TaskCard に対してもプロジェクト変更が可能になる.
- 既存テスト (`task-card-*.test.tsx` / `today-view.test.tsx` / `tomorrow-view.test.tsx` /
  `focus-view.test.tsx` / `project-chip.test.tsx` / `unified-day-view.test.tsx` /
  `task-card-component.test.tsx` 系) を **全件 green のまま** 維持する.

### 非ゴール

- **プロジェクト自体の作成 / 改名 / 削除**. 本 BL の control の中で新規プロジェクト追加 UI を
  提供しない (= BL-082 等別 BL の責務). 本 BL は **既存プロジェクト一覧からの選択** のみを扱う.
- **サーバ API / ドメイン / Repository 改修**. `PATCH /api/v1/tasks/:id` の `projectId` 受理は
  既に存在するため一切触らない.
- **`useProjects()` 等の新規共有フック追加**. 各親 view は既存の
  `useQuery({ queryKey: ["projects"], queryFn: () => projectRepository.list() })` をそのまま使う
  (today / tomorrow / focus いずれも同パターンが既存. 本 BL では再利用するだけ).
- **`.project-chip` ルール本文の改修**. BL-056 / BL-063 で固定された共通スタイルは無改修.
  (NFR-CHIP-PRESERVE / BL-066 と同じ非破壊原則.)
- **`tokens.css` の新規トークン追加**. 既存トークンのみで完結する (NFR-NO-NEW-TOKENS).
- **プロジェクト変更の確認ダイアログ**. 起票時と同じく即時反映とする
  (= NFR-010 最小手数の編集 / inline 編集の踏襲).
- **複数選択 / 一括変更 UI**. 1 タスクごとに 1 プロジェクトの変更のみ扱う.
- **タスクの並び替えや allow-list 制限**. ドメイン側の既存制約 (= 任意のプロジェクトに移せる)
  に従う. UI 側で「このプロジェクトには移せない」のような追加制限はしない.

## 要件

### 機能要件

- **REQ-1 表示側 control 化**: `<TaskCard>` (`web/src/ui/task-card/task-card.tsx`) の
  `.task-card__header` 内で, 従来 `project && <span className="project-chip">{project.name}</span>`
  として描画していた chip を, **常に表示される `<select>` control** に置換する.
  `projectId === null` のタスクでも control は描画され, 値は `""` (= プロジェクトなし) を取る.
  従来「project 未設定だと chip 自体が居ない」挙動は撤廃する.

- **REQ-2 「プロジェクトなし」選択肢**: control の先頭 option は
  `<option value="">プロジェクトなし</option>` とする. 起票カード (`<TaskFormCard>`) の
  `<select>` と完全に同じ option 構造とする (D-001).

- **REQ-3 プロジェクト option 列挙**: 親 view から渡される `projects: Project[]` を順序通り
  `<option key={p.id} value={p.id}>{p.name}</option>` で列挙する. 並び順 / フィルタリングは
  親が行い, `<TaskCard>` は受け取った配列をそのまま描画する.

- **REQ-4 現在値の反映**: control の `value` は `task.projectId ?? ""` を反映する.
  `task.projectId === null` のとき先頭の `"プロジェクトなし"` option が selected になる.

- **REQ-5 変更ハンドラ**: control の `onChange` で親に
  `onChangeProject(nextProjectId: string | null)` を流す. `<select>` の value `""` は
  `null` に変換してから親に渡す (= 親は `null | string` の 2 値で扱う).

- **REQ-6 親 view の PATCH 流路**: today-view / tomorrow-view / focus-view は
  `onChangeProject` ハンドラを実装し, 既存 `updateMutation` を経由して
  `repository.update({ id: task.id, ifMatch: task.version, patch: { projectId: next } })` を
  呼ぶ. 成功 / 失敗時の query invalidation / `ConflictDialog` 経路は既存 `updateMutation` を
  そのまま流用する (= `name` 編集 / `priority` 編集と同形).
  - today-view: `["today"]` / `["focus"]` を invalidate.
  - tomorrow-view: `["tomorrow"]` / `["today"]` / `["focus"]` を invalidate
    (既存 `invalidateAfterMoveToToday` と同じ理由で `["today"]` / `["focus"]` も触る).
  - focus-view: `["today"]` / `["focus"]` を invalidate (既存 `invalidateAll` を流用).

- **REQ-7 同値クリックの短絡**: 親ハンドラは `next === task.projectId` のとき PATCH を発行
  しない (= `name` blur 時 / priority 同値クリック時の既存パターン D-001 を踏襲).

- **REQ-8 起票カードへの非波及**: `<TaskFormCard>` (`web/src/ui/task-card/task-form-card.tsx`) は
  本 BL の対象外. 既存の起票時 `<select>` 構造を変更しない. visual / DOM 構造ともに無改修.

- **REQ-9 props API 拡張**: `TaskCardProps` に以下 2 つを追加する.
  - `projects: Project[]` — option 列挙用. 既存の `project: Project | null` (chip 表示用) は
    **そのまま残す** (control 内の `value` 算出は `task.projectId` から行うため厳密には不要だが,
    既存テスト互換と「カードが知るべき情報」の整合のため維持する. D-006).
  - `onChangeProject: (next: string | null) => void` — 必須プロパティ.
    任意プロパティにすると親が忘れた場合に画面に変更不能 control が出てしまうため必須とする.

- **REQ-10 a11y / ラベル付け**:
  control には visually-hidden な `<label>` で「プロジェクト」を関連付ける.
  起票カードと同じ手法 (`.visually-hidden` class) を流用する. id は
  `task-project-${task.id}` のように task id を含めて衝突を防ぐ.

- **REQ-11 視覚言語**: control の見た目は起票カードの `<select>` (= BL-066 で
  `.task-card__header select { ... appearance: none; ... padding ... font-size-small ... }`)
  と同じになる. これは既存セレクタ `.task-card__header select` が `<TaskFormCard>` 専用
  だった前提で書かれているが (BL-066 D-001), 本 BL によって表示側 TaskCard にも `<select>`
  が現れることで自動的に同セレクタが効くようになる. CSS の追加宣言は不要.

  `.project-chip` ルール本文は無改修. `.project-chip` を持つ `<span>` 自体が DOM から
  消えるため, `.task-card__header .project-chip { font-size: ... }` (BL-063 D-003) の
  override も自動的に作用対象を失う. ルール本文 / セレクタ自体は CSS に残置してよい
  (= 別 BL での再利用余地. D-007).

- **REQ-12 routine 由来タスクの扱い**: `task.origin === "routine"` のタスクでもプロジェクト
  変更は可能とする (= 既存ドメインの制約に従う / spec の非ゴール「タスクの並び替えや所属外
  への移動制限」と整合). 「明日にする / 今日にする」 button のような routine 専用の非表示
  ロジック (D-010) は本 control には適用しない.

### 非機能要件

- **NFR-CHIP-PRESERVE**: `web/src/ui/day-view/day-view.css` の `.project-chip` ルール本文を
  本 BL で改変しない (BL-056 / BL-066 と同じ原則).
- **NFR-TOKENS-PRESERVE**: `web/src/styles/tokens.css` を本 BL で改変しない.
- **NFR-HEADER-CHILDREN-PRESERVE**: BL-050 / BL-051 / BL-105 で固定された
  `.day-view__header` の **直接の子要素数規約** (h1 + カウンタ span の 2 要素) は header 配下の
  話であり, `.task-card__header` 配下とは別系統. 本 BL は `.task-card__header` のみを変える.
- **NFR-EXISTING-TESTS-GREEN**: 以下の既存テストが全件 green を維持する.
  - `task-card-component.test.tsx` (BL-059) — AC-7 / AC-15〜AC-17 / AC-21 等 prop / view 接続.
  - `task-card-zone-layout.test.tsx` (BL-058) — 3 段ゾーン構造.
  - `task-card-actions-reorder.test.tsx` (BL-063) — actions 段の auto-margin.
  - `task-card-hotfix.test.tsx` (BL-063) — `.task-card__header .project-chip` font override.
    `<TaskCard>` 表示側に `.project-chip` を持つ `<span>` が出ない方向に変わるため,
    既存テストが「特定タスクが chip を持つ」前提なら本 BL で **更新する必要がある**
    (互換性のため新規 props を追加する形で実装し, テスト更新も本 BL の範囲とする).
  - `task-card-design.test.ts` — CSS 直読み系.
  - `project-chip.test.tsx` (BL-056) — `.project-chip` ルール本文の不変性.
    本 BL でルール本文を触らないため green 維持.
  - `today-view.test.tsx` / `tomorrow-view.test.tsx` / `focus-view.test.tsx` /
    `unified-day-view.test.tsx` — 親 view のレンダ / 機能.
- **NFR-A11Y**: control は `<label>` で関連付けされ, キーボード操作 (Tab / 矢印キー / Home / End /
  type-ahead) が native `<select>` 経由で利用可能. WCAG AA を満たす.
- **NFR-OFFLINE**: 既存 `updateMutation` の offline 書込キュー流路を共有するため,
  offline 時は楽観成功 + キュー保存となる (BL-029 / BL-031 既存挙動の踏襲).
- **NFR-OPTIMISTIC-LOCK**: `PATCH` 競合時の 412 / `OptimisticLockError` →
  `ConflictDialog` 経路を既存 `updateMutation` から流用する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

### UI 表示 (REQ-1 / REQ-2 / REQ-3 / REQ-4)

```
シナリオ: プロジェクト付きタスクのカードに `<select>` control が描画される
  Given 今日ビュー (/today) を開いた
  And   タスク A (projectId = "p1", project name = "プロジェクトα") が表示されている
  And   プロジェクト一覧に「プロジェクトα」「プロジェクトβ」の 2 件が存在する
  When  タスク A のカード (`.task-card`) を観察する
  Then  カード内に `<select>` 要素がちょうど 1 個存在する
  And   その `<select>` の value は "p1" である
  And   その `<select>` の option は 3 個 (先頭「プロジェクトなし」/「プロジェクトα」/「プロジェクトβ」) である
  And   先頭 option の value は "" / textContent は「プロジェクトなし」である
```

```
シナリオ: プロジェクト未割当タスクのカードでも control が描画され「プロジェクトなし」が選択される
  Given 今日ビュー (/today) を開いた
  And   タスク B (projectId = null) が表示されている
  When  タスク B のカードを観察する
  Then  カード内に `<select>` 要素がちょうど 1 個存在する
  And   その `<select>` の value は "" (空文字) である
  And   先頭 option (「プロジェクトなし」) が selected である
```

```
シナリオ: タスクカードから旧 `.project-chip` `<span>` が消える
  Given 今日ビュー (/today) を開いた
  And   タスク A (projectId = "p1") が表示されている
  When  タスク A のカード内を観察する
  Then  `.project-chip` className を持つ `<span>` 要素は存在しない
  And   代わりに `.task-card__header select` がプロジェクト情報を担っている
```

### 変更ハンドラ (REQ-5 / REQ-6 / REQ-7)

```
シナリオ: プロジェクト変更 (項目 → 項目) で PATCH /api/v1/tasks/:id が発行される
  Given タスク A (projectId = "p1", version = 1) が今日ビューに表示されている
  When  ユーザーがカード内 `<select>` で「プロジェクトβ」 (value = "p2") を選択する
  Then  taskRepository.update が呼ばれる
  And   引数は { id: "task-a", ifMatch: 1, patch: { projectId: "p2" } } と等価である
  And   成功後 ["today"] と ["focus"] が invalidate される
```

```
シナリオ: 「プロジェクトなし」選択で projectId: null が PATCH 送出される
  Given タスク A (projectId = "p1", version = 1) が今日ビューに表示されている
  When  ユーザーがカード内 `<select>` で「プロジェクトなし」 (value = "") を選択する
  Then  taskRepository.update が呼ばれる
  And   引数は { id: "task-a", ifMatch: 1, patch: { projectId: null } } と等価である
        (= 空文字ではなく明示的 null)
```

```
シナリオ: 未設定タスクへのプロジェクト割当で projectId が文字列で送出される
  Given タスク B (projectId = null, version = 1) が今日ビューに表示されている
  When  ユーザーがカード内 `<select>` で「プロジェクトα」 (value = "p1") を選択する
  Then  taskRepository.update が呼ばれる
  And   引数は { id: "task-b", ifMatch: 1, patch: { projectId: "p1" } } と等価である
```

```
シナリオ: 同値選択は PATCH を発行しない (短絡 / REQ-7)
  Given タスク A (projectId = "p1", version = 1) が今日ビューに表示されている
  When  ユーザーがカード内 `<select>` で同じ「プロジェクトα」 (value = "p1") を選択する
        (= onChange が現状値で発火する経路)
  Then  taskRepository.update は呼ばれない
```

### 親 view 適用 (REQ-6)

```
シナリオ: 明日ビューでもプロジェクト変更が可能で ["tomorrow"] / ["today"] / ["focus"] が invalidate される
  Given 明日ビュー (/tomorrow) を開いた
  And   タスク C (projectId = "p1", dueDate = "tomorrow", version = 1) が表示されている
  When  ユーザーがカード内 `<select>` で「プロジェクトβ」 (value = "p2") を選択する
  Then  taskRepository.update が { id: "task-c", ifMatch: 1, patch: { projectId: "p2" } } で呼ばれる
  And   成功後 ["tomorrow"] / ["today"] / ["focus"] が invalidate される
```

```
シナリオ: focus ビューでも focusedTask のプロジェクト変更が可能である
  Given /focus を開き, focusedTask = タスク A (projectId = "p1", version = 1) が表示されている
  When  ユーザーがカード内 `<select>` で「プロジェクトβ」 (value = "p2") を選択する
  Then  taskRepository.update が { id: "task-a", ifMatch: 1, patch: { projectId: "p2" } } で呼ばれる
  And   成功後 ["today"] / ["focus"] が invalidate される
```

### 競合 / オフライン (REQ-6 / NFR-OPTIMISTIC-LOCK / NFR-OFFLINE)

```
シナリオ: 楽観的ロック競合時に ConflictDialog が開く
  Given タスク A (projectId = "p1", version = 1) が今日ビューに表示されている
  And   サーバ側 version は既に 2 に進んでいる (他クライアントで更新済み)
  When  ユーザーがカード内 `<select>` で「プロジェクトβ」を選択する
  Then  PATCH が 412 を返し OptimisticLockError → ConflictError 変換が起きる
  And   ConflictDialog が open=true になる
```

```
シナリオ: オフライン時はキューに保存され楽観成功する
  Given navigator.onLine = false である
  And   タスク A (projectId = "p1", version = 1) が今日ビューに表示されている
  When  ユーザーがカード内 `<select>` で「プロジェクトβ」を選択する
  Then  offline-queue に PATCH /api/v1/tasks/task-a の entry が積まれる
  And   notifyError は呼ばれない
```

### a11y (REQ-10)

```
シナリオ: control に「プロジェクト」 label が関連付けされている
  Given 今日ビューにタスク A のカードが表示されている
  When  カード内 `<select>` を観察する
  Then  対応する `<label>` 要素が存在し, htmlFor が `<select>` の id と一致する
  And   `<label>` の textContent は「プロジェクト」を含む
  And   `<label>` は `.visually-hidden` class で視覚的に隠されている
```

```
シナリオ: control の id は task id を含み他タスクと衝突しない
  Given 今日ビューにタスク A (id="task-a") とタスク B (id="task-b") が表示されている
  When  両カードの `<select>` の id を観察する
  Then  それぞれ "task-project-task-a" / "task-project-task-b" のように task id を含み, 互いに異なる
```

### 視覚言語 / CSS (REQ-11)

```
シナリオ: control の見た目は起票カードの `<select>` と同じ (= 既存 .task-card__header select ルールが適用される)
  Given web/src/ui/task-card/task-card.css の `.task-card__header select` ルールを開く
  When  ルール本体を読む
  Then  本 BL で当該ルール本体は変更されていない (BL-066 当時の宣言のまま)
  And   そのルールが表示側 `<TaskCard>` 内の `<select>` にも適用される (CSS specificity に基づく / 自明)
```

```
シナリオ: `.project-chip` ルール本体は無改修
  Given web/src/ui/day-view/day-view.css の `.project-chip` ルールを開く
  When  ルール本体を読む
  Then  本 BL でルール本体は変更されていない (BL-056 / BL-066 と同じ非破壊原則)
```

### routine 由来タスクの扱い (REQ-12)

```
シナリオ: routine 由来タスクでもプロジェクト変更 control は表示される
  Given タスク D (origin = "routine", projectId = "p1") が今日ビューに表示されている
  When  タスク D のカード内を観察する
  Then  `<select>` 要素が存在し, value = "p1" が選択されている
  And   `<select>` は disabled ではない
```

### 既存テスト互換性 (NFR-EXISTING-TESTS-GREEN)

```
シナリオ: 既存テストスイートが全件 green である
  Given BL-108 の実装作業が完了した
  When  vitest 全件 (`npx vitest run`) と Playwright 全件 (`npm -w e2e test`) を実行する
  Then  全テストが green (失敗ゼロ) である
  And   lint / typecheck (`npm run lint` / `npm run typecheck`) が 0 警告 0 エラーである
```

## 確定した UI 形態 (背景の決定記録)

backlog では 3 案 (a: button + popover / b: native `<select>` / c: chip 隣に「変更」 button +
モーダル) が示された. 本 spec では **案 b (native `<select>`)** を採用する.

### 採用案: b — `<select>` (native dropdown)

- 起票カード (`<TaskFormCard>`) で既に同形 `<select>` を用いて「プロジェクトなし」+
  プロジェクト一覧を提示しており, 起票時と編集時の視覚言語と操作モデルが完全一致する.
- a11y: native `<select>` は `role="combobox"` 相当の挙動を自動で備える. キーボード
  (Tab / 矢印キー / Home / End / type-ahead) / モバイル native ピッカー / 読み上げソフト
  対応が OS / ブラウザ側で担保される. `aria-haspopup="listbox"` + 自前 popover は同等の
  挙動を自前で組む必要があり工数が大きい.
- CSS: BL-066 で導入済みの `.task-card__header select` ルールがそのまま流用でき, chip と
  視覚的に揃ったコンパクトな box になる. tokens.css / 共通 CSS 改修は不要.
- 既存テスト互換: chip `<span>` → `<select>` への置換は `getByRole("combobox")` /
  `getByText("プロジェクトα")` (option textContent) で代替可能. `.project-chip` を
  探していたテストは本 BL のスコープで一緒に更新する.

### 不採用案: a — button + popover (aria-haspopup="listbox")

- 自前 popover の focus trap / 配置計算 / モバイル対応 / 外部クリック判定など追加工数大.
- 視覚言語が起票カードと食い違う (起票は `<select>`, 編集は popover) のは UX として
  ちぐはぐ.

### 不採用案: c — chip 隣に「変更」 button + モーダル展開

- 「変更」 button で `.task-card__header` の子要素数が 1 増える. 4 view の header
  layout / actions auto-margin パターン (BL-063 D-002) との整合確認が増える.
- モーダルは「即時 inline 編集」(BL-070 で確立した方針) と整合しない. NFR-010 最小手数の
  編集に反する.

## 既存テスト互換性 / 影響範囲詳細

### 更新を要する既存テスト

`<TaskCard>` を `project` だけ渡して呼び出している既存テストは, `projects` と
`onChangeProject` 必須 prop の追加に追従させる必要がある. 具体的には:

- `web/__tests__/task-card-zone-layout.test.tsx` — `<TaskCard>` を直 render する箇所.
- `web/__tests__/task-card-component.test.tsx` — `<TaskCard>` を直 render する箇所と,
  今日/明日/focus view 経由レンダの assert.
- `web/__tests__/task-card-actions-reorder.test.tsx` — `<TaskCard>` を直 render する箇所.
- `web/__tests__/task-card-hotfix.test.tsx` — `.project-chip` の存在前提の assert は,
  「`<select>` が描画される」前提に書き換える (chip 自体が DOM から消えるため).
- `web/__tests__/today-view.test.tsx` / `tomorrow-view.test.tsx` / `focus-view.test.tsx` /
  `unified-day-view.test.tsx` — view 経由のレンダ. 必要なら mock projectRepository.list の
  返却値を 1 件以上に揃え, `<select>` の option / value を assert する shared helper を
  追加する. 既存の name 入力 / priority / アクション assert は無改修で green を維持する.

### 触らない既存テスト

- `web/__tests__/project-chip.test.tsx` — ルール本文 / 共通スタイルの不変性のみを検証する
  AC のみが残っている前提で, 本 BL で touch しない.
- `web/__tests__/task-card-design.test.ts` — CSS 直読み系. `.task-card` 系の基底 visual が
  維持されているかを assert. 本 BL では `.task-card__header select` ルールは BL-066 当時の
  まま無改修なので green 維持.

## 未決事項 / 確認待ち

- なし.
  - UI 形態 (a/b/c) は **b (native `<select>`)** で確定 (上記「確定した UI 形態」).
  - `onChangeProject` を必須 prop にするか optional にするかは, 必須に **確定**.
    任意にすると「親が忘れた場合に変更不能 control が描画される」リスクが残るため.
  - `projects` prop の並び順 / フィルタは親責務に **確定** (TaskCard は受け取ったまま列挙).
  - control の id 命名は `task-project-${task.id}` に **確定** (一覧内で衝突しない最小要件).
  - 視覚的な「現在のプロジェクト名表示」と「変更 control」の二重提供はしない.
    `<select>` の selected option 表示で兼ねる方針で **確定**.
