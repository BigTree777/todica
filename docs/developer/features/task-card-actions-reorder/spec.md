# 仕様: TaskCard actions の DOM 順を「削除 → 現在のタスクにする → 明日にする → 完了」に変更 (task-card-actions-reorder)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-064
  - 直接の親 BL: BL-063 (`task-card-hotfix`) — 本 BL は BL-063 D-002 (actions の auto-margin 両端配置) の DOM 順追従.
  - 依存 BL: BL-042 (`task-card-actions`) / BL-043 (`set-focus-gesture`) / BL-059 (`task-card-component`) / BL-063 (`task-card-hotfix`)
  - 関連 feature:
    - [`../task-card-hotfix/spec.md`](../task-card-hotfix/spec.md) (BL-063) — 本 BL の親. D-002 で導入された個別 auto-margin パターン (`.task-card__actions__delete { margin-right: auto }` / `.task-card__actions__complete { margin-left: auto }`) を**そのまま維持**する. 本 BL は CSS は無改修で, `task-card.tsx` の JSX 内 button 順序のみ入れ替える.
    - [`../task-card-component/spec.md`](../task-card-component/spec.md) (BL-059) — `<TaskCard>` 本体. prop 型 / 3 段ゾーン DOM 構造 / 呼び出し側は無改修.
    - [`../task-card-actions/spec.md`](../task-card-actions/spec.md) (BL-042) — 「明日にする」/「今日にする」 button の存在条件 (`task.origin !== "routine"`). 本 BL で改修しない.
    - [`../set-focus-gesture/spec.md`](../set-focus-gesture/spec.md) (BL-043) — 「現在のタスクにする」 button (`showSetFocus + onSetFocus`). 本 BL で改修しない.
  - 上位要件: NFR-010 (一貫した UI) / FR-012 (現在のタスク強調)

## 背景 / 課題

BL-063 D-002 で `.task-card__actions__delete { margin-right: auto }` / `.task-card__actions__complete { margin-left: auto }` の個別 auto-margin パターンを実装した. 設計意図は「削除 左端 / 中間ボタン 中央寄り / 完了 右端」.

しかし `web/src/ui/task-card/task-card.tsx` の `<div className="task-card__actions">` 内の button DOM 順は以下のままで放置されている (BL-042 / BL-043 当時の順).

1. 「現在のタスクにする」 (`showSetFocus + onSetFocus`)
2. 「削除」 (`.task-card__actions__delete`)
3. 「明日にする」/「今日にする」 (`showDueDateBtn`)
4. 「完了」 (`.task-card__actions__complete`)

この順序のまま auto-margin が効くと, 描画は以下のようになる.

```
[現在のタスクにする][削除]──[明日にする][完了]
```

理由: 「現在のタスクにする」が DOM 上 1 番目で left edge に居る. 2 番目の「削除」は `margin-right: auto` を持つが, その左には「現在のタスクにする」が居るため左端を取れず, 左から 2 番目に出る. 結果として削除 button が左から 2 番目, 「現在のタスクにする」が左端という想定外の配置になる.

user 要求は以下.

- 「削除」を左端に置きたい (= 危険操作を edge に追いやり, 中央寄りに来ないようにする).
- 「現在のタスクにする」は真ん中で「明日にする」の隣に置きたい (= 「現在のタスクにする」と「明日にする」が文脈的に近い操作で並ぶ).

### 採用方針 (user と合意済み)

`task-card.tsx` の `.task-card__actions` 内の button DOM 順を以下に変更する.

1. 「削除」 (`.task-card__actions__delete`)
2. 「現在のタスクにする」 (`showSetFocus + onSetFocus`)
3. 「明日にする」/「今日にする」 (`showDueDateBtn`)
4. 「完了」 (`.task-card__actions__complete`)

これで auto-margin と組み合わせて以下の配置になる.

```
[削除]──[現在のタスクにする][明日にする]──[完了]
```

- 「削除」 (`margin-right: auto`) が DOM 1 番目で左端を取れる.
- 「完了」 (`margin-left: auto`) は DOM 4 番目 (= 末尾) で右端を取れる.
- 中間の「現在のタスクにする」「明日にする」は auto-margin を持たないため, 「削除」右の余白と「完了」左の余白に挟まれて中央寄りに浮く.

focus-view (`actionSet="minimal"`) は「削除 / 完了」の 2 ボタンのみで, 順序入れ替え後も `[削除][完了]` で auto-margin により両端配置 (= BL-063 と同じ挙動).

