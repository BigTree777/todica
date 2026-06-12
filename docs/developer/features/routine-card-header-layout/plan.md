# 設計・実装計画: RoutineCard ヘッダレイアウト刷新

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす.

## 方針概要

`<RoutineCard>` の DOM 構造を `.routine-card` → `.routine-card__main` (flex column) →
{name input, 曜日, PriorityStars} の 1 段 main 構造から, **TaskCard と同じ 3 段ゾーン構造**
(`.routine-card` flex column 直下に `.routine-card__header` / `.routine-card__day-checkboxes` /
`.routine-card__actions`) に組み替える. header 段は `justify-content: space-between` で
name input (左 / 残り幅占有) と PriorityStars (右 / 固有幅) を左右配置する.
name input には `font: inherit` を当て, header 段に `font-size: var(--font-size-h2)` を設定して
TaskCard と同じタイポグラフィに揃える. `<RoutineFormCard>` は `.routine-card--form` modifier で
従来通り縦並びを維持する.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし |
| DB | なし |
| ドメイン | なし |
| モジュール (web) | `web/src/ui/routine-card/routine-card.tsx` (JSX 再構築), `web/src/ui/routine-card/routine-card.css` (3 段化) |
| UI | `<RoutineCard>` のみ. `<RoutineFormCard>` は無改修. routines-view / projects-view / today-view / tomorrow-view / focus-view 無改修. |
| テスト | 既存 `routine-card-component.test.tsx` / `routine-card-edit-fields.test.tsx` / `routine-card-edit-priority.test.tsx` / `inline-edit-all-cards.test.tsx` の DOM 階層 assert を追従. 新規 `routine-card-header-layout.test.tsx` を追加. |
| E2E | role + accessibleName ベースのため無修正で通る想定. 念のため `e2e/routines.spec.ts` / `e2e/routine-card-edit-fields.spec.ts` / `e2e/routine-card-edit-priority.spec.ts` を全件 green 確認. |

## 設計詳細

### JSX 再構築 (`routine-card.tsx`)

**Before** (現状):

```tsx
<Tag className="routine-card">
  <div className="routine-card__main">
    <label htmlFor={inputId} className="visually-hidden">ルーティン名</label>
    <input ... />
    <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
      ... 7 個
    </div>
    <PriorityStars ... />
  </div>
  <div className="routine-card__actions">
    <button>削除</button>
  </div>
</Tag>
```

**After**:

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
    ... 7 個
  </div>
  <div className="routine-card__actions">
    <button>削除</button>
  </div>
</Tag>
```

差分:

- `.routine-card__main` ラッパを撤去 (= P-001).
- `.routine-card__header` を新設し, visually-hidden label + name input + PriorityStars を内包.
- 曜日 checkbox 群と「削除」 button は `.routine-card` 直下に位置.
- `onBlur` / `onChange` / `onClick` のハンドラは無改修 (= REQ-8 / 既存挙動維持).
- input の `className="routine-card__input"` も維持.

### CSS 再構築 (`routine-card.css`)

主要差分:

```css
/* Before */
.routine-card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  display: flex;
  flex-direction: row;    /* ←変更 */
  align-items: center;    /* ←変更 */
  gap: var(--space-sm);   /* ←変更 */
}

