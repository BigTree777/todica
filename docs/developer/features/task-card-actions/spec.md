# 仕様: タスクカードのアクションを 3 つに削減 (task-card-actions)

- 状態: ドラフト
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-042
  - 上位要件: FR-005 (期限の切替) / FR-006 (完了アクション) / FR-007 (削除アクション)
  - 関連 NFR: NFR-010 (最小手数の起票・操作) / NFR-011 (フォーカス時の単独大表示) / NFR-013 (並び順の予測可能性)
  - 関連 feature:
    - [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) REQ-3 (タスクカードのアクション最大数 = 3) / §「モックアップ下段」
    - [`../priority-star-ui/spec.md`](../priority-star-ui/spec.md) (BL-040 完了. カード上の優先度切替は `PriorityStars` に置換済み)
    - [`../focus-view/spec.md`](../focus-view/spec.md) (BL-037 完了. 「削除 / 完了」の 2 ボタンに既に削減済み. 本 BL は触らない)
    - [`../tomorrow-view/spec.md`](../tomorrow-view/spec.md) (BL-038 完了. 現状は「削除 / 今日にする」の 2 ボタン. 本 BL で「完了」を追加して 3 ボタンにする)
    - [`../set-focus-gesture/`](../set-focus-gesture/) (BL-043 未着手. 「現在に設定」の代替経路は本 BL の範囲外)

## 背景 / 課題

`today-view.tsx` の各タスクカード (強調セクションと一覧の両方) には現在 6 アクションが並んでいる.

```
[優先度切替※] [編集] [明日へ / 今日へ] [完了] [削除] [現在に設定 / 現在解除]
```

- ※ 優先度切替は BL-040 (priority-star-ui) で `<PriorityStars />` に置換済み. これは「状態表示 + クリックで値が変わる」UI でありアクションボタンとはみなさないが, 視覚的には依然カード上を占有している.
- 強調セクション (現在のタスク) では `現在解除`, 一覧では `現在に設定` が表示されるため, 最大 6 個のクリック対象がカード 1 件に並ぶ.

モックアップ (`local/image.png`, foundation §「モックアップ下段」) では各タスクカードのアクションは **3 つのみ** (左=削除 / 中=明日にする / 右=完了) で, NFR-010 (最小手数) と NFR-011 (フォーカス時の単独大表示) を実現する規約として foundation REQ-3 が「アクション最大 3 つ」を確定している.

tomorrow-view は BL-038 で先に「削除 / 今日にする」の 2 ボタンとして実装されており, ここに「完了」を加えて today と対称な 3 ボタンに揃える必要がある (foundation REQ-2 / §「モックアップ」での tomorrow カード = 削除 / 今日にする / 完了).

本 BL は **「カードのアクション削減」だけ** を扱う. 削除する操作 (編集 / 現在に設定 / 現在解除) の代替経路設計は別 BL に分離する.

- 編集機能の代替 UI (カードタップ → ダイアログ起動など): 本 BL 範囲外, 別 BL で扱う.
- 「現在に設定」/「現在解除」の代替経路 (カード長押し / コンテキストメニュー等): BL-043 (set-focus-gesture) で扱う.

## ゴール / 非ゴール

### ゴール

- **today-view のタスクカードを 3 ボタンに削減**:
  - 強調セクション (現在のタスク) と一覧の両方で, ボタンを「削除」「明日にする」「完了」の 3 つだけに絞る.
  - 既存ラベル「明日へ」はモックの文言「明日にする」に統一する (foundation §「モックアップ下段」と整合).
  - `PriorityStars` (BL-040) は維持する. これは状態表示でありアクションのカウント外.
  - プロジェクト名 / タスク名 / その他の副情報表示は無傷.
- **tomorrow-view のタスクカードに「完了」を追加し 3 ボタンに揃える**:
  - 既存の「削除」「今日にする」に「完了」を追加. 並びは「削除 / 今日にする / 完了」(foundation §「モックアップ」と対称, today の中央=期限切替 / 右=完了 に揃える).
  - 完了 mutation は today-view 既存の `completeMutation` と同形 (`POST /api/v1/tasks/:id/complete` + If-Match + Idempotency-Key + キュー連携).
