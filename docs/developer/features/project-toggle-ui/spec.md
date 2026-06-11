# 仕様: プロジェクト選択をトグル UI に変更 (起票フォーム) (project-toggle-ui)

> ## 撤去済 (BL-065)
>
> 本仕様の実装 (起票カードのプロジェクト選択 ProjectToggle) は BL-065 (project-toggle-removal) で撤去され, `<select>` に戻されました. 詳細は `docs/developer/features/project-toggle-removal/spec.md` を参照.

- 状態: ドラフト
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-041
  - 上位要件: FR-020 (プロジェクト管理)
  - 関連 NFR: NFR-010 (最小手数の起票)
  - 関連 feature:
    - [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) REQ-4 (起票フォームの入力 4 要素) / §「モックアップ下段」
    - [`../priority-star-ui/spec.md`](../priority-star-ui/spec.md) (BL-040 で完成. 同じ「共通コンポーネント + today/tomorrow 双方の起票フォーム置換」パターン)
    - [`../inline-create-form/spec.md`](../inline-create-form/spec.md) (BL-039 で期限セレクト削除済. プロジェクトはまだ `<select>`)
    - [`../project-crud/spec.md`](../project-crud/spec.md) (BL-016 で完成. `Project` 型 / `ProjectRepository` はそのまま使う)

## 背景 / 課題

現状, 起票フォームのプロジェクト選択は `<select id="task-project">` (`today-view.tsx` / `tomorrow-view.tsx` の両方) で実装されている. 構造は次のとおり.

```tsx
<label htmlFor="task-project">プロジェクト (任意)</label>
<select id="task-project" value={projectId} onChange={...}>
  <option value="">（未分類）</option>
  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
</select>
```

todica は「個人利用」を前提とする (project.md). 想定されるプロジェクト数は 1 桁台 (1〜数件) で, 選択肢を全件展開する `<select>` ドロップダウンは視覚的にコストが高い (タップ → ポップアップが開く → 1 件選ぶ → 閉じる, の 3 ジェスチャ).

`local/image.png` のモックアップでは起票フォーム内に「プロジェクト名 (トグルで選択)」と注記された横長の 1 ボタンが置かれており, 1 クリックで `（未分類） → Project1 → Project2 → ... → （未分類）` の順にサイクル切替する UX を採用している. この「1 タップで次の値に進む」方式は次の点で foundation REQ-4 / NFR-010 (最小手数の起票) と整合する.

- ドロップダウンを開く動作が不要 (1 タップで進む).
- 「未分類」も 1 状態として等価に扱う (空白選択ではなく明示的な巡回ポジション).
- プロジェクト数が少ない前提で,「全件を 1 周しても数タップ」で済む.

加えて, BL-040 (priority-star-ui) で確立した「共通コンポーネント `<PriorityStars />` を `web/src/ui/priority-stars/` に新設し, today / tomorrow の両方の起票フォームを同じ部品で置換する」パターンを踏襲し, `<ProjectToggle />` を `web/src/ui/project-toggle/` に新設する.

## ゴール / 非ゴール

### ゴール

- **起票フォームのプロジェクト入力をトグル UI に統一する**:
  - `today-view.tsx` と `tomorrow-view.tsx` の起票フォーム内の `<select id="task-project">` / `<select id="tomorrow-task-project">` を, 共通コンポーネント `<ProjectToggle />` (1 つの横長 `<button>`) に置換する.
- **巡回ロジックの確定**:
  - `null (未分類)` → `projects[0]` → `projects[1]` → ... → `projects[last]` → `null (未分類)` の順に巡回する.
  - `projects` の並び順はサーバ (BL-016 の `ProjectRepository.list()`) が返す順序をそのまま使う.
- **共通コンポーネント `<ProjectToggle />` を `web/src/ui/project-toggle/` に新設する**:
  - props は `value` (現在の `projectId | null`) / `onChange` (次の値を渡す) / `projects` (一覧) / `idPrefix` (id 衝突回避) の 4 つに絞る (BL-040 と同じ流儀).
  - 内部状態は持たない (controlled). 親 (today / tomorrow view) の `useState` がソース.
- **アクセシビリティを満たす**:
  - `<button>` で実装し, キーボード Tab で到達, Enter / Space で巡回が動く.
  - 現在値が `aria-label` (または `aria-live` 領域) で screen reader に伝わる.
  - WCAG 2.1 AA contrast を維持し, BL-029 / BL-038 / BL-040 で導入済みの axe 検査 (5 view) で violations 0 件を維持する.
