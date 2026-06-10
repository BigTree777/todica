# 仕様: 「現在に設定」操作の導線再設計 (set-focus-gesture)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-043
  - 上位要件: FR-012 (今日のタスクから 1 つを "現在のタスク" に選べる)
  - 関連 NFR: NFR-001 (単一ワークフロー強制) / NFR-011 (フォーカス時の単独大表示) / NFR-013 (並び順の予測可能性)
  - キーボード操作性: backlog の表記に従い NFR-010 と紐付ける. 厳密には requirements.md の NFR-010 は「最小手数の起票」だが, BL-029 以降「キーボード操作のみで主要操作が完結すること」を NFR-010 補強として運用しており, 本 BL もその慣行に倣う.
  - 関連 feature:
    - [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) REQ-3 (カードのアクション最大 3) / REQ-5 (set focus の代替経路は BL-043 で確定. 候補は「長押し or コンテキストメニュー or 専用ボタン」. キーボード経路必須)
    - [`../task-card-actions/spec.md`](../task-card-actions/spec.md) BL-042: 「現在に設定 / 現在解除」 button と `setFocusMutation` を撤去 (REQ-3 / U-3 で「BL-043 で再導入」と確定済み)
    - [`../focus-view/spec.md`](../focus-view/spec.md) BL-037: `/focus` のアクションは「削除 / 完了」の 2 つのみ. 「現在に設定」「現在解除」は置かない (非ゴールとして確定済み)
    - [`../focus-task/spec.md`](../focus-task/spec.md) BL-006: `PUT /api/v1/focus` (明示設定 / 解除), 暗黙フォールバック (`currentTaskId ?? nextTaskId`), 自動解除 (`clearFocusIfMatches`), `INVALID_FOCUS_TARGET` (今日のタスク以外は 400)

## 背景 / 課題

BL-042 (task-card-actions) で今日ビューのタスクカードからアクションを「削除 / 明日にする / 完了」の 3 つに削減した際, 「現在に設定」「現在解除」 button および `setFocusMutation` を撤去した. その結果, **UI 上に FR-012「今日のタスクから 1 つを現在のタスクに選ぶ」操作の導線が存在しない** 状態になっている (現在は暗黙フォールバック = 並び先頭しか「現在のタスク」になれない).

- サーバ側 (`PUT /api/v1/focus`, BL-006) と Repository 層 (`TaskRepository.setFocus`, HTTP / Local 両実装) は無傷で残っている. 欠けているのは UI 導線のみ.
- E2E `e2e/state-restoration.spec.ts` の「リロード後も明示的に設定したフォーカス対象が復元される」は BL-042 で test.skip となり, BL-043 での skip 解除が予告されている.
- foundation REQ-5 は「set focus はカード上の 3 アクションボタンには含めず, 別経路 (長押し or コンテキストメニュー or 専用ボタン) で行う. UX は BL-043 で確定. キーボード経路も必須」と規定している.

本 BL ではこの UX を確定し, 今日ビュー上から任意のタスクを focus に昇格でき, focus-view (`/focus`) に反映される状態を回復する.

## UX の決定: カード上の専用コントロール「現在のタスクにする」

候補 4 案を比較し, **タスクカード上の専用コントロール (常時表示の `<button>`「現在のタスクにする」)** を採用する.

| 候補 | 判定 | 理由 |
| --- | --- | --- |
| **専用コントロール (採用)** | 採用 | ネイティブ `<button>` 1 つでマウス / タッチ / キーボードの 3 入力手段が単一の実装経路で同等に動く. 発見可能性が高く「迷わない」(NFR-001 の精神). E2E が決定論的に書ける. foundation REQ-5 が明示的に許容する候補の 1 つ. |
| カード長押し | 不採用 | ブラウザ / Android WebView のテキスト選択・ネイティブコンテキストメニューと衝突する. タイマー実装が必要で個人開発 (CONSTRAINT-001) に対しコスト過大. 可視の手がかりがなく発見可能性が低い. キーボード代替経路を別途実装する必要があり, 実装・テスト表面が二重になる. |
| 右クリックコンテキストメニュー | 不採用 | タッチに対応する操作が長押しになり, 結局上記の問題を抱える. ネイティブメニューの抑止 (preventDefault) は PWA / WebView で挙動差があり, モバイル主要利用と相性が悪い. |
| カードタップ (カード全体) | 不採用 | カードタップは「名称編集ダイアログ起動」(BL-042 U-4 / foundation REQ-5) のために予約されており, 将来の編集 BL と衝突する. 誤タップで focus が変わる事故も起きやすい. |

### foundation REQ-3「アクション最大 3 つ」との整合

