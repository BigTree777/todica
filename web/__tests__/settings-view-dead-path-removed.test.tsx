import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
/**
 * Web クライアント単体テスト: SettingsView 旧 authToken 入力 UI 削除検証 (BL-075).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/settings-view-dead-path-cleanup/spec.md
 *     AC-1 (dead path identifier の消滅) / AC-2 (サーバ接続設定 DOM の消滅) /
 *     AC-3 (識別子 ID の消滅) と対応する DOM 観点の regression guard を扱う.
 *
 * 背景:
 *   BL-019 (Android サーバモード) で SettingsView に追加された
 *   「サーバ接続設定」セクション (`serverUrl?` / `authToken?` / `onSaveServer?` props と
 *   それに伴う <section aria-label="サーバ接続設定"> / サーバ URL input /
 *   認証トークン input / 「変更を保存」ボタン) は、
 *   BL-074 (アプリ内パスワードログイン導入) で responsibilities 全体が再編されたため
 *   dead path と化していた。本 BL (BL-075) でこの dead path を完全削除した。
 *
 * 補足: AC-2 / AC-3 の「dead path props を渡しても DOM に出現しない」検証は
 *       BL-075 完了後は SettingsViewProps から該当 props が型レベルで存在しないため
 *       (TypeScript エラーで dead props を渡せない) 自動的に達成されている。
 *       本ファイルは DOM レベルの regression guard として AC-1 のみを保持する。
 *
 * 同時削除:
 *   `web/__tests__/settings-view.test.tsx` の
 *   `describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` ブロック
 *   (it x 3) は BL-075 で削除済み.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "../src/ui/settings-view/settings-view.js";

// ============================================================
// 型定義 (web 側 SettingsRepository — settings-view.test.tsx と同一スキーマ)
// ============================================================

interface Settings {
  id: string;
  dayBoundaryTime: string;
  version: number;
  updatedAt: string;
}

interface PatchSettingsCommand {
  dayBoundaryTime: string;
  ifMatch: number;
}

interface SettingsRepository {
  getSettings(): Promise<Settings>;
  patchSettings(cmd: PatchSettingsCommand): Promise<Settings>;
}

// ============================================================
// QueryClientProvider ラッパー
// ============================================================

function renderWithQueryClient(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, networkMode: "offlineFirst" },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ============================================================
// モック Repository ファクトリ
// ============================================================

function makeMockRepository(initial?: Partial<Settings>): SettingsRepository {
  const state: Settings = {
    id: "singleton",
    dayBoundaryTime: "04:00",
    version: 1,
    updatedAt: "2026-06-07T09:00:00.000Z",
    ...initial,
  };

  return {
    getSettings: vi.fn(async (): Promise<Settings> => ({ ...state })),
    patchSettings: vi.fn(async (cmd: PatchSettingsCommand): Promise<Settings> => {
      state.dayBoundaryTime = cmd.dayBoundaryTime;
      state.version = cmd.ifMatch + 1;
      state.updatedAt = new Date().toISOString();
      return { ...state };
    }),
  };
}

// ============================================================
// SettingsView dead path 削除検証 (BL-075 AC-1 regression guard)
// ============================================================

describe("SettingsView dead path 削除検証 (BL-075)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // AC-1: dead path 要素が DOM に出現しないこと (regression guard)
  //
  // BL-075 完了後は `serverUrl` / `authToken` / `onSaveServer` props が
  // SettingsViewProps から型レベルで削除されているため、これらを渡そうとすると
  // TypeScript エラーになる。よって本テストでは props を渡さずに render し、
  // BL-019 由来の dead path 要素 (サーバ URL input / 認証トークン input /
  // 「変更を保存」ボタン / <section aria-label="サーバ接続設定"> /
  // id="settings-server-url" / id="settings-auth-token") が
  // SettingsView 内のどこにも存在しないことを assert する.
  //
  // AC-2 / AC-3 のうち「型レベルで dead props 自体が存在しない」部分は
  // TypeScript の型検査 (npm run typecheck) で自動的に担保される.
  // ----------------------------------------------------------
  it("AC-1 regression guard: SettingsView を render しても dead path 要素 (サーバ接続設定 section / input / button / DOM ID) が一切出現しない", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });

    const { container } = renderWithQueryClient(<SettingsView repository={repo} />);

    // 既存 BL-009 の dayBoundaryTime 表示で render 完了を確認.
    expect(await screen.findByText(/04:00/)).toBeInTheDocument();

    // <section aria-label="サーバ接続設定"> が存在しないこと.
    expect(container.querySelector('section[aria-label="サーバ接続設定"]')).toBeNull();

    // <form aria-label="サーバ接続設定フォーム"> が存在しないこと.
    expect(container.querySelector('form[aria-label="サーバ接続設定フォーム"]')).toBeNull();

    // 「サーバ URL」「認証トークン」のラベルを持つ input が存在しないこと.
    expect(screen.queryByLabelText(/サーバ\s*URL/)).toBeNull();
    expect(screen.queryByLabelText(/認証\s*トークン/)).toBeNull();

    // 「変更を保存」アクセシブル名を持つ button が存在しないこと.
    expect(screen.queryByRole("button", { name: /変更を保存/ })).toBeNull();

    // BL-019 由来の dead path DOM ID 2 つが消えていること.
    expect(container.querySelector("#settings-server-url")).toBeNull();
    expect(container.querySelector("#settings-auth-token")).toBeNull();

    // 「サーバ接続設定」というセクション見出しテキストが存在しないこと.
    expect(screen.queryByText("サーバ接続設定")).toBeNull();
    // ラベル ("サーバ URL" / "認証トークン") も text 経路で存在しないこと.
    expect(screen.queryByText("サーバ URL")).toBeNull();
    expect(screen.queryByText("認証トークン")).toBeNull();
  });
});
