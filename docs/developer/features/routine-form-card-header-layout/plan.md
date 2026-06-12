# 設計・実装計画: RoutineFormCard レイアウト刷新

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`<RoutineFormCard>` の DOM 構造を **4 段ゾーン**
(`.routine-card__header` (PriorityStars 単独 / 右端固定) /
 `.routine-card__title` (新設 / name input + visually-hidden label) /
 `.routine-card__day-checkboxes` (曜日 7 件 / 既存セレクタ流用) /
 `.routine-card__actions` (「追加」 button / 既存セレクタ流用 + 右寄せ override))
に組み替える. 表示カード `<RoutineCard>` で BL-071 が確立した
`.routine-card__header` の 5 宣言 (display: flex / align-items: center /
justify-content: space-between / gap / font-size: --font-size-h2) を **共用** することで,
起票カードでも PriorityStars が右端に並ぶ視覚言語が表示カードと統一される.
name input は新設 `.routine-card__title` 段に置き, `font-size: var(--font-size-h2)` +
`font: inherit` の二重宣言 (BL-071 D-002 の jsdom 折衷形と同型) で 20px に揃える.
旧 `.routine-card__form-row` / `--name` / `--options` セレクタは CSS / DOM から完全撤去する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| ドメイン | なし |
| モジュール (web) | `web/src/ui/routine-card/routine-form-card.tsx` (JSX 再構築) / `web/src/ui/routine-card/routine-card.css` (`.routine-card__title` 新設 + `.routine-card__form-row` 系撤去 + `.routine-card--form .routine-card__actions` override 追加) |
| UI | `<RoutineFormCard>` のみ. `<RoutineCard>` (表示) / routines-view / projects-view / today-view / tomorrow-view / focus-view 無改修. |
| テスト | 既存 `routine-card-component.test.tsx` (BL-061) / `routine-card-edit-fields.test.tsx` (BL-068) / `routine-card-edit-priority.test.tsx` (BL-069) / `routine-card-header-layout.test.tsx` (BL-071) で起票カードの DOM 階層 / `.routine-card__form-row` 系 assert があれば追従. 新規 `routine-form-card-header-layout.test.tsx` を追加. |
| E2E | role + accessibleName ベースのため無修正で通る想定. `e2e/routines.spec.ts` / `e2e/routine-card-edit-fields.spec.ts` / `e2e/routine-card-edit-priority.spec.ts` を全件 green 確認. |

## 設計詳細

### JSX 再構築 (`routine-form-card.tsx`)

**Before** (現状 / BL-068 段階):

```tsx
<form className="routine-card routine-card--form" aria-label={formAriaLabel} onSubmit={onSubmit}>
  <div className="routine-card__form-row routine-card__form-row--name">
    <label htmlFor={inputId} className="visually-hidden">ルーティン名</label>
    <input id={inputId} type="text" className="routine-card__input" value={name}
           placeholder="ルーティン名" onChange={(e) => onNameChange(e.target.value)} required />
    <button type="submit" className="routine-card__submit">追加</button>
  </div>
  <div className="routine-card__form-row routine-card__form-row--options">
    <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
      ... × 7
    </div>
    <PriorityStars value={defaultPriority} onChange={onDefaultPriorityChange}
                   groupLabel="優先度" idPrefix="routine-create" />
  </div>
</form>
```

**After** (本 BL):

```tsx
<form className="routine-card routine-card--form" aria-label={formAriaLabel} onSubmit={onSubmit}>
  <div className="routine-card__header">
    <PriorityStars value={defaultPriority} onChange={onDefaultPriorityChange}
                   groupLabel="優先度" idPrefix="routine-create" />
  </div>
  <div className="routine-card__title">
    <label htmlFor={inputId} className="visually-hidden">ルーティン名</label>
    <input id={inputId} type="text" className="routine-card__input" value={name}
           placeholder="ルーティン名" onChange={(e) => onNameChange(e.target.value)} required />
  </div>
  <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
    ... × 7
  </div>
  <div className="routine-card__actions">
    <button type="submit" className="routine-card__submit">追加</button>
  </div>
</form>
```

差分:

- 外側 2 段の `.routine-card__form-row` 系ラッパを完全撤去 (= D-004).
- `.routine-card__header` を新設し PriorityStars 単独を内包 (D-001 で「左空」採用 / D-002 で表示カードと共用).
- `.routine-card__title` を新設し visually-hidden label + name input を内包 (D-003).
- `.routine-card__day-checkboxes` は `.routine-card__form-row--options` の中から `.routine-card` 直下に位置移動.
  既存 className / a11y (role + aria-label) は無改修 = 引き続き曜日 7 checkbox が wrap 横並びで描画される.
- `.routine-card__actions` を新設し「追加」 submit button 単独を内包 (D-005).
- onSubmit / onNameChange / onToggleDay / onDefaultPriorityChange / inputId / formAriaLabel /
  required / placeholder / className=`routine-card__input` / className=`routine-card__submit` は無改修.
- import 文 / Props 型 / 関数シグネチャは無改修 (= NFR-2).

### CSS 再構築 (`routine-card.css`)

**追加するセレクタ**:

```css
.routine-card__title {
  /* D-003: 起票カードに新設. タスクカード `.task-card__title` と同名同役割.
     name input のフォントを TaskFormCard と同イディオムで親から継承させる. */
  display: flex;
  align-items: center;
  /* AC-10 (jsdom 対応): TaskCard / RoutineCard (BL-071) と同じ折衷形.
     親に font-size を当てると同時に input にも明示宣言する (D-003 注釈参照). */
  font-size: var(--font-size-h2);
}

.routine-card--form .routine-card__actions {
  /* D-007: 起票カードの「追加」 button を右寄せ.
     表示カード (= 削除 button) の `.routine-card__actions` は無 override
     (= flex 自然順 = 左寄せ) のままにする. */
  justify-content: flex-end;
}
```

**撤去するセレクタ**:

```css
/* D-004: dead-rule 化を防ぐため完全撤去 */
.routine-card__form-row { ... }
/* .routine-card__form-row--name / --options は元々宣言が無いため修正不要 (現状 CSS には未定義) */
```

> 注: 現行 `routine-card.css` (本リポジトリの該当ファイル) には `.routine-card__form-row` の
> ルールセットは宣言されているが, `.routine-card__form-row--name` /
> `.routine-card__form-row--options` の modifier 単独のルールセットは宣言されていない.
> 撤去対象は `.routine-card__form-row` の 1 ブロックのみ.

**維持するセレクタ (無改修)**:

- `.routine-card` (BL-071 D-007 で flex column / gap: --space-md に変更済).
- `.routine-card--form` (flex-direction: column / align-items: stretch / AC-9).
- `.routine-card__header` (BL-071 D-001 で 5 宣言確定 / AC-7).
- `.routine-card__day-checkboxes` (BL-068 / display: flex / flex-wrap: wrap / gap).
- `.routine-card__actions` (BL-061 / display: flex / align-items: center / gap).
- `.routine-card__input` (BL-071 D-002 / font: inherit + font-size: var(--font-size-h2) /
  flex: 1 / placeholder color).
- `.routine-card__submit` (空ルール).
- `.visually-hidden` (D-008 標準 9 宣言).

### header 右端固定の機構 (D-006)

`.routine-card__header` の既存宣言 `justify-content: space-between` は **要素が 2 個以上** の
ときに左右両端固定として機能する. 起票カードでは PriorityStars 1 個しか内包しないため,
flex の挙動上「単独要素は justify-content の値に従って配置」される.

> CSS 仕様 (flexbox level 1) では `justify-content: space-between` 単独要素時の挙動は
> 「`flex-start` 相当」と規定される (= 左寄せ).

そのため空のままだと **PriorityStars が左に寄ってしまう**. 対策候補:

- 候補 (a): header 左に **不可視 placeholder** (`<span aria-hidden="true" />`) を置く.
  → DOM が増えて意図不明. 不採用.
- 候補 (b): `.routine-card__header > *:only-child { margin-left: auto }` で
  単独要素時にだけ右寄せにする.
  → CSS specificity が複雑. 一般的でない. 不採用候補.
