# 仕様: カード系ボタンをアイコンに置換 + 起票カードのキャンセルを右上「閉じる ✕」に移設

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-114

## 背景 / 課題

`<TaskCard>` / `<ProjectCard>` / `<RoutineCard>` の表示カードと、それぞれの起票カード
(`<TaskFormCard>` / `<ProjectFormCard>` / `<RoutineFormCard>`) のアクション button は
すべて日本語テキストラベル (「削除」「完了」「現在のタスクにする」「明日にする」「今日にする」
「キャンセル」「追加」) で描画されており、モバイル幅 (320 〜 414 px) で 1 段あたりの占有面積が大きい。
特に `<TaskCard>` actions 段は最大 4 ボタンが並ぶため文字数で幅が決まり、視覚密度を上げて
個々の操作対象を素早く識別しにくくなっている。

加えて、BL-104 (floating-create-button) で 4 ビュー (today / tomorrow / projects / routines) の
起票カードが「+ ボタン展開式」になった結果、起票カード下段の「キャンセル」 button は
「閉じる」操作 (= ✕) としての位置付けが強くなり、左下のテキスト button よりも
カード右上の ✕ アイコンとして配置する方が自然な誘導動線になる。

## ゴール / 非ゴール

- ゴール:
  - 3 表示カード (`<TaskCard>` / `<ProjectCard>` / `<RoutineCard>`) の全アクション button を
    Lucide アイコンに置換する (テキストは `aria-label` で保持し SR / Playwright 互換維持)。
  - 3 起票カード (`<TaskFormCard>` / `<ProjectFormCard>` / `<RoutineFormCard>`) で
    - (a) 「キャンセル」 button を撤去し、カード root 右上 (`position: absolute`) に
      「閉じる ✕」アイコン button を配置 (Lucide `x`, `aria-label="閉じる"`)。
      クリック挙動は既存 `onCancel` と同一 (`?create=1` クエリ削除 + state クリア + + ボタン focus 復帰)。
    - (b) 「追加」 submit を Lucide `plus` アイコン button に置換 (`aria-label="追加"`)。
  - モバイルで各 icon button のタッチ領域が 44 × 44 px 以上を確保される。
  - BL-104 で確立した Escape キー閉じ / +ボタン focus 復帰挙動を維持する。

- 非ゴール:
  - app-shell / header / 設定ビュー / login / dialog / sidebar nav 等、**カード以外** のボタン
    (= ログアウト / 変更 / 保存 / 復元 / 空にする / 接続する / + ボタン本体など) は触らない。
  - アイコンライブラリの差し替え可能性 (Lucide で固定)。
  - 確認ダイアログの追加 (現状挙動の維持。削除も即時実行のまま)。
  - タップ時の触覚フィードバック / アニメーション / hover / transition の追加
    (NFR-NO-HOVER-TRANSITION 継続)。
  - tokens.css / サーバ API / ドメイン / Repository の改修。
  - shadow の追加 (NFR-NO-SHADOW 継続)。

## 要件

### 機能要件

#### アイコン置換マッピング (確定)

- REQ-1: `<TaskCard>` の以下 5 button をすべて Lucide アイコン button に置換する。
  textContent は持たず、Lucide SVG (`aria-hidden="true"`) のみを子に持つ。
  各 button は `aria-label` 属性で従来のラベルを保持する。

  | 旧ラベル | 置換アイコン | aria-label |
  | --- | --- | --- |
  | 完了 | `check` | `完了` |
  | 削除 | `trash-2` | `削除` |
  | 現在のタスクにする | `pin` | `現在のタスクにする` |
  | 明日にする | `skip-forward` | `明日にする` |
  | 今日にする | `skip-back` | `今日にする` |

- REQ-2: `<ProjectCard>` の「削除」 button を Lucide `trash-2` に置換する
  (`aria-label="削除"`)。

- REQ-3: `<RoutineCard>` の「削除」 button を Lucide `trash-2` に置換する
  (`aria-label="削除"`)。`<TaskCard>` / `<ProjectCard>` と同じアイコン (= 削除動作の視覚言語統一)。

#### 起票カード (3 枚共通)

