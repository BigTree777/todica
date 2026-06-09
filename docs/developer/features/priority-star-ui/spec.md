# 仕様: 優先度 UI を星 3 つの評価式に変更 (priority-star-ui)

- 状態: ドラフト
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-040
  - 上位要件: FR-003 (優先度の付与) / FR-004 (優先度の変更)
  - 関連 feature: [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md), [`../task-priority/spec.md`](../task-priority/spec.md)
  - 後続 feature: BL-042 (`task-card-actions/`) はカードアクションの簡素化で本 UI を前提とする

## 背景 / 課題

現状, 起票フォームとタスクカードの優先度 UI は次のとおり.

- 起票フォーム (`today-view.tsx` / `tomorrow-view.tsx`): `<select>` で「最優先 / 普通 / 後回し」の 3 値.
- タスクカード上 (`today-view.tsx` の一覧行 + 「現在のタスク」セクション): `<button aria-label="優先度を切替 (現在: 普通)">` を 1 クリックで cycle (normal → highest → later → normal).

意味は明確だが, 視覚的にスキャンしづらく, モックアップ ([`local/image.png`](../../../local/image.png) を参照) は ☆☆☆ + 「↑タップで選択」のラベルで「星 3 つの評価式」を採用している. 本 BL ではこの方向に揃え, ドメイン値はそのままに UI 表現と入力体験のみを切り替える.

## ゴール / 非ゴール

- ゴール:
  - 起票フォーム + タスクカードの優先度 UI を「3 つ星のクリック式」に統一する.
  - 星の点灯数とドメイン値の対応を確定する (星 3 = `highest` / 星 2 = `normal` / 星 1 = `later`).
  - 一覧上の優先度変更を「タップで直接, 任意の値に飛べる」操作 (cycle ではない) にする.
  - `web/src/ui/priority-stars/` に共通コンポーネント `<PriorityStars />` を新設し, today / tomorrow の双方が同じ部品を使う.
- 非ゴール:
  - サーバ API (`POST /api/v1/tasks` / `PATCH /api/v1/tasks/:id`) と `Priority` 型 (`"highest" | "normal" | "later"`) は変更しない.
  - 「タスク編集フォーム」(`today-view.tsx` の編集ダイアログ) は現状, 優先度入力欄を持たないので触らない.
  - focus-view (`/focus`) は現状, 優先度入力 UI を持たないので触らない (アクションは「次へ」「完了」のみ).
  - タスクカードのアクション削減 (BL-042) は別 BL の責務. 本 BL は優先度 UI の置換のみ.
  - 楽観 UI 経路や ConflictDialog / `notifyError` 経路の新規追加・改修は行わない (既存経路をそのまま使う).
  - カラートークン / `tokens.css` の新規追加は ui-redesign-foundation (BL-046) に委ねる. 本 BL は手元に閉じた最小限の CSS で WCAG AA を満たす.

## 要件

### 機能要件

- **REQ-1 (起票フォームの優先度入力 = 星 3 つ)**
  起票フォーム (today-view / tomorrow-view) は優先度の入力に `<select>` を使わず, 横並びの星 3 つで入力する. 初期値は `"normal"` (= 星 2 つ点灯). マウス / タッチで点灯数を変更でき, キーボードでも到達 (Tab) と決定 (Enter / Space) ができる. 視覚的に「点灯/非点灯」が明確に区別できるスタイルを持つ.

- **REQ-2 (星の点灯数とドメイン値のマッピング)**
  星の点灯数 → `Priority` 値の対応は次のとおり固定する.
  - 星 3 つ点灯 (☆☆☆ 全点灯) → `"highest"`
  - 星 2 つ点灯 → `"normal"`
  - 星 1 つ点灯 → `"later"`
  星 0 (全消灯) は表現しない. ドメイン側に "none" が無いため.

