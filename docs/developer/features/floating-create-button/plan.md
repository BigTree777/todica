# 設計・実装計画: 起票カードを + ボタン展開式に変更する

> [`spec.md`](spec.md) の要件を、どう実現するかに落とす。

## 方針概要

AppShell 右上の更新ボタンの左側に固定 + ボタンを新設する。+ ボタンと各ビューの
起票フォーム間の連携には URL クエリ (`?create=1`) を用い、各ビューが
`useSearchParams` を読んで `formOpen` 状態を導出する。各ビューは初期状態で
起票カードを描画せず、`formOpen=true` のときのみ条件付き描画する。
閉じる経路 (キャンセル / Escape / 起票成功) は `?create=1` を URL から外す処理に
集約し、状態の単一情報源を URL に置く。

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | 変更なし |
| DB | 変更なし |
| モジュール (web) | `web/src/ui/app-shell/app-shell.tsx`, `app-shell.css` に + ボタンと座標を追加。`web/src/ui/today-view/today-view.tsx`, `tomorrow-view.tsx`, `projects-view/projects-view.tsx`, `routines-view/routines-view.tsx` で起票フォームを条件付き描画化。 |
| UI | + ボタン (`.app-shell__create`, 右上 fixed)。各ビューの起票カード冒頭に「キャンセル」ボタンを追加。 |
| テスト | 既存 E2E / 単体テストで「フォームが常時見える」前提のものを「+ を押してから入力する」フローへ追従。 |
| domain / server / Repository / Mutation interface | 変更なし |

## 設計詳細

### データモデル

- 起票フォームの開閉状態は URL クエリ `?create=1` のみで表現する (D-001 / U-1)。
  ローカル React state や Context は使わない。
- 入力欄の値 (name / projectId / priority など) は従来通り各ビュー内の
  `useState` で保持する。フォームを閉じる際にクリアする (REQ-9)。
- 起票成功時は mutation の onSuccess 内で `setSearchParams` を呼んで
  `create` クエリを取り除く (REQ-7 / D-004)。

### 処理フロー

1. ユーザーが /today 等を開く。AppShell が `useLocation()` で pathname を読む。
2. AppShell は pathname が `/today` / `/tomorrow` / `/projects` / `/routines` の
   いずれかなら + ボタンを描画する。それ以外は + ボタン自体を render しない
   (D-002 / U-4)。
3. AppShell は `useSearchParams()` で現在の `create` クエリ値を読み、
   + ボタンの `aria-expanded` を導出する。
4. ユーザーが + を押す → AppShell が `setSearchParams({ create: "1" })` を呼ぶ
   (他の既存クエリは保持する)。
5. 対応ビュー (例: today-view) は `useSearchParams()` で `create` を読み、
   `formOpen = searchParams.get("create") === "1"` を導出する。
6. `formOpen=true` のとき `<TaskFormCard>` (または対応する FormCard) を render する。
   その際 `useEffect` で先頭 input に focus する (REQ-10)。
7. キャンセルボタン / Escape / 起票成功時 はビューが `setSearchParams` で
   `create` を削除する。閉じる経路がキャンセル / Escape の場合のみ、後続の
   `useEffect` で + ボタンに focus を戻す (REQ-13 / D-005)。
8. AppShell は state 変化を `useSearchParams` 経由で受け取り、+ ボタンの
   `aria-expanded` を再評価する。

### + ボタンと既存ボタンのレイアウト

```
画面右上 fixed エリア (z-index: 200)
  ┌────────────────────────────┐
  │ ... [+]  [↻]               │
  └────────────────────────────┘
   左 (.app-shell__create)  右 (.app-shell__reload)
```

- `.app-shell__reload` は既存通り `right: var(--space-sm)` で右上に固定。
- `.app-shell__create` は `right: calc(var(--space-sm) + var(--font-size-h2) + var(--space-xs) * 2 + var(--space-sm))`
  のように更新ボタンの幅 + 余白の右側オフセットで配置する (D-003)。
  実装時には実測してトークンの組み合わせで再現可能な値に揃える。
