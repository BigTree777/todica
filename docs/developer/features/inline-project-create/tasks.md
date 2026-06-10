# タスク: 「＋プロジェクトの追加」ボタンを今日ビューに配置 (inline-project-create)

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。
> ブランチ: `feature/inline-project-create` (BL-044 専用. 他 BL の作業を混ぜない).

## テスト (test-designer: 失敗するテストを先に用意する)

- [x] 新規 `e2e/inline-project-create.spec.ts` を作成し, 以下のシナリオを red の状態で用意する (spec §受け入れ基準と対応):
  - [x] AC-1: `/today` ヘッダ領域に「＋プロジェクトの追加」button が 1 個存在し, `/tomorrow` / `/focus` には存在しない. 初期状態で dialog は表示されていない.
  - [x] AC-2: クリックでアクセシブルネーム「プロジェクトの追加」の dialog が開き, 「プロジェクト名」入力にフォーカスがあり, URL は `/today` のまま.
  - [x] AC-3: 名称「仕事」で作成 → `POST /api/v1/projects` (Idempotency-Key 付き) → モーダル閉鎖 → トグル表面に「仕事」(自動選択) → `GET /api/v1/projects` に反映.
  - [x] AC-4: 追加直後にそのまま起票 → `POST /api/v1/tasks` の `projectId` が新規プロジェクト id. 起票後トグルは「（未分類）」へリセット (カード副情報のプロジェクト名表示は検証しない. spec U-7).
  - [x] AC-5: 既存プロジェクトがある状態で追加 → トグル巡回に既存 + 新規 + 「（未分類）」が全て含まれる.
  - [x] AC-6: 「キャンセル」/ Escape で閉じると POST が飛ばず, フォーカスが「＋プロジェクトの追加」button に復帰し, 再オープン時に入力が空.
  - [x] AC-7: 空名称で「追加」→ POST が飛ばずモーダルは開いたまま.
  - [x] AC-8: `page.route` で `POST /api/v1/projects` に失敗を注入 → 「通信に失敗しました」バナー + モーダル開いたまま入力保持 → 正常化後の再試行で成功.
  - [x] AC-9: 同名プロジェクトの作成が成功し一覧に 2 件含まれる.
  - [x] AC-10: 作成後に `/tomorrow` のトグル巡回と `/projects` の一覧へ反映. ProjectsView の作成フォーム / 名称変更 / 削除は従来どおり存在 (無改修確認).
  - [x] AC-11: キーボードのみ (Tab + Enter) で「開く → 入力 → 作成 → トグル反映」が完結する (`e2e/keyboard.spec.ts` のパターン踏襲).
- [x] `e2e/a11y.spec.ts` に「/today モーダル展開状態」の axe スキャンを 1 件追加する (AC-12. 既存 7 view のスキャンは変更しない).
- [x] 新規 `web/src/ui/project-create-dialog/project-create-dialog.test.tsx` (vitest + jsdom) を red で用意する:
  - [x] `open=true` で `showModal` が呼ばれ, `open=false` で閉じる (prop ↔ DOM 同期).
  - [x] 名称入力 + 送信で `repository.create` が `{ id: <uuid>, name }` で呼ばれる.
  - [x] 入力に `required` / `maxLength=200` 属性がある.
  - [x] `repository.create` 失敗時にダイアログが開いたままで入力値が保持される (notifyError 経路).
  - [x] mutation pending 中は「追加」button が disabled.
- [x] 上記テストが現状の実装で fail する (red) ことを確認する.

## 実装 (implementer: テストを green 化する)

- [x] `web/src/ui/project-create-dialog/project-create-dialog.tsx` を新規作成する (plan §コンポーネント設計):
  - [x] ネイティブ `<dialog>` + `useEffect`/`ref` で `open` prop と `showModal()`/`close()` を同期. `cancel` イベント (Escape) で `onClose` に同期. backdrop クリックでは閉じない (D-007).
  - [x] `<h2 id="project-create-title">プロジェクトの追加</h2>` + `aria-labelledby`. フォーム: ラベル「プロジェクト名」+ `required` / `maxLength=200` / `autoFocus` の input + 「追加」(submit) + 「キャンセル」(button).
  - [x] `createMutation` を ProjectsView `createMutation` と同型で実装 (safeEnqueue / offline 分岐 / safeDequeueByKey / `notifyError("通信に失敗しました")`. ConflictError ハンドリングは置かない. plan D-006).
  - [x] onSuccess: `["projects"]` invalidate + 入力クリア + `onClose()` + オンライン成功時 (`result` が Project) のみ `onCreated(result)` (plan D-003 / spec REQ-8).
  - [x] onError: バナーのみ. ダイアログは閉じず入力を保持 (spec REQ-7). pending 中は「追加」を disabled.
  - [x] 閉鎖時 (成功 / キャンセル / Escape) に入力 state を破棄する (spec REQ-5).
- [x] `web/src/ui/project-create-dialog/project-create-dialog.css` を新規作成する (`::backdrop` 含む最小スタイル. WCAG AA contrast. `/* TODO(BL-046) */` マーカー).
- [x] `web/src/ui/today-view/today-view.tsx` を変更する:
  - [x] `<h1>今日</h1>` 直後 (起票フォームより前) に `<button type="button">＋プロジェクトの追加</button>` を追加 (spec REQ-1. 右上配置の最小ローカル CSS. `/* TODO(BL-046) */`).
  - [x] `dialogOpen` state + `<ProjectCreateDialog repository={projectRepository} open onClose onCreated={(p) => setProjectId(p.id)} />` を設置.
  - [x] 起票フォーム / タスクカード / 強調セクション / ConflictDialog は無改修であることを確認.
- [x] `tomorrow-view` / `focus-view` / `projects-view` / サーバ / Repository に変更が無いことを確認する (spec REQ-9 / 非ゴール).

## テスト実行 (green 化の確認)

- [x] `e2e/inline-project-create.spec.ts` 全シナリオ green.
- [x] `e2e/a11y.spec.ts` (モーダル展開スキャン含む) で WCAG 2.1 AA violations 0 件 (AC-12).
- [x] `project-create-dialog.test.tsx` green.
- [x] 既存 E2E スイート全体 + web の単体テスト (`vitest`) が green (回帰なし. 特に `project-toggle.spec.ts` / `today-view-create-form.spec.ts` / `projects.spec.ts` / `keyboard.spec.ts`).
- [x] lint / typecheck で新規違反なし.

## ドキュメント

- [x] `docs/developer/planning/backlog.md` の BL-044 を Done に更新し, 実施内容の要約を備考に記す.
- [x] (該当すれば) ユーザー向けドキュメント (`docs/user/`) にプロジェクト追加導線を追記する (抽象記述で足りるなら不要と判断して良い. BL-043 の前例に従う).

## 仕上げ

- [x] 受け入れ基準 (spec.md AC-1〜AC-12) を全て満たすことを確認.
- [x] spec.md / plan.md の状態を「確定」に更新 (auditor 承認後).
- [x] auditor にレビュー依頼 (観点: foundation REQ-6 適合 / BL-041 トグルとの統合 (自動選択含む) / `<dialog>` の a11y (フォーカストラップ・Escape・復帰) / ProjectsView 無改修 / エラー・オフライン挙動の既存慣行整合).
- [x] PR 作成 → マージ後にブランチ削除.
