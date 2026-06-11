# 仕様: 起票カードのプロジェクト選択を `<select>` に戻し ProjectToggle を撤去 (project-toggle-removal)

- 状態: ドラフト
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-065
  - 上位要件: FR-020 (プロジェクト管理) / NFR-010 (最小手数の起票)
  - 関連 feature:
    - [`../project-toggle-ui/spec.md`](../project-toggle-ui/spec.md) BL-041: **本 BL の撤去対象**. `<ProjectToggle />` を新設し起票フォームの `<select>` を置換した経緯.
    - [`../task-card-component/spec.md`](../task-card-component/spec.md) BL-059: `<TaskFormCard>` 共通化. プロジェクト入力は当該カードの header 段に置かれている.
    - [`../project-chip/spec.md`](../project-chip/spec.md) BL-056: `.project-chip` クラスは TaskCard 表示側 (`<span className="project-chip">`) で継続利用するため**維持**.
    - [`../task-card-design/spec.md`](../task-card-design/spec.md) BL-063 D-003: `.task-card__header .project-chip { font-size: var(--font-size-small) }` の specificity 強化は TaskCard 表示側のため**維持**.
    - [`../task-crud/spec.md`](../task-crud/spec.md) BL-001: 元の `<select id="task-project">` 実装.

## 背景 / 課題

BL-041 (project-toggle-ui) で, 起票フォームのプロジェクト選択を `<select>` ドロップダウンから, 1 タップで巡回する `<ProjectToggle />` (横長 `<button>`) に置き換えた. その狙いは「ドロップダウンを開く動作が不要」「1 タップで次の値に進む」という最小手数化だった (BL-041 spec §背景).

しかし user 評価の結果, 次の点でトグル UI は実利用にそぐわないと判定された.

- **一覧性が低い**: トグルは「1 件ずつ巡回」する UI のため, プロジェクトが 3 件以上ある場合に「目的のプロジェクトに辿り着くまで何回タップするか」が読めない. ドロップダウンは「全件が一度に見えて, 直接 1 件を選べる」.
- **間違えたときの戻し操作が重い**: 逆巡回が未実装 (BL-041 U-1) のため, 1 つ行き過ぎたら 1 周回り直すしかない.
- **「ドロップダウンの方が一覧から選べて分かりやすい」**という user 判断.

したがって本 BL では, `<ProjectToggle />` を `<select>` に**戻す**. 同時に, 撤去後に使われなくなる `<ProjectToggle />` コンポーネント本体と関連 CSS を削除する. BL-041 で「全件巡回 + 起票時 reset」という挙動の単体テスト・E2E が追加されているため, それらも追従して撤去・書き換える.

なお `<select>` の box サイズ縮小 (デフォルトでは高さが大きく見える件) は BL-066 (task-form-select-compact) の責務であり, 本 BL では style を追加しない (= ブラウザ既定で OK).

## ゴール / 非ゴール

### ゴール

- **起票カードのプロジェクト入力を `<select>` に戻す**:
  - `web/src/ui/task-card/task-form-card.tsx` の `<ProjectToggle ... />` を, visually-hidden な `<label>` + `<select>` + `<option>` 群に置換する.
  - 「（未分類）」状態は `<option value="">プロジェクトなし</option>` に対応させる. `projectId` の internal value は `""` (今日 / 明日 view の useState 初期値と互換).
  - `id` 命名は `${idPrefix}-project` を踏襲 (`idPrefix = "create" | "tomorrow-create"`).
- **`<ProjectToggle />` コンポーネント本体と CSS を撤去する**:
  - `web/src/ui/project-toggle/project-toggle.tsx` / `project-toggle.css` を削除する.
  - `web/src/ui/project-toggle/project-toggle.test.tsx` も削除する.
  - 他ファイルから `ProjectToggle` の import 参照が残らないこと.
- **既存テストを追従修正する**:
  - 関連 10 ファイル (単体 7 / E2E 3) を新仕様 (`<select>` 経由操作) に書き換え, または BL-041 由来の it を撤去する.
- **既存 a11y / 単体 / E2E の green を維持する**:
  - axe 検査 (BL-029) で WCAG 2.1 AA violations 0 件を維持.

### 非ゴール

- **TaskCard 表示側 (`<span className="project-chip">`) の改修**:
  - 一覧上で各タスクのプロジェクト名を chip で表示する仕様 (BL-056) は維持. `.project-chip` クラスおよび BL-063 D-003 (`.task-card__header .project-chip` font-size specificity) は引き続き必要.
- **`<select>` の box サイズ縮小**:
  - BL-066 (task-form-select-compact) の責務. 本 BL では style 追加なし (= ブラウザ既定スタイルで OK).
