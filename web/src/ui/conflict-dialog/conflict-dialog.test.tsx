import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/**
 * フェーズ E: ConflictDialog コンポーネントの単体テスト
 *
 * 受け入れ基準の出典: docs/developer/features/pwa-offline-queue/spec.md
 * §「フェーズ E: 競合解決 UI」と対応する。
 *
 * 要件:
 *   CR-001: 再送時にサーバから 412 Precondition Failed が返った場合、衝突解決ダイアログを表示する。
 *   CR-002: ダイアログには「サーバの値を採用（クライアントの変更を破棄）」と
 *            「クライアントの値で再送（強制上書き）」の 2 択を提示する。
 *   CR-003: 「クライアントの値で再送」を選択した場合、最新の version を If-Match に設定して再送する。
 *   CR-004: 「サーバの値を採用」を選択した場合、キューから該当エントリを削除し、UI を最新データで更新する。
 *
 * シナリオ（spec.md §フェーズ E）:
 *   「衝突解決ダイアログが表示される」
 *   「「サーバの値を採用」「クライアントの値で再送」の 2 択が提示される」
 *
 * NOTE: `conflict-dialog.tsx` はまだ存在しない。このテストは意図的に失敗する (red)。
 *       implementer が `web/src/ui/conflict-dialog/conflict-dialog.tsx` を実装することで green 化する。
 */
import { describe, expect, it, vi } from "vitest";
import { ConflictDialog } from "./conflict-dialog.js";

/** テスト用のサーバ値サンプル */
const sampleServerValue: Record<string, unknown> = {
  id: "task-1",
  name: "サーバ側のタスク名",
  version: 10,
  updatedAt: "2026-06-08T10:00:00.000Z",
};

/** テスト用のクライアント値サンプル */
const sampleLocalValue: Record<string, unknown> = {
  id: "task-1",
  name: "クライアント側の変更後タスク名",
  version: 9,
};

