# 仕様: RoutineCard 表示カードのレイアウト刷新 (RoutineFormCard と同じ 4 段構造に揃える)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-073
- 依存: BL-061 (routine-card-component) / BL-068 (routine-card-edit-fields) / BL-069 (routine-card-edit-priority) / BL-070 (inline-edit-all-cards) / BL-071 (routine-card-header-layout) / BL-072 (routine-form-card-header-layout)
- 参照: BL-059 (task-card-component) / BL-063 (task-card-hotfix)

## 背景 / 課題

BL-072 (`routine-form-card-header-layout` / commit `44f06a2` / main マージ済) で
起票カード `<RoutineFormCard>` を **4 段構造** に再編した:

| 段 | class | 中身 |
| --- | --- | --- |
| 1 | `.routine-card__header` | (左空) + PriorityStars (右) |
| 2 | `.routine-card__title` | visually-hidden label + name input |
| 3 | `.routine-card__day-checkboxes` | 曜日 7 checkbox |
| 4 | `.routine-card__actions` | 「追加」 submit button |

しかし表示カード `<RoutineCard>` は BL-071 (`routine-card-header-layout`) で導入した
**3 段構造** のまま残っている:

| 段 | class | 中身 |
| --- | --- | --- |
| 1 | `.routine-card__header` | name input (左) + PriorityStars (右) |
| 2 | `.routine-card__day-checkboxes` | 曜日 7 checkbox |
| 3 | `.routine-card__actions` | 削除 button |

結果として:

- 起票カード: name input が **2 段目** (`.routine-card__title` 段)
- 表示カード: name input が **1 段目** (`.routine-card__header` 段)

という **段位置の不一致** が残り, user 評価で
「ルーティンにおいて起票ではルーティン名が一段下がっているのにルーティンカードでは下がっていません.
このような表面上の微妙な差をなくしてください」と齟齬が指摘された.

> BL-071 当時は「TaskCard と同じ構造」を目指して header に name を置いたが,
> TaskCard は header の左に project chip が入る前提で, chip があれば name は title 段に下がる.
> RoutineCard は chip 概念を持たないため header 左が常に空 + name 段が起票より 1 段上にずれる結果になった.

本 BL は「カード系統間 (Task / Routine) の構造模倣」より
「カード系統内 (Routine) の起票/表示の一貫性」を優先する判断で,
表示カード `<RoutineCard>` も起票カードと同じ 4 段構造に揃える.

## ゴール / 非ゴール

- ゴール:
  - `<RoutineCard>` (表示カード) の DOM 構造を **4 段**
    (header / title / day-checkboxes / actions) に再編する.
  - header 段は **PriorityStars 単独** で右端配置する (= 起票カードと同イディオム).
  - name input は新 `.routine-card__title` 段に内包する.
  - name input の computed font-size が `--font-size-h2` (= 20px) で起票カードと統一される.
  - 既存挙動 (BL-070 空文字 blur 元値復元 / 同値 blur 短絡 / BL-068 / BL-069 即時 PATCH /
    BL-061 削除) を回帰させない.
  - `RoutineCardProps` の **public API** (6 prop / routine / onNameBlur /
    onDaysOfWeekChange / onDefaultPriorityChange / onDelete / as?) を維持する
    (= 親 view `routines-view.tsx` 呼び出し側を無改修にする).
  - 起票カード `<RoutineFormCard>` の DOM 構造・見た目に副作用なし
    (= BL-072 の成果を維持).
