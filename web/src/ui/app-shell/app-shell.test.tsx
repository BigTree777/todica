import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
/**
 * 単体テスト: AppShell (BL-036 / ui-sidebar-nav).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/ui-sidebar-nav/spec.md §「受け入れ基準」
 *     - 「サイドバーの存在 (REQ-1 / REQ-2 / REQ-3)」
 *     - 「プライマリ 3 リンクの遷移 (REQ-2 / REQ-4 / REQ-5)」
 *     - 「セカンダリ 4 リンクの遷移 (REQ-3 / REQ-4)」
 *     - 「アクティブリンクのハイライト (REQ-6)」
 *
 * 関連 plan: docs/developer/features/ui-sidebar-nav/plan.md §「単体テスト」
 *
 * テスト方針:
 *   MemoryRouter で現在パスを固定し, <Route element={<AppShell />}> の Outlet 配下に
 *   ダミー子 Route を置いて, サイドバー側 (3 プライマリ + 4 セカンダリリンク + ランドマーク)
 *   とメイン領域 (Outlet が子要素を描画) の両方を検証する.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - AppShell コンポーネントはまだ存在しないため, インポートは失敗する.
 *   - implementer が AppShell を実装することで green 化する.
 */
import { describe, expect, it } from "vitest";
// BL-036 実装前は存在しないインポート. テストが red になる主因.
import { AppShell } from "./app-shell.js";

// ============================================================
// ヘルパ: AppShell を MemoryRouter + Outlet 付きで描画する
// ============================================================

interface RenderShellOptions {
  /** 初期 URL. MemoryRouter の initialEntries に渡す. */
  initialPath: string;
}

/**
 * AppShell をテスト用のルーティング構成に組み込んでレンダリングする.
 *
 * spec.md §「ルート構成」の最小再現:
 *   <Route element={<AppShell />}>
 *     <Route path="/focus"    element={<div>focus-page</div>} />
 *     <Route path="/today"    element={<div>today-page</div>} />
 *     <Route path="/tomorrow" element={<div>tomorrow-page</div>} />
 *     <Route path="/projects" element={<div>projects-page</div>} />
 *     <Route path="/routines" element={<div>routines-page</div>} />
 *     <Route path="/trash"    element={<div>trash-page</div>} />
 *     <Route path="/settings" element={<div>settings-page</div>} />
 *   </Route>
 *
 * 子 Route の要素はダミーで, Outlet の描画 (REQ-1 メイン領域) と
 * 7 リンクの to 属性 (REQ-2 / REQ-3) を独立に検証するために使う.
 */
