# タスク: メニュー開時のハンバーガーボタン視覚的退避

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## 仕様策定

- [x] `docs/developer/features/hamburger-collapse-on-open/spec.md` 作成 (本 BL).
- [x] `docs/developer/features/hamburger-collapse-on-open/plan.md` 作成.
- [x] `docs/developer/features/hamburger-collapse-on-open/tasks.md` 作成 (本ファイル).

## テスト (失敗するテストを先に作る)

- [x] T-1: `web/__tests__/hamburger-collapse-on-open.test.ts(x)` を新規作成し,
  spec.md AC-1〜AC-11 を検証する単体テストを用意する.
  - AC-1 / AC-11: `app-shell.css` を直読みし
    `.app-shell__hamburger--hidden { display: none }` の存在を assert.
    あわせて `.app-shell__menu--open` には `display: none` がないことを assert.
  - AC-2 / AC-3: `@testing-library/react` で AppShell を MemoryRouter 配下に
    render し, 初期状態のハンバーガー className に `--hidden` が含まれないこと,
    ハンバーガーを click 後に `--hidden` が含まれることを assert.
  - AC-4: menuOpen=true 後に `aria-label="メニューを閉じる"` を持つ button が
    `.app-shell__menu` の子孫として存在し, className に
    `app-shell__menu-close` が含まれることを assert.
  - AC-5: role="dialog" の `firstElementChild` が
    `.app-shell__menu-close` を持つ button であることを assert.
  - AC-6: 閉じるボタン click 後に menu から `--open`,
    ハンバーガーから `--hidden` が外れ, `aria-expanded="false"` に戻ることを assert.
  - AC-7: 閉じるボタン click 後の `document.activeElement` が
    `aria-label="メニューを開く"` の button であることを assert.
  - AC-8: 閉じるボタンの textContent が `×` を含むことを assert.
  - AC-10: `app-shell.css` を直読みし `.app-shell__main` の `padding-top` が
    `calc(var(--space-md) + var(--space-xl))` であることを assert.
- [x] T-2: T-1 の単体テストが現状の実装に対して fail することを確認する
  (TDD の red 確認).

## 実装

- [x] T-3: `web/src/ui/app-shell/app-shell.css` の末尾に以下を追加する.
  - `.app-shell__hamburger--hidden { display: none; }`
  - `.app-shell__menu-close { align-self: flex-end; background: none; border: none;
    font-size: var(--font-size-h2); cursor: pointer; padding: var(--space-xs);
    color: var(--color-fg); margin-bottom: var(--space-sm); }`
- [x] T-4: `web/src/ui/app-shell/app-shell.tsx` を修正する.
  - ハンバーガーボタンの className を
    `app-shell__hamburger${menuOpen ? " app-shell__hamburger--hidden" : ""}`
    に変更する.
  - `.app-shell__menu` の最初の子要素として閉じるボタンを追加する:
    ```
    {menuOpen && (
      <button
        type="button"
        className="app-shell__menu-close"
        aria-label="メニューを閉じる"
        onClick={closeMenu}
      >
        ×
      </button>
    )}
    ```
- [x] T-5: T-3 / T-4 完了後, T-1 の単体テストが全件 green になることを確認する.

## 回帰確認

- [x] T-6: `web/__tests__/` 配下の単体テスト全件 green を確認する.
  - 特に BL-049 (`hamburger-nav` 関連) と
    BL-053 (`hamburger-overlap-fix` 関連) のテスト.
- [x] T-7: `web/src/ui/app-shell/app-shell.test.tsx` の既存テストが
  全件 green であることを確認する.
- [x] T-8: `e2e/` 配下の BL-049 / BL-053 関連 spec を実行し全件 green を確認する
  (Playwright).
- [x] T-9: T-6〜T-8 で既存テストが fail した場合は実装ではなくテストを修正する
  (リスク 1: BL-049 の getByRole 重複対応). 修正理由をコミットに明記する.

## ドキュメント

- [x] T-10: `docs/developer/planning/backlog.md` の BL-062 行を
  Todo → Done に更新する (PR マージ後).
- [x] T-11: 必要なら ADR 起票 — 本 BL は粒度が小さいので原則不要.

## 仕上げ

- [x] T-12: 受け入れ基準 (spec.md AC-1〜AC-12) を全て満たすことを最終確認.
- [x] T-13: auditor へのレビュー依頼.