- 候補 (c): 起票カード PriorityStars wrap div に `margin-left: auto` を持たせる.
  → 明示的だが TaskCard の BL-063 D-001 と同イディオム. 採用候補.
- 候補 (d): `.routine-card--form .routine-card__header { justify-content: flex-end }`
  で起票カードのみ override.
  → 簡潔. 表示カードと 1 宣言だけ違うため意図が明確. **第一候補**.

**採用 = 候補 (d)** (= D-002 で「共用」と言いつつ 1 行だけ override する形). D-002 と D-006 の
組合せで「表示カードと起票カードで `space-between` vs `flex-end` の差を意識する」記述になる.

```css
.routine-card--form .routine-card__header {
  /* D-006: 起票カードは PriorityStars 単独. space-between では単独要素は左に寄るため
     override で右端固定にする. その他の宣言 (display: flex / align-items: center / gap /
     font-size) は基底 `.routine-card__header` から継承される. */
  justify-content: flex-end;
}
```

> 注: 本 override は spec REQ-2 (「`.routine-card__header` セレクタは表示カードと共用」) と
> 形式的には抵触するため, spec の文言を「共用しつつ起票カード側で `justify-content` のみ
> override する」に読み替える. tasks 4.5 で spec REQ-2 の脚注を追加する.

### 例外 / エラー処理

- 本 BL は presentational layer のみの変更で, mutation / 通信経路には触れない.
- 412 ConflictDialog は親 view (`routines-view`) 経由のため影響なし.
- form の `required` 属性によるブラウザ標準のフォーム検証は無改修.

## 重要な決定

### D-001: header 段の左側は「空」(= PriorityStars 単独)

- 採用: `.routine-card__header` の中身は `<PriorityStars />` のみ (左に何も置かない).
- 根拠:
  - 起票カードには表示カードの「project chip」相当が無く, 左に置くべき意味のある要素が存在しない.
  - 「ルーティン作成」等の見出し span を置く案もあるが, ルーティン以外のカード (TaskFormCard /
    ProjectFormCard) でそのような見出しを持つ慣行は無い (= NFR-3 / 視覚的に不要).
  - 「追加」 button を左に置く案は D-005 の「actions 段独立配置」と矛盾するため不採用.
- 代替案: header 左に `<span aria-hidden="true" />` で placeholder を置くと
  `space-between` が 2 要素として機能して右端固定が自然に実現するが, 意味不明な DOM が
  入るため D-006 で別経路 (override) を採用.

### D-002: `.routine-card__header` のルールセットは表示カードと共用する (= 同名で 1 つだけ宣言)

- 採用: BL-071 で確定した `.routine-card__header` の 5 宣言 (display: flex /
  align-items: center / justify-content: space-between / gap: --space-sm /
  font-size: --font-size-h2) を, 本 BL でも 1 ブロックのまま維持し起票カードに流用する.
- 根拠:
  - 表示カード / 起票カードで視覚言語を揃える方針 (= 本 BL のゴール) に沿う.
  - 1 ブロックの宣言を双方で使うことで「ヘッダの視覚仕様」が単一の出典 (= `.routine-card__header`)
    に閉じる. 将来の保守で「片方にだけ反映漏れ」のリスクを避ける.
- 補足: D-006 で起票カード側のみ `justify-content` を上書きする 1 宣言が必要になるため
  完全な「共用」ではないが, 基底の 5 宣言は変更しない.

### D-003: name input の font-size 統一は `.routine-card__title` + `.routine-card__input` の二重宣言で実現

- 採用: 新設 `.routine-card__title { font-size: var(--font-size-h2) }` に加え,
  既存 `.routine-card__input { font: inherit; font-size: var(--font-size-h2) }`
  (BL-071 D-002 の jsdom 折衷形 / 維持) で **二重宣言** する.
- 根拠:
  - 親 `.routine-card__title` に font-size を当てて input に `font: inherit` を継承させる
    のが TaskFormCard / RoutineCard と同イディオム.
  - jsdom の getComputedStyle は CSS shorthand `font` を longhand に展開しないため,
    入力 input にも明示宣言を残す折衷形が BL-071 で確立済み. その方針を本 BL でも踏襲.