- 共通スタイル (background / border / font-size / cursor / padding / color) は
  `.app-shell__reload` と同じトークン値を再利用する (REQ-14 / NFR-NO-SHADOW)。

### 起票フォーム側の変更

各ビュー (today / tomorrow / projects / routines) で以下を行う:

1. `useSearchParams` を import し、`formOpen` を導出する。
2. 起票フォーム描画箇所を `{formOpen && (<TaskFormCard ... />)}` に変更。
3. `<TaskFormCard>` props にキャンセルハンドラ `onCancel` を追加し、
   呼ばれたら `setSearchParams` で `create` を削除する。
4. `handleCreate` (create mutation の onSuccess 後処理) で `setSearchParams` を
   呼んで `create` を削除する (= REQ-7 自動 close)。
5. 失敗時 (onError 経路) は閉じない。既存 `notifyError` を踏襲する (REQ-8)。
6. focus 管理:
   - フォーム展開時: `useEffect(() => { if (formOpen) firstInputRef.current?.focus() })`。
   - キャンセル / Escape 経路: 閉じる前に "close by user gesture" フラグを立て、
     URL 更新後の useEffect で `document.querySelector(".app-shell__create")` 等に
     focus を戻す。
7. Escape ハンドラは各ビューがフォーム展開中のみ document に listener を登録する
   (`if (!formOpen) return;` パターン。既存 AppShell の Escape 実装と同形)。

### `<TaskFormCard>` / `<ProjectFormCard>` / `<RoutineFormCard>` への変更

- 既存 props に `onCancel: () => void` を追加する (任意 / `?:` ではなく必須にする
  ことでビューが必ず close 経路を提供することを強制する)。
- カード内に「キャンセル」ボタン (`<button type="button">`) を追加する。
  既存「追加」ボタンと並べる。スタイルは既存ボタンと同じトークンを使う
  (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)。
- 既存のキーボード操作 (Enter で submit 等) は維持する。

### 例外 / エラー処理

- create mutation の onError は既存どおり `notifyError("通信に失敗しました")`。
  フォームは閉じない (REQ-8)。
- `?create=1` がついた URL を直接開いた場合: ビュー側は `formOpen=true` で render
  する。+ ボタンの aria-expanded も `true` になる。これは仕様内挙動とする。
- + ボタン非表示ルート (/focus, /settings, /trash) で URL に `?create=1` が
  ついていた場合: ビュー側はその場合も formOpen を立てない (= 各ビューは
  自身のルートのときだけクエリを読む実装でよい。focus / settings / trash 側で
  起票フォームを描画しないので問題なし)。

## 重要な決定

### D-001 / U-1: + ボタン → 各ビューへの「form 開け」シグナル伝達方式 = URL クエリ (`?create=1`)

候補と判定:

- 採用: URL クエリ `?create=1`。
- 理由: (1) NFR-DOM-MINIMAL に沿って Context / Provider / global store の追加が
  不要、(2) 状態の単一情報源が URL になり、戻る / 進む / リロードで挙動が予測可能、
  (3) 既存 AppShell は `useLocation` を使っており、`useSearchParams` の導入も
  React Router の標準 API で済む、(4) deep link (`/today?create=1`) で
  フォーム展開状態を共有可能。
- 不採用:
  - React Context: AppShell と各ビューを Provider で括る必要があり、ツリー構造の
    変更コストが大きい。
  - Custom Event: 信頼性に欠け、test での再現が難しい。
  - Zustand 等の global store: 依存追加に見合うほどの恩恵がない。

### D-002 / U-4: + ボタン非表示の判定方式 = `useLocation()` で pathname を見る

- AppShell 内で `const { pathname } = useLocation();` を読み、
  `["/today", "/tomorrow", "/projects", "/routines"]` のいずれかなら描画、
  それ以外は **DOM に出さない** (条件 render)。
