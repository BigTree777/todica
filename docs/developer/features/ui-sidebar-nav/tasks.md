# タスク: 左サイドバー導入と 3 ビュー切替 (現在/今日/明日)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.
> 順番は **TDD**: 失敗するテストを書く → 実装で green 化する → リファクタの順に並べる. test-designer / implementer に渡す.

## 失敗するテストを書く (red)

### 単体テスト (Vitest + React Testing Library)

- [ ] T-001: `web/__tests__/app-shell.test.tsx` を新規作成し, `<AppShell />` 単体の単体テストを書く.
  - サイドバー `<nav aria-label="サイドバーナビゲーション">` が存在する.
  - プライマリ 3 リンクが `to="/focus"` `to="/today"` `to="/tomorrow"` を持つ.
  - セカンダリ 4 リンクが `to="/projects"` `to="/routines"` `to="/trash"` `to="/settings"` を持つ.
  - 現在 URL に対応するリンクが `active` クラスと `aria-current="page"` を持つ (MemoryRouter で URL を指定).
  - `<Outlet />` で子 Route の要素 (ダミーコンポーネント) が描画される.
- [ ] T-002: `web/__tests__/focus-view-placeholder.test.tsx` を新規作成し, `<FocusView />` placeholder のテストを書く.
  - 見出し「現在のタスク」が表示される.
  - 「準備中 (BL-037)」のテキストが表示される.
  - データ取得 mutation を呼ばない (mock repository を渡しても呼び出し回数が 0).
- [ ] T-003: `web/__tests__/tomorrow-view-placeholder.test.tsx` を新規作成し, `<TomorrowView />` placeholder のテストを書く.
  - 見出し「明日のタスク」が表示される.
  - 「準備中 (BL-038)」のテキストが表示される.
  - データ取得 mutation を呼ばない.

### 結合テスト (Vitest + MemoryRouter)

- [ ] T-004: `web/src/router.test.tsx` を拡張 (もしくは `web/__tests__/router-app-shell.test.tsx` を新規作成) し, AppShell + 各ルートの結合シナリオを追加.
  - `/` → `/today` リダイレクト後, サイドバー (aria-label) と TodayView の見出し「今日」が同時に表示される.
  - `/focus` 遷移後, サイドバーと FocusView placeholder の見出し「現在のタスク」が同時に表示される.
  - `/tomorrow` 遷移後, サイドバーと TomorrowView placeholder の見出し「明日のタスク」が同時に表示される.
  - `/projects` `/routines` `/trash` `/settings` で各既存 view の見出しとサイドバーが同時に表示される.
  - `/setup` でサイドバー (aria-label="サイドバーナビゲーション") が **表示されない** (SetupView のみ表示).

### E2E (Playwright)

- [ ] T-005: `e2e/sidebar-nav.spec.ts` を新規作成し以下を red 状態で書く.
  - シナリオ A: `/today` で起動 → サイドバーの「現在のタスク」リンクをクリック → URL が `/focus` に変わる → メイン領域に見出し「現在のタスク」が表示される.
  - シナリオ B: `/focus` で起動 → 「今日のタスク」リンクをクリック → URL が `/today` に変わる → 見出し「今日」が表示される.
  - シナリオ C: `/today` で起動 → 「明日のタスク」リンクをクリック → URL が `/tomorrow` に変わる → 見出し「明日のタスク」が表示される.
  - シナリオ D: セカンダリリンク 4 つ (プロジェクト / ルーティン / ゴミ箱 / 設定) を順にクリックし, `/projects` `/routines` `/trash` `/settings` への遷移と各見出しを確認.
  - シナリオ E: `/today` で起動 → 「今日のタスク」リンクが `aria-current="page"` を持ち, 他リンクは持たない → 「現在のタスク」リンクをクリック → アクティブが「現在のタスク」リンクに移る.

## 実装で green 化する (green)

### モジュール新規追加

- [ ] T-006: `web/src/ui/app-shell/app-shell.tsx` を新規作成.
  - `<NavLink>` でプライマリ 3 + セカンダリ 4 リンクを配置.
  - `<Outlet />` でメイン領域を構成.
  - `<nav aria-label="サイドバーナビゲーション">` でランドマーク化.
