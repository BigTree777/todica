# 仕様: 「現在のタスク」独立ビュー化 (focus-view)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-037
- 前提 feature:
  - [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) REQ-2 (3 ビューの責務分離) / REQ-3 (focus-view のアクションは 2 つ)
  - [`../ui-sidebar-nav/spec.md`](../ui-sidebar-nav/spec.md) REQ-4 (`/focus` ルートに placeholder が割り当て中)
  - [`../focus-task/spec.md`](../focus-task/spec.md) BL-006: `FocusSelection` / 自動繰上げ / 暗黙フォールバック (`currentTaskId ?? nextTaskId`)
- 関連 BL:
  - **BL-006** (focus-task): `getFocus()` / `setFocus()` / 完了 / 削除 / 期限変更時の自動解除 (`clearFocusIfMatches`) ロジックを再利用.
  - **BL-008** (completion-counter): 完了アクションでカウンタ +1 を維持.
  - **BL-012** (task-delete): 削除アクションでカウンタ非加算を維持.
  - **BL-031** / **BL-033** (web-error-handling): online 412 → `ConflictDialog` の機構をそのまま使う.
  - **BL-036** (ui-sidebar-nav): 本 BL は AppShell 配下の `/focus` ルートを対象とし, 既存 `FocusViewPlaceholder` を実コンポーネントに置き換える.
- 由来要件: FR-012 (現在のタスクを 1 つ選べる) / FR-013 (現在のタスクの自動解除)
- 関連 NFR: NFR-010 (最小手数の起票) / NFR-011 (フォーカス時の単独大表示)

## 背景 / 課題

todica v1.0.0 までで FR-012 / FR-013 / NFR-011 を満たす形で「現在のタスク」概念と自動繰上げは BL-006 で実装済みだが, 表示は **今日ビュー (`/today`) の中の `<section aria-label="現在のタスク">` という強調セクション** に同居しており, 以下が成立していない.

1. **NFR-011 「フォーカス時の単独大表示」が成立しない**. `today-view.tsx` は同じ画面に「完了数カウンタ」「起票フォーム」「タスク一覧」「編集ダイアログ」が同居しており, 「現在のタスク」が画面全体を占める単独大表示にはなっていない. ui-redesign-foundation §「課題」項目 1 で指摘済み.
2. **アクションが 6 つ並ぶ** (優先度切替 / 編集 / 明日へ / 完了 / 削除 / 現在解除). モックアップでは focus-view 専用画面では **「削除」「完了」の 2 つのみ** に絞ることが ui-redesign-foundation REQ-3 で確定している.
3. **`/focus` ルートが placeholder のまま**. BL-036 で AppShell + `/focus` ルートが導入され, 現在は `FocusViewPlaceholder` が「準備中 (BL-037)」テキストを表示しているだけ. 本 BL でこれを実コンポーネントに置き換える.

本 BL は **今日ビューを変更せず**, `/focus` ルートに対応する独立した focus-view コンポーネントを新設することで, モックアップが要求する「今やる 1 つに集中する」体験を成立させる. アクションを 2 つ (削除 / 完了) に絞り, 編集 / 優先度切替 / 期限変更 / 「現在解除」は今日ビューに戻ってから行う前提とする.

## ゴール / 非ゴール

### ゴール

- **`/focus` ルートでフォーカス対象を単独大表示する**:
  - フォーカス対象 (= `currentTaskId ?? nextTaskId` で選ばれるタスク) がある時, その名前を画面全体を占める大きな角丸枠の中央に大きな文字で表示する.
  - プロジェクト名は副情報として小さく表示する (タスクが project に紐づいている場合).
- **アクションを 2 つに絞る**:
  - 枠の下部左に「削除」, 下部右に「完了」の 2 ボタンのみ.
  - 編集 / 優先度切替 / 期限切替 / 「現在解除」は本ビューに置かない.
- **タスクなし時も枠を大きく表示する**:
  - フォーカス対象が無い (`currentTaskId = null` かつ `nextTaskId = null`) 時も角丸枠だけは大きく表示し, 中央に「現在のタスクはありません」のテキストを出す.
  - 「削除」「完了」ボタンは無効化または非表示にする (操作対象が無いため).
- **既存 BL-006 / BL-008 / BL-012 の振る舞いを完全に踏襲する**:
  - 完了操作で **completionCount +1 (BL-008) + 自動解除 (BL-006 `clearFocusIfMatches`)**.
  - 削除操作で **completionCount 非加算 (BL-012) + 自動解除 (BL-006)**.
  - サーバ API は無改修.
