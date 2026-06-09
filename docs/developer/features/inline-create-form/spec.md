# 仕様: 起票フォームから期限セレクトを削除 (ビュー文脈で dueDate 決定)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-039
- 前提 feature:
  - [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) REQ-4 (起票フォームの入力 4 要素 / 期限セレクトは置かない) / NFR-010 (最小手数の起票)
  - [`../tomorrow-view/spec.md`](../tomorrow-view/spec.md) REQ-2 (明日ビューの起票は dueDate=tomorrow 固定. BL-038 で完了済み)
  - [`../focus-view/spec.md`](../focus-view/spec.md) (focus-view には起票フォームを置かない. BL-037 で完了済み)
- 関連 BL:
  - **BL-001** (task-crud): `POST /api/v1/tasks` の `dueDate` フィールド受理はそのまま使う. サーバ API は触らない.
  - **BL-005** (today-view): 今日ビューの起票・編集・期限切替・削除フローの一部 (起票フォーム) を変更する.
  - **BL-007** (今日 → 明日 への期限切替): タスクカード上の「明日へ」ボタンはそのまま維持する. 起票後の dueDate 変更経路として残す.
  - **BL-017** (routine): routine 由来タスク (`origin="routine"`) の「明日へ」非表示ルールはそのまま維持.
  - **BL-037** (focus-view): focus-view に起票フォームを置かない方針は本 BL でも踏襲.
  - **BL-038** (tomorrow-view): 明日ビューでは既に期限 UI が無く dueDate=tomorrow 固定. 本 BL では触らない.
- 由来要件: FR-005 (タスクの期限を today ↔ tomorrow で切り替えられる)
- 関連 NFR: NFR-010 (最小手数の起票) / NFR-001 (単一ワークフロー強制)

## 背景 / 課題

`ui-redesign-foundation` の REQ-4 で **起票フォームの入力は 4 要素 (プロジェクト / タスク名 / 優先度 / 「追加」ボタン) に固定し, 期限セレクトは置かない (ビュー文脈で dueDate が決まる)** ことが確定している. しかし現在の `web/src/ui/today-view/today-view.tsx` の起票フォームは以下 5 要素を持っており foundation REQ-4 と矛盾している.

1. タスク名 (`<input>`)
2. プロジェクト (`<select>`)
3. **期限 (`<select>` で today / tomorrow を選ばせる)** ← 余計
4. 優先度 (`<select>`)
5. 「追加」ボタン

`local/image.png` のモックアップでも起票フォームには「期限」UI が無く, ユーザーが今日ビューを開いているならば「今日のタスクを起票している」, 明日ビューを開いているならば「明日のタスクを起票している」のはビュー文脈から自明であり, **起票時に期限を毎回選ばせるのは NFR-010「最小手数の起票」に反する**.

既に隣接 BL の対応状況は以下のとおり.

- **focus-view (BL-037 / Done)**: 起票フォーム自体を置かない. dueDate を選ばせる UI 無し.
- **tomorrow-view (BL-038 / Done)**: 起票フォームに期限 UI 無し. `dueDate="tomorrow"` を内部で強制. 起票後の「今日にする」ボタンで FR-005 (期限変更) を満たす.
- **today-view (本 BL の対象)**: 起票フォームに期限 `<select>` が残っている.

本 BL は **今日ビューの起票フォームから期限 `<select>` を削除し, 起票時に `dueDate="today"` を強制する** ことで, 3 ビュー横断で「起票時は期限を選ばない / ビュー文脈で dueDate が決まる」という foundation REQ-4 の規約を成立させる. 起票後の期限変更経路 (FR-005) はタスクカード上の「明日へ」ボタン (BL-007 / Done) で引き続き提供する.

## ゴール / 非ゴール

### ゴール

- **今日ビューの起票フォームから期限 `<select>` を削除する**:
  - `web/src/ui/today-view/today-view.tsx` の起票フォーム内 `<label htmlFor="task-due-date">期限</label>` と対応する `<select>` 要素を取り除く.
  - 関連する `dueDate` state (`const [dueDate, setDueDate] = useState<DueDate>("today")`) を削除する.
