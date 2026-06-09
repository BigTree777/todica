# 設計・実装計画: 優先度 UI を星 3 つの評価式に変更 (priority-star-ui)

> [`spec.md`](spec.md) の REQ-1〜REQ-6 / AC-1〜AC-10 を実現するための設計と実装手順.

## 方針概要

共通コンポーネント `<PriorityStars value, onChange, idPrefix />` を新設し, today / tomorrow の「起票フォーム」と today の「タスクカード上の優先度切替」全箇所を同じ部品で置き換える. ドメイン値・API・サーバ実装は無改修. CSS はコンポーネントローカルに置き, デザイントークン化 (BL-046) は後追いで合流する. 既存テストは「優先度関連シナリオのみ」を書き換え, 他は破壊しない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (`POST /api/v1/tasks`, `PATCH /api/v1/tasks/:id` の priority フィールドをそのまま使う) |
| DB | 変更なし |
| ドメイン | 変更なし (`Priority = "highest" | "normal" | "later"`) |
| Web モジュール (新設) | `web/src/ui/priority-stars/priority-stars.tsx`, `web/src/ui/priority-stars/priority-stars.css` |
| Web モジュール (改修) | `web/src/ui/today-view/today-view.tsx` (起票フォームの `<select>` と一覧 / focused カードの cycle ボタンを置換), `web/src/ui/tomorrow-view/tomorrow-view.tsx` (起票フォームの `<select>` を置換) |
| 既存テスト (改修) | `web/__tests__/today-view.test.tsx` (優先度関連 it のみ), `web/__tests__/tomorrow-view.test.tsx` (優先度関連 it のみ), `e2e/tasks.spec.ts` (「優先度ボタンを押すと表示と aria-label が更新される」を「星クリック」に書き換え) |
| 新規テスト | `web/__tests__/priority-stars.test.tsx` (単体), `e2e/a11y.spec.ts` は既存のものを再利用 (axe で violations 0 を維持) |

## 設計詳細

### `<PriorityStars />` コンポーネント

配置: `web/src/ui/priority-stars/priority-stars.tsx`.

```ts
export type PriorityValue = "highest" | "normal" | "later";

export interface PriorityStarsProps {
  /** 現在値. UI 上は star count に変換する (later=1, normal=2, highest=3). */
  value: PriorityValue;
  /** 星クリック時のコールバック. 同値クリックは呼び出さない. */
  onChange: (next: PriorityValue) => void;
  /**
   * 同一画面に複数インスタンスが並ぶときの id 衝突回避. ex: `task-${id}`.
   * 省略時は React の useId を使う.
   */
  idPrefix?: string;
  /**
   * 用途別ラベル (アクセシビリティのコンテキスト).
   * "起票フォームの優先度" / "タスクカードの優先度" 等を渡す.
   * 省略時は "優先度".
   */
  groupLabel?: string;
}
```

#### UI 構造 (採用案: radiogroup + radio)

```html
<div role="radiogroup" aria-label="優先度: 普通" data-priority-stars>
  <button
    type="button"
    role="radio"
    aria-checked={index < starCount}
    aria-label="星 1 つ目 (後回し)"
    data-lit={index < starCount}
    onClick={() => handleClick(1)}
  >☆ or ★</button>
  <button .../>
  <button .../>
</div>
```

- `role="radiogroup"` + `aria-label` で「現在の優先度: ○○」を screen reader に伝える (REQ-4).
- 各星は `<button type="button" role="radio">`. `aria-checked` は「その星以下が点灯しているか」で決める (= 例えば star 2 をクリック時は 1, 2 とも aria-checked=true).
  - 注: 厳密な ARIA radiogroup の意味論では各 radio は排他的だが, 本 UI は「評価式 (rating)」なので「視覚的に複数 lit」と「アクセシビリティ的には 1 つだけ checked」の両立を `aria-checked` の付け方で工夫する. 具体的には「現在値に対応する 1 つの星のみ aria-checked=true」とし, 残りは `aria-checked=false` にする (axe 違反 0 を維持). 視覚的な「lit/unlit」は `data-lit` 属性 + CSS で表現する.
- 各星の `aria-label` は「星 N つ目 (後回し / 普通 / 最優先)」(意味と位置の両方).
- `data-lit` を CSS セレクタで使う (`[data-lit="true"]` → 色付き, `[data-lit="false"]` → グレー).

#### マッピング

```ts
const VALUE_TO_COUNT = { later: 1, normal: 2, highest: 3 } as const;
const COUNT_TO_VALUE = { 1: "later", 2: "normal", 3: "highest" } as const;
```

#### クリックの挙動

- `handleClick(n)`: `next = COUNT_TO_VALUE[n]`. `next === value` なら no-op (REQ-3 / AC-6).
- それ以外なら `onChange(next)` を呼ぶ. 内部で値を保持しない (controlled). 親 (today-view / tomorrow-view) の useState または mutation がソース.

