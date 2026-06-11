# 仕様: today ヘッダの「＋プロジェクトの追加」ボタン撤去 (remove-inline-project-create)

- 状態: 確定
- 関連:
  - [`../../planning/backlog.md`](../../planning/backlog.md) BL-050
  - 上位要件: NFR-010 (最小手数. UI の重複導線を整理する観点)
  - 依存 BL: BL-044, BL-049
  - 関連 feature:
    - [`../inline-project-create/spec.md`](../inline-project-create/spec.md) BL-044 (Done. 本 BL で撤去する対象 = today ヘッダ上の「＋プロジェクトの追加」ボタンとモーダルマウント. `ProjectCreateDialog` コンポーネント本体は `/projects` 側で利用継続するため残す)
    - [`../hamburger-nav/spec.md`](../hamburger-nav/spec.md) BL-049 (Done. セカンダリナビ 4 件の 1 つに「プロジェクト」リンクが含まれ, `/projects` 画面への遷移が任意の view から可能になった = 本 BL の前提)
    - [`../project-crud/spec.md`](../project-crud/spec.md) BL-016 (Done. `/projects` 画面の作成 / 名称変更 / 削除 UI. 本 BL では無改修)
    - [`../completion-counter-placement/spec.md`](../completion-counter-placement/spec.md) BL-047 (Done. today ヘッダの DOM 順序「h1 → カウンタ → ＋プロジェクトの追加」を確定した. 本 BL でこの順序仕様の 3 要素目が消えるため, 当該テストの撤回が必要)

## 背景 / 課題

BL-044 で today ビューのヘッダ領域に「＋プロジェクトの追加」ボタンを置き, `ProjectCreateDialog` をモーダル展開できるようにした. 当時の動機は「タスク起票中にプロジェクトを思いついた場合, `/projects` に画面遷移せず追加できるようにする」 (NFR-010) ことだった.

その後 BL-049 でハンバーガーメニューが導入され, 全 view から「プロジェクト」リンクで `/projects` 画面に到達できるようになった. `/projects` には従来からプロジェクト作成フォームがあるため, 結果として「today ヘッダのボタンからモーダル」「ハンバーガー → `/projects` の作成フォーム」の 2 経路が併存し UI が重複している.

本 BL ではこの重複を解消するため, today ヘッダのボタン (および付随するモーダルマウントと state) を撤去する. `ProjectCreateDialog` コンポーネント本体は `/projects` 側でも利用される (今後の再利用も想定) ため温存する.

## ゴール / 非ゴール

### ゴール

- `/today` のヘッダから「＋プロジェクトの追加」ボタンを撤去する (DOM から消える / アクセシブルネームで取得できない).
- `today-view.tsx` から付随する 4 箇所を削除する:
  1. ヘッダ内 `<button onClick={() => setProjectDialogOpen(true)}>＋プロジェクトの追加</button>`
  2. `const [projectDialogOpen, setProjectDialogOpen] = useState(false);` state
  3. `<ProjectCreateDialog open={...} onClose={...} onCreated={...} />` のマウント
  4. `ProjectCreateDialog` の import 文
- `/projects` 画面からのプロジェクト作成が引き続き動作する (回帰なし).
- BL-044 の E2E (`e2e/inline-project-create.spec.ts`) を本 BL の方針に従って整理する (詳細は要件 §「テスト資産の整理」).
- 既存テスト全件が green を維持する (回帰なし).

### 非ゴール

- **`web/src/ui/project-create-dialog/` の内部実装変更**: コンポーネント本体は無改修. `/projects` 側 (および将来の再利用) のためにそのまま残す.
- **`/projects` (ProjectsView) の変更**: 作成フォーム / 名称変更 / 削除 UI は現状維持.
- **サーバ API / DB / ドメイン層 / `ProjectRepository` インターフェイスの変更**: 全て無改修.
- **デザイントークン / `tokens.css` / 他 view のスタイル変更**: 触らない (今 in-flight の `feature/design-tokens` とはスコープを分離).
- **`/today` ヘッダの再設計** (3 要素 → 2 要素になることに伴う視覚仕上げ): 視覚調整 (余白 / 配置 / カウンタの位置調整) は本 BL の範囲外. 必要なら別 BL.
- **ハンバーガーメニュー / ナビゲーション構造の変更**: BL-049 の構成 (プライマリ 3 + セカンダリ 4) は触らない.
- **`tomorrow-view` / `focus-view` などへの波及作業**: そもそも対象外 view には「＋プロジェクトの追加」ボタンが無いため変更しない.

