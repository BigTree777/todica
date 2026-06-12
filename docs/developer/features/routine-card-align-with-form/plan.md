# 設計・実装計画: RoutineCard 表示カードのレイアウト刷新

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`<RoutineCard>` (表示カード) の DOM 構造を **4 段ゾーン**
(`.routine-card__header` [PriorityStars 単独 / 右端固定] /
 `.routine-card__title` [name input + visually-hidden label / BL-072 で起票カードに新設したセレクタを共用] /
 `.routine-card__day-checkboxes` [曜日 7 件 / 既存セレクタ流用] /
 `.routine-card__actions` [「削除」 button / 既存セレクタ流用])
に組み替える. これにより表示カードの name input が 1 段目 (header) から 2 段目 (title) に下がり,
起票カード `<RoutineFormCard>` (BL-072) と段位置が完全一致する.
PriorityStars 単独の右端固定は **基底 `.routine-card__header` の `justify-content` を
`space-between` から `flex-end` に変更** することで実現し, 同時に起票カード側の override
`.routine-card--form .routine-card__header { justify-content: flex-end }` を撤去して
表示・起票で同じ宣言を共用する (= D-001 案 (a)).

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| ドメイン | なし |
| モジュール (web) | `web/src/ui/routine-card/routine-card.tsx` (JSX 再構築) / `web/src/ui/routine-card/routine-card.css` (`.routine-card__header` の `justify-content` 値変更 + 起票側 override 撤去) |
| UI | `<RoutineCard>` (表示) のみ. `<RoutineFormCard>` (起票) / routines-view / projects-view / today-view / tomorrow-view / focus-view 無改修. |
| テスト | 既存 `routine-card-component.test.tsx` (BL-061) / `routine-card-edit-fields.test.tsx` (BL-068) / `routine-card-edit-priority.test.tsx` (BL-069) / `inline-edit-all-cards.test.tsx` (BL-070) / `routine-card-header-layout.test.tsx` (BL-071) / `routine-form-card-header-layout.test.tsx` (BL-072) で表示カードの DOM 階層 / `.routine-card__header` 内子要素 assert があれば追従. 新規 `routine-card-align-with-form.test.tsx` を追加. |
| E2E | role + accessibleName ベースのため無修正で通る想定. `e2e/routines.spec.ts` / `e2e/routine-card-edit-fields.spec.ts` / `e2e/routine-card-edit-priority.spec.ts` / `e2e/conflict-handling.spec.ts` / `e2e/a11y.spec.ts` を全件 green 確認. |

## 設計詳細

### JSX 再構築 (`routine-card.tsx`)

**Before** (現状 / BL-071 + BL-070 段階):

```tsx
<Tag className="routine-card">
  <div className="routine-card__header">
    <label htmlFor={inputId} className="visually-hidden">ルーティン名</label>
    <input
      key={`routine-name-${routine.id}-${routine.name}`}
      id={inputId}
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
    <PriorityStars
      value={routine.defaultPriority}
      onChange={onDefaultPriorityChange}
      groupLabel={`${routine.name} の優先度`}
      idPrefix={`routine-${routine.id}`}
    />
  </div>
  <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
    ... × 7
  </div>
  <div className="routine-card__actions">
    <button type="button" className="routine-card__actions__delete" onClick={onDelete}>
      削除
    </button>
  </div>
</Tag>
```

**After** (本 BL):

```tsx
<Tag className="routine-card">
  <div className="routine-card__header">
    <PriorityStars
      value={routine.defaultPriority}
      onChange={onDefaultPriorityChange}
      groupLabel={`${routine.name} の優先度`}
      idPrefix={`routine-${routine.id}`}
    />
  </div>
  <div className="routine-card__title">
    <label htmlFor={inputId} className="visually-hidden">ルーティン名</label>
    <input
      key={`routine-name-${routine.id}-${routine.name}`}
      id={inputId}
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
    ... × 7
  </div>
  <div className="routine-card__actions">
    <button type="button" className="routine-card__actions__delete" onClick={onDelete}>
      削除
    </button>
  </div>
</Tag>
```

