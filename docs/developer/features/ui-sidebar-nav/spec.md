# 仕様: 左サイドバー導入と 3 ビュー切替 (現在/今日/明日)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-036
- 前提 feature: [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) REQ-1 (ナビゲーション構造) / REQ-2 (3 ビューの責務分離)
- 由来要件: FR-010 (今日ビュー = アプリの入り口) / FR-012 (現在のタスク) / FR-014 (今日 → 明日)
- 関連 NFR: NFR-010 (最小手数の起票) / NFR-013 (並び順の予測可能性)
- 後続 BL の前提: 本 BL の AppShell 完成が BL-037 (focus-view) / BL-038 (tomorrow-view) / BL-045 (補助 view のシェル統合) の着手前提となる.

## 背景 / 課題

現状, Web クライアントのルーティングは `web/src/main.tsx` 内の `<Routes>` 直書きで, `/` → `/today` リダイレクトを除き 6 ルート (`/setup` / `/today` / `/settings` / `/trash` / `/projects` / `/routines`) が並列に列挙されているのみで, 以下の構造的問題がある.

1. **`/today` 1 本に focus (現在のタスク) + 一覧 + 起票 + 完了数カウントが同居**しており, NFR-011 (現在のタスクが大きく単独で表示) と NFR-010 (最小手数の起票) を同じ画面で両立できていない. ui-redesign-foundation の §「課題」項目 1 で指摘済み.
2. **「明日のタスク」を一覧で確認する手段がない**. 今日ビュー上で「明日へ」操作で押し出すのみで, 押し出した後の参照経路が無い (ui-redesign-foundation §「課題」項目 4).
3. **設定 / ゴミ箱 / ルーティン / プロジェクトの補助 view に統一されたグローバルナビが無く**, view 間の往復に URL 直打ち / ブラウザ戻るを要する. 単一ワークフロー (NFR-001) の「一本道」が UI 上で表現されていない (ui-redesign-foundation §「課題」項目 5).
4. **モックアップの 2 ペイン構成 (左サイドバー + 右メイン) が未実装**. ui-redesign-foundation REQ-1 で確定したナビ構造の最小骨格が存在しない.

本 BL は ui-redesign-foundation REQ-1 / REQ-2 を実体化する **最小骨格** を導入する. 既存 view の中身は触らず, 3 ルートを区分けする「箱」(AppShell) を用意し, 後続 BL-037 (focus-view) / BL-038 (tomorrow-view) / BL-045 (補助 view の統合) がそれぞれ独立着手できる前提を作る.

## ゴール / 非ゴール

### ゴール

- **AppShell コンポーネントの新設**: 左サイドバー (プライマリ 3 リンク + セカンダリ 4 リンク) + 右メイン領域 (`<Outlet />`) の 2 ペイン構成を持つ共通レイアウトコンポーネントを `web/src/ui/app-shell/` に追加する.
- **3 プライマリルートの導入**:
  - `/focus` → 「現在のタスク」用 placeholder コンポーネント.
  - `/today` → 既存 `TodayView` をそのまま割り当て (本 BL では中身は変えない).
  - `/tomorrow` → 「明日のタスク」用 placeholder コンポーネント.
- **既存ルートの AppShell 配下への取り込み**: `/today` / `/settings` / `/trash` / `/projects` / `/routines` を AppShell の Outlet 配下に移し, サイドバーが共通で表示されるようにする.
- **アクティブリンクのハイライト**: `react-router-dom` の `NavLink` で「現在いるルート」のリンクが視覚的に区別される (太字 + 左に縦のアクセントライン. ui-redesign-foundation U-009 の保守側デフォルト案).
- **後続 BL の独立着手可能性**: 本 BL 完了後, BL-037 / BL-038 が「placeholder を実コンポーネントに差し替えるだけ」で着手できる構造になる.

### 非ゴール

