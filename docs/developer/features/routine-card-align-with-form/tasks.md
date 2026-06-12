# タスク: RoutineCard 表示カードのレイアウト刷新

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 1. 事前調査 (test-designer / implementer 共通)

### 1.1. 利用箇所の確認

- [x] `.routine-card__header` セレクタを参照する箇所を grep で全洗い出し
  - 期待: `<RoutineCard>` (表示) と `<RoutineFormCard>` (起票) の 2 箇所のみ.
    他 view / 共通 CSS には流用が無いことを確認.
- [x] `.routine-card__title` セレクタを参照する箇所を grep で全洗い出し
  - 期待: 現状は `<RoutineFormCard>` (起票) のみ. 表示カードでも新規利用することを確認.

### 1.2. 既存テストの依存調査

- [x] 既存テスト 6 ファイルで以下の依存を grep で洗い出す:
  - 対象: `web/__tests__/routine-card-component.test.tsx` (BL-061) /
    `routine-card-edit-fields.test.tsx` (BL-068) /
    `routine-card-edit-priority.test.tsx` (BL-069) /
    `inline-edit-all-cards.test.tsx` (BL-070) /
    `routine-card-header-layout.test.tsx` (BL-071) /
    `routine-form-card-header-layout.test.tsx` (BL-072)
  - 検索パターン: `.routine-card__header`, `.routine-card__title`,
    `routine-card__input`, `header` 内子要素 (label / input / PriorityStars)
- [x] BL-071 `routine-card-header-layout.test.tsx` の AC-1 〜 AC-9 で
  「`.routine-card__header` 内に name input + PriorityStars が並ぶ」と
  assert している箇所を確認 (= 本 BL で書き換えが必要)
- [x] BL-072 `routine-form-card-header-layout.test.tsx` の AC-7 / AC-8 で
  「`.routine-card__header` の `justify-content: space-between` 維持」「`.routine-card--form
  .routine-card__header { justify-content: flex-end }` の存在」を assert している
  箇所を確認 (= 本 BL で書き換えが必要)

### 1.3. 既存 CSS / トークンの確認

- [x] `web/src/ui/routine-card/routine-card.css` の現状で以下を確認:
  - `.routine-card__header` ルールセットに 5 宣言が宣言されていること
  - `.routine-card--form .routine-card__header { justify-content: flex-end }` 宣言が存在すること
  - `.routine-card__title` ルールセットの 3 宣言が宣言されていること (BL-072 で新設)
- [x] `web/src/styles/tokens.css` に `--font-size-h2: 20px` が現存することを確認
- [x] vitest.config.ts に `css: true` が設定されていることを確認
  (= AC-11 / AC-20 / AC-25 の computed style 検証が動く前提)

### 1.4. 起票カード不変性の予備確認

- [x] `web/src/ui/routine-card/routine-form-card.tsx` を読み, 本 BL では一切変更しないことを確認
- [x] BL-072 spec.md AC-1 〜 AC-23 を参照し, 起票カードに対する不変要求 (= 4 段構造 /
  font-size 20px / 既存挙動 / a11y) が本 BL でも継続することを確認

## 2. テスト設計 (test-designer)

### 2.1. 新規テスト追加