- REQ-4: `<TaskFormCard>` / `<ProjectFormCard>` / `<RoutineFormCard>` の `.task-card__actions`
  / `.project-card__actions` / `.routine-card__actions` 段から、`onCancel` を呼ぶ
  「キャンセル」 button を撤去する (= テキスト button の DOM 削除)。

- REQ-5: 各起票カードの root 要素 (`<form className="task-card task-card--form">` 等) に
  右上 ✕ 「閉じる」アイコン button (Lucide `x`, `aria-label="閉じる"`) を配置する。
  - 配置: `position: absolute; top; right` で root に対する右上 (CSS パターンは plan で確定)。
  - 押下時の挙動: 既存 `onCancel` prop と同一の関数を呼ぶ
    (= 親 view 側の `?create=1` 削除 + 入力 state クリア + + ボタン focus 復帰)。
  - 確認ダイアログを出さず即座に閉じる (現状挙動の維持)。

- REQ-6: 各起票カードの「追加」 submit button を Lucide `plus` アイコン button に置換する
  (`aria-label="追加"`)。submit/type 属性は `type="submit"` のまま維持。

- REQ-7: BL-104 で確立した次の挙動を維持する。
  - フォーム open 中に Escape キーで close + + ボタン focus 復帰。
  - 「閉じる ✕」押下で同上 (= `onCancel` 経由)。
  - 起票成功で close + + ボタン focus 復帰。

#### a11y / モバイル要件

- REQ-8: 置換対象 button はすべて `aria-label` を持ち、SR / Playwright の
  `getByRole("button", { name: <ラベル> })` から従来通り辿れる。
- REQ-9: 各 icon button のタッチ領域は最低 44 × 44 px を確保する。
  icon サイズは 16〜20 px (Lucide default 24 px は使わない)、button 側に padding を付けて 44 × 44 を満たす。
- REQ-10: Lucide SVG は `aria-hidden="true"` を持ち、accessibleName 計算に巻き込まれない。
  accessibleName は button 自身の `aria-label` から取る。
- REQ-11: button の `type` 属性 (`type="button"` / `type="submit"`) は現状を維持する。
  「閉じる ✕」は `type="button"` 固定 (誤 submit 防止)。

#### 既存テスト互換性

- REQ-12: `getByRole("button", { name: "削除" })` 等の accessibleName ベースの query は
  そのまま (= `aria-label` で hit する) 引き続き通る。テスト改修は不要。
- REQ-13: button の **textContent** で assertion している既存テスト
  (`task-card-component.test.tsx` / `inline-edit-all-cards.test.tsx` /
  `project-card-component.test.tsx` / `routine-card-component.test.tsx` /
  `task-card-hotfix.test.tsx` 等) は本 BL の改修に **追従する必要がある**
  (= textContent 一致 → accessibleName / `aria-label` 経由の assertion に書き換え)。
  改修対象テストファイル数と件数は plan で確定する。

### 非機能要件

- NFR-1 (a11y): WAI-ARIA Authoring Practices の Icon Button パターンに準拠
  (button 自身の `aria-label` + 子 SVG は `aria-hidden="true"`)。
- NFR-2 (パフォーマンス): `lucide-react` の tree-shaking が有効な ESM import を使い、
  本 BL で実利用するアイコン 6 種 (`check` / `trash-2` / `pin` / `skip-forward` /
  `skip-back` / `x` / `plus` の **7 種**) のみが最終 bundle に入る形にする。
  named import (`import { Trash2 } from "lucide-react"`) を採用する。
- NFR-3 (依存): 新規 dep は `lucide-react` の 1 件のみ。peer dep の `react` は既存と同一バージョンを使う。
- NFR-4 (視覚言語): shadow / hover background / transition / animation の宣言を追加しない
  (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION の継続)。
- NFR-5 (タッチ領域): 各 icon button は 44 × 44 px 以上のヒットエリアを満たす。
  具体的な min-width / min-height / padding の値は plan で確定する。
- NFR-6 (CSS スコープ): 新設する `.card-action-button` 系の共通クラスは独立した
  共有 CSS (例: `web/src/styles/card-action-button.css`) に置くか、3 系統の card CSS で
  個別に同形宣言するかを plan で確定する。tokens.css は触らない。

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う。

