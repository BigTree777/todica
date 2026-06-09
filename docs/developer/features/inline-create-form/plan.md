# 設計・実装計画: 起票フォームから期限セレクトを削除 (ビュー文脈で dueDate 決定)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`web/src/ui/today-view/today-view.tsx` の起票フォームから期限 `<select>` と `dueDate` state を削除し, `handleCreate` 内で `dueDate: "today"` をリテラルとして固定送信する. サーバ API / `CreateTaskCommand` 型 / オフラインキューの payload スキーマは無改修. タスクカード上の「明日へ」ボタン (BL-007) と編集フォームは触らず, 起票後の dueDate 変更経路は既存のまま維持する. 既存の単体テストのうち, 起票フォーム内で期限 UI の存在を期待していた 1 アサーションのみを反転して red → green に揃える.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | **変更なし**. `POST /api/v1/tasks` の body は引き続き `dueDate` を含む (常に `"today"`). `CreateTaskCommand` / `Task` / DB スキーマ無改修. |
| DB | **変更なし**. |
| ドメイン (`domain/`) | **変更なし**. `DueDate` 型 / 関連バリデーションは触らない. |
| モジュール (web) | `web/src/ui/today-view/today-view.tsx` のみ変更. `dueDate` state の `useState` を削除し, 起票フォームから `<label>期限</label>` と `<select id="task-due-date">` 要素を削除する. `handleCreate` 内の `cmd.dueDate` を `"today"` リテラルに固定し, submit 後の `setDueDate("today")` 呼び出しも削除. `import type { DueDate, ... }` は `handleToggleDueDate` で引き続き使うため残す. |
| UI | 今日ビューの起票フォーム入力要素が 5 → 4 になる (タスク名 / プロジェクト / 優先度 / 追加). 編集フォーム / タスクカード / 「現在のタスク」セクション / 完了数カウンタは無改修. |
| テスト (web 単体) | `web/__tests__/today-view.test.tsx` の 1 シナリオ「シナリオ: 今日ビューの起票フォームはタスク名のみ必須である」(305-326 行) のみ修正. `expect(dueDateControl).not.toBeNull()` を `expect(dueDateControl).toBeNull()` 相当に反転. 「シナリオ: 期限を今日 ↔ 明日 で切り替える操作を提供する」(376-395 行) など起票フォーム外の期限切替テストは無修正. |
| E2E | `e2e/tasks.spec.ts` の「明日へ」テスト (50-59 行) は無修正で green を維持する想定. 起票時の dueDate=today 固定でも, その後の「明日へ」ボタンによる移送経路は機能する. |
| ドキュメント | `docs/developer/planning/backlog.md` の BL-039 行を Doing → Done に更新 (auditor 承認後). 他の feature spec / plan には変更なし. |

## 設計詳細

### データモデル

- `Task` 型 / `CreateTaskCommand` 型は変更しない.
- 起票フォームのローカル state の差分:
  - 削除: `const [dueDate, setDueDate] = useState<DueDate>("today")` (today-view.tsx:119)
  - 維持: `name` / `projectId` / `priority` / `editingTask` / `editingName`

### 処理フロー (起票)

#### 変更前 (現状)

1. ユーザーが起票フォームでタスク名・プロジェクト・**期限**・優先度を入力.
2. 「追加」クリックで `handleCreate` (today-view.tsx:345-363) が実行される.
3. `cmd: CreateTaskCommand` に `dueDate: dueDate` (state 値) を埋めて `createMutation.mutateAsync(cmd)` に渡す.
4. submit 後に `setName("")` / `setProjectId("")` / `setDueDate("today")` / `setPriority("normal")` でフォームをリセット.

#### 変更後

1. ユーザーが起票フォームでタスク名・プロジェクト・優先度を入力 (**期限は選ばない**).
2. 「追加」クリックで `handleCreate` が実行される.
3. `cmd: CreateTaskCommand` に `dueDate: "today"` (リテラル固定) を埋めて `createMutation.mutateAsync(cmd)` に渡す.
4. submit 後に `setName("")` / `setProjectId("")` / `setPriority("normal")` でフォームをリセット. `setDueDate(...)` の呼び出しは無くなる.

