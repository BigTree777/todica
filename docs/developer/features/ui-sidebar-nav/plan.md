# 設計・実装計画: 左サイドバー導入と 3 ビュー切替 (現在/今日/明日)

> [`spec.md`](spec.md) の要件をどう実現するかに落とす. 抽象アーキテクチャは [`../../architecture/overview.md`](../../architecture/overview.md), モジュール境界は [`../../architecture/module-boundaries.md`](../../architecture/module-boundaries.md) を参照. 上位 feature は [`../ui-redesign-foundation/spec.md`](../ui-redesign-foundation/spec.md) / [`../ui-redesign-foundation/plan.md`](../ui-redesign-foundation/plan.md).

## 方針概要

- **既存 view を一切壊さず, 上位の「箱」だけを追加するアプローチ**. `<AppShell>` コンポーネント (サイドバー + Outlet) を新設し, 既存 6 ルート + 新規 2 ルート (`/focus` `/tomorrow`) を `<Route element={<AppShell />}>` の子として再構成する.
- **placeholder 戦略**: `/focus` `/tomorrow` の中身は本 BL では実装せず, 見出しと「準備中 (BL-037 / BL-038)」テキストのみの placeholder を `web/src/ui/focus-view/` / `web/src/ui/tomorrow-view/` に配置. BL-037 / BL-038 が「placeholder を実コンポーネントに差し替えるだけ」で着手できる構造にする.
- **暫定 CSS で組む**. デザイントークン (BL-046) はまだ存在しないため, `<AppShell>` 専用の `app-shell.css` に直接値 (200px / 16px / `#ccc` 等) を書く. BL-046 で `var(--space-md)` 等に置換する前提で TODO コメントを残す.
- **`/setup` は AppShell の外**. SetupView は Android 初回起動時のオンボーディングで, サイドバーから到達する性質のものではない. `<Routes>` 上で `/setup` を独立した `<Route>` として残し, `<Route element={<AppShell />}>` の子には入れない.

## 影響範囲

| 領域 | 変更内容 |
| --- | --- |
| API | なし. 既存 API への変更は発生しない. |
| DB | なし. データモデル変更なし. |
| モジュール | **新規**: `web/src/ui/app-shell/app-shell.tsx` (サイドバー + Outlet) / `web/src/ui/app-shell/app-shell.css` (暫定 CSS) / `web/src/ui/focus-view/focus-view.tsx` (placeholder) / `web/src/ui/tomorrow-view/tomorrow-view.tsx` (placeholder). **変更**: `web/src/main.tsx` の `<Routes>` 構造を `<Route element={<AppShell />}>` で包む形に再構成. `<App>` の `<Outlet />` 経由でも既存 `<OfflineBanner />` / `<ErrorNotification />` / `<PwaUpdateBanner />` は引き続き全ルート共通で表示する (AppShell の外側に置く). |
| UI | サイドバー (左 200px 程度) + 右メイン領域の 2 ペイン構成が `/setup` 以外の全ルートで表示される. 既存 view (`today-view.tsx` 等) の中身は無改修. |
| ドキュメント | `docs/developer/features/ui-sidebar-nav/` の 3 ファイル新規追加. `docs/developer/planning/backlog.md` の BL-036 を「Done」へ更新 (マージ後). ADR は不要 (本 BL は最小骨格のみで, 大きな設計判断は ui-redesign-foundation の D-001〜D-009 で既に確定). |

## 設計詳細

### コンポーネント階層 (実装後)

```
<BrowserRouter>
  <QueryClientProvider>
    <App>
      <OfflineBanner />       ← AppShell の外 (現状維持)
      <PwaUpdateBanner />     ← AppShell の外 (現状維持)
      <ErrorNotification />   ← AppShell の外 (現状維持)
      <Routes>
        <Route path="/setup" element={<SetupViewWithNav ... />} />  ← AppShell の外
        <Route element={<AppShell />}>                              ← サイドバー + Outlet
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />
          <Route path="/focus" element={<FocusView />} />           ← placeholder (新規)
          <Route path="/today" element={<TodayView repository={...} projectRepository={...} />} />
          <Route path="/tomorrow" element={<TomorrowView />} />     ← placeholder (新規)
          <Route path="/projects" element={<ProjectsView repository={...} />} />
          <Route path="/routines" element={<RoutinesView repository={...} />} />
          <Route path="/trash" element={<TrashView repository={...} />} />
          <Route path="/settings" element={<SettingsView ... />} />
        </Route>
      </Routes>
    </App>
  </QueryClientProvider>
</BrowserRouter>
```

### AppShell コンポーネント設計

**ファイル**: `web/src/ui/app-shell/app-shell.tsx`

**役割**: サイドバー + メイン領域 (`<Outlet />`) のレイアウトコンポーネント. 状態を持たない pure presentational コンポーネント.

