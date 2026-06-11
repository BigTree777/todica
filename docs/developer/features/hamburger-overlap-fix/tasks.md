# タスク: ハンバーガーボタンと h1 タイトルの重なり修正

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## テスト設計 (test-designer)

- [ ] 単体テスト `web/__tests__/hamburger-overlap-fix.test.ts` を新規作成し, 以下を red 状態で用意する:
  - [ ] AC-1: `.app-shell__main` の宣言ブロックに `padding-top: calc(var(--space-md) + var(--space-xl))` が含まれることを assert
  - [ ] AC-2: 同ブロックに `padding: var(--space-md);` ショートハンドが残っていることを assert
  - [ ] AC-3: 同ブロック内に生 px 値 (`/\d+px/`) が含まれないことを assert
  - [ ] AC-4: `.app-shell__hamburger` の `position: fixed` / `top: var(--space-sm)` / `left: var(--space-sm)` / `z-index: 200` が維持されていることを assert
- [ ] E2E `e2e/hamburger-overlap-fix.spec.ts` を新規作成し, red 状態で用意する:
  - [ ] AC-5: `/focus`, `/today`, `/tomorrow`, `/projects`, `/routines`, `/trash`, `/settings` の各画面で `h1` と `button[aria-label="メニューを開く"]` の `boundingBox()` を取得し, ハンバーガー bottom ≤ h1 top であることを assert

## 実装 (implementer)

- [ ] `web/src/ui/app-shell/app-shell.css` の `.app-shell__main` ルールに `padding-top: calc(var(--space-md) + var(--space-xl));` を 1 行追加する
- [ ] 追加行の上に, ハンバーガーボタンの実寸 (約 36px) との関係を説明する CSS コメントを 1〜2 行で記述する (BL-053 参照を含む)
- [ ] 単体テスト / E2E テストを実行して green 化を確認する
- [ ] BL-049 の既存テスト (単体 / E2E) が回帰していないことを確認する

## 監査 (auditor)

- [ ] 仕様適合確認: spec.md の AC-1〜AC-7 がすべて満たされている
- [ ] 設計適合確認: 案 A が採用され, 各 view の tsx / css と `app-shell.tsx` が変更されていない
- [ ] テスト妥当性確認: 単体テストと E2E が仕様を正しく表現している
- [ ] コード品質確認: 既存トークンのみ使用, 生 px 値の追加が無い, コメントが将来の保守者に十分な情報を与えている
- [ ] 既存 BL-049 (`features/hamburger-nav/`) の AC-1〜AC-9 を覆うテストが回帰していない

## ドキュメント

- [ ] 完了時に `docs/developer/planning/backlog.md` の BL-053 行のステータスを Todo → Done に更新
- [ ] 完了時に BL-053 行の備考欄に, 採用案 (案 A) と最終的な `padding-top` 値 (`calc(var(--space-md) + var(--space-xl))` = 48px) を簡潔に記録

## 仕上げ

- [ ] 受け入れ基準 (spec.md AC-1〜AC-7) を全て満たすことを確認
- [ ] `npm test` および `npx playwright test` の全件 green を確認
- [ ] PR を作成し auditor のレビュー依頼
