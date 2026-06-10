/**
 * AppShell コンポーネント (BL-036 / ui-sidebar-nav, BL-049 / hamburger-nav).
 *
 * ハンバーガーボタンで開閉するオーバーレイメニュー + メイン領域 (`<Outlet />`)
 * の構成を持つ共通レイアウトコンポーネント.
 *
 * 設計判断は plan.md §「設計詳細」/ §「重要な決定」を参照.
 *   - D-001: presentational only (props なし). リポジトリは個別 view が受ける.
 *   - D-002: `/setup` は AppShell の外 (main.tsx 側で別ルート).
 *   - D-006: <NavLink> のデフォルト挙動で `aria-current="page"` を付与する.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import "./app-shell.css";

/**
 * NavLink の className を計算するヘルパ.
 * アクティブ時に "active" クラスを付与する (REQ-6 / REQ-8).
 */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? "app-shell__nav-link active" : "app-shell__nav-link";
}

export function AppShell(): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    // フォーカスをハンバーガーボタンに戻す (REQ-13)
    hamburgerRef.current?.focus();
  }, []);

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
    } else {
      setMenuOpen(true);
    }
  };

  // メニューが開いたとき最初のリンクにフォーカスを移動 (REQ-12)
  useEffect(() => {
    if (menuOpen) {
      firstLinkRef.current?.focus();
    }
  }, [menuOpen]);

  // Escape キーでメニューを閉じる (REQ-5)
  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, closeMenu]);

  return (
    <div className="app-shell">
      {/* ハンバーガーボタン: 常時表示 (REQ-1 / REQ-9 / REQ-10) */}
      <button
        ref={hamburgerRef}
        type="button"
        className="app-shell__hamburger"
        aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
        aria-expanded={menuOpen}
        onClick={toggleMenu}
      >
        ☰
      </button>

      {/* オーバーレイ背景: メニューが開いているときのみ表示 (REQ-3) */}
      {menuOpen && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: オーバーレイ背景はクリック専用の半透明幕
        <div className="app-shell__overlay" onClick={closeMenu} />
      )}

      {/*
        ナビゲーションメニューパネル.
        - menuOpen=false: role="navigation", aria-label="サイドバーナビゲーション"
          → BL-036 既存テストの getSidebar() が参照できる
          → screen.queryByRole("dialog") は null → AC-1 pass
        - menuOpen=true: role="dialog", aria-modal="true", aria-label="ナビゲーションメニュー"
          → BL-049 テストの getByRole("dialog") で取得可能
      */}
      <nav
        className={`app-shell__menu${menuOpen ? " app-shell__menu--open" : ""}`}
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen ? "true" : undefined}
        aria-label={menuOpen ? "ナビゲーションメニュー" : "サイドバーナビゲーション"}
      >
        {/* プライマリナビ (REQ-7): 現在のタスク / 今日のタスク / 明日のタスク */}
        <ul className="app-shell__nav-primary">
          <li>
            <NavLink
              ref={firstLinkRef}
              to="/focus"
              className={navLinkClass}
              onClick={menuOpen ? closeMenu : undefined}
            >
              現在のタスク
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/today"
              className={navLinkClass}
              onClick={menuOpen ? closeMenu : undefined}
            >
              今日のタスク
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tomorrow"
              className={navLinkClass}
              onClick={menuOpen ? closeMenu : undefined}
            >
              明日のタスク
            </NavLink>
          </li>
        </ul>

        {/* プライマリ / セカンダリ間の区切り (REQ-7) */}
        <hr className="app-shell__divider" />

        {/* セカンダリナビ (REQ-7): プロジェクト / ルーティン / ゴミ箱 / 設定 */}
        <ul className="app-shell__nav-secondary">
          <li>
            <NavLink
              to="/projects"
              className={navLinkClass}
              onClick={menuOpen ? closeMenu : undefined}
            >
              プロジェクト
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/routines"
              className={navLinkClass}
              onClick={menuOpen ? closeMenu : undefined}
            >
              ルーティン
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/trash"
              className={navLinkClass}
              onClick={menuOpen ? closeMenu : undefined}
            >
              ゴミ箱
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/settings"
              className={navLinkClass}
              onClick={menuOpen ? closeMenu : undefined}
            >
              設定
            </NavLink>
          </li>
        </ul>
      </nav>

      {/*
        メイン領域 (REQ-6).
        既存 view が内部で <main> ランドマークを持つため, AppShell 側は <div> で
        包んでランドマーク重複を避ける.
      */}
      <div className="app-shell__main">
        <Outlet />
      </div>
    </div>
  );
}