### スコープ境界

- 変更は `web/src/ui/task-card/task-card.tsx` 1 ファイルのみ. JSX 内の button 順序入れ替え.
- CSS (`task-card.css`) は無改修. BL-063 D-002 の auto-margin ルールをそのまま流用.
- prop 型 (`TaskCardProps`) / 各 view (today / tomorrow / focus) の呼び出し側 / `<TaskFormCard>` (起票カード) は無改修.
- BL-065 (project-toggle-removal) / BL-066 (任意) には触れない.

## ゴール / 非ゴール

### ゴール

- **G-1 (DOM 順の確定)**: `.task-card__actions` 内の button DOM 順が「削除 → 現在のタスクにする → 明日にする(今日にする) → 完了」になる (`actionSet="full"` + `showSetFocus=true` の最大構成時).
- **G-2 (削除 button が DOM 順最先頭)**: `actionSet="full"` でも `actionSet="minimal"` でも, `.task-card__actions__delete` を持つ button が `.task-card__actions` 内で最初の button (= `:first-of-type` / 兄弟内 index 0) になる.
- **G-3 (完了 button が DOM 順最末尾)**: `actionSet="full"` でも `actionSet="minimal"` でも, `.task-card__actions__complete` を持つ button が `.task-card__actions` 内で最後の button (= `:last-of-type` / 兄弟内 index 末尾) になる.
- **G-4 (「現在のタスクにする」 button が削除と「明日にする」の間)**: `actionSet="full"` + `showSetFocus=true` + `task.origin !== "routine"` のとき, button DOM 順は「削除 → 現在のタスクにする → 明日にする(今日にする) → 完了」.
- **G-5 (BL-063 不変項の維持)**: `.task-card__actions` の CSS / `.task-card__actions__delete` の `margin-right: auto` / `.task-card__actions__complete` の `margin-left: auto` / `.task-card--form .task-card__actions` の `justify-content: flex-end` は本 BL で改修しない. BL-063 が確定した V-1 / V-3 / V-4 / V-5 / V-7 不変項も維持.
- **G-6 (コンポーネント API 無改修)**: `<TaskCard>` の prop 型 (`TaskCardProps`) および各 view (today-view / tomorrow-view / focus-view) の呼び出し側コードは本 BL で**変更しない**.
- **G-7 (`<TaskFormCard>` 無改修)**: 起票カード (`<TaskFormCard>`) は本 BL の対象外. 起票カードには「現在のタスクにする」「明日にする」「完了」 button が無く, 「追加」 button 1 つしか居ないため順序問題が発生しない.
- **G-8 (focus-view 不変)**: focus-view (`actionSet="minimal"`) は (削除, 完了) の 2 ボタンのみで, 本 BL の順序入れ替え後も `[削除][完了]` (= 兄弟順 0: 削除 / 1: 完了) のまま. 配置は auto-margin で両端 (= 既存挙動).
- **G-9 (a11y 違反 0 件維持)**: `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件を維持.

### 非ゴール

- **CSS の改修**: BL-063 D-002 の auto-margin ルールを流用する. `.task-card__actions` 系の CSS は一切無改修.
- **`<TaskFormCard>` の改修**: 起票カードは対象外 (G-7).
- **prop 型 (`TaskCardProps`) の改修**: 順序は JSX 内で固定されるため, 新しい props は追加しない.
- **各 view (today / tomorrow / focus) 呼び出し側の改修**: 呼び出し側は順序を意識しない (= TaskCard 内部で吸収する).
- **PriorityStars / ProjectToggle / project-chip 本体の改修**: 別 BL のスコープ.
- **tokens.css の改修**: 順序は CSS variable に依存しない.
- **BL-065 (project-toggle-removal) / BL-066**: 別 BL.
- **server / domain / API / Repository / mutation / query**: 一切無改修.

## 要件

### 機能要件

- **REQ-1 (button DOM 順の確定)** [G-1 / G-2 / G-3 / G-4]

  `web/src/ui/task-card/task-card.tsx` の `<div className="task-card__actions">` 内の JSX を以下の順序に**入れ替える**.

  1. `<button type="button" className="task-card__actions__delete" onClick={onDelete}>削除</button>` (常に存在)
  2. `{showSetFocus && onSetFocus && (<button type="button" onClick={onSetFocus}>現在のタスクにする</button>)}`
  3. `{showDueDateBtn && onToggleDueDate && (<button type="button" onClick={onToggleDueDate}>{dueDateMode === "today" ? "明日にする" : "今日にする"}</button>)}`
  4. `<button type="button" className="task-card__actions__complete" onClick={onComplete}>完了</button>` (常に存在)

  条件付きレンダの真偽は BL-042 / BL-043 / BL-059 の既存ロジックを**そのまま流用**する.

  - `showSetFocus && onSetFocus` の判定は変更しない.
  - `showDueDateBtn = actionSet === "full" && task.origin !== "routine"` の判定は変更しない.

- **REQ-2 (CSS 無改修)** [G-5]

  `web/src/ui/task-card/task-card.css` は本 BL で**変更しない**. BL-063 D-002 で確定した以下ルールをそのまま流用する.

  - `.task-card__actions__delete { margin-right: auto }`
  - `.task-card__actions__complete { margin-left: auto }`
  - `.task-card--form .task-card__actions { justify-content: flex-end }`
  - `.task-card__actions` 本体ルール (= `justify-content: center` を含まない. BL-063 AC-4 で確定).

- **REQ-3 (TaskCard コンポーネント API 無改修)** [G-6]

  本 BL では `<TaskCard>` の prop 型 (`TaskCardProps` / 14 フィールド) を**変更しない**. 各 view (today-view / tomorrow-view / focus-view) の呼び出し側コードも変更しない. 変更は `task-card.tsx` の JSX 内 button 順序のみ.

- **REQ-4 (`<TaskFormCard>` 無改修)** [G-7]

  `web/src/ui/task-card/task-form-card.tsx` は本 BL で**変更しない**. 起票カードは「追加」 button 1 つのみで, 本 BL の順序入れ替え対象に含まれない.

- **REQ-5 (focus-view 不変)** [G-8]

  `actionSet="minimal"` (focus-view) の button DOM 順は本 BL の入れ替え後も「削除 → 完了」(= 既存と同じ 2 ボタンの順序) を維持する. REQ-1 の順序入れ替え後の構造で `showSetFocus=false` / `showDueDateBtn=false` のとき, 中間ボタンが全てスキップされ「削除」と「完了」のみが残るため, 自動的に既存挙動と一致する.

- **REQ-6 (BL-063 不変項の維持)** [G-5]

  - BL-063 で確定した `.task-card__header__priority { margin-left: auto }` (PriorityStars 右固定) は本 BL で改修しない.
  - BL-063 D-002 の auto-margin パターンは本 BL で改修しない.
  - BL-063 D-003 の `.task-card__header .project-chip { font-size: var(--font-size-small) }` は本 BL で改修しない.
  - BL-063 D-004 の `.visually-hidden` クラスと `<TaskFormCard>` の label プレースホルダ化は本 BL で改修しない.
  - BL-063 D-005 の `.task-card--form .task-card__actions { justify-content: flex-end }` は本 BL で改修しない.
  - BL-059 V-1 / V-3 / V-4 / V-5 / V-7 不変項は引き続き維持.

### 非機能要件

- **NFR-API-FROZEN**: `<TaskCard>` の prop 型は無改修 (REQ-3 / G-6).
- **NFR-FORMCARD-FROZEN**: `<TaskFormCard>` は無改修 (REQ-4 / G-7).
- **NFR-CSS-FROZEN**: `task-card.css` は本 BL で無改修 (REQ-2).
- **NFR-A11Y**: `e2e/a11y.spec.ts` の WCAG 2.1 AA で violations 0 件を維持 (G-9). button の DOM 順を入れ替えるだけで accessibleName / role は変わらないため違反は出ない想定.
- **NFR-FOCUS-VIEW-ACTIONS-2BTN**: focus-view の actions は「削除 / 完了」の 2 ボタンのみ (BL-037 D-008 / BL-059 / BL-063 維持).
- **NFR-COMPAT**: サーバ API / domain / Repository / mutation / query / ConflictDialog / notifyError 経路は無改修.
- **NFR-ROLE-NAME-STABLE**: button の `accessibleName` (= 「削除」「現在のタスクにする」「明日にする」/「今日にする」「完了」) は本 BL で変更しない. Playwright の `getByRole("button", { name: "削除" })` 等の取得は引き続き機能する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.
> 検証コマンドはルートからの `npm test` を基準とする.

```
シナリオ AC-1: actionSet="full" + showSetFocus + manual origin で button DOM 順が「削除 → 現在のタスクにする → 明日にする → 完了」 (REQ-1 / G-1)
  Given <TaskCard actionSet="full" showSetFocus={true} dueDateMode="today" task={origin: "manual"} ... /> を render する
  When  .task-card__actions の直下 button 群を DOM 順で取得する
  Then  button[0].textContent に「削除」を含む
   かつ button[1].textContent に「現在のタスクにする」を含む
   かつ button[2].textContent に「明日にする」を含む
   かつ button[3].textContent に「完了」を含む
   かつ button の総数は 4 である