- **ConflictDialog の維持**: 412 が返った場合は BL-031 / BL-033 の機構をそのまま使い `ConflictDialog` を開く.
- **`FocusViewPlaceholder` の置き換え**: BL-036 で導入された `web/src/ui/focus-view/focus-view-placeholder.tsx` を削除し, 本 BL で実コンポーネント `web/src/ui/focus-view/focus-view.tsx` に置き換える. `main.tsx` の `/focus` ルート割り当ても更新する.

### 非ゴール

- **`today-view.tsx` 内の focus セクションの削除**: 本 BL では行わない. `<section aria-label="現在のタスク">` は今日ビュー側に残したまま並走させる. 今日ビュー全体の刷新時 (BL-042 等の後続 BL で「今日ビューが分解される」時) に削除する.
  - 理由: 今日ビュー側の振る舞いを変えると BL-001 〜 BL-031 の既存 E2E / 単体テストへの影響が広がる. 本 BL は focus-view 新設のみに専念する.
- **「現在に設定 (set focus)」UI の提供**: focus-view 上には置かない. 「現在に設定」は今日ビューのタスクカードから行う (BL-043 で UX 確定予定). 本 BL の focus-view は表示と「削除 / 完了」のみ.
- **「現在解除」UI の提供**: 本ビューには置かない. 解除は完了 / 削除時の自動解除 (FR-013) で行う.
- **編集 / 優先度切替 / 期限変更 UI の提供**: 本ビューには置かない. 必要な操作は今日ビューに戻って行う.
- **起票フォームの提供**: 本ビューには置かない. 新規タスクの起票は `/today` または `/tomorrow` で行う (ui-redesign-foundation REQ-4).
- **サーバ API / ドメイン層の変更**: なし. 既存 `GET /api/v1/today` / `GET /api/v1/focus` / `POST /api/v1/tasks/:id/complete` / `DELETE /api/v1/tasks/:id` をそのまま使う.
- **デザイントークン化**: 本 BL では暫定 CSS (vanilla CSS + 直接値) で組む. BL-046 で `var(--space-md)` 等に置換する前提で `/* TODO(BL-046) */` マーカーを残す.
- **モバイル (狭幅) でのレイアウト最適化**: 本 BL はデスクトップ幅 (AppShell サイドバー常時表示) 前提で組む.

## 要件

### 機能要件

- **REQ-1 フォーカス対象がある時はその名前を大きく表示する**
  - 画面 (AppShell のメイン領域) 全体を占める大きな角丸枠を 1 つ描画する.
  - 枠の上部に見出し「現在のタスク」(`<h1>`).
  - 枠の中央にタスク名を大きな文字で表示する (見出しの 1 段下のサイズ. 暫定では `font-size: 24px` 程度).
  - タスクが project に紐づいている時は, タスク名の上に project 名を **副情報として小さく** 表示する. project 名取得は `ProjectRepository.list()` から該当 id を引いて表示する.
  - タスクの優先度 (highest / normal / later) や dueDate も補助情報として小さく表示してよい (実装裁量. ただし大きく主張させない).

- **REQ-2 フォーカス対象が無い時は空状態を表示する**
  - フォーカス対象 = `currentTaskId ?? nextTaskId` が `null` の時 (= 今日のタスクが 0 件 + FocusSelection 未設定の時) は, 枠だけを描画し中央に「現在のタスクはありません」のテキストを表示する.
  - 「削除」「完了」ボタンは無効化 (`disabled`) または非表示にする. 押下したときの挙動を未定義にしないよう保証する.

- **REQ-3 フォーカス対象の選定ロジックは既存と同じ**
  - フォーカス対象は **`focusData.currentTaskId ?? nextTaskId`** で決定する.
    - `focusData` は `repository.getFocus()` の結果 (`FocusSelection`).
    - `nextTaskId` は `repository.today()` の結果 (`TodayViewResponse.nextTaskId`).
  - 本 BL で挙動を変更しない (BL-006 と同じセマンティクスをそのまま使う).
  - 対象タスクの実体は `tasks` 一覧 (`repository.today().tasks`) から `tasks.find(t => t.id === focusedId)` で引く.

- **REQ-4 アクションは「削除」「完了」の 2 ボタンのみ**
  - 枠の下部左に「削除」, 下部右に「完了」を配置する.
  - **編集 / 優先度切替 (cycle priority) / 期限切替 (today ↔ tomorrow) / 「現在解除」/ 「現在に設定」のボタンは置かない**.
  - キーボード操作のため `<button type="button">` で実装する.