- **REQ-3 (タスクカード上の優先度 UI = 星 3 つの直接クリック)**
  タスクカード (today-view の一覧行 + 「現在のタスク」セクション) の `<button aria-label="優先度を切替 (現在: ...)">` (cycle ボタン) は撤去し, 同じ `<PriorityStars />` に置換する. 1 番目の星をクリック → `later` / 2 番目 → `normal` / 3 番目 → `highest` を PATCH /api/v1/tasks/:id で送る. 現状値と同じ値をクリックしても問題ないが, 不要な PATCH を抑止するため「同値クリック時は no-op」とする (詳細は plan で).

- **REQ-4 (アクセシビリティ)**
  - 各星に意味のある `aria-label` を付ける (例: 「星 1 つ目 (低)」「星 2 つ目 (中)」「星 3 つ目 (高)」). 並びの位置と意味の両方が screen reader で伝わること.
  - コンポーネント全体に「現在の優先度: 普通」相当が screen reader で読める仕組みを持つ (例: ラジオグループ的な `aria-label` + 選択中星の `aria-pressed="true"`).
  - フォーカスリングは OS 既定 (outline) を消さない. キーボードユーザがフォーカス位置を見失わないこと.

- **REQ-5 (WCAG 2.1 AA contrast の維持)**
  点灯星 / 非点灯星 / 背景の組合せでコントラスト比 4.5:1 以上 (テキスト等価部分) を満たす. BL-029 / BL-038 で導入済みの axe チェック (今日 / 明日 / ゴミ箱 / ルーティン / 設定の 5 view) で violations 0 件を維持する.

- **REQ-6 (既存のエラー / 衝突経路の維持)**
  優先度変更時の PATCH が 412 (optimistic lock) を返した場合は, 既存どおり `ConflictDialog` を開く. その他の通信エラーは既存どおり `notifyError("通信に失敗しました")`. オフライン時は既存どおり `offline-queue` に積む. 本 BL ではこれらの経路に変更を加えない.

### 非機能要件

- **NFR-A11Y**: axe による WCAG 2.1 AA 違反 0 件 (BL-029 で導入済みの e2e/a11y.spec.ts の 5 view 全てで violations = 0).
- **NFR-PERF**: コンポーネントの再レンダリングは「自タスクの priority 変化」または「親の再レンダ」に限定する (`React.memo` は任意, 過剰最適化は不要).
- **NFR-COMPAT**: ドメイン値 (`Priority` 型) と HTTP API は無改修で動くこと. e2e で「星クリック → PATCH 成功 → 表示が更新される」を確認できれば良い.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: 起票フォームに 3 つ星の優先度 UI が出る (today)
  Given /today を開いた
  When  ページが描画される
  Then  起票フォーム内に, role="button" (または等価な押下可能要素) の星が 3 つ並んでいる
   かつ 初期表示で 2 つ目までが「点灯」状態 (= priority 既定値 normal)
   かつ <select id="task-priority"> は DOM に存在しない
```

```
シナリオ AC-2: 起票フォームで星 3 つ目をクリックして追加すると create.priority === "highest" (today)
  Given /today で起票フォームが表示されている
   かつ タスク名に "星 3 テスト" を入力した
  When  3 番目の星をクリックする
   かつ 「追加」ボタンを押す
  Then  TaskRepository.create が priority="highest" を含む引数で呼ばれる
   かつ 起票後, 星の表示は既定 (2 つ点灯 = normal) に戻る
```

```
シナリオ AC-3: 起票フォームで星 1 つ目をクリックして追加すると create.priority === "later" (today)
  Given /today で起票フォームが表示されている
   かつ タスク名に "星 1 テスト" を入力した
  When  1 番目の星をクリックする
   かつ 「追加」ボタンを押す
  Then  TaskRepository.create が priority="later" を含む引数で呼ばれる