```
シナリオ AC-1: TaskCard の 5 button が Lucide アイコンに置換される (REQ-1)
  Given /today (focusedTask + otherTasks あり) を render する
  When  .task-card__actions 内の各 button (および showSetFocus 経路の button) を観察する
  Then  textContent は空 (アイコン SVG のみ) で
   かつ accessibleName が「完了」「削除」「現在のタスクにする」「明日にする」「今日にする」
        の各 button が aria-label でそれぞれ取得できる
   かつ 子要素として 1 個の <svg aria-hidden="true"> が存在する
```

```
シナリオ AC-2: ProjectCard の「削除」 button がアイコンに置換される (REQ-2)
  Given <ProjectCard project=... /> を render する
  When  .project-card__actions 内の button を観察する
  Then  textContent は空で
   かつ accessibleName が「削除」の button が aria-label でちょうど 1 個取得できる
   かつ 子要素として 1 個の <svg aria-hidden="true"> が存在する
```

```
シナリオ AC-3: RoutineCard の「削除」 button がアイコンに置換される (REQ-3)
  Given <RoutineCard routine=... /> を render する
  When  .routine-card__actions 内の button を観察する
  Then  textContent は空で
   かつ accessibleName が「削除」の button が aria-label でちょうど 1 個取得できる
   かつ 子要素として 1 個の <svg aria-hidden="true"> が存在する
```

```
シナリオ AC-4: 起票カード (3 枚) で「キャンセル」テキスト button が撤去される (REQ-4)
  Given <TaskFormCard /> / <ProjectFormCard /> / <RoutineFormCard /> をそれぞれ render する
  When  form 直下の button を全列挙する
  Then  textContent / accessibleName が「キャンセル」の button が 0 個である
```

```
シナリオ AC-5: 起票カード root 右上に「閉じる ✕」 button が配置される (REQ-5)
  Given <TaskFormCard onCancel={mock} /> を render する
  When  form root 直下に accessibleName「閉じる」の button が存在するかを観察する
  Then  accessibleName「閉じる」の button が 1 個存在し
   かつ 子要素として 1 個の <svg aria-hidden="true"> が存在し
   かつ button が card root の右上に配置されている (position: absolute / top / right)
        (CSS 観点の検証は plan に定める jsdom 上の computedStyle / 構造観察で行う)
   かつ click すると mock onCancel が 1 回呼ばれる
  (ProjectFormCard / RoutineFormCard でも同様に成立する)
```

```
シナリオ AC-6: 「閉じる ✕」が type="button" を持ち誤 submit を発生させない (REQ-11)
  Given <TaskFormCard onSubmit={mockSubmit} onCancel={mockCancel} /> を render する
  When  「閉じる」 button を click する
  Then  mockCancel が 1 回呼ばれ, mockSubmit が呼ばれない
```

```
シナリオ AC-7: 「追加」 submit がアイコンに置換され submit 経路が維持される (REQ-6)
  Given <TaskFormCard onSubmit={mock} /> を render する
  When  form 直下から type="submit" の button を探す
  Then  該当 button の textContent が空で
   かつ accessibleName が「追加」 (aria-label) で
   かつ 子要素として 1 個の <svg aria-hidden="true"> が存在する
   かつ click で form の submit イベントが発火し mock が 1 回呼ばれる
  (ProjectFormCard / RoutineFormCard でも同様に成立する)
```

```
シナリオ AC-8: Escape キーでフォームが閉じ + ボタンへ focus が戻る (REQ-7 / BL-104 継続)
  Given /today に ?create=1 で遷移してフォーム open 状態にする
  When  document に keydown "Escape" を dispatch する
  Then  URL から create=1 が消え
   かつ document.activeElement が button.app-shell__create である
```

```
シナリオ AC-9: 「閉じる ✕」 click でも Escape と同じ閉じる経路を辿る (REQ-5)
  Given /today に ?create=1 で遷移してフォーム open 状態にする
  When  accessibleName「閉じる」の button を click する
  Then  URL から create=1 が消え
   かつ document.activeElement が button.app-shell__create である
```

```
シナリオ AC-10: モバイル幅で各 icon button のタッチ領域が 44 × 44 px 以上 (REQ-9 / NFR-5)
  Given <TaskCard /> / <TaskFormCard /> 等を viewport 幅 320 px 相当で render する
  When  各 icon button (= 削除 / 完了 / 閉じる / 追加 / 現在のタスクにする / 明日にする / 今日にする)
        の getBoundingClientRect / computedStyle (min-width / min-height) を観察する
  Then  各 button の幅 ≧ 44 px / 高さ ≧ 44 px を満たす
        (具体的な CSS 宣言 = min-width / min-height / padding は plan で確定. jsdom 検証可能性も plan で確定)
```

