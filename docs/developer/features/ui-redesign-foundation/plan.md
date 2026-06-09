# 設計・実装計画: UI 全面刷新の総合仕様 (デザイン基盤と差分カタログの確定)

> [`spec.md`](spec.md) の要件を, どう実現するかに落とす. 本 BL は **foundation** であり, 自身は実装をほぼ持たず, 後続 BL-036 〜 BL-047 の設計の足場を確定する.

## 方針概要

- **3 層分離アプローチ**: (1) AppShell (サイドバー + Outlet) の骨格を最初に作る. (2) 各 view (focus / today / tomorrow / 補助) を順次刷新する. (3) デザイントークンを並行整備し全 view が同じトークンを参照するようにする.
- **既存 view を破壊せず段階移行**: BL-036 で骨格を導入する際, 既存 `today-view.tsx` は当面そのまま `/today` ルートに残す. その後 BL-037 〜 BL-042 で順次切り出し / 置換していく.
- **本 BL の実体は「文書 + ADR (任意) + 後続 BL のスコープ確定」のみ**. 実装コード変更は伴わない.

## アーキテクチャ

### ルーティング設計

**新規ルート**:

| パス | コンポーネント | 担当 BL | 備考 |
| --- | --- | --- | --- |
| `/` | (Navigate to `/today`) | BL-036 | 現状維持 |
| `/focus` | `FocusView` (新規) | BL-037 | 現在のタスクの単独表示 |
| `/today` | `TodayView` (刷新後) | BL-039 / BL-040 / BL-041 / BL-042 / BL-044 | 今日のタスク一覧 + 起票 |
| `/tomorrow` | `TomorrowView` (新規) | BL-038 | 明日のタスク一覧 + 起票 |
| `/projects` | `ProjectsView` (現状維持 + スタイル) | BL-045 | 名称変更 / 削除 |
| `/routines` | `RoutinesView` (現状維持 + スタイル) | BL-045 | CRUD |
| `/trash` | `TrashView` (現状維持 + スタイル) | BL-045 | 復元 / 空にする |
| `/settings` | `SettingsView` (現状維持 + スタイル) | BL-045 | 境界時刻 / モード切替 |
| `/setup` | `SetupView` (AppShell の外) | (現状維持) | Android 初回起動時のみ. サイドバーを出さない |

**初期リダイレクト**: 既存どおり `/` → `/today` (FR-010).

### コンポーネント階層方針

```
<BrowserRouter>
  <QueryClientProvider>
    <Routes>
      <Route path="/setup" element={<SetupView />} />        ← AppShell の外
      <Route element={<AppShell />}>                         ← サイドバー + Outlet
        <Route path="/" element={<Navigate to="/today" />} />
        <Route path="/focus" element={<FocusView />} />
        <Route path="/today" element={<TodayView />} />
        <Route path="/tomorrow" element={<TomorrowView />} />
        <Route path="/projects" element={<ProjectsView />} />
        <Route path="/routines" element={<RoutinesView />} />
        <Route path="/trash" element={<TrashView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Route>
    </Routes>
  </QueryClientProvider>
</BrowserRouter>
```

- `AppShell` (`web/src/ui/app-shell/app-shell.tsx`, 新規) はサイドバー (プライマリ 3 + セカンダリ 4) と React Router の `<Outlet />` を持つ.
- Repository の注入 (現状 `main.tsx` で props 渡し) は React Context 化を検討 (BL-036 で確定). props drilling を避けるため.

### 共通スタイル / トークン配置

- **配置**: `web/src/styles/tokens.css` (新規, BL-046 で具体値). `main.tsx` から import.
- **採用するアプローチ**: vanilla CSS + CSS variables (保守側デフォルト. U-006). 既存依存への追加を避ける.
- **トークン体系** (spec.md REQ-7 と対応):
  - `--font-size-h1`, `--font-size-h2`, `--font-size-body`, `--font-size-small`
  - `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl`
  - `--radius-sm`, `--radius-md`, `--radius-lg`
  - `--color-bg`, `--color-fg`, `--color-border`, `--color-accent`, `--color-danger`
