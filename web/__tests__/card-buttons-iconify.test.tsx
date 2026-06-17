// @vitest-environment jsdom

/**
 * カード系ボタンをアイコンに置換 + 起票カードのキャンセル右上化
 * (BL-114 / card-buttons-iconify) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/card-buttons-iconify/spec.md
 *   docs/developer/features/card-buttons-iconify/plan.md
 *
 * 本ファイルが検証する受け入れ基準 (AC との対応):
 *   AC-1 : TaskCard の 5 button (完了 / 削除 / 現在のタスクにする / 明日にする / 今日にする) が
 *          textContent 空 + SVG icon のみ + aria-label でラベルを保持する.
 *          → describe "AC-1".
 *   AC-2 : ProjectCard の「削除」 button が textContent 空 + SVG icon + aria-label="削除".
 *          → describe "AC-2".
 *   AC-3 : RoutineCard の「削除」 button が textContent 空 + SVG icon + aria-label="削除".
 *          → describe "AC-3".
 *   AC-4 : 3 起票カード (TaskFormCard / ProjectFormCard / RoutineFormCard) の
 *          actions 段から「キャンセル」テキスト button が撤去される.
 *          → describe "AC-4".
 *   AC-5 : 3 起票カード root 直下に右上「閉じる ✕」 button (aria-label="閉じる") が配置され,
 *          click で onCancel が呼ばれる.
 *          → describe "AC-5".
 *   AC-6 : 「閉じる ✕」 button が type="button" で誤 submit を発生させない.
 *          → describe "AC-6".
 *   AC-7 : 「追加」 submit button が Lucide Plus アイコン + aria-label="追加" を持ち
 *          form submit 経路が維持される.
 *          → describe "AC-7".
 *   AC-9 : (AC-8 の Escape 経路は floating-create-button.test.tsx で BL-104 として担保済み)
 *          「閉じる ✕」 click → onCancel 呼出経路を機械的に確認.
 *          → describe "AC-5" 内で兼ねる (DOM 上の click 経路).
 *   AC-10: 各 icon button の min-width / min-height が 44px 以上 (タッチ領域確保).
 *          jsdom + vitest `css: true` で `.card-action-button` ルールの CSS 直読み + クラス併用で検証.
 *          → describe "AC-10".
 *   AC-11: 子 SVG が aria-hidden="true" を持ち, button.aria-label が accessibleName を支配する.
 *          → describe "AC-11".
 *   AC-12: 既存 getByRole("button", { name: ... }) が aria-label 経由で hit する.
 *          → describe "AC-12".
 *   AC-CSS: 3 起票カード CSS で `.<card>-card--form` に position: relative,
 *          `.<card>-card__close` に position: absolute + top/right が宣言されている.
 *          共通クラス `.card-action-button` が min-width: 44px / min-height: 44px を持つ.
 *          → describe "AC-CSS".
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= 現行 task-card.tsx / task-form-card.tsx / project-card.tsx /
 *     project-form-card.tsx / routine-card.tsx / routine-form-card.tsx が
 *     テキスト button のまま, 各 .css に .card-action-button / .<card>-card__close /
 *     .<card>-card--form の position: relative 拡張が無い) では,
 *     AC-1 〜 AC-7 / AC-10 / AC-11 / AC-12 / AC-CSS が大半 red になる想定.
 *   - implementer が REQ-1 〜 REQ-13 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - DOM レンダ系: 動的 import + render + querySelector / getByRole で確認.
 *   - CSS 直読み: BL-059 と同じ readFileSync + extractRuleBody (P-005).
 *
 * vitest-environment:
 *   jsdom 必須 (DOM レンダ AC が大半). 1 ファイル全体を jsdom で動かす.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render } from "@testing-library/react";
import type { Task } from "@todica/domain/task";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Project } from "../src/repositories/project-repository.js";
import type { WebRoutine } from "../src/repositories/routine-repository.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

const taskCardCssPath = resolve(webSrcRoot, "ui/task-card/task-card.css");
const projectCardCssPath = resolve(webSrcRoot, "ui/project-card/project-card.css");
const routineCardCssPath = resolve(webSrcRoot, "ui/routine-card/routine-card.css");

const NOW = "2026-06-17T09:00:00.000Z";
const TASK_ID = "t1t1t1t1-t1t1-4t1t-8t1t-t1t1t1t1t1t1";
const PROJECT_ID = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const ROUTINE_ID = "r1r1r1r1-r1r1-4r1r-8r1r-r1r1r1r1r1r1";

// ============================================================
// CSS ルール本文の抽出ヘルパ (P-005 / BL-059 と同形)
// ============================================================

function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// テストフィクスチャ
// ============================================================

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    name: "牛乳",
    projectId: null,
    dueDate: "today",
    priority: "normal",
    origin: "manual",
    routineId: null,
    createdAt: NOW,
    updatedAt: NOW,
    trashedAt: null,
    trashedReason: null,
    version: 1,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: "仕事",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRoutine(overrides: Partial<WebRoutine> = {}): WebRoutine {
  return {
    id: ROUTINE_ID,
    name: "朝の運動",
    daysOfWeek: [1, 3, 5],
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// 動的 import ヘルパ (共通)
// ============================================================

type TaskCardModule = { TaskCard: ComponentType<Record<string, unknown>> };
type TaskFormCardModule = { TaskFormCard: ComponentType<Record<string, unknown>> };
type ProjectCardModule = { ProjectCard: ComponentType<Record<string, unknown>> };
type ProjectFormCardModule = { ProjectFormCard: ComponentType<Record<string, unknown>> };
type RoutineCardModule = { RoutineCard: ComponentType<Record<string, unknown>> };
type RoutineFormCardModule = { RoutineFormCard: ComponentType<Record<string, unknown>> };

async function importTaskCard(): Promise<TaskCardModule> {
  const path = "../src/ui/task-card/task-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as TaskCardModule;
}
async function importTaskFormCard(): Promise<TaskFormCardModule> {
  const path = "../src/ui/task-card/task-form-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as TaskFormCardModule;
}
async function importProjectCard(): Promise<ProjectCardModule> {
  const path = "../src/ui/project-card/project-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as ProjectCardModule;
}
async function importProjectFormCard(): Promise<ProjectFormCardModule> {
  const path = "../src/ui/project-card/project-form-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as ProjectFormCardModule;
}
async function importRoutineCard(): Promise<RoutineCardModule> {
  const path = "../src/ui/routine-card/routine-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as RoutineCardModule;
}
async function importRoutineFormCard(): Promise<RoutineFormCardModule> {
  const path = "../src/ui/routine-card/routine-form-card.js";
  return (await import(/* @vite-ignore */ path)) as unknown as RoutineFormCardModule;
}

