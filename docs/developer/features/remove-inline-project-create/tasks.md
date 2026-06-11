# タスク: today ヘッダの「＋プロジェクトの追加」ボタン撤去 (remove-inline-project-create)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。
> ブランチ: `feature/remove-inline-project-create` (BL-050 専用. 他 BL の作業を混ぜない).

## 事前確認 (project-designer / 着手前)

- [ ] `web/src/ui/projects-view/projects-view.tsx` を確認し, `ProjectCreateDialog` を import / 利用しているかを確認する (plan §リスク 1 / spec U-5).
- [ ] `web/src/` 全体で `ProjectCreateDialog` の参照箇所を grep し, today-view 以外で利用されている箇所を洗い出す.
- [ ] `e2e/projects.spec.ts` の現状シナリオを確認し, AC-3 / AC-4 (= `/projects` 起点での作成と today トグル反映) を既存テストがカバーしているか確認する (spec U-2).
- [ ] `web/__tests__/today-view.test.tsx` 内の `// BL-044:` コメント箇所 (約 10 箇所) を一覧化する.
- [ ] `e2e/a11y.spec.ts` 内の「`/today` モーダル展開状態」スキャンの位置を特定する.

## テスト (test-designer: 失敗するテストを先に用意する)

- [ ] 新規 / 修正テストを以下のように red の状態で用意する (spec §受け入れ基準と対応):
  - [ ] AC-1: `web/__tests__/today-view.test.tsx` に「today ヘッダに『＋プロジェクトの追加』ボタンが存在しない」を検証する it ブロックを新規追加する.
    - 内容: `TodayView` を render 後, `screen.queryByRole("button", { name: "＋プロジェクトの追加" })` が `null` であること.
    - さらに `document.querySelector("header")` の子要素として `<h1>` と `<span aria-label="今日の完了タスク数">` の 2 要素のみが含まれることを検証する (順序: h1 → カウンタ).
    - describe 名は「TodayView (BL-050 today ヘッダの「＋プロジェクトの追加」ボタン撤去)」とする.
  - [ ] AC-8 の前段: `web/__tests__/today-view.test.tsx` の BL-047 同居テスト (`it("シナリオ: ヘッダに h1「今日」・カウンタ・「＋プロジェクトの追加」ボタンが同居する (REQ-1)", ...)`) を**削除する** (実装が green になると当該 it ブロックの assertion が前提崩壊で fail するため, 削除して整合させる).
  - [ ] AC-7: `e2e/inline-project-create.spec.ts` を**ファイルごと削除する** (削除自体は実装フェーズで行う. テスト設計フェーズではファイル削除がテスト全体実行で「該当テスト不在 = pass」と扱われることを確認するのみ).
  - [ ] AC-6 (a11y モーダル展開スキャン削除の準備): `e2e/a11y.spec.ts` 内「`/today` モーダル展開状態」スキャンの実装フェーズでの削除箇所を特定しておく.
- [ ] 上記新規 it ブロック (AC-1 用) が現状の実装で fail する (red) ことを確認する.
  - 現状 today-view はヘッダ内に「＋プロジェクトの追加」button をマウントしているため, `queryByRole("button", { name: "＋プロジェクトの追加" })` は要素を返し `null` にならず fail する.
- [ ] BL-047 同居テスト削除に伴う他テストへの巻き込み無し (= 他の it ブロックが残った状態で test ファイル全体が parse できる) ことを確認する.

## 実装 (implementer: テストを green 化する)

- [ ] `web/src/ui/today-view/today-view.tsx` から以下 4 箇所を削除する (spec REQ-2):
  - [ ] (1) ヘッダ内 `<button type="button" onClick={() => setProjectDialogOpen(true)}>＋プロジェクトの追加</button>` JSX.
  - [ ] (2) `const [projectDialogOpen, setProjectDialogOpen] = useState(false);` state 宣言. 隣接する BL-044 コメントも併せて削除.
  - [ ] (3) `<ProjectCreateDialog repository={projectRepository} open={projectDialogOpen} onClose={() => setProjectDialogOpen(false)} onCreated={(project) => setProjectId(project.id)} />` のマウント JSX. 隣接する BL-044 コメントも削除.
  - [ ] (4) `import { ProjectCreateDialog } from "../project-create-dialog/project-create-dialog.js";` の import 文.