- **代替案**: Tailwind / CSS Modules / styled-components. ADR で比較し却下根拠を残す (BL-046 内で起票, 任意).

## 後続 BL の依存関係グラフ

依存方向: `A → B` は「A の完了が B の前提」を意味する.

```
BL-035 (本 BL: foundation)
  ├─→ BL-036 (AppShell + 3 ルート骨格)
  │     ├─→ BL-037 (focus-view 切り出し)
  │     ├─→ BL-038 (tomorrow-view 新規)
  │     └─→ BL-045 (補助 view のシェル統合)
  ├─→ BL-046 (デザイントークン基盤)
  │     ├─→ BL-036 でも参照 (シェル自体のスタイル)
  │     ├─→ BL-037 / BL-038 / BL-042 (各 view のスタイル適用)
  │     └─→ BL-045 (補助 view のスタイル適用)
  ├─→ BL-040 (優先度 星 3 つ UI)
  │     └─→ BL-042 (タスクカードに星表示が必要)
  ├─→ BL-041 (プロジェクトトグル UI)
  │     ├─→ BL-039 (起票フォーム再構成で使う)
  │     └─→ BL-044 (プロジェクト追加でトグル即時反映の要件)
  └─→ BL-047 (完了数カウンタ配置)
        └─→ (BL-036 / BL-037 / 今日ビューの配置先による)

BL-037 (focus-view) ──┬─→ BL-043 (現在に設定 UX. focus 設定先が必要)
BL-038 (tomorrow-view) ┘ (BL-042 と一緒に検討する余地あり)

BL-039 (起票フォーム期限セレクト削除)
  ← 依存: BL-037 (focus-view 確立) + BL-038 (tomorrow-view 確立)
  → なし

BL-042 (タスクカードアクション 3 つに削減)
  ← 依存: BL-035 (規約) + BL-040 (星 UI が決まると編集ボタン経路も決まる)
  → BL-043 (現在に設定 がカードから外れることが前提)

BL-043 (現在に設定 ジェスチャ)
  ← 依存: BL-037 (focus 先) + BL-042 (カードから外れる)

BL-044 (プロジェクト追加ボタン)
  ← 依存: BL-041 (トグル UI に即時反映する仕様)
```

### 独立着手可能な BL (依存なし or 本 BL のみに依存)

- **BL-036** (AppShell): 本 BL 完了後すぐ着手可能. 既存 `today-view.tsx` はそのまま `/today` に残す.
- **BL-046** (デザイントークン): 本 BL 完了後すぐ着手可能. 既存 view を壊さずトークン定義のみ追加. 後続 BL がトークンを参照する形に順次置換.
- **BL-040** (優先度 星 UI): 本 BL 完了後すぐ着手可能. 既存 `<select>` を差し替えるだけで他 view に影響しない.
- **BL-041** (プロジェクトトグル): 本 BL 完了後すぐ着手可能. 既存 `<select>` を差し替えるだけ.
- **BL-047** (完了数カウンタ配置): 本 BL の Open Question U-003 を確定後着手可能.

### 直列着手が必要な BL

- **BL-037 / BL-038 / BL-045** は **BL-036** (AppShell) 完了後に着手.
- **BL-039** は **BL-037 + BL-038** 完了後 (ビュー文脈で dueDate が決まる前提).
- **BL-042** は **BL-040** 完了後 (星 UI がカード上にある前提).
- **BL-043** は **BL-037 + BL-042** 完了後 (focus 先 + カードからの除去が前提).
- **BL-044** は **BL-041** 完了後 (トグル UI に即時反映する前提).

## 影響範囲

本 BL 自身の影響範囲. 実装作業は本 BL ではほぼ生じない.

