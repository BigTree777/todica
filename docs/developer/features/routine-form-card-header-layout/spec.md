# 仕様: RoutineFormCard レイアウト刷新 (RoutineCard と同じ 4 段構造に揃える)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-072
- 依存: BL-061 (routine-card-component) / BL-068 (routine-card-edit-fields) / BL-069 (routine-card-edit-priority) / BL-071 (routine-card-header-layout)
- 参照: BL-059 (task-card-component) / BL-063 (task-card-hotfix) / BL-070 (inline-edit-all-cards)

## 背景 / 課題

BL-071 (`routine-card-header-layout` / commit `ff82142` 既に main マージ済み) で
`<RoutineCard>` (表示カード) を **3 段ゾーン構造**
(`.routine-card__header` [name input 左 + PriorityStars 右] /
 `.routine-card__day-checkboxes` / `.routine-card__actions`)
に刷新した. これにより表示カードでは PriorityStars が **カード右上 (header 段の右端)** に並ぶ.

しかし `<RoutineFormCard>` (起票カード) は BL-071 のスコープ閉鎖
(BL-071 REQ-7「起票カードの体裁を壊さない」/ BL-071 D-007「`.routine-card__form-row--name` で
input + 追加 button 横並びを維持」) のため **2 段構造**
(`.routine-card__form-row--name` [name input + 「追加」 button 横並び] /
 `.routine-card__form-row--options` [曜日 7 checkbox + PriorityStars 右])
のまま残された.

結果として:

- 表示カード: PriorityStars が右上 (header 段右)
- 起票カード: PriorityStars が 2 段目右 (= 曜日と並列)

という不一致が残り, user 評価で「起票ルーティンの優先度の位置が変わってないよ」と齟齬が指摘された.

つまり「BL-071 で表示カードのみ統一されたが, 起票カードに視覚言語が伝わっていない」状態.
表示カードと起票カードのデザインを揃えるため, 起票カードも **表示カードと同じイディオム**
(header 段で PriorityStars を右上に固定 / name input にカードタイトル相当のタイポグラフィを当てる)
に組み替える.

## ゴール / 非ゴール

- ゴール:
  - `<RoutineFormCard>` の DOM 構造を **4 段**
    (header / title 相当 / day-checkboxes / actions) に再編する.
  - header 段に PriorityStars を **右端** に配置する (表示カードと同イディオム).
  - name input のフォントサイズを `--font-size-h2` (= 20px) で表示カードと統一する.
    - これは BL-071 D-010 (= 起票カード input フォントサイズも 20px に変わることを受容) を
      DOM 構造側でも明示的に踏襲する.
  - 既存挙動 (onSubmit / controlled input / 曜日 7 checkbox toggle / 優先度変更) を回帰させない.
  - `RoutineFormCardProps` の **public API** (9 prop / name / onNameChange / daysOfWeek /
    onToggleDay / defaultPriority / onDefaultPriorityChange / onSubmit / inputId? /
    formAriaLabel?) を維持する (= 親 view `routines-view.tsx` 呼び出し側を無改修にする).
