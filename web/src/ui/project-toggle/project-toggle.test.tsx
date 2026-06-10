import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/**
 * 単体テスト: `<ProjectToggle />` (BL-041 / project-toggle-ui).
 *
 * 仕様参照:
 *   docs/developer/features/project-toggle-ui/spec.md
 *     REQ-1 (起票フォームのプロジェクト入力 = トグルボタン 1 個),
 *     REQ-2 (巡回順序: null → projects[0] → ... → projects[last] → null),
 *     REQ-3 (表示文言: 未分類 / project.name),
 *     REQ-4 (アクセシビリティ: <button> / aria-label に現在値 / Tab + Enter/Space で巡回),
 *     AC-1  (構造 + 初期表示 「（未分類）」),
 *     AC-2  (クリック巡回 null → projects[0] → ... → null),
 *     AC-6  (projects 空のとき no-op),
 *     AC-7  (キーボード Space / Enter で巡回).
 *   docs/developer/features/project-toggle-ui/plan.md
 *     D-001 (共通コンポーネント化, props は value / onChange / projects / idPrefix / groupLabel),
 *     D-002 (単一 <button> で巡回 UI),
 *     D-003 (null も巡回ポジションの 1 つ),
 *     D-005 (削除済 id は次クリックで null に矯正),
 *     D-008 (順方向巡回のみ).
 *   docs/developer/features/project-toggle-ui/tasks.md T-001.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - `<ProjectToggle />` 本体はまだ存在しない. import がまず失敗する (red).
 *   - implementer (T-005) が `web/src/ui/project-toggle/project-toggle.tsx` を作って green 化する.
 *
 * 設計メモ:
 *   - 「現在値」の観察は plan の `<button>` 表面の textContent と aria-label の双方で検証する.
 *   - キーボード操作は <button> 標準挙動 (Tab + Enter / Space) で自然に満たすことを確認する.
 *   - BL-040 priority-stars のテスト記法 (vitest + @testing-library/react + userEvent) を踏襲する.
 */
import { describe, expect, it, vi } from "vitest";

import type { Project } from "../../repositories/project-repository.js";
// ProjectToggle 本体はまだ存在しない. implementer が
// web/src/ui/project-toggle/project-toggle.tsx を作るまでこの import で red になる.
import { ProjectToggle } from "./project-toggle.js";

const NOW = "2026-06-09T09:00:00.000Z";

/** テスト用 Project ファクトリ. */
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-1",
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** 「プロジェクト」を name に含む button を取り出す (radiogroup ではなく単一の button). */
function getToggleButton(): HTMLButtonElement {
  // aria-label に「プロジェクト: 現在 ○○」を含む button が 1 つだけ存在する前提.
  return screen.getByRole("button", { name: /プロジェクト/ }) as HTMLButtonElement;
}