- [ ] `projectId` / `setProjectId` state は残っていることを確認する (起票フォーム内 `ProjectToggle` で引き続き利用される. spec REQ-2 末尾).
- [ ] `projectRepository` prop および `["projects"]` の useQuery は残っていることを確認する (起票フォーム内 `ProjectToggle` の供給源).
- [ ] `web/__tests__/today-view.test.tsx` の `// BL-044: ヘッダ領域に「＋プロジェクトの追加」button が増えたため` コメント (約 10 箇所) を「`// BL-050: ヘッダから「＋プロジェクトの追加」button を撤去 (元は BL-044 で追加されていた)`」相当に文面更新する. テストロジック (`within(form).getByRole(...)`) は無変更.
- [ ] `e2e/inline-project-create.spec.ts` ファイルを削除する.
- [ ] `e2e/a11y.spec.ts` から「`/today` モーダル展開状態」スキャンを 1 件削除する. 既存 7 view スキャンは無改修.
- [ ] 以下のファイル / ディレクトリに変更が無いことを確認する (spec 非ゴール):
  - [ ] `web/src/ui/project-create-dialog/project-create-dialog.tsx`
  - [ ] `web/src/ui/project-create-dialog/project-create-dialog.css`
  - [ ] `web/src/ui/project-create-dialog/project-create-dialog.test.tsx`
  - [ ] `web/src/ui/projects-view/projects-view.tsx`
  - [ ] `web/src/ui/tomorrow-view/` 全般
  - [ ] `web/src/ui/focus-view/` 全般
  - [ ] `web/src/ui/app-shell/` 全般 (BL-049 ハンバーガーメニュー)
  - [ ] サーバ側 / `ProjectRepository` インターフェイス

## テスト実行 (green 化の確認)

- [ ] 新規 it ブロック (AC-1) が green.
- [ ] `web/__tests__/today-view.test.tsx` 全体が green (削除した BL-047 同居テスト以外の it ブロックに回帰がないこと. 特に BL-047 「カウンタが header の子孫」/「カウンタが `<span>` タグ」/「他ビューに非波及」の 3 件は引き続き green).
- [ ] `web/src/ui/project-create-dialog/project-create-dialog.test.tsx` が green (コンポーネント本体は無改修のため変化なし).
- [ ] `e2e/inline-project-create.spec.ts` が存在しないこと (AC-7).
- [ ] `e2e/a11y.spec.ts` が green (モーダル展開スキャン削除後の構成で. AC-6).
- [ ] `e2e/projects.spec.ts` が green (回帰なし. AC-3 / AC-4).
- [ ] `e2e/project-toggle.spec.ts` が green (回帰なし. AC-5).
- [ ] その他既存 E2E スイート全体が green (回帰なし. `keyboard.spec.ts` 等含む).
- [ ] web 単体テスト全体 (`vitest`) が green.
- [ ] lint / typecheck で新規違反なし (AC-10).
- [ ] `web/src/ui/today-view/today-view.tsx` に "ProjectCreateDialog" / "projectDialogOpen" / "setProjectDialogOpen" のいずれの識別子も残っていないことを grep で確認する (AC-9).

## ドキュメント

- [ ] `docs/developer/planning/backlog.md` の BL-050 を Done に更新し, 実施内容の要約を備考に追記する.
  - 「BL-044 で today ヘッダに追加した「＋プロジェクトの追加」ボタンと付随する `projectDialogOpen` state / `ProjectCreateDialog` のマウント / import を撤去. `ProjectCreateDialog` コンポーネント本体は `/projects` 側 / 将来再利用のため温存. `e2e/inline-project-create.spec.ts` 全削除 + `e2e/a11y.spec.ts` モーダル展開スキャン削除 + today-view 単体テストに「ボタン非存在」回帰ガード 1 件追加.」のような要約.
- [ ] ユーザー向けドキュメント (`docs/user/`) に「today ヘッダから直接プロジェクトを追加できる導線」を記述している箇所があれば撤回する (なければスキップ).
- [ ] `docs/developer/features/inline-project-create/` 配下のドキュメントは Done 状態のまま保存する (過去の意思決定の記録として残す. 撤去した旨は backlog 備考と本 BL spec の冒頭で参照可能).

## 仕上げ

- [ ] 受け入れ基準 (spec.md AC-1〜AC-10) を全て満たすことを確認.
- [ ] spec.md / plan.md の状態を「確定」に更新 (auditor 承認後).
- [ ] auditor にレビュー依頼 (観点: 
  - 4 箇所の削除が漏れなく実施されているか (REQ-2 全項目)
  - `ProjectCreateDialog` 本体 / `/projects` 経路 / 他 view への波及がないこと
  - BL-049 ハンバーガー経路で `/projects` に到達できる + 作成できることが既存 E2E でカバーされていること
  - テスト資産の整理 (E2E 1 ファイル削除 + a11y スキャン 1 件削除 + 単体 1 件削除 + 単体 1 件追加) の妥当性
  - BL-047 spec.md への遡及更新の要否 (spec U-3 / plan D-005)
- [ ] PR 作成 → マージ後にブランチ削除.
