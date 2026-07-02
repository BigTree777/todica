# タスク: ダークモードのベース色適用（body 背景・文字色）

> [`plan.md`](plan.md) を実行可能な単位に分解する。完了したらチェックを入れる。

## 実装

- [ ] `web/src/styles/base.css` を新設し、以下の 2 ルールのみを定義する（plan「base.css の内容」）:
  - [ ] `:root { color-scheme: light dark; }`
  - [ ] `body { background: var(--color-bg); color: var(--color-fg); }`
- [ ] `web/src/main.tsx` に `import "./styles/base.css";` を追加する
      （style import 群の末尾、`button.css` の後。plan「main.tsx の import 順」参照）
- [ ] `web/src/styles/tokens.css` を変更していないことを確認する（REQ-4 / `git diff` で差分ゼロ）
- [ ] `web/src/ui/**/*.css` を変更していないことを確認する（非ゴール）

## テスト（test-designer が先に失敗するテストを用意 / AC-1〜AC-4）

- [ ] `web/__tests__/dark-mode-base-colors.test.ts` を新規追加（node 環境）
  - [ ] AC-1 ガード: `base.css` の body ブロックに `background: var(--color-bg)`
        （または background-color）と `color: var(--color-fg)` が存在する
  - [ ] AC-2 ガード: `base.css` の `:root` ブロックに `color-scheme: light dark` が存在する
  - [ ] AC-3 ガード: `main.tsx` に `./styles/base.css` の import 文が存在する
  - [ ] AC-4 ガード: `base.css` にコメント除外で生の色リテラル
        （hex / rgb / rgba / hsl / 名前付き色）が無い
- [ ] AC-5 回帰: リポジトリルートで `npx vitest run` が全 green
      （`dark-mode-tokens.test.ts` を含む既存テストを回帰させない）

## ドキュメント

- [ ] ADR は新設しない（ADR-0012 / ADR-0013 の方式の範囲内。spec 冒頭に判断を記録済み）
- [ ] `docs/developer/planning/backlog.md` の BL-143 を完了時に Done へ更新

## 仕上げ

- [ ] 受け入れ基準（spec.md AC-1〜AC-5）を全て満たすことを確認
- [ ] `npm run lint`（warning 0）/ `npm run typecheck`（pass）
- [ ] auditor に視覚基準（AC-V1〜AC-V3）の実在確認を依頼
      （OS ダークでページ背景・ハンバーガーメニュー文字の可読性 / ライトで回帰なし /
      フォームコントロール・スクロールバーの追従）
- [ ] レビュー依頼（auditor 承認 → PR）