差分:

- `.routine-card__header` 直下から visually-hidden label + name input を撤去.
  PriorityStars 単独だけが残る (= D-002 / 左空).
- 新規 `.routine-card__title` div を `.routine-card` 直下 (header 段の下) に挿入し,
  撤去した label + input を内包させる (= D-003).
- `.routine-card__day-checkboxes` / `.routine-card__actions` は無改修 (位置のみ 1 段下にスライド).
- PriorityStars の props (value / onChange / groupLabel / idPrefix) は無改修.
- input の props (key / id / type / className / defaultValue / placeholder / onBlur)
  は無改修. blur ハンドラ内の空文字復元ロジック (BL-070 D-002 / P-001 iii) も無改修.
- import 文 / `RoutineCardProps` 型 / 関数シグネチャ / default 値は無改修 (= NFR-2).

### CSS 再構築 (`routine-card.css`)

**変更するセレクタ**:

```css
.routine-card__header {
  /* BL-071 で確定した 5 宣言のうち justify-content のみを変更.
     PriorityStars 単独で右端固定するため flex-end に変更する (D-001).
     表示カードの header 直下子は PriorityStars のみ (= 単独要素) なので
     space-between では左寄せに振る舞う. flex-end で確実に右端固定する. */
  display: flex;
  align-items: center;
- justify-content: space-between;
+ justify-content: flex-end;
  gap: var(--space-sm);
  font-size: var(--font-size-h2);
}
```

**撤去するセレクタ**:

```css
/* D-001 (a): 基底 `.routine-card__header` が flex-end になったため
   起票カード側の override は不要 (= 同値の重複宣言になる). 完全撤去. */
- .routine-card--form .routine-card__header {
-   justify-content: flex-end;
- }
```

**維持するセレクタ (無改修)**:

- `.routine-card` (BL-071 / BL-052: flex column / gap: --space-md + visual 4 宣言).
- `.routine-card--form` (BL-072 / flex-direction: column / align-items: stretch).
- `.routine-card__title` (BL-072 D-003 / display: flex / align-items: center /
  font-size: var(--font-size-h2)) → **そのまま表示カードでも共用** (D-003).
- `.routine-card__day-checkboxes` (BL-068 / display: flex / flex-wrap: wrap / gap).
- `.routine-card__actions` (BL-061 / display: flex / align-items: center / gap).
- `.routine-card--form .routine-card__actions { justify-content: flex-end }` (BL-072 D-007 / 起票専用).
- `.routine-card__input` (BL-071 D-002 / font: inherit + font-size: var(--font-size-h2) +
  flex: 1 + ::placeholder color).
- `.routine-card__actions__delete` (空ルール).
- `.routine-card__submit` (空ルール).
- `.visually-hidden` (D-006 標準 9 宣言).

### 起票カード `<RoutineFormCard>` への副作用検証

CSS 変更により起票カードに影響が出ないことを確認する.

| 変更 | 起票カードへの影響 |
| --- | --- |
| `.routine-card__header { justify-content: space-between → flex-end }` | 起票カード header 直下子は PriorityStars 単独. 元々 `--form` modifier で `flex-end` を override していたので, 基底変更後も最終値は `flex-end` で同値. → **副作用なし** |
| `.routine-card--form .routine-card__header { justify-content: flex-end }` を撤去 | 基底が `flex-end` になったため override の有無に関わらず同値. → **副作用なし** |

つまり起票カードの `.routine-card__header` の computed `justify-content` は変更前も変更後も
`flex-end` で, 視覚配置に変化が出ない. AC-19 / AC-20 / AC-25 で機械検証する.

### 例外 / エラー処理

- 本 BL は presentational layer のみの変更で, mutation / 通信経路には触れない.
- 412 ConflictDialog は親 view (`routines-view`) 経由のため影響なし.
- BL-070 D-001 (同値 blur 短絡) / D-002 (空文字 blur 元値復元) のロジックは無改修.

## 重要な決定