- 非ゴール:
  - `<RoutineCard>` (表示カード) の DOM・CSS 変更. BL-071 の成果を維持する.
  - `routines-view.tsx` (親 view) のロジック変更. JSX 呼び出し側も無改修.
  - TaskCard / TaskFormCard / ProjectCard / ProjectFormCard への変更.
  - `WebRoutineRepository` / `UpdateRoutineCommand` / `CreateRoutineCommand` /
    domain / server / API への変更.
  - tokens.css (デザイントークン) への変更. 既存値 (`--font-size-h2` / `--space-md` 等)
    をそのまま参照する.
  - 共通 button (BL-067) の導入.
  - shadow / hover / transition / animation の追加
    (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
  - PriorityStars / project-chip / visually-hidden ユーティリティの API・スタイル変更.
  - 起票フォームに「プロジェクト相当の chip」を新設する変更
    (= ルーティンはプロジェクト概念を持たないため対象外).
  - 曜日 7 checkbox 群の見た目変更. 場所 (新構造下から 2 段目 = day-checkboxes 段) の
    指定のみ行い, `.routine-card__day-checkboxes` の CSS は無改修で流用する.
  - 「追加」 submit button のテキスト・ハンドラ・キーボード操作の変更.

## 要件

### 機能要件

- **REQ-1**: `<RoutineFormCard>` の DOM 階層は以下の **4 段** とする.

  ```
  <form
    className="routine-card routine-card--form"
    aria-label={formAriaLabel /* default: "ルーティン作成フォーム" */}
    onSubmit={onSubmit}
  >
    <div className="routine-card__header">
      {/* 左側の埋め物は plan D-001 で確定. 第一候補は「何も置かない (= 空)」.
          PriorityStars が space-between で右端に固定される. */}
      <PriorityStars
        value={defaultPriority}
        onChange={onDefaultPriorityChange}
        groupLabel="優先度"
        idPrefix="routine-create"
      />
    </div>
    <div className="routine-card__title">
      <label htmlFor={inputId /* default: "routine-name" */} className="visually-hidden">
        ルーティン名
      </label>
      <input
        id={inputId}
        type="text"
        className="routine-card__input"
        value={name}
        placeholder="ルーティン名"
        onChange={(e) => onNameChange(e.target.value)}
        required
      />
    </div>
    <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
      <label>...</label> × 7
    </div>
    <div className="routine-card__actions">
      <button type="submit" className="routine-card__submit">追加</button>
    </div>
  </form>
  ```

  - 4 段の順序は header → title 相当 → day-checkboxes → actions で固定する.
  - **title 相当の段の class 名**: 新規 `.routine-card__title` を新設する (= TaskFormCard の
    `.task-card__title` と同じ命名). 表示カード `<RoutineCard>` 側には title 段が無いため
    `.routine-card__title` の新設は表示カードに副作用を与えない.
  - **header 左側の埋め物**: plan D-001 で確定. 第一候補は「何も置かない」.
    PriorityStars が単独で `space-between` 右端に固定される.

- **REQ-2**: `.routine-card__header` セレクタは表示カードと **共用** する (= BL-071 で
  新設済みの宣言ブロックをそのまま起票カードでも使う).
  - 採用根拠は plan D-002 で確定. 第一候補は「共用」(= override しない).
  - 「`.routine-card__header` 内で `space-between` により PriorityStars が右端に固定される」
    という挙動は表示カードと起票カードで同一になる.
  - **BL-073 (routine-card-align-with-form) で関連変更**: BL-073 で表示カード `<RoutineCard>` も同じ 4 段構造に再編されたことで, 起票カードと表示カードの DOM 階層 (header / title / day-checkboxes / actions) と name input の段位置が完全対称になった (= 本 BL のゴール「表示と起票でレイアウト言語を揃える」が表示カード側からも達成された). 同時に `.routine-card__header { justify-content }` は基底で `flex-end` に変更され, 本 BL D-006 で導入した `.routine-card--form .routine-card__header { justify-content: flex-end }` の起票側 override は撤去される. 起票カードへの副作用は無い (= 視覚配置は変わらない / AC-7 / AC-23 維持). 詳細は [`../routine-card-align-with-form/spec.md`](../routine-card-align-with-form/spec.md).

- **REQ-3**: name input が配置される `.routine-card__title` 段の computed font-size は
  `--font-size-h2` (= 20px) と一致する.
  - 実現方法は plan D-003 で確定. 第一候補は「`.routine-card__title { font-size: var(--font-size-h2) }`
    + `.routine-card__input { font: inherit; font-size: var(--font-size-h2) }` の二重宣言」
    (= BL-071 D-002 の jsdom 対応と同じ折衷形を踏襲).
  - 起票カード input フォントサイズが 16px → 20px に変わるのは BL-071 D-010 で既に user 確認済
    (= 表示と起票で統一する方向).

- **REQ-4**: 「追加」 submit button は新規の **独立した actions 段**
  (`.routine-card__actions`) に配置する.
  - これは表示カードの `.routine-card__actions` (削除 button 配置) と同じ段名を共用する.
  - 共用に伴う表示カードへの副作用は無い (= 表示カードの actions には「削除」のみ /
    起票カードの actions には「追加」のみ).
  - button text は「追加」を維持. type は `submit` を維持. className は `routine-card__submit` を維持.

- **REQ-5**: 既存挙動を回帰させない.
  - **onSubmit**: form submit (Enter キー / 「追加」 button click) で `onSubmit(e)` が
    呼ばれる. e は React.FormEvent.
  - **controlled input**: name input の value は `name` prop と同期し,
    変更は `onNameChange(next: string)` で親に伝播する.
  - **曜日 toggle**: 7 個の checkbox の change で `onToggleDay(day: number)` (day = 0〜6) が
    呼ばれる. daysOfWeek 配列に含まれる曜日は `checked={true}` で表示される.
  - **優先度変更**: PriorityStars の click で `onDefaultPriorityChange(next: Priority)` が
    呼ばれる. value prop は `defaultPriority` と同期する.
  - **required**: name input の `required` 属性を維持する (= ブラウザ標準のフォーム検証).

- **REQ-6**: 表示カード `<RoutineCard>` の DOM 構造 (BL-071 の 3 段) には **副作用なし**.
  - `.routine-card__header` セレクタを共用しても表示カードの DOM 内 `.routine-card__header`
    要素 (= name input + PriorityStars) の見た目に変化が出ないこと.
  - `.routine-card__day-checkboxes` / `.routine-card__actions` セレクタを共用しても
    表示カードの該当要素 (= 曜日 / 削除 button) の見た目に変化が出ないこと.

### 非機能要件

- **NFR-1 (a11y 維持)**:
  - form の `aria-label` は `formAriaLabel` prop (default: "ルーティン作成フォーム") を維持.
  - name input には `<label htmlFor={inputId} className="visually-hidden">ルーティン名</label>`
    を維持. `inputId` の default は `"routine-name"`.
  - 曜日 group は `role="group" aria-label="曜日"` を維持.
  - PriorityStars には `groupLabel="優先度"` / `idPrefix="routine-create"` を維持.
  - 表示カード PriorityStars (`idPrefix="routine-{id}"`) との id 衝突を発生させない.
  - 表示カード input id (`routine-name-{id}`) と起票カード input id (`routine-name`) の
    衝突を発生させない.
  - a11y violations 0 件 (axe-core / `e2e/a11y.spec.ts`) を維持.

- **NFR-2 (public API 不変)**:
  - `RoutineFormCardProps` の 9 prop (`name` / `onNameChange` / `daysOfWeek` /
    `onToggleDay` / `defaultPriority` / `onDefaultPriorityChange` / `onSubmit` /
    `inputId?` / `formAriaLabel?`) のシグネチャ・default 値を変更しない.
  - 親 view (`routines-view.tsx`) の `<RoutineFormCard ... />` 呼び出し JSX を変更しない.

- **NFR-3 (visual 制約)**:
  - shadow / hover / transition / animation の追加禁止
    (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
  - tokens.css 改修禁止.

- **NFR-4 (スコープ閉鎖)**:
  - 改修対象は `web/src/ui/routine-card/routine-form-card.tsx` と
    `web/src/ui/routine-card/routine-card.css` の 2 ファイル.
  - 新規 component / 新規 CSS ファイル / 新規トークン追加は行わない.
  - 既存テストは追従可だが新規テストの追加は 1 ファイル
    (`web/__tests__/routine-form-card-header-layout.test.tsx`) に限る.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

### DOM 構造

```
シナリオ: AC-1 .routine-card__header 段が起票カードにも存在し PriorityStars を含む
  Given `<RoutineFormCard>` をレンダリング
  When  DOM をクエリする
  Then  form (`role="form"` で accessibleName "ルーティン作成フォーム") 直下に
        `.routine-card__header` 要素が存在し,
        その直下の子に PriorityStars の root 要素 (role="radiogroup" / accessibleName "優先度") が含まれる
```

```
シナリオ: AC-2 起票カードに .routine-card__title 段が存在し name input + label を含む
  Given `<RoutineFormCard>` をレンダリング
  When  DOM をクエリする
  Then  `.routine-card__title` 要素が存在し,
        その直下に `<label htmlFor="routine-name" class="visually-hidden">ルーティン名</label>` と
        `<input id="routine-name" type="text">` の両方が含まれる
```

```
シナリオ: AC-3 起票カードの 4 段順序が確定している
  Given `<RoutineFormCard>` をレンダリング
  When  form 要素直下の子要素を順に取得する
  Then  順に `.routine-card__header` / `.routine-card__title` /
        `.routine-card__day-checkboxes` / `.routine-card__actions` の 4 要素のみが並ぶ
```

```
シナリオ: AC-4 起票カードの .routine-card__form-row 系セレクタが DOM から撤去されている
  Given `<RoutineFormCard>` をレンダリング
  When  DOM をクエリする
  Then  `.routine-card__form-row` / `.routine-card__form-row--name` /
        `.routine-card__form-row--options` のいずれの class 名にもマッチする要素が存在しない
  Note: 上記 3 セレクタの CSS ルール撤去は plan D-004 で確定する.
```

```
シナリオ: AC-5 起票カードの「追加」 submit button が actions 段に配置される
  Given `<RoutineFormCard>` をレンダリング
  When  DOM をクエリする
  Then  `.routine-card__actions` 要素の直下に
        `<button type="submit" class="routine-card__submit">追加</button>` が存在する
        かつ name input と同じ親 (.routine-card__title) には属さない
```

### CSS

```
シナリオ: AC-6 .routine-card__title ルールセットが routine-card.css に新設されている
  Given routine-card.css を読み込む
  When  `.routine-card__title` ルールセットを参照する
  Then  少なくとも `font-size: var(--font-size-h2)` が宣言されている
```

```
シナリオ: AC-7 .routine-card__header は表示カードと共用される (BL-071 で新設したルールが流用される)
  Given routine-card.css を読み込む
  When  `.routine-card__header` ルールセットを参照する
  Then  BL-071 で確定した `display: flex` / `align-items: center` /
        `justify-content: space-between` / `gap: var(--space-sm)` /
        `font-size: var(--font-size-h2)` の 5 宣言がそのまま維持されている
        かつ `.routine-card--form .routine-card__header` の override セレクタは追加されていない
  Note: 「共用」採用は plan D-002 で確定.
```

```
シナリオ: AC-8 .routine-card__form-row 系ルールセットが routine-card.css から撤去されている
  Given routine-card.css を読み込む
  When  ファイル全文を走査する
  Then  `.routine-card__form-row` / `.routine-card__form-row--name` /
        `.routine-card__form-row--options` を定義する宣言ブロックは存在しない
  Note: 採用は plan D-004 で確定 (= 撤去).
```

```
シナリオ: AC-9 .routine-card--form は flex-direction: column + align-items: stretch を維持する
  Given routine-card.css を読み込む
  When  `.routine-card--form` ルールセットを参照する
  Then  `flex-direction: column` と `align-items: stretch` の両方が引き続き宣言されている
  Note: BL-071 D-005 の意図表明を維持する.
```

### 計算スタイル (jsdom)

```
シナリオ: AC-10 name input の computed font-size が --font-size-h2 と一致する
  Given `<RoutineFormCard>` をレンダリング
        かつ vitest.config.ts の css: true で CSS が適用される
  When  name input 要素の getComputedStyle().fontSize を取得する
  Then  CSS variable `--font-size-h2` を解決した値 (= 20px) と一致する
```

### 表示カード `<RoutineCard>` の不変性

```
シナリオ: AC-11 表示カード `<RoutineCard>` の DOM 構造 (BL-071 の 3 段) が無改修
  Given `<RoutineCard>` を表示モードでレンダリング
  When  DOM をクエリする
  Then  BL-071 spec.md AC-1 〜 AC-3 と同じ階層
        (.routine-card 直下に .routine-card__header / .routine-card__day-checkboxes /
         .routine-card__actions の 3 要素 / header 直下に label + input + PriorityStars)
        が引き続き成立する
```

```
シナリオ: AC-12 表示カード `<RoutineCard>` の name input computed font-size が変わらない
  Given `<RoutineCard>` を表示モードでレンダリング
  When  name input の getComputedStyle().fontSize を取得する
  Then  20px (= --font-size-h2) と一致する (BL-071 AC-9 維持)
```

### 既存挙動の回帰防止

```
シナリオ: AC-13 form submit で onSubmit が呼ばれる
  Given `<RoutineFormCard>` をレンダリング
  When  「追加」 button を click する (= form submit が発火)
  Then  onSubmit ハンドラが 1 回呼ばれ, 第 1 引数 e は preventDefault 可能な FormEvent
```

```
シナリオ: AC-14 name input への入力で onNameChange が呼ばれる (controlled)
  Given `<RoutineFormCard>` を name="" でレンダリング
  When  name input に "朝の体操" をタイプする
  Then  onNameChange が "朝の体操" の各キーで段階的に呼ばれる
```

```
シナリオ: AC-15 曜日 checkbox click で onToggleDay が呼ばれる
  Given `<RoutineFormCard>` を daysOfWeek={[1]} でレンダリング
  When  「水」 (day=3) の checkbox を click する
  Then  onToggleDay が (3) で呼ばれる
```

```
シナリオ: AC-16 PriorityStars click で onDefaultPriorityChange が呼ばれる
  Given `<RoutineFormCard>` を defaultPriority="normal" でレンダリング
  When  PriorityStars の "high" 相当の radio を click する
  Then  onDefaultPriorityChange が ("high") で呼ばれる
```

```
シナリオ: AC-17 daysOfWeek 配列に含まれる曜日 checkbox が checked になる
  Given `<RoutineFormCard>` を daysOfWeek={[1, 3, 5]} でレンダリング
  When  曜日 checkbox 7 個の checked プロパティを取得する
  Then  「月」(day=1) / 「水」(day=3) / 「金」(day=5) のみが checked=true
        他 4 個は checked=false
```

```
シナリオ: AC-18 name input の required 属性が維持される
  Given `<RoutineFormCard>` をレンダリング
  When  name input の required 属性を取得する
  Then  required=true である
```

### a11y

```
シナリオ: AC-19 form aria-label が "ルーティン作成フォーム" である
  Given `<RoutineFormCard>` を formAriaLabel 未指定でレンダリング
  When  form 要素の aria-label を取得する
  Then  "ルーティン作成フォーム" と一致する
```

```
シナリオ: AC-20 visually-hidden label が name input と紐づく
  Given `<RoutineFormCard>` を inputId 未指定でレンダリング
  When  DOM をクエリする
  Then  `<label for="routine-name" class="visually-hidden">ルーティン名</label>` と
        `<input id="routine-name">` の両方が存在する
        かつ accessibleName で "ルーティン名" の input が取得できる
```

```
シナリオ: AC-21 PriorityStars の groupLabel が "優先度" / idPrefix が "routine-create"
  Given `<RoutineFormCard>` をレンダリング
  When  PriorityStars の root role="radiogroup" を取得する
  Then  accessibleName は "優先度"
        かつ 子 radio の id prefix は "routine-create" で始まる
```

```
シナリオ: AC-22 表示カードと起票カードの input id 衝突がない
  Given `<RoutineCard routine={ id: "r-1", ... }>` と
        `<RoutineFormCard>` を同時にレンダリング
  When  document 全体で input id を取得する
  Then  "routine-name-r-1" (表示カード) と "routine-name" (起票カード) の両方が存在し
        重複は無い
```

### 順序保証

```
シナリオ: AC-23 header 段内に PriorityStars 単独が含まれる (左側に他の form 要素を置かない / 第一候補)
  Given `<RoutineFormCard>` をレンダリング
  When  `.routine-card__header` の直下の子要素を取得する
  Then  PriorityStars (role="radiogroup") のみが直下子として存在する
        かつ name input / 曜日 group / 「追加」 button のいずれも header の直下子には含まれない
  Note: 「左空 (=PriorityStars 単独)」は plan D-001 第一候補. 別案採択時は AC-23 を plan に合わせて
        書き換える.
```

## 未決事項 / 確認待ち

- **U-1**: header 段の **左側** に何を置くか.
  - 候補 (a) 何も置かない (PriorityStars 単独 / space-between で右端固定): 第一候補.
  - 候補 (b) 「ルーティン作成」等の見出し span を視覚的に置く: 起票カードに見出しを持つ
    UI 慣行は他に無いため不採用候補.
  - 候補 (c) 「追加」 button をここに置く: REQ-4 / D-005 と矛盾するため不採用候補.
  - → plan D-001 で確定する.

- **U-2**: `.routine-card__form-row` / `.routine-card__form-row--name` /
  `.routine-card__form-row--options` の 3 セレクタ・宣言ブロックを CSS から完全撤去するか.
  - 候補 (a) 撤去 (推奨 / 第一候補): DOM 側からセレクタが消えるため dead-rule 化する.
  - 候補 (b) 維持: 将来再利用の可能性に備えて残す. ただし他カード系 (TaskCard / ProjectCard)
    では dead-rule を残さない方針 (= BL-071 D-006 と整合) のため不採用候補.
  - → plan D-004 で確定する.

- **U-3**: 「追加」 submit button を name input と同じ段 (= title 段) に併置するか,
  独立 actions 段に置くか.
  - 候補 (a) 独立 actions 段 (第一候補 / REQ-4): 表示カードの `.routine-card__actions`
    (削除 button 配置) と段名を共用でき, タスク起票カード `<TaskFormCard>` の actions 段
    (= 「追加」のみ) とも揃う.
  - 候補 (b) title 段に併置 (現行と同型): name input + 「追加」 button が横並びで
    残るため操作の慣れは引き継げるが, 「追加」 button が title 段にあると
    `.routine-card__title` の typography 統一に汚れが入る (button にも 20px が
    継承されないよう個別に override が必要).
  - → plan D-005 で確定する.

- **U-4**: 起票カード `.routine-card__header` を表示カードと **共用するか**, あるいは
  `.routine-card--form .routine-card__header { ... }` で override するか.
  - 候補 (a) 共用 (第一候補 / REQ-2): BL-071 で確定した 5 宣言
    (`display: flex` / `align-items: center` / `justify-content: space-between` /
     `gap: var(--space-sm)` / `font-size: var(--font-size-h2)`) を
    そのまま起票カードでも使う.
    - 表示カード: header に name input + PriorityStars が並ぶ → space-between で左右配置.
    - 起票カード: header に PriorityStars 単独 → space-between でも単独要素は左端に置かれる
      ため明示的に `justify-content: flex-end` を当てるかが論点に.
  - 候補 (b) override: `.routine-card--form .routine-card__header { justify-content: flex-end }`
    で起票カード側で PriorityStars を確実に右端に固定する.
  - → plan D-002 / D-003 で確定する. 第一候補は共用 + `space-between` のままで OK だが,
    PriorityStars 単独で右端に来るかは flex の挙動上の保証が無いため D-006 で「右端固定の
    確実化手段 (= override か margin-left: auto か)」を確定する必要あり.

- **U-5**: 起票カードの actions 段 (= 「追加」 button) は表示カードの `.routine-card__actions`
  (削除 button) と段名共用する場合, 横並びの揃え方 (`justify-content` の値) が共用 CSS で
  決まる. 起票カード「追加」は右端 / 表示カード「削除」は左端 (または無指定 = 左寄せ) で
  良いか, それとも起票側は別 className を新設するか.
  - 候補 (a) 段名共用 + `justify-content` 無指定 (現状の `.routine-card__actions` の
    既存 CSS = `display: flex; align-items: center; gap: var(--space-sm)` だけ):
    起票カードの「追加」は flex 自然順で左寄せになる.
  - 候補 (b) `.routine-card--form .routine-card__actions { justify-content: flex-end }`
    で起票カードのみ右寄せ.
  - 候補 (c) 起票側に別 className `.routine-card__form-actions` 新設.
  - → plan D-007 で確定する. user の希望 (起票カードでは「追加」を右端配置) に従い
    第一候補は (b).