## 要件

### 機能要件

- **REQ-1 (today ヘッダのボタン撤去)**
  - `/today` のヘッダ (`<header>` 直下) から「＋プロジェクトの追加」ボタンを撤去する.
  - アクセシブルネーム / テキストとして「＋プロジェクトの追加」を持つ button が DOM 上のどこにも存在しないこと.
  - 残るヘッダ要素は (a) `<h1>今日</h1>` と (b) `<span aria-label="今日の完了タスク数">` の 2 要素のみ. 順序は変えない (`h1` → カウンタ).

- **REQ-2 (today-view.tsx の付随要素削除)**
  - 以下 4 箇所を `web/src/ui/today-view/today-view.tsx` から削除する:
    1. ヘッダ内 `<button type="button" onClick={() => setProjectDialogOpen(true)}>＋プロジェクトの追加</button>`
    2. `const [projectDialogOpen, setProjectDialogOpen] = useState(false);` state 宣言
    3. `<ProjectCreateDialog repository={projectRepository} open={projectDialogOpen} onClose={...} onCreated={(p) => setProjectId(p.id)} />` のマウント
    4. `import { ProjectCreateDialog } from "../project-create-dialog/project-create-dialog.js";` の import 文
  - `setProjectId` の呼出は他経路 (起票フォーム内の `ProjectToggle.onChange`) で引き続き使われているため state そのもの (`projectId` / `setProjectId`) は残す.

- **REQ-3 (モーダルコンポーネントの温存)**
  - `web/src/ui/project-create-dialog/project-create-dialog.tsx` および `.css` は変更しない.
  - `/projects` (ProjectsView) 側での `ProjectCreateDialog` 利用がある場合, その挙動は変えない.
  - `web/src/ui/project-create-dialog/project-create-dialog.test.tsx` (単体テスト) は変更しない (コンポーネント本体を検証するテストであり, today-view からのマウント有無とは独立).

- **REQ-4 (`/projects` 画面の挙動維持)**
  - ハンバーガーメニュー「プロジェクト」リンクから `/projects` に遷移できる.
  - `/projects` 画面の作成フォーム (「プロジェクト名」入力 + 「追加」ボタン) で新規プロジェクトを作成できる.
  - 作成 / 名称変更 / 削除に関する API 呼出 (`POST` / `PATCH` / `DELETE /api/v1/projects`) は本 BL の前後で同等に動作する.

- **REQ-5 (今日ビューでのプロジェクト選択は維持)**
  - 起票フォーム内の `<ProjectToggle />` (BL-041) は無改修. ユーザーは引き続きトグル巡回で既存プロジェクトを選択できる.
  - `["projects"]` キャッシュは `/projects` 画面での作成成功後に invalidate される (既存 ProjectsView の `createMutation` の挙動) ため, 「`/projects` で追加 → `/today` に戻る → トグル巡回に新プロジェクトが現れる」の経路は維持される (本 BL では新規検証しないが回帰させない).

- **REQ-6 (テスト資産の整理)**
  - **E2E `e2e/inline-project-create.spec.ts` の扱い**: 本ファイルは「today ヘッダのボタンを起点に動作する」前提で書かれており, ボタン撤去後は全シナリオが破綻する. 本 BL では **ファイル全体を削除する** (起点の付け替えではなく廃止) ことを確定する. 根拠:
    - 起点を `/projects` に付け替えると, 実質的に既存 `e2e/projects.spec.ts` の作成系シナリオと重複する (`/projects` 側の作成フォームの動作は BL-016 の E2E で既に担保).
    - 本 BL の目的は「重複導線の解消」であり, 撤去対象の E2E をそのまま残す動機が無い.
  - **today-view 単体テスト (`web/__tests__/today-view.test.tsx`) の扱い**: 以下の修正を行う.
    - **削除**: BL-047 の `it("シナリオ: ヘッダに h1「今日」・カウンタ・「＋プロジェクトの追加」ボタンが同居する (REQ-1)", ...)` (今日ヘッダの 3 要素同居と DOM 順序を検証する箇所). 3 要素目が撤去されるためテスト前提が消える.
    - **追加**: 「today ヘッダに『＋プロジェクトの追加』ボタンが存在しないこと」を検証するテストを新規に 1 件追加する (回帰ガード. 詳細は AC-1).
    - **修正**: 起票フォーム内の submit ボタン特定で `BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため` のコメント箇所 (複数箇所) は, `within(form).getByRole("button", ...)` のスコープ限定はそのまま残し, コメントの文面のみ「BL-050 で撤去済み」に更新する (テストロジックは無変更).

