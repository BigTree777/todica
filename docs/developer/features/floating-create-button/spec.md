# 仕様: 起票カードを + ボタン展開式に変更する

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) の BL-104

## 背景 / 課題

today / tomorrow / projects / routines の 4 ビューでは起票カード
(`<TaskFormCard>` / `<ProjectFormCard>` / `<RoutineFormCard>`) が常時表示されており、
タスク一覧の閲覧時に画面スペースを占有して視認性を下げる。
ユーザー評価で「普段は隠しておきたい、起票したいときだけ出したい」と判定された。

## ゴール / 非ゴール

- ゴール:
  - AppShell 右上の更新ボタン (`.app-shell__reload`, ↻) の**左側**に + ボタン
    (`.app-shell__create`, fixed) を新設し、現在のルートに応じた起票フォームを開く起点にする。
  - 4 ビュー (today / tomorrow / projects / routines) で常時表示されていた起票カードを撤去し、
    + ボタン押下時のみフォームが展開される折りたたみ式に変更する。
  - フォーカス / 設定 / ゴミ箱 (`/focus`, `/settings`, `/trash`) では + ボタン自体を非表示にする。
  - フォームを閉じる経路 (× / キャンセル / Escape / 起票成功) を統一する。
- 非ゴール:
  - focus-view の構成変更 (focus-view は起票フォームを持たないため対象外)。
  - 既存のハンバーガーボタン (BL-049) と更新ボタン (BL-093) の挙動変更。
  - `<ProjectCreateDialog>` (BL-044 別系統) の改修。
  - domain / server / Repository / Mutation interface の変更。
  - shadow / hover / transition / animation の追加 (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)。

## 要件

### 機能要件

- REQ-1: AppShell の右上 fixed エリアに + ボタン (`.app-shell__create`) を配置する。
  位置は更新ボタン (`.app-shell__reload`) の**左側**で、両者は重ならない。
- REQ-2: + ボタンは現在のルートに応じて表示 / 非表示を切り替える。
  - 表示: `/today`, `/tomorrow`, `/projects`, `/routines`
  - 非表示: `/focus`, `/settings`, `/trash`, 上記以外 (`/setup`, `/login` など)
- REQ-3: + ボタン押下で、現在のルートに対応するビューの起票フォームを展開する。
  - `/today` → today-view の `<TaskFormCard>` を展開
  - `/tomorrow` → tomorrow-view の `<TaskFormCard>` を展開
  - `/projects` → projects-view の `<ProjectFormCard>` を展開
  - `/routines` → routines-view の `<RoutineFormCard>` を展開
- REQ-4: 4 ビューでは初期状態で起票フォームを描画しない (`formOpen=false` 初期値)。
  + ボタン押下後の `formOpen=true` 中のみ条件付きで描画する。
- REQ-5: 展開されたフォーム上に閉じる手段として明示的なキャンセルボタンを置く。
  ラベルは「キャンセル」とし、押下でフォームを閉じる。
- REQ-6: `formOpen=true` 中に `Escape` キーを押すとフォームが閉じる。
  入力フォーカスがフォーム内 input にある場合も対象とする。
- REQ-7: フォーム内「追加」ボタン押下で起票 mutation を発行する。起票成功時は
  フォームを自動で閉じる (`formOpen` を `false` に戻す)。連続起票したい場合は
  ユーザーが + を再度押す。
- REQ-8: 起票失敗時 (通信エラー等) はフォームを開いたまま維持し、入力値を保持する。
  (失敗時の通知は既存 `notifyError` 経路を踏襲)。
- REQ-9: フォームを閉じるとき、入力値はクリアする (再度開いたら空の状態から始める)。
- REQ-10: + ボタン押下でフォームを展開した直後、フォームの先頭 input (例:
  タスク名 / プロジェクト名 / ルーティン名の入力フィールド) にフォーカスを移す。

### 非機能要件