- **不要 button / handler の撤去**:
  - today-view から「編集」「現在に設定」「現在解除」button を削除する.
  - これに紐づく state (`editingTask`, `editingName`) / handler (`openEdit`, `cancelEdit`, `handleSaveEdit`, `handleSetFocus`) およびタスク編集フォームの JSX を削除する.
  - `setFocusMutation` は本 BL では使用されなくなるが, BL-043 で別経路から復活するため **コードからは削除する** (未使用の dead code として残さない. BL-043 で必要になれば再導入する).
- **アクセシビリティの維持**:
  - 残った 3 ボタンはすべて `<button type="button">` で実装し, `aria-label` (またはアクセシブルネーム) を保持する.
  - WCAG 2.1 AA contrast を維持し, `e2e/a11y.spec.ts` の 5 view で violations 0 件を保つ.
- **ConflictDialog / notifyError 経路の維持**:
  - 各 mutation の `OptimisticLockError` → `ConflictError` 変換と `ConflictDialog` 起動経路は無改修で残す.
  - `notifyError("通信に失敗しました")` 経路も無改修で残す.

### 非ゴール

- **「編集」操作の代替 UI の提供**:
  - 本 BL では編集 button を削除するのみで, 名称編集の代替経路 (カードタップ → ダイアログ等) は提供しない. 名称編集は当面 UI から不可になる. 代替経路の設計・実装は別 BL で扱う (本 BL 完了後に backlog に追加する想定).
  - **BL-070 (inline-edit-all-cards) で逆転**: 本 spec で「別 BL で扱う」と明言したタスク名編集の代替経路は BL-070 で TaskCard の name input 常時表示 + blur PATCH として提供された. 想定していた「カードタップ → ダイアログ起動」案ではなく, より軽量な「表示モードに常時 input を追加して名称編集を inline で提供」する形を採用した.
- **「現在に設定」/「現在解除」操作の代替 UI の提供**:
  - BL-043 (set-focus-gesture) の責務. 本 BL では button を削除するのみ. focus 機能自体 (FR-012 / FR-013 / `/focus` ビュー) は無傷.
- **focus-view (`/focus`) のアクション変更**:
  - BL-037 で「削除 / 完了」の 2 ボタンに既に削減済み. 本 BL では一切触らない.
- **サーバ API の変更**:
  - 既存の `POST /api/v1/tasks/:id/complete`, `PATCH /api/v1/tasks/:id`, `DELETE /api/v1/tasks/:id` をそのまま使う. ドメイン層 / DB / API spec は無改修.
- **PriorityStars / ProjectToggle の変更**:
  - BL-040 / BL-041 で確定済み. カード上の `<PriorityStars />` 表示は維持する (本 BL は状態表示の変更を扱わない).
- **ラベル文言の全面見直し**:
  - 本 BL では「明日へ」→「明日にする」の置換のみ行う. それ以外のテキスト (タイトル / プロジェクト名表示 / カウンタ等) は触らない.
- **デザイントークン化 / CSS の刷新**:
  - BL-046 の責務. 本 BL は HTML 構造とアクション数の変更のみ.

## 要件

### 機能要件

- **REQ-1 (today カードのアクション = 3 ボタン)**
  - `/today` の各タスクカード (強調セクション + 一覧) に置かれるアクションボタンは「削除」「明日にする」「完了」の 3 つのみとする.
  - 並び順は左から「削除 / 明日にする / 完了」とする (モック準拠).
  - `<PriorityStars />` は状態表示としてカード上に残す (アクション 3 ボタンの外).
  - origin = "routine" のタスクでは BL-017 / FR-033 に従い「明日にする」を非表示にする (今日に固定する仕様継承). この場合カードのアクションは「削除 / 完了」の 2 ボタンになる. **3 個は上限であり下限ではない.**

- **REQ-2 (tomorrow カードのアクション = 3 ボタン)**
  - `/tomorrow` の各タスクカードに置かれるアクションボタンは「削除」「今日にする」「完了」の 3 つとする.
  - 並び順は左から「削除 / 今日にする / 完了」とする.
  - origin = "routine" のタスクは BL-017 / FR-033 に従い「今日にする」を非表示とする (today 側と対称な扱い). この場合カードのアクションは「削除 / 完了」の 2 ボタンになる.
  - 「完了」クリックは `repository.complete({ id, ifMatch: task.version })` を呼び, 成功時に `["tomorrow"]` / `["today"]` / `["focus"]` を invalidate する (today に「今日の完了: N」が反映される).

