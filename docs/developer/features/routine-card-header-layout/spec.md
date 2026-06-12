# 仕様: RoutineCard ヘッダレイアウト刷新 (TaskCard と同じ 3 段構造に揃える)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-071
- 依存: BL-061 (routine-card-component) / BL-068 (routine-card-edit-fields) / BL-069 (routine-card-edit-priority) / BL-070 (inline-edit-all-cards)
- 参照: BL-059 (task-card-component) / BL-063 (task-card-hotfix) — TaskCard と同じイディオムを採用するため

## 背景 / 課題

user 評価により以下 2 点が指摘されている.

1. **優先度の位置が違う**: モックアップ通りなら優先度 (PriorityStars) はカード右上にあるべきだが,
   現状 `<RoutineCard>` では `.routine-card__main` (flex column) の 3 番目に置かれ, 名前 / 曜日の下に並ぶ.
2. **ルーティン名が小さい**: 現状 name input には font-size 指定が無く, 親 body 既定 (= 16px) で描画される.
   TaskCard は BL-059 V-4 / V-7 で `--font-size-h2` (= 20px) を持ち入力 input にも `font: inherit` を当てている.
   ルーティン名はタスク名と同じ「カードのタイトル」相当の情報量なので, タイポグラフィを揃えるべき.

つまり「RoutineCard が TaskCard と同じ視覚言語になっていない」ことが原因. 機構そのものは TaskCard で確立済み
(`.task-card__header { justify-content: space-between }` で chip / 優先度を左右に分け, `.task-card__title` で
`--font-size-h2` を当てる) なので, 同じイディオムを `<RoutineCard>` に移植する.

## ゴール / 非ゴール

- ゴール:
  - `<RoutineCard>` (表示時) のレイアウトを TaskCard と同じ 3 段ゾーン構造に統一する.
  - name input のフォントサイズを `--font-size-h2` で TaskCard と統一する.
  - PriorityStars をカード右上に配置する.
  - 既存挙動 (BL-070 の blur 書き戻し / BL-068・BL-069 の即時 PATCH / 削除 / 起票カードの体裁) を回帰させない.