- [ ] T-007: `web/src/ui/app-shell/app-shell.css` を新規作成.
  - flex 横並びの 2 ペイン構成 (サイドバー 200px + メイン flex:1).
  - `.active` クラスで太字 + 左の縦アクセントライン (`border-left-color`).
  - 各値に `/* TODO(BL-046): --space-md */` 等のマーカーを残す (D-005).
- [ ] T-008: `web/src/ui/focus-view/focus-view.tsx` を新規作成 (placeholder).
  - 見出し「現在のタスク」 + 「準備中 (BL-037)」テキストのみ.
  - データ取得 / 起票 / mutation を持たない.
- [ ] T-009: `web/src/ui/tomorrow-view/tomorrow-view.tsx` を新規作成 (placeholder).
  - 見出し「明日のタスク」 + 「準備中 (BL-038)」テキストのみ.
  - データ取得 / 起票 / mutation を持たない.

### 既存ファイル変更

- [ ] T-010: `web/src/main.tsx` の `<Routes>` を `<Route element={<AppShell />}>` で囲って 7 ルート (`/` `/focus` `/today` `/tomorrow` `/projects` `/routines` `/trash` `/settings`) を子化する.
  - `/setup` のみ `<Route element={<AppShell />}>` の外に残す.
  - `<OfflineBanner />` `<PwaUpdateBanner />` `<ErrorNotification />` は `<Routes>` の外に置いたまま (現状維持).
  - `import { AppShell } from "./ui/app-shell/app-shell.js"` を追加.
  - `import { FocusView } from "./ui/focus-view/focus-view.js"` と `import { TomorrowView } from "./ui/tomorrow-view/tomorrow-view.js"` を追加.
- [ ] T-011: 既存 `web/src/router.test.tsx` の MemoryRouter テストを AppShell 配下のルート構造に追従させる (既存テストが落ちる場合のみ).

## 既存 E2E の green 維持確認

- [ ] T-012: `npm run e2e -w web` (もしくは ルートの `npx playwright test`) を実行し, 既存 25 件以上の E2E が引き続き green であることを確認.
  - selector の追従が必要な spec があれば該当ファイルを修正する.
  - 影響が想定される代表 spec: `e2e/smoke.spec.ts` / `e2e/tasks.spec.ts` / `e2e/settings.spec.ts` / `e2e/trash.spec.ts` / `e2e/projects.spec.ts` / `e2e/routines.spec.ts` / `e2e/a11y.spec.ts` (`<main>` ランドマークの重複に注意).
- [ ] T-013: BL-029 で導入された axe (a11y) E2E が violations 0 を維持することを確認.
  - サイドバー周りで axe 違反が出たら `<nav>` の aria-label / リスト構造を見直す.

## リファクタ (refactor)

- [ ] T-014: AppShell の NavLink 配列をデータ駆動化するか, JSX で 7 リンクを直書きするかを実装後に判断.
  - 7 リンクが固定で増減しない (NFR-001 単一ワークフロー強制) ため, JSX 直書きで十分.
  - データ駆動化のメリットがあるなら配列 + map で書き直す (auditor の判断に委ねる).
- [ ] T-015: 暫定 CSS の値が grep 可能な TODO マーカー (`TODO(BL-046)`) で全てカバーされていることを最終確認.

## ドキュメント

- [ ] T-016: マージ後に `docs/developer/planning/backlog.md` の BL-036 を「Done」へ更新 (本 BL の責務外. 管理者または auditor が実施).
- [ ] T-017: 必要なら `docs/developer/features/ui-redesign-foundation/plan.md` の §「段階的移行戦略」のステップ 2 (BL-036 完了) に対応する Done マークを更新 (任意).

## 仕上げ

- [ ] T-018: 受け入れ基準 ([`spec.md`](spec.md) §「受け入れ基準」) を全て満たすことを確認.
  - サイドバーの存在 / プライマリ 3 リンク遷移 / セカンダリ 4 リンク遷移 / アクティブハイライト / ルート構造の不変条件 / 既存 view の不変条件 / placeholder の動作 / 既存 + 新規 E2E green の 8 シナリオ群が全て green.
- [ ] T-019: auditor へレビュー依頼.
  - 仕様適合 (spec.md REQ-1〜REQ-7 全件).
  - 既存 E2E green の維持.
  - 既存 view の振る舞いに変更がないこと (非ゴール担保).
  - BL-037 / BL-038 が placeholder 差し替えで着手できる構造になっているか.