- **REQ-5 「完了」操作は既存 BL-006 / BL-008 / FR-013 のロジックを再利用する**
  - 「完了」ボタン押下時:
    - `repository.complete({ id: focusedTask.id, ifMatch: focusedTask.version })` を呼ぶ.
    - サーバ側で **completionCount +1 (BL-008)** + **focus 自動解除 (BL-006 `clearFocusIfMatches`. FR-013)** が走る.
    - クライアント側で `today` / `focus` の query を invalidate して再フェッチする.
    - 再フェッチ後, 暗黙フォールバック (`null ?? nextTaskId`) により次のタスクが自動的に focus-view に表示される. 今日のタスクが 0 件になれば REQ-2 の空状態に遷移する.
  - **クライアントから明示的に `setFocus` は呼ばない**. 自動解除はサーバ側 (FR-013) で行われるため.

- **REQ-6 「削除」操作は既存 BL-006 / BL-012 / FR-013 のロジックを再利用する**
  - 「削除」ボタン押下時:
    - `repository.delete({ id: focusedTask.id, ifMatch: focusedTask.version })` を呼ぶ.
    - サーバ側で **trashedReason = "deleted" でゴミ箱送り (BL-001)** + **completionCount 非加算 (BL-012)** + **focus 自動解除 (BL-006 `clearFocusIfMatches`. FR-013)** が走る.
    - クライアント側で `today` / `focus` の query を invalidate して再フェッチする.
    - 完了時と同様, 暗黙フォールバックで次のタスクが自動的に表示される.

- **REQ-7 起票フォームを置かない**
  - 本ビューには新規タスクの起票フォームを **置かない** (ui-redesign-foundation REQ-4).
  - タスクの新規起票は `/today` または `/tomorrow` で行う.
  - タスクなし時の空状態 (REQ-2) でも起票フォームは出さない.

- **REQ-8 ConflictDialog の表示は維持する**
  - 「削除」「完了」操作で online 412 (`OptimisticLockError`) が返った場合, BL-031 で導入された機構 (`findEntryByKey` + `ConflictError` 変換 + `useConflictDialog`) をそのまま流用して `ConflictDialog` を表示する.
  - ネットワークエラー / 401 等は BL-034 の `notifyError("通信に失敗しました")` を呼ぶ.
  - offline 時 (`!navigator.onLine`) は今日ビュー (`today-view.tsx`) と同じ書込キュー (`offline-queue.ts`) に enqueue し, 楽観的に成功を返す.

### 非機能要件

- **NFR-011 (フォーカス時の単独大表示) との整合**:
  - `/focus` 単独で「現在のタスク」が画面全体を占める. 他タスクは表示しない.
  - 文字サイズ / 余白の暫定値は本 BL 内で決め, BL-046 でトークン化する前提で TODO マーカーを残す.
- **NFR-010 (最小手数の起票) との整合**:
  - 本ビューでは起票しない. NFR-010 の対象外 (起票導線は `/today` 側).
- **NFR-001 (単一ワークフロー強制) との整合**:
  - 「削除」「完了」の 2 アクションのみ. ビュー切替 / カスタマイズは導入しない.
- **NFR-013 (並び順の予測可能性) との整合**:
  - 並び順は本 BL のスコープ外. サーバ側 `priority → createdAt → id` をそのまま使う.
- **アクセシビリティ**:
  - `<main>` または `<section aria-label="現在のタスク">` でランドマーク化する. (AppShell が `<main className="app-shell__main">` を提供しているため, 本ビュー内では `<section aria-label="現在のタスク">` 1 つを置く形を想定).
  - BL-029 の axe 検査が引き続き violations 0 を維持すること.
  - 「削除」「完了」ボタンはキーボード Tab + Enter で操作可能.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

### フォーカス対象がある時の表示 (REQ-1 / REQ-3)

```
シナリオ: /focus でフォーカス対象が存在する時にタスク名が大きく表示される
  Given 今日のタスク A (name="牛乳", projectId="p1") が並び先頭にある
  And   FocusSelection.currentTaskId = null (暗黙フォールバック)
  When  Web クライアントを /focus で表示する
  Then  画面に見出し「現在のタスク」が表示される
  And   タスク名「牛乳」が画面中央に大きく (見出しより 1 段下のサイズで) 表示される
  And   プロジェクト名 "p1" の name が副情報として小さく表示される
  And   下部に「削除」「完了」の 2 ボタンが表示される
```

```
シナリオ: FocusSelection.currentTaskId が明示設定されている時はその id がフォーカス対象になる
  Given 今日のタスク A, B が priority → createdAt → id の順で並ぶ (並び先頭 = A)
  And   FocusSelection.currentTaskId = B.id (明示設定)
  When  /focus を表示する
  Then  タスク B (の name) が中央に表示される (= currentTaskId が nextTaskId より優先される)
```