#### キーボード操作 (初版)

- 各星は `<button>` なので Tab で順に到達し, Enter / Space で発火する (REQ-4 最低要件).
- 矢印キーや 1/2/3 数字キーは初版では実装しない (spec U-1 で別 BL に切り出す候補).

#### CSS

`web/src/ui/priority-stars/priority-stars.css` を新設.

- `[data-priority-stars]`: `display: inline-flex; gap: 0.25rem; align-items: center;`
- `[data-priority-stars] button`: 背景透明, padding 最小, `:focus-visible` で OS 既定の outline を維持.
- `[data-lit="true"]`: 文字色 `#B45309` (アンバー). 背景 `#fff` 上でコントラスト比 4.5:1 以上を満たす値を採用.
- `[data-lit="false"]`: 文字色 `#595959`. 背景 `#fff` 上でコントラスト比 7:1 を満たす.
- 星のグリフは Unicode `★` (lit) / `☆` (unlit) を使う. icon font 依存を避ける.

### today-view への組み込み

1. **起票フォームの `<select id="task-priority">` を削除**し, 代わりに次を入れる.
   ```tsx
   <div>
     <span id="task-priority-label">優先度</span>
     <PriorityStars
       value={priority}
       onChange={setPriority}
       groupLabel="優先度"
       idPrefix="create"
     />
   </div>
   ```
   `<label htmlFor>` は `<select>` を消す以上不要. 代わりに `<span>` で見える文字を残し, `<PriorityStars>` 内部の `aria-label` で意味を伝える.

2. **「現在のタスク」セクションと「タスク一覧」行の `<button aria-label="優先度を切替">` を削除**し, 同じ位置に
   ```tsx
   <PriorityStars
     value={task.priority}
     onChange={(next) => handleSetPriority(task, next)}
     groupLabel={`${task.name} の優先度`}
     idPrefix={`task-${task.id}`}
   />
   ```
   を置く.

3. **新ハンドラ `handleSetPriority`** を追加:
   ```ts
   const handleSetPriority = useCallback(
     async (task: Task, next: Priority) => {
       if (task.priority === next) return; // AC-6: 同値クリック no-op
       const cmd: UpdateTaskCommand = {
         id: task.id,
         ifMatch: task.version,
         patch: { priority: next },
       };
       await updateMutation.mutateAsync(cmd);
     },
     [updateMutation],
   );
   ```
   既存の `handleCyclePriority` と `NEXT_PRIORITY` 定数は削除する.

4. **`PRIORITY_LABEL`** の `[優先度: ...]` 表示 (`<span>[優先度: 普通]</span>`) は撤去する.
   理由: 星の点灯数自体が優先度の表現になっており, 文字での重複は冗長 (モックにも無い). 文字情報は `<PriorityStars>` の `aria-label` で screen reader 向けに保持する.
   (BL-042 のカード簡素化を見越して, ここで併せて落とす. ただし「現在のタスク」セクションの `<span>{focusedTask.name}</span>` 等の名前表示は残す.)

### tomorrow-view への組み込み

1. 起票フォームの `<select id="tomorrow-task-priority">` を削除し, 同じく `<PriorityStars value={priority} onChange={setPriority} groupLabel="優先度" idPrefix="tomorrow-create" />` に置換.
2. タスクカード上には現状, 優先度切替 UI が無い (削除 / 今日にする の 2 ボタンのみ). 触らない (spec の非ゴール).
3. `PRIORITY_LABEL` の `[優先度: ...]` 表示は同じ理由で撤去する. 既存テストの「優先度関連表示」を assert している部分は test-designer 改修対象.

### 段階的移行

1 PR で全体を実装する. ロールバック時は次を行う.

1. `priority-stars/` ディレクトリを削除.
2. today-view / tomorrow-view を `git revert` 相当で `<select>` + cycle ボタンに戻す.
3. テストも対応する revert.

中間状態 (片方の view のみ星 UI) は許容しない (テスト整合性が崩れるため).

## 重要な決定

- **D-001 (共通コンポーネント化)**: today / tomorrow の 2 view + 2 箇所 (起票フォーム / タスクカード) を同じ `<PriorityStars />` でカバーする. 過剰な汎用化はせず, props は `value / onChange / groupLabel / idPrefix` の 4 つに絞る.

- **D-002 (radiogroup + 単一 aria-checked 採用案)**: 視覚は「評価式 (rating, 複数 lit)」だが, ARIA としては「単一選択ラジオグループ」とする. 各星に `aria-checked` を割り振る際は「現在値に対応する 1 つだけ true, 残りは false」とする. 「視覚 lit / aria checked」を分離することで axe 違反を回避する.