- 代替案: 入力 input にのみ `font-size: var(--font-size-h2)` を当てる案もあるが,
  TaskCard / RoutineCard と機構を揃えるため不採用.

### D-004: `.routine-card__form-row` 系セレクタは CSS / DOM から完全撤去

- 採用: `.routine-card__form-row` の宣言ブロックを `routine-card.css` から削除.
  JSX 側でも `.routine-card__form-row` / `.routine-card__form-row--name` /
  `.routine-card__form-row--options` の className 付与を撤去する.
- 根拠:
  - 新構造 (4 段) で `.routine-card__form-row` は使われない → 残すと dead-rule.
  - 他カード系 (BL-070 で `.project-card__form-inline` / `.routine-card__form-inline` を完全撤去 /
    BL-071 で `.routine-card__main` を完全撤去) と同じ撤去方針.
- AC-4 / AC-8 で assert する.

### D-005: 「追加」 submit button は独立した actions 段 (`.routine-card__actions`) に配置

- 採用: 新設 `.routine-card__actions` div の直下に `<button type="submit" className="routine-card__submit">追加</button>` を置く. name input と同じ段には置かない.
- 根拠:
  - 表示カード (= 「削除」 button が `.routine-card__actions` に置かれる / BL-071) と
    段名共用することで, 4 段の視覚言語が「header / title / day-checkboxes / actions」と
    統一される.
  - タスク起票カード `<TaskFormCard>` (BL-059) も 3 段の最終段 `.task-card__actions` に
    「追加」を置いており, 起票カードの慣行と整合する.
  - title 段に「追加」 button を併置する案は, `.routine-card__title` の `font-size: 20px` が
    button にも継承され見栄えが悪い (button の font-size を別 override する必要が出る).
- 代替案: title 段に併置 = U-3 (b) は不採用.

### D-006: 起票カード header の右端固定は `.routine-card--form .routine-card__header { justify-content: flex-end }` で実現

- 採用: 起票カードの header に対してのみ `justify-content: flex-end` を override する.
- 根拠:
  - 表示カードでは header に 2 要素 (input + PriorityStars) が並び `space-between` で
    左右に分かれる.
  - 起票カードでは header に 1 要素 (PriorityStars 単独) しか無く, `space-between` は
    単独要素時に「flex-start (左寄せ)」相当に振る舞う仕様のため, override しないと
    PriorityStars が左に寄る.
  - `flex-end` override は 1 宣言だけで意図が明確.
- 代替案:
  - PriorityStars wrap に `margin-left: auto` (TaskCard BL-063 D-001 イディオム) を持たせる案:
    複数要素併存時にも振る舞いが安定するが, header の中身が PriorityStars 1 つしか無いため
    margin 経由は冗長. 不採用.
  - header 左に `<span aria-hidden="true" />` placeholder を置く案: DOM が増える. 不採用.

### D-007: 起票カードの actions 段は `.routine-card--form .routine-card__actions { justify-content: flex-end }` で右寄せ

- 採用: 起票カードの actions 段にのみ `justify-content: flex-end` を override.
  表示カードの actions 段は基底のまま (= flex 自然順 = 左寄せ).
- 根拠:
  - user の希望 (起票カードでは「追加」を右端に置きたい / U-5 候補 b) に従う.
  - 表示カード (= 「削除」 button) の現状配置 (左寄せ) は別 BL での議論余地はあるが
    本 BL では不変として扱う (= 副作用なし).
- AC-5 はあくまで「actions 段に「追加」が置かれる」までしか規定しないが,
  目視確認 (tasks 4.4) で右端配置を確認する.

### D-008: `.visually-hidden` ユーティリティは routine-card.css に既存維持

- 採用: 既存の `.visually-hidden` (9 宣言の標準パターン) を `routine-card.css` 内に維持.
- 根拠: 系統独立 (= ペア専用 CSS) の方針に従い task-card.css / project-card.css と
  再定義状態のまま. BL-071 / BL-070 で確立した方針を引き継ぐ.

### D-009: `<RoutineFormCard>` の props 型・引数 default 値は無改修