- **既存 view の振る舞い変更**: `today-view.tsx` / `settings-view.tsx` / `trash-view.tsx` / `projects-view.tsx` / `routines-view.tsx` の中身は一切変えない. focus セクションの切り出しは BL-037, 「明日のタスク」一覧の実装は BL-038, 補助 view のスタイル統一は BL-045 の責務.
- **focus-view / tomorrow-view の機能実装**: 本 BL では placeholder (見出しと「未実装」テキストを表示するだけのコンポーネント) を置く. データ取得・起票・操作系は本 BL のスコープ外.
- **`/setup` の AppShell 化**: `/setup` は Android 初回起動時のオンボーディング画面であり, サイドバー非表示のまま AppShell の外に残す (BL-019 SetupView を壊さない).
- **デザイントークン / CSS フレームワーク導入**: 本 BL では暫定 CSS (vanilla CSS + 直接値) で簡素に組む. トークン体系の整備 (REQ-7) は BL-046 の責務. 本 BL で書いた暫定値は BL-046 でトークン参照に置換する前提.
- **モバイル (狭幅) でのドロワー化**: ui-redesign-foundation U-001 の Open Question を引き継ぐ. 本 BL はデスクトップ幅 (sidebar 常時表示) のみを対象とする.
- **完了数カウンタの再配置**: BL-047 の責務. 既存 `today-view` 内の表示位置を本 BL では変更しない.
- **Repository の Context 化 / props drilling 解消**: 既存 props 渡しのまま `<AppShell>` 経由で各 view に渡す. Context 化リファクタは別 BL (もしくは後続 BL で必要に応じて判断).
- **react-router-dom の v7 migration**: 既存 v6 API (`<Routes>` / `<Route>` / `<Outlet>` / `<NavLink>` / `<Navigate>`) のみを使う. 既存 `future` フラグ (`v7_startTransition`, `v7_relativeSplatPath`) は維持する.

## 要件

### 機能要件

- **REQ-1 共通 AppShell コンポーネント**
  - `web/src/ui/app-shell/app-shell.tsx` に `<AppShell />` を新設する.
  - レイアウトは flex 横並びの 2 ペイン: 左に固定幅 (200px 程度) のサイドバー, 右に残り幅のメイン領域.
  - メイン領域は `<Outlet />` で子ルートをレンダリングする.
  - サイドバーは常時表示 (本 BL はデスクトップ幅前提).

- **REQ-2 サイドバーのプライマリナビ (3 リンク)**
  - 上部に縦並びで 3 リンク:
    - 「現在のタスク」 → `/focus`
    - 「今日のタスク」 → `/today`
    - 「明日のタスク」 → `/tomorrow`
  - リンク実装は `react-router-dom` v6 の `<NavLink>` を使う. `isActive` 時に視覚的に区別する (太字 + 左の縦アクセントライン).

- **REQ-3 サイドバーのセカンダリナビ (4 リンク)**
  - 下部に縦並びで 4 リンク (補助メニュー):
    - 「プロジェクト」 → `/projects`
    - 「ルーティン」 → `/routines`
    - 「ゴミ箱」 → `/trash`
    - 「設定」 → `/settings`
  - プライマリと同じ `<NavLink>` を使い, アクティブ状態の見せ方は共通とする.
  - プライマリとセカンダリの間には視覚的な区切り (余白 + 細い区切り線) を入れる.

- **REQ-4 ルート構成**
  - `/setup` (現状維持. AppShell の **外**. サイドバー非表示).
  - 以下を `<Route element={<AppShell />}>` の子ルートとして配置:
    - `/` → `/today` への `<Navigate replace />` (現状維持. FR-010).
    - `/focus` → `<FocusViewPlaceholder />`
    - `/today` → `<TodayView />` (既存. 中身は変えない)
    - `/tomorrow` → `<TomorrowViewPlaceholder />`
    - `/projects` → `<ProjectsView />` (既存)
    - `/routines` → `<RoutinesView />` (既存)
    - `/trash` → `<TrashView />` (既存)
    - `/settings` → `<SettingsView />` (既存)

- **REQ-5 placeholder コンポーネント**
  - `web/src/ui/app-shell/focus-view-placeholder.tsx` / `tomorrow-view-placeholder.tsx` (またはこれに準ずる配置) を作成する.
  - 各 placeholder は `<h1>` 見出し (「現在のタスク」/「明日のタスク」) と「このビューは BL-037 / BL-038 で実装されます」程度の説明テキストのみ持つ最小実装.
  - データ取得・mutation・起票 UI は持たない.

- **REQ-6 アクティブリンクの視覚区別**
  - 現在いるルートに対応するサイドバーリンクは, 他のリンクと視覚的に区別される (太字 + 左に縦のアクセントライン. ui-redesign-foundation U-009 の保守側デフォルト案を採用).
  - 単一の `<NavLink>` のクラス制御で実現する (アクセシビリティのため `aria-current="page"` も付与. NavLink のデフォルト挙動で良い).

- **REQ-7 既存テスト + 新 E2E の green 維持**
  - 既存の 25 件以上の E2E (`e2e/*.spec.ts`) は AppShell 導入後も green を維持する. 必要に応じて selector を AppShell 配下に追従させる.
  - 新規 E2E (`e2e/sidebar-nav.spec.ts`) を追加し, サイドバーから 3 プライマリルート + 4 セカンダリルートに遷移できることを確認する.
  - 既存 `web/src/router.test.tsx` の対象ルート (`/` → `/today` / `/today` / `/settings` / `/trash`) は AppShell 配下に置かれた後も同じコンポーネントが表示されることを保証する.

### 非機能要件

