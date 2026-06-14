import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/ui/app-shell/app-shell.js";

describe("AppShell 右上の更新ボタン", () => {
  let originalServiceWorker: PropertyDescriptor | undefined;
  let originalReload: typeof window.location.reload;

  beforeEach(() => {
    originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    originalReload = window.location.reload;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: vi.fn() },
    });
  });

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
    } else {
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: undefined,
      });
    }
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: originalReload },
    });
    vi.restoreAllMocks();
  });

  function renderShell() {
    return render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    );
  }

  it("aria-label を持つ更新ボタンが描画される", () => {
    renderShell();
    const button = screen.getByLabelText("アップデートを確認して再読み込み");
    expect(button.tagName).toBe("BUTTON");
  });

  it("更新ボタンは Unicode 記号のみで日本語文字を含まない", () => {
    renderShell();
    const button = screen.getByLabelText("アップデートを確認して再読み込み");
    expect(button.textContent ?? "").not.toMatch(/[ぁ-んァ-ン一-龯]/);
  });

  it("SW 未対応の環境でも click で window.location.reload() が呼ばれる", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: undefined,
    });
    renderShell();
    const button = screen.getByLabelText("アップデートを確認して再読み込み");
    fireEvent.click(button);
    await vi.waitFor(() => {
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  it("waiting SW があるとき click で SKIP_WAITING + reload が呼ばれる", async () => {
    const postMessage = vi.fn();
    const registration = {
      waiting: { postMessage },
      update: vi.fn(),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(registration),
      },
    });
    renderShell();
    const button = screen.getByLabelText("アップデートを確認して再読み込み");
    fireEvent.click(button);
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  it("waiting SW が無いとき click で registration.update() + reload が呼ばれる", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = {
      waiting: null,
      update,
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(registration),
      },
    });
    renderShell();
    const button = screen.getByLabelText("アップデートを確認して再読み込み");
    fireEvent.click(button);
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalled();
      expect(window.location.reload).toHaveBeenCalled();
    });
  });
});
