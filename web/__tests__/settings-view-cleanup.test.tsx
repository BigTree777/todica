import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsView } from "../src/ui/settings-view/settings-view.js";

const repoRoot = resolve(__dirname, "../..");

function makeRepo() {
  return {
    getSettings: vi.fn().mockResolvedValue({
      id: "singleton",
      dayBoundaryTime: "04:00",
      version: 1,
      updatedAt: new Date().toISOString(),
    }),
    patchSettings: vi.fn(),
  };
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("SettingsView 整理 (BL-094)", () => {
  it("FR-1: ログアウト section は .settings-view__logout クラスで外枠を持たない", () => {
    const repo = makeRepo();
    const { container } = renderWithClient(
      <SettingsView repository={repo as never} onLogout={vi.fn()} />,
    );
    const logout = container.querySelector(".settings-view__logout");
    expect(logout).not.toBeNull();
    expect(container.querySelector('.settings-view__section[aria-label="ログアウト"]')).toBeNull();
  });

  it("FR-2: パスワード変更の 3 ブロックが .settings-view__password-field を持つ", () => {
    const repo = makeRepo();
    const { container } = renderWithClient(
      <SettingsView repository={repo as never} onChangePassword={vi.fn()} />,
    );
    const fields = container.querySelectorAll(".settings-view__password-field");
    expect(fields.length).toBe(3);
  });

  it("FR-3: リセット時刻 submit button の文言が「変更」", async () => {
    const repo = makeRepo();
    renderWithClient(<SettingsView repository={repo as never} />);
    await screen.findByDisplayValue("04:00");
    const settingForm = screen.getByRole("form", { name: "設定フォーム" });
    const submit = settingForm.querySelector("button[type='submit']");
    expect(submit?.textContent?.trim()).toBe("変更");
  });

  it("FR-3: パスワード変更 submit button の文言も「変更」", async () => {
    const repo = makeRepo();
    renderWithClient(<SettingsView repository={repo as never} onChangePassword={vi.fn()} />);
    await screen.findByDisplayValue("04:00");
    const pwSection = screen.getByRole("region", { name: "パスワード変更" });
    const submit = pwSection.querySelector("button[type='submit']");
    expect(submit?.textContent?.trim()).toBe("変更");
  });

  it("FR-4: リセット時刻ラベルが .settings-view__label を持つ (太字 + h2 サイズ)", () => {
    const css = readFileSync(
      resolve(repoRoot, "web/src/ui/settings-view/settings-view.css"),
      "utf-8",
    );
    expect(css).toMatch(/\.settings-view__label\s*\{[^}]*font-weight:\s*bold/);
    expect(css).toMatch(/\.settings-view__label\s*\{[^}]*font-size:\s*var\(--font-size-h2\)/);
  });

  it("FR-4: リセット時刻 input と変更ボタンが .settings-view__field-row 内に並ぶ", async () => {
    const repo = makeRepo();
    const { container } = renderWithClient(<SettingsView repository={repo as never} />);
    await screen.findByDisplayValue("04:00");
    const row = container.querySelector(".settings-view__field-row");
    expect(row).not.toBeNull();
    const input = row?.querySelector("input#day-boundary-time");
    const button = row?.querySelector("button[type='submit']");
    expect(input).not.toBeNull();
    expect(button).not.toBeNull();
  });
});