- **NFR-001 (単一ワークフロー強制) との整合**: サイドバーは「現在 / 今日 / 明日」の 3 ビューに対応する画面分解であり, ビュー切替 (カンバン / カレンダー等) を導入しない. プライマリ 3 リンクは固定で増減しない.
- **NFR-010 (最小手数の起票) との整合**: サイドバー 1 クリックで `/today` (起票画面) に戻れる. 入口の `/` は引き続き `/today` にリダイレクトする (FR-010 維持).
- **NFR-013 (並び順の予測可能性) との整合**: 並び順は本 BL のスコープ外. 既存サーバ側 `priority → createdAt → id` を維持する.
- **アクセシビリティ**: サイドバーは `<nav aria-label="サイドバーナビゲーション">` でランドマーク化する. プライマリ / セカンダリは `<nav>` 内の論理グループとして表現する (具体実装はテスト設計者と実装者で確定). BL-029 の axe 検査が引き続き violations 0 を維持すること.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

### サイドバーの存在 (REQ-1 / REQ-2 / REQ-3)

```
シナリオ: AppShell が起動時にサイドバーを表示する
  Given Web クライアントを `/today` で起動する
  When  画面の描画が完了する
  Then  画面左に `<nav>` ランドマーク (aria-label="サイドバーナビゲーション") が存在する
  And   その中に「現在のタスク」「今日のタスク」「明日のタスク」の 3 リンクが縦並びで存在する
  And   その下のセカンダリ領域に「プロジェクト」「ルーティン」「ゴミ箱」「設定」の 4 リンクが縦並びで存在する
```

### プライマリ 3 リンクの遷移 (REQ-2 / REQ-4 / REQ-5)

```
シナリオ: サイドバーの「現在のタスク」リンクから /focus に遷移する
  Given AppShell が表示されている (現在 URL は /today)
  When  サイドバーの「現在のタスク」リンクをクリックする
  Then  URL が /focus に変わる
  And   メイン領域に focus-view placeholder の見出し「現在のタスク」が表示される
```

```
シナリオ: サイドバーの「今日のタスク」リンクから /today に遷移する
  Given AppShell が表示されている (現在 URL は /focus)
  When  サイドバーの「今日のタスク」リンクをクリックする
  Then  URL が /today に変わる
  And   メイン領域に既存の TodayView (見出し「今日」) が表示される
```

```
シナリオ: サイドバーの「明日のタスク」リンクから /tomorrow に遷移する
  Given AppShell が表示されている (現在 URL は /today)
  When  サイドバーの「明日のタスク」リンクをクリックする
  Then  URL が /tomorrow に変わる
  And   メイン領域に tomorrow-view placeholder の見出し「明日のタスク」が表示される
```

### セカンダリ 4 リンクの遷移 (REQ-3 / REQ-4)

```
シナリオ: サイドバーのセカンダリリンクから既存 4 view に遷移できる
  Given AppShell が表示されている
  When  サイドバーの「プロジェクト」「ルーティン」「ゴミ箱」「設定」の各リンクを順にクリックする
  Then  それぞれ /projects /routines /trash /settings へ遷移する
  And   それぞれ既存の ProjectsView / RoutinesView / TrashView / SettingsView の見出しが表示される
```

### アクティブリンクのハイライト (REQ-6)

```
シナリオ: 現在いるルートのリンクがアクティブ表示になる
  Given AppShell が表示されており URL が /today である
  When  サイドバーを目視する
  Then  「今日のタスク」リンクが他のリンクと視覚的に区別されている (太字 + 左に縦のアクセントライン)
  And   「今日のタスク」リンクに aria-current="page" が付与されている
  And   他の 6 リンクは aria-current を持たない
```

```
シナリオ: ルート遷移時にアクティブリンクが追従する
  Given AppShell の URL が /today で「今日のタスク」がアクティブである
  When  「現在のタスク」リンクをクリックして /focus に遷移する
  Then  「現在のタスク」リンクが aria-current="page" を持ちアクティブ表示になる
  And   「今日のタスク」リンクから aria-current 属性が外れる
```

### ルート構造の不変条件 (REQ-4)

```
シナリオ: ルート / は引き続き /today にリダイレクトする
  Given Web クライアントを `/` で起動する
  When  画面の描画が完了する
  Then  URL が /today に変わる
  And   既存の TodayView が表示される
  And   サイドバーも同時に表示される
```

```
シナリオ: /setup は AppShell の外に残る (サイドバー非表示)
  Given Web クライアントを `/setup` で起動する
  When  画面の描画が完了する
  Then  既存の SetupView が表示される
  And   画面にサイドバー (aria-label="サイドバーナビゲーション") は存在しない
```

### 既存 view の不変条件 (非ゴール担保)