- REQ-11: + ボタンに `aria-label` を付与する。ラベルはルートに応じて以下とする (U-3)。
  - `/today`, `/tomorrow` → 「タスクを追加」
  - `/projects` → 「プロジェクトを追加」
  - `/routines` → 「ルーティンを追加」
- REQ-12: + ボタンに `aria-expanded` を付与し、対応するビューの `formOpen` 状態を反映する。
  - 表示ルートかつ `formOpen=false` → `aria-expanded="false"`
  - 表示ルートかつ `formOpen=true` → `aria-expanded="true"`
- REQ-13: フォームを閉じた経路がキャンセル / Escape のとき、フォーカスを + ボタンに戻す。
  成功時自動 close ではフォーカス復帰を行わない (一覧側に視線が戻る想定)。
- REQ-14: スタイルはデザイントークン (`tokens.css`) の既存変数のみを使用する。
  shadow / hover / transition / animation は追加しない (NFR-NO-SHADOW /
  NFR-NO-HOVER-TRANSITION)。
- REQ-15: + ボタンと既存ボタン (`.app-shell__hamburger`, `.app-shell__reload`) は
  互いに重ならない。`/focus`, `/settings`, `/trash` で + を非表示にした際にも、
  更新ボタンとハンバーガーボタンの座標は変わらない。

## 受け入れ基準

### AC-1: + ボタンの初期表示 (today)

```
シナリオ: /today で + ボタンが表示される
  Given アプリが起動している
  When  /today を開く
  Then  画面右上の更新ボタンの左側に + ボタンが表示される
  And   + ボタンに aria-label="タスクを追加" が付与されている
  And   + ボタンに aria-expanded="false" が付与されている
  And   today-view の起票フォーム (role="form", aria-label="タスク起票フォーム") は表示されていない
```

### AC-2: + ボタンの初期表示 (tomorrow / projects / routines)

```
シナリオ: 各ルートで + ボタンの aria-label がルートに応じて変わる
  Given アプリが起動している
  When  /tomorrow を開く
  Then  + ボタンの aria-label="タスクを追加" である
  When  /projects を開く
  Then  + ボタンの aria-label="プロジェクトを追加" である
  When  /routines を開く
  Then  + ボタンの aria-label="ルーティンを追加" である
  And   いずれのルートでも各ビューの起票フォームは初期非表示である
```

### AC-3: + ボタンの非表示ルート

```
シナリオ: focus / settings / trash では + ボタンが表示されない
  Given アプリが起動している
  When  /focus を開く
  Then  画面上に .app-shell__create が存在しない (または非表示である)
  When  /settings を開く
  Then  画面上に .app-shell__create が存在しない
  When  /trash を開く
  Then  画面上に .app-shell__create が存在しない
```

### AC-4: + 押下でフォーム展開 (today)

```
シナリオ: /today で + を押すと TaskFormCard が展開される
  Given /today を表示している かつ 起票フォームが非表示である
  When  + ボタンをクリックする
  Then  today-view 内に <TaskFormCard> が表示される
  And   + ボタンの aria-expanded="true" に変わる
  And   フォーム先頭の input ("タスク名" 等) にフォーカスが移動している
```

### AC-5: + 押下でフォーム展開 (tomorrow / projects / routines)

```
シナリオ: 各ルートで + を押すと対応するフォームが展開される
  Given /<route> を表示している (route は tomorrow / projects / routines)
  When  + ボタンをクリックする
  Then  対応するフォーム (<TaskFormCard> / <ProjectFormCard> / <RoutineFormCard>) が表示される
  And   + ボタンの aria-expanded="true" に変わる
  And   フォーム先頭の input にフォーカスが移動している
```

### AC-6: キャンセルボタンで閉じる

```
シナリオ: フォーム上のキャンセルボタンを押すとフォームが閉じる
  Given /today を表示し + を押してフォームを展開している
  When  フォーム上の「キャンセル」ボタンをクリックする
  Then  <TaskFormCard> が画面から消える
  And   + ボタンの aria-expanded="false" に戻る
  And   + ボタンにフォーカスが戻る
  And   再度 + を押して開いたとき、入力欄は空である
```

