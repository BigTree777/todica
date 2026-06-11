# 設計・実装計画: TaskCard actions の DOM 順を「削除 → 現在のタスクにする → 明日にする → 完了」に変更 (task-card-actions-reorder)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`web/src/ui/task-card/task-card.tsx` の `<div className="task-card__actions">` 内 JSX で button の記述順を「削除 → 現在のタスクにする → 明日にする(今日にする) → 完了」に直接入れ替える. CSS (BL-063 D-002 で導入した `.task-card__actions__delete { margin-right: auto }` / `.task-card__actions__complete { margin-left: auto }`) は無改修で流用し, DOM 順入れ替えだけで `[削除]──[現在のタスクにする][明日にする]──[完了]` の配置を実現する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API (server) | 無改修 |
| DB | 無改修 |
| ドメインモデル | 無改修 |
| Repository / Query / Mutation | 無改修 |
| UI (`task-card.tsx`) | `.task-card__actions` 内の button JSX 順序入れ替え (1 ファイル) |
| UI (`task-card.css`) | 無改修 (BL-063 D-002 のルール流用 / NFR-CSS-FROZEN) |
| UI (`task-form-card.tsx`) | 無改修 (NFR-FORMCARD-FROZEN / G-7) |
| 各 view 呼び出し側 (today / tomorrow / focus) | 無改修 (NFR-API-FROZEN / REQ-3) |
| PriorityStars / ProjectToggle | 無改修 |
| tokens.css | 無改修 |
| テスト | 新規 `web/__tests__/task-card-actions-reorder.test.tsx` 1 ファイル. 既存 `task-card-component.test.tsx` / `task-card-hotfix.test.tsx` は原則無改修 (strict 順序 assert が発見された場合のみ追従) |
| E2E | 原則無改修 (role + accessibleName ベースのため / D-004) |

## 設計詳細

### データモデル

- 無改修. `Task` / `Project` ドメイン型, Repository / Query / Mutation, server API は一切無改修.

### 処理フロー

#### 現状 (BL-063 完了時点) の JSX

`web/src/ui/task-card/task-card.tsx` の `.task-card__actions` 部分:

```tsx
<div className="task-card__actions">
  {showSetFocus && onSetFocus && (
    <button type="button" onClick={onSetFocus}>
      現在のタスクにする
    </button>
  )}
  <button type="button" className="task-card__actions__delete" onClick={onDelete}>
    削除
  </button>
  {showDueDateBtn && onToggleDueDate && (
    <button type="button" onClick={onToggleDueDate}>
      {dueDateMode === "today" ? "明日にする" : "今日にする"}
    </button>
  )}
  <button type="button" className="task-card__actions__complete" onClick={onComplete}>
    完了
  </button>
</div>
```

DOM 順: (1) 現在のタスクにする (任意) / (2) 削除 / (3) 明日にする(今日にする) (任意) / (4) 完了.

#### 本 BL 適用後の JSX

```tsx
<div className="task-card__actions">
  <button type="button" className="task-card__actions__delete" onClick={onDelete}>
    削除
  </button>
  {showSetFocus && onSetFocus && (
    <button type="button" onClick={onSetFocus}>
      現在のタスクにする
    </button>
  )}
  {showDueDateBtn && onToggleDueDate && (
    <button type="button" onClick={onToggleDueDate}>
      {dueDateMode === "today" ? "明日にする" : "今日にする"}
    </button>
  )}
  <button type="button" className="task-card__actions__complete" onClick={onComplete}>
    完了
  </button>
</div>
```

DOM 順: (1) 削除 / (2) 現在のタスクにする (任意) / (3) 明日にする(今日にする) (任意) / (4) 完了.

#### 配置の根拠 (BL-063 D-002 流用)

- `.task-card__actions__delete { margin-right: auto }`: DOM 1 番目の「削除」が左端を取る.
- `.task-card__actions__complete { margin-left: auto }`: DOM 最後の「完了」が右端を取る.
- 中間ボタン (現在のタスクにする / 明日にする / 今日にする) は auto-margin を持たないため, 「削除」と「完了」の auto-margin に挟まれた空間で連続して並ぶ (= 中央寄り).

#### View ごとの DOM 順 (REQ-1 適用後)

| View | actionSet | showSetFocus | task.origin | 想定 DOM 順 |
| --- | --- | --- | --- | --- |
| today-view (focusedTask) | "full" | false | "manual" | 削除 → 明日にする → 完了 (3 ボタン) |
| today-view (focusedTask) | "full" | false | "routine" | 削除 → 完了 (2 ボタン) |
| today-view (otherTasks) | "full" | true | "manual" | 削除 → 現在のタスクにする → 明日にする → 完了 (4 ボタン) |
| today-view (otherTasks) | "full" | true | "routine" | 削除 → 現在のタスクにする → 完了 (3 ボタン) |
| tomorrow-view | "full" | false | "manual" | 削除 → 今日にする → 完了 (3 ボタン) |
| tomorrow-view | "full" | false | "routine" | 削除 → 完了 (2 ボタン) |
| focus-view | "minimal" | false | any | 削除 → 完了 (2 ボタン) |