// ============================================================
// 検証ヘルパ
// ============================================================

/**
 * button が「icon button」の形 (= textContent 空 + 子に <svg aria-hidden="true">) かを assert する.
 *
 * - textContent: SVG 内部に <title> や <desc> を入れない前提なので空文字 / ホワイトスペースのみ.
 * - 子 SVG: ちょうど 1 個存在し aria-hidden="true" を持つ.
 *
 * lucide-react は React コンポーネントとして 1 つの <svg> を出力する.
 * `aria-hidden="true"` は本 BL の実装で各 icon に明示的に付与する (NFR-1 / REQ-10).
 */
function assertIsIconButton(btn: Element | null | undefined, ariaLabel: string): void {
  expect(btn, `${ariaLabel} button が見つからない`).not.toBeNull();
  if (!btn) return;
  // textContent はトリム後に空である (アイコンは SVG のみ; テキストノードを持たない).
  const text = (btn.textContent ?? "").trim();
  expect(
    text,
    `${ariaLabel} button が textContent (= "${text}") を持っている (REQ-1 / アイコン化違反)`,
  ).toBe("");
  // 子に <svg aria-hidden="true"> がちょうど 1 個存在する.
  const svgs = btn.querySelectorAll("svg");
  expect(
    svgs.length,
    `${ariaLabel} button 配下の <svg> が 1 個ではない (実際: ${svgs.length})`,
  ).toBe(1);
  const svg = svgs[0];
  expect(
    svg?.getAttribute("aria-hidden"),
    `${ariaLabel} button 配下の <svg> に aria-hidden="true" が無い (REQ-10 / NFR-1 違反)`,
  ).toBe("true");
  // aria-label は button 自身に正しく付与されている.
  expect(
    btn.getAttribute("aria-label"),
    `${ariaLabel} button に aria-label="${ariaLabel}" が無い (REQ-8 違反)`,
  ).toBe(ariaLabel);
}