- **REQ-3 (撤去するボタンと handler)**
  - today-view から次の button を削除する: 「編集」/「現在に設定」/「現在解除」.
  - 連動して次の state / handler / JSX を削除する: `editingTask`, `editingName`, `openEdit`, `cancelEdit`, `handleSaveEdit`, `handleSetFocus`, タスク編集フォーム (`aria-label="タスク編集フォーム"`).
  - `setFocusMutation` は本 BL では使用されなくなるためコードから削除する. BL-043 で再導入する.
  - 「明日へ / 今日へ」というラベル文言は「明日にする / 今日にする」に統一する. handler (`handleToggleDueDate`) は名称含めて維持してよい.

- **REQ-4 (アクセシビリティ)**
  - 残る 3 ボタンは `<button type="button">` を使う.
  - `<PriorityStars />` は BL-040 で確定済みの a11y を維持する.
  - axe (`e2e/a11y.spec.ts`) で WCAG 2.1 AA violations 0 件を維持する.
  - フォーカスリングは OS 既定 (outline) を消さない.

- **REQ-5 (ConflictDialog / notifyError 経路の維持)**
  - 残る 3 mutation (`updateMutation` for 期限切替 / `deleteMutation` / `completeMutation`) は引き続き `OptimisticLockError` → `ConflictError` 変換を行い, `ConflictDialog` を開く (BL-031).
  - ConflictError 以外のエラーは `notifyError("通信に失敗しました")` に流す (BL-034).
  - tomorrow-view の `completeMutation` 新設分も同じ経路に乗せる.

- **REQ-6 (focus-view は無改修)**
  - `/focus` のアクション (「削除 / 完了」の 2 ボタン) は BL-037 で確定済み. 本 BL は触らない.
  - focus-view 側の振る舞い (focus 自動繰上げ / 解除) も無改修.

- **REQ-7 (起票フォームの無改修)**
  - today-view / tomorrow-view の起票フォーム (タスク名 / プロジェクトトグル / 優先度星 / 追加) は本 BL では触らない (BL-039 / BL-040 / BL-041 で確定済み).

### 非機能要件

- **NFR-A11Y**: `e2e/a11y.spec.ts` の 5 view (today/projects/trash/routines/settings) + `e2e/tomorrow-view.spec.ts` / `e2e/focus-view.spec.ts` で WCAG 2.1 AA violations 0 件を維持.
- **NFR-PERF**: 削減によりカードの再レンダリングコストは下がる方向のみ. 既存パフォーマンス (1000 件 / 13ms, BL-029) を悪化させないこと.
- **NFR-COMPAT**: サーバ API / ドメイン値 / `TaskRepository` インターフェイスは無改修.
- **NFR-CONSISTENCY**: today / tomorrow / focus の 3 ビューでカードの構造規約 (アクションは 3 以下 / 並びは「削除 / 期限切替 / 完了」) が揃うこと. focus-view は 2 ボタン (上限 3 を満たす).
- **NFR-010 整合**: 1 カード上の操作肢が 3 以下に収まる. 6 → 3 (または 2) への削減で「次の 1 つに集中する」UX を強化する.
- **NFR-011 整合**: 強調セクション (今は today-view 内に残る. BL-037 / focus-view が正本) のボタン数削減でも 3 以下を保つ.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: today カードのアクションが 3 ボタンに削減されている
  Given /today を開いた
   かつ origin が "routine" でない通常タスクが 1 件以上表示されている
  When  各タスクカード (li 要素) を観察する
  Then  カード内に role="button" の要素は 3 個あり,
        accessibleName がそれぞれ「削除」「明日にする」「完了」を含む
   かつ 「編集」「現在に設定」「現在解除」「明日へ」「今日へ」のいずれのアクセシブルネームを持つ button もカード内に存在しない
   かつ `<PriorityStars />` の星 button 群はカード内に存在する (アクションの 3 個には含めずカウント)
```

```
シナリオ AC-2: today の強調セクション (現在のタスク) も 3 ボタンに削減されている
  Given /today を開いた
   かつ currentTaskId が指す origin="manual" のタスクが存在する
  When  aria-label="現在のタスク" の section を観察する
  Then  section 内のアクション button は「削除」「明日にする」「完了」の 3 個のみ
   かつ 「編集」「現在解除」「現在に設定」のいずれの button も存在しない
