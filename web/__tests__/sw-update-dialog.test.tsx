/**
 * SwUpdateDialog の単体テスト.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwUpdateDialog } from "../src/ui/sw-update-dialog/sw-update-dialog.js";

type ServiceWorkerLike = {
  state: ServiceWorkerState;
  postMessage: (message: unknown) => void;
  addEventListener: (type: string, listener: EventListener) => void;
};

type RegistrationLike = {
  waiting: ServiceWorkerLike | null;
  installing: ServiceWorkerLike | null;
  addEventListener: (type: string, listener: EventListener) => void;
};

function mockServiceWorker(options: {
  waiting?: ServiceWorkerLike | null;
  controller?: object | null;
}) {
  const registration: RegistrationLike = {
    waiting: options.waiting ?? null,
    installing: null,
    addEventListener: vi.fn(),
  };

  const sw = {
    ready: Promise.resolve(registration),
    controller: options.controller ?? {},
    addEventListener: vi.fn(),
  } as unknown as ServiceWorkerContainer;

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: sw,
  });

  return { registration, sw };
}

describe("SwUpdateDialog", () => {
  let originalServiceWorker: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  });

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
    } else {
      // biome-ignore lint/performance/noDelete: 復元用
      delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    }
    vi.restoreAllMocks();
  });

  it("待機中の SW が無いときは dialog が閉じている", () => {
    mockServiceWorker({ waiting: null });
    render(<SwUpdateDialog />);
    const dialog = screen.getByLabelText("アップデート") as HTMLDialogElement;
    expect(dialog.open).toBe(false);
  });

  it("待機中の SW があれば dialog が画面中央のモーダルとして開く", async () => {
    const waiting: ServiceWorkerLike = {
      state: "installed",
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
    };
    mockServiceWorker({ waiting });
    render(<SwUpdateDialog />);

    await vi.waitFor(() => {
      const dialog = screen.getByLabelText("アップデート") as HTMLDialogElement;
      expect(dialog.open).toBe(true);
    });
  });

  it("再読み込みボタンで SKIP_WAITING + reload が呼ばれる", async () => {
    const waiting: ServiceWorkerLike = {
      state: "installed",
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
    };
    mockServiceWorker({ waiting });
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(<SwUpdateDialog />);
    await vi.waitFor(() => {
      const dialog = screen.getByLabelText("アップデート") as HTMLDialogElement;
      expect(dialog.open).toBe(true);
    });
    const button = screen.getByText("再読み込み").closest("button");
    if (!button) throw new Error("再読み込みボタンが見つからない");
    fireEvent.click(button);

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).toHaveBeenCalled();
  });

  it("「あとで」で dialog が閉じる", async () => {
    const waiting: ServiceWorkerLike = {
      state: "installed",
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
    };
    mockServiceWorker({ waiting });
    render(<SwUpdateDialog />);
    await vi.waitFor(() => {
      const dialog = screen.getByLabelText("アップデート") as HTMLDialogElement;
      expect(dialog.open).toBe(true);
    });

    const dismissButton = screen.getByText("あとで").closest("button");
    if (!dismissButton) throw new Error("あとでボタンが見つからない");
    fireEvent.click(dismissButton);

    const dialog = screen.getByLabelText("アップデート") as HTMLDialogElement;
    expect(dialog.open).toBe(false);
  });

  it("dialog 要素の a11y 属性 (aria-label / role=dialog) が揃う", () => {
    mockServiceWorker({ waiting: null });
    render(<SwUpdateDialog />);
    const dialog = screen.getByLabelText("アップデート");
    expect(dialog).toHaveAttribute("aria-label", "アップデート");
    // role=dialog は <dialog> のネイティブロール
    expect(dialog.tagName).toBe("DIALOG");
  });
});