- 採用: `RoutineFormCardProps` の 9 prop シグネチャと default 値
  (`inputId = "routine-name"` / `formAriaLabel = "ルーティン作成フォーム"`) を変更しない.
- 根拠:
  - 親 view (`routines-view.tsx`) の `<RoutineFormCard ... />` 呼び出しを無改修にするため.
  - 既存テスト (`routine-card-component.test.tsx` BL-061 等) の prop 型 assert と
    重複する変更を避ける.

### D-010: 起票カード input フォントサイズの 20px 化は BL-071 D-010 を継続適用

- 採用: `<RoutineFormCard>` の name input が `--font-size-h2` (= 20px) で描画されることを
  本 BL でも維持する (= BL-071 で既に user 確認済).
- 根拠: 表示と起票の typography 統一. 本 BL の方針 (視覚言語統一) と一致.

## リスク / 代替案

- **リスク R-1**: jsdom の getComputedStyle が `.routine-card__title` 親と input の継承を
  正しく解決しないと AC-10 (computed font-size 20px) が失敗する可能性.
  - 緩和: D-003 の二重宣言 (`.routine-card__title { font-size: var(--font-size-h2) }` +
    `.routine-card__input { font-size: var(--font-size-h2) }`) で BL-071 D-002 同様に
    jsdom 対応する. BL-071 AC-9 が同じ機構で passing 済みのため再現性が高い.
  - 代替: もし jsdom で失敗するなら AC-10 を spec から外し AC-6 (CSS 直読みでの宣言 assert)
    のみで担保する.

- **リスク R-2**: `.routine-card--form .routine-card__header` の override 追加で
  表示カード `.routine-card__header` の視覚に副作用が出る (= specificity 順序の事故).
  - 緩和:
    - override は `.routine-card--form .routine-card__header` の **クラス連結セレクタ** で
      specificity は (0, 2, 0). 表示カードは `.routine-card__header` 単独 = (0, 1, 0).
    - 表示カードには `.routine-card--form` modifier が付かないため override は適用されず副作用なし.
  - AC-11 / AC-12 で表示カードの不変性を直接 assert する.

- **リスク R-3**: 既存 routine-card 系テスト 4 ファイル (BL-061 / BL-068 / BL-069 / BL-071) に
  `.routine-card__form-row` セレクタ依存の assert があれば全件追従が必要.
  - 緩和: tasks.md の事前調査ステップで grep 確認 → 機械的に書き換え.
    role + accessibleName ベースの assert は無修正で通る想定.

- **リスク R-4**: `<RoutineFormCard>` の DOM 内 `.routine-card__day-checkboxes` の親が
  `.routine-card__form-row--options` から `.routine-card` 直下に変わることで, 既存 CSS
  (= `.routine-card__day-checkboxes { display: flex; flex-wrap: wrap; gap: var(--space-sm) }`)
  の挙動に親に依存した差異が出る可能性.
  - 緩和: `.routine-card__day-checkboxes` の現状ルールは親 flex に依らないため変化しない.
    視覚の差は base padding/gap の積算で多少変わる可能性があるが NFR-3 (shadow 等) に
    抵触しない範囲なら受容する. 目視確認で問題が無いことを tasks 4.4 で確認.

### 代替案 (採用しなかったもの)

- **代替 A**: 起票カード専用に新規セレクタ
  `.routine-card__form-header` / `.routine-card__form-title` / `.routine-card__form-actions` を
  新設し, 表示カードと完全分離する.
  → 不採用. 視覚言語統一の方針に反する (= 同じ役割の段は同じ class 名で表現する).
  保守時に「表示と起票で別 class を引きあてる」二重管理が発生する.

- **代替 B**: `.routine-card__form-row--name` を残し, その中で `.routine-card__header` を
  内包する形にする.
  → 不採用. DOM 階層が深くなり, 表示カードと階層構造が揃わない.

- **代替 C**: 「追加」 button を `.routine-card__title` 段に併置する (= 現状の「name 段に同居」を
  残す).
  → 不採用. D-005 / U-3 候補 (b) として却下済.

