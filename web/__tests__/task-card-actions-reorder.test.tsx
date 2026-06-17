// @vitest-environment jsdom

/**
 * TaskCard actions の DOM 順を「削除 → 現在のタスクにする → 明日にする / 今日にする → 完了」へ変更
 * (BL-064 / task-card-actions-reorder) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/task-card-actions-reorder/spec.md
 *   docs/developer/features/task-card-actions-reorder/plan.md
 *   docs/developer/features/task-card-actions-reorder/tasks.md
 *
 * 本ファイルが検証する受け入れ基準 (spec AC-1 〜 AC-15):
 *   AC-1 : actionSet="full" + showSetFocus + manual origin + dueDateMode="today" で
 *          DOM 順「削除 → 現在のタスクにする → 明日にする → 完了」(4 ボタン) (DOM レンダ).
 *   AC-2 : 削除 button が DOM 順最先頭 + className "task-card__actions__delete" (DOM).
 *   AC-3 : 完了 button が DOM 順最末尾 + className "task-card__actions__complete" (DOM).
 *   AC-4 : 「現在のタスクにする」 button が削除と「明日にする」の間 (DOM index 関係).
 *   AC-5 : dueDateMode="tomorrow" で「今日にする」が「現在のタスクにする」と「完了」の間 (DOM).
 *   AC-6 : showSetFocus=false + actionSet="full" で「削除 → 明日にする → 完了」(3 ボタン) (DOM).
 *   AC-7 : task.origin="routine" + showSetFocus=true で「削除 → 現在のタスクにする → 完了」
 *          (3 ボタン / 明日にする・今日にする 不在) (DOM).
 *   AC-8 : actionSet="minimal" (focus-view) で「削除 → 完了」(2 ボタン) + 各 className 維持 (DOM).
 *   AC-9 : 削除 button が .task-card__actions__delete を持ち DOM 順 index=0 (AC-2 と重複担保).
 *   AC-10: 完了 button が .task-card__actions__complete を持ち DOM 順 末尾 (AC-3 と重複担保).
 *   AC-11: BL-063 D-002 不変項 (.task-card__actions__delete に margin-right: auto) が CSS に残存.
 *   AC-12: BL-063 D-002 不変項 (.task-card__actions__complete に margin-left: auto) が CSS に残存.
 *   AC-13: BL-063 D-005 不変項 (.task-card--form .task-card__actions に justify-content: flex-end)
 *          が CSS に残存.
 *   AC-14: BL-063 AC-4 不変項 (.task-card__actions ルール本文に justify-content: center が無い)
 *          が CSS で維持.
 *   AC-15: a11y は本 BL では新規 violation を起こさない想定. accessibleName / role は変化しないため
 *          DOM 順入れ替えで違反は出ない (= e2e/a11y.spec.ts 側で担保. 本ファイルでは個別 assert しない).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= web/src/ui/task-card/task-card.tsx の JSX 順序が
 *     「現在のタスクにする → 削除 → 明日にする → 完了」のまま) では
 *     AC-1 〜 AC-8 の DOM 順 assert が red になる想定.
 *   - CSS 直読み系 (AC-11 / AC-12 / AC-13 / AC-14) は BL-063 で既に成立しており green 期待.
 *   - 実装者が REQ-1 (JSX 内 button 順序の入れ替え) を行うことで red 群が green 化する.
 *
 * 検証スタイル:
 *   - DOM レンダ: BL-059 / BL-063 と同じ @testing-library/react + jsdom + 動的 import パターン.
 *   - `.task-card__actions` 配下の button を `querySelectorAll("button")` で取得して
 *     index と textContent / className を assert.
 *   - extractRuleBody は CSS 直読み系 (AC-11 〜 AC-14) で再利用する.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "@testing-library/react";
import type { Task } from "@todica/domain/task";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";

import type { Project } from "../src/repositories/project-repository.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");
const taskCardCssPath = resolve(webSrcRoot, "ui/task-card/task-card.css");

const NOW = "2026-06-12T09:00:00.000Z";
const PROJECT_ID_P1 = "p1p1p1p1-p1p1-4p1p-8p1p-p1p1p1p1p1p1";
const PROJECT_NAME_P1 = "プロジェクトα";

// ============================================================
// CSS ルール本文の抽出ヘルパ (BL-052 / BL-059 / BL-063 と同形 / P-005)
// ============================================================

/**
 * 指定したセレクタの「ルール本文 (= {} で囲まれた中身)」を抽出する.
 *
 * セレクタの直後が空白 + `{` であるルールに限定する (= prefix 一致による誤検知を防ぐ).
 * BL-063 task-card-hotfix.test.tsx のヘルパと同等実装の再定義 (P-005).
 */
function extractRuleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  return m?.[1] ?? null;
}

// ============================================================
// テストファクトリ
// ============================================================

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
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
    id: PROJECT_ID_P1,
    name: PROJECT_NAME_P1,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// 動的 import ヘルパ
// ============================================================

type TaskCardModule = { TaskCard: ComponentType<Record<string, unknown>> };

async function importTaskCard(): Promise<TaskCardModule> {
  const path = "../src/ui/task-card/task-card.js";
  return (await import(/* @vite-ignore */ path)) as TaskCardModule;
}

// ============================================================
// アクション button DOM 順取得ユーティリティ
// ============================================================

/**
 * `.task-card__actions` の直下 button 群を DOM 順で取得する.
 * 各要素について `textContent` / `classList` をペアで取れる形に整形する.
 */
function readActionButtons(container: HTMLElement): {
  text: string;
  classes: string[];
  element: HTMLButtonElement;
}[] {
  const actions = container.querySelector(".task-card__actions");
  if (!actions) return [];
  const buttons = Array.from(actions.querySelectorAll("button")) as HTMLButtonElement[];
  return buttons.map((b) => ({
    // BL-114: button の text は SVG icon 化に伴い textContent から aria-label に移った.
    // aria-label 優先 + 旧 textContent fallback で textLabel 検査の互換を維持する.
    text: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim(),
    classes: Array.from(b.classList),
    element: b,
  }));
}

// ============================================================
// describe ブロック
// ============================================================

