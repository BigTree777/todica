# 設計・実装計画: タスクカードのアクションを 3 つに削減 (task-card-actions)

> [`spec.md`](spec.md) の要件 REQ-1〜REQ-7 を, どう実現するかに落とす.

## 方針概要

- today-view / tomorrow-view の **タスクカード上のボタン JSX のみを差し替える** UI 局所変更.
- サーバ API / ドメイン / リポジトリ層は無改修. 既存 mutation (`updateMutation` / `deleteMutation` / `completeMutation`) を流用する.
- 撤去対象は (a) button の JSX, (b) 連動する state / handler / 補助 form, (c) `setFocusMutation` の 3 種類のみ.
- 「明日へ / 今日へ」ラベルは「明日にする / 今日にする」に統一する (foundation 整合).
- focus-view (BL-037) は触らない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし (既存 `POST /tasks/:id/complete`, `PATCH /tasks/:id`, `DELETE /tasks/:id` を流用) |
| DB | 変更なし |
| ドメイン | 変更なし (`@todica/domain/task` 無改修) |
| リポジトリ層 | 変更なし (`TaskRepository` の interface / 実装は無改修) |
| Web UI | `web/src/ui/today-view/today-view.tsx`: 強調セクションと一覧の JSX を差し替え + 関連 state / handler / 編集フォーム / `setFocusMutation` を削除. ラベル「明日へ / 今日へ」→「明日にする / 今日にする」.<br>`web/src/ui/tomorrow-view/tomorrow-view.tsx`: 各カードに「完了」ボタンと `completeMutation` (今日と同形) を追加.<br>`web/src/ui/focus-view/focus-view.tsx`: 触らない. |
| 単体テスト | `web/__tests__/today-view.test.tsx`: 編集 / 「現在に設定」/「現在解除」関連シナリオを削除 (or `it.skip`). 「明日へ」 button name の regex を「明日にする」に追従.<br>`web/__tests__/tomorrow-view.test.tsx`: 「アクションは 2 つのみ」シナリオを「3 つ (削除 / 今日にする / 完了)」に書き換え + 「完了」クリックの新規シナリオ追加. |
| E2E | `e2e/tasks.spec.ts`: 「タスクを編集すると名前が一覧に反映される」を `test.skip` + 代替 BL 連番コメント付与. 「明日へを押すと今日の一覧から消える」の button name を「明日にする」に追従.<br>`e2e/tomorrow-view.spec.ts`: 「完了」追加に伴う E2E (任意, plan で確定). |
| ドキュメント | `docs/developer/planning/backlog.md` の BL-042 行を Done に更新. |

## 設計詳細

### today-view.tsx 変更詳細

#### 削除する JSX (強調セクション内, 行 517〜548 付近)

```tsx
// 撤去
<button type="button" onClick={() => openEdit(focusedTask)}>編集</button>
<button type="button" onClick={() => handleSetFocus(null)}>現在解除</button>
```

#### ラベル変更 (強調セクション + 一覧)

```tsx
// before
{focusedTask.dueDate === "today" ? "明日へ" : "今日へ"}
// after
{focusedTask.dueDate === "today" ? "明日にする" : "今日にする"}
```

#### 削除する JSX (一覧内, 行 551〜581 付近)

```tsx
// 撤去
<button type="button" onClick={() => openEdit(task)}>編集</button>
<button type="button" onClick={() => handleSetFocus(task.id)}>現在に設定</button>
```

#### 削除する state / handler / form

- `editingTask`, `editingName` の `useState` (108〜109 行).
- `openEdit` / `cancelEdit` / `handleSaveEdit` (351〜374 行).
- `handleSetFocus` (422〜429 行).
- 編集フォームの JSX (`{isEditing && (...)} `, 495〜512 行) + `isEditing` 派生変数.
- `setFocusMutation` 定義 (299〜330 行).

#### 残るカード上の要素

- プロジェクト名表示 (副情報).
- タスク名 (`<span>{task.name}</span>`).
- `<PriorityStars />` (BL-040 / 状態表示).
- 「削除」/「明日にする」/「完了」の 3 ボタン (順序: 削除 / 期限切替 / 完了).
- routine origin の場合: 「明日にする」を非表示 → 「削除 / 完了」の 2 ボタン.

#### 残る mutation

- `createMutation`: 起票. 触らない.
- `updateMutation`: 期限切替 (`handleToggleDueDate`) と優先度変更 (`handleSetPriority`) で使用. 触らない.
- `deleteMutation`: 削除. 触らない.
- `completeMutation`: 完了. 触らない.

### tomorrow-view.tsx 変更詳細

#### 追加: completeMutation (today と同形)