```

```
シナリオ AC-2: 削除 button が DOM 順最先頭 (REQ-1 / G-2)
  Given <TaskCard actionSet="full" showSetFocus={true} ... /> を render する
  When  .task-card__actions の直下 button 群を DOM 順で取得する
  Then  index=0 の button が className "task-card__actions__delete" を持つ
   かつ index=0 の button の textContent に「削除」を含む
```

```
シナリオ AC-3: 完了 button が DOM 順最末尾 (REQ-1 / G-3)
  Given <TaskCard actionSet="full" showSetFocus={true} ... /> を render する
  When  .task-card__actions の直下 button 群を DOM 順で取得する
  Then  最後の button が className "task-card__actions__complete" を持つ
   かつ 最後の button の textContent に「完了」を含む
```

```
シナリオ AC-4: 「現在のタスクにする」 button が削除と「明日にする」の間 (REQ-1 / G-4)
  Given <TaskCard actionSet="full" showSetFocus={true} dueDateMode="today" task={origin: "manual"} ... /> を render する
  When  .task-card__actions の直下 button 群を DOM 順で取得する
  Then  「現在のタスクにする」 button の DOM index は「削除」 button の DOM index より大きい
   かつ 「現在のタスクにする」 button の DOM index は「明日にする」 button の DOM index より小さい