function renderShell({ initialPath }: RenderShellOptions): ReturnType<typeof render> {
  return render(
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

/** サイドバーランドマーク (`<nav aria-label="サイドバーナビゲーション">`) を返す. */
function getSidebar() {
  return screen.getByRole("navigation", { name: "サイドバーナビゲーション" });
}

// ============================================================
// spec.md §「サイドバーの存在 (REQ-1 / REQ-2 / REQ-3)」
// ============================================================

describe("AppShell - サイドバーの存在 (REQ-1 / REQ-2 / REQ-3)", () => {
  /**
   * シナリオ: AppShell が起動時にサイドバーを表示する
   *   Given Web クライアントを `/today` で起動する
   *   When  画面の描画が完了する
   *   Then  画面に `<nav>` ランドマーク (aria-label="サイドバーナビゲーション") が存在する
   */
  it("シナリオ: サイドバーランドマークが描画される", () => {
    renderShell({ initialPath: "/today" });

    expect(getSidebar()).toBeInTheDocument();
  });

  /**
   * spec.md 受け入れ基準:
   *   And その中に「現在のタスク」「今日のタスク」「明日のタスク」の 3 リンクが縦並びで存在する
   */
  it("シナリオ: プライマリ 3 リンクがサイドバーに描画される", () => {
    renderShell({ initialPath: "/today" });

    const sidebar = getSidebar();

    // 「現在のタスク」リンク
    const focusLink = within(sidebar).getByRole("link", { name: "現在のタスク" });
    expect(focusLink).toHaveAttribute("href", "/focus");

    // 「今日のタスク」リンク
    const todayLink = within(sidebar).getByRole("link", { name: "今日のタスク" });
    expect(todayLink).toHaveAttribute("href", "/today");

    // 「明日のタスク」リンク
    const tomorrowLink = within(sidebar).getByRole("link", { name: "明日のタスク" });
    expect(tomorrowLink).toHaveAttribute("href", "/tomorrow");
  });

  /**
   * spec.md 受け入れ基準:
   *   And その下のセカンダリ領域に「プロジェクト」「ルーティン」「ゴミ箱」「設定」の
   *       4 リンクが縦並びで存在する
   */
  it("シナリオ: セカンダリ 4 リンクがサイドバーに描画される", () => {
    renderShell({ initialPath: "/today" });

    const sidebar = getSidebar();

    expect(within(sidebar).getByRole("link", { name: "プロジェクト" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(within(sidebar).getByRole("link", { name: "ルーティン" })).toHaveAttribute(
      "href",
      "/routines",
    );
    expect(within(sidebar).getByRole("link", { name: "ゴミ箱" })).toHaveAttribute("href", "/trash");
    expect(within(sidebar).getByRole("link", { name: "設定" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});

// ============================================================
// spec.md §「ルート構造の不変条件 (REQ-4)」 - Outlet 描画
// ============================================================

describe("AppShell - Outlet (REQ-1)", () => {
  /**
   * spec.md plan §「単体テスト」観点:
   *   <Outlet /> で子要素が描画される (MemoryRouter + ダミー子 Route を使う).
   *
   * AppShell は presentational only (props 無し) で, 子 Route の element を
   * メイン領域に埋め込むだけのレイアウトコンポーネント.
   */
  it("シナリオ: メイン領域の Outlet が子 Route の要素を描画する", () => {
    renderShell({ initialPath: "/today" });

    // 子 Route のダミー要素が描画されている (Outlet 経由)
    expect(screen.getByTestId("outlet-child")).toHaveTextContent("today-page");
  });

  it("シナリオ: パスに応じて Outlet 配下の子要素が切り替わる", () => {
    renderShell({ initialPath: "/focus" });

    expect(screen.getByTestId("outlet-child")).toHaveTextContent("focus-page");
  });
});

// ============================================================
// spec.md §「アクティブリンクのハイライト (REQ-6)」
// ============================================================

describe("AppShell - アクティブリンクのハイライト (REQ-6)", () => {
  /**
   * シナリオ: 現在いるルートのリンクがアクティブ表示になる
   *   Given AppShell が表示されており URL が /today である
   *   When  サイドバーを目視する
   *   Then  「今日のタスク」リンクに aria-current="page" が付与されている
   *   And   他の 6 リンクは aria-current を持たない
   *
   * 注: React Router v6 の <NavLink> はアクティブ時にデフォルトで
   *     aria-current="page" を付与する (plan.md D-006).
   */
  it('シナリオ: /today では「今日のタスク」リンクのみが aria-current="page" を持つ', () => {
    renderShell({ initialPath: "/today" });

    const sidebar = getSidebar();
    const todayLink = within(sidebar).getByRole("link", { name: "今日のタスク" });
    expect(todayLink).toHaveAttribute("aria-current", "page");

    // 他の 6 リンクは aria-current を持たない
    const otherNames = [
      "現在のタスク",
      "明日のタスク",
      "プロジェクト",
      "ルーティン",
      "ゴミ箱",
      "設定",
    ];
    for (const name of otherNames) {
      const link = within(sidebar).getByRole("link", { name });
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  /**
   * シナリオ: /focus では「現在のタスク」リンクが aria-current="page" を持つ
   */
  it('シナリオ: /focus では「現在のタスク」リンクのみが aria-current="page" を持つ', () => {
    renderShell({ initialPath: "/focus" });

    const sidebar = getSidebar();
    const focusLink = within(sidebar).getByRole("link", { name: "現在のタスク" });
    expect(focusLink).toHaveAttribute("aria-current", "page");

    expect(within(sidebar).getByRole("link", { name: "今日のタスク" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(sidebar).getByRole("link", { name: "明日のタスク" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  /**
   * シナリオ: /tomorrow では「明日のタスク」リンクが aria-current="page" を持つ
   */
  it('シナリオ: /tomorrow では「明日のタスク」リンクのみが aria-current="page" を持つ', () => {
    renderShell({ initialPath: "/tomorrow" });

    const sidebar = getSidebar();
    expect(within(sidebar).getByRole("link", { name: "明日のタスク" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  /**
   * シナリオ: セカンダリリンクでもアクティブ判定が機能する (REQ-3 / REQ-6 共通)
   */
  it('シナリオ: /settings では「設定」リンクが aria-current="page" を持つ', () => {
    renderShell({ initialPath: "/settings" });

    const sidebar = getSidebar();
    expect(within(sidebar).getByRole("link", { name: "設定" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // プライマリ 3 リンクは aria-current を持たない
    expect(within(sidebar).getByRole("link", { name: "現在のタスク" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(sidebar).getByRole("link", { name: "今日のタスク" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(sidebar).getByRole("link", { name: "明日のタスク" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

// ============================================================
// BL-049: ハンバーガーナビゲーション
// 出典: docs/developer/features/hamburger-nav/spec.md §「受け入れ基準」
// ============================================================

describe("AppShell (BL-049 ハンバーガーナビゲーション)", () => {
  // ----------------------------------------------------------
  // AC-1: ハンバーガーボタンの初期表示
  // ----------------------------------------------------------

  /**
   * シナリオ: ページロード時にハンバーガーボタンが表示される
   *   Given アプリが起動している
   *   When  任意のページ（/today など）を開く
   *   Then  画面左上にハンバーガーボタン（☰）が表示される
   *   And   aria-expanded="false" が付与されている
   *   And   aria-label="メニューを開く" が付与されている
   *   And   オーバーレイメニューは表示されていない
   *
   * 対応要件: REQ-1 / REQ-9 / REQ-10
   */
  it("AC-1: ハンバーガーボタンが aria-expanded=false / aria-label=メニューを開く で表示される", () => {
    renderShell({ initialPath: "/today" });

    const hamburger = screen.getByRole("button", { name: "メニューを開く" });
    expect(hamburger).toBeInTheDocument();
    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    // メニューパネルは閉じている（role="dialog" の要素が存在しないか、非表示）
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // AC-2: メニューを開く
  // ----------------------------------------------------------

  /**
   * シナリオ: ハンバーガーボタンをクリックするとメニューが開く
   *   Given ページが表示されていてオーバーレイメニューが閉じている
   *   When  ハンバーガーボタンをクリックする
   *   Then  オーバーレイメニューが表示される
   *   And   ボタンの aria-expanded="true" に変わる
   *   And   ボタンの aria-label="メニューを閉じる" に変わる
   *   And   メニュー内の最初のリンク（現在のタスク）にフォーカスが移動する
   *
   * 対応要件: REQ-2 / REQ-9 / REQ-10 / REQ-12
   */
  it("AC-2: ハンバーガーボタンをクリックするとメニューが開き aria-expanded=true になる", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    const hamburger = screen.getByRole("button", { name: "メニューを開く" });
    await user.click(hamburger);

    // ボタンの属性変化
    // BL-062 で menu 内にも aria-label="メニューを閉じる" の閉じるボタンが追加されるため,
    // ハンバーガー本体は `.app-shell__hamburger` クラスで一意に取得する.
    const hamburgerAfter = document.querySelector<HTMLButtonElement>("button.app-shell__hamburger");
    expect(hamburgerAfter).not.toBeNull();
    expect(hamburgerAfter).toHaveAttribute("aria-label", "メニューを閉じる");
    expect(hamburgerAfter).toHaveAttribute("aria-expanded", "true");
    // メニューパネルが DOM に現れている
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // 最初のリンク（現在のタスク）にフォーカスが移動している (REQ-12)
    expect(screen.getByRole("link", { name: "現在のタスク" })).toHaveFocus();
  });

  // ----------------------------------------------------------
  // AC-3: リンク選択でメニューが閉じる
  // ----------------------------------------------------------

  /**
   * シナリオ: ナビゲーションリンクを選択するとメニューが閉じる
   *   Given オーバーレイメニューが開いている
   *   When  メニュー内のナビゲーションリンク（例: 今日のタスク）をクリックする
   *   Then  対応するビューに遷移する
   *   And   オーバーレイメニューが閉じる
   *   And   ハンバーガーボタンの aria-expanded="false" に戻る
   *
   * 対応要件: REQ-4
   */
  it("AC-3: メニュー内のリンクをクリックするとメニューが閉じる", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    // メニューを開く
    await user.click(screen.getByRole("button", { name: "メニューを開く" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // 「今日のタスク」リンクをクリック
    await user.click(screen.getByRole("link", { name: "今日のタスク" }));

    // メニューが閉じる
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // ハンバーガーボタンの状態が戻る
    expect(screen.getByRole("button", { name: "メニューを開く" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  // ----------------------------------------------------------
  // AC-4: オーバーレイ背景クリックでメニューが閉じる
  // ----------------------------------------------------------

  /**
   * シナリオ: メニュー外の領域をクリックするとメニューが閉じる
   *   Given オーバーレイメニューが開いている
   *   When  オーバーレイ背景（メニューパネル外の暗転領域）をクリックする
   *   Then  オーバーレイメニューが閉じる
   *   And   ハンバーガーボタンにフォーカスが戻る
   *
   * 対応要件: REQ-3 / REQ-13
   */
  it("AC-4: オーバーレイ背景をクリックするとメニューが閉じ、ハンバーガーボタンにフォーカスが戻る", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    // メニューを開く
    await user.click(screen.getByRole("button", { name: "メニューを開く" }));

    // オーバーレイ背景要素をクリック（plan.md §「コンポーネント構造」より aria-hidden="true" の div）
    const overlay = document.querySelector(".app-shell__overlay");
    expect(overlay).toBeInTheDocument();
    await user.click(overlay as Element);

    // メニューが閉じる
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // ハンバーガーボタンにフォーカスが戻る (REQ-13)
    expect(screen.getByRole("button", { name: "メニューを開く" })).toHaveFocus();
  });

  // ----------------------------------------------------------
  // AC-5: Escape キーでメニューが閉じる
  // ----------------------------------------------------------

  /**
   * シナリオ: Escape キーを押すとメニューが閉じる
   *   Given オーバーレイメニューが開いている
   *   When  Escape キーを押す
   *   Then  オーバーレイメニューが閉じる
   *   And   ハンバーガーボタンにフォーカスが戻る
   *
   * 対応要件: REQ-5 / REQ-13
   */
  it("AC-5: Escape キーを押すとメニューが閉じ、ハンバーガーボタンにフォーカスが戻る", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    // メニューを開く
    await user.click(screen.getByRole("button", { name: "メニューを開く" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Escape キーを押す
    await user.keyboard("{Escape}");

    // メニューが閉じる
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // ハンバーガーボタンにフォーカスが戻る (REQ-13)
    expect(screen.getByRole("button", { name: "メニューを開く" })).toHaveFocus();
  });

  // ----------------------------------------------------------
  // AC-6: メイン領域の全幅表示（固定サイドバーが存在しない）
  // ----------------------------------------------------------

  /**
   * シナリオ: メニューが閉じているときメイン領域が全幅を占有する
   *   Given オーバーレイメニューが閉じている
   *   When  今日のタスク画面を表示する
   *   Then  .app-shell__main の幅が 100% である（固定サイドバーが存在しない）
   *
   * 対応要件: REQ-6
   *
   * 注: jsdom は CSS の計算幅を解決しないため、固定サイドバーの「不在」を
   *     DOM 構造で検証する（`.app-shell__sidebar` 要素が存在しないこと）。
   */
  it("AC-6: メニューが閉じているとき .app-shell__sidebar が DOM に存在せず .app-shell__main が存在する", () => {
    renderShell({ initialPath: "/today" });

    // 固定サイドバーは廃止されているので存在しない
    expect(document.querySelector(".app-shell__sidebar")).not.toBeInTheDocument();
    // メイン領域は存在する
    expect(document.querySelector(".app-shell__main")).toBeInTheDocument();
  });

  // ----------------------------------------------------------
  // AC-7: ナビゲーション項目の構成
  // ----------------------------------------------------------

  /**
   * シナリオ: メニュー内にすべてのナビゲーション項目が表示される
   *   Given ページが表示されていてオーバーレイメニューが閉じている
   *   When  ハンバーガーボタンをクリックしてメニューを開く
   *   Then  プライマリナビとして「現在のタスク」「今日のタスク」「明日のタスク」が表示される
   *   And   区切り線が表示される
   *   And   セカンダリナビとして「プロジェクト」「ルーティン」「ゴミ箱」「設定」が表示される
   *
   * 対応要件: REQ-7
   */
  it("AC-7: メニューを開くとプライマリ 3 件・区切り線・セカンダリ 4 件の計 7 リンクが揃っている", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(screen.getByRole("button", { name: "メニューを開く" }));

    const menu = screen.getByRole("dialog");

    // プライマリ 3 件
    expect(within(menu).getByRole("link", { name: "現在のタスク" })).toHaveAttribute(
      "href",
      "/focus",
    );
    expect(within(menu).getByRole("link", { name: "今日のタスク" })).toHaveAttribute(
      "href",
      "/today",
    );
    expect(within(menu).getByRole("link", { name: "明日のタスク" })).toHaveAttribute(
      "href",
      "/tomorrow",
    );

    // 区切り線
    expect(menu.querySelector("hr")).toBeInTheDocument();

    // セカンダリ 4 件
    expect(within(menu).getByRole("link", { name: "プロジェクト" })).toHaveAttribute(
      "href",
      "/projects",
    );
    expect(within(menu).getByRole("link", { name: "ルーティン" })).toHaveAttribute(
      "href",
      "/routines",
    );
    expect(within(menu).getByRole("link", { name: "ゴミ箱" })).toHaveAttribute("href", "/trash");
    expect(within(menu).getByRole("link", { name: "設定" })).toHaveAttribute("href", "/settings");

    // 合計 7 リンク
    expect(within(menu).getAllByRole("link")).toHaveLength(7);
  });

  // ----------------------------------------------------------
  // AC-8: アクティブリンクのスタイル
  // ----------------------------------------------------------

  /**
   * シナリオ: 現在表示中のページのリンクがアクティブ表示になる
   *   Given /today を表示している
   *   When  ハンバーガーボタンをクリックしてメニューを開く
   *   Then  「今日のタスク」リンクにアクティブスタイル（太字など）が適用されている
   *
   * 対応要件: REQ-8
   *
   * 注: React Router v6 の <NavLink> はアクティブ時に aria-current="page" を付与し、
   *     navLinkClass ヘルパが "active" クラスを付与する。両方を検証する。
   */
  it("AC-8: /today でメニューを開くと「今日のタスク」リンクに active クラスと aria-current=page が付与される", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(screen.getByRole("button", { name: "メニューを開く" }));

    const menu = screen.getByRole("dialog");
    const todayLink = within(menu).getByRole("link", { name: "今日のタスク" });

    // aria-current="page" (React Router NavLink のデフォルト動作)
    expect(todayLink).toHaveAttribute("aria-current", "page");
    // "active" クラス (navLinkClass ヘルパ)
    expect(todayLink).toHaveClass("active");
  });

  // ----------------------------------------------------------
  // AC-9: アクセシビリティ属性
  // ----------------------------------------------------------

  /**
   * シナリオ: オーバーレイメニューに適切な ARIA 属性が付与される
   *   Given ページが表示されている
   *   When  ハンバーガーボタンをクリックしてメニューを開く
   *   Then  メニューパネルに role="dialog" が付与されている
   *   And   メニューパネルに aria-modal="true" が付与されている
   *   And   メニューパネルに aria-label または aria-labelledby が付与されている
   *
   * 対応要件: REQ-11
   */
  it("AC-9: メニューパネルに role=dialog / aria-modal=true / aria-label が付与されている", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    await user.click(screen.getByRole("button", { name: "メニューを開く" }));

    const menu = screen.getByRole("dialog");
    expect(menu).toHaveAttribute("aria-modal", "true");
    // aria-label か aria-labelledby のいずれかが付与されている
    const hasLabel = menu.hasAttribute("aria-label") || menu.hasAttribute("aria-labelledby");
    expect(hasLabel).toBe(true);
  });
});
