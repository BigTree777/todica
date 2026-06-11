# 設計・実装計画: TaskCard / TaskFormCard 実機遺漏の一括 hotfix (task-card-hotfix)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

BL-059 で新設した `<TaskCard>` / `<TaskFormCard>` / `task-card.css` に対して, 実機検証で発覚した 5 件の遺漏を **CSS の追加・上書き** と **`TaskFormCard.tsx` の JSX 微修正 (label の visually-hidden 化 + input の placeholder 追加)** で**一括解消**する.

- 修正 1 (PriorityStars 右固定): `<TaskCard>` で `<PriorityStars />` を `<div className="task-card__header__priority">` でラップし, CSS 側でラップ div に `margin-left: auto` を当てる.
- 修正 2 (TaskCard actions 両端 + 中間中央): 削除 / 完了 button に専用 className を付け, CSS 側で `margin-right: auto` / `margin-left: auto` の auto-margin パターンを当てる. `.task-card__actions` 本体の `justify-content: center` (BL-059 V-2) は撤去.
- 修正 3 (chip font 競合): `task-card.css` 内に `.task-card__header .project-chip { font-size: var(--font-size-small) }` を追加し, specificity を 2 class に強化して `.project-toggle__button` (1 class) に勝つ.
- 修正 4 (label プレースホルダ化): `<label>` に `className="visually-hidden"` を追加 + `<input>` に `placeholder="タスク名"` を追加. `.visually-hidden` クラスは `task-card.css` 末尾に新規定義. `::placeholder` には `color: var(--color-fg-subtle)` を当てる.
- 修正 5 (起票カード 追加 button 右端): `.task-card--form .task-card__actions { justify-content: flex-end }` を追加.

`<TaskCard>` / `<TaskFormCard>` の prop 型および各 view の呼び出し側は**無改修**. PriorityStars / ProjectToggle / `.project-chip` / tokens.css も**無改修** (Hotfix の最小変更原則).

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (NFR-COMPAT) |
| DB | 変更なし |
| domain | 変更なし |
| サーバ (`server/`) | 変更なし |
| Repository / mutation / query / ConflictDialog / notifyError | 変更なし (NFR-COMPAT) |
| トークン (`web/src/styles/tokens.css`) | **変更なし** (NFR-NO-NEW-TOKENS / G-9) |
| 既存 (`web/src/ui/task-card/task-card.tsx`) | `<PriorityStars />` を `<div className="task-card__header__priority">` でラップ (REQ-1 / 1-1). 「削除」 button に `className="task-card__actions__delete"` を, 「完了」 button に `className="task-card__actions__complete"` を付与 (REQ-2 / 2-1). prop 型および公開 API は無改修 (G-7 / AC-16) |
| 既存 (`web/src/ui/task-card/task-form-card.tsx`) | `<label htmlFor={inputId}>タスク名</label>` に `className="visually-hidden"` を追加 (REQ-4 / 4-1). 同 `<input>` に `placeholder="タスク名"` を追加 (REQ-4 / 4-2). prop 型および公開 API は無改修 |
| 既存 (`web/src/ui/task-card/task-card.css`) | `.task-card__header__priority { margin-left: auto }` 追加 (REQ-1 / 1-2). `.task-card__actions` から `justify-content: center` を撤去 (REQ-2 / 2-2). `.task-card__actions__delete { margin-right: auto }` / `.task-card__actions__complete { margin-left: auto }` 追加 (REQ-2 / 2-3 / 2-4). `.task-card__header .project-chip { font-size: var(--font-size-small) }` 追加 (REQ-3 / 3-1). `.task-card__title input[type="text"]::placeholder { color: var(--color-fg-subtle) }` 追加 (REQ-4 / 4-5). `.task-card--form .task-card__actions { justify-content: flex-end }` 追加 (REQ-5 / 5-1). `.visually-hidden { position: absolute; ... }` 末尾追加 (REQ-4 / 4-4) |
| Component (`web/src/ui/priority-stars/priority-stars.tsx`) | **変更なし** (REQ-7 / NFR-COMPONENT-API-FROZEN / G-8) |
| Component (`web/src/ui/project-toggle/project-toggle.tsx`) | **変更なし** (REQ-7 / NFR-COMPONENT-API-FROZEN / G-8) |
| CSS (`web/src/ui/project-toggle/project-toggle.css`) | **変更なし** (REQ-7 / G-8). 既存の `.project-toggle__button` ルール (`font-size: 1rem`) はそのまま. specificity 強化で task-card 文脈内のみ上書きする. |
| CSS (`web/src/ui/day-view/day-view.css`) | **変更なし** (REQ-7 / NFR-CHIP-PRESERVE). `.project-chip` ルール本文 (5 宣言) はそのまま |
| JSX (`web/src/ui/today-view/today-view.tsx` / `tomorrow-view/tomorrow-view.tsx` / `focus-view/focus-view.tsx`) | **変更なし** (G-7). `<TaskCard>` / `<TaskFormCard>` の呼び出し側 props も無改修 |
| 新規 単体テスト (`web/__tests__/task-card-hotfix.test.tsx`) | CSS 直読み + jsdom DOM レンダで AC-1 〜 AC-22 を網羅 (D-006) |
| 既存単体テスト追従 (`web/__tests__/task-card-component.test.tsx`) | BL-059 AC-5 (= `.task-card__actions { justify-content: center }` assert) を撤去確認に**逆転** (D-007). 他 AC は維持 |
| E2E (`e2e/*.spec.ts`) | 原則無改修. role + accessibleName ベースのロケータは label の visually-hidden 化でも引き続き機能する想定. 念のため `e2e/today-view-create-form.spec.ts` / `e2e/tasks.spec.ts` / `e2e/a11y.spec.ts` を回帰確認 |

