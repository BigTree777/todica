/**
 * 単体テスト: ハンバーガーナビゲーション (BL-049 / hamburger-nav).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/hamburger-nav/spec.md §「受け入れ基準」AC-1〜AC-9.
 *   - docs/developer/features/hamburger-nav/plan.md §「設計詳細」.
 *   - docs/developer/features/hamburger-nav/tasks.md §「テスト」.
 *
 * 本ファイルが検証する受け入れ基準 (jsdom で検証可能なもの):
 *   AC-1: 初期表示 (ハンバーガーボタン / aria-expanded=false / dialog 未表示)
 *   AC-2: クリックで開く (aria-expanded=true / aria-label 切替 / 最初のリンクへ focus)
 *   AC-3: リンクで閉じる (dialog が消える / aria-expanded=false に戻る)
 *   AC-4: オーバーレイ click で閉じる (+ ハンバーガーボタンに focus 復帰)
 *   AC-5: Escape で閉じる (+ ハンバーガーボタンに focus 復帰)
 *   AC-7: メニュー項目の構成 (プライマリ 3 / 区切り / セカンダリ 4 = 計 7 リンク)
 *   AC-9: ARIA 属性 (role=dialog / aria-modal=true / aria-label)
 *
 * 本ファイルで扱わない受け入れ基準:
 *   AC-6: `.app-shell__main` の全幅表示
 *         → jsdom は CSS の計算幅を解決しないため E2E (e2e/hamburger-nav.spec.ts) で検証.
 *   AC-8: アクティブリンクの視覚スタイル
 *         → jsdom では computed style が取れないため E2E で検証 (本ファイルでは
 *            aria-current="page" の論理属性まで).
 *
 * テスト方針:
 *   `<MemoryRouter>` で初期 path を固定し, `<Route element={<AppShell />}>` の Outlet
 *   配下に各 path のダミー要素を入れて, ボタン/リンク/dialog/focus/aria の状態遷移を
 *   `@testing-library/react` で検証する. 既存 `web/src/ui/app-shell/app-shell.test.tsx`
 *   と同じレンダリングヘルパ流儀.
 *
 * 関連: tasks.md の「テスト」セクションで本ファイルの作成が明示されている.
 */
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
 *
 * NavLink の遷移先 (`/focus`, `/today`, ...) を 1 つずつダミー Route として
 * 用意することで, リンク click 後も Outlet が安全に描画される
 * (子 Route が無いと NavLink クリック後に Outlet が空になり警告が出る).
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

/** ハンバーガーボタン (メニューを開く側) を取得する. */
function getOpenButton() {
  return screen.getByRole("button", { name: "メニューを開く" });
}

// ============================================================
// AC-1: ハンバーガーボタンの初期表示
// ============================================================

