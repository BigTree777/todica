/**
 * 単体テスト: メニュー開時のハンバーガーボタン視覚的退避 (BL-062 / hamburger-collapse-on-open).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/hamburger-collapse-on-open/spec.md §「受け入れ基準」AC-1〜AC-11.
 *   - docs/developer/features/hamburger-collapse-on-open/plan.md §「テスト方針」.
 *   - docs/developer/features/hamburger-collapse-on-open/tasks.md T-1.
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: app-shell.css に `.app-shell__hamburger--hidden { display: none }` が存在
 *   AC-2: menuOpen=true 時にハンバーガー className に "--hidden" が付与される
 *   AC-3: menuOpen=false 時にハンバーガー className に "--hidden" が含まれない
 *   AC-4: 閉じるボタン (aria-label=メニューを閉じる / .app-shell__menu-close) が menu 内に存在
 *   AC-5: 閉じるボタンが menu パネルの最初の子要素である
 *   AC-6: 閉じるボタン click で menu が閉じる (--open 除去 / --hidden 除去 / aria-expanded=false)
 *   AC-7: 閉じるボタン click 後に focus がハンバーガーに戻る (REQ-13 維持)
 *   AC-8: 閉じるボタンのアイコンが × (U+00D7) である
 *   AC-9: BL-049 既存テストの回帰防止 (本ファイル単体では取り扱わない. 既存テスト側で担保)
 *   AC-10: BL-053 で確定した `.app-shell__main` の `padding-top` が変更されていない
 *   AC-11: `.app-shell__menu--open` に display: none が付与されていない (= menu 側は表示維持)
 *
 * 本ファイルで扱わない受け入れ基準:
 *   AC-9 / AC-12: 既存単体テスト全件 green の維持で担保. 本ファイルは新規 AC のみ検証.
 *
 * テスト方針:
 *   - AC-1 / AC-10 / AC-11: `web/src/ui/app-shell/app-shell.css` をファイル直読みし,
 *     セレクタ宣言ブロックの中身を正規表現で抽出して assert する.
 *   - AC-2〜AC-8: `@testing-library/react` で AppShell を MemoryRouter 配下に
 *     render し, ハンバーガー click → menuOpen=true 後の className / DOM 構造 /
 *     閉じるボタン操作 / focus 復帰を assert する.
 *
 * 関連: tasks.md T-1.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/ui/app-shell/app-shell.js";

// ============================================================
// ヘルパ: AppShell を MemoryRouter + 子 Route 付きで描画する
// ============================================================

/**
 * AppShell をテスト用のルーティング構成に組み込んでレンダリングする.
 * BL-049 の単体テスト (web/__tests__/hamburger-nav.test.tsx) と同じ流儀.
 */