- 非ゴール:
  - `<RoutineFormCard>` (起票カード) のレイアウト変更. 起票カードは `.routine-card--form` modifier で現状の縦並びを維持する.
  - TaskCard / ProjectCard / RoutineFormCard / `routines-view` のロジック変更.
  - `WebRoutineRepository` / `UpdateRoutineCommand` / domain / server / API への変更.
  - tokens.css (デザイントークン) への変更. `--font-size-h2` 等は既存値をそのまま参照する.
  - 共通 button (BL-067) の導入.
  - shadow / hover / transition / animation の追加 (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
  - PriorityStars / project-chip / visually-hidden ユーティリティの API・スタイル変更.
  - 曜日 7 checkbox 群 (`.routine-card__day-checkboxes`) の見た目変更. 場所 (header の下) のみ移動する.
  - 「削除」 button (`.routine-card__actions`) の場所・テキスト・ハンドラ変更.

## 要件

### 機能要件

- **REQ-1**: `<RoutineCard>` (表示時 / 非 `routine-card--form`) の DOM 階層は以下とする.
  ```
  <Tag className="routine-card">
    <div className="routine-card__header">
      <label htmlFor="routine-name-{id}" className="visually-hidden">ルーティン名</label>
      <input id="routine-name-{id}" type="text" ... />
      <PriorityStars groupLabel="${routine.name} の優先度" idPrefix="routine-{id}" />
    </div>
    <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
      <label>...</label> x 7
    </div>
    <div className="routine-card__actions">
      <button>削除</button>
    </div>
  </Tag>
  ```
- **REQ-2**: name input と PriorityStars が同一の `.routine-card__header` 親要素の **直下** に並ぶ.
  間に他のラッパ要素を挟まない.
- **REQ-3**: `.routine-card` 自体を `display: flex` + `flex-direction: column` にする (= 3 段縦並び).
  旧 `.routine-card__main` (flex column) ラッパは撤去する.
- **REQ-4**: `.routine-card__header` は `display: flex` + `align-items: center` + `justify-content: space-between`
  で, name input が左 / PriorityStars が右に配置される.
- **REQ-5**: name input が `.routine-card__header` 内で残り幅を占有する (= `flex: 1`).
  PriorityStars は固有幅で右端に固定される.
- **REQ-6**: name input の **computed font-size** は `--font-size-h2` (= 20px) と一致する.
  - input 自体に `font: inherit` を当てて, `.routine-card__header` の `font-size: var(--font-size-h2)` を継承させる
    (= TaskCard V-7 と同じイディオム / D-002).
- **REQ-7**: `<RoutineFormCard>` (起票カード / `.routine-card--form` modifier) の **DOM 構造** が現状と変わらない.
  - 1 段目 (input + 「追加」 button 横並び) と 2 段目 (曜日 + PriorityStars 横並び) の 2 段構成を維持する.
  - `.routine-card--form { flex-direction: column }` の override が REQ-3 の `flex-direction: column` と
    同値で衝突しないこと.
  - 既存テスト (BL-068 D-006 / routine-card-component AC など) が起票カードについて検証している項目に
    回帰させない.
  - **副作用として受容する変更 (auditor 指摘 軽微 2 / 2026-06-12 確認済み)**:
    本 BL では `.routine-card__input` (= 表示カード / 起票カード共有 class) に `font-size: var(--font-size-h2)`
    (= 20px) を当てるため, 起票カードの name input フォントサイズも従来の body 既定 (16px) から 20px に変わる.
    これは「表示と起票で input サイズを統一して統一感を出す」という user 確認済みの意図であり,
    本 BL の非ゴール「起票カードの体裁を壊さない」の例外として明示する.
    したがって「起票カード input フォントサイズの維持」は本 BL の非ゴールに **含めない**.
  - **BL-072 (routine-form-card-header-layout) で逆転**: REQ-7 の「起票カード DOM 構造の不変要求」および AC-11 の「2 段構成維持」は BL-072 で逆転する. BL-072 では `<RoutineFormCard>` も `.routine-card__header` / `.routine-card__title` / `.routine-card__day-checkboxes` / `.routine-card__actions` の 4 段構造に再編し, 表示カード (本 BL の 3 段) と視覚言語を揃える. 詳細は [`../routine-form-card-header-layout/spec.md`](../routine-form-card-header-layout/spec.md).
- **REQ-8**: 既存挙動を回帰させない.
  - **BL-070 blur 書き戻し**: 空文字 blur で `e.currentTarget.value = routine.name` を同期書き戻す動作を維持.
  - **BL-070 同値 blur 短絡**: 親 view の `handleNameBlur` で空文字 / 同値 PATCH を抑止する経路を維持.
  - **BL-068 / BL-069 即時 PATCH**: 曜日 checkbox / PriorityStars click で `onDaysOfWeekChange` /
    `onDefaultPriorityChange` が呼ばれる挙動を維持.
  - **削除**: `.routine-card__actions` 内の「削除」 button が `onDelete` を呼ぶ.
  - **412 ConflictDialog 経路** (BL-031 / BL-033) は親 view 経由のため `<RoutineCard>` 側で意識する必要なし.

### 非機能要件

- **NFR-1 (a11y 維持)**:
  - name input には `<label htmlFor="routine-name-{id}" className="visually-hidden">ルーティン名</label>` を維持.
  - 曜日 group は `role="group" aria-label="曜日"` を維持.
  - PriorityStars には `groupLabel="${routine.name} の優先度"` / `idPrefix="routine-{id}"` を維持.
  - 起票側 PriorityStars (`idPrefix="routine-create"`) との id 衝突を発生させない.
  - a11y violations 0 件 (axe-core / e2e/a11y.spec.ts) を維持.
- **NFR-2 (visual 制約)**:
  - shadow / hover / transition / animation の追加禁止 (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
  - tokens.css 改修禁止.
- **NFR-3 (スコープ閉鎖)**:
  - 改修対象は `web/src/ui/routine-card/routine-card.tsx` と `web/src/ui/routine-card/routine-card.css` の 2 ファイル.
  - 既存テストは追従可だが新規 component 作成・新規 CSS ファイル追加は行わない.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

### DOM 構造

```
シナリオ: AC-1 name input と PriorityStars が同一の .routine-card__header 直下に並ぶ
  Given `<RoutineCard>` を表示モード (props `routine`, `onNameBlur` 等を渡す) でレンダリング
  When  DOM をクエリする
  Then  `.routine-card__header` 要素が存在し,
        その直下の子に `<input>` (type="text") と PriorityStars の root 要素 (role="radiogroup") の両方が含まれる
        かつ name input は曜日 checkbox 群と同じ親には属さない
```

```
シナリオ: AC-2 .routine-card__main ラッパが撤去されている
  Given `<RoutineCard>` を表示モードでレンダリング
  When  DOM をクエリする
  Then  `.routine-card__main` セレクタにマッチする要素は存在しない
```

```
シナリオ: AC-3 3 段構造になっている
  Given `<RoutineCard>` を表示モードでレンダリング
  When  `.routine-card` の直下の子要素を取得する
  Then  順に `.routine-card__header` / `.routine-card__day-checkboxes` / `.routine-card__actions` の 3 要素のみが存在する
```

### CSS

```
シナリオ: AC-4 .routine-card は flex-direction: column である
  Given routine-card.css を読み込む
  When  `.routine-card` ルールセットを参照する
  Then  `display: flex` と `flex-direction: column` が宣言されている
```

```
シナリオ: AC-5 .routine-card__header は space-between で左右配置される
  Given routine-card.css を読み込む
  When  `.routine-card__header` ルールセットを参照する
  Then  `display: flex` と `align-items: center` と `justify-content: space-between` が宣言されている
```

```
シナリオ: AC-6 .routine-card__header の font-size は --font-size-h2 である
  Given routine-card.css を読み込む
  When  `.routine-card__header` ルールセットを参照する
  Then  `font-size: var(--font-size-h2)` が宣言されている
```

```
シナリオ: AC-7 .routine-card__input は font: inherit と flex: 1 を持つ
  Given routine-card.css を読み込む
  When  `.routine-card__input` ルールセットを参照する
  Then  `font: inherit` と `flex: 1` の両方が宣言されている
```

```
シナリオ: AC-8 .routine-card__main ルールセットが撤去されている
  Given routine-card.css を読み込む
  When  ファイル全文を走査する
  Then  `.routine-card__main` セレクタを定義する宣言ブロックは存在しない
```

### 計算スタイル (jsdom)

```
シナリオ: AC-9 name input の computed font-size が --font-size-h2 と一致する
  Given `<RoutineCard>` を表示モードでレンダリング
        かつ vitest.config.ts の css: true で CSS が適用される
  When  name input 要素の getComputedStyle().fontSize を取得する
  Then  CSS variable `--font-size-h2` を解決した値 (= 20px) と一致する
```

### 起票カードの不変性

```
シナリオ: AC-10 .routine-card--form は flex-direction: column を維持する
  Given routine-card.css を読み込む
  When  `.routine-card--form` ルールセットを参照する
  Then  `flex-direction: column` および `align-items: stretch` が引き続き宣言されている
```

```
シナリオ: AC-11 RoutineFormCard の DOM 構造が既存と変わらない
  Given `<RoutineFormCard>` をレンダリング
  When  DOM をクエリする
  Then  root 要素は `<form class="routine-card routine-card--form">` のまま
        かつ `.routine-card__form-row--name` と `.routine-card__form-row--options` の 2 段が存在する
        かつ name input + 「追加」 button + 曜日 7 checkbox + PriorityStars が全て描画される
  Note: BL-072 (routine-form-card-header-layout) で本不変要求は逆転. BL-072 後は `.routine-card__header` / `.routine-card__title` / `.routine-card__day-checkboxes` / `.routine-card__actions` の 4 段構造になる. 詳細は `../routine-form-card-header-layout/spec.md`.
```

### 既存挙動の回帰防止

```
シナリオ: AC-12 空文字 blur で input が元の名前に書き戻される (BL-070 D-002 維持)
  Given `<RoutineCard>` を表示モードでレンダリング (routine.name = "朝の体操")
  When  name input に空文字を入力して blur する
  Then  input の value が "朝の体操" に書き戻される
        かつ onNameBlur は ("") で呼ばれる
```

```
シナリオ: AC-13 同値 blur では入力値が維持されたまま onNameBlur が呼ばれる
  Given `<RoutineCard>` を表示モードでレンダリング (routine.name = "朝の体操")
  When  name input に "朝の体操" を再入力して blur する
  Then  input の value は "朝の体操" のまま
        かつ onNameBlur は ("朝の体操") で呼ばれる
```

```
シナリオ: AC-14 曜日 checkbox click で onDaysOfWeekChange が呼ばれる (BL-068 維持)
  Given `<RoutineCard>` を表示モードでレンダリング (routine.daysOfWeek = [1])
  When  「水」(day=3) の checkbox を click する
  Then  onDaysOfWeekChange は ([1, 3]) で呼ばれる
```

```
シナリオ: AC-15 PriorityStars click で onDefaultPriorityChange が呼ばれる (BL-069 維持)
  Given `<RoutineCard>` を表示モードでレンダリング (routine.defaultPriority = "normal")
  When  PriorityStars の "high" 相当の radio を click する
  Then  onDefaultPriorityChange は ("high") で呼ばれる
```

```
シナリオ: AC-16 削除 button click で onDelete が呼ばれる
  Given `<RoutineCard>` を表示モードでレンダリング
  When  「削除」 button を click する
  Then  onDelete が 1 回呼ばれる
```

### a11y

```
シナリオ: AC-17 visually-hidden label が name input と紐づく
  Given `<RoutineCard>` を表示モードでレンダリング (routine.id = "r-1")
  When  DOM をクエリする
  Then  `<label for="routine-name-r-1" class="visually-hidden">ルーティン名</label>` と
        `<input id="routine-name-r-1">` が両方存在する
```

```
シナリオ: AC-18 PriorityStars の groupLabel と idPrefix が維持される
  Given `<RoutineCard>` を表示モードでレンダリング (routine.name = "朝の体操" / routine.id = "r-1")
  When  PriorityStars の root role="radiogroup" を取得する
  Then  accessibleName は "朝の体操 の優先度"
        かつ 子 radio の id prefix は "routine-r-1" で始まる
```

### 順序保証

```
シナリオ: AC-19 header 内で input が PriorityStars より前に並ぶ
  Given `<RoutineCard>` を表示モードでレンダリング
  When  `.routine-card__header` の直下の子要素を順に取得する
  Then  visually-hidden label → input → PriorityStars の順で並ぶ (visually-hidden label は input の前に位置)
```

## 未決事項 / 確認待ち

- **U-1**: header の `gap` は `var(--space-sm)` で TaskCard (gap: --space-sm) と揃える方針で良いか.
  → plan 側で D-001 として確定 (採用).
- **U-2**: `.routine-card__day-checkboxes` の現状 `display: flex; flex-wrap: wrap; gap: --space-sm`
  は維持して問題ないか. (3 段構造に組み替えても曜日の視覚は同じで良いか)
  → plan 側で D-003 として確定 (維持).
- **U-3**: 「削除」 button 単独の `.routine-card__actions` を flex 横並びのまま維持するか.
  TaskCard は左右両端配置の auto-margin を持つが, RoutineCard は単一ボタンなので
  `justify-content: flex-end` で右端に置く方が見栄えが良いかどうか.
  → plan 側で D-004 として確定 (本 BL では現状維持 = `display: flex` の基底のみで位置は flex 自然順 / 別 BL 候補).
- **U-4**: `.routine-card__input` の `placeholder` は表示時は表示されない (= defaultValue が常に入っている) ため
  `::placeholder` の `color: var(--color-fg-subtle)` は実質起票カード専用. 撤去するかは別 BL 判断.
  → 本 BL では維持 (= 影響なし).