- **編集フォームのプロジェクト UI**:
  - 編集フォームは「名称のみ」(BL-041 spec §非ゴール参照). 本 BL でも触らない.
- **domain / server / API**:
  - `CreateTaskCommand.projectId: string | null` は無改修. `<select>` の "" は親側で従来通り null 変換して送信する (`projectId === "" ? null : projectId` 相当. 既存 view と同じ).
- **プロジェクト並び替え / 追加導線**:
  - サーバ並び順を踏襲. 「+プロジェクトの追加」導線 (BL-044) には触らない.
- **逆巡回 / 直接ジャンプ** (BL-041 U-1 / U-2):
  - `<select>` に戻すため不要 (一覧から直接選べる).

## 要件

### 機能要件

- **REQ-1 (起票カードのプロジェクト入力 = `<select>` 1 個)**
  `<TaskFormCard>` の header 段において, プロジェクト入力は単一の `<select>` で実装する. `<button>` (ProjectToggle) は使わない.
  - DOM 構造は次のとおり.
    ```tsx
    <label htmlFor={`${idPrefix}-project`} className="visually-hidden">プロジェクト</label>
    <select id={`${idPrefix}-project`} value={projectId} onChange={(e) => onProjectIdChange(e.target.value)}>
      <option value="">プロジェクトなし</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    ```
  - `idPrefix` は `"create" | "tomorrow-create"` を踏襲する (BL-059 TaskFormCard と同じ).
  - `label` は visually-hidden (画面上は非表示, screen reader には読み上げ可) で配置する.

- **REQ-2 (option 群の中身)**
  - 先頭に `<option value="">プロジェクトなし</option>` を 1 件置く. ラベル文言は「プロジェクトなし」(D-001 で確定).
  - 続いて `projects` 配列の各要素を `<option key={p.id} value={p.id}>{p.name}</option>` として展開する.
  - 並び順は `ProjectRepository.list()` (BL-016) が返す順序をそのまま使う. UI 側で再ソートしない.

- **REQ-3 (値の双方向)**
  - `value={projectId}`. 親 (today / tomorrow view) の useState (`projectId: string`, 初期値 `""`) をそのまま渡す.
  - `onChange={(e) => onProjectIdChange(e.target.value)}`. 親が受け取る値は `string` (`""` を含む).
  - 親側の null 変換 (`projectId === "" ? null : projectId`) は **無改修**. `CreateTaskCommand.projectId: string | null` の送信仕様は変えない.

- **REQ-4 (アクセシビリティ)**
  - `<label htmlFor={`${idPrefix}-project`} className="visually-hidden">プロジェクト</label>` と `<select id={`${idPrefix}-project`}>` を関連付ける.
  - screen reader は label テキスト「プロジェクト」と現在選択中の option テキストを読み上げる (HTML 標準挙動).
  - キーボード: Tab で `<select>` にフォーカス到達, Space / 矢印キーで option 選択 (HTML 標準挙動).
  - axe 検査 (`e2e/a11y.spec.ts`, 5 view) で violations 0 件を維持する.

- **REQ-5 (`<ProjectToggle />` の撤去)**
  - `web/src/ui/project-toggle/` ディレクトリを丸ごと削除する (`.tsx` / `.css` / `.test.tsx`).
  - `task-form-card.tsx` から `import { ProjectToggle } from "../project-toggle/project-toggle.js"` を削除する.
  - リポジトリ全体で `ProjectToggle` の symbol 参照が 0 件になる (`grep -r "ProjectToggle" web/ e2e/` が空, doc 除く).
  - `web/__tests__/design-tokens.test.ts` の `TARGET_CSS_FILES` から `"ui/project-toggle/project-toggle.css"` を撤去する.

### 非機能要件

- **NFR-A11Y**: axe による WCAG 2.1 AA violations 0 件 (BL-029 / 5 view).
- **NFR-COMPAT**: `CreateTaskCommand.projectId: string | null` の送信仕様は無改修. e2e で「`<select>` で選んだ project が起票時に正しく送られる」を確認できれば良い.
- **NFR-NO-NEW-STYLE**: 本 BL では `<select>` への独自 style を追加しない. ブラウザ既定スタイル (+ 既存の継承プロパティのみ) で動かす. box 縮小は BL-066 に分離.
- **NFR-NO-RESIDUAL**: ProjectToggle の dead code / import が一切残らないこと.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: TaskFormCard が `<select id="create-project">` を描画する (today)
  Given TaskFormCard を idPrefix="create" / projects=[] / projectId="" で描画する
  When  DOM を検査する
  Then  `<select id="create-project">` が存在する
   かつ その直前に `<label for="create-project" class="visually-hidden">プロジェクト</label>` が存在する
   かつ `<button>` (project-toggle) は存在しない
