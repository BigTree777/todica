/**
 * AppShell コンポーネント (BL-036 / ui-sidebar-nav).
 *
 * 左サイドバー (プライマリ 3 リンク + セカンダリ 4 リンク) + 右メイン領域 (`<Outlet />`)
 * の 2 ペイン構成を持つ共通レイアウトコンポーネント.
 *
 * 設計判断は plan.md §「設計詳細」/ §「重要な決定」を参照.
 *   - D-001: presentational only (props なし). リポジトリは個別 view が受ける.
 *   - D-002: `/setup` は AppShell の外 (main.tsx 側で別ルート).
 *   - D-006: <NavLink> のデフォルト挙動で `aria-current="page"` を付与する.
 */
import { NavLink, Outlet } from "react-router-dom";
import "./app-shell.css";

/**
 * NavLink の className を計算するヘルパ.
 * アクティブ時に "active" クラスを付与する (REQ-6).
 */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "app-shell__nav-link active" : "app-shell__nav-link";
}

export function AppShell(): JSX.Element {
  return (
    <div className="app-shell">
      <nav className="app-shell__sidebar" aria-label="サイドバーナビゲーション">
        {/* プライマリナビ (REQ-2): 現在のタスク / 今日のタスク / 明日のタスク */}
        <ul className="app-shell__nav-primary">
          <li>
            <NavLink to="/focus" className={navLinkClass}>
              現在のタスク
            </NavLink>
          </li>
          <li>
            <NavLink to="/today" className={navLinkClass}>
              今日のタスク
            </NavLink>
          </li>
          <li>
            <NavLink to="/tomorrow" className={navLinkClass}>
              明日のタスク
            </NavLink>
          </li>
        </ul>

        {/* プライマリ / セカンダリ間の区切り (REQ-3) */}
        <hr className="app-shell__divider" />

        {/* セカンダリナビ (REQ-3): プロジェクト / ルーティン / ゴミ箱 / 設定 */}
        <ul className="app-shell__nav-secondary">
          <li>
            <NavLink to="/projects" className={navLinkClass}>
              プロジェクト
            </NavLink>
          </li>
          <li>
            <NavLink to="/routines" className={navLinkClass}>
              ルーティン
            </NavLink>
          </li>
          <li>
            <NavLink to="/trash" className={navLinkClass}>
              ゴミ箱
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings" className={navLinkClass}>
              設定
            </NavLink>
          </li>
        </ul>
      </nav>

      {/*
        メイン領域 (REQ-1).
        既存 view が内部で <main> ランドマークを持つため, AppShell 側は <div> で
        包んでランドマーク重複を避ける.
      */}
      <div className="app-shell__main">
        <Outlet />
      </div>
    </div>
  );
}