## 設計詳細

### データモデル

変更なし. 本 BL は presentation 層 (CSS + JSX 微修正) のみ.

### 処理フロー / DOM 構造の差分

#### `<TaskCard>` の DOM 差分 (REQ-1 / REQ-2)

```diff
 <Tag className={className} aria-label={ariaLabel}>
   <div className="task-card__header">
     {project && <span className="project-chip">{project.name}</span>}
-    {showPriority && onSetPriority && (
-      <PriorityStars
-        value={task.priority}
-        onChange={onSetPriority}
-        groupLabel={`${task.name} の優先度`}
-        idPrefix={`task-${task.id}`}
-      />
-    )}
+    {showPriority && onSetPriority && (
+      <div className="task-card__header__priority">
+        <PriorityStars
+          value={task.priority}
+          onChange={onSetPriority}
+          groupLabel={`${task.name} の優先度`}
+          idPrefix={`task-${task.id}`}
+        />
+      </div>
+    )}
   </div>
   <div className="task-card__title">
     <span>{task.name}</span>
   </div>
   <div className="task-card__actions">
     {showSetFocus && onSetFocus && (
       <button type="button" onClick={onSetFocus}>
         現在のタスクにする
       </button>
     )}
-    <button type="button" onClick={onDelete}>
+    <button type="button" className="task-card__actions__delete" onClick={onDelete}>
       削除
     </button>
     {showDueDateBtn && onToggleDueDate && (
       <button type="button" onClick={onToggleDueDate}>
         {dueDateMode === "today" ? "明日にする" : "今日にする"}
       </button>
     )}
-    <button type="button" onClick={onComplete}>
+    <button type="button" className="task-card__actions__complete" onClick={onComplete}>
       完了
     </button>
   </div>
 </Tag>
```

- header 段では `.task-card__header__priority` ラッパ div を `showPriority && onSetPriority` の条件下のみ出力. つまり tomorrow-view (`showPriority={false}`) ではラッパも PriorityStars も出ない.
- 「現在のタスクにする」「明日にする」「今日にする」 button にはラベル用 className を付けない (= D-002 の auto-margin パターン外).
- focus-view (`actionSet="minimal"`) では「現在のタスクにする」「明日にする」「今日にする」が全て出ず, 「削除 (margin-right: auto)」「完了 (margin-left: auto)」のみが残り両端配置になる.

#### `<TaskFormCard>` の DOM 差分 (REQ-4)