- [x] `web/__tests__/routine-card-align-with-form.test.tsx` を新規作成
  - [x] **CSS 直読み** (file read + 正規表現) で以下を assert:
    - AC-6: `.routine-card__title` ルールセットの 3 宣言 (display: flex / align-items: center /
      font-size: var(--font-size-h2)) が無改修で維持されている
    - AC-7: `.routine-card__header` ルールセットの `justify-content` が `flex-end` に変更されている
      (= 旧 `space-between` から本 BL で変更)
    - AC-7 (補足): `.routine-card__header` の他 4 宣言 (display: flex / align-items: center /
      gap: var(--space-sm) / font-size: var(--font-size-h2)) は無改修
    - AC-8: `.routine-card--form .routine-card__header` の override 宣言ブロックが
      完全撤去されている (D-001 (a) 採用時)
    - AC-9: `.routine-card` 基底の 7 宣言 (BL-071 / BL-052) が無改修
    - AC-10: `.routine-card--form { flex-direction: column; align-items: stretch }` および
      `.routine-card--form .routine-card__actions { justify-content: flex-end }` が
      いずれも宣言ブロックとして残存
  - [x] **jsdom DOM レンダ** で以下を assert (failing 状態):
    - AC-1: `<RoutineCard>` レンダ後 `.routine-card` 直下 `.routine-card__header` 要素に
      PriorityStars (radiogroup) のみが含まれ name input は含まれない
    - AC-2: `.routine-card__title` 要素が存在し visually-hidden label
      (`htmlFor="routine-name-{id}"`) と `<input id="routine-name-{id}">` の両方を含む
    - AC-3: `.routine-card` 直下に `.routine-card__header` / `.routine-card__title` /
      `.routine-card__day-checkboxes` / `.routine-card__actions` の 4 要素のみが順に並ぶ
    - AC-4: `.routine-card__header` 直下子要素が PriorityStars のみ
    - AC-5: 「削除」 button (`.routine-card__actions__delete`) が `.routine-card__actions`
      直下に位置し, `.routine-card__title` / `.routine-card__header` には含まれない
    - AC-12: name input に "夜の体操" を入力して blur すると onNameBlur("夜の体操") が 1 回呼ばれる
    - AC-13: name input に "" を入力して blur すると DOM value が "朝のヨガ" に書き戻されている
      かつ onNameBlur("") が 1 回呼ばれる (= 親 view が短絡判断する経路を維持)
    - AC-14: 値を変えずに blur すると onNameBlur("朝のヨガ") が 1 回呼ばれる
      (= カードは常に blur 値を流す)
    - AC-15: 「水」 (day=3) checkbox click で onDaysOfWeekChange([1, 3]) が呼ばれる
      (sort 済み配列)
    - AC-16: PriorityStars "high" radio click で onDefaultPriorityChange("high") が呼ばれる
    - AC-17: 「削除」 button click で onDelete() が 1 回呼ばれる
    - AC-18: routine.name 変更時に input DOM value が同期する (key 再マウント)
    - AC-19: `<RoutineFormCard>` の DOM 構造 (BL-072 の 4 段) が無改修で維持される
    - AC-21: visually-hidden label `htmlFor="routine-name-r-1"` が name input と紐づく
    - AC-22: PriorityStars accessibleName が "朝のヨガ の優先度" / idPrefix が "routine-r-1"
    - AC-23: 表示 + 起票同時レンダで input id "routine-name-r-1" / "routine-name" の両方が
      存在し重複しない
    - AC-24: 表示 + 起票同時レンダで PriorityStars radio id prefix "routine-r-1" /
      "routine-create" の重複が無い
  - [x] **getComputedStyle** (jsdom + vitest css: true) で以下を assert:
    - AC-11: 表示カード name input の computed font-size が 20px と一致
    - AC-20: 起票カード name input の computed font-size が 20px と一致 (BL-072 維持)
    - AC-25: 起票カード `.routine-card__header` の computed justify-content が flex-end
      (= 視覚配置不変)

### 2.2. 既存テストの追従

- [x] `routine-card-component.test.tsx` (BL-061):
  - 表示カードの `.routine-card__header` 内 name input 依存 assert があれば
    `.routine-card__title` 内に書き換え
- [x] `routine-card-edit-fields.test.tsx` (BL-068): 同上
- [x] `routine-card-edit-priority.test.tsx` (BL-069): 同上
- [x] `inline-edit-all-cards.test.tsx` (BL-070):
  - 表示カード input の親要素 (旧 `.routine-card__header` → 新 `.routine-card__title`) を
    指定する assert があれば追従
  - blur ロジック (空文字復元 / 同値短絡) 自体の assert は無修正で通る
- [x] `routine-card-header-layout.test.tsx` (BL-071):
  - AC-1 〜 AC-9 で「`.routine-card__header` に name input + PriorityStars が並ぶ」と
    assert している部分を本 BL の新構造に書き換え:
    - 表示カード header 直下: PriorityStars のみ
    - 新規 `.routine-card__title` 段: name input + visually-hidden label
    - 表示カード 4 段構造に追従
- [x] `routine-form-card-header-layout.test.tsx` (BL-072):
  - AC-7「`.routine-card__header` の `justify-content: space-between` 維持」を
    `justify-content: flex-end` に書き換え
  - AC-8「`.routine-card--form .routine-card__header` override の `flex-end` 維持」を
    「override 完全撤去」に書き換え
  - AC-11 / AC-12 (起票カード不変) は本 BL でも維持 (= 副作用なし) なので無改修

