/**
 * 単体テスト: 起票カード + ボタン展開式 (BL-104 / floating-create-button).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/floating-create-button/spec.md AC-1〜AC-11.
 *   - docs/developer/features/floating-create-button/plan.md D-001〜D-006.
 *
 * 本ファイルが検証する受け入れ基準 (jsdom で検証可能なもの):
 *   AC-1: /today で + ボタンが描画され, aria-label="タスクを追加" /
 *         aria-expanded="false" を持つ.
 *   AC-2: /tomorrow / /projects / /routines で aria-label がそれぞれ
 *         「タスクを追加」「プロジェクトを追加」「ルーティンを追加」になる.
 *   AC-3: /focus, /settings, /trash, /setup, /login で + ボタンが DOM 上に存在しない.
 *   AC-6: + 押下時に `?create=1` が URL に追加され, aria-expanded が true に変わる.
 *   AC-7: 同じ + ボタン取得経路 (.app-shell__create) で他クエリ保持を機械的に確認する.
 *   AC-10: + ボタンの DOM 順序が「ハンバーガー → + → 更新」になっている.
 *
 * 本ファイルで扱わない受け入れ基準:
 *   AC-4 / AC-5 / AC-8 / AC-9 / AC-11: フォーム描画 / 起票成功 / 起票失敗 等は
 *     各 view (today / tomorrow / projects / routines) の本体テストおよび E2E に任せる.
 *     本ファイルは AppShell 単体の責務 (+ ボタンの表示判定とクエリ書き換え) に絞る.
 *
 * 設計意図:
 *   - <MemoryRouter initialEntries={...}> で route を切り替えれば AppShell 内の
 *     `useLocation` 判定をそのまま検証できる. 各 view の本体を mount する必要はない
 *     ので, Outlet には軽量なダミー要素だけを置く.
 *   - URL クエリ (`?create=1`) の追加は `useSearchParams` の単一情報源で扱う (D-001).
 *     テストは Outlet 内に「現在の location.search を表示するスパイ」を置いて
 *     `setSearchParams` の結果を機械的に観察する.
 *
 * 実装前なので本ファイルの全テストは fail する想定:
 *   - 現状 AppShell には .app-shell__create / aria-label「タスクを追加」等のボタンは
 *     存在しないため, getByRole / querySelector が要素を取得できずに fail する.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/ui/app-shell/app-shell.js";

// ============================================================
// ヘルパ
// ============================================================

/**
 * 現在の location.pathname / location.search をテストから観察するためのスパイ要素.
 *
 * AppShell が + ボタン押下時に `setSearchParams({ create: "1" })` を呼ぶ実装に
 * なっていれば, ここに描画される data-search 属性が "?create=1" を含むようになる.
 */
function LocationSpy(): JSX.Element {
  const location = useLocation();
  return (
    <div data-testid="location-spy" data-pathname={location.pathname} data-search={location.search}>
      spy
    </div>
  );
}

interface RenderOptions {
  initialPath: string;
}

/**
 * AppShell を MemoryRouter + ダミー Outlet 配下で render する.
 *
 * Outlet 子要素には LocationSpy と path 表示の placeholder だけを置く.
 * 各 view の本体は mount しない (今回は AppShell の責務だけを検証する).
 */