**props**: なし (リポジトリは AppShell には渡さず, 子 Route 内の view で受ける. ui-redesign-foundation R-002 / 本 spec U-006 の保守側デフォルト).

**疑似コード**:

```tsx
import { NavLink, Outlet } from "react-router-dom";
import "./app-shell.css";

export function AppShell() {
  return (
    <div className="app-shell">
      <nav className="app-shell__sidebar" aria-label="サイドバーナビゲーション">
        <ul className="app-shell__nav-primary">
          <li><NavLink to="/focus"   className={({ isActive }) => isActive ? "active" : ""}>現在のタスク</NavLink></li>
          <li><NavLink to="/today"   className={({ isActive }) => isActive ? "active" : ""}>今日のタスク</NavLink></li>
          <li><NavLink to="/tomorrow" className={({ isActive }) => isActive ? "active" : ""}>明日のタスク</NavLink></li>
        </ul>
        <hr className="app-shell__divider" />
        <ul className="app-shell__nav-secondary">
          <li><NavLink to="/projects" className={...}>プロジェクト</NavLink></li>
          <li><NavLink to="/routines" className={...}>ルーティン</NavLink></li>
          <li><NavLink to="/trash"    className={...}>ゴミ箱</NavLink></li>
          <li><NavLink to="/settings" className={...}>設定</NavLink></li>
        </ul>
      </nav>
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
```

**NavLink のアクティブ判定**:
- `<NavLink>` は内部で現在の URL とマッチするとデフォルトで `aria-current="page"` を付与する. これにより spec.md REQ-6 のアクセシビリティ要件を満たす.
- `className={({ isActive }) => isActive ? "active" : ""}` でアクティブ時に CSS クラスを切り替え, 太字 + 左の縦アクセントラインを適用する.

### CSS 設計 (暫定)

**ファイル**: `web/src/ui/app-shell/app-shell.css`

**方針**: 暫定値で書き, BL-046 で `var(--space-md)` 等に置換するための TODO コメントを残す.

```css
/* TODO(BL-046): 暫定値はデザイントークン化する */
.app-shell {
  display: flex;
  min-height: 100vh;
}
.app-shell__sidebar {
  width: 200px;  /* TODO(BL-046): --sidebar-width */
  flex-shrink: 0;
  border-right: 1px solid #ccc;  /* TODO(BL-046): --color-border */
  padding: 16px;  /* TODO(BL-046): --space-md */
  display: flex;
  flex-direction: column;
}
.app-shell__nav-primary,
.app-shell__nav-secondary {
  list-style: none;
  padding: 0;
  margin: 0;
}
.app-shell__nav-primary li,
.app-shell__nav-secondary li {
  margin-bottom: 8px;  /* TODO(BL-046): --space-sm */
}
.app-shell__nav-primary a,
.app-shell__nav-secondary a {
  display: block;
  padding: 8px 12px;
  text-decoration: none;
  color: inherit;
  border-left: 3px solid transparent;  /* アクセントライン用の余白を確保 */
}
.app-shell__nav-primary a.active,
.app-shell__nav-secondary a.active {
  font-weight: bold;
  border-left-color: currentColor;  /* TODO(BL-046): --color-accent */
}
.app-shell__divider {
  border: none;
  border-top: 1px solid #eee;  /* TODO(BL-046): --color-border-subtle */
  margin: 16px 0;
}
.app-shell__main {
  flex: 1;
  padding: 16px;  /* TODO(BL-046): --space-md */
  overflow: auto;
}
```

### placeholder コンポーネント設計

**ファイル**: `web/src/ui/focus-view/focus-view.tsx` / `web/src/ui/tomorrow-view/tomorrow-view.tsx`

**役割**: BL-037 / BL-038 が実装するまでの仮表示. データ取得・mutation・起票 UI を持たない.

**疑似コード (focus-view)**:

```tsx
/**
 * focus-view: 「現在のタスク」を単独大表示するビュー.
 * BL-036 の時点では placeholder. 実装は BL-037 で行う.
 */
export function FocusView() {
  return (
    <section aria-label="現在のタスク">
      <h1>現在のタスク</h1>
      <p>準備中 (BL-037)</p>
    </section>
  );
}
```

**疑似コード (tomorrow-view)**:

```tsx
/**
 * tomorrow-view: 「明日のタスク」一覧 + 起票ビュー.
 * BL-036 の時点では placeholder. 実装は BL-038 で行う.
 */
export function TomorrowView() {
  return (
    <section aria-label="明日のタスク">
      <h1>明日のタスク</h1>
      <p>準備中 (BL-038)</p>
    </section>
  );
}
```

### main.tsx の Routes 再構成