### フォーカス対象が無い時の空状態 (REQ-2)

```
シナリオ: 今日のタスクが 0 件かつ FocusSelection 未設定の時は空状態を表示する
  Given 今日のタスクが 0 件 (nextTaskId = null)
  And   FocusSelection.currentTaskId = null
  When  /focus を表示する
  Then  画面に見出し「現在のタスク」が表示される
  And   中央に「現在のタスクはありません」のテキストが表示される
  And   「削除」「完了」ボタンが無効化 (disabled) または非表示になっている
```

### アクション数の規約 (REQ-4)

```
シナリオ: focus-view 上に置かれるアクションボタンは「削除」「完了」の 2 つのみ
  Given 今日のタスク A が存在し /focus を表示している
  When  画面内のボタン要素を列挙する
  Then  「削除」「完了」の 2 つだけが存在する
  And   「編集」「優先度切替」「明日へ」「今日へ」「現在解除」「現在に設定」のボタンは存在しない
```

### 完了操作 (REQ-5 / FR-013 / BL-006 / BL-008)

```
シナリオ: /focus で「完了」ボタンを押すと完了 + カウンタ +1 + 自動解除 + 次のタスクへ繰り上がる
  Given 今日のタスク A (現在), B が並び順 A, B で存在する
  And   FocusSelection.currentTaskId = A.id, A.version = 1
  And   completionCount = 0
  When  /focus で「完了」ボタンを押す
  Then  サーバの POST /api/v1/tasks/{A.id}/complete が If-Match: 1 で呼ばれる
  And   サーバ側で A が trashedReason = "completed" となる (BL-006)
  And   サーバ側で completionCount が 1 に増える (BL-008)
  And   サーバ側で FocusSelection.currentTaskId が null に解除される (FR-013 / BL-006 clearFocusIfMatches)
  And   クライアントは today / focus の query を再フェッチする
  And   再フェッチ後の /focus 画面では暗黙フォールバック (null ?? nextTaskId = B.id) により B が表示される
```

```
シナリオ: /focus で「完了」を押した結果, 今日のタスクが 0 件になれば空状態に遷移する
  Given 今日のタスクは A のみ (現在)
  When  /focus で「完了」ボタンを押す
  Then  完了後の /focus は「現在のタスクはありません」の空状態を表示する
```

### 削除操作 (REQ-6 / FR-013 / BL-006 / BL-012)

```
シナリオ: /focus で「削除」ボタンを押すとゴミ箱送り + カウンタ非加算 + 自動解除 + 次のタスクへ繰り上がる
  Given 今日のタスク A (現在), B が並び順 A, B で存在する
  And   FocusSelection.currentTaskId = A.id, A.version = 1
  And   completionCount = 5
  When  /focus で「削除」ボタンを押す
  Then  サーバの DELETE /api/v1/tasks/{A.id} が If-Match: 1 で呼ばれる
  And   サーバ側で A が trashedReason = "deleted" となる (BL-001)
  And   サーバ側で completionCount は 5 のまま (BL-012 非加算)
  And   サーバ側で FocusSelection.currentTaskId が null に解除される (FR-013 / BL-006)
  And   クライアントは today / focus の query を再フェッチする
  And   再フェッチ後の /focus 画面では B が表示される
```

### ConflictDialog (REQ-8 / BL-031)

```
シナリオ: 「完了」操作で online 412 が返ったとき ConflictDialog が開く
  Given /focus でタスク A が表示されている (A.version = 1)
  And   別タブで A.version が 2 に進んでいる
  When  /focus で「完了」ボタンを押す
  Then  サーバが 412 を返す
  And   HttpTaskRepository が OptimisticLockError を throw する
  And   focus-view が findEntryByKey で queue 内の entry を引き ConflictError に変換する
  And   ConflictDialog が開いてサーバの現行値を表示する
```

```
シナリオ: 「削除」操作で online 412 が返ったとき ConflictDialog が開く
  Given /focus でタスク A が表示されている (A.version = 1)
  And   別タブで A.version が 2 に進んでいる
  When  /focus で「削除」ボタンを押す
  Then  ConflictDialog が開いてサーバの現行値を表示する
```

### 通信エラー (BL-034)

```
シナリオ: ネットワークエラー時は ErrorNotification の「通信に失敗しました」が表示される
  Given /focus でタスク A が表示されている
  When  「完了」ボタンを押し, fetch が失敗する (401 / ネットワークエラー)
  Then  notifyError("通信に失敗しました") が呼ばれる
  And   既存の <ErrorNotification /> バナーに「通信に失敗しました」が表示される
```