.routine-card__main { /* ←撤去 */
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

/* (.routine-card__header は存在しなかった) */
```

```css
/* After */
.routine-card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  /* 3 段 layout. TaskCard と同じイディオム. */
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.routine-card--form {
  /* V-1: 起票カードは縦並び維持 (REQ-7). 基底が column になったため
   * 厳密には no-op だが意図表明として宣言を残す. */
  flex-direction: column;
  align-items: stretch;
}

.routine-card__header {
  display: flex;
  align-items: center;
  /* name input を左 / PriorityStars を右に分ける. TaskCard V-3 と同じ. */
  justify-content: space-between;
  gap: var(--space-sm);
  /* TaskCard V-4 / V-7 と同じイディオム. input に font: inherit を当て継承させる. */
  font-size: var(--font-size-h2);
}

/* .routine-card__main は撤去 */

.routine-card__input {
  /* V-5: 残り幅を占有. */
  flex: 1;
  /* V-6 / TaskCard V-7: 親の font (= --font-size-h2) を input に継承させる. */
  font: inherit;
}

.routine-card__input::placeholder {
  color: var(--color-fg-subtle);
}
```

そのほか変更なし (`.routine-card__day-checkboxes` / `.routine-card__actions` /
`.routine-card__form-row` / `.routine-card__submit` / `.visually-hidden` はそのまま).

### 例外 / エラー処理

- 本 BL は presentational layer のみの変更で, mutation / 通信経路には触れない.
- 412 ConflictDialog は親 view 経由のため影響なし.

## 重要な決定

### D-001: header の gap は `var(--space-sm)` で TaskCard と統一する

- 採用: `gap: var(--space-sm)` を `.routine-card__header` に設定.
- 根拠: TaskCard の `.task-card__header` と同値. 視覚言語を揃える方針 (= 本 BL のゴール).

### D-002: name input のフォントサイズは `font: inherit` で親 (.routine-card__header) から継承させる

- 採用: input には `font: inherit` のみ宣言. `.routine-card__header` に `font-size: var(--font-size-h2)` を当てる.
- 根拠: TaskCard V-4 / V-7 と同じイディオム. input は browser default で font を継承しない仕様 (`font: inherit` で明示).
- 代替: input に直接 `font-size: var(--font-size-h2)` を当てる案もあるが, TaskCard と機構を揃えるため
  「親に font-size + 子に font: inherit」を選ぶ. AC-9 の computed font-size assert は同じ結果になる.
- **実装段階での修正 (auditor 指摘 軽微 1 / 2026-06-12)**:
  jsdom の `getComputedStyle` は CSS shorthand `font` を longhand プロパティに展開しないため,
  `font: inherit` のみでは AC-9 (computed `font-size` が 20px と一致) が通らないことが判明.
  そのため実装では `.routine-card__input` に `font: inherit` と `font-size: var(--font-size-h2)` を
  両方宣言する形に修正した (`web/src/ui/routine-card/routine-card.css:77-88`).
  実ブラウザでは両宣言とも同値 (20px) に解決されるため視覚回帰なし. 代替案 B (子に直接 font-size 宣言) を
  「採用したが親 font: inherit も併記」する折衷形であり, TaskCard と機構を揃える方針自体は維持される.

### D-003: 曜日 7 checkbox の見た目は据え置き

- 採用: `.routine-card__day-checkboxes` の `display: flex; flex-wrap: wrap; gap: var(--space-sm)` を維持.
- 根拠: 本 BL のスコープは「優先度位置 + name フォント」の 2 点. 曜日の見た目は user 評価で問題視されていない.
- 場所だけ変更: `.routine-card__main` の中 → `.routine-card` 直下 (= header の下) に移動するが,
  CSS ルールセット自体は無改修. JSX の階層を変えるだけ.

### D-004: 「削除」 button の `.routine-card__actions` は現状維持 (基底 `display: flex` のみ)

- 採用: `.routine-card__actions` の現状 CSS (`display: flex; align-items: center; gap: var(--space-sm)`) を維持.
- 根拠: ボタンが 1 つしか無いため `justify-content` の差は視覚に出ない. 別 BL で見た目変更があれば
  そちらでカバーする (= 本 BL のスコープ閉鎖).

### D-005: `.routine-card--form` の `flex-direction: column` 宣言は (基底が column になっても) 残す

- 採用: `.routine-card--form { flex-direction: column; align-items: stretch }` を維持.
- 根拠:
  - `.routine-card` 基底が `flex-direction: column` になったため `.routine-card--form` の `flex-direction: column` は
    技術的には no-op になる. しかし「起票カードは縦並び」という意図を CSS で明示し続けるため宣言を残す.
  - `align-items: stretch` は起票カードで input + ボタンが横幅一杯に伸びる体裁を維持するために必要.
  - 将来 `.routine-card` 基底が再び `flex-direction: row` に戻る可能性があるとき, override が消えていると壊れる.

### D-006: `.routine-card__main` ルールセットは完全撤去 (空ルールとして残さない)

- 採用: `.routine-card__main` セレクタを CSS / JSX から完全撤去.
- 根拠: JSX 側でラッパ要素自体を消すため, 残しても dead-code になる. 撤去で混乱を防ぐ.
- AC-2 / AC-8 で assert する.

### D-007: 起票カードの 1 段目「name input + 追加 button」横並びは `.routine-card__form-row--name` で維持

- 採用: `<RoutineFormCard>` の `.routine-card__form-row--name` 内で input + button が flex 横並びになる動作は変更しない.
- 根拠: REQ-7 (起票カードの体裁を壊さない). 既存 CSS の `.routine-card__form-row { display: flex; flex-direction: row }` で
  `.routine-card__form-row--name` も `.routine-card__form-row--options` も同じく横並びになる. 既存 css は無改修.

### D-008: header にフォントサイズを置くか, .routine-card__title を新設するか

- 採用: header に `font-size: var(--font-size-h2)` を直接置く (= `.routine-card__title` 新設しない).
- 根拠:
  - TaskCard は header (chip + PriorityStars) と title (タスク名 + 中央寄せ) を別の段として 2 段持つ
    (= 計 3 段). RoutineCard は header に name input + PriorityStars を同居させるため title 段が無く 3 段になる.
  - 「`<input>` が title 相当」と言えるが, name input は左寄せ・残り幅占有でカード固有の挙動であり,
    別段に分けるメリットが薄い (chip も無い).
  - 別段化すると DOM 階層が深くなり, 既存テスト追従コストが増える.

### D-009: 既存 placeholder 用 `::placeholder { color: var(--color-fg-subtle) }` は残す

- 採用: `.routine-card__input::placeholder` を維持.
- 根拠:
  - 表示モードの `<RoutineCard>` では `defaultValue` が常に入っているため placeholder は表示されない.
  - しかし `<RoutineFormCard>` 起票時は input が空の状態から始まり placeholder が表示される.
  - `.routine-card__input` は両方で共有されているため `::placeholder` ルールは起票側のために残す必要がある.

### D-010: 起票カード input フォントサイズの 20px 化を副作用として受容 (auditor 指摘 軽微 2 / 2026-06-12)

- 採用: `.routine-card__input` (= 表示カード / 起票カード共有) に `font-size: var(--font-size-h2)` を当てるため,
  起票カードの name input フォントサイズも従来の body 既定 (16px) から 20px に変わることを受容する.
- 根拠:
  - D-002 の実装段階修正 (jsdom 対応で子に直接 `font-size` を併記する形に変更) に伴い, 副作用として
    `<RoutineFormCard>` の input にも 20px が適用される.
  - user 確認の結果, 「表示と起票で input サイズを統一して統一感を出す」方向 (= 現状実装のまま) で合意済み.
  - したがって REQ-7 は「DOM 構造は不変だが input フォントサイズは 20px に統一」と読み替える
    (= spec.md REQ-7 の副作用節として明文化済み).
- 代替: `.routine-card--form .routine-card__input { font-size: initial }` で起票カードのみ 16px に戻す案もあったが,
  user 意図に反するため不採用.

## リスク / 代替案

- **リスク R-1**: jsdom の getComputedStyle が CSS variable + `font: inherit` の組合せを正しく解決しないと
  AC-9 (computed font-size assert) が失敗する可能性がある.
  - 緩和: vitest.config.ts の `css: true` (BL-063 で導入済み) で CSS が読まれる前提.
    BL-059 の TaskCard が同じイディオムで AC-9 相当を passing させているため再現可能性は高い.
  - 代替: もし jsdom で正しく解決されない場合は AC-9 を spec から外し, AC-6 (CSS 直読みでの宣言 assert) のみで担保する.
- **リスク R-2**: `.routine-card` 基底が `flex-direction: column` になることで, `.routine-card--form` の
  override が消えると影響する箇所があれば見落とす.
  - 緩和: AC-10 / AC-11 で起票カードの不変性を assert する. 既存 routine-card-component.test.tsx (BL-061) を
    全件 green に保つ.
- **リスク R-3**: 既存 routine-card-component.test.tsx / routine-card-edit-fields.test.tsx /
  routine-card-edit-priority.test.tsx / inline-edit-all-cards.test.tsx に `.routine-card__main` セレクタや
  「name input と PriorityStars が `.routine-card__main` 直下に並ぶ」 assert が含まれていれば全件追従が必要.
  - 緩和: tasks.md の追従ステップで grep 確認 → 機械的に書き換え. role + accessibleName ベースの assert は
    無修正で通る想定.

### 代替案 (採用しなかったもの)

- **代替 A**: `.routine-card__main` を残し, 中で 3 段化する.
  → 不採用. TaskCard と機構を揃える方針に反する (TaskCard は `.task-card` 直下に 3 段). DOM 階層が深くなる.
- **代替 B**: name input に直接 `font-size: var(--font-size-h2)` を当てる.
  → 不採用. D-002 の通り TaskCard と機構を揃える方針.
- **代替 C**: `.routine-card__title` を新設して 4 段 (header + title + day + actions) にする.
  → 不採用. D-008 の通り chip が無く分ける必要が薄い.
- **代替 D**: 「削除」 button を header 段の右側に移し PriorityStars と並べる.
  → 不採用. user 要望は「優先度を右上」のみ. 削除 button の位置変更は別 BL 候補.
- **代替 E**: `--font-size-h1` (= 24px) を使う.
  → 不採用. ユーザ要望文脈の「TaskCard と統一」を優先. TaskCard が `--font-size-h2` を使用しているため.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 新規テスト

- **新規 `web/__tests__/routine-card-header-layout.test.tsx`**: AC-1 〜 AC-19 を網羅.
  - CSS 直読み (file read + 正規表現) で AC-4 / AC-5 / AC-6 / AC-7 / AC-8 / AC-10 を assert.
  - jsdom DOM レンダで AC-1 / AC-2 / AC-3 / AC-11 / AC-12 / AC-13 / AC-14 / AC-15 / AC-16 / AC-17 / AC-18 / AC-19 を assert.
  - getComputedStyle で AC-9 を assert (vitest css: true 前提).

### 既存テスト追従

- `web/__tests__/routine-card-component.test.tsx` (BL-061):
  - 「`.routine-card__main` の直下に name + 曜日 + PriorityStars が並ぶ」型の assert があれば
    「`.routine-card__header` の直下に name + PriorityStars が並ぶ」+「`.routine-card` 直下に
    `.routine-card__header` / `.routine-card__day-checkboxes` / `.routine-card__actions` の 3 つが並ぶ」に書き換え.
- `web/__tests__/routine-card-edit-fields.test.tsx` (BL-068):
  - 曜日 group の親が `.routine-card__main` 前提の assert があれば `.routine-card` 直下に書き換え.
- `web/__tests__/routine-card-edit-priority.test.tsx` (BL-069):
  - PriorityStars の親が `.routine-card__main` 前提の assert があれば `.routine-card__header` に書き換え.
- `web/__tests__/inline-edit-all-cards.test.tsx` (BL-070):
  - 編集モード撤去後の常時 input + 即時 PATCH の挙動 assert が DOM 階層に依存していれば追従.

### E2E

- `e2e/routines.spec.ts` (BL-026 / BL-061): role + accessibleName ベースのため無修正で通る想定. 確認のみ.
- `e2e/routine-card-edit-fields.spec.ts` (BL-068): 同上.
- `e2e/routine-card-edit-priority.spec.ts` (BL-069): 同上.
- `e2e/a11y.spec.ts`: violations 0 件維持.

### 検証コマンド

- `npm test -w web` 全件 green.
- `npx playwright test` 全件 green (= BL-070 baseline からの増減 0).
- `npm run lint && npm run typecheck` 全件 green.
- `e2e/a11y.spec.ts` で a11y violations 0 件.