- **REQ-7 (a11y 退行なし)**
  - `e2e/a11y.spec.ts` の WCAG 2.1 AA violations 0 件を維持する.
  - BL-044 で `e2e/a11y.spec.ts` に追加された「`/today` モーダル展開状態」のスキャンは, 起点となるボタンが消えるため**削除する** (詳細は REQ-6 の E2E 整理と同様の理由).

### 非機能要件

- **NFR-A11Y**: `/today` を含む全 7 view で WCAG 2.1 AA violations 0 件 (既存基準維持).
- **NFR-COMPAT**: サーバ API / DB / ドメイン層 / Repository インターフェイス無改修. ナビゲーション構造 (BL-049) も無改修.
- **NFR-CONSISTENCY**: `today-view.tsx` の他箇所 (起票フォーム / タスクカード / 強調セクション / `ProjectToggle` / `ConflictDialog`) は無改修.
- **NFR-CODE-MINIMALITY**: 削除対象は「重複した UI」のみ. 補助的に到達可能性 (= ハンバーガー → `/projects`) が確保されているため, 機能のロールバックではなく整理であることを保つ.

## 受け入れ基準

> 書き方は [`../../quality/acceptance-criteria.md`](../../quality/acceptance-criteria.md) に従う.

```
シナリオ AC-1: today ヘッダから「＋プロジェクトの追加」ボタンが消えている
  Given /today を開いた
  When  画面全体を観察する
  Then  アクセシブルネーム「＋プロジェクトの追加」の button が DOM 上に存在しない (count = 0)
   かつ ヘッダ (<header>) 内には <h1>今日</h1> と aria-label="今日の完了タスク数" の <span> の 2 要素のみが含まれる (順序: h1 → カウンタ)
```

```
シナリオ AC-2: today ヘッダのどこから操作してもプロジェクト追加モーダルが開かない
  Given /today を開いた
  When  ヘッダ (<header>) 内のすべての button をクリックする (現状想定では存在しない)
   かつ ヘッダ内の任意の要素を click / Enter / Space で作動させる
  Then  role="dialog" の要素 (アクセシブルネーム「プロジェクトの追加」) は表示されない
   かつ URL は /today のままである
```

```
シナリオ AC-3: ハンバーガーメニュー → /projects 経路でのプロジェクト作成が引き続き動作する
  Given /today を開いた
   かつ プロジェクトが 0 件登録されている
  When  ハンバーガーボタン (☰) を押してメニューを開き「プロジェクト」リンクを押す
  Then  /projects 画面が表示される
  When  「プロジェクト名」入力に「仕事」と入力し「追加」ボタンを押す
  Then  POST /api/v1/projects が body { name: "仕事" } と Idempotency-Key ヘッダ付きで呼ばれる
   かつ /projects の一覧に「仕事」が表示される
```

```
シナリオ AC-4: /projects で追加したプロジェクトは /today のトグル巡回に現れる (回帰なし)
  Given /projects から「個人」プロジェクトを 1 件作成した
  When  ハンバーガーメニューで /today に戻り起票フォームのプロジェクトトグルを巡回する
  Then  巡回経路に「個人」「（未分類）」が含まれる
```

```
シナリオ AC-5: today の起票フォームのプロジェクト選択 (ProjectToggle) は無改修で動作する
  Given /today を開き, プロジェクト「個人」が登録済みである
  When  起票フォーム内のプロジェクトトグルをクリックして「個人」を選択する
   かつ タスク名「買い物」を入力して起票フォームの「追加」を押す
  Then  POST /api/v1/tasks の body に「個人」プロジェクトの id が projectId として含まれる
   かつ 起票後トグルは「（未分類）」にリセットされる (BL-041 AC-10 互換)
```

```
シナリオ AC-6: アクセシビリティ違反 0 件を維持する
  Given /today / /tomorrow / /focus / /projects / /trash / /routines / /settings を開いた
  When  @axe-core/playwright で WCAG 2.1 AA をスキャンする
  Then  すべての view で violations.length === 0
```

