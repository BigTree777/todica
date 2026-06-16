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
import type { JSX } from "react";
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
  /**
   * close 経路で「ハンバーガーへ focus を戻したい」リクエストを表すフラグ.
   * BL-062 で menuOpen=true 中はハンバーガーが `display: none` (退避) のため,
   * `setMenuOpen(false)` と同期で `focus()` しても DOM が非表示のまま focus が
   * 当たらない. このフラグを立てておき, 再 render で `--hidden` が外れた直後の
   * useEffect で focus を移すことで, 表示状態の要素に対する focus を保証する.
   */
  const focusHamburgerOnCloseRef = useRef(false);

  const closeMenu = useCallback(() => {
    // 次の render で --hidden が外れた直後にハンバーガーへ focus を戻す (REQ-13 / BL-062 REQ-4).
    focusHamburgerOnCloseRef.current = true;
    setMenuOpen(false);
  }, []);

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
    } else {
      setMenuOpen(true);
    }
  };

  // メニューが開いたとき最初のリンクにフォーカスを移動 (REQ-12)
  // メニューが閉じたときに pending な focus 復帰リクエストがあればハンバーガーへ移す.
  useEffect(() => {
    if (menuOpen) {
      firstLinkRef.current?.focus();
      return;
    }
    if (focusHamburgerOnCloseRef.current) {
      focusHamburgerOnCloseRef.current = false;
      hamburgerRef.current?.focus();
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
      {/*
        ハンバーガーボタン: DOM は常時残し focus 復帰先として有効性を保つ
        (BL-049 REQ-13). menuOpen=true の間は state class
        `app-shell__hamburger--hidden` を付与し CSS で `display: none` に
        退避する (BL-062 REQ-1 / REQ-8 / D-002).
      */}
      <button
        ref={hamburgerRef}
        type="button"
        className={`app-shell__hamburger${menuOpen ? " app-shell__hamburger--hidden" : ""}`}
        aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
        aria-expanded={menuOpen}
        onClick={toggleMenu}
      >
        ☰
      </button>

      <button
        type="button"
        className="app-shell__reload"
        aria-label="アップデートを確認して再読み込み"
        onClick={async () => {
          if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
            try {
              const registration = await navigator.serviceWorker.getRegistration();
              if (registration?.waiting) {
                registration.waiting.postMessage({ type: "SKIP_WAITING" });
              } else if (registration) {
                await registration.update();
              }
            } catch {
              // SW 利用不可環境は無視して reload のみ実行
            }
          }
          window.location.reload();
        }}
      >
        ↻
      </button>

      {/* オーバーレイ背景: メニューが開いているときのみ表示 (REQ-3) */}
      {menuOpen && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: オーバーレイ背景はクリック専用の半透明幕
        // biome-ignore lint/a11y/noStaticElementInteractions: オーバーレイ背景はクリック専用の半透明幕
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
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: menuOpen=true 時のみ role="dialog" になるため aria-modal は条件付きで有効 */}
      <nav
        className={`app-shell__menu${menuOpen ? " app-shell__menu--open" : ""}`}
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen ? "true" : undefined}
        aria-label={menuOpen ? "ナビゲーションメニュー" : "サイドバーナビゲーション"}
      >
        {/*
          メニュー内「閉じる」ボタン (BL-062 REQ-2 / REQ-5 / REQ-6 / REQ-7 / REQ-11 / D-003).
          menuOpen=true の間だけ render し, menu パネル冒頭 (最初の子要素) に配置する.
          click 時は既存 `closeMenu` を呼ぶ (D-004: focus 復帰込み).
        */}
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