- **起票時 `dueDate="today"` を `repository.create` に強制する**:
  - `handleCreate` の `CreateTaskCommand` 構築時に `dueDate: "today"` をハードコード値として渡す.
  - サーバ API への POST body にも `"dueDate": "today"` が含まれる (BL-001 の API スキーマ互換).
- **foundation REQ-4 の 4 要素規約と一致**:
  - 今日ビューの起票フォームの入力要素が「タスク名」「プロジェクト」「優先度」「追加ボタン」の 4 つのみとなり, REQ-4 (および tomorrow-view spec の同等規約) と並列になる.
- **既存テストの最小限の修正**:
  - `web/__tests__/today-view.test.tsx` 内で起票フォームに `getByLabelText(/期限/)` を参照しているケース (具体的には「起票フォームはタスク名のみ必須である」シナリオの 318-319 行付近) を, 「起票フォームに期限 UI が存在しない」ことを検証する向きへ反転する. 起票フォーム外の期限切替 (タスクカード上の「明日へ」ボタン) を扱うテストは変更しない.

### 非ゴール

- **サーバ API の `dueDate` フィールド削除はしない**. タスクは引き続き `dueDate: "today" | "tomorrow"` を保持する. `POST /api/v1/tasks` の body スキーマ / `Task` 型 / DB スキーマは無改修.
- **起票後の dueDate 変更経路を廃止しない**. タスクカード上の「明日へ」ボタン (BL-007 / Done) を引き続き表示する. FR-005 (期限変更) の機能は本 BL では損なわれない.
- **編集フォーム (`タスク編集フォーム`) の構造は触らない**. 編集フォームには元々「期限」項目は無いが, 念のため本 BL のスコープから除外する. 編集フォーム側 UI の見直しは後続 BL (BL-042 など) の責務.
- **focus-view / tomorrow-view は触らない** (BL-037 / BL-038 で完了済み. 本 BL は今日ビュー単独).
- **タスクカード上の「明日へ」ボタンは触らない** (BL-007 / Done). 本 BL では起票フォームのみを対象とする.
- **ルーティン由来タスク (`origin="routine"`) の扱いは触らない** (BL-017 の non-routine 限定の「明日へ」表示ルールはそのまま).
- **プロジェクト追加導線 / 優先度 UI の星化 / 「現在に設定」UI の刷新は本 BL のスコープ外** (BL-040 / BL-041 / BL-043 / BL-044 の責務).
- **デザイントークン化** (BL-046 の責務). 本 BL ではスタイルを変更しない.
- **完了数カウンタの再配置** (BL-047 の責務). 触らない.
- **オフライン書込キューの変更**. 既存の `offline-queue.ts` 経路と payload 構造を維持する (`dueDate` を含む POST body 形式は不変).

## 要件

### 機能要件

- **REQ-1 今日ビューの起票フォーム入力要素は 4 つのみ**
  - `aria-label="タスク起票フォーム"` の `<form>` 内に置く入力要素は以下 4 つのみとする:
    1. タスク名 (`<label htmlFor="task-name">タスク名</label>` + `<input>`. 必須)
    2. プロジェクト (`<label htmlFor="task-project">プロジェクト (任意)</label>` + `<select>`. 任意)
    3. 優先度 (`<label htmlFor="task-priority">優先度</label>` + `<select>`. 任意)
    4. 「追加」ボタン (`<button type="submit">追加</button>`)
  - **期限 (`<label htmlFor="task-due-date">期限</label>` + 対応 `<select>`) は存在してはならない**.
  - foundation REQ-4 と tomorrow-view の起票フォーム構造と並列になる.