```
シナリオ AC-11: SVG が aria-hidden="true" を持ち accessibleName を汚染しない (REQ-10)
  Given 本 BL で置換した任意の icon button を render する
  When  button 配下の svg 要素を観察する
  Then  該当 svg が aria-hidden="true" を持ち
   かつ button.getAttribute("aria-label") の値が SR が読む accessibleName と一致する
```

```
シナリオ AC-12: 既存 getByRole("button", { name: ... }) 系のテストが無改修で通る (REQ-12)
  Given 本 BL 改修後の各カードを render する
  When  既存テストにある getByRole("button", { name: "削除" }) 等を実行する
  Then  対応する icon button が hit する (= aria-label 経由で accessibleName 解決される)
```

```
シナリオ AC-13: 既存 textContent ベース assertion テストが追従改修される (REQ-13)
  Given 本 BL 改修後のソースに対し, 改修対象テストファイル (plan で列挙) を実行する
  When  該当テストを vitest run で実行する
  Then  全件 green (= textContent 一致が aria-label / accessibleName 一致に書き換わっている)
```

## 既存テスト互換性まとめ

### 無改修で通る想定 (REQ-12)

- `getByRole("button", { name: <日本語ラベル> })` を使うもの (`aria-label` で hit)。
  →`web/__tests__/` 内の該当箇所 (約 14 件 grep ヒット) は対象外。

### 改修が必要な想定 (REQ-13)

- button の **textContent** を assertion しているもの:
  - `web/__tests__/task-card-component.test.tsx` (`b.textContent` → `b.getAttribute("aria-label")` ベース)
  - `web/__tests__/task-card-hotfix.test.tsx` (focus-view actions / 起票カード「キャンセル」/「追加」 textContent)
  - `web/__tests__/inline-edit-all-cards.test.tsx` (3 系統「削除」/「キャンセル」 textContent assertion)
  - `web/__tests__/project-card-component.test.tsx` (「削除」/「キャンセル」 textContent)
  - `web/__tests__/routine-card-component.test.tsx` (「削除」/「キャンセル」 textContent)
  - `web/__tests__/common-button-style.test.tsx` の `findButtonClassNameByLabel` ベース AC
    (= textContent で button block を探す helper を使っている; 該当はカード系 6 ファイルが対象。
    helper を「`aria-label` 属性値でも hit する」形に拡張するか、本 BL での CSS 宣言検証を
    別 helper で切り出すかを plan で確定。)
- 追加 / キャンセル の textContent を直接見ている AC-11 系 (起票カードの「追加」存在確認) は
  `aria-label="追加"` ベースに書き換える。

正確な対象テストファイル数と件数は plan / tasks で確定する。

## 未決事項 / 確認待ち

- 右上「閉じる ✕」 button の **CSS パターン** を 3 起票カード共通で 1 ファイル
  (`web/src/styles/card-close-button.css` 新設) にまとめるか、
  既存の `task-card.css` / `project-card.css` / `routine-card.css` の 3 ファイルで個別宣言するか。
  → plan で確定する (初期提案: **3 ファイル個別宣言** で 系統独立の既存方針を維持。
  CSS の重複は 3 〜 5 宣言で許容)。
- icon button の **共通クラス** (`.card-action-button` 等) を新設するか、
  個別 button にそれぞれ min-width / min-height / padding を当てるか。
  → plan で確定する (初期提案: **共通クラス `.card-action-button` を 3 系統 CSS で再宣言**.
  名前は系統横断で同一にし JSX 側も `className="card-action-button"` で揃える)。
- `common-button-style.test.tsx` の `findButtonClassNameByLabel` helper を本 BL で拡張するか
  (= `aria-label` 属性値でも button block を hit する形に変更) を test-designer / implementer が判断する。
- icon サイズ: 16 / 18 / 20 px のいずれを採用するか。
  → plan の初期提案: **18 px** (Lucide の `size` prop で指定。視覚的に既存テキストとの密度比を見て調整可)。