describe("ConflictDialog (フェーズ E: 競合解決 UI)", () => {
  it("シナリオ: open === true のとき衝突解決ダイアログが表示される (CR-001)", () => {
    // Given 412 衝突が発生している（open === true）
    const onAcceptServer = vi.fn();
    const onRetryWithServer = vi.fn();

    // When ConflictDialog を open=true でレンダリングする
    render(
      <ConflictDialog
        open={true}
        localValue={sampleLocalValue}
        serverValue={sampleServerValue}
        onAcceptServer={onAcceptServer}
        onRetryWithServer={onRetryWithServer}
      />,
    );

    // Then ダイアログが表示される
    // spec.md §E-1: 「変更が衝突しました」のタイトル
    expect(screen.getByText(/衝突/)).toBeInTheDocument();
  });

  it("シナリオ: open === false のときダイアログは表示されない", () => {
    // Given 衝突が発生していない（open === false）
    const onAcceptServer = vi.fn();
    const onRetryWithServer = vi.fn();

    // When ConflictDialog を open=false でレンダリングする
    render(
      <ConflictDialog
        open={false}
        localValue={sampleLocalValue}
        serverValue={sampleServerValue}
        onAcceptServer={onAcceptServer}
        onRetryWithServer={onRetryWithServer}
      />,
    );

    // Then ダイアログは表示されない
    expect(screen.queryByText(/衝突/)).toBeNull();
  });

  it("シナリオ: ダイアログに「サーバの値を採用」ボタンが表示される (CR-002)", () => {
    // Given ダイアログが表示されている
    render(
      <ConflictDialog
        open={true}
        localValue={sampleLocalValue}
        serverValue={sampleServerValue}
        onAcceptServer={vi.fn()}
        onRetryWithServer={vi.fn()}
      />,
    );

    // Then 「サーバの値を採用」ボタンが存在する
    const acceptButton = screen.getByRole("button", { name: /サーバ.*採用|サーバの値を採用/ });
    expect(acceptButton).toBeInTheDocument();
  });

  it("シナリオ: ダイアログに「クライアントの値で再送」ボタンが表示される (CR-002)", () => {
    // Given ダイアログが表示されている
    render(
      <ConflictDialog
        open={true}
        localValue={sampleLocalValue}
        serverValue={sampleServerValue}
        onAcceptServer={vi.fn()}
        onRetryWithServer={vi.fn()}
      />,
    );

    // Then 「クライアントの値で再送」ボタンが存在する
    const retryButton = screen.getByRole("button", {
      name: /クライアント.*再送|クライアントの値で再送/,
    });
    expect(retryButton).toBeInTheDocument();
  });

  it("シナリオ: 「サーバの値を採用」ボタンをクリックすると onAcceptServer が呼ばれる (CR-004)", async () => {
    // Given 衝突解決ダイアログが表示されている
    const onAcceptServer = vi.fn();
    const onRetryWithServer = vi.fn();
    const user = userEvent.setup();

    render(
      <ConflictDialog
        open={true}
        localValue={sampleLocalValue}
        serverValue={sampleServerValue}
        onAcceptServer={onAcceptServer}
        onRetryWithServer={onRetryWithServer}
      />,
    );

    // When 「サーバの値を採用」を選択する
    const acceptButton = screen.getByRole("button", { name: /サーバ.*採用|サーバの値を採用/ });
    await user.click(acceptButton);

    // Then onAcceptServer が呼ばれる
    expect(onAcceptServer).toHaveBeenCalledTimes(1);
    // Then onRetryWithServer は呼ばれない
    expect(onRetryWithServer).not.toHaveBeenCalled();
  });

  it("シナリオ: 「クライアントの値で再送」ボタンをクリックすると onRetryWithServer が呼ばれる (CR-003)", async () => {
    // Given 衝突解決ダイアログが表示されている
    const onAcceptServer = vi.fn();
    const onRetryWithServer = vi.fn();
    const user = userEvent.setup();

    render(
      <ConflictDialog
        open={true}
        localValue={sampleLocalValue}
        serverValue={sampleServerValue}
        onAcceptServer={onAcceptServer}
        onRetryWithServer={onRetryWithServer}
      />,
    );

    // When 「クライアントの値で再送」を選択する
    const retryButton = screen.getByRole("button", {
      name: /クライアント.*再送|クライアントの値で再送/,
    });
    await user.click(retryButton);

    // Then onRetryWithServer が呼ばれる
    expect(onRetryWithServer).toHaveBeenCalledTimes(1);
    // Then onAcceptServer は呼ばれない
    expect(onAcceptServer).not.toHaveBeenCalled();
  });

  it("シナリオ: ダイアログにサーバ側の値の概要が表示される (plan.md §フェーズ E)", () => {
    // Given open === true で serverValue.name が「サーバ側のタスク名」
    render(
      <ConflictDialog
        open={true}
        localValue={sampleLocalValue}
        serverValue={sampleServerValue}
        onAcceptServer={vi.fn()}
        onRetryWithServer={vi.fn()}
      />,
    );

    // Then サーバの値の概要（name 等）がダイアログ内に表示される
    // plan.md §E-1: 「サーバの値の概要表示（serverValue.name 等）」
    expect(screen.getByText(/サーバ側のタスク名/)).toBeInTheDocument();
  });

  it("シナリオ: ダイアログにクライアント側の値の概要が表示される (plan.md §フェーズ E)", () => {
    // Given open === true で localValue.name が「クライアント側の変更後タスク名」
    render(
      <ConflictDialog
        open={true}
        localValue={sampleLocalValue}
        serverValue={sampleServerValue}
        onAcceptServer={vi.fn()}
        onRetryWithServer={vi.fn()}
      />,
    );

    // Then クライアントの値の概要が表示される
    // plan.md §E-1: 「クライアントの値の概要表示」
    expect(screen.getByText(/クライアント側の変更後タスク名/)).toBeInTheDocument();
  });
});