- **REQ-2 起票時の dueDate は "today" 固定**
  - `handleCreate` 内で `repository.create()` に渡す `CreateTaskCommand` の `dueDate` フィールドは常に `"today"` とする.
  - ユーザー操作によって `dueDate` を変える経路は起票時点には存在しない (起票後はカード上「明日へ」ボタンで変更可能).
  - サーバへの POST body にも `"dueDate": "today"` を明示送信する (BL-001 / `CreateTaskCommand` 互換維持のため).
  - オフラインキュー (`offline-queue.ts`) に積む payload にも `dueDate: "today"` が含まれる.

- **REQ-3 起票後の dueDate 変更経路は引き続き提供する**
  - タスクカード上の「明日へ」ボタン (BL-007 / Done) は本 BL では削除しない.
  - `origin !== "routine"` のタスクには引き続き「明日へ」ボタンが表示される (BL-017 のルール維持).
  - FR-005 (タスクの期限変更) の機能は起票後の経路で満たす.

- **REQ-4 編集フォームの UI は触らない**
  - `aria-label="タスク編集フォーム"` の `<form>` の入力構造は本 BL で変更しない. 編集フォームには元々期限項目が無いため, 削除作業も不要.
  - 編集フォーム側の刷新は後続 BL (BL-042 など) の責務.

- **REQ-5 タスクカード上のアクション (「明日へ」を含む既存 6 ボタン) は本 BL で触らない**
  - タスクカード上の「優先度切替 / 編集 / 明日へ / 完了 / 削除 / 現在に設定」の 6 ボタンは引き続き表示される.
  - これらの削減・刷新は後続 BL (BL-040 / BL-042 / BL-043) の責務.

- **REQ-6 既存テストの最小限の修正**
  - `web/__tests__/today-view.test.tsx` の「シナリオ: 今日ビューの起票フォームはタスク名のみ必須である」内で `screen.queryByLabelText(/期限/)` の存在を期待しているアサーション (現状: `expect(dueDateControl).not.toBeNull()`) を反転し, **「起票フォーム内に期限 UI が存在しない」ことを期待する** 向きへ修正する.
  - 起票フォーム **外** の期限切替テスト (タスクカード上の「明日へ」ボタン操作: 376-395 / 818 行以降 / 1246 行以降 / 1319 行以降など) は変更しない (これらは BL-007 / BL-017 の挙動を検証しており本 BL の対象外).
  - E2E (`e2e/tasks.spec.ts` の「明日へ」ボタン経路, 50-59 行) も変更しない.

### 非機能要件

- **NFR-010 (最小手数の起票) との整合**:
  - 起票フォームの入力数が 5 → 4 に減る. 必須入力は引き続き「タスク名」のみ.
  - 期限の選択操作 (`<select>` を開く → クリックする) が起票フローから消える.
- **NFR-001 (単一ワークフロー強制) との整合**:
  - 「今日ビューで起票したものは今日のタスクになる」「明日ビューで起票したものは明日のタスクになる」というビュー文脈ベースの一本道を成立させる.
  - 起票時にカスタマイズ余地 (期限の選択肢) を増やさない.
- **アクセシビリティ**:
  - 起票フォームから 1 つの label / select が削除されることで axe 検査の violations が増えないこと (BL-029).
  - 残る 4 要素の Tab 移動順序が論理的であること (タスク名 → プロジェクト → 優先度 → 追加ボタン).
- **既存挙動の不変条件**:
  - `repository.create` のシグネチャは変更しない (`CreateTaskCommand` 型は無改修).
  - サーバへの POST body の形式は変えない (`dueDate` フィールドは引き続き含まれる. 値が常に `"today"` になるだけ).
  - オフライン書込キュー (`offline-queue.ts`) の entry スキーマは無改修.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

### 起票フォームの構造 (REQ-1)

```
シナリオ: 今日ビューの起票フォームに「期限」UI が存在しない
  Given /today (または起動直後) を表示している
  When  aria-label="タスク起票フォーム" の form 内の入力要素を列挙する
  Then  「タスク名」「プロジェクト」「優先度」「追加」の 4 要素のみが存在する
  And   form 内に getByLabelText(/期限/) で取得できる label / select / input は存在しない
  And   id="task-due-date" の要素は DOM 上に存在しない
```