```tsx
const completeMutation = useMutation({
  mutationFn: async (cmd: CompleteTaskCommand) => {
    const idempotencyKey = generateId();
    void safeEnqueue({
      url: `${baseUrl}/api/v1/tasks/${cmd.id}/complete`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Idempotency-Key": idempotencyKey,
        "If-Match": String(cmd.ifMatch),
      },
      body: null,
      idempotencyKey,
    });
    if (!navigator.onLine) return undefined;
    try {
      const result = await repository.complete(cmd);
      void safeDequeueByKey(idempotencyKey);
      return result;
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        const entry = await findEntryByKey(idempotencyKey);
        if (entry) throw new ConflictError(entry, error.currentTask ?? {});
      }
      throw error;
    }
  },
  // D-1: 完了は ["tomorrow"] / ["today"] / ["focus"] を invalidate
  // (today のカウンタが +1 されるため ["today"] も含める).
  onSuccess: invalidateAfterMoveToToday,
  onError: (error) => {
    if (error instanceof ConflictError) {
      conflictDialog.openDialog(error.entry, error.serverValue);
      return;
    }
    notifyError("通信に失敗しました");
  },
  networkMode: "offlineFirst",
});

const handleComplete = useCallback(
  (task: Task) => {
    const cmd: CompleteTaskCommand = { id: task.id, ifMatch: task.version };
    completeMutation.mutate(cmd);
  },
  [completeMutation],
);
```

#### 追加: 「完了」 button JSX

```tsx
<div className="tomorrow-view__actions">
  <button type="button" onClick={() => handleDelete(task)}>削除</button>
  {task.origin !== "routine" && (
    <button type="button" onClick={() => handleMoveToToday(task)}>今日にする</button>
  )}
  <button type="button" onClick={() => handleComplete(task)}>完了</button>
</div>
```

注: routine origin の場合「今日にする」を非表示にする (REQ-2 / 既存仕様の継承). 「完了」は origin を問わず表示する.

#### 変更しない箇所

- 起票フォーム / `createMutation` / `updateMutation` / `deleteMutation` / `handleMoveToToday` / `handleDelete` / 既存 ConflictDialog 経路.

### 重要な決定

- **D-1 (tomorrow の「完了」成功時の invalidate 範囲)**
  - 既存 `invalidateAfterMoveToToday` (= `["tomorrow"]` / `["today"]` / `["focus"]`) を再利用する. 完了で今日のカウンタが +1 されるため `["today"]` の再フェッチが必要.
  - 新規ヘルパーは作らない (関数名のみ実態と乖離するが影響軽微. plan レビューで命名を再検討してよい).

- **D-2 (ラベル「明日へ / 今日へ」→「明日にする / 今日にする」)**
  - foundation §「モックアップ下段」の文言に合わせて統一. 既存テスト regex `/明日へ|期限|今日へ/` は新文言に更新する. E2E `e2e/tasks.spec.ts` も `name: "明日へ"` を `name: "明日にする"` に更新する.

- **D-3 (`setFocusMutation` を本 BL で削除する)**
  - spec U-3 の方針確定. 未使用コードを残さない. BL-043 (set-focus-gesture) で必要になった時点で再導入する. BL-043 の plan / tasks 起票時に「mutation 再追加 + 別経路 (長押し等) 紐づけ」をタスク化する.

- **D-4 (編集 button の代替 UI は提供しない)**
  - spec 非ゴール / U-4. 本 BL 完了後に backlog に「タスク編集ダイアログの再導入」 BL を起票する想定 (BL-048+). 本 BL の tasks には backlog 追記 task を含める.

- **D-5 (E2E 編集テストの扱い = skip + コメント)**
  - spec U-5. `e2e/tasks.spec.ts` の `タスクを編集すると名前が一覧に反映される` を `test.skip(...)` に変更し, コメントで「BL-042 で編集 UI を一時撤去. 代替 BL (TBD) で skip 解除予定」と記す.

- **D-6 (focus-view 無改修の担保)**
  - `focus-view.spec.ts` / `focus-view.test.tsx` を red にしないため focus-view は触らない. auditor で「focus-view のテスト件数 / 内容に diff が無い」を確認する.

## リスク / 代替案

- **R-1 (編集経路の一時喪失)**:
  - 本 BL 適用後, タスク名称の編集ができなくなる. ドッグフーディング中に不便が出る可能性.
  - 緩和: 代替 BL を本 BL と同時 / 直後に起票する. release tag は本 BL + 代替 BL の同時 merge を待ってから打つ運用も検討 (任意).

- **R-2 (`handleToggleDueDate` の name 維持)**:
  - 関数名は「Toggle」のままだが UI ラベルは「明日にする / 今日にする」に変わる. 命名のずれは軽微. 代替案: `handleSetDueDateInverse` 等にリネーム. 本 BL では既存名を維持 (差分最小化).

