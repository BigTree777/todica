// @vitest-environment jsdom

/**
 * 起票カードのプロジェクト選択を <select> に戻し ProjectToggle を撤去
 * (BL-065 / project-toggle-removal) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/project-toggle-removal/spec.md
 *   docs/developer/features/project-toggle-removal/plan.md
 *   docs/developer/features/project-toggle-removal/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1: <TaskFormCard idPrefix="create"> が <select id="create-project"> を描画する.
 *   AC-2: <select> の option 群が先頭「プロジェクトなし」+ projects 配列の順で並ぶ.
 *   AC-3: <select> の onChange が onProjectIdChange に値を伝播する (userEvent.selectOptions).
 *   AC-4: <label> は .visually-hidden + htmlFor で <select> と関連付けられる.
 *   AC-5: web/src/ui/project-toggle/ ディレクトリが存在しない (撤去 / REQ-5).
 *   AC-6: task-form-card.tsx に ProjectToggle の import / 使用が残らない (REQ-5 / 5-2).
 *
 * AC-7 〜 AC-10 は本ファイルでは個別 assert せず, 既存テストの追従修正
 * (project-chip.test.tsx / task-card-component.test.tsx / task-card-hotfix.test.tsx /
 * task-form-grid-layout.test.tsx / today-view.test.tsx / tomorrow-view.test.tsx /
 * design-tokens.test.ts) および E2E (projects.spec.ts /
 * remove-inline-project-create.spec.ts / a11y.spec.ts) で担保する.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= task-form-card.tsx が ProjectToggle を呼び続け, <select> を描画していない /
 *     project-toggle/ ディレクトリが残存) では AC-1 / AC-2 / AC-3 / AC-4 / AC-5 / AC-6 が red.
 *   - implementer が REQ-1 〜 REQ-5 を実装することで全て green になる想定.
 *
 * 検証スタイル:
 *   - DOM レンダ (AC-1 〜 AC-4):
 *     既存 task-card-component.test.tsx と同形の動的 import + render + userEvent.
 *   - ファイルシステム / ソース直読み (AC-5 / AC-6):
 *     既存 task-card-component.test.tsx と同形の existsSync + readFileSync.
 *
 * D-006 (新規ファイル方針) に対する判断:
 *   spec D-006 は「新規ファイルは作らず task-card-component.test.tsx に集約」を第一候補,
 *   「規模が大きい場合は新規 task-form-card-select.test.tsx も可」を許容している.
 *   task-card-component.test.tsx は既に 1700 行近くあり, 本 BL の AC を追加すると
 *   ProjectToggle 撤去前提の旧 it (AC-13 / AC-23) との混在で読みづらくなるため,
 *   本 BL 専用の新規ファイルに分離した. 旧 it の撤去 / 書き換えは既存ファイル側で行う.
 *
 * vitest-environment:
 *   AC-1 〜 AC-4 は jsdom 必須. AC-5 / AC-6 は node でも動くが
 *   1 ファイル全体を jsdom で動かす (= jsdom でも existsSync / readFileSync は問題なく動く).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Project } from "../src/repositories/project-repository.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

const taskFormCardTsxPath = resolve(webSrcRoot, "ui/task-card/task-form-card.tsx");
const projectToggleDir = resolve(webSrcRoot, "ui/project-toggle");
const projectToggleTsxPath = resolve(projectToggleDir, "project-toggle.tsx");
const projectToggleCssPath = resolve(projectToggleDir, "project-toggle.css");
const projectToggleTestPath = resolve(projectToggleDir, "project-toggle.test.tsx");

const NOW = "2026-06-12T09:00:00.000Z";

// ============================================================
// テストヘルパ
// ============================================================

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p-default",
    name: "デフォルト",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// 動的 import ヘルパ
// (本 BL 実装後も <TaskFormCard> の prop シグネチャは無改修なので
//  task-card-component.test.tsx と同形の動的 import で読み込む)
// ============================================================

type TaskFormCardModule = { TaskFormCard: ComponentType<Record<string, unknown>> };

async function importTaskFormCard(): Promise<TaskFormCardModule> {
  const path = "../src/ui/task-card/task-form-card.js";
  return (await import(/* @vite-ignore */ path)) as TaskFormCardModule;
}

// ============================================================
// describe ブロック
// ============================================================