「現在のタスクにする」はタスク自体を変異させるアクション (削除 / 期限切替 / 完了) ではなく, **「どのカードが現在か」という選択状態の切替** である. BL-040 / BL-042 で確立した分類 (「`PriorityStars` は状態表示でありアクションボタンのカウント外」, task-card-actions REQ-1) を踏襲し, 本コントロールも **状態系コントロールとしてアクション 3 ボタンのカウント外** とする. DOM 上もアクションボタン群 (削除 / 明日にする / 完了) とは分離し, `PriorityStars` と同じ状態系グループに配置する. foundation REQ-3 自体も「名称編集 / 優先度切替 / focus 設定はカード上のアクションには含めない (詳細は REQ-5)」とし, REQ-5 が専用ボタンを候補として認めているため, 規約との矛盾はない.

## ゴール / 非ゴール

### ゴール

- 今日ビュー (`/today`) のタスク一覧の各カードから, そのタスクを「現在のタスク」に明示設定できる (FR-012 の UI 導線の回復).
- 設定結果が today-view の強調セクションおよび focus-view (`/focus`) に反映される.
- 設定はリロード後も復元される (`FocusSelection.currentTaskId` の永続化. BL-006 既存機構).
- マウス / タッチ / キーボードのいずれでも同等に操作が完結する (Tab 到達 + Enter / Space で発火).
- BL-042 で撤去した `setFocusMutation` / `handleSetFocus` を today-view に再導入する (task-card-actions U-3 の確定方針).
- E2E `state-restoration.spec.ts` の skip 中テストを新 UI に追随させて解除する.

### 非ゴール

- **「現在解除」UI の提供**: 提供しない (詳細は要件 REQ-4). 解除は完了 / 削除 / 期限変更時のサーバ側自動解除 (FR-013 / BL-006 `clearFocusIfMatches`) のみとする.
- **tomorrow ビューへの適用**: 適用しない (詳細は要件 REQ-5). FR-012 は「今日のタスクから選ぶ」であり, サーバも `dueDate = "tomorrow"` のタスクは `400 INVALID_FOCUS_TARGET` で拒否する (focus-task spec).
- **focus-view (`/focus`) の変更**: BL-037 で確定した「削除 / 完了」の 2 アクションを維持する. focus-view に「現在のタスクにする」「現在解除」は置かない.
- **サーバ API / ドメイン層 / Repository インターフェイスの変更**: `PUT /api/v1/focus` (BL-006), `TaskRepository.setFocus` (HTTP / Local 両実装) は無改修で再利用する.
- **長押し / コンテキストメニュー等の追加ジェスチャの併設**: 採用した専用コントロール 1 経路のみとする (NFR-001: 操作経路を増やさない).
- **名称編集の代替 UI**: 別 BL の責務 (BL-042 U-4 で予告済み).
- **デザイントークン化 / アイコン化**: BL-046 の責務. 本 BL はテキストラベルの `<button>` で実装する.

## 要件

### 機能要件

- **REQ-1 (今日ビューの一覧カードに「現在のタスクにする」コントロールを置く)**
  - `/today` のタスク一覧 (`<ul aria-label="タスク一覧">`) の各カードに, アクセシブルネーム「現在のタスクにする」の `<button type="button">` を 1 つ置く.
  - DOM 上の配置はアクションボタン群 (削除 / 明日にする / 完了) より前とし, `PriorityStars` と同じ状態系グループとして扱う (アクション 3 ボタンのカウント外).
  - origin = "routine" のタスクにも表示する (BL-005 / BL-006 と同じく, focus 対象としてルーティン由来を区別しない).
  - 強調セクション (`<section aria-label="現在のタスク">`) には置かない (既に現在のタスクであるため. 重複表示禁止 D-008 により強調対象は一覧に現れず, 「既に focus 中のタスクにボタンが見える」状態は発生しない).

- **REQ-2 (クリックで明示 focus 設定が行われる)**
  - コントロールの作動で `PUT /api/v1/focus` に `{ taskId: <タスク id> }` を送る (`TaskRepository.setFocus({ taskId, ifMatch: FocusSelection.version })`. Idempotency-Key / If-Match の規約は BL-006 のまま).
  - 成功時に `["today"]` / `["focus"]` の query を invalidate し, 再フェッチ後:
    - today-view の強調セクションに対象タスクが表示される (元の強調対象は一覧に戻る).
    - focus-view (`/focus`) に対象タスクが大表示される.
  - `FocusSelection` が未ロードの間 (focus query の data が無い間) は作動を no-op とする (旧 BL-006 実装 `if (!focus) return` の踏襲).

- **REQ-3 (キーボード経路: マウス / タッチと同等)**
  - コントロールはネイティブ `<button type="button">` で実装し, Tab でフォーカス到達でき, Enter / Space で作動する (独自キーイベント処理を実装しない. ネイティブセマンティクスに委ねる).
  - フォーカスリング (OS / ブラウザ既定の outline) を消さない.
  - キーボードのみ (Tab / Enter) で「一覧の任意タスクを focus に昇格 → 強調セクションに反映」が完結すること.