```diff
 <form onSubmit={onSubmit} aria-label={formAriaLabel} className="task-card task-card--form">
   <div className="task-card__header">
     <ProjectToggle
       value={projectId === "" ? null : projectId}
       onChange={(next) => onProjectIdChange(next ?? "")}
       projects={projects}
       idPrefix={idPrefix}
       groupLabel="プロジェクト"
     />
     <PriorityStars
       value={priority}
       onChange={onPriorityChange}
       groupLabel="優先度"
       idPrefix={idPrefix}
     />
   </div>
   <div className="task-card__title">
-    <label htmlFor={inputId}>タスク名</label>
+    <label htmlFor={inputId} className="visually-hidden">タスク名</label>
     <input
       id={inputId}
       type="text"
+      placeholder="タスク名"
       value={name}
       onChange={(e) => onNameChange(e.target.value)}
       required
     />
   </div>
   <div className="task-card__actions">
     <button type="submit">追加</button>
   </div>
 </form>
```

- TaskFormCard の header 段では PriorityStars をラップしない (= REQ-1 のラップ追加は TaskCard 側のみ. 起票カードでは `<ProjectToggle />` (左) と `<PriorityStars />` (右) を `.task-card__header` の `justify-content: space-between` で左右配置するため, ラップ不要).
  - 補足: 仮に project 0 件で `<ProjectToggle />` が visually 空になるケースを想定しても, ProjectToggle 自体は要素を出力する (空でも button や null state UI を出す) ため, space-between の左右配置は維持される.
- `<label>` は `className="visually-hidden"` で視覚的に隠れるが accessibleName と `for` 属性は維持されるため `getByLabelText("タスク名")` で input が取得可能.
- `<input>` の `placeholder="タスク名"` はブラウザ既定で `.task-card__title` の `font-size: var(--font-size-h2)` を継承する (`font: inherit` 経由).

#### CSS (`task-card.css`) の差分

```diff
 .task-card__header {
   display: flex;
   align-items: center;
   /* V-3: chip (左) と PriorityStars (右) を左右に分ける. */
   justify-content: space-between;
   gap: var(--space-sm);
 }
+
+/*
+ * BL-063 (task-card-hotfix) REQ-1 / D-001:
+ * project 未設定タスク (= chip 無し) で PriorityStars が左に寄る問題を解消する.
+ * .task-card__header の justify-content: space-between は維持しつつ,
+ * PriorityStars の wrap div に margin-left: auto を当てて常に右に押し出す.
+ */
+.task-card__header__priority {
+  margin-left: auto;
+}
+
+/*
+ * BL-063 REQ-3 / D-003:
+ * 起票カードの ProjectToggle (= .project-toggle__button.project-chip) の font-size が
+ * .project-toggle__button { font-size: 1rem } に負ける問題を specificity 強化で解消する.
+ * (.project-chip 本体は無改修 / NFR-CHIP-PRESERVE.)
+ */
+.task-card__header .project-chip {
+  font-size: var(--font-size-small);
+}

 .task-card__title {
   display: flex;
   align-items: center;
   /* V-4: タスク名を中央寄せ. */
   justify-content: center;
   gap: var(--space-md);
   /* V-4 / V-7: フォント拡大 (--font-size-h2 = 20px). 子の span / input に継承される. */
   font-size: var(--font-size-h2);
 }

 /* V-7: input はブラウザ既定で font を継承しない. 明示的に親の font を継承させる. */
 .task-card__title input[type="text"] {
   font: inherit;
 }
+
+/*
+ * BL-063 REQ-4 / 4-5:
+ * 起票カードのタスク名 placeholder は「薄く」表示する.
+ */
+.task-card__title input[type="text"]::placeholder {
+  color: var(--color-fg-subtle);
+}

 .task-card__actions {
   display: flex;
   align-items: center;
-  /* V-2: ボタン中央揃え (旧 .day-view__card__actions の flex-end から変更). */
-  justify-content: center;
   gap: var(--space-sm);
   /* 狭幅端末への安全弁. */
   flex-wrap: wrap;
 }
+
+/*
+ * BL-063 REQ-2 / D-002:
+ * 「削除」を左端, 「完了」を右端に固定. 中間ボタンは自然に中央に集まる.
+ * focus-view (actionSet="minimal" / 2 ボタン) でも margin-right: auto と margin-left: auto が
+ * 拮抗して両端配置が成立する.
+ */
+.task-card__actions__delete {
+  margin-right: auto;
+}
+.task-card__actions__complete {
+  margin-left: auto;
+}
+
+/*
+ * BL-063 REQ-5 / D-005:
+ * 起票カード (.task-card--form) の actions は「追加」 button を右端に配置.
+ * .task-card__actions の auto-margin パターン (REQ-2) は子に対象 className を持つ button が
+ * 居ないため作動せず, ここでは単純に justify-content: flex-end で右寄せできる.
+ */
+.task-card--form .task-card__actions {
+  justify-content: flex-end;
+}
+
+/*
+ * BL-063 REQ-4 / D-004:
+ * a11y 用に accessibleName を残しつつ視覚的に label を隠すユーティリティ.
+ * project-toggle.css の [data-visually-hidden] と同等の効果. 本 BL のスコープ内では
+ * <TaskFormCard> の <label htmlFor={inputId}>タスク名</label> でのみ使用する.
+ */
+.visually-hidden {
+  position: absolute;
+  width: 1px;
+  height: 1px;
+  padding: 0;
+  margin: -1px;
+  overflow: hidden;
+  clip: rect(0, 0, 0, 0);
+  white-space: nowrap;
+  border: 0;
+}
```