**変更前** (現状, 抜粋):
```tsx
<Routes>
  <Route path="/" element={<Navigate to={defaultRoute} replace />} />
  <Route path="/setup" element={<SetupViewWithNav ... />} />
  <Route path="/today" element={<TodayView ... />} />
  <Route path="/settings" element={<SettingsView ... />} />
  <Route path="/trash" element={<TrashView ... />} />
  <Route path="/projects" element={<ProjectsView ... />} />
  <Route path="/routines" element={<RoutinesView ... />} />
</Routes>
```

**変更後**:
```tsx
<Routes>
  <Route path="/setup" element={<SetupViewWithNav ... />} />   {/* AppShell の外 */}
  <Route element={<AppShell />}>                                {/* AppShell 配下 */}
    <Route path="/" element={<Navigate to={defaultRoute} replace />} />
    <Route path="/focus" element={<FocusView />} />
    <Route path="/today" element={<TodayView ... />} />
    <Route path="/tomorrow" element={<TomorrowView />} />
    <Route path="/projects" element={<ProjectsView ... />} />
    <Route path="/routines" element={<RoutinesView ... />} />
    <Route path="/trash" element={<TrashView ... />} />
    <Route path="/settings" element={<SettingsView ... />} />
  </Route>
</Routes>
```

**変更点**:
- `<Route element={<AppShell />}>` で 7 ルートを包む (`/setup` を除く).
- `/focus` / `/tomorrow` を追加.
- `<OfflineBanner />` / `<PwaUpdateBanner />` / `<ErrorNotification />` は `<App>` 内で `<Routes>` の外に置いたまま (現状維持. AppShell の外で全ルート共通で表示される).

### データモデル

変更なし.

### 処理フロー

変更なし. 各 view 内の mutation / fetch は AppShell の存在に関わらず既存どおり動く. `<Outlet />` は React Router v6 の標準機能で, 親 Route の element 配下に子 Route の element を埋め込むだけのプレースホルダ.

### 例外 / エラー処理

変更なし. ConflictDialog / ErrorNotification / OfflineBanner の枠組みは AppShell の外で動く.

## 重要な決定

- **D-001 AppShell は presentational only (props なし)**. リポジトリ注入は `<Route element={<TodayView repository={...} />} />` のように **個別 view 単位** で行う. AppShell 経由の `<Outlet context={...} />` や React Context 化は本 BL では採らない (spec U-006 保守側デフォルト). 理由: 本 BL は最小骨格に専念し, props drilling 解消は別 BL の責務とする.
- **D-002 `/setup` は AppShell の外**. 理由: SetupView は Android 初回起動時のオンボーディング画面で, サイドバーから到達する性質のものではない. 既存 BL-019 SetupView の挙動を壊さない.
- **D-003 placeholder の配置先 = 各 view ディレクトリ**. `web/src/ui/focus-view/focus-view.tsx` / `web/src/ui/tomorrow-view/tomorrow-view.tsx` (spec U-004 (b) 採用). 理由: BL-037 / BL-038 が同じディレクトリで実装を進められる. AppShell 配下に同居させると後で移動が必要になる.
- **D-004 placeholder の文言 = ユーザー向け + BL 番号併記**. 「準備中 (BL-037)」「準備中 (BL-038)」. spec U-003 の保守側デフォルト案を採用.
- **D-005 暫定 CSS の値はコード内 TODO で BL-046 への引き継ぎを明示**. `/* TODO(BL-046): --space-md */` のように grep 可能なマーカーを付ける. BL-046 着手時の置換漏れを防ぐ.
- **D-006 `<NavLink>` の `aria-current` はデフォルト挙動に任せる**. React Router v6 の `<NavLink>` はアクティブ時に自動で `aria-current="page"` を付与するため, 手動で `aria-current` を制御しない (REQ-6 のアクセシビリティ要件を満たす).
- **D-007 セカンダリナビ「プロジェクト」リンクは存続させる**. ui-redesign-foundation §「差分カタログ」で `/projects` (ProjectsView) は名称変更 / 削除を担う管理画面として残る前提. BL-044 後に再評価する余地はあるが本 BL では含める (spec U-005).
- **D-008 OfflineBanner / PwaUpdateBanner / ErrorNotification は AppShell の外**. 理由: 全ルート (`/setup` 含む) で共通表示すべき性質のもの. AppShell 内に入れると `/setup` で表示されなくなる退化リスクがある.
- **D-009 ADR は新規作成しない**. 本 BL は最小骨格のみで, 大きな設計判断は ui-redesign-foundation の D-001〜D-009 で既に確定済み.

## リスク / 代替案