```

```
シナリオ AC-3: tomorrow カードに「完了」が追加され 3 ボタンになっている
  Given /tomorrow を開いた
   かつ origin="manual" のタスクが 1 件以上表示されている
  When  各タスクカード (li 要素) を観察する
  Then  カード内のアクション button は「削除」「今日にする」「完了」の 3 個
   かつ 「明日にする」「編集」「現在に設定」のいずれの button も存在しない
```

```
シナリオ AC-4: today の「完了」クリックで complete API が呼ばれカウンタが +1 される
  Given /today を開いた
   かつ origin="manual" のタスク A が表示されている (version=1)
  When  カード A 内の「完了」ボタンをクリックする
  Then  TaskRepository.complete が { id: A.id, ifMatch: 1 } で 1 回呼ばれる
   かつ 再フェッチ後の /today に A は表示されない
   かつ 「今日の完了: N」表示の N が +1 される (BL-008 と整合)
```

```
シナリオ AC-5: today の「明日にする」クリックで期限切替 API が呼ばれる
  Given /today を開いた
   かつ origin="manual" のタスク A が表示されている (dueDate="today", version=1)
  When  カード A 内の「明日にする」ボタンをクリックする
  Then  TaskRepository.update が { id: A.id, ifMatch: 1, patch: { dueDate: "tomorrow" } } で 1 回呼ばれる
   かつ 再フェッチ後の /today に A は表示されない
```

```
シナリオ AC-6: tomorrow の「完了」クリックで complete API が呼ばれ today のカウンタが +1 される
  Given /tomorrow を開いた
   かつ origin="manual" のタスク B が表示されている (dueDate="tomorrow", version=1)
  When  カード B 内の「完了」ボタンをクリックする
  Then  TaskRepository.complete が { id: B.id, ifMatch: 1 } で 1 回呼ばれる
   かつ 成功後に ["tomorrow"] / ["today"] / ["focus"] が invalidate される
   かつ /today に切り替えると「今日の完了: N」の N が +1 されている (BL-008 と整合)
```

```
シナリオ AC-7: tomorrow の「削除」「今日にする」は無改修で動く
  Given /tomorrow を開いた
   かつ origin="manual" のタスク B が表示されている (version=1)
  When  カード B 内の「削除」ボタンをクリックする
  Then  TaskRepository.delete が { id: B.id, ifMatch: 1 } で 1 回呼ばれる
  When  別タスク C のカード内の「今日にする」ボタンをクリックする
  Then  TaskRepository.update が { id: C.id, ifMatch, patch: { dueDate: "today" } } で 1 回呼ばれる
```

```
シナリオ AC-8: routine 由来タスクは期限切替ボタンが非表示で 2 ボタンになる
  Given /today を開いた
   かつ origin="routine" のタスク R が表示されている
  When  カード R を観察する
  Then  「明日にする」ボタンは存在しない (BL-017 / FR-033)
   かつ 「削除」「完了」の 2 ボタンが存在する
```

```
シナリオ AC-9: focus-view (BL-037) は本 BL で無改修であることを確認する
  Given /focus を開いた
   かつ 現在のタスクが選択されている
  When  画面を観察する
  Then  アクションは「削除」「完了」の 2 ボタンのまま
   かつ 本 BL の変更で focus-view の挙動が変化しない (回帰テスト)
```

```
シナリオ AC-10: 編集経路の撤去 (代替経路は本 BL で提供しない)
  Given /today を開いた
   かつ タスクが 1 件以上表示されている
  When  画面全体を観察する
  Then  role="button" で accessibleName が「編集」を含む要素は存在しない
   かつ aria-label="タスク編集フォーム" の form は DOM に存在しない
   かつ 名称編集の代替経路 (カードタップでダイアログ起動等) は提供されない (本 BL 範囲外)
```

```
シナリオ AC-11: 「現在に設定」「現在解除」の撤去 (代替経路は BL-043 で別途設計)
  Given /today を開いた
   かつ currentTaskId が指すタスクが存在する
  When  画面全体を観察する
  Then  role="button" で accessibleName が「現在に設定」または「現在解除」を含む要素は存在しない
   かつ 既存の focus 機能 (FR-012 / FR-013) は API レイヤで動き続ける
   かつ サーバ側の自動繰上げ / 完了時の自動解除は無改修で動く