### 2.3. テスト全件赤確認

- [x] `npm test -w web` を実行し, **新規** test がすべて failing で止まることを確認
  (= 実装前の TDD 状態 / 既存テストは追従後に再評価)

## 3. 実装 (implementer)

### 3.1. CSS (`web/src/ui/routine-card/routine-card.css`)

- [x] `.routine-card__header` ルールセットの `justify-content` を
  `space-between` → `flex-end` に変更 (D-001)
  - 他 4 宣言 (display: flex / align-items: center / gap: var(--space-sm) /
    font-size: var(--font-size-h2)) は無改修
- [x] `.routine-card--form .routine-card__header { justify-content: flex-end }` の宣言ブロックを
  完全撤去 (D-001 (a))
- [x] 以下は無改修:
  - `.routine-card` (BL-071 / BL-052: 7 宣言)
  - `.routine-card--form` (flex-direction: column / align-items: stretch / BL-072 D-005)
  - `.routine-card--form .routine-card__actions { justify-content: flex-end }` (BL-072 D-007)
  - `.routine-card__title` (BL-072 D-003: 3 宣言)
  - `.routine-card__day-checkboxes` (BL-068)
  - `.routine-card__actions` (BL-061)
  - `.routine-card__actions__delete` (空ルール)
  - `.routine-card__input` (BL-071 D-002 / BL-072: font: inherit + font-size +
    flex: 1 + ::placeholder)
  - `.routine-card__submit` (空ルール)
  - `.visually-hidden` (D-006 / 9 宣言)

### 3.2. JSX (`web/src/ui/routine-card/routine-card.tsx`)

- [x] root tag (`<Tag className="routine-card">`) は無改修 (className に modifier を追加しない / D-005)
- [x] `.routine-card__header` div から以下 2 要素を撤去:
  - `<label htmlFor={inputId} className="visually-hidden">ルーティン名</label>`
  - `<input key=... id=... type="text" className="routine-card__input" defaultValue=...
     placeholder=... onBlur=...>`
- [x] `.routine-card__header` div の中身を `<PriorityStars value={routine.defaultPriority}
  onChange={onDefaultPriorityChange} groupLabel={`${routine.name} の優先度`}
  idPrefix={`routine-${routine.id}`} />` のみとする (D-002)
- [x] `.routine-card__title` div を新設し, `.routine-card` 直下 (header 段の下) に挿入
  - 直下子は撤去した `<label>` + `<input>` をそのまま (BL-070 / BL-071 で確立した form 構造を維持)
- [x] `.routine-card__day-checkboxes` div は無改修 (位置のみ 1 段下にスライド)
- [x] `.routine-card__actions` div は無改修 (直下に「削除」 button のみを置く)
- [x] 上部 jsdoc に本 BL の参照行を追加:
  - `docs/developer/features/routine-card-align-with-form/spec.md REQ-1 / REQ-2 / REQ-3`
  - 「4 段構造 (header / title / day-checkboxes / actions) に再編 (BL-073)」のコメント追加
- [x] import 文 / `RoutineCardProps` 型 / 関数シグネチャ / default 値は無改修 (D-007)

### 3.3. 起票カード `<RoutineFormCard>` 無改修

- [x] `web/src/ui/routine-card/routine-form-card.tsx` を変更しないことを確認
- [x] AC-19 / AC-20 / AC-25 で起票カードの DOM 構造 / font-size / header computed justify-content
  が変わらないことを目視・テストで確認

### 3.4. 親 view 無改修

- [x] `web/src/ui/routines-view/routines-view.tsx` の `<RoutineCard ... />` 呼び出し JSX を
  変更しないことを確認 (D-007 / NFR-2)

## 4. 検証

### 4.1. 単体テスト

- [x] `npm test -w web` 全件 green
- [x] 新規 `routine-card-align-with-form.test.tsx` がすべて green
- [x] 既存 routine-card 系テスト 6 ファイル (BL-061 / BL-068 / BL-069 / BL-070 / BL-071 / BL-072) が
  追従後に全件 green

### 4.2. E2E

- [x] `npx playwright test` 全件 green (= BL-072 baseline からの増減 0)
- [x] `e2e/routines.spec.ts` 無修正で green
- [x] `e2e/routine-card-edit-fields.spec.ts` 無修正で green
- [x] `e2e/routine-card-edit-priority.spec.ts` 無修正で green
- [x] `e2e/conflict-handling.spec.ts` 無修正で green
- [x] `e2e/a11y.spec.ts` で violations 0 件