```

```
シナリオ AC-2: `<option>` 群が「プロジェクトなし」と projects 配列を順に含む
  Given projects = [{id:"p-1", name:"仕事"}, {id:"p-2", name:"個人"}] / projectId="" で TaskFormCard を描画する
  When  `<select id="create-project">` の option を列挙する
  Then  1 番目の option の textContent は「プロジェクトなし」/ value は ""
   かつ 2 番目の option の textContent は「仕事」/ value は "p-1"
   かつ 3 番目の option の textContent は「個人」/ value は "p-2"
   かつ option の総数は 3
```

```
シナリオ AC-3: select の onChange が onProjectIdChange に伝播する
  Given projects=[{id:"p-1", name:"仕事"}] / projectId="" / onProjectIdChange=spy で TaskFormCard を描画する
  When  userEvent.selectOptions(select, "p-1") を実行する
  Then  onProjectIdChange が "p-1" で 1 回呼ばれる
  When  userEvent.selectOptions(select, "") を実行する
  Then  onProjectIdChange が "" で 1 回呼ばれる
```

```
シナリオ AC-4: label は visually-hidden で a11y は htmlFor + id で関連付けられている
  Given TaskFormCard を idPrefix="tomorrow-create" で描画する
  When  `<select id="tomorrow-create-project">` を query する
  Then  その accessible name は「プロジェクト」である (label の htmlFor 経由)
   かつ label には class="visually-hidden" が付与されている (画面非表示, screen reader には可)
```

```
シナリオ AC-5: `web/src/ui/project-toggle/` ディレクトリが存在しない
  Given 本 BL 完了後のリポジトリ
  When  `web/src/ui/project-toggle/` を ls する
  Then  ディレクトリが存在しない (`.tsx` / `.css` / `.test.tsx` が全て撤去されている)
```

```
シナリオ AC-6: task-form-card.tsx に ProjectToggle の import / 使用が残らない
  Given 本 BL 完了後の `web/src/ui/task-card/task-form-card.tsx`
  When  ファイル内を `ProjectToggle` で grep する
  Then  ヒット 0 件である
```

```
シナリオ AC-7: 既存単体 / E2E / a11y テスト全件が green
  Given 本 BL 完了後のリポジトリ
  When  `pnpm -w test` および playwright e2e を実行する
  Then  単体テスト全件 green
   かつ a11y.spec.ts violations === 0 (5 view 全て)
   かつ e2e 全件 green
```

```
シナリオ AC-8: design-tokens.test.ts の TARGET_CSS_FILES から project-toggle.css 参照が外れる
  Given 本 BL 完了後の `web/__tests__/design-tokens.test.ts`
  When  TARGET_CSS_FILES 定数の内容を確認する
  Then  "ui/project-toggle/project-toggle.css" が含まれていない
   かつ 残った CSS ファイル群に対するトークン検証は引き続き green
```

```
シナリオ AC-9: today-view / tomorrow-view の起票で projectId が正しく送られる (E2E 相当)
  Given /today を開いた
   かつ プロジェクト「仕事」(id="p-1") が登録されている
  When  プロジェクト `<select>` で「仕事」を選び, タスク名を入力して「追加」を押す
  Then  TaskRepository.create が projectId="p-1" を含む引数で呼ばれる
  When  「プロジェクトなし」を選んで同様に追加する
  Then  TaskRepository.create が projectId=null を含む引数で呼ばれる
```

```
シナリオ AC-10: project-chip CSS は維持され TaskCard 表示側の chip が崩れない
  Given /today に projectId="p-1" のタスクが表示されている
   かつ プロジェクト "p-1" の名前が「仕事」である
  When  タスクカードを観察する
  Then  カード上に `<span class="project-chip">仕事</span>` が引き続き表示される
   かつ font-size が `--font-size-small` で適用される (BL-063 D-003 維持)