```

```
シナリオ AC-5: dueDateMode="tomorrow" のとき「今日にする」が「現在のタスクにする」と「完了」の間 (REQ-1)
  Given <TaskCard actionSet="full" showSetFocus={true} dueDateMode="tomorrow" task={origin: "manual"} ... /> を render する
  When  .task-card__actions の直下 button 群を DOM 順で取得する
  Then  button[0].textContent に「削除」を含む
   かつ button[1].textContent に「現在のタスクにする」を含む
   かつ button[2].textContent に「今日にする」を含む
   かつ button[3].textContent に「完了」を含む
   かつ 「明日にする」 button は存在しない
```

```
シナリオ AC-6: showSetFocus=false + actionSet="full" のとき DOM 順が「削除 → 明日にする → 完了」 (REQ-1)
  Given <TaskCard actionSet="full" showSetFocus={false} dueDateMode="today" task={origin: "manual"} ... /> を render する
  When  .task-card__actions の直下 button 群を DOM 順で取得する
  Then  button[0].textContent に「削除」を含む
   かつ button[1].textContent に「明日にする」を含む
   かつ button[2].textContent に「完了」を含む
   かつ 「現在のタスクにする」 button は存在しない
   かつ button の総数は 3 である
```

```
シナリオ AC-7: task.origin="routine" + actionSet="full" + showSetFocus=true のとき DOM 順が「削除 → 現在のタスクにする → 完了」 (REQ-1 / BL-042 不変)
  Given <TaskCard actionSet="full" showSetFocus={true} task={origin: "routine"} ... /> を render する
  When  .task-card__actions の直下 button 群を DOM 順で取得する
  Then  button[0].textContent に「削除」を含む
   かつ button[1].textContent に「現在のタスクにする」を含む
   かつ button[2].textContent に「完了」を含む
   かつ 「明日にする」「今日にする」 button は存在しない
   かつ button の総数は 3 である
```

```
シナリオ AC-8: actionSet="minimal" (focus-view) のとき DOM 順が「削除 → 完了」 (REQ-5 / G-8)
  Given <TaskCard actionSet="minimal" showSetFocus={false} ... /> を render する
  When  .task-card__actions の直下 button 群を DOM 順で取得する
  Then  button[0].textContent に「削除」を含む
   かつ button[0] の className に "task-card__actions__delete" を含む
   かつ button[1].textContent に「完了」を含む
   かつ button[1] の className に "task-card__actions__complete" を含む
   かつ 「明日にする」「今日にする」「現在のタスクにする」 button は存在しない
   かつ button の総数は 2 である