```
シナリオ: 編集フォーム側の構造は本 BL で変わらない
  Given /today で既存タスクの「編集」ボタンを押す
  When  aria-label="タスク編集フォーム" の form を観察する
  Then  「名称」入力欄と「保存」「キャンセル」ボタンが存在する (BL-005 / BL-018 と同じ)
  And   起票フォームを隠す既存挙動 (isEditing 時に起票フォーム非表示) も維持される
```

### 起票時の dueDate 強制 (REQ-2)

```
シナリオ: 今日ビューで起票したタスクは dueDate="today" でサーバに渡る
  Given /today を表示している
  And   起票フォームのタスク名に「牛乳を買う」を入力する
  When  「追加」ボタンを押す
  Then  repository.create が { name: "牛乳を買う", dueDate: "today", ... } で 1 回呼ばれる
  And   POST /api/v1/tasks の request body に "dueDate": "today" が含まれる
  And   起票後の今日ビューに「牛乳を買う」が表示される
```

```
シナリオ: 起票フォーム上に dueDate を変更する UI 操作が無い
  Given /today を表示している
  When  起票フォーム内をタブ移動 / クリックして dueDate を "tomorrow" に変える経路を試す
  Then  そのような UI 要素 (label / select / radio / button) は存在しない
  And   起票後のタスクは必ず dueDate="today" で作成される
```

### 起票後の dueDate 変更 (REQ-3)

```
シナリオ: 起票後に「明日へ」ボタンで期限を変更できる (BL-007 / FR-005 の維持)
  Given /today に「明日にやる予定のタスク」を起票した (dueDate="today" で作成された)
  When  タスクカード上の「明日へ」ボタンを押す
  Then  repository.update が { id, ifMatch, patch: { dueDate: "tomorrow" } } で 1 回呼ばれる
  And   再フェッチ後の今日ビューから該当タスクが消える
  ※ 既存 BL-007 / BL-005 の挙動がそのまま成立すること.
```

```
シナリオ: routine 由来タスクには引き続き「明日へ」ボタンが出ない (BL-017 維持)
  Given /today に origin="routine" のタスクが表示されている
  When  そのタスクカード内のボタンを列挙する
  Then  「明日へ」「今日へ」のボタンは存在しない
  ※ BL-017 の挙動が変わらないことを確認する.
```

### 隣接ビューでの既存挙動 (非ゴール担保)

```
シナリオ: 明日ビューで起票したタスクは dueDate="tomorrow" のまま (BL-038 / Done)
  Given /tomorrow を表示している
  When  起票フォームでタスク名を入力し「追加」を押す
  Then  そのタスクは dueDate="tomorrow" で作成される
  ※ tomorrow-view spec REQ-2 で既に green 化されている. 本 BL では新しい変更は無い (既存挙動の保護のために併記).
```

```
シナリオ: フォーカスビューには起票フォームが置かれない (BL-037 / Done)
  Given /focus を表示している
  When  画面内の form 要素を列挙する
  Then  aria-label="タスク起票フォーム" の form は存在しない
  ※ focus-view spec で既に確定. 本 BL では新しい変更は無い (既存挙動の保護のために併記).
```

### 既存テストの保護 (REQ-6)

```
シナリオ: 既存の「起票フォームはタスク名のみ必須である」テストが新しい期待に沿って green になる
  Given web/__tests__/today-view.test.tsx の該当シナリオ (305-326 行付近)
  When  本 BL のテスト修正後にテストを実行する
  Then  「タスク名」と「プロジェクト」入力欄の存在チェックは引き続き成立する
  And   「期限」入力欄の存在チェックは「存在しないこと」を期待するアサーションに置き換わっている
  And   不要入力欄 (ステータス / タグ / 開始日 / サブタスク) の不在チェックは維持される
```