| 領域 | 変更内容 |
| --- | --- |
| API | なし. 既存 API を無改修で使う前提を後続 BL に降ろす. |
| DB | なし. データモデル変更なし. |
| モジュール | なし. 本 BL は spec / plan / tasks の文書のみ. (後続 BL で `web/src/ui/app-shell/`, `web/src/ui/focus-view/`, `web/src/ui/tomorrow-view/`, `web/src/styles/tokens.css` などが新規追加される予定) |
| UI | なし. 後続 BL で順次刷新. |
| ドキュメント | `docs/developer/features/ui-redesign-foundation/` の 3 ファイル新規追加. 必要なら ADR を 1 件起票 (CSS フレームワーク選定. 任意). `docs/developer/planning/backlog.md` の BL-035 〜 BL-047 メモ欄を本 BL 確定後に更新する可能性あり. |

## 設計詳細

### 段階的移行戦略

**一度に全 view を壊さない原則**. 既存 E2E テスト (25 件以上) と E2E aria-label 依存を保ったまま段階的に置換する.

**ステップ**:

1. **BL-046** でトークン定義のみ追加 (既存 view は無改修). このステップで `web/src/styles/tokens.css` が import されるだけ.
2. **BL-036** で AppShell + 3 ルート (`/focus` / `/today` / `/tomorrow`) を導入. `/focus` `/tomorrow` は **既存 `today-view.tsx` を流用した暫定実装** で良い (E2E が落ちないように). `/today` は既存実装をそのまま使う.
3. **BL-037** で focus-view を切り出す. このタイミングで `today-view.tsx` の `<section aria-label="現在のタスク">` を削除する (focus 表示は `/focus` に移管). 既存 E2E で focus 関連の selector が `/today` を前提にしているなら `/focus` に書き換える.
4. **BL-038** で tomorrow-view を新規実装.
5. **BL-040 / BL-041** で起票フォーム内の `<select>` を星 / トグルに置換.
6. **BL-039** で期限セレクトを削除.
7. **BL-042** でタスクカードのアクションを 3 つに削減. 「現在に設定」「編集」「優先度切替」をカードから外す.
8. **BL-043** で「現在に設定」のジェスチャを実装.
9. **BL-044** でプロジェクト追加ボタンを今日ビューに追加.
10. **BL-045** で補助 view (settings/trash/routines/projects) のスタイル統一.
11. **BL-047** で完了数カウンタの配置を再設計.

各ステップで以下を満たすこと:
- 既存 E2E テスト (25 件以上) が green を維持する. 必要なら selector を順次更新する.
- サーバ API への変更が発生しない (本 BL 全体の不変条件).
- ドメイン値域 (`Priority` 3 値 / `DueDate` 2 値) に変更を加えない (UI 表現のみ変更).

### データモデル

変更なし.

### 処理フロー

変更なし. 各書込 mutation は引き続き既存の `repository.create()` / `update()` / `delete()` / `complete()` / `setFocus()` を呼ぶ.

### 例外 / エラー処理

変更なし. BL-031 / BL-033 / BL-034 で確立した ConflictDialog / ErrorNotification の枠組みを各刷新後の view も流用する.

## 重要な決定

- **D-001 ナビゲーション構造 = 左サイドバー + Outlet の 2 ペイン**. モックアップに従う. モバイル (狭幅) の扱いは U-001 で別途確定.
- **D-002 3 ビュー切替の責務分解** = focus (1 件単独大表示) / today (一覧 + 起票) / tomorrow (一覧 + 起票). NFR-011 を focus-view に, NFR-010 を today/tomorrow-view に明確に分離する.
- **D-003 タスクカードのアクション最大数 = 3**. spec.md REQ-3. focus-view は 2.
- **D-004 起票フォーム入力 4 要素**. 期限セレクト除去. spec.md REQ-4.
- **D-005 副次操作 (編集 / 現在に設定) はカード上のボタンではなく別ジェスチャ**. キーボード経路必須. 詳細は BL-042 / BL-043 で確定.
- **D-006 デザイントークンは vanilla CSS + CSS variables**. U-006 の保守側デフォルト. ADR を別途起票するかは BL-046 で判断 (任意).
- **D-007 ダークモードは本 BL では対応しない**. U-002 の保守側デフォルト. NFR-012 (設定項目最小化) と整合.
- **D-008 完了数カウンタ配置は U-003 の保守側デフォルト (今日ビュー見出しの右に小さく)** を初期案とし, BL-047 で最終確定.
- **D-009 既存 view への破壊的変更を避ける段階移行**. 上述「段階的移行戦略」のとおり.
- **D-010 本 BL では ADR を新規作成しない (任意)**. CSS フレームワーク選定について別途 ADR が必要になったら BL-046 内で起票する. 本 BL の plan.md に書ききった D-001 〜 D-009 で個別 ADR は不要と判断.