```

```
シナリオ AC-9: TaskCard コンポーネント API が無改修 (NFR-API-FROZEN / REQ-3)
  Given web/src/ui/task-card/task-card.tsx を開いた
  When  TaskCardProps の export 型を観察する
  Then  本 BL の前後で TaskCardProps の 14 フィールド (task / project / variant / showPriority /
        showSetFocus / actionSet / dueDateMode / onSetPriority / onSetFocus / onDelete /
        onToggleDueDate / onComplete / as / aria-label) に差分が無い
```

```
シナリオ AC-10: task-card.css が無改修 (NFR-CSS-FROZEN / REQ-2)
  Given 本 BL の実装がマージされた
  When  web/src/ui/task-card/task-card.css を BL-063 完了時点と比較する
  Then  差分が無い
   かつ .task-card__actions__delete { margin-right: auto } が引き続き存在する
   かつ .task-card__actions__complete { margin-left: auto } が引き続き存在する
   かつ .task-card--form .task-card__actions { justify-content: flex-end } が引き続き存在する
   かつ .task-card__actions 本体ルールに justify-content: center を含まない (BL-063 AC-4 維持)
```

```
シナリオ AC-11: <TaskFormCard> が無改修 (NFR-FORMCARD-FROZEN / REQ-4)
  Given 本 BL の実装がマージされた
  When  web/src/ui/task-card/task-form-card.tsx を BL-063 完了時点と比較する
  Then  差分が無い
```

```
シナリオ AC-12: 各 view 呼び出し側が無改修 (REQ-3)
  Given 本 BL の実装がマージされた
  When  today-view / tomorrow-view / focus-view の <TaskCard ... /> 呼び出し箇所を BL-063 完了時点と比較する
  Then  <TaskCard /> に渡している props (task / project / variant / showPriority / showSetFocus /
        actionSet / dueDateMode / on* handlers / as / aria-label) に差分が無い
```

```
シナリオ AC-13: 既存単体テスト全件 green (BL-063 のテスト追従後)
  Given /today /tomorrow /focus が引き続きレンダリング可能
  When  ルートから npm test (vitest 単体テスト全件) を実行する
  Then  すべて green である
   かつ task-card-hotfix.test.tsx の AC-7 / AC-8 / AC-19 (= 削除/完了 className 付与) は引き続き green
   かつ task-card-component.test.tsx の AC-9 (= actions 内 button 列挙) / AC-10 (= 「現在のタスクにする」存在) /
        AC-11 (= actionSet="minimal" で 2 ボタン) / AC-12 (= routine origin で「明日にする」非表示) は引き続き green
   かつ DOM 順を strict に assert している既存 it があれば追従修正されて green
```

```
シナリオ AC-14: 既存 E2E 全件 green
  Given Playwright が起動可能
  When  npx playwright test を実行する
  Then  すべて green である
   かつ role + accessibleName ベースの取得 (getByRole("button", { name: "削除" }) 等) が引き続き機能する
   かつ button の click 順を期待する E2E が無い (or あれば追従修正済み)
```

```
シナリオ AC-15: アクセシビリティ違反 0 件を維持する (NFR-A11Y / G-9)
  Given /today /tomorrow /focus をはじめとする全 view がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする (e2e/a11y.spec.ts の既存スキャン)
  Then  すべてのスキャンで violations.length === 0
   かつ button の DOM 順入れ替えだけでは accessibleName / role が変わらないため違反は出ない