- **起票後の `projectId` の送信仕様は無変更**:
  - `repository.create()` に渡す `CreateTaskCommand` の `projectId` は引き続き `string | null`. `null` は「未分類」を表す.

### 非ゴール

- **サーバ API / `Project` 型 / `ProjectRepository` の変更**:
  - `GET /api/v1/projects` / `POST /api/v1/tasks` の `projectId` フィールド受理はそのまま使う. ドメイン層は無改修.
- **タスクカード上のプロジェクト表示 (副情報) の変更**:
  - 現状 `today-view.tsx` の一覧行と `tomorrow-view.tsx` の一覧行はタスクのプロジェクト名を「副情報」として `<span>` 等で表示している. 本 BL ではこれに触らない (トグル UI は「起票フォーム専用」).
- **編集フォームのプロジェクト UI**:
  - 既存実装 (`today-view.tsx` の `aria-label="タスク編集フォーム"`) は名称入力のみで, プロジェクト UI を持っていない (BL-001 / BL-018 以降の編集フォームは「名称」のみ). 本 BL では編集フォームを触らない. 編集フォームへのプロジェクト変更経路追加は本 BL のスコープ外 (後続 BL に委ねる).
- **focus-view への影響**:
  - `/focus` には起票フォームを置かない (BL-037 / Done) ため, 本 BL は無関係.
- **プロジェクト追加導線 (BL-044) との統合**:
  - 「+プロジェクトの追加」ボタンで新規プロジェクトを作成しトグル UI に即時反映する仕様は BL-044 の責務. 本 BL は「既存の `projects` 配列をトグル UI で切替表示できる」ところまで.
- **プロジェクト並び替え UI**:
  - サーバ側の並び順 (BL-016) をそのまま使う. UI 側で再ソートしない.
- **トグル UI における逆巡回 (Shift+Enter で前へ等)**:
  - 初版では「順方向の巡回のみ」とする. 逆巡回は未決事項 U-1.
- **デザイントークン化**:
  - BL-046 の責務. 本 BL ではコンポーネントローカルの CSS で WCAG AA を満たす.

## 要件

### 機能要件

- **REQ-1 (起票フォームのプロジェクト入力 = トグルボタン 1 個)**
  起票フォーム (today-view / tomorrow-view) のプロジェクト入力は `<select>` を使わず, 横長の `<button type="button">` 1 個で実装する. ボタン表面には「現在選ばれているプロジェクト名」(または「（未分類）」) を表示する. クリック / タップ / キーボード Enter or Space で「次の選択肢」に進む.

- **REQ-2 (巡回順序の固定)**
  巡回順は次のとおり固定する.
  ```
  null (未分類) → projects[0] → projects[1] → ... → projects[last] → null (未分類) → ...
  ```
  - `projects` 配列が空 (= プロジェクトが 1 件も登録されていない) のとき, トグルは常に「（未分類）」を表示し, クリックしても値は変わらない (no-op).
  - `projects` の並び順は `ProjectRepository.list()` (BL-016) が返した順序をそのまま使う. UI 側で再ソートしない.
  - 巡回は単方向 (順方向のみ, 初版). 逆巡回・直接ジャンプは未決 (U-1 / U-2).

- **REQ-3 (表示文言)**
  - 現在値が `null` のとき: ボタンに「（未分類）」と表示する.
  - 現在値が `projects[i]` のとき: ボタンに `projects[i].name` を表示する.
  - 補助テキスト「（トグルで選択）」「↑タップで選択」等のヒントを併記してよい. 配置はモックに合わせ「ボタンの上にラベル」を採用する (`<label>` 相当か, `aria-describedby` で結ぶ補助テキスト). 詳細は plan で確定.

- **REQ-4 (アクセシビリティ)**
  - ボタンには `<button type="button">` を使う (form の暗黙 submit を防ぐ).
  - `aria-label` には「プロジェクト: 現在 ＜name＞」相当を含め, 現在値を screen reader が読み上げられるようにする (例: `aria-label="プロジェクト: 現在 仕事 (タップで次へ)"`).
  - キーボード操作: Tab でフォーカス到達, Enter / Space で 1 タップ相当 (次の値に進む).
  - 値変化を screen reader に通知するため, 内部に `<span aria-live="polite">` を持つか, ボタン本文 (`aria-label` 含む) の再生が変化として検知されるようにする (詳細は plan).
  - フォーカスリングは OS 既定 (outline) を消さない.

- **REQ-5 (WCAG 2.1 AA contrast の維持)**
  ボタンのテキスト色 / 背景色 / 枠線のコントラストは WCAG 2.1 AA (テキスト 4.5:1 / 非テキスト 3:1) を満たす. BL-029 / BL-038 / BL-040 で導入済みの axe 検査 (今日 / 明日 / ゴミ箱 / ルーティン / 設定の 5 view) で violations 0 件を維持する.