- `display: none` での hidden modifier 方式は採らない (= DOM mutation を減らす
  わけではないが、SR が誤検出する余地を避けるため `null` を返す)。
- ヘルパ関数 `function isCreateRoute(pathname: string): "task" | "project" | "routine" | null` を AppShell に置き、ラベルとクエリ書き換え両方で再利用する。

### D-003: + ボタンの座標

- 共通スタイル (background / border / font-size / cursor / padding / color) は
  既存 `.app-shell__reload` を踏襲する。
- 右端からのオフセットは、更新ボタンの占有幅 + 余白を加算した値とする。
  デザイントークン (`--space-sm`, `--space-xs`, `--font-size-h2`) の組み合わせで
  表現する。具体値は実装時に確定する。

### D-004 / U-2: 起票成功時の自動 close = 採用

- mutation の onSuccess 内で `setSearchParams` を呼んで `create` を削除する。
- 連続起票が必要なケースは + を再度押す。
- 不採用 (開けたまま保持) の理由: スコープが「タスク一覧の閲覧スペースを
  邪魔しない」ことなので、成功後も開きっぱなしだと当初の課題が再発する。

### D-005: フォーム close 時のフォーカス復帰

- キャンセル / Escape 経路: フォーム close 後に + ボタンへ focus を戻す。
- 起票成功で自動 close: focus 復帰を行わない (ユーザーの視線は新しく追加された
  一覧アイテムに向かう想定。SR ユーザー向けにも一覧側のライブリージョン
  通知の方が自然と判断)。

### D-006 / U-3: + ボタンの aria-label

- `/today`, `/tomorrow` → 「タスクを追加」(同じ entity を扱うため共通)。
- `/projects` → 「プロジェクトを追加」。
- `/routines` → 「ルーティンを追加」。
- 「項目を追加」のような汎用ラベルは採らない (SR で何を追加するか不明瞭になる)。

## リスク / 代替案

- リスク: 既存 E2E / 単体テストが「起票フォームが見える」前提を多用しており、
  追従コストが大きい。 → spec の §「既存テスト追従が必要なファイル」で列挙済み。
  tasks 側でファイル単位のチェックリストにして抜け漏れを防ぐ。
- リスク: URL クエリ方式の場合、戻る / 進むで `?create=1` が残っている状態の
  挙動が想定外になる可能性。 → 「URL に `?create=1` があれば formOpen=true」を
  一貫させればよく、戻る / 進むも仕様内挙動になる (D-001 の理由 (2))。
- 代替案: Context 採用案。今回はサブツリー全体 (AppShell ↔ 4 ビュー) を Provider
  で括る必要があり、現状の `<Outlet />` 構成と整合させるためのコードが増える。
  D-001 の理由により不採用。

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md)。

- 単体テスト (vitest + jsdom, `web/__tests__/`):
  - + ボタン aria-label / aria-expanded のルート依存 (AC-1, AC-2, AC-12)。
  - 初期状態で起票フォームが描画されないこと (AC-11)。
  - + 押下でフォームが展開し、先頭 input に focus が当たること (AC-4, AC-5)。
  - キャンセル / Escape / 起票成功で URL から `?create=1` が外れること (AC-6,
    AC-7, AC-8)。
  - 起票失敗時にフォームと入力値が保持されること (AC-9)。
  - 既存テストの「フォームが常時見える」前提箇所を + 押下ステップに追従。
- E2E (Playwright, `e2e/`):
  - 4 ビューで + を押して起票が完結する main path (`tasks.spec.ts`,
    `projects.spec.ts`, `routines.spec.ts`, `tomorrow-view.spec.ts`,
    `today-view-create-form.spec.ts`)。
  - /focus, /settings, /trash で + ボタンが DOM に存在しないこと (AC-3)。
  - ボタン重なり / 座標確認 (AC-10) は既存 `secondary-views-style.spec.ts` の
    レイアウト確認パターンを参考にする。
