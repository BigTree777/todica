import { render, screen, within } from "@testing-library/react";
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