サーバ送信 body, オフラインキューに積む entry, `repository.create` のシグネチャは全て不変. `dueDate` フィールドは引き続き含まれるが常に `"today"`.

### 処理フロー (起票後の期限変更)

変更なし. 既存の `handleToggleDueDate` (today-view.tsx:390-401) でタスクカード上の「明日へ」ボタンから `PATCH /api/v1/tasks/{id} { dueDate: "tomorrow" }` を送り続ける. routine 由来タスクの非表示ルール (BL-017) も維持.

### 例外 / エラー処理

変更なし. 既存の `createMutation` の `onError` が `ConflictError` / ネットワークエラーをそのまま処理する (BL-031 / BL-033 / BL-034).

### UI 構造 (今日ビューの起票フォーム)

#### 変更前 (today-view.tsx:467-518)

```
<form aria-label="タスク起票フォーム">
  <label>タスク名</label> <input id="task-name" />
  <label>プロジェクト (任意)</label> <select id="task-project">...</select>
  <label>期限</label> <select id="task-due-date">          ← 削除対象
    <option value="today">今日</option>
    <option value="tomorrow">明日</option>
  </select>
  <label>優先度</label> <select id="task-priority">...</select>
  <button type="submit">追加</button>
</form>
```

#### 変更後

```
<form aria-label="タスク起票フォーム">
  <label>タスク名</label> <input id="task-name" />
  <label>プロジェクト (任意)</label> <select id="task-project">...</select>
  <label>優先度</label> <select id="task-priority">...</select>
  <button type="submit">追加</button>
</form>
```

4 要素になり foundation REQ-4 と tomorrow-view spec REQ-2 と並列になる.

## 重要な決定

- **D-001 dueDate は state ではなく `handleCreate` 内のリテラルで指定する**: ユーザー操作で変わらない値を state で管理する必要はない. `cmd.dueDate = "today"` を直接渡す. (spec U-001 案 A を採用)
- **D-002 サーバへの POST body には `dueDate` を明示送信する**: サーバ側 `CreateTaskCommand` (BL-001) の仕様で `dueDate` 省略時の挙動を明示的に依存しないため. クライアントが常に明示値を送ることで, 将来サーバ側の既定値が変わっても挙動が変わらない. (spec U-003 案 A)
- **D-003 既存テスト 305-326 行のアサーション 1 行を反転する**: 新規テスト追加ではなく既存テストを修正. テストの責務 (起票フォーム入力要素の網羅性検証) と本 BL の新仕様が完全に同じ意図のため. (spec U-002 案 A)
- **D-004 `DueDate` 型の import は残す**: `handleToggleDueDate` 内で `const next: DueDate = ...` として使われ続けるため. import 文は無改修. (spec U-004)
- **D-005 編集フォームは触らない**: 編集フォームに元々期限項目が無く, 本 BL のスコープ外 (REQ-4). 編集フォームの UI 刷新は BL-042 等の後続 BL に委ねる.
- **D-006 タスクカード上の「明日へ」ボタンは維持する**: 起票後の dueDate 変更経路を残すため (FR-005 / BL-007 / Done). BL-040 (優先度 UI 星化) / BL-042 (一覧刷新) などでカードアクションを再設計する余地はあるが, 本 BL では触らない.

## リスク / 代替案

- **リスク**: 既存テスト `web/__tests__/today-view.test.tsx` の 318-319 行を反転する際, 他のシナリオに副作用がないか確認が必要. 起票フォーム外で `getByLabelText(/期限/)` を使っているテストは無いはず (期限切替は `findByRole("button", { name: /明日へ|期限|今日へ/ })` で取られている).
  - **対策**: 修正後にテストを実行し, 起票フォーム外の期限切替テスト (376 / 818 / 1246 / 1319 行付近) が全て green であることを確認する.

- **リスク**: E2E (`e2e/tasks.spec.ts:27-29 createTask` helper) が `page.getByLabel("タスク名")` で input を取得しているため, 起票フォーム構造変更の影響を受けない. 「明日へ」テスト (50-59 行) は起票時に期限を選ばない経路なので無修正で green.
  - **対策**: ローカル / CI で E2E 全件再実行を `auditor` フェーズで行う.