```

```
シナリオ AC-4: 起票フォームの優先度 UI は明日ビューにも同様に存在する (tomorrow)
  Given /tomorrow を開いた
  When  ページが描画される
  Then  起票フォーム内に星 3 つの優先度 UI が並んでいる
   かつ <select id="tomorrow-task-priority"> は DOM に存在しない
   かつ 星 3 つ目をクリック → 追加すると create.priority === "highest" かつ dueDate === "tomorrow"
```

```
シナリオ AC-5: タスクカード上で星 1 つ目をクリックすると PATCH priority="later" が送られる
  Given /today にタスク T (priority="normal", version=v) が表示されている
  When  T のカード上の 1 番目の星をクリックする
  Then  TaskRepository.update が { id: T.id, ifMatch: v, patch: { priority: "later" } } で呼ばれる
   かつ aria 表現 (現在の優先度: ...) が "後回し" 相当に変化する
   かつ 1 番目の星のみが点灯した見た目になる
```

```
シナリオ AC-6: タスクカード上で現在値と同じ星をクリックしても PATCH は送られない
  Given /today にタスク T (priority="normal") が表示されている
  When  T のカード上の 2 番目の星 (= 現在値) をクリックする
  Then  TaskRepository.update は呼ばれない
```

```
シナリオ AC-7: タスクカードに旧「優先度を切替」ボタンは存在しない
  Given /today にタスク T が表示されている
  When  T のカード内を探索する
  Then  aria-label / テキストに「優先度を切替」を含むボタンは見つからない
```

```
シナリオ AC-8: PATCH が 412 を返した場合, ConflictDialog が開く
  Given /today にタスク T (priority="normal", version=v) が表示されている
   かつ サーバが PATCH /api/v1/tasks/:id に 412 を返すよう構成されている
  When  T のカード上の 3 番目の星をクリックする
  Then  ConflictDialog が表示される (state.open === true)
   かつ 既存の onAcceptServer / onRetryWithServer の経路は変わらない
```

```
シナリオ AC-9: アクセシビリティ違反 0 件を維持する (E2E / axe)
  Given /today と /tomorrow がレンダリングされている
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする
  Then  violations.length === 0 (BL-029 / BL-038 と同条件)
```

```
シナリオ AC-10: 「現在のタスク」セクションでも星 3 つ UI に置き換わっている
  Given /today にタスク T が表示され, T が「現在のタスク」として強調表示されている
  When  「現在のタスク」セクションを観察する
  Then  優先度 UI は星 3 つのコンポーネントである (旧 cycle ボタンは無い)
   かつ 星クリックで update.patch.priority が送信される
```

## 未決事項 / 確認待ち

- **U-1 (キーボード操作の拡張)**
  REQ-1 では Tab + Enter/Space で星の選択ができれば最低要件を満たす. 追加で 「← → の矢印キーで点灯数を変更」「1 / 2 / 3 の数字キーで直接選択」をサポートするかは未決. 本 BL の初版では「追加しない」で進め, 必要なら別 BL で拡張する案で plan を書く.

- **U-2 (星の色)**
  点灯色は WCAG AA を満たす範囲で `#B45309` (アンバー 700 相当) 等を仮置きする. 確定値とトークン化 (`--color-accent` 等) は ui-redesign-foundation (BL-046) に合流して決める. 本 BL ではコンポーネント内の CSS にローカル値で置く.

- **U-3 (CSS の置き場所)**
  `web/src/ui/priority-stars/priority-stars.css` を新設する案を plan で採るが, BL-046 でデザイントークン基盤が整い次第移行する想定. 本 BL の段階では「コンポーネントローカルの CSS」で良い (依存追加を避ける).

- **U-4 (star の意味的 role)**
  星 3 つを `role="radiogroup"` + 各星 `role="radio"` で実装するか, `<button aria-pressed>` の 3 連 + group の `aria-label` で実装するか. plan で「ラジオグループ案」を第一候補に置くが, axe の挙動次第で `aria-pressed` に切り替える余地を残す.