function renderShell({ initialPath }: RenderOptions): void {
  render(
    <MemoryRouter
      initialEntries={[initialPath]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/today"
            element={
              <div data-testid="outlet-today">
                today
                <LocationSpy />
              </div>
            }
          />
          <Route
            path="/tomorrow"
            element={
              <div data-testid="outlet-tomorrow">
                tomorrow
                <LocationSpy />
              </div>
            }
          />
          <Route
            path="/projects"
            element={
              <div data-testid="outlet-projects">
                projects
                <LocationSpy />
              </div>
            }
          />
          <Route
            path="/routines"
            element={
              <div data-testid="outlet-routines">
                routines
                <LocationSpy />
              </div>
            }
          />
          <Route
            path="/focus"
            element={
              <div data-testid="outlet-focus">
                focus
                <LocationSpy />
              </div>
            }
          />
          <Route
            path="/settings"
            element={
              <div data-testid="outlet-settings">
                settings
                <LocationSpy />
              </div>
            }
          />
          <Route
            path="/trash"
            element={
              <div data-testid="outlet-trash">
                trash
                <LocationSpy />
              </div>
            }
          />
          <Route
            path="/setup"
            element={
              <div data-testid="outlet-setup">
                setup
                <LocationSpy />
              </div>
            }
          />
          <Route
            path="/login"
            element={
              <div data-testid="outlet-login">
                login
                <LocationSpy />
              </div>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * + ボタン (`.app-shell__create`) を CSS クラスで取得する.
 *
 * aria-label はルートで切り替わる (REQ-11 / D-006) ため,
 * ルート非依存に取得したいときはこちらを使う.
 */
function queryCreateButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("button.app-shell__create");
}

/** ハンバーガーボタン (`.app-shell__hamburger`). */
function queryHamburgerButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("button.app-shell__hamburger");
}

/** 更新ボタン (`.app-shell__reload`). */
function queryReloadButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("button.app-shell__reload");
}

// ============================================================
// AC-1: + ボタンの初期表示 (today)
// ============================================================

describe("BL-104 AC-1: + ボタンの初期表示 (/today) (REQ-1 / REQ-11 / REQ-12)", () => {
  /**
   * シナリオ AC-1:
   *   Given アプリが起動している
   *   When  /today を開く
   *   Then  画面右上に + ボタンが表示される
   *   And   aria-label="タスクを追加" / aria-expanded="false" が付与されている
   */
  it("/today で + ボタンが描画され aria-label / aria-expanded が初期状態である", () => {
    renderShell({ initialPath: "/today" });

    const create = queryCreateButton();
    expect(create).not.toBeNull();
    expect(create?.tagName).toBe("BUTTON");
    expect(create).toHaveAttribute("aria-label", "タスクを追加");
    expect(create).toHaveAttribute("aria-expanded", "false");

    // 同 button が getByRole でも「タスクを追加」名で取得できる.
    expect(screen.getByRole("button", { name: "タスクを追加" })).toBe(create);
  });
});

// ============================================================
// AC-2: + ボタンの aria-label のルート依存 (tomorrow / projects / routines)
// ============================================================

describe("BL-104 AC-2: + ボタンの aria-label がルートに応じて変わる (REQ-11 / D-006)", () => {
  /**
   * シナリオ AC-2:
   *   Given アプリが起動している
   *   When  /<route> を開く
   *   Then  + ボタンの aria-label が以下のとおりになる:
   *           /today    → タスクを追加
   *           /tomorrow → タスクを追加
   *           /projects → プロジェクトを追加
   *           /routines → ルーティンを追加
   */
  it("/tomorrow で aria-label='タスクを追加'", () => {
    renderShell({ initialPath: "/tomorrow" });
    expect(queryCreateButton()).toHaveAttribute("aria-label", "タスクを追加");
  });

  it("/projects で aria-label='プロジェクトを追加'", () => {
    renderShell({ initialPath: "/projects" });
    expect(queryCreateButton()).toHaveAttribute("aria-label", "プロジェクトを追加");
  });

  it("/routines で aria-label='ルーティンを追加'", () => {
    renderShell({ initialPath: "/routines" });
    expect(queryCreateButton()).toHaveAttribute("aria-label", "ルーティンを追加");
  });
});

// ============================================================
// AC-3: + ボタンの非表示ルート
// ============================================================

describe("BL-104 AC-3: + ボタンが描画されないルート (REQ-2 / D-002)", () => {
  /**
   * シナリオ AC-3:
   *   Given アプリが起動している
   *   When  /focus / /settings / /trash / /setup / /login を開く
   *   Then  .app-shell__create が DOM 上に存在しない
   */
  it.each([
    ["/focus", "outlet-focus"],
    ["/settings", "outlet-settings"],
    ["/trash", "outlet-trash"],
    ["/setup", "outlet-setup"],
    ["/login", "outlet-login"],
  ] as const)("%s では + ボタンが DOM 上に存在しない", (initialPath, outletTestId) => {
    renderShell({ initialPath });
    // 対応 Outlet は描画されている (= ルート自体は機能している).
    expect(screen.getByTestId(outletTestId)).toBeInTheDocument();
    // + ボタンは DOM 上に存在しない (条件 render で `null` を返す前提 / D-002).
    expect(queryCreateButton()).toBeNull();
    // aria-label からも到達できない.
    expect(screen.queryByRole("button", { name: /追加/ })).toBeNull();
  });
});

// ============================================================
// AC-6 / D-001 / D-004: + 押下で ?create=1 が URL に追加される
// ============================================================

describe("BL-104 AC-6 / D-001: + 押下で ?create=1 が URL に追加され aria-expanded が true に変わる", () => {
  /**
   * シナリオ:
   *   Given /today を表示している かつ ?create クエリが付いていない
   *   When  + ボタンを click する
   *   Then  URL に ?create=1 が追加される
   *   And   + ボタンの aria-expanded が "true" に変わる
   */
  it("/today で + を click すると ?create=1 が URL に追加され aria-expanded='true' になる", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today" });

    // 初期状態は ?create=1 が付いていない (= aria-expanded=false).
    const spyBefore = screen.getByTestId("location-spy");
    expect(spyBefore.getAttribute("data-search") ?? "").not.toContain("create=1");
    const createButton = queryCreateButton();
    expect(createButton).toHaveAttribute("aria-expanded", "false");

    // + を click すると ?create=1 が立つ.
    await user.click(createButton as HTMLButtonElement);

    const spyAfter = screen.getByTestId("location-spy");
    // location.search が "?create=1" を含むことを観察する.
    expect(spyAfter.getAttribute("data-search") ?? "").toContain("create=1");
    // aria-expanded も追従する.
    expect(queryCreateButton()).toHaveAttribute("aria-expanded", "true");
  });

  /**
   * シナリオ:
   *   Given /today?create=1 を直接開いた
   *   Then  + ボタンの aria-expanded が初期から "true" になっている
   *
   * 「URL クエリを単一情報源にする (D-001)」ことの担保.
   */
  it("/today?create=1 を直接開くと初期から aria-expanded='true' になっている", () => {
    renderShell({ initialPath: "/today?create=1" });
    expect(queryCreateButton()).toHaveAttribute("aria-expanded", "true");
  });
});