- **代替案 A (採用しない): サーバ側で `dueDate` を省略可能にする**. サーバ側 `CreateTaskCommand` を変更し dueDate 省略時に `"today"` を既定とする案. サーバ API 変更を伴うため本 BL のスコープを超える. 採用しない (非ゴール参照).

- **代替案 B (採用しない): `dueDate` state を残して非表示にする**. 起票フォームから select を削除するが state は残し, 内部値として `"today"` を保持する案. state を維持するメリットが無く, 削除した方がコードが簡潔. 採用しない.

- **代替案 C (採用しない): 既存テストはそのまま残し新規シナリオ「起票フォームに期限 UI が無い」を追加**. テストの責務が分散し既存テストが矛盾を抱えるため (起票フォームに期限が存在することを期待し続ける形). 採用しない (D-003).

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (`web/__tests__/today-view.test.tsx`)

- 既存シナリオの 1 アサーションを反転 (D-003) し, さらに **REQ-1 / REQ-2 を明示する新規シナリオを 2 件追加** する (auditor 指摘 S-01 を受け改訂): (a)「BL-039 起票フォームに『期限』select が存在しない」, (b)「BL-039 起票時に dueDate=today で create が呼ばれる」. 後者は現実装で偶然 green になるが将来の回帰捕捉用.
- 修正対象: 305-326 行「シナリオ: 今日ビューの起票フォームはタスク名のみ必須である」
  - 318-319 行: `expect(dueDateControl).not.toBeNull()` → `expect(dueDateControl).toBeNull()` 相当に反転.
  - 期限関連の不要 input が存在しないことを期待する向きで, foundation REQ-4 の 4 要素規約と一致させる.
- 無修正のテスト:
  - 「シナリオ: 起票フォームでタスク名を入力して送信するとタスクが追加される」(328-348 行): `createMock` の引数で `arg.name` / `arg.id` のみ検証. `dueDate` は検証していないため起票時に `"today"` 固定でも green.
  - 「シナリオ: 期限を今日 ↔ 明日 で切り替える操作を提供する」(376-395 行): タスクカード上のボタンを `findByRole("button", { name: /期限|明日|今日/ })` で取得. 起票フォームの期限 UI とは無関係.
  - 「シナリオ: 期限を today → tomorrow に切り替えると, 再取得後に該当タスクが今日ビューから消える」(818 行付近): 同上.
  - 「完了 / 削除 / 期限切替後にも repository.getFocus() が再フェッチされる」(1088 行付近) / 「期限切替 (today → tomorrow) でも完了数表示は変化しない」(1246 行付近) / routine 「明日へ」非表示テスト (1319 行付近): いずれもタスクカード上のボタン経路を扱っており起票フォームの期限 UI 削除の影響なし.

### E2E (`e2e/tasks.spec.ts`)

- 修正なし.
- 「「明日へ」を押すと今日の一覧から消える」(50-59 行) は無修正で green:
  - `createTask` helper (26-29 行) が `page.getByLabel("タスク名")` で入力するだけで起票するため, 期限 UI 削除の影響なし.
  - 起票時の dueDate=today 固定 → 「明日へ」ボタンクリック → 一覧から消える の経路がそのまま成立する.

### サーバ統合テスト

- 修正なし. サーバ API / DB スキーマ無改修のため.

### アクセシビリティ (axe)

- BL-029 の axe 検査を再実行し violations 0 を維持することを auditor で確認.
- label / select の削除で違反が増えないはずだが念のため.

## 段階的移行戦略

- 本 BL は **小さな差分の単 PR** で完結する. 段階的移行の必要はない:
  - 1 ファイル (`today-view.tsx`) の編集 + 1 ファイル (`today-view.test.tsx`) の 1 アサーション反転.
  - サーバ API / 隣接ビュー / ドメイン層に波及しない.
- 後続 BL (BL-040 優先度 UI 星化 / BL-041 プロジェクトトグル UI / BL-042 タスクカード刷新 / BL-043 「現在に設定」ジェスチャ / BL-044 プロジェクト追加ボタン / BL-046 デザイントークン / BL-047 完了数カウンタ再配置) が今日ビューの他の部分を順次刷新する想定. 本 BL はその先頭バッチ (foundation REQ-4 の 1 項目だけを倒す) に位置する.