describe("起票カードのプロジェクト選択を <select> に戻す (BL-065 / project-toggle-removal)", () => {
  // ============================================================
  // AC-1: <TaskFormCard idPrefix="create"> が <select id="create-project"> を描画
  // ============================================================
  /**
   * シナリオ AC-1:
   *   Given TaskFormCard を idPrefix="create" / projects=[] / projectId="" で描画する
   *   When  DOM を検査する
   *   Then  <select id="create-project"> が存在する
   *    かつ その直前に <label for="create-project" class="visually-hidden">プロジェクト</label> が存在する
   *    かつ <button> (project-toggle) は存在しない
   */
  describe("AC-1: <TaskFormCard idPrefix=create> が <select id='create-project'> を描画する", () => {
    it("idPrefix='create' で <select id='create-project'> が DOM 上に存在する", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = container.querySelector("select#create-project");
      expect(
        select,
        "<select id='create-project'> が見つからない (REQ-1 違反 / ProjectToggle が残存)",
      ).not.toBeNull();
      expect(select?.tagName.toLowerCase()).toBe("select");
    });

    it("idPrefix='tomorrow-create' で <select id='tomorrow-create-project'> が DOM 上に存在する", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      const select = container.querySelector("select#tomorrow-create-project");
      expect(
        select,
        "<select id='tomorrow-create-project'> が見つからない (D-003 違反)",
      ).not.toBeNull();
    });

    it("<select id='create-project'> の直前に <label for='create-project'> が存在する", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const label = container.querySelector("label[for='create-project']");
      expect(
        label,
        "<label for='create-project'> が見つからない (REQ-1 / REQ-4 違反)",
      ).not.toBeNull();
      expect(label?.textContent ?? "").toContain("プロジェクト");
    });

    it("起票フォーム scope 内に ProjectToggle 由来の button (aria-label に「プロジェクト」を含む) が存在しない", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      // プロジェクト用 <button> (ProjectToggle) が DOM に居ないこと.
      // 起票カード内の他の <button> (「追加」 submit) は aria-label に「プロジェクト」を含まない.
      const buttons = Array.from(container.querySelectorAll("button"));
      const projectButtons = buttons.filter((b) =>
        (b.getAttribute("aria-label") ?? "").includes("プロジェクト"),
      );
      expect(
        projectButtons,
        `ProjectToggle 由来の button が残存している (REQ-5 違反 / 実際: ${projectButtons.map((b) => b.getAttribute("aria-label")).join(", ")})`,
      ).toHaveLength(0);
    });

    it("起票フォーム scope 内に .project-toggle__button クラスを持つ要素が存在しない (REQ-5 / 内部 class 名)", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      expect(container.querySelector(".project-toggle__button")).toBeNull();
      // wrapper の .project-toggle / [data-project-toggle] も存在しない.
      expect(container.querySelector(".project-toggle")).toBeNull();
      expect(container.querySelector("[data-project-toggle]")).toBeNull();
    });
  });

  // ============================================================
  // AC-2: <option> 群が「プロジェクトなし」 + projects 配列を順に含む
  // ============================================================
  /**
   * シナリオ AC-2:
   *   Given projects = [{id:"p-1", name:"仕事"}, {id:"p-2", name:"個人"}] / projectId="" で
   *         TaskFormCard を描画する
   *   When  <select id="create-project"> の option を列挙する
   *   Then  1 番目の option の textContent は「プロジェクトなし」/ value は ""
   *    かつ 2 番目の option の textContent は「仕事」/ value は "p-1"
   *    かつ 3 番目の option の textContent は「個人」/ value は "p-2"
   *    かつ option の総数は 3
   */
  describe("AC-2: <option> 群が「プロジェクトなし」 + projects 配列を順に含む", () => {
    it("先頭の option は value='' / textContent='プロジェクトなし' (D-001 / U-1)", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const projects = [
        makeProject({ id: "p-1", name: "仕事" }),
        makeProject({ id: "p-2", name: "個人" }),
      ];
      const { container } = render(
        <TaskFormCard
          projects={projects}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = container.querySelector("select#create-project") as HTMLSelectElement | null;
      expect(select, "<select id='create-project'> が見つからない").not.toBeNull();
      const options = Array.from(select?.querySelectorAll("option") ?? []);
      expect(options[0]?.getAttribute("value")).toBe("");
      expect(options[0]?.textContent ?? "").toBe("プロジェクトなし");
    });

    it("2 番目以降の option は projects 配列の id / name を順に反映する (REQ-2)", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const projects = [
        makeProject({ id: "p-1", name: "仕事" }),
        makeProject({ id: "p-2", name: "個人" }),
      ];
      const { container } = render(
        <TaskFormCard
          projects={projects}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = container.querySelector("select#create-project") as HTMLSelectElement | null;
      const options = Array.from(select?.querySelectorAll("option") ?? []);
      expect(options[1]?.getAttribute("value")).toBe("p-1");
      expect(options[1]?.textContent ?? "").toBe("仕事");
      expect(options[2]?.getAttribute("value")).toBe("p-2");
      expect(options[2]?.textContent ?? "").toBe("個人");
    });

    it("option の総数は 「プロジェクトなし」 + projects.length (= 3) (REQ-2)", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const projects = [
        makeProject({ id: "p-1", name: "仕事" }),
        makeProject({ id: "p-2", name: "個人" }),
      ];
      const { container } = render(
        <TaskFormCard
          projects={projects}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = container.querySelector("select#create-project") as HTMLSelectElement | null;
      const options = Array.from(select?.querySelectorAll("option") ?? []);
      expect(options.length, `option の総数が 3 ではない (実際: ${options.length})`).toBe(3);
    });

    it("projects が空配列の場合, option は「プロジェクトなし」1 件のみ", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = container.querySelector("select#create-project") as HTMLSelectElement | null;
      const options = Array.from(select?.querySelectorAll("option") ?? []);
      expect(options.length).toBe(1);
      expect(options[0]?.getAttribute("value")).toBe("");
      expect(options[0]?.textContent ?? "").toBe("プロジェクトなし");
    });

    it("projectId='p-1' を渡すと select.value が 'p-1' になる (REQ-3 / 双方向 binding)", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const projects = [
        makeProject({ id: "p-1", name: "仕事" }),
        makeProject({ id: "p-2", name: "個人" }),
      ];
      const { container } = render(
        <TaskFormCard
          projects={projects}
          projectId="p-1"
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = container.querySelector("select#create-project") as HTMLSelectElement | null;
      expect(select?.value).toBe("p-1");
    });
  });

  // ============================================================
  // AC-3: select の onChange が onProjectIdChange に伝播する
  // ============================================================
  /**
   * シナリオ AC-3:
   *   Given projects=[{id:"p-1", name:"仕事"}] / projectId="" / onProjectIdChange=spy で
   *         TaskFormCard を描画する
   *   When  userEvent.selectOptions(select, "p-1") を実行する
   *   Then  onProjectIdChange が "p-1" で 1 回呼ばれる
   *   When  userEvent.selectOptions(select, "") を実行する
   *   Then  onProjectIdChange が "" で 1 回呼ばれる
   */
  describe("AC-3: <select> の onChange が onProjectIdChange に伝播する (REQ-3)", () => {
    it("userEvent.selectOptions で 'p-1' を選ぶと onProjectIdChange('p-1') が呼ばれる", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const projects = [makeProject({ id: "p-1", name: "仕事" })];
      const onProjectIdChange = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <TaskFormCard
          projects={projects}
          projectId=""
          onProjectIdChange={onProjectIdChange}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = container.querySelector("select#create-project") as HTMLSelectElement | null;
      expect(select, "<select id='create-project'> が見つからない").not.toBeNull();
      if (!select) return;

      await user.selectOptions(select, "p-1");
      expect(onProjectIdChange).toHaveBeenCalledTimes(1);
      expect(onProjectIdChange).toHaveBeenCalledWith("p-1");
    });

    it("userEvent.selectOptions で '' (プロジェクトなし) を選ぶと onProjectIdChange('') が呼ばれる", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const projects = [makeProject({ id: "p-1", name: "仕事" })];
      const onProjectIdChange = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <TaskFormCard
          projects={projects}
          projectId="p-1"
          onProjectIdChange={onProjectIdChange}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = container.querySelector("select#create-project") as HTMLSelectElement | null;
      expect(select, "<select id='create-project'> が見つからない").not.toBeNull();
      if (!select) return;

      await user.selectOptions(select, "");
      expect(onProjectIdChange).toHaveBeenCalledTimes(1);
      expect(onProjectIdChange).toHaveBeenCalledWith("");
    });

    it("getByLabelText('プロジェクト') 経由でも同じ <select> を取得し操作できる (a11y label 経路)", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const projects = [makeProject({ id: "p-1", name: "仕事" })];
      const onProjectIdChange = vi.fn();
      const user = userEvent.setup();
      render(
        <TaskFormCard
          projects={projects}
          projectId=""
          onProjectIdChange={onProjectIdChange}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
        />,
      );
      const select = screen.getByLabelText("プロジェクト") as HTMLSelectElement;
      expect(select.tagName.toLowerCase()).toBe("select");
      expect(select.id).toBe("create-project");

      await user.selectOptions(select, "p-1");
      expect(onProjectIdChange).toHaveBeenCalledWith("p-1");
    });
  });

  // ============================================================
  // AC-4: label は visually-hidden + htmlFor で関連付けられている
  // ============================================================
  /**
   * シナリオ AC-4:
   *   Given TaskFormCard を idPrefix="tomorrow-create" で描画する
   *   When  <select id="tomorrow-create-project"> を query する
   *   Then  その accessible name は「プロジェクト」である (label の htmlFor 経由)
   *    かつ label には class="visually-hidden" が付与されている
   */
  describe("AC-4: label は visually-hidden で a11y は htmlFor + id で関連付けられている (REQ-4)", () => {
    it("<label for='tomorrow-create-project'> に class='visually-hidden' が付与されている", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      const label = container.querySelector("label[for='tomorrow-create-project']");
      expect(label, "<label for='tomorrow-create-project'> が見つからない").not.toBeNull();
      expect(
        label?.classList.contains("visually-hidden"),
        "label に visually-hidden class が付与されていない (REQ-4 / D-002 違反)",
      ).toBe(true);
    });

    it("<label> のテキストは「プロジェクト」である (D-002 / U-3)", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      const label = container.querySelector("label[for='tomorrow-create-project']");
      expect(label?.textContent ?? "").toBe("プロジェクト");
    });

    it("getByLabelText('プロジェクト') で <select id='tomorrow-create-project'> が取得できる (htmlFor + id 関連付け)", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          idPrefix="tomorrow-create"
          inputId="tomorrow-task-name"
          formAriaLabel="明日のタスク起票フォーム"
        />,
      );
      const select = screen.getByLabelText("プロジェクト") as HTMLSelectElement;
      expect(select.tagName.toLowerCase()).toBe("select");
      expect(select.id).toBe("tomorrow-create-project");
    });
  });

  // ============================================================
  // AC-5: web/src/ui/project-toggle/ ディレクトリが存在しない (REQ-5)
  // ============================================================
  /**
   * シナリオ AC-5:
   *   Given 本 BL 完了後のリポジトリ
   *   When  web/src/ui/project-toggle/ を ls する
   *   Then  ディレクトリが存在しない (.tsx / .css / .test.tsx が全て撤去されている)
   */
  describe("AC-5: web/src/ui/project-toggle/ ディレクトリが存在しない (REQ-5)", () => {
    it("web/src/ui/project-toggle/ ディレクトリが存在しない", () => {
      expect(
        existsSync(projectToggleDir),
        "web/src/ui/project-toggle/ ディレクトリが残存している (REQ-5 違反)",
      ).toBe(false);
    });

    it("web/src/ui/project-toggle/project-toggle.tsx が存在しない", () => {
      expect(
        existsSync(projectToggleTsxPath),
        "project-toggle.tsx が残存している (REQ-5 違反)",
      ).toBe(false);
    });

    it("web/src/ui/project-toggle/project-toggle.css が存在しない", () => {
      expect(
        existsSync(projectToggleCssPath),
        "project-toggle.css が残存している (REQ-5 違反)",
      ).toBe(false);
    });

    it("web/src/ui/project-toggle/project-toggle.test.tsx が存在しない", () => {
      expect(
        existsSync(projectToggleTestPath),
        "project-toggle.test.tsx が残存している (REQ-5 違反)",
      ).toBe(false);
    });
  });

  // ============================================================
  // AC-6: task-form-card.tsx に ProjectToggle の import / 使用が残らない
  // ============================================================
  /**
   * シナリオ AC-6:
   *   Given 本 BL 完了後の web/src/ui/task-card/task-form-card.tsx
   *   When  ファイル内を `ProjectToggle` で grep する
   *   Then  ヒット 0 件である
   */
  describe("AC-6: task-form-card.tsx に ProjectToggle の import / 使用が残らない (REQ-5 / 5-2)", () => {
    it("task-form-card.tsx に 'ProjectToggle' 文字列が含まれない (symbol 参照 0 件)", () => {
      const tsx = readFileSync(taskFormCardTsxPath, "utf-8");
      expect(
        tsx,
        "task-form-card.tsx に ProjectToggle 参照が残存している (REQ-5 / 5-2 違反)",
      ).not.toContain("ProjectToggle");
    });

    it("task-form-card.tsx に '../project-toggle/' import が含まれない (パス参照 0 件)", () => {
      const tsx = readFileSync(taskFormCardTsxPath, "utf-8");
      expect(tsx).not.toMatch(/from\s+["']\.\.\/project-toggle\//);
    });

    it("task-form-card.tsx は新しい <select> + <option> の JSX を含む (置換確認)", () => {
      // 本 BL では task-form-card.tsx の中身が「<select id={`${idPrefix}-project`}>」を持つ
      // 形に置換される. 厳密な JSX 構文の正確性検査は DOM レンダ (AC-1 〜 AC-4) で別途
      // 担保するため, ここではソース文字列上に <select> と <option value=""> の併記が
      // 存在することのみをスポットチェックする (=「置換されたことの軽量な存在確認」).
      const tsx = readFileSync(taskFormCardTsxPath, "utf-8");
      expect(tsx, "task-form-card.tsx に <select> JSX が無い (REQ-1 違反)").toMatch(/<select\b/);
      expect(tsx, 'task-form-card.tsx に <option value=""> が無い (REQ-2 違反)').toMatch(
        /<option\s+value=["']{2}/,
      );
      expect(tsx, "task-form-card.tsx に「プロジェクトなし」リテラルが無い (D-001 違反)").toContain(
        "プロジェクトなし",
      );
    });
  });
});