### 例外 / エラー処理

- 本 BL は presentational の JSX 順序変更のみで, runtime ロジック / イベントハンドラ / 例外経路に変化なし.
- onClick ハンドラは引き続き `onDelete` / `onSetFocus` / `onToggleDueDate` / `onComplete` の 4 つで, prop 名 / シグネチャは無改修.
- ConflictDialog / notifyError 等のエラー経路への影響なし.

## 重要な決定

- **D-001 (順序入れ替えの実装位置: JSX 直接入れ替え採用)** [spec.md D-001 参照]
- **D-002 (既存テスト追従の範囲: 原則無改修, strict 順序 assert があれば追従)** [spec.md D-002 参照]
- **D-003 (テストファイル切り出し方針: 新規ファイル切り出し採用)** [spec.md D-003 参照]
- **D-004 (E2E への影響: 追従修正不要想定)** [spec.md D-004 参照]
- **D-005 (focus-view への影響: 変化なし)** [spec.md D-005 参照]

ADR 化は不要 (本 BL は単一 JSX ファイルの順序入れ替えで, アーキテクチャレベルの判断ではない).

## リスク / 代替案

### リスク

- **R-1 (既存 strict 順序 assert の見落とし)**: 既存テストで `buttons[0]` / `buttons[1]` 等の index 比較を行う it が予期せず混入している場合, 本 BL の実装で red になる. → 緩和策: 実装段階で `web/__tests__/task-card-*.test.tsx` および `e2e/` 配下を `buttons[0]` / `nth-child` / `nth-of-type` 等のキーワードで grep し, 該当箇所を洗い出して追従する.
- **R-2 (visual regression)**: BL-063 D-002 で確定した auto-margin パターンが想定通り動作しない場合, 描画が崩れる. → 緩和策: 単体テストで DOM 順を assert (AC-1〜AC-8), 実機 (`npm run dev`) で `/today` / `/tomorrow` / `/focus` を目視確認.
- **R-3 (タブキー操作順の変化)**: DOM 順を変えると Tab キーで focus が移動する順序も変わる. user 要求が「削除を左端」なので意図通りだが, 利用者の操作習慣 (= 削除を最後に押す癖) と乖離する可能性. → 受容. user 要求が優先.

### 代替案 (採用しなかった案)

- spec.md D-001 (ii) / (iii) / (iv) 参照. JSX 直接入れ替え以外の方法は API 肥大化 or a11y 悪化のため不採用.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (新規追加)

新規 `web/__tests__/task-card-actions-reorder.test.tsx` で AC-1 〜 AC-8 を網羅する.

- **観点 1: DOM 順 (AC-1 / AC-4 / AC-5 / AC-6 / AC-7 / AC-8)**
  - `<TaskCard>` を各種 props 組み合わせで render し, `container.querySelector(".task-card__actions")` から `querySelectorAll("button")` で button 配列を取得.
  - 配列の index と textContent で順序を assert.
- **観点 2: 端 className (AC-2 / AC-3 / AC-8)**
  - index 0 / index 末尾の button の `className` に `task-card__actions__delete` / `task-card__actions__complete` が含まれることを確認.
- **観点 3: minimal (focus-view) 不変 (AC-8 / G-8)**
  - `actionSet="minimal"` で 2 ボタンが「削除 → 完了」の順であることを確認.
- **観点 4: routine origin (AC-7 / BL-042 不変)**
  - `task.origin="routine"` で「明日にする」「今日にする」が出ないことを確認しつつ, 「削除 → 現在のタスクにする → 完了」の順を確認.

### 既存テスト (BL-063 完了時点) への追従

- **追従不要が原則** (spec D-002).
- 実装段階で `web/__tests__/task-card-component.test.tsx` / `web/__tests__/task-card-hotfix.test.tsx` を `buttons[0]` / `buttons[1]` / `nth-of-type` 等で grep し, strict 順序 assert があれば本 BL の新ルールに追従修正する.

### API / コンポーネント不変 (AC-9 / AC-10 / AC-11 / AC-12)

- 既存 BL-059 / BL-063 の API / CSS / `<TaskFormCard>` / 各 view 呼び出し側の無改修 assert は引き続き green を維持する想定.
- 本 BL では新規 assert を増やさず, 既存 assert で担保.

### E2E (AC-14)

- `e2e/` 配下を `nth-child` / `nth-of-type` / `buttons[0]` 等で grep し, DOM index 依存の取得が無いことを確認.
- 既存 E2E は role + accessibleName ベースの想定で, 本 BL の DOM 順入れ替えで影響を受けない (D-004).

### a11y (AC-15)

- `e2e/a11y.spec.ts` の WCAG 2.1 AA スキャンで violations 0 件維持.
- button の DOM 順入れ替えだけでは accessibleName / role / aria 属性が変わらず, 違反は出ない想定.