#### CSS specificity の確認 (REQ-3)

| セレクタ | specificity | font-size |
| --- | --- | --- |
| `.project-chip` (day-view.css) | 0,1,0 | `var(--font-size-small)` (= 14px) |
| `.project-toggle__button` (project-toggle.css) | 0,1,0 | `1rem` (= 16px) |
| `.task-card__header .project-chip` (本 BL 追加) | 0,2,0 | `var(--font-size-small)` (= 14px) |

specificity が `0,2,0` で他 2 つに勝つため, source order に依らず確実に 14px が適用される.

#### `.task-card__actions` の actionSet 別 button 配置 (REQ-2)

`actionSet="full"` + `showSetFocus={true}` (= today-view otherTasks, 4 ボタン):

```
[削除]  [現在のタスクにする]  [明日にする]  [完了]
 |                                            |
 margin-right: auto                  margin-left: auto
 → 左端に固定                       → 右端に固定
 中間 2 ボタンは間で自動に中央寄りに集まる (空きスペースは auto-margin が吸収)
```

`actionSet="full"` + `showSetFocus={false}` (= today-view focused / tomorrow-view, 3 ボタン):

```
[削除]  [明日にする(今日にする)]  [完了]
 |                                  |
 margin-right: auto         margin-left: auto
 → 左端                    → 右端
 中間 1 ボタンは中央寄り
```

`actionSet="minimal"` (= focus-view, 2 ボタン):

```
[削除]  [完了]
 |        |
 margin-right: auto  margin-left: auto
 → 左端              → 右端
 (2 ボタンの auto-margin が拮抗して両端配置 = space-between 相当)
```

`actionSet="full"` で `task.origin === "routine"` (= 「明日にする / 今日にする」を出さない, 3 ボタン or 2 ボタン):

```
[削除]  ([現在のタスクにする])  [完了]
 |                                |
 margin-right: auto      margin-left: auto
 → 左端                  → 右端
```

### 例外 / エラー処理

本 BL は presentation 層 (CSS + JSX 微修正) のため新規例外経路は無い. 既存の mutation / query エラーフローは無改修.

### 重要な決定 (plan 固有)

spec.md の D 章を参照. ここでは plan 固有の決定を追記する.

- **P-001 (PriorityStars wrap div のクラス名: BEM 流の `__header__priority` 採用)**: 既存の `.task-card__header` 配下を表現する命名として `.task-card__header__priority` を採用. BL-059 で `.task-card__header` / `.task-card__title` / `.task-card__actions` の BEM 命名が確立しており, その流儀に整合する.
- **P-002 (delete / complete button のクラス名: BEM 流の `__actions__delete` / `__actions__complete` 採用)**: 同様に `.task-card__actions__delete` / `.task-card__actions__complete` で BEM 整合. `data-*` 属性での識別 (e.g. `data-action="delete"`) も候補だが, CSS の auto-margin パターンに対しては className の方がセレクタが簡潔.
- **P-003 (CSS 宣言追加位置)**: 本 BL の追加宣言は task-card.css の以下の位置に配置する.
  - `.task-card__header__priority` → `.task-card__header` の**直下**.
  - `.task-card__header .project-chip` → `.task-card__header__priority` の**直下**.
  - `.task-card__title input[type="text"]::placeholder` → `.task-card__title input[type="text"]` の**直下**.
  - `.task-card__actions__delete` / `.task-card__actions__complete` → `.task-card__actions` の**直下**.
  - `.task-card--form .task-card__actions` → `.task-card__actions__complete` の**直下**.
  - `.visually-hidden` → ファイル**末尾**.