```

## 重要な決定 (D 章)

- **D-001 (順序入れ替えの実装位置: `task-card.tsx` JSX 内採用)**:
  - 候補:
    - (i) `task-card.tsx` の `<div className="task-card__actions">` 内の JSX 順序を直接入れ替える.
    - (ii) `task-card.tsx` の上部で button JSX 要素を変数として組み立て, 配列の順序で並べる (= `actionsButtons = [delete, setFocus, dueDate, complete].filter(Boolean)`).
    - (iii) CSS の `order` プロパティで配置順を制御する.
    - (iv) 新規 prop (`actionsOrder?: ("delete" | "setFocus" | "dueDate" | "complete")[]`) を追加し, 呼び出し側で順序を指定する.
  - 採用: (i) JSX 直接入れ替え.
    - 理由: 本 BL の修正は静的な順序変更であり, 動的に切り替える必要が無い. 最小変更で要件を満たす.
    - (ii) はロジック上等価だが JSX の可読性が下がる. tsx のテンプレート性を活かせない.
    - (iii) は DOM 順は変えずに visual 順だけ変える方法だが, タブキー操作順 (= DOM 順) と visual 順が乖離し a11y / NFR-A11Y に悪影響. 不採用.
    - (iv) は API を肥大化させる. 全 view で同じ順序を望むため動的指定の必要が無い. NFR-API-FROZEN にも反する.
  - 副作用: 既存テストで DOM 順を strict に assert している箇所があれば追従修正が必要 (D-002 参照).

- **D-002 (既存テスト追従の範囲)**:
  - 確認: 現状の `web/__tests__/task-card-component.test.tsx` / `web/__tests__/task-card-hotfix.test.tsx` の `.task-card__actions` 内 button assert は, 主に「className が付与されているか」「特定ラベルが存在 / 非存在か」を確認しており, **strict な DOM 順 assert は存在しない**ことを確認済み.
  - 追従不要:
    - `task-card-hotfix.test.tsx` AC-7 / AC-8 / AC-19 (= 削除/完了 className 付与): className 確認のみで順序非依存.
    - `task-card-component.test.tsx` AC-9 (= 3 ボタン存在確認) / AC-10 (= 「現在のタスクにする」存在) / AC-11 (= actionSet="minimal" で 2 ボタン) / AC-12 (= routine origin で「明日にする」非表示): いずれもラベル存在 / 非存在で順序非依存.
  - 追従が必要になる場合 (= 本 BL 実装中に発見された場合):
    - もし strict な DOM index 比較を行う it が見つかった場合, 新ルール (削除 → 現在のタスクにする → 明日にする / 今日にする → 完了) に追従させる.
    - 現時点では BL-063 までの実装で strict 順序 assert は存在しないと判断するが, 実装段階で再確認する.

- **D-003 (テストファイル切り出し方針)**:
  - 候補:
    - (i) 既存 `web/__tests__/task-card-component.test.tsx` の関連 it (AC-9 等) を更新し, DOM 順を含めた assert に拡張する.
    - (ii) 既存 `web/__tests__/task-card-hotfix.test.tsx` の AC-7 / AC-8 / AC-19 を拡張する.
    - (iii) 新規 `web/__tests__/task-card-actions-reorder.test.tsx` を切り出して, 本 BL の AC-1〜AC-8 を網羅する.
  - 採用: (iii) 新規ファイル切り出し.
    - 理由: 本 BL は BL-063 hotfix と独立した観点 (= DOM 順) であり, スコープを明示するため新規ファイルが読みやすい.
    - BL-063 が新規ファイル切り出し方針 (D-006) を採用したのと同じ理由.
    - 既存 BL-059 / BL-063 のテストは「className 付与 / 存在確認」の観点で十分機能しており, 順序観点を後追いで混ぜると意図が混濁する.
  - 既存テストの扱い:
    - 既存 `task-card-component.test.tsx` / `task-card-hotfix.test.tsx` は本 BL の実装後も**そのまま green を維持**する想定 (D-002 参照).
    - もし strict 順序 assert が見つかった場合のみ追従修正.

- **D-004 (E2E への影響)**:
  - Playwright の既存 E2E (`e2e/` 配下) はすべて `getByRole("button", { name: "..." })` ベースで button を取得しており, DOM 順に依存していない.
  - よって本 BL の DOM 順入れ替えで E2E に**追従修正は不要**な想定.
  - 検証は AC-14 (E2E 全件 green) で担保する.

- **D-005 (focus-view への影響)**:
  - focus-view は `actionSet="minimal"` で「削除 / 完了」の 2 ボタンのみ.
  - 本 BL の REQ-1 で順序入れ替え後の構造を取っても, 「現在のタスクにする」「明日にする」「今日にする」はいずれも条件付きレンダで `showSetFocus=false` / `showDueDateBtn=false` のためスキップされる.
  - 残るのは「削除」(1 番目) と「完了」(4 番目) のみ.
  - 結果として focus-view では DOM 順は `[削除][完了]` (= 既存と同じ) で, auto-margin により両端配置 (= 既存挙動).
  - focus-view の挙動は本 BL で**変化しない**.

## 未決事項 / 確認待ち

- なし (DOM 順の確定方針, 採用案, D-001 〜 D-005 の確定で本 BL のスコープ・実装方針は全て確定済み. 詳細な実装手順とテストの粒度は plan.md / tasks.md で確定する).