### D-001: PriorityStars 単独の右端固定は `.routine-card__header { justify-content: flex-end }` に基底変更 + 起票側 override 撤去で実現

- 採用: 基底 `.routine-card__header { justify-content: space-between }` を
  `justify-content: flex-end` に変更し, 起票カード側の override
  `.routine-card--form .routine-card__header { justify-content: flex-end }` を完全撤去する.
- 根拠:
  - 表示・起票で同じ宣言 (`flex-end`) を共用でき, 視覚配置が単一の出典に閉じる.
  - 1 ブロック 1 宣言の変更で完結する (= 最小差分).
  - 起票カードへの副作用ゼロ (= 元々 override で `flex-end` を当てていた値が基底に上がるだけ).
  - ルーティンは project chip 概念を持たないため, 将来 header に 2 要素を入れる拡張の余地は
    本 BL のスコープ外 (= `flex-end` で問題が出る局面が想定されない).
- 代替案:
  - 候補 (b): 表示カード専用 modifier `.routine-card--display` 新設 → 表示カード JSX に
    `className="routine-card routine-card--display"` を追加する必要が出る + 起票側 `--form` と対の
    後付け修飾子になり過剰. 不採用.
  - 候補 (c): PriorityStars wrap div + `margin-left: auto` → 起票カードにも同じ wrap を
    入れないと DOM 構造に表示・起票で差が出る (= 段位置一致のゴールに反する) + 起票カード JSX
    改修が必要で NFR-5 抵触. 不採用.

### D-002: header 段の左側は「空」(= PriorityStars 単独)

- 採用: `.routine-card__header` の中身は `<PriorityStars />` のみ (左に何も置かない).
- 根拠:
  - 表示カードには起票カードと同様に「左に置くべき意味のある要素」が存在しない
    (= ルーティンは project chip 概念を持たない).
  - 起票カード (BL-072 D-001) と同じ判断を踏襲する.
- 代替案: placeholder `<div aria-hidden="true" />` を入れる案は意味不明な DOM が増えるため不採用
  (= `space-between` で 2 要素分の振る舞いをさせるためのトリックだが D-001 (a) で不要になる).

### D-003: `.routine-card__title` セレクタは表示カードでも起票カードと共用する (= 新規宣言なし)

- 採用: BL-072 で起票カードに新設した `.routine-card__title` ルールセット (3 宣言:
  `display: flex` / `align-items: center` / `font-size: var(--font-size-h2)`) を,
  本 BL でも 1 ブロックのまま表示カードに流用する.
- 根拠:
  - 表示カード / 起票カードで視覚言語を揃える方針 (= 本 BL のゴール) に沿う.
  - title 段の役割 (= name input 内包 + 親に font-size を持たせて input に `font: inherit` で
    継承させる) が表示・起票で同一.
  - `.routine-card__input` の `font: inherit; font-size: var(--font-size-h2)` (BL-071 D-002 /
    jsdom 折衷形) は表示・起票で既に共用済み. 本 BL では title 親も共用する.
- 代替案: 表示カード専用に `.routine-card__name` 等の別 class を新設する案は, BL-070 で
  `.routine-card__name` を撤去した方針を逆転することになる. 二重管理発生. 不採用.

### D-004: `.routine-card__header` の `font-size: var(--font-size-h2)` 宣言は維持する

- 採用: BL-071 で導入した `.routine-card__header { font-size: var(--font-size-h2) }` 宣言を
  本 BL でも撤去せず維持する.
- 根拠:
  - 本 BL 後 `.routine-card__header` 直下子は PriorityStars のみで, name input は title 段に
    移動するため `font-size` の継承先は無い (= dead-rule 化).
  - しかし起票カードと表示カードで同じ宣言を共用しているため, 撤去すると起票カードにも
    影響が出る (= 起票カードでは BL-072 D-003 で input に `font: inherit` を当てているが,
    起票カード header 直下子は PriorityStars 単独で input はない. つまり実害は無いが,
    本 BL のスコープを最小化するため宣言は維持する).
  - 副作用なし (= 視覚的に影響なし / specificity 順序にも影響なし).