- **代替 D**: 共通 button (BL-067) を本 BL で先取りして導入し,
  `<button className="button button--primary">追加</button>` 等に置き換える.
  → 不採用. BL-067 (Todo) のスコープを侵食する.

- **代替 E**: header 左に「ルーティン作成」 span を置く.
  → 不採用. 他の起票カード (TaskFormCard / ProjectFormCard) に見出し span を持つ慣行が無い.
  視覚的にもタイトル冗長.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト

- **新規 `web/__tests__/routine-form-card-header-layout.test.tsx`**: AC-1 〜 AC-23 を網羅.
  - **CSS 直読み** (file read + 正規表現):
    - AC-6: `.routine-card__title` ルールセットに `font-size: var(--font-size-h2)` が宣言されている.
    - AC-7: `.routine-card__header` の BL-071 5 宣言が無改修で維持されている.
    - AC-8: `.routine-card__form-row` 系セレクタの宣言ブロックが完全撤去されている.
    - AC-9: `.routine-card--form` の `flex-direction: column` / `align-items: stretch` 維持.
    - (追加) `.routine-card--form .routine-card__header { justify-content: flex-end }` が宣言されている (D-006).
    - (追加) `.routine-card--form .routine-card__actions { justify-content: flex-end }` が宣言されている (D-007).
  - **jsdom DOM レンダ**:
    - AC-1: form 直下 `.routine-card__header` に PriorityStars (radiogroup) が含まれる.
    - AC-2: `.routine-card__title` に label + name input が含まれる.
    - AC-3: form 直下に 4 段が順に並ぶ.
    - AC-4: `.routine-card__form-row*` 系の要素が存在しない.
    - AC-5: 「追加」 button が `.routine-card__actions` 直下に位置.
    - AC-11 / AC-12: 表示カード `<RoutineCard>` の DOM 構造・font-size に副作用なし.
    - AC-13 〜 AC-18: 既存挙動 (onSubmit / onNameChange / onToggleDay /
      onDefaultPriorityChange / daysOfWeek 表示 / required).
    - AC-19 / AC-20 / AC-21 / AC-22: a11y (aria-label / label htmlFor / PriorityStars
      groupLabel + idPrefix / id 衝突なし).
    - AC-23: header 直下子要素が PriorityStars のみ.
  - **getComputedStyle** (jsdom + vitest css: true):
    - AC-10: name input の computed font-size = 20px.

### 既存テスト追従

- `routine-card-component.test.tsx` (BL-061):
  - `.routine-card__form-row` / `.routine-card__form-row--name` / `.routine-card__form-row--options`
    セレクタ依存の assert があれば「新 DOM 階層 (`.routine-card__header` / `.routine-card__title` /
    `.routine-card__day-checkboxes` / `.routine-card__actions` の 4 段)」に書き換え.
- `routine-card-edit-fields.test.tsx` (BL-068):
  - 起票カードの DOM 階層に依存する assert があれば追従.
- `routine-card-edit-priority.test.tsx` (BL-069):
  - 起票カードの PriorityStars の親要素を `.routine-card__form-row--options` と
    決め打ちしている assert があれば `.routine-card__header` に書き換え.
- `routine-card-header-layout.test.tsx` (BL-071):
  - AC-10 / AC-11 (起票カードの不変性) が「`.routine-card__form-row--name` /
    `.routine-card__form-row--options` の 2 段が存在する」と書かれている部分を
    本 BL の新構造 (4 段) に追従して書き換え.

### E2E

- `e2e/routines.spec.ts` (BL-026 / BL-061): role + accessibleName ベースのため無修正で通る想定. 確認のみ.
- `e2e/routine-card-edit-fields.spec.ts` (BL-068): 同上.
- `e2e/routine-card-edit-priority.spec.ts` (BL-069): 同上.
- `e2e/a11y.spec.ts`: violations 0 件維持.

### 検証コマンド

- `npm test -w web` 全件 green.
- `npx playwright test` 全件 green (= BL-071 baseline からの増減 0).
- `npm run lint && npm run typecheck` 全件 green.
- `e2e/a11y.spec.ts` で a11y violations 0 件.