```
シナリオ: AppShell 導入で既存 TodayView の振る舞いが変わらない
  Given AppShell の `/today` ルートに既存 TodayView が割り当てられている
  When  TodayView を表示する
  Then  既存の起票フォーム / タスク一覧 / 完了数カウンタ / 現在のタスクセクション が引き続き表示される
  And   既存の各種操作 (起票 / 完了 / 削除 / 編集 / 期限切替 / 優先度切替 / 現在に設定) が変わらず動作する
```

```
シナリオ: focus-view / tomorrow-view は placeholder で動作しない
  Given AppShell の `/focus` `/tomorrow` ルートに placeholder が割り当てられている
  When  /focus または /tomorrow を表示する
  Then  見出しと「BL-037 / BL-038 で実装される」旨の説明テキストのみが表示される
  And   データ取得 / 起票 / mutation は発生しない
```

### 既存テスト + 新 E2E の green 維持 (REQ-7)

```
シナリオ: 既存の 25 件以上の E2E は AppShell 導入後も green を維持する
  Given e2e/ 配下の全 spec ファイルが導入前に green であった
  When  本 BL の実装をマージする
  Then  e2e/ 配下の全 spec が引き続き green である
  And   selector を AppShell 配下に追従させる必要があった場合, 該当 spec の変更は本 BL の PR に含まれる
```

```
シナリオ: 新規 E2E でサイドバーから 3 プライマリルート + 4 セカンダリルートへの遷移を確認する
  Given e2e/sidebar-nav.spec.ts が追加される
  When  E2E を実行する
  Then  以下を順にクリックして遷移できる:
        「現在のタスク」→ /focus / 「今日のタスク」→ /today / 「明日のタスク」→ /tomorrow /
        「プロジェクト」→ /projects / 「ルーティン」→ /routines /
        「ゴミ箱」→ /trash / 「設定」→ /settings
  And   各遷移後にメイン領域に対応する見出しが表示される
```

## 未決事項 / 確認待ち

- **U-001 モバイル (狭幅) でのサイドバーの扱い**: 本 BL の責務外として ui-redesign-foundation U-001 を引き継ぐ. 本 BL の実装はデスクトップ幅 (sidebar 常時表示) のみを対象とする. モバイルでのドロワー化 / 横スクロール / 縮小表示は別 BL で扱う.
- **U-002 サイドバー幅の暫定値**: 200px を初期案とするが, リンク文字数 (「現在のタスク」/「今日のタスク」/「明日のタスク」) が収まる最小幅を実装時に確認する. 厳密な値は BL-046 (デザイントークン) で `--space-sidebar-width` 相当として確定する.
- **U-003 placeholder の文言**: 「BL-037 で実装されます」のような開発メモを表示するか, ユーザー向けに「準備中」のような柔らかい文言にするか. 開発用ビルドのみ前者, 本番ビルドでは後者という分岐は導入しない (NFR-012 設定項目最小化に反する複雑度を持ち込まない). **保守側デフォルト案: 「準備中 (BL-037)」のようにユーザー向け文言を採用し, 括弧書きで BL 番号だけ添える**.
- **U-004 placeholder の配置場所**: (a) `web/src/ui/app-shell/` 配下に同居, (b) `web/src/ui/focus-view/` / `web/src/ui/tomorrow-view/` ディレクトリを先に切って placeholder を置く. **保守側デフォルト案: (b)**. BL-037 / BL-038 が同じディレクトリで実装を進められる. 本 BL では空の `index.ts` ではなく `focus-view.tsx` / `tomorrow-view.tsx` を placeholder として作る.
- **U-005 セカンダリナビ「プロジェクト」リンクの妥当性**: 既存 `/projects` (ProjectsView) は名称変更 / 削除を担う管理画面で, BL-044 で今日ビュー右上に「+プロジェクトの追加」ボタンが追加された後も削除されない (ui-redesign-foundation §「差分カタログ」). サイドバーセカンダリにも残す前提で進めるが, BL-044 完了後の UX を見て BL-045 で再検討する余地を残す.
- **U-006 リポジトリ注入の経路**: 現状 `main.tsx` の `<App>` 内で各 view に props で注入している. AppShell 経由で `<Outlet context={...} />` か React Context か, props drilling 継続か. **保守側デフォルト案: props drilling 継続 (本 BL の最小骨格に専念)**. AppShell 自体は repository を一切受け取らず, 各 view への注入は `main.tsx` 内の `<Route element={<TodayView repository={...} />} />` 形式を維持する. Context 化リファクタは別 BL.
- **U-007 サイドバーの折りたたみ / 展開機能**: 本 BL では持たない (NFR-012 設定項目最小化). 将来モバイル対応で必要になれば U-001 と合わせて別 BL で扱う.