```
シナリオ AC-7: BL-044 の E2E (今日ヘッダ起点のシナリオ) が物理的に存在しない
  Given リポジトリのワーキングツリーを観察する
  When  e2e/ ディレクトリの一覧を取る
  Then  inline-project-create.spec.ts が存在しない
   かつ /today のヘッダボタンを起点とする (アクセシブルネーム「＋プロジェクトの追加」を click する) E2E シナリオが他ファイルにも存在しない
```

```
シナリオ AC-8: today-view 単体テスト (web/__tests__/today-view.test.tsx) でヘッダの 3 要素同居検証が無く, 代わりに「ボタンが存在しないこと」の検証がある
  Given web/__tests__/today-view.test.tsx を読む
  When  BL-047 (完了タスク数カウンタの配置見直し) の describe 配下を見る
  Then  「ヘッダに h1「今日」・カウンタ・「＋プロジェクトの追加」ボタンが同居する」シナリオ (it ブロック) が存在しない
   かつ today-view の describe のいずれかに「today ヘッダに『＋プロジェクトの追加』ボタンが存在しないこと」を検証する it ブロックが存在する
```

```
シナリオ AC-9: today-view.tsx に ProjectCreateDialog への参照が残っていない
  Given web/src/ui/today-view/today-view.tsx を読む
  When  ファイル本文を grep する
  Then  "ProjectCreateDialog" / "projectDialogOpen" / "setProjectDialogOpen" のどの識別子も出現しない
   かつ web/src/ui/project-create-dialog/project-create-dialog.tsx は無改修で存在し続ける
```

```
シナリオ AC-10: 既存テスト全件が green を維持する (回帰なし)
  Given main ブランチ相当の green な状態から本 BL の変更を適用した
  When  web 単体テスト (vitest) と E2E (Playwright) を全件実行する
  Then  全件 green である
   かつ lint / typecheck で新規違反が出ない
```

## 未決事項 / 確認待ち

- **U-1 (BL-044 E2E ファイルの扱い: 廃止 vs 起点付け替え)**: REQ-6 で「ファイル全体削除」を確定した. 根拠は (1) `/projects` 起点での作成は `e2e/projects.spec.ts` (BL-016) で既にカバー済み, (2) 本 BL は重複導線の整理であり, 撤去対象に関する E2E を残す動機が薄い, (3) `["projects"]` キャッシュ共有による today / tomorrow トグルへの反映は `e2e/projects.spec.ts` の既存テストでカバー可能 (= 必要なら同ファイルに 1 件追記すれば足りる). 「念のため起点を `/projects` に付け替えて残す」案は重複テストになるため不採用. 異論があれば plan 確定前に変更する.
- **U-2 (`/projects` 画面に「（未分類）以外のトグル反映確認」が無い場合の補強)**: REQ-5 / AC-4 で「`/projects` で追加したプロジェクトが today トグルに現れる」経路を残すことを確認する. 既存 `e2e/projects.spec.ts` がこの経路を網羅しているかは plan 段階で確認する. 不足していれば `e2e/projects.spec.ts` に 1 件補強する判断が必要. 本 BL の範囲内とする (`/projects` ファイル本体には触らないため整合).
- **U-3 (BL-047 同居テストの削除粒度)**: REQ-6 では「同居テスト 1 件のみ削除」とした. BL-047 の他テスト (「カウンタが header の子孫」「カウンタが `<span>` タグ」「他ビューに非波及」) は 3 要素目に依存しないため変更不要. もし auditor が「3 要素同居の DOM 順序仕様自体が BL-047 spec.md に残っているのは矛盾」と判定した場合は, 別 BL で BL-047 spec.md を後追い更新する案がある (本 BL では BL-047 spec.md に触らない).
- **U-4 (`/today` ヘッダの視覚仕上げ)**: ボタン撤去後の余白 / 配置調整は本 BL では行わない. CSS (`today-view.css` 等) も触らない予定. 視覚的に不自然な余白が残った場合, 修正は別 BL とする.
- **U-5 (`ProjectCreateDialog` を `/projects` 側で利用しているか)**: 本 BL の前提は「`ProjectCreateDialog` は `/projects` 側で利用継続するため残す」だが, 実際に ProjectsView がモーダル形式で利用しているか, それとも `/projects` 画面内のインラインフォームを使い続けているかは plan 段階で `projects-view.tsx` を確認する. 仮に ProjectsView が `ProjectCreateDialog` を一切利用していないとしても, 将来の再利用 (例: 別ビューからの追加導線) のためにコンポーネント本体は残す方針を維持する (削除コストの単純化).