- **REQ-6 (起票時の projectId の正しい送信)**
  「追加」ボタンを押した時点でトグルが指している値が, `repository.create()` の `CreateTaskCommand.projectId` にそのまま渡る.
  - トグルが `null` を指していれば `projectId: null` を送る.
  - トグルが `projects[i]` を指していれば `projectId: projects[i].id` を送る.
  - 起票成功後, トグルは「（未分類）」の初期状態にリセットする (既存 `setProjectId("")` 相当のリセット挙動と互換).
  - サーバ側 (BL-001 / BL-016) は無改修で動く. POST `/api/v1/tasks` の body 形式は変えない.

### 非機能要件

- **NFR-A11Y**: axe による WCAG 2.1 AA 違反 0 件 (BL-029 で導入済みの `e2e/a11y.spec.ts` の 5 view 全てで violations === 0). 起票フォームの DOM 変更によって violations が増えないこと.
- **NFR-PERF**: トグルの再レンダリングは「自インスタンスの value 変化」または「親の再レンダ」に限定する (`React.memo` は任意, 過剰最適化は不要).
- **NFR-COMPAT**: ドメイン値 (`projectId: string | null`) と HTTP API は無改修で動くこと. e2e で「トグル巡回 → 追加 → サーバに正しい projectId が送られる」を確認できれば良い.
- **NFR-010 整合**:
  - 起票フォームの入力数は依然「タスク名 / プロジェクト / 優先度 / 追加」の 4 要素 (foundation REQ-4 / BL-039 と並列).
  - プロジェクト未指定 (`null`) はトグルの初期状態 = 既定値となる.
- **NFR-CONSISTENCY**: today-view / tomorrow-view の両方で同じ `<ProjectToggle />` を使い, 挙動・見た目・a11y を統一する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: 起票フォームにプロジェクトトグルボタンが表示される (today)
  Given /today を開いた
   かつ プロジェクトが 0 件登録されている
  When  ページが描画される
  Then  起票フォーム内に role="button" の 1 個の要素が「プロジェクト用トグル」として存在する
   かつ ボタンの表面 (textContent) に「（未分類）」が含まれる
   かつ ボタンの aria-label に現在の値「未分類」相当が含まれる
   かつ <select id="task-project"> は DOM に存在しない
```

```
シナリオ AC-2: トグルをクリックすると次のプロジェクトに進む (today)
  Given /today を開いた
   かつ プロジェクト「仕事」「個人」がこの順で登録されている
   かつ 起票フォームのプロジェクトトグルは初期状態で「（未分類）」を表示している
  When  プロジェクトトグルを 1 回クリックする
  Then  ボタン textContent が「仕事」に変わる
   かつ aria-label に「仕事」が含まれる
  When  さらに 1 回クリックする
  Then  ボタン textContent が「個人」に変わる
  When  さらに 1 回クリックする
  Then  ボタン textContent が「（未分類）」に戻る (1 周した)
```

```
シナリオ AC-3: トグル巡回後に「追加」を押すと create.projectId が現在値で送信される (today)
  Given /today を開いた
   かつ プロジェクト「仕事」(id: "p-1") が登録されている
   かつ タスク名に「プロジェクトトグルテスト」を入力した
  When  プロジェクトトグルを 1 回クリックし「仕事」を選んだ状態にする
   かつ 「追加」ボタンを押す
  Then  TaskRepository.create が projectId="p-1" を含む引数で呼ばれる
   かつ 起票後, トグル表示は「（未分類）」に戻る
```

```
シナリオ AC-4: 「（未分類）」のままで起票すると create.projectId が null になる (today)
  Given /today を開いた
   かつ プロジェクトが 1 件以上登録されている
   かつ タスク名に「未分類テスト」を入力した
  When  プロジェクトトグルをクリックせず「（未分類）」のまま「追加」ボタンを押す
  Then  TaskRepository.create が projectId=null を含む引数で呼ばれる
```

```
シナリオ AC-5: 明日ビューでも同じトグル UI が表示され巡回・送信される (tomorrow)
  Given /tomorrow を開いた
   かつ プロジェクト「仕事」(id: "p-1") が登録されている
  When  プロジェクトトグルを 1 回クリックする
   かつ タスク名に「明日のタスク」を入力し「追加」ボタンを押す
  Then  TaskRepository.create が projectId="p-1", dueDate="tomorrow" を含む引数で呼ばれる
   かつ <select id="tomorrow-task-project"> は DOM に存在しない