// ============================================================
// describe ブロック
// ============================================================

describe("カード系ボタンをアイコンに置換 + 起票カードのキャンセル右上化 (BL-114 / card-buttons-iconify)", () => {
  // ============================================================
  // AC-1: TaskCard の 5 button が icon 化される (REQ-1)
  // ============================================================
  /**
   * シナリオ AC-1 (spec.md AC-1 / REQ-1):
   *   Given <TaskCard showSetFocus actionSet="full" dueDateMode="today" ... /> を render する
   *   When  .task-card__actions 内の各 button (完了 / 削除 / 現在のタスクにする / 明日にする) を観察する
   *   Then  各 button が textContent 空 + SVG icon (aria-hidden=true) + aria-label を持つ
   *   (dueDateMode="tomorrow" のケースで「今日にする」も別 it で確認する)
   */
  describe("AC-1: TaskCard の 5 button が Lucide アイコンに置換される (REQ-1)", () => {
    it.each([
      "完了",
      "削除",
      "現在のタスクにする",
      "明日にする",
    ] as const)("TaskCard の「%s」 button が icon button 形式 (textContent 空 + svg[aria-hidden=true] + aria-label)", async (label) => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus
          actionSet="full"
          dueDateMode="today"
          onSetFocus={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const btn = container.querySelector(`button[aria-label="${label}"]`);
      assertIsIconButton(btn, label);
    });

    it('TaskCard (dueDateMode="tomorrow") の「今日にする」 button が icon button 形式', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ dueDate: "tomorrow", origin: "manual" })}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          actionSet="full"
          dueDateMode="tomorrow"
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const btn = container.querySelector('button[aria-label="今日にする"]');
      assertIsIconButton(btn, "今日にする");
    });
  });

  // ============================================================
  // AC-2: ProjectCard の「削除」 button が icon 化される (REQ-2)
  // ============================================================
  /**
   * シナリオ AC-2 (spec.md AC-2 / REQ-2):
   *   Given <ProjectCard project=... /> を render する
   *   When  .project-card__actions 内の button を観察する
   *   Then  accessibleName が「削除」の icon button が 1 個取得できる
   */
  describe("AC-2: ProjectCard の「削除」 button が Lucide アイコンに置換される (REQ-2)", () => {
    it("ProjectCard の「削除」 button が icon button 形式 (textContent 空 + svg[aria-hidden=true] + aria-label)", async () => {
      const { ProjectCard } = await importProjectCard();
      const { container } = render(
        <ProjectCard project={makeProject()} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const btn = container.querySelector('.project-card__actions button[aria-label="削除"]');
      assertIsIconButton(btn, "削除");
    });

    it("ProjectCard で aria-label='削除' の button が 1 個だけ存在する", async () => {
      const { ProjectCard } = await importProjectCard();
      const { container } = render(
        <ProjectCard project={makeProject()} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const btns = container.querySelectorAll('button[aria-label="削除"]');
      expect(
        btns.length,
        `ProjectCard 内の「削除」 button が 1 個ではない (実際: ${btns.length})`,
      ).toBe(1);
    });
  });

  // ============================================================
  // AC-3: RoutineCard の「削除」 button が icon 化される (REQ-3)
  // ============================================================
  /**
   * シナリオ AC-3 (spec.md AC-3 / REQ-3):
   *   Given <RoutineCard routine=... /> を render する
   *   When  .routine-card__actions 内の button を観察する
   *   Then  accessibleName が「削除」の icon button が 1 個取得できる
   */
  describe("AC-3: RoutineCard の「削除」 button が Lucide アイコンに置換される (REQ-3)", () => {
    it("RoutineCard の「削除」 button が icon button 形式 (textContent 空 + svg[aria-hidden=true] + aria-label)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const { container } = render(
        <RoutineCard
          routine={makeRoutine()}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const btn = container.querySelector('.routine-card__actions button[aria-label="削除"]');
      assertIsIconButton(btn, "削除");
    });

    it("RoutineCard で aria-label='削除' の button が 1 個だけ存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const { container } = render(
        <RoutineCard
          routine={makeRoutine()}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const btns = container.querySelectorAll('button[aria-label="削除"]');
      expect(
        btns.length,
        `RoutineCard 内の「削除」 button が 1 個ではない (実際: ${btns.length})`,
      ).toBe(1);
    });
  });

  // ============================================================
  // AC-4: 3 起票カードで「キャンセル」テキスト button が撤去される (REQ-4)
  // ============================================================
  /**
   * シナリオ AC-4 (spec.md AC-4 / REQ-4):
   *   Given <TaskFormCard /> / <ProjectFormCard /> / <RoutineFormCard /> をそれぞれ render する
   *   When  form 直下の button を全列挙する
   *   Then  textContent / accessibleName が「キャンセル」の button が 0 個である
   */
  describe("AC-4: 3 起票カード (Task / Project / Routine) で「キャンセル」テキスト button が撤去される (REQ-4)", () => {
    it("TaskFormCard に textContent / aria-label が「キャンセル」の button が存在しない", async () => {
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
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
          onCancel={() => {}}
        />,
      );
      const buttons = Array.from(container.querySelectorAll("button"));
      const textCancel = buttons.find((b) => (b.textContent ?? "").trim() === "キャンセル");
      const ariaCancel = buttons.find((b) => b.getAttribute("aria-label") === "キャンセル");
      expect(
        textCancel,
        "TaskFormCard に textContent「キャンセル」 button が残存 (REQ-4 違反)",
      ).toBeUndefined();
      expect(
        ariaCancel,
        "TaskFormCard に aria-label「キャンセル」 button が残存 (REQ-4 違反)",
      ).toBeUndefined();
    });

    it("ProjectFormCard に textContent / aria-label が「キャンセル」の button が存在しない", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          onCancel={() => {}}
        />,
      );
      const buttons = Array.from(container.querySelectorAll("button"));
      const textCancel = buttons.find((b) => (b.textContent ?? "").trim() === "キャンセル");
      const ariaCancel = buttons.find((b) => b.getAttribute("aria-label") === "キャンセル");
      expect(
        textCancel,
        "ProjectFormCard に textContent「キャンセル」 button が残存 (REQ-4 違反)",
      ).toBeUndefined();
      expect(
        ariaCancel,
        "ProjectFormCard に aria-label「キャンセル」 button が残存 (REQ-4 違反)",
      ).toBeUndefined();
    });

    it("RoutineFormCard に textContent / aria-label が「キャンセル」の button が存在しない", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          onCancel={() => {}}
        />,
      );
      const buttons = Array.from(container.querySelectorAll("button"));
      const textCancel = buttons.find((b) => (b.textContent ?? "").trim() === "キャンセル");
      const ariaCancel = buttons.find((b) => b.getAttribute("aria-label") === "キャンセル");
      expect(
        textCancel,
        "RoutineFormCard に textContent「キャンセル」 button が残存 (REQ-4 違反)",
      ).toBeUndefined();
      expect(
        ariaCancel,
        "RoutineFormCard に aria-label「キャンセル」 button が残存 (REQ-4 違反)",
      ).toBeUndefined();
    });
  });

  // ============================================================
  // AC-5: 起票カード root 右上に「閉じる ✕」 button が配置され click で onCancel が呼ばれる (REQ-5)
  // ============================================================
  /**
   * シナリオ AC-5 (spec.md AC-5 / REQ-5):
   *   Given <(Task|Project|Routine)FormCard onCancel={mock} /> を render する
   *   When  form root 直下に accessibleName「閉じる」の button が存在するか観察する
   *   Then  accessibleName「閉じる」の icon button が 1 個存在
   *    かつ click すると mock onCancel が 1 回呼ばれる
   *    かつ class に "<card>-card__close" を持つ (CSS 配置を当てるための hook)
   */
  describe("AC-5: 3 起票カード root 右上に「閉じる ✕」 button が配置される (REQ-5)", () => {
    it("TaskFormCard に accessibleName「閉じる」の icon button が 1 個存在し click で onCancel が呼ばれる", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const onCancel = vi.fn();
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={onSubmit}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
          onCancel={onCancel}
        />,
      );
      const btn = container.querySelector('button[aria-label="閉じる"]');
      assertIsIconButton(btn, "閉じる");
      expect(
        btn?.classList.contains("task-card__close"),
        "TaskFormCard の close button に class 'task-card__close' が無い (CSS hook 違反)",
      ).toBe(true);
      (btn as HTMLButtonElement).click();
      expect(
        onCancel,
        "TaskFormCard close button click で onCancel が呼ばれない",
      ).toHaveBeenCalledTimes(1);
    });

    it("ProjectFormCard に accessibleName「閉じる」の icon button が 1 個存在し click で onCancel が呼ばれる", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const onCancel = vi.fn();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          onCancel={onCancel}
        />,
      );
      const btn = container.querySelector('button[aria-label="閉じる"]');
      assertIsIconButton(btn, "閉じる");
      expect(
        btn?.classList.contains("project-card__close"),
        "ProjectFormCard の close button に class 'project-card__close' が無い (CSS hook 違反)",
      ).toBe(true);
      (btn as HTMLButtonElement).click();
      expect(
        onCancel,
        "ProjectFormCard close button click で onCancel が呼ばれない",
      ).toHaveBeenCalledTimes(1);
    });

    it("RoutineFormCard に accessibleName「閉じる」の icon button が 1 個存在し click で onCancel が呼ばれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onCancel = vi.fn();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          onCancel={onCancel}
        />,
      );
      const btn = container.querySelector('button[aria-label="閉じる"]');
      assertIsIconButton(btn, "閉じる");
      expect(
        btn?.classList.contains("routine-card__close"),
        "RoutineFormCard の close button に class 'routine-card__close' が無い (CSS hook 違反)",
      ).toBe(true);
      (btn as HTMLButtonElement).click();
      expect(
        onCancel,
        "RoutineFormCard close button click で onCancel が呼ばれない",
      ).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // AC-6: 「閉じる ✕」が type="button" で誤 submit を発生させない (REQ-11)
  // ============================================================
  /**
   * シナリオ AC-6 (spec.md AC-6 / REQ-11):
   *   Given <TaskFormCard onSubmit={mockSubmit} onCancel={mockCancel} /> を render する
   *   When  「閉じる」 button を click する
   *   Then  mockCancel が 1 回呼ばれ, mockSubmit が呼ばれない
   *   (= type="button" で誤 submit を発生させない)
   */
  describe("AC-6: 「閉じる ✕」が type='button' で誤 submit を発生させない (REQ-11)", () => {
    it("TaskFormCard 「閉じる」 button が type='button' で submit を発火しない", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const onCancel = vi.fn();
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name="新規"
          onNameChange={() => {}}
          onSubmit={onSubmit}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
          onCancel={onCancel}
        />,
      );
      const btn = container.querySelector(
        'button[aria-label="閉じる"]',
      ) as HTMLButtonElement | null;
      expect(btn, "「閉じる」 button が無い").not.toBeNull();
      expect(
        btn?.getAttribute("type"),
        "「閉じる」 button の type 属性が 'button' でない (REQ-11 違反)",
      ).toBe("button");
      btn?.click();
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(
        onSubmit,
        "「閉じる」 click で submit が発火した (REQ-11 違反)",
      ).not.toHaveBeenCalled();
    });

    it("ProjectFormCard 「閉じる」 button が type='button'", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const { container } = render(
        <ProjectFormCard
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          onCancel={() => {}}
        />,
      );
      const btn = container.querySelector('button[aria-label="閉じる"]');
      expect(btn?.getAttribute("type"), "ProjectFormCard 「閉じる」 type が 'button' でない").toBe(
        "button",
      );
    });

    it("RoutineFormCard 「閉じる」 button が type='button'", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          onCancel={() => {}}
        />,
      );
      const btn = container.querySelector('button[aria-label="閉じる"]');
      expect(btn?.getAttribute("type"), "RoutineFormCard 「閉じる」 type が 'button' でない").toBe(
        "button",
      );
    });
  });

  // ============================================================
  // AC-7: 「追加」 submit が icon に置換され submit 経路が維持される (REQ-6)
  // ============================================================
  /**
   * シナリオ AC-7 (spec.md AC-7 / REQ-6):
   *   Given <(Task|Project|Routine)FormCard onSubmit={mock} /> を render する
   *   When  form 直下から type="submit" の button を探す
   *   Then  該当 button の textContent が空 + aria-label「追加」 + 子 svg[aria-hidden=true]
   *    かつ submit すると mock が 1 回呼ばれる
   */
  describe("AC-7: 「追加」 submit button が Lucide Plus + aria-label='追加' に置換される (REQ-6)", () => {
    it("TaskFormCard の type='submit' button が icon 化され submit が呼ばれる", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      const { container } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name="新規"
          onNameChange={() => {}}
          onSubmit={onSubmit}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
          onCancel={() => {}}
        />,
      );
      const submit = container.querySelector('button[type="submit"]');
      assertIsIconButton(submit, "追加");
      const form = container.querySelector("form") as HTMLFormElement | null;
      expect(form).not.toBeNull();
      fireEvent.submit(form as HTMLFormElement);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("ProjectFormCard の type='submit' button が icon 化され submit が呼ばれる", async () => {
      const { ProjectFormCard } = await importProjectFormCard();
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      const { container } = render(
        <ProjectFormCard
          name="新規"
          onNameChange={() => {}}
          onSubmit={onSubmit}
          onCancel={() => {}}
        />,
      );
      const submit = container.querySelector('button[type="submit"]');
      assertIsIconButton(submit, "追加");
      const form = container.querySelector("form") as HTMLFormElement | null;
      fireEvent.submit(form as HTMLFormElement);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("RoutineFormCard の type='submit' button が icon 化され submit が呼ばれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      const { container } = render(
        <RoutineFormCard
          name="新規"
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={onSubmit}
          onCancel={() => {}}
        />,
      );
      const submit = container.querySelector('button[type="submit"]');
      assertIsIconButton(submit, "追加");
      const form = container.querySelector("form") as HTMLFormElement | null;
      fireEvent.submit(form as HTMLFormElement);
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // AC-10: 各 icon button のタッチ領域 (44 × 44 px) (REQ-9 / NFR-5)
  // ============================================================
  /**
   * シナリオ AC-10 (spec.md AC-10 / REQ-9 / NFR-5):
   *   Given 本 BL で置換した icon button (代表: TaskCard 削除 / 起票カード 閉じる / 起票カード 追加)
   *         を render する
   *   When  button の className に "card-action-button" が含まれることを確認し,
   *         さらに .card-action-button ルール本文に min-width: 44px / min-height: 44px があるか
   *         CSS を直読みで検証する
   *   Then  button が "card-action-button" を持ち, 3 系統 CSS のいずれにも
   *        .card-action-button { min-width: 44px; min-height: 44px } が宣言されている
   *
   *   jsdom は layout 計算しないため getBoundingClientRect は使えない (D-008 リスク R-2).
   *   className + CSS 直読みの組合せで間接的にタッチ領域確保を担保する.
   */
  describe("AC-10: 各 icon button のタッチ領域が 44 × 44 px 以上 (REQ-9 / NFR-5)", () => {
    it("TaskCard 「削除」 button に className 'card-action-button' が付与されている", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const btn = container.querySelector('button[aria-label="削除"]');
      expect(btn, "TaskCard 削除 button が無い").not.toBeNull();
      expect(
        btn?.classList.contains("card-action-button"),
        "TaskCard 削除 button に 'card-action-button' が無い (NFR-5 違反 / タッチ領域 hook なし)",
      ).toBe(true);
    });

    it("TaskFormCard 「閉じる」 button に className 'card-action-button' が付与されている", async () => {
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
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
          onCancel={() => {}}
        />,
      );
      const btn = container.querySelector('button[aria-label="閉じる"]');
      expect(btn, "TaskFormCard 閉じる button が無い").not.toBeNull();
      expect(
        btn?.classList.contains("card-action-button"),
        "TaskFormCard 閉じる button に 'card-action-button' が無い (NFR-5 違反)",
      ).toBe(true);
    });

    it("TaskFormCard 「追加」 submit button に className 'card-action-button' が付与されている", async () => {
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
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
          onCancel={() => {}}
        />,
      );
      const submit = container.querySelector('button[type="submit"]');
      expect(submit, "TaskFormCard 追加 button が無い").not.toBeNull();
      expect(
        submit?.classList.contains("card-action-button"),
        "TaskFormCard 追加 button に 'card-action-button' が無い (NFR-5 違反)",
      ).toBe(true);
    });

    it.each([
      ["task-card.css", taskCardCssPath],
      ["project-card.css", projectCardCssPath],
      ["routine-card.css", routineCardCssPath],
    ])("%s に .card-action-button { min-width: 44px; min-height: 44px } が宣言されている (D-004 / NFR-5)", (_label, cssPath) => {
      const css = readFileSync(cssPath, "utf-8");
      const body = extractRuleBody(css, ".card-action-button");
      expect(body, `${_label} に .card-action-button ルールが無い (D-004 違反)`).not.toBeNull();
      const bodyText = body ?? "";
      expect(
        bodyText,
        `${_label} の .card-action-button に min-width: 44px が無い (NFR-5 違反)`,
      ).toMatch(/min-width\s*:\s*44px/);
      expect(
        bodyText,
        `${_label} の .card-action-button に min-height: 44px が無い (NFR-5 違反)`,
      ).toMatch(/min-height\s*:\s*44px/);
    });
  });

  // ============================================================
  // AC-11: SVG が aria-hidden="true" を持ち accessibleName を汚染しない (REQ-10)
  // ============================================================
  /**
   * シナリオ AC-11 (spec.md AC-11 / REQ-10):
   *   Given 本 BL で置換した任意の icon button を render する
   *   When  button 配下の svg 要素を観察する
   *   Then  svg が aria-hidden="true" を持つ
   *    かつ button.aria-label が accessibleName を支配する (= svg 内のテキストを引かない)
   */
  describe("AC-11: SVG が aria-hidden='true' を持ち accessibleName を汚染しない (REQ-10)", () => {
    it("TaskCard 削除 button の svg が aria-hidden='true' を持つ", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const svg = container.querySelector('button[aria-label="削除"] svg');
      expect(svg, "TaskCard 削除 button 配下に svg が無い").not.toBeNull();
      expect(
        svg?.getAttribute("aria-hidden"),
        "TaskCard 削除 button svg に aria-hidden='true' が無い (REQ-10 違反)",
      ).toBe("true");
    });
  });

  // ============================================================
  // AC-12: 既存 getByRole("button", { name: ... }) が aria-label 経由で hit する (REQ-12)
  // ============================================================
  /**
   * シナリオ AC-12 (spec.md AC-12 / REQ-12):
   *   Given 本 BL 改修後の各カードを render する
   *   When  getByRole("button", { name: "削除" }) 等を実行する
   *   Then  対応する icon button が hit する (= aria-label 経由で accessibleName が解決される)
   */
  describe("AC-12: 既存 getByRole 系のクエリが aria-label 経由で透過的に通る (REQ-12)", () => {
    it("TaskCard で getByRole('button', { name: '削除' }) が icon button を返す", async () => {
      const { TaskCard } = await importTaskCard();
      const { getByRole } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
          onNameBlur={() => {}}
        />,
      );
      const btn = getByRole("button", { name: "削除" });
      expect(btn, "getByRole で削除 button が hit しない (REQ-12 違反)").toBeDefined();
      expect(btn.querySelector("svg"), "削除 button が icon button でない").not.toBeNull();
    });

    it("ProjectCard で getByRole('button', { name: '削除' }) が icon button を返す", async () => {
      const { ProjectCard } = await importProjectCard();
      const { getByRole } = render(
        <ProjectCard project={makeProject()} onNameBlur={() => {}} onDelete={() => {}} />,
      );
      const btn = getByRole("button", { name: "削除" });
      expect(btn).toBeDefined();
      expect(btn.querySelector("svg")).not.toBeNull();
    });

    it("RoutineCard で getByRole('button', { name: '削除' }) が icon button を返す", async () => {
      const { RoutineCard } = await importRoutineCard();
      const { getByRole } = render(
        <RoutineCard
          routine={makeRoutine()}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const btn = getByRole("button", { name: "削除" });
      expect(btn).toBeDefined();
      expect(btn.querySelector("svg")).not.toBeNull();
    });

    it("TaskFormCard で getByRole('button', { name: '閉じる' }) / { name: '追加' } が hit する", async () => {
      const { TaskFormCard } = await importTaskFormCard();
      const { getByRole } = render(
        <TaskFormCard
          projects={[]}
          projectId=""
          onProjectIdChange={() => {}}
          priority="normal"
          onPriorityChange={() => {}}
          name=""
          onNameChange={() => {}}
          onSubmit={(e: React.FormEvent) => e.preventDefault()}
          idPrefix="create"
          inputId="task-name"
          formAriaLabel="タスク起票フォーム"
          onCancel={() => {}}
        />,
      );
      expect(getByRole("button", { name: "閉じる" })).toBeDefined();
      expect(getByRole("button", { name: "追加" })).toBeDefined();
    });
  });

  // ============================================================
  // AC-CSS: 起票カード root に position: relative + 右上 close button 配置 (D-005)
  // ============================================================
  /**
   * シナリオ AC-CSS (plan.md D-005):
   *   Given 3 系統 CSS (task-card.css / project-card.css / routine-card.css) を読む
   *   When  各 `.<card>-card--form` および `.<card>-card__close` ルール本文を観察する
   *   Then  `.<card>-card--form` に position: relative
   *    かつ `.<card>-card__close` に position: absolute + top: var(--space-sm) + right: var(--space-sm)
   */
  describe("AC-CSS: 起票カード root に position: relative + 右上 close button 配置 (D-005)", () => {
    it.each([
      ["task-card.css", taskCardCssPath, ".task-card--form", ".task-card__close"],
      ["project-card.css", projectCardCssPath, ".project-card--form", ".project-card__close"],
      ["routine-card.css", routineCardCssPath, ".routine-card--form", ".routine-card__close"],
    ])("%s の %s に position: relative が宣言されている (D-005)", (_label, cssPath, formSelector) => {
      const css = readFileSync(cssPath, "utf-8");
      const body = extractRuleBody(css, formSelector);
      expect(body, `${_label} に ${formSelector} ルールが無い (D-005 違反)`).not.toBeNull();
      expect(
        body ?? "",
        `${_label} の ${formSelector} に position: relative が無い (D-005 違反 / 右上 close button の起点)`,
      ).toMatch(/(?:^|;|\n)\s*position\s*:\s*relative/);
    });

    it.each([
      ["task-card.css", taskCardCssPath, ".task-card__close"],
      ["project-card.css", projectCardCssPath, ".project-card__close"],
      ["routine-card.css", routineCardCssPath, ".routine-card__close"],
    ])("%s の %s に position: absolute + top: var(--space-sm) + right: var(--space-sm) が宣言されている (D-005)", (_label, cssPath, closeSelector) => {
      const css = readFileSync(cssPath, "utf-8");
      const body = extractRuleBody(css, closeSelector);
      expect(body, `${_label} に ${closeSelector} ルールが無い (D-005 違反)`).not.toBeNull();
      const bodyText = body ?? "";
      expect(
        bodyText,
        `${_label} の ${closeSelector} に position: absolute が無い (D-005 違反)`,
      ).toMatch(/(?:^|;|\n)\s*position\s*:\s*absolute/);
      expect(
        bodyText,
        `${_label} の ${closeSelector} に top: var(--space-sm) が無い (D-005 違反)`,
      ).toMatch(/(?:^|;|\n)\s*top\s*:\s*var\(--space-sm\)/);
      expect(
        bodyText,
        `${_label} の ${closeSelector} に right: var(--space-sm) が無い (D-005 違反)`,
      ).toMatch(/(?:^|;|\n)\s*right\s*:\s*var\(--space-sm\)/);
    });
  });
});