// ============================================================
// AC-7 / D-001: 既存の他クエリを保持する
// ============================================================

describe("BL-104 AC-7 / D-001: + 押下時に他クエリを保持する (REQ-3)", () => {
  /**
   * シナリオ:
   *   Given /today?foo=bar を表示している
   *   When  + ボタンを click する
   *   Then  URL に foo=bar が残り, 加えて create=1 が追加される
   *
   * + ボタンの実装が `setSearchParams({ create: "1" })` のように既存クエリを
   * 上書きしてしまうと回帰する (D-001 「他クエリ保持」の機械的検証).
   */
  it("/today?foo=bar で + を click しても foo=bar が保持される", async () => {
    const user = userEvent.setup();
    renderShell({ initialPath: "/today?foo=bar" });

    await user.click(queryCreateButton() as HTMLButtonElement);

    const search = screen.getByTestId("location-spy").getAttribute("data-search") ?? "";
    expect(search).toContain("create=1");
    expect(search).toContain("foo=bar");
  });
});

// ============================================================
// AC-10: + / 更新 / ハンバーガーの DOM 順序
// ============================================================

describe("BL-104 AC-10: + は「ハンバーガーの右」「更新ボタンの左」に並ぶ (REQ-1 / REQ-15)", () => {
  /**
   * シナリオ AC-10:
   *   Given /today を表示している
   *   When  画面右上の 3 ボタンを確認する
   *   Then  ハンバーガー (`.app-shell__hamburger`) → +ボタン (`.app-shell__create`)
   *         → 更新ボタン (`.app-shell__reload`) の順で DOM に並んでいる
   *
   * jsdom では座標 (getBoundingClientRect) が 0,0 にしかならないため,
   * 「物理的な座標」ではなく「DOM 順序」で 3 ボタンの並びを確認する.
   * 座標一致 (AC-10 後半) は E2E (`e2e/floating-create-button.spec.ts`) で扱う.
   */
  it("ハンバーガー → + → 更新 の順で DOM ツリーに並んでいる", () => {
    renderShell({ initialPath: "/today" });

    const hamburger = queryHamburgerButton();
    const create = queryCreateButton();
    const reload = queryReloadButton();

    expect(hamburger).not.toBeNull();
    expect(create).not.toBeNull();
    expect(reload).not.toBeNull();

    // 三者が同じ親 (=AppShell ルート要素) に直属していることを確認する.
    // app-shell ルートでなくとも構わないが, 並び順検証は同階層内で行う必要がある.
    const parent = create?.parentElement;
    expect(parent).not.toBeNull();
    expect(hamburger?.parentElement).toBe(parent);
    expect(reload?.parentElement).toBe(parent);

    // 同階層の children の中での index を比較する.
    const children = Array.from(parent?.children ?? []);
    const ih = children.indexOf(hamburger as Element);
    const ic = children.indexOf(create as Element);
    const ir = children.indexOf(reload as Element);

    expect(ih).toBeGreaterThanOrEqual(0);
    expect(ic).toBeGreaterThanOrEqual(0);
    expect(ir).toBeGreaterThanOrEqual(0);
    expect(ih).toBeLessThan(ic);
    expect(ic).toBeLessThan(ir);
  });

  /**
   * 非表示ルートでも更新ボタンとハンバーガーの DOM 上の親 / 並び順は変わらない.
   * (= + 撤去で他ボタンの位置が「ずれる」回帰を防ぐ.)
   */
  it("/focus では + が居なくても ハンバーガー → 更新 の順序関係が保たれる", () => {
    renderShell({ initialPath: "/focus" });

    const hamburger = queryHamburgerButton();
    const reload = queryReloadButton();
    expect(hamburger).not.toBeNull();
    expect(reload).not.toBeNull();

    const parent = reload?.parentElement;
    expect(hamburger?.parentElement).toBe(parent);

    const children = Array.from(parent?.children ?? []);
    const ih = children.indexOf(hamburger as Element);
    const ir = children.indexOf(reload as Element);
    expect(ih).toBeGreaterThanOrEqual(0);
    expect(ir).toBeGreaterThanOrEqual(0);
    expect(ih).toBeLessThan(ir);

    // + は描画されていない.
    expect(queryCreateButton()).toBeNull();
  });
});