### AC-7: Escape キーで閉じる

```
シナリオ: フォーム展開中に Escape を押すとフォームが閉じる
  Given /today を表示し + を押してフォームを展開している
  And   フォーム内の "タスク名" input にフォーカスが当たっている
  When  Escape キーを押す
  Then  <TaskFormCard> が画面から消える
  And   + ボタンの aria-expanded="false" に戻る
  And   + ボタンにフォーカスが戻る
```

### AC-8: 起票成功で自動 close

```
シナリオ: 起票成功時はフォームが自動で閉じる (today)
  Given /today を表示し + を押してフォームを展開している
  And   "タスク名" input に "牛乳を買う" を入力している
  When  フォーム内「追加」ボタンを押し、create mutation が成功する
  Then  <TaskFormCard> が画面から消える
  And   + ボタンの aria-expanded="false" に戻る
  And   タスク一覧に "牛乳を買う" が表示される
  And   再度 + を押して開いたとき、入力欄は空である
```

### AC-9: 起票失敗でフォームを保持

```
シナリオ: 通信エラーでフォームと入力値が保持される
  Given /today を表示し + を押してフォームを展開している
  And   "タスク名" input に "牛乳を買う" を入力している
  And   サーバが 500 を返す状態である
  When  「追加」ボタンを押す
  Then  <TaskFormCard> は画面に表示されたままである
  And   "タスク名" input の値は "牛乳を買う" のまま保持される
  And   通信失敗の通知が表示される
```

### AC-10: + ボタンと既存ボタンの座標が重ならない

```
シナリオ: + / 更新 / ハンバーガーの 3 ボタンが重ならない
  Given /today を表示している
  When  画面右上を確認する
  Then  + ボタン と 更新ボタン は重ならず, + ボタンが更新ボタンの左側にある
  And   ハンバーガーボタンは画面左上に存在する
  When  /focus に遷移する
  Then  + ボタンは非表示であり, 更新ボタンの座標は /today の時と同じである
```

### AC-11: 常時表示フォームの撤去

```
シナリオ: 4 ビューの起票フォームは初期状態で描画されない
  Given アプリが起動している
  When  /today を開く
  Then  <TaskFormCard> (role="form", aria-label="タスク起票フォーム") は DOM 上に存在しない
  When  /tomorrow を開く
  Then  <TaskFormCard> は DOM 上に存在しない
  When  /projects を開く
  Then  <ProjectFormCard> は DOM 上に存在しない
  When  /routines を開く
  Then  <RoutineFormCard> は DOM 上に存在しない
```

## 既存テスト追従が必要なファイル

「起票フォームが常時見える」前提に依存する以下のテストは、+ を押してから入力する
フローへ追従する必要がある (本機能のスコープに含める)。

- E2E (`e2e/`):
  - `tasks.spec.ts`
  - `projects.spec.ts`
  - `routines.spec.ts`
  - `tomorrow-view.spec.ts`
  - `today-view-create-form.spec.ts`
  - `remove-inline-project-create.spec.ts` (起票フォーム関連箇所のみ)
  - `keyboard.spec.ts` (タスク起票キーボード操作箇所のみ)
  - `a11y.spec.ts` (起票フォーム関連箇所のみ)
- 単体テスト (`web/__tests__/`):
  - `today-view.test.tsx`
  - `tomorrow-view.test.tsx`
  - `unified-day-view.test.tsx`
  - `task-form-card-select.test.tsx` (フォームを開く必要があれば)
  - `task-form-grid-layout.test.tsx` (同上)
  - `task-form-select-compact.test.tsx` (同上)
  - `routine-form-card-header-layout.test.tsx` (同上)
  - `inline-edit-all-cards.test.tsx` (起票フォーム関連箇所のみ)

## 未決事項 / 確認待ち

なし (U-1 〜 U-4 は plan.md §「重要な決定」で確定する)。