```
シナリオ: 既存の「期限を今日 ↔ 明日 で切り替える操作を提供する」テスト (376-395 行) は無修正で green を維持する
  Given web/__tests__/today-view.test.tsx の該当シナリオ
  When  本 BL の実装後にテストを実行する
  Then  タスクカード上の「明日へ」ボタンクリックで repository.update が 1 回呼ばれる
  And   patch.dueDate === "tomorrow" になる
  ※ 起票フォームの期限 UI を消しても, カード上の期限切替経路は無傷であることを保証する.
```

```
シナリオ: E2E の「明日へ」を押すと今日の一覧から消える (e2e/tasks.spec.ts 50-59 行) は無修正で green を維持する
  Given e2e/tasks.spec.ts の "「明日へ」を押すと今日の一覧から消える" テスト
  When  本 BL の実装後に Playwright で実行する
  Then  起票フォームのタスク名入力 → 追加 → カード上「明日へ」ボタン → 一覧から消える, の経路が成立する
  ※ 起票時に dueDate=today 固定でも, 起票自体は成功し, その後の「明日へ」操作は機能する.
```

## 未決事項 / 確認待ち

- **U-001 `dueDate` state を完全に削除するか, 内部定数として残すか**:
  - 案 A: `const [dueDate, setDueDate] = useState<DueDate>("today")` を完全に削除し, `handleCreate` 内では `dueDate: "today"` のリテラルを直接渡す.
  - 案 B: state は削除するが, module-scope に `const FIXED_DUE_DATE: DueDate = "today"` を定義して参照する.
  - **保守側デフォルト案**: A. state は不要 (ユーザー操作で変わらない) であり, 1 箇所のリテラルで十分. 過剰な定数化は避ける.

- **U-002 既存テストの「起票フォームはタスク名のみ必須である」を修正する vs 新シナリオに置き換える**:
  - 案 A: 既存テスト 305-326 行のうち 318-319 行 (`expect(dueDateControl).not.toBeNull()`) のみを `expect(dueDateControl).toBeNull()` に反転.
  - 案 B: 既存テストはそのまま残し, 新規シナリオ「起票フォームに期限 UI が無い」を追加する.
  - **保守側デフォルト案**: A. 既存テストの責務 (起票フォームの入力要素の網羅性) と新仕様が一致するため. test-designer が red から green に持っていく形が自然.

- **U-003 サーバ POST body に `dueDate` を含めるか省略するか**:
  - サーバ側 `CreateTaskCommand` (BL-001) は `dueDate` フィールドを必須としているか確認する必要がある.
  - **保守側デフォルト案**: 含める (常に `"today"`). 互換性のため明示送信する. サーバ実装で `dueDate` 省略時の既定値が `"today"` であっても, クライアントが省略すべきではない (将来 API 仕様が変わった場合の事故防止).

- **U-004 dueDate 関連の import の整理**:
  - `import type { DueDate, ... } from "@todica/domain/task"` の `DueDate` が `today-view.tsx` 内で他に参照されているか. 起票フォーム削除後も `handleToggleDueDate` 内で `const next: DueDate = ...` として使われているため, import は残す.
  - **保守側デフォルト案**: import 文は変更しない. 残る参照箇所 (`handleToggleDueDate` 等) が使い続ける.

- **U-005 routine 由来タスクの起票への影響**:
  - routine 由来タスクはサーバ側で自動生成されるため起票フォームを経由しない. 本 BL は何の影響も与えない.
  - **保守側デフォルト案**: 影響なし. 受け入れ基準にも明記済み.

- **U-006 オフライン時の payload 互換**:
  - オフラインキュー (`enqueue` で積む entry) の `body: JSON.stringify({ ...cmd })` には引き続き `dueDate: "today"` が含まれる.
  - **保守側デフォルト案**: 既存スキーマと完全互換. キュー内のレコード形式は変えない.

- **U-007 アクセシビリティ検査の維持**:
  - `<label htmlFor="task-due-date">` と対応 `<select>` の削除で axe violations が増えないこと.
  - **保守側デフォルト案**: BL-029 の axe 検査を本 BL 完了時に再実行し violations 0 を確認.