function renderShell({ initialPath }: { initialPath: string }): void {
  render(
    <MemoryRouter
      initialEntries={[initialPath]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/focus" element={<div data-testid="outlet-child">focus-page</div>} />
          <Route path="/today" element={<div data-testid="outlet-child">today-page</div>} />
          <Route path="/tomorrow" element={<div data-testid="outlet-child">tomorrow-page</div>} />
          <Route path="/projects" element={<div data-testid="outlet-child">projects-page</div>} />
          <Route path="/routines" element={<div data-testid="outlet-child">routines-page</div>} />
          <Route path="/trash" element={<div data-testid="outlet-child">trash-page</div>} />
          <Route path="/settings" element={<div data-testid="outlet-child">settings-page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * ハンバーガーボタン (`.app-shell__hamburger`) を DOM 直接取得する.
 *
 * menuOpen=true 時には閉じるボタンも `aria-label="メニューを閉じる"` を持つため,
 * accessible name 経由で取得すると重複マッチが起きる. ここでは `querySelector` で
 * `.app-shell__hamburger` 要素 (常に 1 つ) を直接取得する.
 */
function getHamburgerElement(): HTMLButtonElement {
  const hamburger = document.querySelector<HTMLButtonElement>("button.app-shell__hamburger");
  if (!hamburger) throw new Error("ハンバーガーボタン (.app-shell__hamburger) が見つからない");
  return hamburger;
}

/**
 * app-shell.css の内容をファイル直読みで取得する.
 * Vitest のリゾルバに依存せず, 実際の CSS ファイルを assert 対象にする.
 */
function readAppShellCss(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cssPath = path.resolve(here, "../src/ui/app-shell/app-shell.css");
  return readFileSync(cssPath, "utf-8");
}

/**
 * 指定セレクタの宣言ブロック (`{ ... }`) を CSS ソースから抽出する.
 * ネストや @media は使われていない前提 (本 BL の対象 CSS はフラット).
 */
function extractBlock(css: string, selector: string): string | null {
  // セレクタ直後の `{` から対応する `}` までを greedy ではなく非貪欲で取る.
  // セレクタ末尾の境界として後続が `\s*\{` であることを要求し,
  // `.app-shell__hamburger` で `.app-shell__hamburger--hidden` に誤マッチしないようにする.
  const escaped = selector.replace(/[.-]/g, (m) => `\\${m}`);
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// AC-1: app-shell.css に `.app-shell__hamburger--hidden { display: none }` が存在
// ============================================================

describe("BL-062 AC-1: ハンバーガー非表示用 CSS ルールが app-shell.css に存在する (REQ-1 / REQ-8 / REQ-9)", () => {
  /**
   * シナリオ AC-1:
   *   Given web/src/ui/app-shell/app-shell.css を読み込む
   *   When  .app-shell__hamburger--hidden セレクタの宣言ブロックを抽出する
   *   Then  display: none が指定されている
   */
  it(".app-shell__hamburger--hidden に display: none が宣言されている", () => {
    const css = readAppShellCss();
    const block = extractBlock(css, ".app-shell__hamburger--hidden");

    expect(block).not.toBeNull();
    // 空白の揺れを許容しつつ display: none を assert.
    expect(block ?? "").toMatch(/display\s*:\s*none\s*;?/);
  });
});

// ============================================================
// AC-2: menuOpen=true 時にハンバーガー className に "--hidden" が付与される
// ============================================================

describe("BL-062 AC-2: menuOpen=true でハンバーガーに state class が付く (REQ-8)", () => {
  /**
   * シナリオ AC-2:
   *   Given AppShell をルータ配下でレンダリングする
   *   When  ハンバーガーボタンをクリックして menuOpen=true にする
   *   Then  ハンバーガー要素の className に "app-shell__hamburger--hidden" が含まれる
   *   And   基底クラス "app-shell__hamburger" も引き続き含まれる
   */
  it("ハンバーガー click 後の className に app-shell__hamburger--hidden が含まれる", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    const hamburger = getHamburgerElement();
    expect(hamburger.className).toContain("app-shell__hamburger");
    expect(hamburger.className).not.toContain("app-shell__hamburger--hidden");

    await user.click(hamburger);

    const after = getHamburgerElement();
    expect(after.className).toContain("app-shell__hamburger");
    expect(after.className).toContain("app-shell__hamburger--hidden");
  });
});

// ============================================================
// AC-3: menuOpen=false 時にハンバーガー className に "--hidden" が含まれない
// ============================================================

describe("BL-062 AC-3: 初期状態でハンバーガーに state class が付かない", () => {
  /**
   * シナリオ AC-3:
   *   Given AppShell を初期状態 (menuOpen=false) でレンダリングする
   *   When  ハンバーガー要素の className を確認する
   *   Then  className に "app-shell__hamburger--hidden" は含まれない
   *   And   className に "app-shell__hamburger" は含まれる
   */
  it("初期 (menuOpen=false) のハンバーガー className に --hidden が含まれない", () => {
    renderShell({ initialPath: "/today" });

    const hamburger = getHamburgerElement();
    expect(hamburger.className).toContain("app-shell__hamburger");
    expect(hamburger.className).not.toContain("app-shell__hamburger--hidden");
  });
});

// ============================================================
// AC-4: 閉じるボタンが menu パネル内に存在する
// ============================================================

describe("BL-062 AC-4: 閉じるボタンが menu 内に存在する (REQ-2 / REQ-5 / REQ-7)", () => {
  /**
   * シナリオ AC-4:
   *   Given AppShell をルータ配下でレンダリングする
   *   When  ハンバーガーボタンをクリックして menuOpen=true にする
   *   Then  aria-label="メニューを閉じる" を持つ button が menu パネル内に存在する
   *   And   その button の className に "app-shell__menu-close" が含まれる
   *   And   その button は role="dialog" な menu パネル (BL-049 AC-9) の子孫である
   */
  it("menuOpen=true の menu 内に .app-shell__menu-close + aria-label=メニューを閉じる の button が存在する", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getHamburgerElement());

    const dialog = screen.getByRole("dialog");
    const closeButton = within(dialog).getByLabelText("メニューを閉じる");

    expect(closeButton.tagName).toBe("BUTTON");
    expect(closeButton.className).toContain("app-shell__menu-close");
    // role="dialog" の子孫である.
    expect(dialog.contains(closeButton)).toBe(true);
  });

  /**
   * 補足: D-005 で `type="button"` 必須.
   */
  it("閉じるボタンに type=button が付与されている (D-005)", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getHamburgerElement());

    const dialog = screen.getByRole("dialog");
    const closeButton = within(dialog).getByLabelText("メニューを閉じる");
    expect(closeButton).toHaveAttribute("type", "button");
  });
});