- **R-001 既存 E2E の selector が AppShell 配下で動かなくなるリスク**. 既存 E2E は各 view の `<h1>` や `aria-label` で要素特定しているため, AppShell が同じ DOM に追加されても基本的には影響しない見込み. ただし `<main>` ランドマークが新規に追加されることで, `page.getByRole("main")` が複数マッチするケースが出る可能性. 本 BL の PR で全 E2E を実行し, 影響箇所があれば PR 内で selector を更新する (spec REQ-7).
- **R-002 `/setup` への遷移が AppShell 内から発生したとき, サイドバーが残ったまま遷移する錯覚**. SetupView は Android 初回起動時のみ表示される画面で, 通常のセッション中にユーザーが `/setup` に遷移することはない. サイドバーにも `/setup` リンクは置かない. 設定 view (BL-019) からの「サーバ設定変更」経路で `/setup` を再訪する場合のみ AppShell からの離脱が起きるが, これは意図した挙動として許容する.
- **R-003 `<NavLink>` のスタイル衝突**. 既存 view 内に同名クラス (`active` 等) があれば衝突する可能性. `app-shell__nav-primary a.active` のように **子孫セレクタで明示的にスコープ** することで回避する.
- **R-004 placeholder が空ページのように見えるリスク**. 本 BL の完了直後, ユーザーが `/focus` `/tomorrow` を訪れると「準備中」の最小表示しか出ない. これは本 BL のスコープとして許容する (後続 BL-037 / BL-038 で実装する旨を placeholder 上に明示).
- **R-005 BL-046 のデザイントークン整備時に CSS 差分が大きくなるリスク**. 暫定値を直接記述するため, BL-046 で `var(...)` への置換が必要. D-005 の TODO マーカーで置換漏れを防ぐ.
- **代替案 1: AppShell を React Context で repository を提供する形にする**. 採用しない. R-002 (ui-redesign-foundation) の通り Context 化は別 BL で判断する.
- **代替案 2: 既存 `today-view.tsx` の中の focus セクションをこの BL でも切り出す**. 採用しない. 非ゴール. BL-037 の責務.
- **代替案 3: モバイル対応のドロワー化を本 BL で同時に実装する**. 採用しない. spec U-001 の通り別 BL で扱う. 本 BL はデスクトップ幅前提の最小骨格に専念.

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md).

### 単体テスト (Vitest + React Testing Library)

- **対象**: `<AppShell />` 単体.
- **観点**:
  - サイドバー (`<nav aria-label="サイドバーナビゲーション">`) がレンダリングされる.
  - プライマリ 3 リンク (現在のタスク / 今日のタスク / 明日のタスク) が指定 URL を持つ.
  - セカンダリ 4 リンク (プロジェクト / ルーティン / ゴミ箱 / 設定) が指定 URL を持つ.
  - 現在 URL に対応するリンクが active クラスを持ち, `aria-current="page"` が付与される.
  - `<Outlet />` で子要素が描画される (MemoryRouter + ダミー子 Route を使う).

### 結合テスト (Vitest + MemoryRouter)

- **対象**: `web/src/router.test.tsx` 拡張. AppShell + 各ルートの結合.
- **観点**:
  - `/` → `/today` リダイレクト後, AppShell のサイドバーと TodayView の見出しが同時に表示される.
  - `/focus` で FocusView placeholder の見出しが表示される.
  - `/tomorrow` で TomorrowView placeholder の見出しが表示される.
  - `/projects` `/routines` `/trash` `/settings` で各既存 view の見出しと AppShell が同時に表示される.
  - `/setup` で AppShell (サイドバー) が **表示されない**.

### E2E (Playwright)

- **新規**: `e2e/sidebar-nav.spec.ts`
  - サイドバーから「現在のタスク」「今日のタスク」「明日のタスク」の 3 リンクで遷移できる.
  - サイドバーから「プロジェクト」「ルーティン」「ゴミ箱」「設定」の 4 リンクで遷移できる.
  - アクティブリンクが `aria-current="page"` を持ち, 遷移時に追従する.
- **既存 E2E の維持**: `e2e/*.spec.ts` (25 件以上) を実行し全 green を確認. selector の追従が必要なら本 BL の PR 内で更新.

### カバレッジ目標

- `<AppShell />` 単体: 100% (リンク数が少なくロジックも分岐がほぼないため到達容易).
- ルーティング結合: 上記の各シナリオが green.
- E2E: 既存 + 新規 sidebar-nav が green.

### 重視するもの

- **既存 E2E の green 維持** (spec REQ-7 の不変条件). 本 BL の PR をマージする前に必ず確認.
- **`/setup` の AppShell 非適用** (D-002 / spec の受け入れ基準). SetupView を壊さないことの担保.
- **placeholder が「データ取得しない」こと**. `web/__tests__/router.test.tsx` 相当の結合テストで, placeholder ルート遷移時に `repository.list()` などが呼ばれないことを確認 (BL-037 / BL-038 で実装するまで API リクエストを増やさない).