- **REQ-4 (「現在解除」は提供しない)**
  - 解除 UI (「現在解除」 button や, 設定済みコントロールの再押下によるトグル解除) は提供しない.
  - 理由: (1) BL-037 / BL-042 で解除 UI を撤去済みであり, 「focus の変更は『別のタスクを選ぶ』か『完了 / 削除 / 期限変更による自動解除』のみ」に経路を絞る方が NFR-001 (単一ワークフロー) に適合する. (2) 解除しても暗黙フォールバックで並び先頭が現在になるため, 「解除したのに何かが現在のまま」というユーザー混乱 (focus-task spec の既知の懸念) を再導入する価値がない.
  - `PUT /api/v1/focus { taskId: null }` のサーバ機能自体は無改修で残す (UI から呼ばないだけ).

- **REQ-5 (tomorrow ビューには置かない)**
  - `/tomorrow` のタスクカードには「現在のタスクにする」コントロールを置かない.
  - 根拠: FR-012「**今日の**タスクから 1 つを選べる」. サーバも `dueDate = "tomorrow"` のタスクへの設定を `400 INVALID_FOCUS_TARGET` で拒否する (BL-006 確定済み). UI に置いても必ず失敗する操作になるため置かない.

- **REQ-6 (focus-view は無改修)**
  - `/focus` のアクションは「削除 / 完了」の 2 ボタンのまま (BL-037 REQ-4 維持). 本 BL で focus-view のコンポーネントは変更しない.

- **REQ-7 (エラー処理と再試行可能性)**
  - 通信失敗・サーバエラー時は `notifyError("通信に失敗しました")` を表示する (BL-034 既存機構).
  - 412 (focus の楽観ロック衝突) 時も同様に `notifyError` に流す (ConflictDialog は task エントリ前提の機構であり FocusSelection には適用しない).
  - **失敗時にも `["focus"]` を invalidate して最新の `FocusSelection.version` を取得する** (412 後に stale な version で再試行不能になる状態を作らない. 旧 BL-006 実装からの改善点).
  - offline 時 (`!navigator.onLine`) は他 mutation と同様に書込キュー (`offline-queue`) に enqueue し, 楽観的に成功扱いとする (BL-018 既存機構の踏襲).

### 非機能要件

- **NFR-A11Y**: `e2e/a11y.spec.ts` の axe 検査 (WCAG 2.1 AA) で violations 0 件を維持する.
- **NFR-001 整合**: focus を変える経路は「一覧の別タスクを選ぶ」「完了 / 削除 / 期限変更による自動解除」の 2 系統のみ. 解除 UI・追加ジェスチャ・設定項目は増やさない.
- **NFR-011 整合**: focus-view / 強調セクションの大表示構造は無改修. 本コントロールは一覧カード側にのみ追加する.
- **NFR-013 整合**: 並び順 (`priority → createdAt → id`) に影響を与えない. 明示 focus は表示上の強調対象を変えるだけで, 一覧の順序は不変.
- **NFR-COMPAT**: サーバ API / DB / ドメイン層 / `TaskRepository` インターフェイス無改修. `LocalTaskRepository.setFocus` 実装済みのため Android ローカルモードでも同一 UI で動作する.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う. いずれも Playwright E2E で検証可能な粒度で書く.

```
シナリオ AC-1: 一覧の各カードに「現在のタスクにする」コントロールがある
  Given /today を開いた
   かつ タスク一覧 (aria-label="タスク一覧") に強調対象でないタスクが 2 件以上表示されている
  When  各タスクカード (listitem) を観察する
  Then  各カード内にアクセシブルネーム「現在のタスクにする」の button が 1 個ずつ存在する
   かつ アクションボタン「削除」「明日にする」「完了」は従来どおり存在する (BL-042 の 3 ボタン規約は不変)
   かつ 強調セクション (aria-label="現在のタスク") 内には「現在のタスクにする」button が存在しない
```

```
シナリオ AC-2: クリックで任意タスクが focus に昇格し強調セクションに反映される
  Given /today に タスク A (並び先頭 = 暗黙の現在のタスク) と タスク B (一覧側) が表示されている
   かつ FocusSelection.currentTaskId = null
  When  B のカード内の「現在のタスクにする」button をクリックする
  Then  PUT /api/v1/focus が { taskId: B.id } で呼ばれる (If-Match = FocusSelection.version)
   かつ 再フェッチ後, 強調セクション (aria-label="現在のタスク") に B の名前が表示される
   かつ A は一覧側に表示される (強調対象との重複表示なし)
   かつ GET /api/v1/focus の currentTaskId は B.id を返す
```