// ============================================================
// AC-5: 閉じるボタンが menu パネルの最初の子要素である
// ============================================================

describe("BL-062 AC-5: 閉じるボタンが menu の冒頭に配置される (REQ-6 / D-003)", () => {
  /**
   * シナリオ AC-5:
   *   Given menuOpen=true の AppShell をレンダリングする
   *   When  menu パネル (role="dialog") の firstElementChild を取得する
   *   Then  その要素が .app-shell__menu-close クラスを持つ button である
   */
  it("role=dialog の firstElementChild が .app-shell__menu-close ボタンである", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getHamburgerElement());

    const dialog = screen.getByRole("dialog");
    const first = dialog.firstElementChild;
    expect(first).not.toBeNull();
    expect(first?.tagName).toBe("BUTTON");
    expect(first?.classList.contains("app-shell__menu-close")).toBe(true);
  });
});

// ============================================================
// AC-6: 閉じるボタン click で menu が閉じる
// ============================================================

describe("BL-062 AC-6: 閉じるボタン click で menu が閉じる (REQ-3 / D-004)", () => {
  /**
   * シナリオ AC-6:
   *   Given menuOpen=true の AppShell をレンダリングする
   *   When  aria-label="メニューを閉じる" の button を click する
   *   Then  menu パネルから "app-shell__menu--open" が外れる
   *   And   ハンバーガーから "app-shell__hamburger--hidden" が外れる
   *   And   ハンバーガーの aria-expanded が "false" に戻る
   */
  it("閉じるボタン click 後に menu / ハンバーガーの state class が解除され aria-expanded=false に戻る", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getHamburgerElement());

    // この時点で menu は --open, ハンバーガーは --hidden を持つ.
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("app-shell__menu--open");
    expect(getHamburgerElement().className).toContain("app-shell__hamburger--hidden");

    const closeButton = within(dialog).getByLabelText("メニューを閉じる");
    await user.click(closeButton);

    // menu パネル要素自体は残るが --open は外れている.
    const menuPanel = document.querySelector(".app-shell__menu");
    expect(menuPanel).not.toBeNull();
    expect(menuPanel?.className).not.toContain("app-shell__menu--open");

    // ハンバーガーは再表示 (--hidden が外れる).
    const hamburgerAfter = getHamburgerElement();
    expect(hamburgerAfter.className).not.toContain("app-shell__hamburger--hidden");

    // aria-expanded が false に戻る.
    expect(hamburgerAfter).toHaveAttribute("aria-expanded", "false");
  });
});

// ============================================================
// AC-7: 閉じるボタン click 後に focus がハンバーガーに戻る
// ============================================================

