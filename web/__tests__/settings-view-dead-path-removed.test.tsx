import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
/**
 * Web クライアント単体テスト: SettingsView 旧 authToken 入力 UI 削除検証 (BL-075).
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/settings-view-dead-path-cleanup/spec.md
 *     AC-1 (dead path identifier の消滅) / AC-2 (サーバ接続設定 DOM の消滅) /
 *     AC-3 (識別子 ID の消滅) と 1:1 対応するシナリオを扱う.
 *
 * 背景:
 *   BL-019 (Android サーバモード) で SettingsView に追加された
 *   「サーバ接続設定」セクション (`serverUrl?` / `authToken?` / `onSaveServer?` props と
 *   それに伴う <section aria-label="サーバ接続設定"> / サーバ URL input /
 *   認証トークン input / 「変更を保存」ボタン) は、
 *   BL-074 (アプリ内パスワードログイン導入) で responsibilities 全体が再編されたため
 *   dead path と化している。本 BL (BL-075) でこの dead path を完全削除する。
 *
 * TDD red 戦略 (本ファイルが現状 red になる仕掛け):
 *   spec.md §AC-2 の Given:
 *     "旧 props を仮に渡しても (= 型エラーは発生する想定)、それを無視してレンダリングした場合"
 *   に従い、dead path props (`serverUrl` / `authToken` / `onSaveServer`) を
 *   敢えて渡した状態で render し、それでも dead path 関連の DOM 要素が
 *   一切出ないことを assert する.
 *
 *   現状実装 (`web/src/ui/settings-view/settings-view.tsx`) には
 *   `{onSaveServer !== undefined && (<section aria-label="サーバ接続設定">...</section>)}`
 *   が残っているため、dead path props を渡すと当然 DOM に section / input / button が
 *   出現する → 本テストは red. implementer が dead path を完全削除すると green になる.
 *
 *   注意: 削除後は `SettingsViewProps` から 3 props が消えるため、
 *         この呼び出し自体が TypeScript エラーになる. その時点で本ファイルの
 *         該当 props を削除する必要がある (implementer の Step 5 で対応).
 *         本フェーズでは `@ts-expect-error` で型エラーを許容して red を作る.
 *
 * 同時削除予定:
 *   `web/__tests__/settings-view.test.tsx` の
 *   `describe("SettingsView サーバ接続設定セクション (BL-019 AC-AND-005)")` ブロック
 *   (it x 3) は BL-075 の Step 5 (implementer 責務) で削除される.
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
// SettingsView dead path 削除検証 (BL-075 AC-1 / AC-2 / AC-3)
// ============================================================

describe("SettingsView dead path 削除検証 (BL-075)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------
  // AC-1: dead path props を渡さなくても render できる + dead path 要素なし
  //
  // spec.md §AC-1 は grep ベースのソース検証だが、その「型上 props が消える」結果を
  // DOM 観点で確認する: dead path props を一切渡さない通常呼び出しで render しても
  // 既存責務 (BL-009 dayBoundaryTime) が正しく表示され、かつ dead path 要素は出ない.
  //
  // 本ケースは BL-075 完了前後の両方で green であるべき (regression guard).
  // ----------------------------------------------------------
  it("AC-1: dead path props を渡さなくても dayBoundaryTime が表示され dead path 要素は DOM に出現しない", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });

    renderWithQueryClient(<SettingsView repository={repo} />);

    // 既存 BL-009 の dayBoundaryTime 表示が出ることで render 完了を確認.
    expect(await screen.findByText(/04:00/)).toBeInTheDocument();

    // dead path props を渡していないので当然 dead path 要素は無い.
    expect(screen.queryByLabelText(/サーバ\s*URL/)).toBeNull();
    expect(screen.queryByLabelText(/認証\s*トークン/)).toBeNull();
    expect(screen.queryByRole("button", { name: /変更を保存/ })).toBeNull();
  });

  // ----------------------------------------------------------
  // AC-2: サーバ接続設定 DOM の消滅 (dead path props を渡しても出ない)
  //
  // spec.md §AC-2:
  //   Given <SettingsView repository={...} onSaveServer={fn} serverUrl="x" authToken="y" />
  //         のように旧 props を仮に渡しても (= 型エラーは発生する想定)、
  //         それを無視してレンダリングした場合
  //   When  レンダリング結果の DOM を観察する
  //   Then  「サーバ URL」「認証トークン」のラベルを持つ input 要素は存在しない
  //    And  「変更を保存」というアクセシブル名のボタンは存在しない
  //    And  <section aria-label="サーバ接続設定"> も存在しない
  //
  // 現状 (BL-075 未実装): dead path props を渡すと section が描画されるため red.
  // BL-075 実装後: `serverUrl` / `authToken` / `onSaveServer` が型から消え、
  //                JSX も section ごと消えるため、props を渡してもアロケートされず green.
  //                (この時点で本ファイル内の dead props 渡しは TypeScript error になるため、
  //                 implementer は Step 5 で `@ts-expect-error` を含む dead props 渡しを除去する.)
  // ----------------------------------------------------------
  it("AC-2: dead path props (serverUrl / authToken / onSaveServer) を渡しても サーバ接続設定 section / input / button が DOM に出現しない", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onSaveServer = vi.fn();

    const { container } = renderWithQueryClient(
      <SettingsView
        repository={repo}
        // BL-075 完了後は以下 3 props は SettingsViewProps から削除される.
        // 本フェーズではまだ存在するため通常の呼び出しが可能.
        serverUrl="https://example.com"
        authToken="secret-token"
        onSaveServer={onSaveServer}
      />,
    );

    // 既存 BL-009 の dayBoundaryTime 表示で render 完了を待つ.
    await screen.findByText(/04:00/);

    // <section aria-label="サーバ接続設定"> が存在しないこと.
    expect(container.querySelector('section[aria-label="サーバ接続設定"]')).toBeNull();

    // <form aria-label="サーバ接続設定フォーム"> が存在しないこと.
    expect(container.querySelector('form[aria-label="サーバ接続設定フォーム"]')).toBeNull();

    // 「サーバ URL」「認証トークン」のラベルを持つ input が存在しないこと.
    expect(screen.queryByLabelText(/サーバ\s*URL/)).toBeNull();
    expect(screen.queryByLabelText(/認証\s*トークン/)).toBeNull();

    // 「変更を保存」アクセシブル名を持つ button が存在しないこと.
    expect(screen.queryByRole("button", { name: /変更を保存/ })).toBeNull();
  });

  // ----------------------------------------------------------
  // AC-3: 識別子 ID の消滅 (DOM 観点)
  //
  // spec.md §AC-3 は `grep -rn "settings-auth-token\|settings-server-url" web/` で
  // 0 hit を要求するソース検証だが、ここでは「dead path props を渡しても
  // BL-019 由来の DOM ID が出現しない」ことを DOM 観点で確認する.
  // ----------------------------------------------------------
  it("AC-3: dead path props を渡しても id=settings-server-url / id=settings-auth-token を持つ要素が DOM に存在しない", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onSaveServer = vi.fn();

    const { container } = renderWithQueryClient(
      <SettingsView
        repository={repo}
        serverUrl="https://example.com"
        authToken="secret-token"
        onSaveServer={onSaveServer}
      />,
    );

    await screen.findByText(/04:00/);

    // BL-019 由来の dead path DOM ID 2 つが消えていること.
    expect(container.querySelector("#settings-server-url")).toBeNull();
    expect(container.querySelector("#settings-auth-token")).toBeNull();
  });

  // ----------------------------------------------------------
  // AC-2 補強: セクションヘッダ「サーバ接続設定」テキストの消滅
  //
  // BL-019 の <h2>サーバ接続設定</h2> が dead path として残らないことを確認.
  // BL-075 完了後はこのテキスト自体が SettingsView 内のどこにも存在しない.
  // ----------------------------------------------------------
  it("AC-2 補強: dead path props を渡しても セクション見出し「サーバ接続設定」/ ラベル「サーバ URL」「認証トークン」が SettingsView 内に存在しない", async () => {
    const repo = makeMockRepository({ dayBoundaryTime: "04:00" });
    const onSaveServer = vi.fn();

    renderWithQueryClient(
      <SettingsView
        repository={repo}
        serverUrl="https://example.com"
        authToken="secret-token"
        onSaveServer={onSaveServer}
      />,
    );

    await screen.findByText(/04:00/);

    // 「サーバ接続設定」というセクション見出しテキストが存在しないこと.
    expect(screen.queryByText("サーバ接続設定")).toBeNull();
    // ラベル ("サーバ URL" / "認証トークン") も text 経路で存在しないこと.
    expect(screen.queryByText("サーバ URL")).toBeNull();
    expect(screen.queryByText("認証トークン")).toBeNull();
  });
});