```

## 重要な決定 (D 章案)

- **D-001 (`<option value="">` のラベル文言)**:
  「プロジェクトなし」を採用する.
  - 理由: BL-001 (元 `<select>`) では「（未分類）」(全角括弧) を使っていたが, 現状の UI 文言 ("project-toggle-ui" 撤去にあたって user 評価で「素直な日本語」が望まれた) に揃え, 視覚ノイズが少ない「プロジェクトなし」を採る.
  - 既存テストで「（未分類）」を assert している箇所が無いか確認のうえ確定する (TaskCard 表示側 chip では別文言が使われている可能性があるため要確認).

- **D-002 (visually-hidden label のテキスト)**:
  「プロジェクト」を採用する.
  - 理由: BL-041 ProjectToggle の `groupLabel` 既定値と一致. BL-040 PriorityStars の groupLabel「優先度」とも整合する.
  - label class は既存の `.visually-hidden` を踏襲 (BL-059 task-card-component で TaskFormCard が既に使用中).

- **D-003 (`<select>` の id 命名)**:
  ``id={`${idPrefix}-project`}`` を採用する (`idPrefix = "create" | "tomorrow-create"` → `create-project` / `tomorrow-create-project`).
  - 理由: BL-059 TaskFormCard の `idPrefix` 流儀を踏襲. PriorityStars 等の他コンポーネントと衝突しない.
  - BL-001 時代の `id="task-project"` / `id="tomorrow-task-project"` には戻さない (TaskFormCard 共通化後の命名規約に従う).

- **D-004 (`<select>` の styling)**:
  本 BL では `<select>` への独自 style を**追加しない**. ブラウザ既定スタイルのまま.
  - 理由: box 縮小は BL-066 (task-form-select-compact) の責務. 関心を分離する.
  - `.task-card__header` 配下の継承プロパティ (font-family / color 等) のみで動かす.

- **D-005 (BL-041 spec の扱い)**:
  `docs/developer/features/project-toggle-ui/spec.md` および plan/tasks は**そのまま残す** (アーカイブもしない). ただし spec.md 冒頭の状態に「撤去済 (BL-065 で巻き戻し)」を追記する.
  - 理由: 過去の判断・採用理由を歴史として残し, 再評価時に参照可能にする. ファイル削除すると ADR としての価値を失う.
  - 代替案: `docs/developer/features/_archive/` 配下に移動する案もあり得るが, 現状 `_archive` ディレクトリ運用は未整備. 本 BL では「残す + 追記」を第一候補とする.

- **D-006 (テスト方針)**:
  新規 `task-form-card-select.test.tsx` 等は**作らない**. AC-1 〜 AC-4 / AC-6 / AC-10 は既存 `web/__tests__/task-card-component.test.tsx` の追従修正で表現する.
  - 理由: TaskFormCard の単体テストは既に同ファイルに集約されている (BL-059). 別ファイルを作ると視点が分散し, ProjectToggle 関連の it を撤去 → select 関連 it を追加するという「同じ describe 内の追従」が自然.
  - 新規ファイルが必要になるのは AC が 1 ファイルに収まらない規模になったときに限る. 本 BL の AC 数 (10) は既存ファイルで吸収可能.

- **D-007 (追従修正対象テストファイルの網羅範囲)**:
  spec/plan で挙げる追従対象は次の 10 ファイル. 過不足なきこと.
  - 単体 (7): `web/__tests__/project-chip.test.tsx`, `task-card-component.test.tsx`, `task-card-hotfix.test.tsx`, `task-form-grid-layout.test.tsx`, `today-view.test.tsx`, `tomorrow-view.test.tsx`, `design-tokens.test.ts`.
  - E2E (3): `e2e/project-toggle.spec.ts` (削除), `e2e/projects.spec.ts`, `e2e/remove-inline-project-create.spec.ts`.
  - 削除対象 (1): `web/src/ui/project-toggle/project-toggle.test.tsx` (本体撤去と同時).
  - 実装時に上記以外で ProjectToggle / project-toggle を参照しているファイルが発見された場合は plan を更新して追加する.

## 未決事項 / 確認待ち

- **U-1 (`<option value="">` ラベル文言の最終確定)**
  D-001 で「プロジェクトなし」を提案したが, BL-001 の元実装が「（未分類）」だった点・現行 TaskCard 表示側 chip での未分類表現と整合を取るか. 実装着手前に user に確認する.

- **U-2 (BL-041 spec の処遇)**
  D-005 で「残す + 追記」を提案. `_archive/` 運用方針が決まれば移動を選ぶ余地あり. 確認待ち.

- **U-3 (a11y label 文言の最終確定)**
  D-002 で「プロジェクト」を提案. 「プロジェクト (任意)」(BL-001 当時の文言) に戻すかは UI 文言整合の観点で確認の余地あり. 第一候補は「プロジェクト」.

- **U-4 (`<select>` の visually-hidden label を残すかネイティブ label に戻すか)**
  本 BL では `.visually-hidden` で揃える (header 段の縦方向リズムを崩さないため). 「ラベルを画面上に出す」案 (BL-001 元の `<label>プロジェクト (任意)</label>` 形式) は box 含めて BL-066 や別 BL で再評価.

- **U-5 (追従テストの撤去 vs 書き換えの境界)**
  「ProjectToggle 固有の挙動 (巡回 / aria-label)」を assert している it は撤去, 「プロジェクト選択ができる」「起票時 projectId が正しい」を assert している it は `<select>` 操作に**書き換え**, とする方針. 個別 it の単位で実装者の判断が割れた場合は test-designer に相談する.