describe("BL-062 AC-7: 閉じるボタン click 後に focus がハンバーガーに戻る (REQ-4 / BL-049 REQ-13)", () => {
  /**
   * シナリオ AC-7:
   *   Given menuOpen=true の AppShell をレンダリングする
   *   When  aria-label="メニューを閉じる" の button を click する
   *   Then  document.activeElement が aria-label="メニューを開く" のハンバーガーに一致する
   */
  it("閉じるボタン click 後の document.activeElement がハンバーガーボタンである", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getHamburgerElement());

    const dialog = screen.getByRole("dialog");
    const closeButton = within(dialog).getByLabelText("メニューを閉じる");
    await user.click(closeButton);

    // menu 閉後はハンバーガーの aria-label が「メニューを開く」に戻り,
    // それが document.activeElement と一致するはず.
    const hamburger = getHamburgerElement();
    expect(hamburger).toHaveAttribute("aria-label", "メニューを開く");
    expect(document.activeElement).toBe(hamburger);
  });
});

// ============================================================
// AC-8: 閉じるボタンのアイコンが × である
// ============================================================

describe("BL-062 AC-8: 閉じるボタンの可視テキストが × である (REQ-11)", () => {
  /**
   * シナリオ AC-8:
   *   Given menuOpen=true の AppShell をレンダリングする
   *   When  .app-shell__menu-close の textContent を取得する
   *   Then  "×" (U+00D7) を含む
   */
  it("閉じるボタンの textContent に × (U+00D7) が含まれる", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getHamburgerElement());

    const closeButton = document.querySelector(".app-shell__menu-close");
    expect(closeButton).not.toBeNull();
    // U+00D7 MULTIPLICATION SIGN を明示的にコードポイントで比較.
    expect(closeButton?.textContent ?? "").toContain("×");
  });
});

// ============================================================
// AC-10: BL-053 で確定した .app-shell__main の padding-top が変更されていない
// ============================================================

describe("BL-062 AC-10: BL-053 の .app-shell__main padding-top を変更しない (REQ-13)", () => {
  /**
   * シナリオ AC-10:
   *   Given web/src/ui/app-shell/app-shell.css を読み込む
   *   When  .app-shell__main セレクタの宣言ブロックを抽出する
   *   Then  padding-top が calc(var(--space-md) + var(--space-xl)) のままである
   */
  it(".app-shell__main の padding-top が calc(var(--space-md) + var(--space-xl)) のまま", () => {
    const css = readAppShellCss();
    const block = extractBlock(css, ".app-shell__main");

    expect(block).not.toBeNull();
    // 空白の揺れを許容. var() 内の空白も柔軟に許す.
    expect(block ?? "").toMatch(
      /padding-top\s*:\s*calc\(\s*var\(\s*--space-md\s*\)\s*\+\s*var\(\s*--space-xl\s*\)\s*\)\s*;?/,
    );
  });
});

// ============================================================
// AC-11: .app-shell__menu--open に display: none が指定されていない (= menu 側は表示維持)
// ============================================================

describe("BL-062 AC-11: ハンバーガーと menu パネルが視覚的に重ならない (CSS 側で menu は表示維持)", () => {
  /**
   * シナリオ AC-11:
   *   Given web/src/ui/app-shell/app-shell.css を読み込む
   *   When  .app-shell__hamburger--hidden と .app-shell__menu--open の宣言ブロックを取得する
   *   Then  .app-shell__hamburger--hidden に display: none が指定されている
   *   And   .app-shell__menu--open には display: none が指定されていない
   */
  it("`.app-shell__menu--open` に display: none が宣言されていない", () => {
    const css = readAppShellCss();
    const hamburgerHiddenBlock = extractBlock(css, ".app-shell__hamburger--hidden");
    const menuOpenBlock = extractBlock(css, ".app-shell__menu--open");

    expect(hamburgerHiddenBlock).not.toBeNull();
    expect(hamburgerHiddenBlock ?? "").toMatch(/display\s*:\s*none\s*;?/);

    expect(menuOpenBlock).not.toBeNull();
    // menu 側は display: none ではない. 既存実装は transform: translateX(0).
    expect(menuOpenBlock ?? "").not.toMatch(/display\s*:\s*none\s*;?/);
  });
});