- **R-3 (tomorrow `completeMutation` 重複コード)**:
  - today-view と同型のコードがコピペで増える. 共通化リファクタは別 BL (mutation factory 化). 本 BL では差分最小化を優先する.

- **R-4 (routine タスクの「完了」挙動)**:
  - routine origin タスクの完了は既存実装 (FR-033 / BL-017) で動く. tomorrow 側で「完了」を新規追加した結果, routine タスクが翌日に再生成されないことが期待挙動か確認が必要 (spec U-2 と連動).
  - 緩和: tomorrow-view.test に routine origin タスクで「完了」を押すケースを追加 (任意).

- **R-5 (axe 違反の混入)**:
  - DOM 構造を変えると aria-label / contrast が壊れる可能性. BL-029 の `e2e/a11y.spec.ts` で全 view を再走査して 0 件を担保する.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体 (Vitest + Testing Library)

- **today-view.test.tsx**:
  - **削除 / skip**: 「シナリオ: 既存タスクの名称を編集して保存できる」(411〜) / 「「現在に設定」→ setFocus 呼出」(1147〜) / 「「現在解除」→ setFocus(null) 呼出」(1199〜) を `it.skip` or 削除. 削除する場合は「BL-042 で button を撤去」コメントを `describe` 上に残す.
  - **更新**: `name: /明日へ|期限|今日へ/` の regex (1001 行付近) を `name: /明日にする|今日にする/` に更新.
  - **新規**: 「カード内のアクション button が 3 つだけ存在する」 (REQ-1) を追加. `within(card).getAllByRole("button")` で 3 (or routine の 2) を確認 (PriorityStars の星 button はカード内に出るためアクション数の assert は accessibleName ベースで判定する設計を tasks 側で確定).
  - **回帰維持**: 「完了」「削除」「期限切替」関連の既存シナリオは引き続き通る.

- **tomorrow-view.test.tsx**:
  - **更新**: 「アクションは「削除」「今日にする」の 2 つのみ」 (663〜) を「3 つ (削除 / 今日にする / 完了) のみ」に書き換え. `completeButton` の存在 assert を追加. 「`TomorrowView は complete を呼ばないはず`」コメント (267〜) を撤去 + 反転.
  - **新規**: 「完了クリックで `repository.complete({ id, ifMatch })` が 1 回呼ばれる」(REQ-2 / AC-6).
  - **新規**: 「完了成功後に ["tomorrow"] / ["today"] / ["focus"] が invalidate される」.
  - **新規**: 「ConflictDialog 経路 (online 412 → dialog) が完了でも動く」.
  - **回帰維持**: 「今日にする」「削除」関連の既存シナリオは引き続き通る.

- **focus-view.test.tsx**: 無改修.

### E2E (Playwright)

- **e2e/tasks.spec.ts**:
  - 「タスクを編集すると名前が一覧に反映される」: `test.skip(...)` に変更. コメントで「BL-042 で編集 UI 撤去 / 代替 BL で復活予定」を残す.
  - 「明日へを押すと今日の一覧から消える」: button name を `明日にする` に変更.
- **e2e/tomorrow-view.spec.ts**: 「完了」クリックで今日の一覧 (←切替後) に出ず, /today に切り替えるとカウンタが +1 されることを確認 (任意, 単体で十分なら省略可).
- **e2e/a11y.spec.ts**: 走査結果が violations 0 件を維持することを確認 (テスト変更不要 / CI 走査のみ).
- **e2e/focus-view.spec.ts**: 無改修. 既存 green を維持.

### 受け入れ基準とテストの対応

| AC | テスト |
| --- | --- |
| AC-1 | today-view.test 新規 (3 ボタン assert) |
| AC-2 | today-view.test (強調セクション 3 ボタン assert) |
| AC-3 | tomorrow-view.test 更新 (3 ボタン assert) |
| AC-4 | today-view.test 既存 (完了→complete + counter +1) |
| AC-5 | today-view.test 既存 (期限切替). 文言更新 |
| AC-6 | tomorrow-view.test 新規 (完了→complete + invalidate ["today"]) |
| AC-7 | tomorrow-view.test 既存 (削除 / 今日にする). 触らない |
| AC-8 | today-view.test 新規 or 既存 (routine origin で「明日にする」非表示) |
| AC-9 | focus-view.test 無改修 / e2e/focus-view.spec.ts 無改修 |
| AC-10 | today-view.test (編集 form / 編集 button が無いことを assert) + e2e/tasks.spec.ts (test.skip) |
| AC-11 | today-view.test (「現在に設定」「現在解除」 button が無いことを assert) |
| AC-12 | e2e/a11y.spec.ts (走査) |
| AC-13 | today-view.test 既存 (ConflictDialog) + tomorrow-view.test 新規 (完了の ConflictDialog) |