- 代替案: 撤去案も技術的には可能だが, BL のスコープ外への変更を最小化する方針に反するため不採用.

### D-005: 表示カード root tag に modifier は追加しない

- 採用: `<RoutineCard>` の root 要素には `className="routine-card"` のみを当てる
  (= modifier `.routine-card--display` 等は新設しない).
- 根拠:
  - D-001 (a) 採用により表示カード専用 override が不要になるため modifier も不要.
  - 起票カードの `.routine-card--form` modifier は CSS の specificity 上で起票カード固有の
    override を分離する目的があるが, 表示カード側にはそういった必要が出ない.
- 代替案: 表示カード root に `.routine-card--display` を追加する案 = U-5 候補 (b) は
  D-001 (b) 採用と連動するが本 BL では (a) 採用のため不要.

### D-006: `.visually-hidden` ユーティリティは routine-card.css に既存維持

- 採用: 既存の `.visually-hidden` (9 宣言の標準パターン) を `routine-card.css` 内に維持.
- 根拠: 系統独立 (= ペア専用 CSS) の方針に従い task-card.css / project-card.css と
  再定義状態のまま. BL-070 / BL-071 / BL-072 で確立した方針を引き継ぐ.

### D-007: `<RoutineCard>` の props 型・引数 default 値は無改修

- 採用: `RoutineCardProps` の 6 prop シグネチャと default 値 (`as = "li"`) を変更しない.
- 根拠:
  - 親 view (`routines-view.tsx`) の `<RoutineCard ... />` 呼び出しを無改修にするため.
  - 既存テスト (`routine-card-component.test.tsx` BL-061 / `inline-edit-all-cards.test.tsx`
    BL-070 等) の prop 型 assert と重複する変更を避ける.

### D-008: BL-071 で導入した「header 内 name input」関連 CSS / JSX の撤去範囲

- 採用範囲 (撤去するもの):
  - JSX 側: `.routine-card__header` 直下から `<label htmlFor=... className="visually-hidden">`
    + `<input className="routine-card__input">` を撤去 → `.routine-card__title` 直下に移動.
  - CSS 側: `.routine-card__header { justify-content: space-between }` を `flex-end` に変更
    (= 値の変更 / 宣言自体は維持).
  - CSS 側: `.routine-card--form .routine-card__header { justify-content: flex-end }` を完全撤去.
- 維持するもの:
  - `.routine-card__input` のルールセット全体 (font: inherit + font-size + flex: 1 + placeholder).
  - `.routine-card__header` の他 4 宣言 (display: flex / align-items: center / gap / font-size).
  - `<label className="visually-hidden">` の元テキスト "ルーティン名" と htmlFor 値 `routine-name-{id}`.
  - `<input>` の id 値 `routine-name-{id}`, `defaultValue={routine.name}`, `key` 設定,
    `onBlur` ハンドラ内の空文字復元ロジック.

### D-009: 起票カード `<RoutineFormCard>` 不変の検証

- 採用: 起票カードの DOM 構造 / CSS / 視覚配置を無改修で維持する.
- 根拠:
  - CSS 変更 (`.routine-card__header { justify-content: flex-end }` 基底化 + 起票 override 撤去)
    の起票カードへの影響は「`flex-end` が override 経由 → 基底経由」になるだけで computed style
    は同値.
  - 起票カードの JSX は本 BL のスコープ外 (NFR-5).
- 検証: AC-19 (起票カード 4 段構造の不変) / AC-20 (起票 input font-size の不変) / AC-25
  (起票 header computed justify-content の不変) で機械検証.

### D-010: 進行順

- カード本体 (`routine-card.tsx`) の JSX 再構築と CSS の同時更新を 1 PR で行う.
- routines-view / 親 view への変更なし (NFR-2 / D-007).
- 既存テスト追従は test-designer ステップで一括対応.
- 検証順は (a) 失敗テスト追加 (b) 実装 (c) 既存テスト追従 (d) 全件 green 確認.