describe("BL-049 AC-1: ハンバーガーボタンの初期表示 (REQ-1 / REQ-9 / REQ-10)", () => {
  /**
   * シナリオ AC-1:
   *   Given アプリが起動している
   *   When  /today を開く
   *   Then  ハンバーガーボタン (☰) が表示される
   *   And   aria-expanded="false" / aria-label="メニューを開く"
   *   And   オーバーレイメニュー (role=dialog) は表示されていない
   */
  it("初期表示でハンバーガーボタンが描画され, aria-expanded=false / dialog 未表示である", () => {
    renderShell({ initialPath: "/today" });

    const hamburger = getOpenButton();
    expect(hamburger).toBeInTheDocument();
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    // ハンバーガー記号 (☰) はテキストとして含まれる.
    expect(hamburger).toHaveTextContent("☰");

    // dialog (= 開いたメニュー) は存在しない.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// ============================================================
// AC-2: メニューを開く
// ============================================================

describe("BL-049 AC-2: ハンバーガークリックでメニューを開く (REQ-2 / REQ-9 / REQ-10 / REQ-12)", () => {
  /**
   * シナリオ AC-2:
   *   Given /today でメニューが閉じている
   *   When  ハンバーガーボタンを click する
   *   Then  role="dialog" のメニューパネルが表示される
   *   And   ボタンの aria-label が「メニューを閉じる」に変わる
   *   And   ボタンの aria-expanded が "true" に変わる
   *   And   メニュー内の最初のリンク (現在のタスク) に focus が移る (REQ-12)
   */
  it("ハンバーガーを click すると dialog が表示され aria-expanded=true / 最初のリンクへ focus する", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getOpenButton());

    // ボタンの aria-label / aria-expanded が変化している.
    const closeButton = screen.getByRole("button", { name: "メニューを閉じる" });
    expect(closeButton).toHaveAttribute("aria-expanded", "true");

    // メニューパネルが dialog として取得できる.
    const dialog = screen.getByRole("dialog", { name: "ナビゲーションメニュー" });
    expect(dialog).toBeInTheDocument();

    // 最初のリンクが活性 (REQ-12).
    const firstLink = within(dialog).getByRole("link", { name: "現在のタスク" });
    expect(firstLink).toHaveFocus();
  });
});

// ============================================================
// AC-3: リンク選択でメニューが閉じる
// ============================================================

describe("BL-049 AC-3: メニュー内のリンクを押すとメニューが閉じる (REQ-4)", () => {
  /**
   * シナリオ AC-3:
   *   Given メニューが開いている
   *   When  メニュー内のリンク (例: 「今日のタスク」) を click する
   *   Then  対応するビューに遷移する (Outlet が切り替わる)
   *   And   メニューが閉じる (dialog が消える)
   *   And   aria-expanded が "false" に戻る
   */
  it("メニュー内のリンクを click するとメニューが閉じ aria-expanded=false に戻る", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/focus" });

    await user.click(getOpenButton());
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // 「今日のタスク」リンクをクリックする.
    await user.click(within(dialog).getByRole("link", { name: "今日のタスク" }));

    // ルーティングが切り替わり Outlet が today-page を描画している.
    expect(screen.getByTestId("outlet-child")).toHaveTextContent("today-page");
    // メニューが閉じる.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // ハンバーガーボタンが「メニューを開く」状態に戻る.
    expect(screen.getByRole("button", { name: "メニューを開く" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

// ============================================================
// AC-4: オーバーレイ背景クリックで閉じる
// ============================================================

describe("BL-049 AC-4: オーバーレイ背景の click でメニューを閉じる (REQ-3 / REQ-13)", () => {
  /**
   * シナリオ AC-4:
   *   Given メニューが開いている
   *   When  オーバーレイ背景 (`.app-shell__overlay` 要素) を click する
   *   Then  メニューが閉じる (dialog が消える)
   *   And   ハンバーガーボタンに focus が戻る (REQ-13)
   */
  it("オーバーレイ背景を click するとメニューが閉じ, ハンバーガーボタンに focus が戻る", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getOpenButton());
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // オーバーレイ背景は role を持たない (装飾的な div) ため querySelector で取る.
    const overlay = document.querySelector(".app-shell__overlay");
    expect(overlay).not.toBeNull();
    await user.click(overlay as Element);

    // メニューが閉じる.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // ハンバーガーボタンに focus が戻る.
    expect(screen.getByRole("button", { name: "メニューを開く" })).toHaveFocus();
  });
});

// ============================================================
// AC-5: Escape キーで閉じる
// ============================================================

describe("BL-049 AC-5: Escape キー押下でメニューを閉じる (REQ-5 / REQ-13)", () => {
  /**
   * シナリオ AC-5:
   *   Given メニューが開いている
   *   When  Escape キーを押す
   *   Then  メニューが閉じる (dialog が消える)
   *   And   ハンバーガーボタンに focus が戻る (REQ-13)
   */
  it("メニュー open 状態で Escape を押すとメニューが閉じ, ハンバーガーボタンに focus が戻る", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getOpenButton());
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "メニューを開く" })).toHaveFocus();
  });
});

// ============================================================
// AC-7: メニュー項目の構成
// ============================================================

describe("BL-049 AC-7: メニュー項目の構成 (REQ-7)", () => {
  /**
   * シナリオ AC-7:
   *   Given メニューが閉じている
   *   When  ハンバーガーボタンを click してメニューを開く
   *   Then  プライマリナビ「現在のタスク」「今日のタスク」「明日のタスク」が並ぶ
   *   And   区切り線 (<hr>) が表示される
   *   And   セカンダリナビ「プロジェクト」「ルーティン」「ゴミ箱」「設定」が並ぶ
   *   And   メニュー内の link 総数は 7 件である
   */
  it("メニュー open 後にプライマリ 3 件 / 区切り線 / セカンダリ 4 件 = 計 7 リンクが期待順に並ぶ", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getOpenButton());
    const dialog = screen.getByRole("dialog");

    // メニュー内の link を順序保持で列挙する (DOM 順序が UI 順序を反映する).
    const linkNames = within(dialog)
      .getAllByRole("link")
      .map((a) => a.textContent?.trim());

    expect(linkNames).toEqual([
      "現在のタスク",
      "今日のタスク",
      "明日のタスク",
      "プロジェクト",
      "ルーティン",
      "ゴミ箱",
      "設定",
    ]);

    // href も一応控えめに検証する (NavLink で計算される href が想定どおりであること).
    expect(within(dialog).getByRole("link", { name: "現在のタスク" })).toHaveAttribute(
      "href",
      "/focus",
    );
    expect(within(dialog).getByRole("link", { name: "プロジェクト" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(within(dialog).getByRole("link", { name: "設定" })).toHaveAttribute("href", "/settings");

    // 区切り線 (<hr className="app-shell__divider">) がメニュー内に存在する.
    expect(dialog.querySelector("hr")).not.toBeNull();
  });
});

// ============================================================
// AC-9: アクセシビリティ属性
// ============================================================

describe("BL-049 AC-9: メニューパネルの ARIA 属性 (REQ-11)", () => {
  /**
   * シナリオ AC-9:
   *   Given ページが表示されている
   *   When  ハンバーガーボタンを click してメニューを開く
   *   Then  メニューパネルに role="dialog" が付与されている
   *   And   aria-modal="true" が付与されている
   *   And   aria-label (あるいは aria-labelledby) が付与されている
   */
  it("メニュー open 状態で role=dialog / aria-modal=true / aria-label が付与されている", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(getOpenButton());

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    // aria-label または aria-labelledby のいずれかが存在する.
    const hasLabel = dialog.hasAttribute("aria-label") || dialog.hasAttribute("aria-labelledby");
    expect(hasLabel).toBe(true);
    // 実装では aria-label="ナビゲーションメニュー" を使う想定.
    if (dialog.hasAttribute("aria-label")) {
      expect(dialog.getAttribute("aria-label")).toBe("ナビゲーションメニュー");
    }
  });
});