- 非ゴール:
  - `<RoutineFormCard>` (起票カード) の DOM・CSS 変更. BL-072 の成果を維持する.
  - `routines-view.tsx` (親 view) のロジック変更. JSX 呼び出し側も無改修.
  - TaskCard / TaskFormCard / ProjectCard / ProjectFormCard への変更.
  - `WebRoutineRepository` / `UpdateRoutineCommand` / `CreateRoutineCommand` /
    domain / server / API への変更.
  - tokens.css (デザイントークン) への変更. 既存値 (`--font-size-h2` / `--space-md` 等) を
    そのまま参照する.
  - 共通 button (BL-067) の導入.
  - shadow / hover / transition / animation の追加
    (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
  - PriorityStars / project-chip / visually-hidden ユーティリティの API・スタイル変更.
  - 表示カードに「project chip 相当」を新設する変更
    (= ルーティンはプロジェクト概念を持たないため対象外).
  - 曜日 7 checkbox 群の見た目変更. 場所 (新構造 3 段目 = day-checkboxes 段) の
    指定のみ行い `.routine-card__day-checkboxes` の CSS は無改修で流用する.
  - 「削除」 button のテキスト・ハンドラ・キーボード操作の変更.
  - TaskCard の表示カード `<TaskCard>` の構造変更 (= 系統間の模倣方針を逆転させない).

## 要件

### 機能要件

- **REQ-1**: `<RoutineCard>` の DOM 階層は以下の **4 段** とする.

  ```
  <Tag /* "li" | "div" / default: "li" */ className="routine-card">
    <div className="routine-card__header">
      {/* 左側の埋め物は plan D-002 で確定. 第一候補は「何も置かない (= 空)」.
          PriorityStars が単独で右端固定 (= 起票カードと同イディオム / D-001). */}
      <PriorityStars
        value={routine.defaultPriority}
        onChange={onDefaultPriorityChange}
        groupLabel={`${routine.name} の優先度`}
        idPrefix={`routine-${routine.id}`}
      />
    </div>
    <div className="routine-card__title">
      <label htmlFor={`routine-name-${routine.id}`} className="visually-hidden">
        ルーティン名
      </label>
      <input
        key={`routine-name-${routine.id}-${routine.name}`}
        id={`routine-name-${routine.id}`}
        type="text"
        className="routine-card__input"
        defaultValue={routine.name}
        placeholder="ルーティン名"
        onBlur={(e) => {
          const next = e.currentTarget.value;
          if (next === "") {
            e.currentTarget.value = routine.name;
          }
          onNameBlur(next);
        }}
      />
    </div>
    <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
      <label>...</label> × 7
    </div>
    <div className="routine-card__actions">
      <button type="button" className="routine-card__actions__delete" onClick={onDelete}>
        削除
      </button>
    </div>
  </Tag>
  ```

  - 4 段の順序は header → title → day-checkboxes → actions で固定する.
  - **title 段の class 名**: BL-072 で起票カードに新設した `.routine-card__title` を
    表示カードでも **共用** する. ルールセットは新規追加せず, 既存 (= BL-072 で確定済の
    `display: flex` / `align-items: center` / `font-size: var(--font-size-h2)`) をそのまま流用.
  - **header 左側の埋め物**: plan D-002 で確定. 第一候補は「何も置かない」.

- **REQ-2**: `.routine-card__header` セレクタは表示カードでも引き続き使う (= 段名共用).
  - 表示カードでは header 直下子が PriorityStars 単独になる (= 起票カードと同じ状態).
  - 起票カード側で BL-072 D-006 として既に
    `.routine-card--form .routine-card__header { justify-content: flex-end }` の
    override が宣言されているが, 表示カードには `--form` modifier が付かないため,
    起票側 override は適用されない. **表示カード側でも PriorityStars 単独を右端固定する
    機構が別途必要** (= plan D-001 で確定する).

- **REQ-3**: name input が配置される `.routine-card__title` 段の computed font-size は
  `--font-size-h2` (= 20px) と一致する.
  - 実現方法は plan D-003 で確定. 第一候補は「BL-072 D-003 で起票カードに対して確定した
    `.routine-card__title { font-size: var(--font-size-h2) }` +
    `.routine-card__input { font: inherit; font-size: var(--font-size-h2) }` の二重宣言を
    表示カードでもそのまま流用」(= 新規 CSS なし).
  - 表示と起票で input フォントサイズが共に 20px に揃う (= BL-071 D-010 / BL-072 D-010 を踏襲).

- **REQ-4**: 「削除」 button は新構造の最終段 `.routine-card__actions` に配置する.
  - これは BL-071 / BL-072 で確定した actions 段の用法をそのまま踏襲する.
  - 表示カードの actions 段直下子は `<button type="button" className="routine-card__actions__delete" onClick={onDelete}>削除</button>` のみ.
  - 起票カードの actions 段 (= 「追加」 button) との共用は段名のみで, 中身の button は
    各カードで個別 (= 表示「削除」/ 起票「追加」).

- **REQ-5**: 既存挙動を回帰させない.
  - **BL-070 D-001 (同値 blur 短絡)**: 同値で blur しても親 view が PATCH を送らない経路を
    維持する. 本 BL ではカード側に変更を入れない (= 親 view 側で短絡継続).
  - **BL-070 D-002 / P-001 (iii) (空文字 blur 元値復元)**:
    name input は **uncontrolled** (`defaultValue` + `key` 再マウント) のまま維持し,
    blur で空文字を受けたら DOM 値を `routine.name` に書き戻す (`e.currentTarget.value = routine.name`).
    BL-070 で確立した「親が PATCH を短絡 + カードが DOM 値を復元 (= 静かな扱い)」の機構を本 BL でも維持する.
  - **BL-068 / BL-069 (即時 PATCH)**: 曜日 checkbox / PriorityStars の click ごとに
    親 handler (`onDaysOfWeekChange` / `onDefaultPriorityChange`) が呼ばれる経路を維持する.
  - **削除**: 「削除」 button click で `onDelete()` が 1 回呼ばれる経路を維持する.

- **REQ-6**: 起票カード `<RoutineFormCard>` の DOM 構造 (BL-072 の 4 段) には **副作用なし**.
  - 起票カードの header / title / day-checkboxes / actions 段の見た目・配置に変化が出ないこと.
  - 起票カード input の computed font-size (= 20px) が変わらないこと.

### 非機能要件

- **NFR-1 (a11y 維持)**:
  - `<RoutineCard>` の name input には
    `<label htmlFor="routine-name-{routine.id}" className="visually-hidden">ルーティン名</label>` を維持.
  - 曜日 group は `role="group" aria-label="曜日"` を維持.
  - PriorityStars には `groupLabel="${routine.name} の優先度"` /
    `idPrefix="routine-{routine.id}"` を維持.
  - 起票カード input id (`"routine-name"`) と表示カード input id (`"routine-name-{id}"`) の
    衝突を発生させない (= 起票は単数固定 id, 表示は entity id suffix で異なる).
  - 起票カード PriorityStars (`idPrefix="routine-create"`) と表示カード
    (`idPrefix="routine-{id}"`) の衝突を発生させない.
  - a11y violations 0 件 (axe-core / `e2e/a11y.spec.ts`) を維持.

- **NFR-2 (public API 不変)**:
  - `RoutineCardProps` の 6 prop (`routine` / `onNameBlur` / `onDaysOfWeekChange` /
    `onDefaultPriorityChange` / `onDelete` / `as?`) のシグネチャ・default 値
    (`as = "li"`) を変更しない.
  - 親 view (`routines-view.tsx`) の `<RoutineCard ... />` 呼び出し JSX を変更しない.

- **NFR-3 (visual 制約)**:
  - shadow / hover / transition / animation の追加禁止
    (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
  - tokens.css 改修禁止.

- **NFR-4 (スコープ閉鎖)**:
  - 改修対象は `web/src/ui/routine-card/routine-card.tsx` と
    `web/src/ui/routine-card/routine-card.css` の 2 ファイル.
  - 新規 component / 新規 CSS ファイル / 新規トークン追加は行わない.
  - 既存テストは追従可だが新規テストの追加は 1 ファイル
    (`web/__tests__/routine-card-align-with-form.test.tsx`) に限る.

- **NFR-5 (起票カード不変)**:
  - `web/src/ui/routine-card/routine-form-card.tsx` には変更を加えない.
  - 起票カード関連の CSS セレクタ
    (`.routine-card--form .routine-card__header { justify-content: flex-end }` /
     `.routine-card--form .routine-card__actions { justify-content: flex-end }` /
     `.routine-card--form { flex-direction: column; align-items: stretch }`)
    は全て維持する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

### DOM 構造

```
シナリオ: AC-1 表示カード `.routine-card__header` 段が存在し PriorityStars を単独で含む
  Given `<RoutineCard>` を `routine={ id: "r-1", name: "朝のヨガ", defaultPriority: "normal", daysOfWeek: [1] }` でレンダリング
  When  DOM をクエリする
  Then  ルート要素 (`<li className="routine-card">`) の直下に `.routine-card__header` 要素が存在し,
        その直下の子に PriorityStars の root 要素 (role="radiogroup" / accessibleName "朝のヨガ の優先度") のみが含まれる
        かつ `.routine-card__header` 直下に name input は含まれない
```

```
シナリオ: AC-2 表示カードに `.routine-card__title` 段が存在し name input + visually-hidden label を含む
  Given `<RoutineCard>` を `routine={ id: "r-1", name: "朝のヨガ" }` でレンダリング
  When  DOM をクエリする
  Then  `.routine-card__title` 要素が存在し,
        その直下に `<label htmlFor="routine-name-r-1" class="visually-hidden">ルーティン名</label>` と
        `<input id="routine-name-r-1" type="text">` の両方が含まれる
```

```
シナリオ: AC-3 表示カードの 4 段順序が確定している
  Given `<RoutineCard>` をレンダリング
  When  `.routine-card` 直下の子要素を順に取得する
  Then  順に `.routine-card__header` / `.routine-card__title` /
        `.routine-card__day-checkboxes` / `.routine-card__actions` の 4 要素のみが並ぶ
```

```
シナリオ: AC-4 表示カードの header 直下子要素が PriorityStars のみ
  Given `<RoutineCard>` をレンダリング
  When  `.routine-card__header` の直下の子要素を取得する
  Then  PriorityStars (role="radiogroup") のみが直下子として存在する
        かつ name input / visually-hidden label / 曜日 group / 「削除」 button のいずれも header の直下子には含まれない
  Note: 「左空 (=PriorityStars 単独)」は plan D-002 第一候補. 別案採択時は AC-4 を plan に合わせて
        書き換える.
```

```
シナリオ: AC-5 表示カードの「削除」 button が actions 段に配置される
  Given `<RoutineCard>` をレンダリング
  When  DOM をクエリする
  Then  `.routine-card__actions` 要素の直下に
        `<button type="button" class="routine-card__actions__delete">削除</button>` が存在する
        かつ name input と同じ親 (.routine-card__title) には属さない
        かつ header と同じ親 (.routine-card__header) には属さない
```

### CSS

```
シナリオ: AC-6 `.routine-card__title` ルールセットが routine-card.css で表示カードにも適用される (= 共用)
  Given routine-card.css を読み込む
  When  `.routine-card__title` ルールセットを参照する
  Then  BL-072 D-003 で確定した 3 宣言 (display: flex / align-items: center /
        font-size: var(--font-size-h2)) がそのまま維持されている
        かつ `.routine-card--form .routine-card__title` のような起票カード専用 override は追加されていない
  Note: 「共用」採用は plan D-003 で確定.
```

```
シナリオ: AC-7 `.routine-card__header` が PriorityStars 単独を右端固定する機構を持つ
  Given routine-card.css を読み込む
  When  `.routine-card__header` ルールセットを参照する
  Then  PriorityStars 単独要素が右端に固定される機構が宣言されている
  Note: 実現方法は plan D-001 で確定. 第一候補は基底 `.routine-card__header` の
        `justify-content` を `space-between` → `flex-end` に変更し,
        起票カード側 override (`.routine-card--form .routine-card__header { justify-content: flex-end }`)
        を **撤去** する (= 表示・起票で同じ宣言を共用). 別案採択時は AC-7 を plan に合わせて書き換える.
```

```
シナリオ: AC-8 `.routine-card--form .routine-card__header` の override が plan D-001 採用案に応じて整理される
  Given routine-card.css を読み込む
  When  `.routine-card--form .routine-card__header` の宣言ブロックを参照する
  Then  plan D-001 (a) 採用時: `.routine-card--form .routine-card__header` の override は完全撤去されている
        plan D-001 (b) 採用時: override は維持され, 基底 `.routine-card__header` も `flex-end` に変更されている
        plan D-001 (c) 採用時: override は維持され, PriorityStars wrap div への `margin-left: auto` で対応
  Note: 第一候補は (a). 別案採択時は AC-8 を plan に合わせて書き換える.
```

```
シナリオ: AC-9 `.routine-card` 基底 (4 段 layout) が無改修で維持される
  Given routine-card.css を読み込む
  When  `.routine-card` ルールセットを参照する
  Then  BL-071 で確定した
        `display: flex` / `flex-direction: column` / `gap: var(--space-md)` +
        visual 4 宣言 (background / border / border-radius: var(--radius-lg) / padding: var(--space-md))
        の 7 宣言がそのまま維持されている
```

```
シナリオ: AC-10 `.routine-card--form` セレクタ (起票専用) が無改修で維持される
  Given routine-card.css を読み込む
  When  `.routine-card--form` / `.routine-card--form .routine-card__actions` ルールセットを参照する
  Then  BL-072 で確定した `.routine-card--form { flex-direction: column; align-items: stretch }` および
        `.routine-card--form .routine-card__actions { justify-content: flex-end }` が
        いずれも宣言ブロックとして残存する
  Note: NFR-5 (起票カード不変) の維持確認.
```

### 計算スタイル (jsdom)

```
シナリオ: AC-11 表示カード name input の computed font-size が --font-size-h2 と一致する
  Given `<RoutineCard>` をレンダリング
        かつ vitest.config.ts の css: true で CSS が適用される
  When  name input 要素の getComputedStyle().fontSize を取得する
  Then  CSS variable `--font-size-h2` を解決した値 (= 20px) と一致する
```

### 既存挙動の回帰防止

```
シナリオ: AC-12 name input blur で onNameBlur が呼ばれる
  Given `<RoutineCard routine={ name: "朝のヨガ", ... } onNameBlur={spy}>` をレンダリング
  When  name input に "夜の体操" を入力して blur する
  Then  spy が ("夜の体操") で 1 回呼ばれる
```

```
シナリオ: AC-13 空文字 blur で DOM 値が元値に復元され onNameBlur に "" が渡る
  Given `<RoutineCard routine={ name: "朝のヨガ", ... } onNameBlur={spy}>` をレンダリング
  When  name input の値を "" にして blur する
  Then  input の DOM value が "朝のヨガ" に書き戻されている
        かつ spy が ("") で 1 回呼ばれる (= 親 view が短絡判断する経路を維持)
  Note: BL-070 D-002 / P-001 (iii) を維持.
```

```
シナリオ: AC-14 同値 blur でも onNameBlur が呼ばれる (短絡判断は親 view)
  Given `<RoutineCard routine={ name: "朝のヨガ", ... } onNameBlur={spy}>` をレンダリング
  When  name input の値を変えずに blur する (defaultValue="朝のヨガ" / 編集なし)
  Then  spy が ("朝のヨガ") で 1 回呼ばれる
  Note: BL-070 D-001 を維持. カードは常に blur 値を流し, 親が PATCH 短絡を判断する.
```

```
シナリオ: AC-15 曜日 checkbox click で onDaysOfWeekChange が呼ばれる
  Given `<RoutineCard routine={ daysOfWeek: [1], ... } onDaysOfWeekChange={spy}>` をレンダリング
  When  「水」 (day=3) の checkbox を click する
  Then  spy が ([1, 3]) で呼ばれる (sort 済み配列)
```

```
シナリオ: AC-16 PriorityStars click で onDefaultPriorityChange が呼ばれる
  Given `<RoutineCard routine={ defaultPriority: "normal", ... } onDefaultPriorityChange={spy}>` をレンダリング
  When  PriorityStars の "high" 相当の radio を click する
  Then  spy が ("high") で呼ばれる
```

```
シナリオ: AC-17 「削除」 button click で onDelete が呼ばれる
  Given `<RoutineCard onDelete={spy}>` をレンダリング
  When  `.routine-card__actions__delete` button を click する
  Then  spy が 1 回呼ばれる
```

```
シナリオ: AC-18 routine.name 変更時に input value が同期する (key 再マウント)
  Given `<RoutineCard routine={ name: "朝のヨガ", ... }>` をレンダリング
  When  routine.name を "夜の体操" に変えて再レンダリングする
  Then  input の DOM value が "夜の体操" になる (= サーバ正本値変化時の同期 / BL-070)
```

### 起票カード `<RoutineFormCard>` の不変性

```
シナリオ: AC-19 起票カード `<RoutineFormCard>` の DOM 構造 (BL-072 の 4 段) が無改修
  Given `<RoutineFormCard>` をレンダリング
  When  DOM をクエリする
  Then  BL-072 spec.md AC-1 〜 AC-5 と同じ階層
        (form 直下に `.routine-card__header` (PriorityStars 単独) /
         `.routine-card__title` (label + name input) /
         `.routine-card__day-checkboxes` /
         `.routine-card__actions` (「追加」 button) の 4 要素のみ)
        が引き続き成立する
```

```
シナリオ: AC-20 起票カード name input の computed font-size が変わらない (= 20px)
  Given `<RoutineFormCard>` をレンダリング
  When  name input の getComputedStyle().fontSize を取得する
  Then  20px (= --font-size-h2) と一致する (BL-072 AC-10 維持)
```

### a11y

```
シナリオ: AC-21 表示カードの visually-hidden label が name input と紐づく (entity id suffix)
  Given `<RoutineCard routine={ id: "r-1", name: "朝のヨガ", ... }>` をレンダリング
  When  DOM をクエリする
  Then  `<label for="routine-name-r-1" class="visually-hidden">ルーティン名</label>` と
        `<input id="routine-name-r-1">` の両方が存在する
        かつ accessibleName で "ルーティン名" の input が取得できる
```

```
シナリオ: AC-22 表示カード PriorityStars の groupLabel / idPrefix が entity 依存で確定する
  Given `<RoutineCard routine={ id: "r-1", name: "朝のヨガ", defaultPriority: "normal", ... }>` をレンダリング
  When  PriorityStars の root (role="radiogroup") を取得する
  Then  accessibleName は "朝のヨガ の優先度"
        かつ 子 radio の id prefix は "routine-r-1" で始まる
```

```
シナリオ: AC-23 表示カードと起票カードを同時にレンダリングしても input id 衝突がない
  Given `<RoutineCard routine={ id: "r-1", ... }>` と `<RoutineFormCard>` を同時にレンダリング
  When  document 全体で input id を取得する
  Then  "routine-name-r-1" (表示) と "routine-name" (起票) の両方が存在し重複は無い
```

```
シナリオ: AC-24 表示カードと起票カードを同時にレンダリングしても PriorityStars radio id 衝突がない
  Given `<RoutineCard routine={ id: "r-1", ... }>` と `<RoutineFormCard>` を同時にレンダリング
  When  document 全体で radio input の id を取得する
  Then  "routine-r-1" prefix (表示) と "routine-create" prefix (起票) で重複が無い
```

### 起票カード CSS の整合性 (D-001 案 (a) 採用時のみ)

```
シナリオ: AC-25 plan D-001 (a) 採用時: 起票カード PriorityStars が引き続き右端に並ぶ
  Given plan D-001 で (a) (= 基底 `.routine-card__header` の `justify-content` を flex-end に変更 +
        起票側 override 撤去) が採用される
  When  `<RoutineFormCard>` をレンダリングして `.routine-card__header` の computed style を取得する
  Then  `justify-content` が `flex-end` で, PriorityStars が右端に並ぶ視覚配置を維持する
  Note: D-001 別案採択時は AC-25 を plan に合わせて書き換える.
```

## 未決事項 / 確認待ち

- **U-1**: 表示カード `.routine-card__header` で PriorityStars 単独を **右端固定する機構** をどう実現するか.
  - 候補 (a) 基底 `.routine-card__header { justify-content: space-between }` を
    `justify-content: flex-end` に変更し, 起票側の override
    `.routine-card--form .routine-card__header { justify-content: flex-end }` を撤去する
    (= 表示・起票で同じ宣言を共用). 第一候補.
    - 利点: CSS が 1 宣言で完結する. 起票カードへの副作用なし (override 撤去後も `flex-end` が
      継承される).
    - 欠点: 表示カードの header に将来 (例えば project chip 相当の) 2 要素目を入れた場合,
      `flex-end` だと両要素が右に寄ってしまい意図しない配置になるリスクがある (= 将来の拡張余地が狭まる).
      ただしルーティンは chip 概念を持たない前提なので本 BL では問題なし.
  - 候補 (b) 表示カード専用に modifier `.routine-card--display` を新設して
    `.routine-card--display .routine-card__header { justify-content: flex-end }` で override.
    - 利点: 表示と起票の差分が明示的.
    - 欠点: modifier 新設で `<RoutineCard>` JSX に `className="routine-card routine-card--display"`
      を追加する必要が出る. BL-072 で起票側に `--form` modifier があるのと対になるが
      表示側にだけ修飾子を後付けする必然性は弱い.
  - 候補 (c) `space-between` のまま PriorityStars を wrap div で包んで
    `<div className="routine-card__header__priority"><PriorityStars ... /></div>` とし
    `margin-left: auto` を当てる (TaskCard BL-063 D-001 と同イディオム).
    - 利点: 起票側 override をそのまま維持できる + 将来 header 左に何かを入れる柔軟性が残る.
    - 欠点: 起票カード `<RoutineFormCard>` 側でも同じ wrap を入れないと表示・起票で DOM 構造に
      差が出る (= 段位置一致のゴールに反する) ため, 起票カード JSX にも手を入れる必要が出て
      NFR-5 (起票カード不変) と抵触する.
  - → plan D-001 で確定する. 第一候補は (a).

- **U-2**: header 段の **左側** に何を置くか.
  - 候補 (a) 何も置かない (PriorityStars 単独 / D-001 採用案で右端固定): 第一候補.
  - 候補 (b) `<div aria-hidden="true" />` のような placeholder を入れる:
    DOM が増えて意図不明. 不採用.
  - 候補 (c) 「ルーティン」 等の見出し span を置く: 表示カードに見出しを持つ UI 慣行は他に無いため不採用.
  - → plan D-002 で確定する.

- **U-3**: `.routine-card__title` セレクタを表示カードでも **共用するか**, あるいは
  表示カード専用に別宣言 `.routine-card .routine-card__title` 等を新設するか.
  - 候補 (a) 共用 (第一候補 / REQ-3): BL-072 で確定した 3 宣言 (display: flex /
    align-items: center / font-size: var(--font-size-h2)) をそのまま表示カードでも使う.
    - 利点: CSS 1 ブロックの宣言を表示・起票双方で使うことで「name 段の視覚仕様」が単一の出典に
      閉じる. 将来の保守で「片方にだけ反映漏れ」のリスクを避ける.
  - 候補 (b) 別宣言: 表示カードでは name input が他の要素と並列されない (= input 単独)
    ため, 「title 段」と呼ぶより別の class 名 (例: `.routine-card__name`) が意味的に正確.
    - 欠点: BL-070 で `.routine-card__name` を撤去した方針 (= 「name span から input に常時化」)
      を逆転することになる. また起票・表示で別 class を引き当てる二重管理が発生する.
  - → plan D-003 で確定する. 第一候補は (a).

- **U-4**: BL-071 で導入した「header 内 name input」関連 CSS / JSX の **撤去範囲**.
  - JSX 側: `<input className="routine-card__input">` と `<label htmlFor="routine-name-{id}">` を
    `.routine-card__header` 直下 → `.routine-card__title` 直下に移動するだけ. 撤去は無し.
  - CSS 側: `.routine-card__input { font: inherit; font-size: var(--font-size-h2); flex: 1 }` および
    `::placeholder` ルールは表示・起票共用で維持. 撤去は無し.
  - 唯一の撤去候補: `.routine-card__header` 基底の `font-size: var(--font-size-h2)` 宣言.
    本 BL では header 内に input が並ばなくなるため不要だが, BL-072 で同名セレクタを起票カードと
    共用しているため撤去すると起票側にも影響が出る. plan D-004 で確定する.
    第一候補は「維持」(= 5 宣言のまま. dead-rule 化するが副作用なし).
  - → plan D-004 で確定する.

- **U-5**: 表示カード `<RoutineCard>` の root tag に modifier `.routine-card--display` 等を
  追加するか (= U-1 候補 (b) と連動).
  - 第一候補は「追加しない」(U-1 候補 (a) 採用時). plan D-001 / D-005 で確定する.
