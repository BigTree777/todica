/**
 * 単体テスト共通ヘルパ: 起票カード + ボタン展開式 (BL-104 / floating-create-button).
 *
 * 仕様参照:
 *   docs/developer/features/floating-create-button/spec.md AC-1〜AC-11.
 *   docs/developer/features/floating-create-button/plan.md D-001.
 *
 * 役割:
 *   - 各 view (today / tomorrow / projects / routines) の単体テストは
 *     AppShell を mount せずに view 本体だけを render することが多い.
 *   - BL-104 で起票フォームは初期非表示になるため, ヘルパなしでは
 *     既存テスト (= getByLabel("タスク名") などフォーム前提) が動かない.
 *   - 本ヘルパは `<MemoryRouter initialEntries={["/today?create=1"]}>` 等で
 *     view を包み, 初期描画から `formOpen=true` 状態にする.
 *
 * 注意:
 *   - BL-104 実装後は `useSearchParams` で `?create=1` を読んで formOpen を導出する
 *     方針 (plan.md D-001). そのため `?create=1` を初期 URL に渡すだけでフォームが
 *     開いた状態になる.
 *   - 実装前は view 側が `?create=1` を読まないため, フォーム自体が描画されず
 *     既存テストの assert (= フォーム表示前提) が fail する想定.
 */
import { type RenderResult, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

export interface RenderWithCreateFormOpenOptions {
  /** 初期 path. 既定: "/today". */
  path?: string;
}

/**
 * view コンポーネントを「起票フォームが開いた状態」で render する.
 *
 * `?create=1` を URL クエリに付加することで, view 側の `useSearchParams` 経由で
 * `formOpen=true` が導出される (plan.md D-001).
 */
export function renderWithCreateFormOpen(
  ui: ReactNode,
  options: RenderWithCreateFormOpenOptions = {},
): RenderResult {
  const path = options.path ?? "/today";
  const url = `${path}${path.includes("?") ? "&" : "?"}create=1`;
  return render(
    <MemoryRouter
      initialEntries={[url]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      {ui}
    </MemoryRouter>,
  );
}