describe("<ProjectToggle /> (BL-041 単体)", () => {
  it("シナリオ AC-1: value=null の時, button の textContent に「（未分類）」が含まれる (REQ-1 / REQ-3)", () => {
    // AC-1: 初期表示は「（未分類）」.
    render(<ProjectToggle value={null} onChange={() => {}} projects={[]} idPrefix="create" />);

    // role="button" の単一要素が存在する (= 起票フォームのプロジェクト入力).
    const button = getToggleButton();
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe("BUTTON");
    // 可視文字に「（未分類）」が出る (REQ-3).
    expect(button.textContent ?? "").toMatch(/（未分類）/);
  });

  it("シナリオ: value=<projectId> の時, button の textContent に該当プロジェクト名が含まれる (REQ-3)", () => {
    const projects: Project[] = [
      makeProject({ id: "p-1", name: "仕事" }),
      makeProject({ id: "p-2", name: "個人" }),
    ];

    render(<ProjectToggle value="p-2" onChange={() => {}} projects={projects} idPrefix="create" />);

    const button = getToggleButton();
    expect(button.textContent ?? "").toContain("個人");
    // 他のプロジェクト名は同時には現れない (= 現在値の 1 つだけが表示される).
    expect(button.textContent ?? "").not.toContain("仕事");
  });

  it("シナリオ AC-2: クリックで null → projects[0] → projects[1] → ... → null と巡回する onChange が呼ばれる (REQ-2)", async () => {
    // AC-2: null → 仕事 → 個人 → null の 1 周.
    // controlled なので親側の state を rerender で更新しながら 3 連続クリックを検証する.
    const projects: Project[] = [
      makeProject({ id: "p-1", name: "仕事" }),
      makeProject({ id: "p-2", name: "個人" }),
    ];
    const onChange = vi.fn<(next: string | null) => void>();
    const user = userEvent.setup();

    // 初期 value=null.
    const { rerender } = render(
      <ProjectToggle value={null} onChange={onChange} projects={projects} idPrefix="create" />,
    );

    // クリック 1 回目: null → projects[0] = "p-1".
    await user.click(getToggleButton());
    expect(onChange).toHaveBeenNthCalledWith(1, "p-1");

    // 親側の state 更新を模倣して rerender.
    rerender(
      <ProjectToggle value="p-1" onChange={onChange} projects={projects} idPrefix="create" />,
    );

    // クリック 2 回目: "p-1" → "p-2".
    await user.click(getToggleButton());
    expect(onChange).toHaveBeenNthCalledWith(2, "p-2");

    rerender(
      <ProjectToggle value="p-2" onChange={onChange} projects={projects} idPrefix="create" />,
    );

    // クリック 3 回目: "p-2" → null (1 周).
    await user.click(getToggleButton());
    expect(onChange).toHaveBeenNthCalledWith(3, null);

    // 計 3 回の onChange.
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("シナリオ AC-6: projects が空の時, クリックしても onChange は呼ばれない (no-op)", async () => {
    // AC-6: projects = [] のとき, クリックしても null のままで onChange は呼ばれない.
    const onChange = vi.fn<(next: string | null) => void>();
    const user = userEvent.setup();

    render(<ProjectToggle value={null} onChange={onChange} projects={[]} idPrefix="create" />);

    const button = getToggleButton();
    await user.click(button);
    await user.click(button);
    await user.click(button);

    // onChange は一度も呼ばれない (no-op).
    expect(onChange).not.toHaveBeenCalled();
    // 表示も「（未分類）」のまま.
    expect(button.textContent ?? "").toMatch(/（未分類）/);
  });

  it("シナリオ D-005: 削除済み (= projects に存在しない) id を value として渡されたとき, クリックで onChange(null) が呼ばれる", async () => {
    // plan D-005: タブ間でプロジェクトが削除された場合の value は次クリックで null に矯正される.
    const projects: Project[] = [
      makeProject({ id: "p-1", name: "仕事" }),
      makeProject({ id: "p-2", name: "個人" }),
    ];
    const onChange = vi.fn<(next: string | null) => void>();
    const user = userEvent.setup();

    render(
      <ProjectToggle value="p-deleted" onChange={onChange} projects={projects} idPrefix="create" />,
    );

    await user.click(getToggleButton());

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("シナリオ REQ-4: button の aria-label に現在の選択値 (プロジェクト名 or 未分類) が含まれる", () => {
    // REQ-4: aria-label に「現在 ＜name＞」相当を含め, screen reader が現在値を読み上げられる.
    const projects: Project[] = [
      makeProject({ id: "p-1", name: "仕事" }),
      makeProject({ id: "p-2", name: "個人" }),
    ];

    // 初期 value=null のとき aria-label に「未分類」が含まれる.
    const { rerender } = render(
      <ProjectToggle value={null} onChange={() => {}} projects={projects} idPrefix="create" />,
    );
    {
      const button = getToggleButton();
      const ariaLabel = button.getAttribute("aria-label") ?? "";
      expect(ariaLabel).toMatch(/プロジェクト/);
      expect(ariaLabel).toMatch(/未分類/);
    }

    // value="p-1" のとき aria-label に「仕事」が含まれる.
    rerender(
      <ProjectToggle value="p-1" onChange={() => {}} projects={projects} idPrefix="create" />,
    );
    {
      const button = getToggleButton();
      const ariaLabel = button.getAttribute("aria-label") ?? "";
      expect(ariaLabel).toMatch(/プロジェクト/);
      expect(ariaLabel).toMatch(/仕事/);
    }
  });

  it("シナリオ AC-7: キーボード Enter で巡回する (REQ-4 / <button> 標準挙動)", async () => {
    // AC-7: Tab でフォーカス到達 → Enter で 1 タップ相当.
    const projects: Project[] = [
      makeProject({ id: "p-1", name: "仕事" }),
      makeProject({ id: "p-2", name: "個人" }),
    ];
    const onChange = vi.fn<(next: string | null) => void>();
    const user = userEvent.setup();

    render(
      <ProjectToggle value={null} onChange={onChange} projects={projects} idPrefix="create" />,
    );

    const button = getToggleButton();
    // フォーカスを当てる (= 明示 focus). Tab 動線は後続のテストで検証する.
    button.focus();
    expect(document.activeElement).toBe(button);

    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("p-1");
  });

  it("シナリオ AC-7: キーボード Space で巡回する (REQ-4 / <button> 標準挙動)", async () => {
    // AC-7: Space キーでも 1 タップ相当の onChange が走る.
    const projects: Project[] = [
      makeProject({ id: "p-1", name: "仕事" }),
      makeProject({ id: "p-2", name: "個人" }),
    ];
    const onChange = vi.fn<(next: string | null) => void>();
    const user = userEvent.setup();

    render(
      <ProjectToggle value={null} onChange={onChange} projects={projects} idPrefix="create" />,
    );

    const button = getToggleButton();
    button.focus();
    expect(document.activeElement).toBe(button);

    // userEvent.keyboard では Space は " " で表現する.
    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("p-1");
  });

  it("シナリオ REQ-4: Tab キーで button にフォーカスが到達する (キーボード Tab 到達)", async () => {
    // REQ-4: Tab でフォーカス到達できる (= tabIndex 排除されていない <button>).
    const projects: Project[] = [makeProject({ id: "p-1", name: "仕事" })];
    const user = userEvent.setup();

    render(
      <ProjectToggle value={null} onChange={() => {}} projects={projects} idPrefix="create" />,
    );

    // 初期では body にフォーカス. Tab で button に到達する.
    expect(document.activeElement).toBe(document.body);
    await user.tab();

    const button = getToggleButton();
    expect(document.activeElement).toBe(button);
  });
});