## リスク / 代替案

- **R-001 段階移行中に E2E が連続して落ちるリスク**. 各 BL の PR で selector 更新を必ず含める. CI で全 E2E が green を維持する条件をマージ条件にする.
- **R-002 BL-036 の AppShell 導入で `main.tsx` の props drilling が複雑化する**. Repository を React Context に移すリファクタを BL-036 内で実施する案. ただし既存テストが props 注入前提なら影響を見ながら判断 (BL-036 の plan で確定).
- **R-003 トークン体系のトークン名が後続 BL で揺れるリスク**. BL-046 で命名規約を spec で先に確定し, 各 BL がそれに従う形にする.
- **R-004 BL の依存関係が長くなり並行開発できないリスク**. 上述の依存関係グラフから「独立着手可能 5 件 / 直列 6 件」と整理. 並行開発する場合は独立 5 件 (BL-036 / BL-040 / BL-041 / BL-046 / BL-047) から先に着手する.
- **代替案: 一度に全 view を壊して刷新する (big bang)**. 採用しない. R-001 のリスクが大きすぎる.
- **代替案: Tailwind を導入する**. 採用しない. 個人開発・OSS の依存追加コストを避ける (D-006).
- **代替案: ビューを切り分けず 1 つの長いページで縦スクロール表示する (モック上段の「現在のタスク」と下段の「今日のタスク」が縦に並ぶ図そのまま)**. 採用しない. NFR-011 (現在のタスクが単独で大きく表示) を満たすために focus-view は独立画面にする (D-002).

## テスト方針

> 全体方針は [`../../quality/test-catalog.md`](../../quality/test-catalog.md). 本 BL は文書 BL のため, 「実装テスト」は持たず, 文書監査と後続 BL の独立着手可能性検証を主とする.

### 本 BL で行う検証

- **文書監査 (auditor)**:
  - spec.md の §「差分カタログ」が後続 BL の責務範囲を一意に決められる粒度であること.
  - plan.md の §「後続 BL の依存関係グラフ」が完全であること (BL-036 〜 BL-047 全 12 件が登場している).
  - 既存 FR / NFR の不変条件 (API / データモデル / ドメイン値域への変更なし) が spec / plan のどちらでも明示されていること.
  - Open Questions が後続 BL のいずれかに割り当てられている (放置されない) こと.
- **後続 BL 着手シミュレーション**:
  - 独立着手可能とされる 5 件 (BL-036 / BL-040 / BL-041 / BL-046 / BL-047) のいずれかについて, 本 spec / plan のみを参照して spec ドラフトを起こせるかを auditor が試行する.
- **既存 E2E の green 維持条件の明示**:
  - 本 BL では実装変更がないため E2E は無影響. 後続 BL の各 PR で「E2E green 維持」をマージ条件にする方針を plan.md §「段階的移行戦略」で確定済み.

### 後続 BL のテスト方針 (本 BL では枠だけ提示)

- 各後続 BL は単体 / 結合 / E2E の 3 階層を引き続き採用する.
- UI 刷新後も既存 E2E (25 件以上) を green に保つ. selector / aria-label が変わる箇所は各 BL の PR 内で更新.
- 新規 view (focus / tomorrow / AppShell) には新規 E2E を追加する (各 BL の責務).