```

```
シナリオ AC-6: プロジェクト 0 件のときトグルを押しても値は変わらない
  Given /today を開いた
   かつ プロジェクトが 0 件登録されている
  When  プロジェクトトグルを 1 回クリックする
  Then  ボタン textContent は「（未分類）」のままである
   かつ TaskRepository.create は呼ばれない (タスク名未入力なら起票自体不可)
```

```
シナリオ AC-7: キーボード操作でも巡回できる
  Given /today を開いた
   かつ プロジェクト「仕事」「個人」が登録されている
  When  Tab でプロジェクトトグルにフォーカスを合わせる
   かつ Space キーを 1 回押す
  Then  ボタンの aria-label に「仕事」が含まれる
  When  Enter キーをさらに 1 回押す
  Then  ボタンの aria-label に「個人」が含まれる
```

```
シナリオ AC-8: タスクカード上のプロジェクト副情報表示は無傷
  Given /today に projectId="p-1" のタスクが表示されている
   かつ プロジェクト "p-1" の名前が「仕事」である
  When  タスクカードを観察する
  Then  カード上のプロジェクト名表示 (副情報) は「仕事」のまま残っている
   かつ カード上にトグル UI は存在しない
   ※ 本 BL ではタスクカードのプロジェクト表示を触らない (非ゴール).
```

```
シナリオ AC-9: アクセシビリティ違反 0 件を維持する (E2E / axe)
  Given /today と /tomorrow がレンダリングされている
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする
  Then  violations.length === 0 (BL-029 / BL-038 / BL-040 と同条件)
```

```
シナリオ AC-10: 起票後にプロジェクトトグルが初期状態 (未分類) にリセットされる
  Given /today を開いた
   かつ プロジェクト「仕事」を選び, タスク名「リセット確認」で「追加」ボタンを押した
  When  起票完了直後にトグルを観察する
  Then  トグル表示は「（未分類）」に戻っている
   かつ 次の起票でクリックを 1 回すると「仕事」に進む (= 状態がリセットされた巡回が再開する)
```

## 未決事項 / 確認待ち

- **U-1 (逆巡回 / Shift+Enter 等の対応)**
  初版は順方向のみ. プロジェクト数が増えた場合に「Shift+Enter で前へ」「副ボタンで戻る」等の対応をするかは未決. 個人利用 (project.md) で 1 桁プロジェクトの前提なら順方向のみで十分という想定. 必要なら別 BL で拡張する.

- **U-2 (プロジェクト数が多い場合の UX)**
  ui-redesign-foundation §「未決事項 U-007」と整合させる. 初版では「順方向巡回のみ + 全件を 1 周できる」までを満たす. 「もっと見る」「フィルタ」「直接ジャンプ」等は別 BL.

- **U-3 (補助テキストの位置と書式)**
  モックの「プロジェクト名 (トグルで選択)」をどう実装するか. 案 A: `<label>` 相当で `<span>` 等を上に置く. 案 B: `aria-describedby` で関連付ける. plan で 案 A を第一候補に置く (見える文字 + a11y を両立).

- **U-4 (起票後リセットの是非)**
  AC-10 では「起票後にトグルは未分類に戻る」を要求している. 現状 `<select>` 実装も `setProjectId("")` で同じくリセットしているので互換. ただし「直前と同じプロジェクトに連続起票したい」UX を選ぶならリセットしない案もある. 現行互換を優先し, 初版は「リセットする」.

- **U-5 (CSS の置き場所)**
  `web/src/ui/project-toggle/project-toggle.css` を新設する案を plan で採る (BL-040 / `priority-stars.css` と同じ流儀). BL-046 のデザイントークン基盤と合流するまでローカル CSS で良い.

- **U-6 (トグルボタンの幅 / 折返し)**
  モックでは「横長」のため幅は親要素いっぱい (`width: 100%` or `flex: 1`) を採る案を plan で第一候補に. プロジェクト名が長い場合は ellipsis (`text-overflow: ellipsis`) で省略する案を仮置き. 詳細は plan で確定.

- **U-7 (プロジェクトリストの変化への追従)**
  起票フォームを開いている間に他タブでプロジェクトが追加 / 削除された場合, トグルの現在値が `projects[]` から消える可能性がある. このとき:
  - 案 A: 次クリックで「（未分類）」に戻す.
  - 案 B: 現在値の id を保持し続けるが表示は「（不明）」とする.
  - **保守側デフォルト案**: A. 削除済みの id はトグル値として無効とし, useEffect で `null` に矯正する. (BL-044 のプロジェクト追加導線と合流する際に再検討する余地は残す.)