## リスク / 代替案

- **リスク R-1**: jsdom の getComputedStyle が表示カード `.routine-card__title` 親と input の
  継承を正しく解決しないと AC-11 (computed font-size 20px) が失敗する可能性.
  - 緩和: BL-072 D-003 で起票カードに対して同機構 (`.routine-card__title { font-size: 20px }` +
    `.routine-card__input { font-size: 20px }` の二重宣言) が既に passing 済み.
    表示カードでも同じ機構を流用するため再現性が高い.
  - 代替: もし jsdom で失敗するなら AC-11 を spec から外し CSS 直読み assert のみで担保する.

- **リスク R-2**: `.routine-card__header { justify-content: flex-end }` への基底変更で,
  起票カード以外の利用箇所 (= 表示カード以外で `.routine-card__header` を流用している view) に
  副作用が出る.
  - 緩和: grep 確認の結果 `.routine-card__header` は `<RoutineCard>` (表示) と
    `<RoutineFormCard>` (起票) の 2 箇所でしか使われない. 他 view には流用なし.
    tasks.md 1.1 で再確認する.

- **リスク R-3**: 既存テスト 6 ファイル (BL-061 / BL-068 / BL-069 / BL-070 / BL-071 / BL-072) に
  `.routine-card__header` 内子要素や DOM 階層を assert している箇所があれば追従が必要.
  - 緩和: tasks.md 1.2 の事前調査ステップで grep 確認 → 機械的に書き換え.
    role + accessibleName ベースの assert は無修正で通る想定.

- **リスク R-4**: BL-070 D-002 の空文字 blur 復元ロジックが新 DOM 階層
  (input が `.routine-card__title` 配下になる) で破綻する可能性.
  - 緩和: 復元ロジックは `e.currentTarget.value = routine.name` で DOM 階層に依存しない
    (= input 要素単独の操作). 新階層でもそのまま動く. AC-13 で機械検証.

- **リスク R-5**: routines-view.tsx の親 handler (`handleNameBlur` 等) が DOM 階層に依存した
  selector / event 配線をしている場合, 本 BL の階層変更で破綻する可能性.
  - 緩和: routines-view は `<RoutineCard ... onNameBlur={handleNameBlur}>` の prop drilling で
    繋がっており, DOM 階層には依存しない. 無改修で動く想定.

### 代替案 (採用しなかったもの)

- **代替 A**: 表示カードを TaskCard と同じ 3 段構造のまま据え置き, 起票カードを 3 段に戻す
  (= BL-072 の差し戻し).
  → 不採用. user が BL-072 で「起票カードの優先度を右上に置きたい」と確定済みのため逆転は不可.
  さらに「name 段が起票で 2 段目になっている」事実は user が認識した上で齟齬指摘しているので
  本 BL のスコープ.

- **代替 B**: 表示カードに `<div className="routine-card__header__placeholder" />` を
  header 左に挿入して `space-between` で 2 要素配置に見せる.
  → 不採用. 意味不明な DOM が増える / アクセシビリティ上不要な要素.

- **代替 C**: TaskCard 表示側にも今後「title 段化」を波及させて系統間で統一する案.
  → 本 BL のスコープ外. TaskCard は project chip があるため header に意味があり同列に語れない.
  別 BL で議論する場合は新規 BL を起票する.

- **代替 D**: 共通 button (BL-067) を本 BL で先取りして「削除」 button にも適用する.
  → 不採用. BL-067 (Todo) のスコープを侵食する.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト

- **新規 `web/__tests__/routine-card-align-with-form.test.tsx`**: AC-1 〜 AC-25 を網羅.
  - **CSS 直読み** (file read + 正規表現):
    - AC-6: `.routine-card__title` ルールセットの 3 宣言 (BL-072 D-003) が無改修で残存.
    - AC-7: `.routine-card__header` ルールセットの `justify-content: flex-end` が宣言される
      (= 本 BL で `space-between` から変更).
    - AC-8 (D-001 (a) 採用時): `.routine-card--form .routine-card__header` の override が完全撤去されている.
    - AC-9: `.routine-card` 基底の 7 宣言 (BL-071 / BL-052) が無改修.
    - AC-10: `.routine-card--form` 系セレクタ (起票専用) が無改修で維持.
  - **jsdom DOM レンダ**:
    - AC-1: `.routine-card` 直下 `.routine-card__header` に PriorityStars 単独が含まれる.
    - AC-2: `.routine-card__title` に visually-hidden label + name input が含まれる.
    - AC-3: `.routine-card` 直下に 4 段が順に並ぶ.
    - AC-4: header 直下子要素が PriorityStars のみ.
    - AC-5: 「削除」 button が `.routine-card__actions` 直下に位置.
    - AC-12 / AC-13 / AC-14: blur 経路 (通常 / 空文字復元 / 同値).
    - AC-15: 曜日 checkbox click で onDaysOfWeekChange.
    - AC-16: PriorityStars click で onDefaultPriorityChange.
    - AC-17: 削除 button click で onDelete.
    - AC-18: routine.name 変更時の input 同期 (key 再マウント).
    - AC-19: 起票カード `<RoutineFormCard>` の 4 段構造の不変.
    - AC-21 / AC-22: a11y (visually-hidden label htmlFor + entity id suffix /
      PriorityStars groupLabel + idPrefix).
    - AC-23 / AC-24: 表示 + 起票同時レンダ時の id 衝突なし.
  - **getComputedStyle** (jsdom + vitest css: true):
    - AC-11: 表示 name input の computed font-size = 20px.
    - AC-20: 起票 name input の computed font-size = 20px (= BL-072 維持).
    - AC-25: 起票 `.routine-card__header` の computed justify-content = flex-end (= 視覚不変).

### 既存テスト追従

- `routine-card-component.test.tsx` (BL-061):
  - 表示カードの DOM 階層 assert が `.routine-card__header` 内 name input を見ている箇所が
    あれば `.routine-card__title` 内に書き換え.
- `routine-card-edit-fields.test.tsx` (BL-068):
  - 表示カードの DOM 階層 assert があれば追従.
- `routine-card-edit-priority.test.tsx` (BL-069):
  - 同上.
- `inline-edit-all-cards.test.tsx` (BL-070):
  - 表示カード input の親 (= `.routine-card__header` ではなく `.routine-card__title`) に
    依存する assert があれば追従. blur ロジック自体の assert は無修正で通る.
- `routine-card-header-layout.test.tsx` (BL-071):
  - AC-1 〜 AC-9 で「`.routine-card__header` 内に name input + PriorityStars が並ぶ」と
    assert している部分を本 BL の新構造 (header に PriorityStars 単独 / title 段に name input)
    に追従して書き換え.
- `routine-form-card-header-layout.test.tsx` (BL-072):
  - AC-7 で「`.routine-card__header` の `justify-content: space-between` が維持される」と
    assert している部分を `justify-content: flex-end` に書き換え.
  - AC-8 で「`.routine-card--form .routine-card__header` override が
    `justify-content: flex-end` のみ宣言」と assert している部分を「override 完全撤去」に書き換え.
  - AC-11 / AC-12 (起票カード不変) は本 BL でも維持 (= 副作用なし) なので無改修.

### E2E

- `e2e/routines.spec.ts` (BL-026 / BL-061): role + accessibleName ベースのため無修正で通る想定.
- `e2e/routine-card-edit-fields.spec.ts` (BL-068): 同上.
- `e2e/routine-card-edit-priority.spec.ts` (BL-069): 同上.
- `e2e/conflict-handling.spec.ts`: 412 経路の確認.
- `e2e/a11y.spec.ts`: violations 0 件維持.

### 検証コマンド

- `npm test -w web` 全件 green.
- `npx playwright test` 全件 green (= BL-072 baseline からの増減 0).
- `npm run lint && npm run typecheck` 全件 green.
- `e2e/a11y.spec.ts` で a11y violations 0 件.