### 起票フォームを置かない (REQ-7)

```
シナリオ: /focus 画面にはタスク起票フォームが存在しない
  Given /focus を表示している (フォーカス対象あり / なしを問わず)
  When  画面内のフォーム / 入力要素を列挙する
  Then  「タスク名」「プロジェクト」「優先度」「期限」の入力要素は存在しない
  And   「追加」「起票」のボタンも存在しない
```

### 既存 view の不変条件 (非ゴール担保)

```
シナリオ: today-view.tsx の focus セクションは本 BL では削除されない
  Given /today を表示する
  When  画面を観察する
  Then  既存の <section aria-label="現在のタスク"> が引き続き表示される
  And   優先度切替 / 編集 / 明日へ / 完了 / 削除 / 現在解除 の 6 ボタンが引き続き存在する
  ※ 削除は後続 BL (今日ビューの分解) で行う.
```

```
シナリオ: AppShell の /focus ルートに focus-view が割り当て済みであり, placeholder は削除されている
  Given main.tsx の Routes 定義を参照する
  When  /focus の element を確認する
  Then  <FocusView /> (新規) が割り当てられている
  And   <FocusViewPlaceholder /> は import されていない (削除済み)
  And   ファイル web/src/ui/focus-view/focus-view-placeholder.tsx は存在しない
```

## 未決事項 / 確認待ち

- **U-001 タスクが project に紐づいていない時の副情報表示**:
  - `projectId === null` (未分類) のタスクの場合, 副情報の project 名を「(未分類)」のような placeholder で出すか, 何も出さないか.
  - **保守側デフォルト案**: 何も出さない (要素ごと描画しない). project 名を強調する画面ではないため.
- **U-002 完了 / 削除ボタンの確認ダイアログの要否**:
  - 「削除」誤操作時のリカバリはゴミ箱経由復元 (BL-011) で担保されているため, 確認ダイアログは不要と判断する.
  - **保守側デフォルト案**: 確認ダイアログなし. 押下即実行.
- **U-003 タスク名表示の最大幅と折返し**:
  - 長いタスク名 (例: 100 文字以上) の表示挙動を本 BL で決めるか.
  - **保守側デフォルト案**: 自然な折返し (word-break: normal + 枠幅で改行). 切り詰めはしない.
- **U-004 優先度 / 期限の副情報表示の有無**:
  - REQ-1 で「補助情報として小さく表示してよい」としているが, 必須にするかは未確定.
  - **保守側デフォルト案**: **表示しない** (削除 / 完了の 2 アクションに集中させるため. ノイズを増やさない). モックも優先度 / 期限の表示を含まない.
- **U-005 タスクなし時のボタンの扱い (無効化 vs 非表示)**:
  - REQ-2 で「無効化または非表示」と両論併記しているが, どちらを採るか.
  - **保守側デフォルト案**: **非表示**. タスクが存在しないのにボタンが見えていると認知負荷が増える. 枠だけ大きく描画し中央テキストのみ.
- **U-006 「完了」「削除」ボタンの並び順**:
  - モックは左に「削除」, 右に「完了」. 右が次の操作 (進む方向) という慣例とも整合.
  - **保守側デフォルト案**: モック通り左=削除, 右=完了.
- **U-007 focus-view が `useQuery` する key の共有**:
  - 今日ビューと同じ query key (`["today"]` / `["focus"]` / `["projects"]`) を使うか, 専用 key を使うか.
  - **保守側デフォルト案**: **同じ key を使う**. TanStack Query のキャッシュ共有で `/today` ↔ `/focus` 間の遷移時に再フェッチを避けられる. invalidate も同じ key で済む.
- **U-008 デザイントークン化のタイミング**:
  - 本 BL の暫定 CSS を BL-046 でトークン化する前提で TODO マーカーを残すが, 角丸枠の角丸半径 (`border-radius`) も `var(--radius-lg)` 想定でマーカーを付けるか.
  - **保守側デフォルト案**: 暫定値 `border-radius: 16px` 程度を直書きし `/* TODO(BL-046): --radius-lg */` を付ける.
- **U-009 今日ビュー側の focus セクションを残すことによるユーザー混乱**:
  - 本 BL 完了後の過渡期, `/today` でも `/focus` でも「現在のタスク」が表示される状態になる. ユーザーが両方を見て混乱しないか.
  - **保守側デフォルト案**: 過渡期は許容する. 後続 BL (今日ビュー分解) で today-view 側の focus セクションを削除し本来の状態に収束させる. 本 BL の PR 説明・spec で「過渡期である」旨を明示する.