```

```
シナリオ AC-12: アクセシビリティ違反 0 件を維持する (E2E / axe)
  Given /today, /tomorrow, /focus, /projects, /trash, /routines, /settings がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする
  Then  すべての view で violations.length === 0
```

```
シナリオ AC-13: ConflictDialog 経路の無改修 (412 → ダイアログ)
  Given /today で 2 タブ同時編集により version が古くなったタスク A がある
  When  カード A 内の「完了」を押す (online)
  Then  repository.complete が OptimisticLockError を throw する
   かつ ConflictDialog が開く (BL-031 と互換)
  When  /tomorrow でも同様に B の「完了」を押す
  Then  TomorrowView 側でも ConflictDialog が開く
```

## 未決事項 / 確認待ち

- **U-1 (「明日にする」ラベルの routine 由来タスクへの扱い)**
  - origin="routine" のタスクでは BL-017 / FR-033 により期限切替ができない. 本 BL では既存挙動を踏襲し「明日にする」を非表示にする. ボタンを disabled で表示する案もあるが UI を狭く保つため非表示を採用. 異論があれば plan で再検討.

- **U-2 (「完了」ボタンを tomorrow 側に追加する仕様の整合性)**
  - tomorrow タスクを「完了」させると `POST /api/v1/tasks/:id/complete` で trashedReason="completed" + counter +1 が走る. これは「今日完了したわけではないがカウンタが +1 される」ことを意味する.
  - 既存仕様 (BL-003 / BL-008): カウンタは「今日完了したタスク数」を表す.
  - 解釈: tomorrow タスクの完了をユーザーが意図的に実行した時点で「今日の操作」とみなしカウンタ +1 で良い. project.md / FR-040 と矛盾しない. plan で確定.

- **U-3 (削除する handler のうち `setFocusMutation` を残すか消すか)**
  - 本 BL では「button が無くなる = handler は dead code」となる. `setFocusMutation` は BL-043 で別経路 (長押し等) から再導入される見込みのため, 残しておくと将来再利用しやすい.
  - 一方, 未使用のコードを残すと auditor がリンタ警告 (`no-unused-vars`) を出す. plan で **削除して BL-043 で再導入** とする方針を第一候補に置く.

- **U-4 (編集経路の代替 UI の BL 起票)**
  - 本 BL では編集経路を削除するのみで, 代替 UI (カードタップ → ダイアログ等) は提供しない. これは「当面 UI から名称変更ができない」状態を作るため, ユーザー受け入れ判断が必要.
  - 想定: 本 BL の plan / tasks 確定時点で backlog に「タスク編集ダイアログの再導入」 BL を新規起票する (BL-048 等). 本 BL のスコープには含めない.
  - **BL-070 (inline-edit-all-cards) で逆転**: U-4 の想定 (= 別 BL で代替ダイアログ起動) は採用されず, BL-070 で「TaskCard の name input 常時表示 + blur PATCH」に変更された. 「カードタップ → ダイアログ起動」案は不採用 (= 軽量な inline 編集を選択).

- **U-5 (E2E `e2e/tasks.spec.ts` の編集テスト扱い)**
  - 既存 E2E `タスクを編集すると名前が一覧に反映される` は本 BL で編集 button が消えるため fail する. 候補: (a) test.skip + コメントで BL 連番付与 / (b) 削除.
  - plan では **(a) skip + 後続 BL 連番コメント** を採用する案を第一候補に. 編集機能の再導入 BL で skip 解除 + 新 UI に追随できるようにする.

- **U-6 (today-view 内の旧「強調セクション」の維持判断)**
  - foundation / focus-view (BL-037) の正本は `/focus` だが, 現状 today-view にも `<section aria-label="現在のタスク">` の強調表示が残っている (FR-012 / NFR-011 の暫定実装).
  - 本 BL は **強調セクションの構造自体は触らず, ボタンだけ 3 個に削減する**. 強調セクションの除去は別 BL (今日ビューと focus-view の責務統合 / 「foundation REQ-2」の today 単一責務化) に委ねる.

- **U-7 (BL-040 で残る `handleSetPriority` の扱い)**
  - `PriorityStars` から呼ばれる `handleSetPriority` は引き続き使用される. 本 BL では無改修.