```
シナリオ AC-3: 設定した focus が focus-view (/focus) に反映される (BL-043 完了の目安)
  Given /today で タスク B (並び先頭ではない) の「現在のタスクにする」をクリックした
  When  サイドバーの「現在のタスク」リンクで /focus に遷移する
  Then  focus-view に B の名前が大表示される
   かつ focus-view のアクションは「削除」「完了」の 2 ボタンのまま (BL-037 無改修)
   かつ focus-view に「現在のタスクにする」「現在解除」の button は存在しない
```

```
シナリオ AC-4: 明示設定した focus はリロード後も復元される
  Given /today で タスク B (priority="later" 等で並び先頭にならない) を「現在のタスクにする」で明示設定した
   かつ 強調セクションに B が表示されている
  When  ページをリロードする
  Then  強調セクションに引き続き B が表示される (currentTaskId が永続化されており暗黙フォールバックではない)
  ※ e2e/state-restoration.spec.ts の skip 中テストを新ラベル「現在のタスクにする」に追随させて解除する.
```

```
シナリオ AC-5: キーボードのみで focus 設定が完結する
  Given /today にタスクが 2 件以上表示されている
  When  マウスを使わず Tab キーで一覧側タスク B の「現在のタスクにする」button にフォーカスを移動し Enter を押す
  Then  PUT /api/v1/focus が { taskId: B.id } で呼ばれる
   かつ 強調セクションに B の名前が表示される
```

```
シナリオ AC-6: routine 由来タスクも focus に昇格できる
  Given /today に origin="routine" のタスク R が一覧側に表示されている
  When  R のカード内の「現在のタスクにする」button をクリックする
  Then  強調セクションに R の名前が表示される
```

```
シナリオ AC-7: tomorrow ビューには「現在のタスクにする」が存在しない
  Given /tomorrow を開いた
   かつ タスクが 1 件以上表示されている
  When  画面全体を観察する
  Then  アクセシブルネーム「現在のタスクにする」の button は存在しない
   かつ カードのアクションは「削除」「今日にする」「完了」のまま (BL-042 無改修)
```

```
シナリオ AC-8: 解除 UI は存在しない (解除は自動解除のみ)
  Given /today で タスク B を「現在のタスクにする」で明示設定した
  When  /today および /focus の画面全体を観察する
  Then  アクセシブルネーム「現在解除」「現在に設定」の button は存在しない
  When  強調セクションの B を「完了」する
  Then  サーバ側で FocusSelection.currentTaskId が null に解除され (FR-013),
        再フェッチ後は暗黙フォールバックにより並び先頭が強調セクションに表示される
```

```
シナリオ AC-9: 設定失敗時はエラーバナーが表示され再試行できる
  Given /today に タスク B が表示されている
   かつ サーバが PUT /api/v1/focus に対し失敗 (412 またはネットワークエラー) を返す状態にある
  When  B の「現在のタスクにする」button をクリックする
  Then  「通信に失敗しました」のエラーバナーが表示される (BL-034)
   かつ ["focus"] が再フェッチされ, 最新の version で再度「現在のタスクにする」を実行すると成功する
```

```
シナリオ AC-10: アクセシビリティ違反 0 件を維持する
  Given /today, /tomorrow, /focus がレンダリング可能
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする
  Then  すべての view で violations.length === 0
```

## 未決事項 / 確認待ち

- **U-1 (コントロールのラベル文言)**: 「現在のタスクにする」を採用する (backlog BL-043 の文言と一致). 代替案は「現在にする」(短いが「期限を現在にする」と誤読しうる) /「現在に設定」(旧ラベル. skip 中 E2E が参照しているが, 動詞形の「明日にする / 今日にする」と整合しない). 異論があれば plan 確定前に変更する.
- **U-2 (視覚表現)**: 本 BL ではテキストラベルの button とし, 視覚スタイル (アイコン化・配色・配置の微調整) は BL-046 (デザイントークン) 以降に委ねる. `/* TODO(BL-046) */` マーカーを残す.
- **U-3 (NFR 番号の表記)**: backlog はキーボード経路の根拠を NFR-010 と表記しているが, requirements.md の NFR-010 は「最小手数の起票」である. 本 spec は BL-029 の運用慣行 (キーボード操作性 = NFR-010 補強) に倣って紐付けた. requirements.md 側に「キーボード操作性」の NFR を正式採番するかは本 BL のスコープ外とし, 必要なら別途ユーザーに確認する.
- **U-4 (offline 時の挙動の検証範囲)**: REQ-7 で enqueue 方針を既存機構踏襲としたが, focus 設定の offline E2E を追加するかは未確定. **保守側デフォルト案: 省略する** (キュー機構自体は BL-018 でテスト済みであり, mutation の組み立ては既存 4 mutation と同型のため).