- **P-004 (`.task-card__actions` の `justify-content` 撤去判断)**: BL-059 で `justify-content: center` を入れていたが, 本 BL で撤去する. `justify-content` を指定しないと flex の default は `flex-start` になり, 子要素は左寄せから始まる. しかし削除に `margin-right: auto` が当たることで, 削除以降の全要素が右に押し出される. つまり「削除 → 大きな余白 → 残りの button」という配置になる. さらに完了に `margin-left: auto` が当たることで, 完了以前の全要素 (= 中間 button) が左に押し付けられる. 結果として「削除左 / 中間中央寄り / 完了右」が成立する. AC-4 で `justify-content: center` も `justify-content: flex-end` も含まれないことを assert する.
- **P-005 (`.visually-hidden` の活性化条件)**: WCAG accessible には `:not(:focus):not(:active)` で focus 時に visible にする活性化版もあるが, label は通常 focus されない (focus されるのは input). 本 BL では簡易版で十分 (= 常時非表示). `:focus` 等の活性化条件を入れる場合は別 BL で再評価.
- **P-006 (`.task-card__header__priority` の挿入条件)**: `<TaskCard>` 内では `showPriority && onSetPriority` の条件下のみ wrap div を出力する. tomorrow-view (`showPriority={false}`) では wrap div も PriorityStars も出ない. これは BL-059 の挙動を維持する.
- **P-007 (`<TaskFormCard>` 側で PriorityStars はラップしない)**: 起票カードの header 段は `<ProjectToggle />` (左) + `<PriorityStars />` (右) で `justify-content: space-between` により左右配置が成立する. PriorityStars 側に `margin-left: auto` を当てる必要は無い (= ProjectToggle が常に存在するため). 本 BL ではラップを追加しない.
- **P-008 (placeholder のサイズと色)**:
  - フォントサイズ: `.task-card__title { font-size: var(--font-size-h2) }` + `.task-card__title input[type="text"] { font: inherit }` の継承で input は 20px. `::placeholder` は input の font を継承するため placeholder も 20px (= 入力済テキストと同サイズ).
  - 色: `::placeholder` ブラウザ既定は薄いグレー (約 50% opacity の current color). ただし WCAG コントラスト確保のため明示的に `--color-fg-subtle` (= `#595959`, WCAG AAA 7:1 on #fff) を当てる. これは BL-046 で確定済みのトークン.
- **P-009 (既存テスト追従の最小化)**: D-007 で BL-059 の AC-5 (= `.task-card__actions { justify-content: center }` の存在期待) の**逆転**のみが必須. 他の AC は本 BL で変更しない. 「actions が DOM に存在する」「3 ボタン or 2 ボタンが出る」「ボタンのテキスト」等の assert は本 BL の className 追加では破壊されない.

## リスク / 代替案

### リスク

- **R-001 (CSS specificity 競合の解消が他箇所に副作用を起こす)**: `.task-card__header .project-chip` の追加で, タスクカード側の `<span className="project-chip">` も font-size: 14px が当たる. これは BL-056 の本来の挙動と一致するため**問題なし**. ただし他 view (project-view / routine-view など) で同じセレクタ階層が将来発生した場合に意図せず効く可能性は残る. 緩和策: CSS コメントで「task-card 文脈限定」を明示, AC-9 / AC-10 で意図と効果を assert.
- **R-002 (`.task-card__actions` の `justify-content` 撤去で button 配置が崩れる)**: BL-059 V-2 の `center` 撤去後に `flex-start` が default になり, 一見「全部左寄せ」になりそうだが, 削除 button の `margin-right: auto` が後続要素を右に押し出すため設計通り成立する. 緩和策: jsdom DOM レンダで「削除に margin-right: auto」「完了に margin-left: auto」「`.task-card__actions` 本体に justify-content: center が無い」を CSS 直読みと jsdom 両系統で確認 (AC-4 / AC-5 / AC-6 / AC-7 / AC-8).
- **R-003 (PriorityStars wrap div の追加で既存 DOM 構造 assert が壊れる)**: BL-059 task-card-component.test.tsx で「`.task-card__header` の直下に radiogroup が居る」ことを assert している可能性. 緩和策: wrap div の追加箇所を明示し, 追従修正が必要なら D-007 / P-009 で対応. ただし「radiogroup の祖先に `.task-card__header` がある」形の assert なら壊れない. 確認は test-designer / implementer 経路で.
- **R-004 (label の visually-hidden 化で a11y 違反が出る)**: axe-core は `<label htmlFor>` ↔ `<input id>` の関連付けが保たれていれば label 自体が visually-hidden でも違反としない. 緩和策: AC-25 (a11y E2E violations 0) で機械検証.
- **R-005 (placeholder の WCAG コントラスト違反)**: `--color-fg-subtle` (#595959) は #fff 背景に対し contrast 7.0:1 で WCAG AAA. 違反は発生しない想定. ただし axe-core が placeholder のコントラストを直接見るかは未確認. 緩和策: AC-25 で機械検証. 違反が出た場合は `--color-fg` (= #1a1a1a) を半透明で表現する代替案あり (CSS variable で alpha 合成は別 BL).
- **R-006 (起票カードの actions に「追加」以外の button が追加された時 D-005 が破綻)**: 現状は子 1 つだが将来「キャンセル」が追加された場合 `flex-end` だと両方が右端に寄る. 緩和策: その BL で `justify-content: space-between` に変更すれば対応可. spec / D-005 で代替案を明示済み.
- **R-007 (既存 BL-059 AC-5 テストが落ちる)**: D-007 の追従が必須. test-designer で確実に対応する.

### 代替案

- **代替案 A (修正 2 を `space-between` + 中間 button wrap div で実装)**: 中間 button を `<div className="task-card__actions__center">` で wrap し, 親 `.task-card__actions` に `justify-content: space-between` を当てる. → 中間 button の数が動的 (showSetFocus / dueDateMode で変動) で wrap 内の幅も変動し, 視覚的に揺れる. 不採用 (D-002 で確定).
- **代替案 B (修正 3 を `!important` で解消)**: `.project-chip { font-size: var(--font-size-small) !important }`. → 影響範囲が広く, 将来の上書き判断が困難になる. 不採用 (D-003 で確定).
- **代替案 C (修正 4 を新規 `utilities.css` で実装)**: グローバル utility class として配置. → 新規ファイル + main.tsx に新規 import で影響が広い. 本 BL のスコープには過剰. 不採用 (D-004 で確定).
- **代替案 D (修正 1 を header 全体の `justify-content: flex-end` で実装)**: header 全体を右寄せに変更し, chip 専用に `margin-right: auto` を当てる. → BL-059 V-3 の挙動を反転する変更になり, 影響範囲が大きい. 不採用 (D-001 で確定).
- **代替案 E (修正 5 を `space-between` で実装)**: 将来「キャンセル」追加時に自動で左右配置になる. → 現時点で意図が読みにくい. 必要になった BL で再変更する方が読みやすい. 不採用 (D-005 で確定).

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト (`web/__tests__/task-card-hotfix.test.tsx`)

CSS 直読み + jsdom DOM レンダの 2 系統で AC-1 〜 AC-22 を網羅する. BL-059 (`task-card-component.test.tsx`) と同じ実装スタイル (extractRuleBody ヘルパを再定義).

#### (a) CSS 直読み系 assert

- AC-1: `.task-card__header__priority` ルール本文に `margin-left: auto` が存在.
- AC-4: `.task-card__actions` ルール本文に `justify-content: center` も `justify-content: flex-end` も存在しない.
- AC-5: `.task-card__actions__delete` ルール本文に `margin-right: auto` が存在.
- AC-6: `.task-card__actions__complete` ルール本文に `margin-left: auto` が存在.
- AC-9: `.task-card__header .project-chip` ルール本文に `font-size: var(--font-size-small)` が存在.
- AC-11: `.visually-hidden` ルール本文に `position: absolute` / `width: 1px` / `height: 1px` / `clip: rect(0, 0, 0, 0)` / `overflow: hidden` が存在.
- AC-13: `.task-card__title input[type="text"]::placeholder` ルール本文に `color: var(--color-fg-subtle)` が存在.
- AC-14: `.task-card--form .task-card__actions` ルール本文に `justify-content: flex-end` が存在.
- AC-17: PriorityStars / ProjectToggle / project-chip のソース / CSS ルール本文が無改修.
- AC-18: tokens.css が無改修.
- AC-20: BL-059 不変項 (V-1 border-width 3px / V-3 header space-between / V-4 title center + font-size-h2 / V-7 input font: inherit) が引き続き存在.
- AC-22: task-card.css に `:hover` / `transition` / `animation` / `box-shadow` が無い.

#### (b) jsdom DOM レンダ系 assert

- AC-2: `<TaskCard showPriority={true} project={null}>` で `.task-card__header__priority` 要素が存在し radiogroup を内包.
- AC-3: 同条件で `.task-card__header__priority` の computed style で `margin-left` が "auto" に解決される.
- AC-7: `<TaskCard actionSet="full" showSetFocus={true}>` で 削除 button に `task-card__actions__delete` / 完了 button に `task-card__actions__complete` が付与され, 「現在のタスクにする」「明日にする」 button にはこれらの className が含まれないことを確認.
- AC-8: `<TaskCard actionSet="minimal">` で同様 (削除 / 完了 にのみ hotfix className).
- AC-10: `<TaskFormCard projects=[{...}]>` で ProjectToggle button の computed style が font-size 14px であることを確認 (jsdom 限界がある場合は CSS 直読み AC-9 で代替).
- AC-12: `<TaskFormCard>` の label に visually-hidden が付き input に placeholder が付くことを確認.
- AC-15: `<TaskFormCard>` の actions 内 button が「追加」 1 件のみであることを確認.
- AC-16: TaskCardProps / TaskFormCardProps の export 型に差分が無いことを `readFileSync` + 正規表現 / 文字列含有で確認.
- AC-19: focus-view の actions 内 button 構成 (削除 / 完了 のみ + 各 className) を確認.
- AC-21: today / tomorrow を render し getByLabelText("タスク名") で input が取得可能.

#### (c) 既存テスト追従

- `web/__tests__/task-card-component.test.tsx` の BL-059 AC-5 (= `.task-card__actions { justify-content: center }` の存在期待) を**逆転** (= 「存在しない」に修正). かつ `justify-content: flex-end` も「存在しない」を維持. D-007 / P-009.

### E2E への追従

- 原則無改修 (role + accessibleName + getByLabelText ベース). 念のため以下を回帰確認:
  - `e2e/tasks.spec.ts` (削除 / 完了 / 明日にする の 3 操作系) — button のテキスト取得は不変.
  - `e2e/today-view-create-form.spec.ts` (起票フォームの label / input) — label を visually-hidden にしても `getByLabel` / `getByPlaceholder` 両方で取得可能.
  - `e2e/a11y.spec.ts` (WCAG 2.1 AA で violations 0) — label 関連付け維持で違反は出ない想定.

### 重点的に確認すること

- 修正 1: chip 無しタスクで PriorityStars が右に配置される (R-002 / G-1 緩和).
- 修正 2: 削除左 / 完了右の両端配置が `actionSet="full"` / `actionSet="minimal"` 両方で成立する (R-003 / G-2 緩和).
- 修正 3: 起票カード内の chip テキストが 14px で表示される (R-001 / G-3 緩和).
- 修正 4: label が視覚的に隠れ, placeholder が「タスク名」を薄く表示し, getByLabelText 互換性が保たれる (R-004 / G-4 緩和).
- 修正 5: 起票カードの「追加」 button が右端に配置される (G-5).
- BL-059 不変項 (V-1 / V-3 / V-4 / V-5 / V-7) が引き続き green (G-6 / AC-20).
- a11y violations 0 件維持 (R-004 / R-005 / NFR-A11Y 緩和).