- **D-003 (同値クリックは no-op)**: AC-6 を満たすため, `<PriorityStars>` 内部で「next === value」のとき `onChange` を呼ばない. 余計な PATCH / 楽観 UI のチラつきを防ぐ.

- **D-004 (旧 cycle ボタン + 文字表示 `[優先度: ...]` の併合撤去)**: 「優先度を切替」cycle ボタンの撤去と, 「`[優先度: ...]` の補助文字表示」の撤去は同 PR で行う. 既存テストはこの両方を assert していたため, test-designer が同時に書き換える.

- **D-005 (CSS の置き場所)**: `web/src/ui/priority-stars/priority-stars.css` にローカル CSS を置く. BL-046 のデザイントークン基盤 (`tokens.css`) が整い次第, 色値を CSS 変数 (`--color-accent` 等) に差し替える PR を別途出す.

- **D-006 (キーボード矢印 / 数字キーは初版に含めない)**: spec U-1 のとおり, 「Tab + Enter/Space」のみで初版を確定する. 矢印キーや数字キーでの選択は追加 BL で扱う.

## リスク / 代替案

- **リスク R-1 (a11y 違反検出)**: 視覚 (rating 多 lit) と ARIA (radio 単一 checked) を分離する設計は axe の WCAG 2.1 AA を満たすが, axe 側で false positive / negative が出ることがある. → 緩和策: T-005 で axe をローカル実行し, 問題が出たら D-002 を「`<button aria-pressed>` の 3 連 + group の `aria-label`」案に切り替える. 切り替えても spec の AC は変わらない.

- **リスク R-2 (タッチ操作時のミスタップ)**: 星 3 つを横並びで詰めるとモバイルでミスタップしやすい. → 緩和策: CSS で最低 44×44 px (WCAG 2.5.5) のタップターゲットを確保する.

- **リスク R-3 (既存テストの広範な改修)**: today-view.test.tsx は優先度関連 it が複数 (3〜5 件). 加えて E2E の 1 件. → 緩和策: T-002 / T-003 / T-004 で「優先度関連 it のみ」を書き換え, 他の it (期限切替 / 完了 / 削除 / focus) には触らない.

- **代替案 (採用しない)**:
  - 案 A: `<select>` を残してオプション表示だけ ★★ / ★ / ☆ にする → モックの「3 つ星クリック」を満たさず却下.
  - 案 B: cycle ボタンの見た目だけ星に変える → 1 タップで任意の値に飛べないため UX が改善せず却下.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

- **単体 (vitest + @testing-library/react)** [`web/__tests__/priority-stars.test.tsx`]:
  - 3 つの星が並ぶ (REQ-1).
  - `value="normal"` の初期表示で 2 つ点灯相当 (data-lit / aria 表現).
  - 1 つ目クリック → `onChange("later")` を呼ぶ. 3 つ目クリック → `onChange("highest")`.
  - `value` と同じ星をクリック → `onChange` は呼ばれない (AC-6).
  - Tab + Enter で同等の操作が可能 (キーボードアクセス).
  - aria-label に「優先度: 普通」相当が含まれる (REQ-4).

- **結合 (today-view.test.tsx 改修)**:
  - 既存「優先度 select」テストを「優先度 stars」テストに書き換え (label 検索を `getAllByRole("radio")` 等に変更).
  - 一覧行の「cycle ボタン → 星クリック」シナリオを書き換え. ハンドラ呼び出しの assert (`update.patch.priority`) は維持.
  - 「[優先度: 普通]」文字列 assert を撤去 (D-004).

- **結合 (tomorrow-view.test.tsx 改修)**:
  - 起票フォームの「優先度 select」を「星 UI」に書き換え.
  - 同様に `[優先度: ...]` 文字列 assert を撤去.
  - カード上の優先度 UI は存在しないことの assert は維持 (BL-038 の仕様).

- **E2E (tasks.spec.ts 改修)**:
  - 「優先度ボタンを押すと表示と aria-label が更新される」を「星 1 つ目をクリックすると aria 表現が "後回し" に変わる」に書き換え. priority の往復 (例えば normal → later → highest) は最小に保つ.

- **E2E (a11y.spec.ts 既存)**:
  - 修正不要. axe で violations === 0 を維持できることを最終確認 (T-010 で auditor が確認).

- **手動確認 (auditor 用チェックリスト)**:
  - /today の起票フォームで星 3 つ目をタップ → 追加 → 並び順が `highest` 行として先頭に来る.
  - /today の一覧で 1 つ目の星タップ → ★が 1 つになり, ページ再読込後も維持される.
  - /tomorrow の起票フォームでも同様.
  - 既存の「明日へ」「編集」「完了」「削除」「現在に設定」操作が壊れていないこと.