### 4.3. 静的検査

- [x] `npm run lint` exit 0
- [x] `npm run typecheck` exit 0

### 4.4. 目視

- [ ] dev server (`npm run dev -w web`) を起動して `/routines` を開く
- [ ] 表示カード (一覧の各ルーティン) の上段 (header) の **右上に PriorityStars** が並ぶことを目視
- [ ] 表示カードの **name input が 2 段目 (title 段)** に下がっていることを目視
  (= 起票カードと段位置一致)
- [ ] 表示カードの **name input フォントが 20px** で表示されていることを目視
- [ ] 表示カードの **「削除」 button が下段 (actions 段)** に並ぶことを目視
- [ ] 表示カードの曜日 checkbox 群が day-checkboxes 段に横並びで表示されることを目視
- [ ] 起票カードの見た目が BL-072 から変わらないことを目視
  (PriorityStars 右上 / name input 20px / 曜日 / 「追加」 button 右下)
- [ ] 表示カードと起票カードを並べて, name input の位置が **同じ 2 段目** に揃って見えることを確認
  (= 本 BL のゴール)
- [ ] 表示カードで name input を編集して blur → 親 view 経由で PATCH 送信されることを確認
- [ ] 表示カードで name input を "" に編集して blur → DOM 値が元値に復元され PATCH が
  送られないことを確認 (BL-070 空文字 blur 元値復元)
- [ ] 表示カードで曜日 checkbox を click → 即時 PATCH 送信されることを確認 (BL-068)
- [ ] 表示カードで PriorityStars を click → 即時 PATCH 送信されることを確認 (BL-069)
- [ ] 表示カードで「削除」 button click → ルーティンが削除されることを確認

## 5. ドキュメント

> 方針: BL-072 で BL-061 / BL-068 / BL-069 / BL-071 spec に注釈を入れた前例に合わせ,
> 関連 BL spec への注釈 1 行追記を本 BL でも行う. トレーサビリティ確保のため.

- [x] BL-061 spec.md (`docs/developer/features/routine-card-component/spec.md`) に
  「BL-073 で表示カード `<RoutineCard>` が 4 段構造 (header / title / day-checkboxes / actions)
  に再編される. RoutineCardProps の API は無改修」の注釈を 1 行追記
- [x] BL-068 spec.md (`docs/developer/features/routine-card-edit-fields/spec.md`) に
  「BL-073 で表示カードのレイアウトのみ変更. 曜日 / 優先度の即時 PATCH 経路は無改修」の注釈を 1 行追記
- [x] BL-069 spec.md (`docs/developer/features/routine-card-edit-priority/spec.md`) に
  「BL-073 で表示カードのレイアウトのみ変更. 編集モードはすでに BL-070 で撤去済」の注釈を 1 行追記
- [x] BL-070 spec.md (`docs/developer/features/inline-edit-all-cards/spec.md`) に
  「BL-073 で表示カードの DOM 階層 (`.routine-card__header` 内 → `.routine-card__title` 内) が
  変わるが, blur ロジック (空文字復元 / 同値短絡) は無改修」の注釈を 1 行追記
- [x] BL-071 spec.md (`docs/developer/features/routine-card-header-layout/spec.md`) の REQ-1 〜
  REQ-6 / AC-1 〜 AC-9 に「BL-073 で表示カードが 4 段構造に再編. 3 段構造の不変要求は
  BL-073 で逆転」の注釈を 1 行追記
- [x] BL-072 spec.md (`docs/developer/features/routine-form-card-header-layout/spec.md`) の REQ-2 /
  AC-7 / AC-8 に「BL-073 で `.routine-card__header { justify-content }` が基底化 + 起票側
  override 撤去. 起票カードへの副作用なし」の注釈を 1 行追記

## 6. 仕上げ

- [x] 受け入れ基準 (spec.md / AC-1 〜 AC-25) を全て満たすことを確認
- [x] backlog.md の BL-073 状態を Todo → Done に変更
- [x] auditor へレビュー依頼
- [ ] auditor Pass 後に PR 作成 → main マージ
- [ ] main マージ後にローカル `feature/routine-card-align-with-form` ブランチを削除