describe("TaskCard actions DOM 順入れ替え (BL-064 / task-card-actions-reorder)", () => {
  // ============================================================
  // DOM レンダ系 (AC-1 〜 AC-10)
  // ============================================================

  // ----------------------------------------------------------
  // AC-1: actionSet="full" + showSetFocus + manual + dueDateMode="today" で
  //       DOM 順「削除 → 現在のタスクにする → 明日にする → 完了」(4 ボタン)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1 (spec.md AC-1 / REQ-1 / G-1):
   *   Given <TaskCard actionSet="full" showSetFocus={true} dueDateMode="today"
   *         task={origin: "manual"} ... /> を render する
   *   When  .task-card__actions の直下 button 群を DOM 順で取得する
   *   Then  button[0].textContent に「削除」を含む
   *    かつ button[1].textContent に「現在のタスクにする」を含む
   *    かつ button[2].textContent に「明日にする」を含む
   *    かつ button[3].textContent に「完了」を含む
   *    かつ button の総数は 4 である
   */
  describe("AC-1: full + showSetFocus + manual + today で 4 ボタンが「削除 → 現在のタスクにする → 明日にする → 完了」", () => {
    it('.task-card__actions の button 順が ["削除", "現在のタスクにする", "明日にする", "完了"] になる', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={makeProject()}
          projects={[]}
          onChangeProject={() => {}}
          showPriority
          showSetFocus
          actionSet="full"
          dueDateMode="today"
          onSetPriority={() => {}}
          onSetFocus={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = readActionButtons(container);
      expect(buttons.length, `button 総数が 4 でない (実際: ${buttons.length})`).toBe(4);
      expect(buttons[0]?.text, "index=0 が「削除」でない").toContain("削除");
      expect(buttons[1]?.text, "index=1 が「現在のタスクにする」でない").toContain(
        "現在のタスクにする",
      );
      expect(buttons[2]?.text, "index=2 が「明日にする」でない").toContain("明日にする");
      expect(buttons[3]?.text, "index=3 が「完了」でない").toContain("完了");
    });
  });

  // ----------------------------------------------------------
  // AC-2: 削除 button が DOM 順最先頭 + className "task-card__actions__delete"
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2 (spec.md AC-2 / REQ-1 / G-2):
   *   Given <TaskCard actionSet="full" showSetFocus={true} ... /> を render する
   *   When  .task-card__actions の直下 button 群を DOM 順で取得する
   *   Then  index=0 の button が className "task-card__actions__delete" を持つ
   *    かつ index=0 の button の textContent に「削除」を含む
   */
  describe("AC-2: 削除 button が DOM 順最先頭 + className task-card__actions__delete", () => {
    it("index=0 の button が「削除」かつ task-card__actions__delete を持つ", async () => {
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
        />,
      );
      const buttons = readActionButtons(container);
      expect(buttons.length).toBeGreaterThan(0);
      expect(buttons[0]?.text, "index=0 button が「削除」でない").toContain("削除");
      expect(
        buttons[0]?.classes.includes("task-card__actions__delete"),
        "index=0 button に task-card__actions__delete className が無い",
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-3: 完了 button が DOM 順最末尾 + className "task-card__actions__complete"
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3 (spec.md AC-3 / REQ-1 / G-3):
   *   Given <TaskCard actionSet="full" showSetFocus={true} ... /> を render する
   *   When  .task-card__actions の直下 button 群を DOM 順で取得する
   *   Then  最後の button が className "task-card__actions__complete" を持つ
   *    かつ 最後の button の textContent に「完了」を含む
   */
  describe("AC-3: 完了 button が DOM 順最末尾 + className task-card__actions__complete", () => {
    it("末尾 button が「完了」かつ task-card__actions__complete を持つ", async () => {
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
        />,
      );
      const buttons = readActionButtons(container);
      expect(buttons.length).toBeGreaterThan(0);
      const last = buttons[buttons.length - 1];
      expect(last?.text, "末尾 button が「完了」でない").toContain("完了");
      expect(
        last?.classes.includes("task-card__actions__complete"),
        "末尾 button に task-card__actions__complete className が無い",
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-4: 「現在のタスクにする」 button が削除と「明日にする」の間 (DOM index 関係)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4 (spec.md AC-4 / REQ-1 / G-4):
   *   Given <TaskCard actionSet="full" showSetFocus={true} dueDateMode="today"
   *         task={origin: "manual"} ... /> を render する
   *   When  .task-card__actions の直下 button 群を DOM 順で取得する
   *   Then  「現在のタスクにする」 button の DOM index は「削除」 button の DOM index より大きい
   *    かつ 「現在のタスクにする」 button の DOM index は「明日にする」 button の DOM index より小さい
   */
  describe("AC-4: 「現在のタスクにする」 button が削除と「明日にする」の間", () => {
    it("「現在のタスクにする」の DOM index が「削除」と「明日にする」の間にある", async () => {
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
        />,
      );
      const buttons = readActionButtons(container);
      const idxDelete = buttons.findIndex((b) => b.text.includes("削除"));
      const idxSetFocus = buttons.findIndex((b) => b.text.includes("現在のタスクにする"));
      const idxTomorrow = buttons.findIndex((b) => b.text.includes("明日にする"));
      expect(idxDelete, "「削除」 button が見つからない").toBeGreaterThanOrEqual(0);
      expect(idxSetFocus, "「現在のタスクにする」 button が見つからない").toBeGreaterThanOrEqual(0);
      expect(idxTomorrow, "「明日にする」 button が見つからない").toBeGreaterThanOrEqual(0);
      expect(
        idxSetFocus > idxDelete,
        `「現在のタスクにする」(${idxSetFocus}) が「削除」(${idxDelete}) より前にある`,
      ).toBe(true);
      expect(
        idxSetFocus < idxTomorrow,
        `「現在のタスクにする」(${idxSetFocus}) が「明日にする」(${idxTomorrow}) より後にある`,
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-5: dueDateMode="tomorrow" で 4 ボタンが「削除 → 現在のタスクにする → 今日にする → 完了」
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5 (spec.md AC-5 / REQ-1):
   *   Given <TaskCard actionSet="full" showSetFocus={true} dueDateMode="tomorrow"
   *         task={origin: "manual"} ... /> を render する
   *   When  .task-card__actions の直下 button 群を DOM 順で取得する
   *   Then  button[0].textContent に「削除」を含む
   *    かつ button[1].textContent に「現在のタスクにする」を含む
   *    かつ button[2].textContent に「今日にする」を含む
   *    かつ button[3].textContent に「完了」を含む
   *    かつ 「明日にする」 button は存在しない
   */
  describe("AC-5: dueDateMode='tomorrow' で 4 ボタンが「削除 → 現在のタスクにする → 今日にする → 完了」", () => {
    it('.task-card__actions の button 順が ["削除", "現在のタスクにする", "今日にする", "完了"] になる', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual", dueDate: "tomorrow" })}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus
          actionSet="full"
          dueDateMode="tomorrow"
          onSetFocus={() => {}}
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = readActionButtons(container);
      const labels = buttons.map((b) => b.text);
      expect(buttons.length, `button 総数が 4 でない (実際: ${buttons.length})`).toBe(4);
      expect(buttons[0]?.text, "index=0 が「削除」でない").toContain("削除");
      expect(buttons[1]?.text, "index=1 が「現在のタスクにする」でない").toContain(
        "現在のタスクにする",
      );
      expect(buttons[2]?.text, "index=2 が「今日にする」でない").toContain("今日にする");
      expect(buttons[3]?.text, "index=3 が「完了」でない").toContain("完了");
      expect(
        labels.some((t) => t.includes("明日にする")),
        "「明日にする」 button が誤って存在",
      ).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-6: showSetFocus=false + actionSet="full" で「削除 → 明日にする → 完了」(3 ボタン)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6 (spec.md AC-6 / REQ-1):
   *   Given <TaskCard actionSet="full" showSetFocus={false} dueDateMode="today"
   *         task={origin: "manual"} ... /> を render する
   *   When  .task-card__actions の直下 button 群を DOM 順で取得する
   *   Then  button[0].textContent に「削除」を含む
   *    かつ button[1].textContent に「明日にする」を含む
   *    かつ button[2].textContent に「完了」を含む
   *    かつ 「現在のタスクにする」 button は存在しない
   *    かつ button の総数は 3 である
   */
  describe("AC-6: showSetFocus=false + full で 3 ボタンが「削除 → 明日にする → 完了」", () => {
    it('.task-card__actions の button 順が ["削除", "明日にする", "完了"] になる', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus={false}
          actionSet="full"
          dueDateMode="today"
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = readActionButtons(container);
      const labels = buttons.map((b) => b.text);
      expect(buttons.length, `button 総数が 3 でない (実際: ${buttons.length})`).toBe(3);
      expect(buttons[0]?.text, "index=0 が「削除」でない").toContain("削除");
      expect(buttons[1]?.text, "index=1 が「明日にする」でない").toContain("明日にする");
      expect(buttons[2]?.text, "index=2 が「完了」でない").toContain("完了");
      expect(
        labels.some((t) => t.includes("現在のタスクにする")),
        "「現在のタスクにする」 button が誤って存在",
      ).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-7: task.origin="routine" + actionSet="full" + showSetFocus=true で
  //       「削除 → 現在のタスクにする → 完了」(3 ボタン / 期限切替 button 不在)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7 (spec.md AC-7 / REQ-1 / BL-042 不変):
   *   Given <TaskCard actionSet="full" showSetFocus={true} task={origin: "routine"} ... /> を render する
   *   When  .task-card__actions の直下 button 群を DOM 順で取得する
   *   Then  button[0].textContent に「削除」を含む
   *    かつ button[1].textContent に「現在のタスクにする」を含む
   *    かつ button[2].textContent に「完了」を含む
   *    かつ 「明日にする」「今日にする」 button は存在しない
   *    かつ button の総数は 3 である
   */
  describe("AC-7: routine origin + full + showSetFocus で 3 ボタンが「削除 → 現在のタスクにする → 完了」", () => {
    it('.task-card__actions の button 順が ["削除", "現在のタスクにする", "完了"] になる', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "routine", routineId: "routine-1" })}
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
        />,
      );
      const buttons = readActionButtons(container);
      const labels = buttons.map((b) => b.text);
      expect(buttons.length, `button 総数が 3 でない (実際: ${buttons.length})`).toBe(3);
      expect(buttons[0]?.text, "index=0 が「削除」でない").toContain("削除");
      expect(buttons[1]?.text, "index=1 が「現在のタスクにする」でない").toContain(
        "現在のタスクにする",
      );
      expect(buttons[2]?.text, "index=2 が「完了」でない").toContain("完了");
      expect(
        labels.some((t) => t.includes("明日にする")),
        "「明日にする」 button が誤って存在 (routine origin で出てはならない)",
      ).toBe(false);
      expect(
        labels.some((t) => t.includes("今日にする")),
        "「今日にする」 button が誤って存在 (routine origin で出てはならない)",
      ).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-8: actionSet="minimal" (focus-view) で「削除 → 完了」(2 ボタン) + 各 className 維持
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8 (spec.md AC-8 / REQ-5 / G-8 / D-005):
   *   Given <TaskCard actionSet="minimal" showSetFocus={false} ... /> を render する
   *   When  .task-card__actions の直下 button 群を DOM 順で取得する
   *   Then  button[0].textContent に「削除」を含む
   *    かつ button[0] の className に "task-card__actions__delete" を含む
   *    かつ button[1].textContent に「完了」を含む
   *    かつ button[1] の className に "task-card__actions__complete" を含む
   *    かつ 「明日にする」「今日にする」「現在のタスクにする」 button は存在しない
   *    かつ button の総数は 2 である
   */
  describe("AC-8: minimal (focus-view) で 2 ボタンが「削除 → 完了」 + 各 className 維持", () => {
    it('.task-card__actions の button 順が ["削除", "完了"] になり各 hotfix className を持つ', async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = readActionButtons(container);
      const labels = buttons.map((b) => b.text);
      expect(buttons.length, `button 総数が 2 でない (実際: ${buttons.length})`).toBe(2);

      expect(buttons[0]?.text, "index=0 が「削除」でない").toContain("削除");
      expect(
        buttons[0]?.classes.includes("task-card__actions__delete"),
        "index=0 button に task-card__actions__delete が無い",
      ).toBe(true);

      expect(buttons[1]?.text, "index=1 が「完了」でない").toContain("完了");
      expect(
        buttons[1]?.classes.includes("task-card__actions__complete"),
        "index=1 button に task-card__actions__complete が無い",
      ).toBe(true);

      expect(
        labels.some((t) => t.includes("明日にする")),
        "minimal に「明日にする」 button が誤って存在",
      ).toBe(false);
      expect(
        labels.some((t) => t.includes("今日にする")),
        "minimal に「今日にする」 button が誤って存在",
      ).toBe(false);
      expect(
        labels.some((t) => t.includes("現在のタスクにする")),
        "minimal に「現在のタスクにする」 button が誤って存在",
      ).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-9: 削除 button が DOM 順 index=0 + className "task-card__actions__delete" (full 構成での重複担保)
  // ----------------------------------------------------------
  /**
   * spec.md G-2 (= AC-9 相当). AC-2 と内容が重なるが,
   * 「full 構成 + showSetFocus=false (= 3 ボタン)」と「minimal 構成 (= 2 ボタン)」でも
   * 共通して index=0 が削除であることを担保する.
   */
  describe("AC-9: 削除 button が full / minimal いずれでも DOM 順 index=0 で className を持つ", () => {
    it("full (3 ボタン: showSetFocus=false) でも index=0 が削除 + className", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus={false}
          actionSet="full"
          dueDateMode="today"
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = readActionButtons(container);
      expect(buttons[0]?.text).toContain("削除");
      expect(buttons[0]?.classes.includes("task-card__actions__delete")).toBe(true);
    });

    it("minimal (2 ボタン) でも index=0 が削除 + className", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = readActionButtons(container);
      expect(buttons[0]?.text).toContain("削除");
      expect(buttons[0]?.classes.includes("task-card__actions__delete")).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-10: 完了 button が DOM 順末尾 + className "task-card__actions__complete" (重複担保)
  // ----------------------------------------------------------
  /**
   * spec.md G-3 (= AC-10 相当). AC-3 と内容が重なるが,
   * 「full 構成 + showSetFocus=false (= 3 ボタン)」と「minimal 構成 (= 2 ボタン)」でも
   * 共通して末尾が完了であることを担保する.
   */
  describe("AC-10: 完了 button が full / minimal いずれでも DOM 順末尾で className を持つ", () => {
    it("full (3 ボタン: showSetFocus=false) でも末尾が完了 + className", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask({ origin: "manual" })}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus={false}
          actionSet="full"
          dueDateMode="today"
          onDelete={() => {}}
          onToggleDueDate={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = readActionButtons(container);
      const last = buttons[buttons.length - 1];
      expect(last?.text).toContain("完了");
      expect(last?.classes.includes("task-card__actions__complete")).toBe(true);
    });

    it("minimal (2 ボタン) でも末尾が完了 + className", async () => {
      const { TaskCard } = await importTaskCard();
      const { container } = render(
        <TaskCard
          task={makeTask()}
          project={null}
          projects={[]}
          onChangeProject={() => {}}
          showPriority={false}
          showSetFocus={false}
          actionSet="minimal"
          onDelete={() => {}}
          onComplete={() => {}}
        />,
      );
      const buttons = readActionButtons(container);
      const last = buttons[buttons.length - 1];
      expect(last?.text).toContain("完了");
      expect(last?.classes.includes("task-card__actions__complete")).toBe(true);
    });
  });

  // ============================================================
  // 不変系 CSS 直読み (AC-11 〜 AC-14)
  // ============================================================

  // ----------------------------------------------------------
  // AC-11: BL-063 D-002 不変項 (.task-card__actions__delete に margin-right: auto)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11 (spec.md G-5 / REQ-2 / REQ-6 / BL-063 D-002 維持):
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__actions__delete セレクタのルール本文を観察する
   *   Then  margin-right: auto を含む (= BL-063 で確定した auto-margin パターンを本 BL でも維持)
   */
  describe("AC-11: .task-card__actions__delete に margin-right: auto (BL-063 D-002 維持)", () => {
    it(".task-card__actions__delete ルール本文に margin-right: auto を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions__delete");
      expect(body, ".task-card__actions__delete ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*margin-right\s*:\s*auto/);
    });
  });

  // ----------------------------------------------------------
  // AC-12: BL-063 D-002 不変項 (.task-card__actions__complete に margin-left: auto)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12 (spec.md G-5 / REQ-2 / REQ-6 / BL-063 D-002 維持):
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__actions__complete セレクタのルール本文を観察する
   *   Then  margin-left: auto を含む
   */
  describe("AC-12: .task-card__actions__complete に margin-left: auto (BL-063 D-002 維持)", () => {
    it(".task-card__actions__complete ルール本文に margin-left: auto を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions__complete");
      expect(body, ".task-card__actions__complete ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/(?:^|;|\n)\s*margin-left\s*:\s*auto/);
    });
  });

  // ----------------------------------------------------------
  // AC-13: BL-063 D-005 不変項 (.task-card--form .task-card__actions に justify-content: flex-end)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13 (spec.md G-5 / REQ-2 / REQ-6 / BL-063 D-005 維持):
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card--form .task-card__actions セレクタのルール本文を観察する
   *   Then  justify-content: flex-end を含む
   */
  describe("AC-13: .task-card--form .task-card__actions に justify-content: flex-end (BL-063 D-005 維持)", () => {
    it(".task-card--form .task-card__actions ルール本文に justify-content: flex-end を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card--form .task-card__actions");
      expect(body, ".task-card--form .task-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*flex-end/);
    });
  });

  // ----------------------------------------------------------
  // AC-14: BL-063 AC-4 不変項 (.task-card__actions に justify-content: center が無い)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14 (spec.md G-5 / REQ-2 / REQ-6 / BL-063 AC-4 維持):
   *   Given web/src/ui/task-card/task-card.css を開いた
   *   When  .task-card__actions セレクタのルール本文を観察する
   *   Then  display: flex を含む (3 段 layout は維持)
   *    かつ justify-content: center を含まない (BL-063 で撤去済みを維持)
   *    かつ justify-content: flex-end を含まない (旧 BL-057 値の回帰防止維持)
   */
  describe("AC-14: .task-card__actions に justify-content: center / flex-end が無い (BL-063 AC-4 維持)", () => {
    it(".task-card__actions ルール本文に display: flex を含む", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".task-card__actions ルール本文に justify-content: center を含まない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/justify-content\s*:\s*center/);
    });

    it(".task-card__actions ルール本文に justify-content: flex-end を含まない", () => {
      const css = readFileSync(taskCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".task-card__actions");
      expect(body, ".task-card__actions ルールが見つからない").not.toBeNull();
      expect(body ?? "").not.toMatch(/justify-content\s*:\s*flex-end/);
    });
  });

  // ============================================================
  // a11y (AC-15)
  // ============================================================
  //
  // 本 BL は button の DOM 順を入れ替えるだけで, accessibleName / role / aria 属性は変化しない.
  // よって新規 a11y violation は発生しない想定で, AC-15 の検証は e2e/a11y.spec.ts の継続実行で担保する.
  // 本ファイルでは個別 assert を設けない (= spec.md AC-15 / NFR-A11Y).
});
