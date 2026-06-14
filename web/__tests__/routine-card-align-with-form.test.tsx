// @vitest-environment jsdom

/**
 * RoutineCard 表示カードのレイアウト刷新 (RoutineFormCard と同じ 4 段構造に揃える)
 * 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-align-with-form/spec.md
 *   docs/developer/features/routine-card-align-with-form/plan.md
 *   docs/developer/features/routine-card-align-with-form/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   DOM 構造:
 *     AC-1 : `.routine-card__header` 段が表示カードに存在し PriorityStars 単独を含む (DOM).
 *     AC-2 : `.routine-card__title` 段が存在し name input + visually-hidden label を含む (DOM).
 *     AC-3 : `.routine-card` 直下が __header / __title / __day-checkboxes / __actions の 4 段順 (DOM).
 *     AC-4 : `.routine-card__header` 直下子は PriorityStars のみ (name input / 曜日 / 削除 button が含まれない) (DOM).
 *     AC-5 : 「削除」 button が `.routine-card__actions` 直下に配置される (DOM).
 *   CSS 直読み:
 *     AC-6 : `.routine-card__title` ルールセットの 3 宣言 が無改修で残存 (CSS).
 *     AC-7 : `.routine-card__header` の justify-content が flex-end に変更されている (CSS).
 *     AC-8 : `.routine-card--form .routine-card__header` override が完全撤去されている (CSS / D-001 (a)).
 *     AC-9 : `.routine-card` 基底の 7 宣言 が無改修 (CSS).
 *     AC-10: `.routine-card--form` / `.routine-card--form .routine-card__actions` セレクタが維持 (CSS).
 *   computed style:
 *     AC-11: 表示カード name input の computed font-size が --font-size-h2 (= 20px) と一致 (computed style).
 *   既存挙動の回帰防止:
 *     AC-12: name input blur で onNameBlur が呼ばれる (DOM).
 *     AC-13: 空文字 blur で input DOM 値が元値に復元 + onNameBlur("") (DOM / D-002 維持).
 *     AC-14: 同値 blur でも onNameBlur が呼ばれる (DOM / D-001 / 親が短絡判断).
 *     AC-15: 曜日 checkbox click で onDaysOfWeekChange が呼ばれる (DOM / 現状).
 *     AC-16: PriorityStars click で onDefaultPriorityChange が呼ばれる (DOM / 現状).
 *     AC-17: 「削除」 button click で onDelete が呼ばれる (DOM).
 *     AC-18: routine.name 変更時に input DOM value が同期する (key 再マウント) (DOM).
 *   起票カード <RoutineFormCard> の不変性:
 *     AC-19: 起票カード DOM 構造 が無改修 (DOM).
 *     AC-20: 起票 name input の computed font-size が変わらない (= 20px) (computed style).
 *   a11y:
 *     AC-21: visually-hidden label が name input と紐づく (entity id suffix) (DOM / a11y).
 *     AC-22: 表示カード PriorityStars の groupLabel / idPrefix が entity 依存で確定 (DOM / a11y).
 *     AC-23: 表示 + 起票同時レンダで input id 衝突なし (DOM / a11y).
 *     AC-24: 表示 + 起票同時レンダで PriorityStars radio id 衝突なし (DOM / a11y).
 *   起票カード CSS の整合性 (D-001 (a) 採用):
 *     AC-25: 起票カード `.routine-card__header` の computed justify-content = flex-end (視覚不変) (computed style).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= 表示カード `<RoutineCard>` の JSX が + 現状 3 段 / CSS が
 *     `.routine-card__header { justify-content: space-between }` + 起票側 override の状態) では,
 *     AC-1 / AC-2 / AC-3 / AC-4 / AC-7 / AC-8 が red になる想定.
 *     加えて AC-25 (起票 computed justify-content) は本 BL の CSS 変更で表現が変わる箇所のため,
 *     現状 (基底 space-between + 起票 override flex-end) でも実装後 (基底 flex-end + 起票 override 撤去) でも
 *     最終 computed が flex-end になる前提で書く.
 *   - AC-5 / AC-12 〜 AC-18 / AC-19 / AC-20 / AC-21 〜 AC-24 / AC-11 は既存挙動の回帰防止が中心で,
 *     実装前から green となる可能性もあるが, 本 BL 後も継続して green であることを担保する.
 *   - implementer が REQ-1 〜 REQ-6 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: readFileSync + extractRuleBody.
 *   - DOM レンダ: 動的 import + render パターン.
 *   - computed style: jsdom + vitest css: true 環境で getComputedStyle を取得.
 *     plan R-1 に従い「'20px' または 'var(--font-size-h2)' (未解決) のいずれかを許容」する.
 *
 * vitest-environment:
 *   DOM レンダ AC は jsdom 必須のため 1 ファイル全体を jsdom で動かす.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

import type { WebRoutine } from "../src/repositories/routine-repository.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

const routineCardCssPath = resolve(webSrcRoot, "ui/routine-card/routine-card.css");

const NOW = "2026-06-12T09:00:00.000Z";
const ROUTINE_ID_R1 = "r-1";

// ============================================================
// CSS ルール本文の抽出ヘルパ
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

function makeRoutine(overrides: Partial<WebRoutine> = {}): WebRoutine {
  return {
    id: ROUTINE_ID_R1,
    name: "朝のヨガ",
    daysOfWeek: [1],
    defaultPriority: "normal",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ============================================================
// 動的 import ヘルパ
// ============================================================

type RoutineCardModule = { RoutineCard: ComponentType<Record<string, unknown>> };
type RoutineFormCardModule = { RoutineFormCard: ComponentType<Record<string, unknown>> };

async function importRoutineCard(): Promise<RoutineCardModule> {
  const path = "../src/ui/routine-card/routine-card.js";
  return (await import(/* @vite-ignore */ path)) as RoutineCardModule;
}

async function importRoutineFormCard(): Promise<RoutineFormCardModule> {
  const path = "../src/ui/routine-card/routine-form-card.js";
  return (await import(/* @vite-ignore */ path)) as RoutineFormCardModule;
}

// ============================================================
// describe ブロック
// ============================================================

describe("RoutineCard 表示カードのレイアウト刷新", () => {
  // ============================================================
  // DOM 構造系 (AC-1 / AC-2 / AC-3 / AC-4 / AC-5)
  // ============================================================

  // ----------------------------------------------------------
  // AC-1: 表示カードの `.routine-card__header` 段に PriorityStars 単独
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given <RoutineCard routine={...}> を render
   *   When  DOM をクエリする
   *   Then  .routine-card 直下に .routine-card__header が存在
   *    かつ header 直下に PriorityStars (role="radiogroup" / accessibleName "朝のヨガ の優先度") のみ
   *    かつ header 直下に name input が含まれない
   */
  describe("AC-1: 表示カードの .routine-card__header 段に PriorityStars 単独 (name input は含まれない)", () => {
    it(".routine-card 直下に .routine-card__header 要素が存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const root = container.querySelector(".routine-card");
      expect(root, ".routine-card root が見つからない").not.toBeNull();
      const header = root?.querySelector(":scope > .routine-card__header");
      expect(
        header,
        ".routine-card 直下に .routine-card__header が無い (AC-1 / REQ-1 違反)",
      ).not.toBeNull();
    });

    it(".routine-card__header の直下に PriorityStars (role='radiogroup') が含まれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ name: "朝のヨガ" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const header = container.querySelector(".routine-card__header") as HTMLElement | null;
      expect(header, ".routine-card__header が見つからない (AC-1 / REQ-1 違反)").not.toBeNull();
      if (!header) return;
      const radiogroup = Array.from(header.children).find(
        (el) => el.getAttribute("role") === "radiogroup",
      );
      expect(
        radiogroup,
        ".routine-card__header 直下に PriorityStars (role='radiogroup') が無い (AC-1 違反)",
      ).toBeDefined();
      const ariaLabel = radiogroup?.getAttribute("aria-label") ?? "";
      expect(
        ariaLabel,
        `PriorityStars の aria-label に '朝のヨガ の優先度' が含まれない (実際: "${ariaLabel}")`,
      ).toContain("朝のヨガ の優先度");
    });

    it(".routine-card__header の直下に name input が含まれない (= title 段に移動)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const header = container.querySelector(".routine-card__header") as HTMLElement | null;
      expect(header, ".routine-card__header が見つからない").not.toBeNull();
      if (!header) return;
      const nameInput = Array.from(header.children).find(
        (el) => el.tagName.toLowerCase() === "input" && el.getAttribute("type") === "text",
      );
      expect(
        nameInput,
        ".routine-card__header 直下に name input が残っている (AC-1 / REQ-2 違反 / title 段に移動するはず)",
      ).toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  // AC-2: 表示カードに `.routine-card__title` 段 + visually-hidden label + name input
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given <RoutineCard routine={{ id: "r-1", name: "朝のヨガ" }}> を render
   *   When  DOM をクエリする
   *   Then  `.routine-card__title` 要素が存在し,
   *         その直下に <label htmlFor="routine-name-r-1" class="visually-hidden">ルーティン名</label> と
   *         <input id="routine-name-r-1" type="text"> の両方が含まれる
   */
  describe("AC-2: 表示カードに .routine-card__title 段が存在し name input + visually-hidden label を含む", () => {
    it(".routine-card__title 要素が存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const title = container.querySelector(".routine-card__title");
      expect(title, ".routine-card__title が無い (AC-2 / REQ-1 違反)").not.toBeNull();
    });

    it(".routine-card__title の直下に <label htmlFor='routine-name-{id}' class='visually-hidden'> と <input id='routine-name-{id}'> が含まれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r-1", name: "朝のヨガ" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const title = container.querySelector(".routine-card__title") as HTMLElement | null;
      expect(title, ".routine-card__title が無い (AC-2 / REQ-1 違反)").not.toBeNull();
      if (!title) return;
      const directChildren = Array.from(title.children);
      const label = directChildren.find(
        (el) =>
          el.tagName.toLowerCase() === "label" && el.getAttribute("for") === "routine-name-r-1",
      );
      const input = directChildren.find(
        (el) =>
          el.tagName.toLowerCase() === "input" &&
          el.getAttribute("type") === "text" &&
          el.getAttribute("id") === "routine-name-r-1",
      );
      expect(
        label,
        ".routine-card__title 直下に <label for='routine-name-r-1'> が無い (AC-2 違反)",
      ).toBeDefined();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("ルーティン名");
      expect(
        input,
        ".routine-card__title 直下に <input id='routine-name-r-1' type='text'> が無い (AC-2 違反)",
      ).toBeDefined();
    });
  });

  // ----------------------------------------------------------
  // AC-3: 表示カードの 4 段順序
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given <RoutineCard ...> を render
   *   When  `.routine-card` 直下の子要素を順に取得する
   *   Then  順に __header / __title / __day-checkboxes / __actions の 4 要素のみが並ぶ
   */
  describe("AC-3: 表示カード .routine-card 直下に 4 段が順に並ぶ", () => {
    it(".routine-card 直下の子要素が 4 個ある", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const root = container.querySelector(".routine-card") as HTMLElement | null;
      expect(root, ".routine-card root が無い").not.toBeNull();
      if (!root) return;
      expect(
        root.children.length,
        `.routine-card 直下の子が 4 個ではない (実際: ${root.children.length}) (AC-3 / REQ-1 違反)`,
      ).toBe(4);
    });

    it(".routine-card 直下の子は順に __header / __title / __day-checkboxes / __actions である", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const root = container.querySelector(".routine-card") as HTMLElement | null;
      expect(root, ".routine-card root が無い").not.toBeNull();
      if (!root) return;
      const childClasses = Array.from(root.children).map((el) => el.className);
      expect(
        childClasses[0]?.includes("routine-card__header"),
        `1 番目が .routine-card__header ではない (実際: "${childClasses[0]}")`,
      ).toBe(true);
      expect(
        childClasses[1]?.includes("routine-card__title"),
        `2 番目が .routine-card__title ではない (実際: "${childClasses[1]}")`,
      ).toBe(true);
      expect(
        childClasses[2]?.includes("routine-card__day-checkboxes"),
        `3 番目が .routine-card__day-checkboxes ではない (実際: "${childClasses[2]}")`,
      ).toBe(true);
      expect(
        childClasses[3]?.includes("routine-card__actions"),
        `4 番目が .routine-card__actions ではない (実際: "${childClasses[3]}")`,
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-4: 表示カード header 直下子が PriorityStars のみ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given <RoutineCard ...> を render
   *   When  `.routine-card__header` の直下子を取得する
   *   Then  PriorityStars (role="radiogroup") のみが直下子として存在する
   *    かつ name input / visually-hidden label / 曜日 group / 「削除」 button のいずれも header 直下に含まれない
   */
  describe("AC-4: 表示カード header 段の直下子は PriorityStars のみ (左空 / D-002)", () => {
    it(".routine-card__header の直下子要素が 1 個のみ", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const header = container.querySelector(".routine-card__header") as HTMLElement | null;
      expect(header, ".routine-card__header が無い (AC-4 違反)").not.toBeNull();
      if (!header) return;
      const directChildren = Array.from(header.children);
      expect(
        directChildren.length,
        `header の直下子が 1 個ではない (実際: ${directChildren.length}) (AC-4 / D-002 違反)`,
      ).toBe(1);
      const sole = directChildren[0];
      expect(
        sole?.getAttribute("role") === "radiogroup",
        `header の唯一の直下子が role='radiogroup' ではない (実際: tag="${sole?.tagName.toLowerCase()}", role="${sole?.getAttribute("role")}")`,
      ).toBe(true);
    });

    it(".routine-card__header 直下に name input / visually-hidden label / 曜日 group / 削除 button が含まれない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const header = container.querySelector(".routine-card__header") as HTMLElement | null;
      expect(header, ".routine-card__header が無い").not.toBeNull();
      if (!header) return;
      const directChildren = Array.from(header.children);
      // name input が直下子に無い.
      const nameInput = directChildren.find(
        (el) => el.tagName.toLowerCase() === "input" && el.getAttribute("type") === "text",
      );
      expect(nameInput, "header 直下に name input がある (AC-4 違反)").toBeUndefined();
      // visually-hidden label が直下子に無い.
      const label = directChildren.find(
        (el) => el.tagName.toLowerCase() === "label" && el.classList.contains("visually-hidden"),
      );
      expect(label, "header 直下に visually-hidden label がある (AC-4 違反)").toBeUndefined();
      // 曜日 group が直下子に無い.
      const dayGroup = directChildren.find(
        (el) => el.getAttribute("role") === "group" && el.getAttribute("aria-label") === "曜日",
      );
      expect(dayGroup, "header 直下に曜日 group がある (AC-4 違反)").toBeUndefined();
      // 「削除」 button が直下子に無い.
      const deleteButton = directChildren.find(
        (el) => el.tagName.toLowerCase() === "button" && (el.textContent ?? "").trim() === "削除",
      );
      expect(deleteButton, "header 直下に「削除」 button がある (AC-4 違反)").toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  // AC-5: 「削除」 button が `.routine-card__actions` 直下
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given <RoutineCard ...> を render
   *   When  DOM をクエリする
   *   Then  `.routine-card__actions` の直下に
   *         <button type="button" class="routine-card__actions__delete">削除</button> が存在する
   *    かつ name input と同じ親 (.routine-card__title) には属さない
   *    かつ header と同じ親 (.routine-card__header) には属さない
   */
  describe("AC-5: 「削除」 button が .routine-card__actions 直下に配置される", () => {
    it(".routine-card__actions 直下に <button type='button' class='routine-card__actions__delete'>削除</button> が存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const actions = container.querySelector(".routine-card__actions") as HTMLElement | null;
      expect(actions, ".routine-card__actions が無い (AC-5 / REQ-4 違反)").not.toBeNull();
      if (!actions) return;
      const directChildren = Array.from(actions.children) as HTMLElement[];
      const deleteButton = directChildren.find(
        (el) =>
          el.tagName.toLowerCase() === "button" &&
          el.getAttribute("type") === "button" &&
          (el.textContent ?? "").trim() === "削除" &&
          el.classList.contains("routine-card__actions__delete"),
      );
      expect(
        deleteButton,
        ".routine-card__actions 直下に <button type='button' class='routine-card__actions__delete'>削除</button> が無い (AC-5 違反)",
      ).toBeDefined();
    });

    it("「削除」 button は .routine-card__title / .routine-card__header の配下に属さない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const title = container.querySelector(".routine-card__title") as HTMLElement | null;
      const header = container.querySelector(".routine-card__header") as HTMLElement | null;
      const deleteButton = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      expect(deleteButton, "「削除」 button が無い").toBeDefined();
      expect(
        title?.contains(deleteButton ?? null),
        "「削除」 button が .routine-card__title 配下にある (AC-5 違反)",
      ).toBe(false);
      expect(
        header?.contains(deleteButton ?? null),
        "「削除」 button が .routine-card__header 配下にある (AC-5 違反)",
      ).toBe(false);
    });
  });

  // ============================================================
  // CSS 直読み系 (AC-6 / AC-7 / AC-8 / AC-9 / AC-10)
  // ============================================================

  // ----------------------------------------------------------
  // AC-6: `.routine-card__title` ルールセットの 3 宣言 が無改修で残存
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given routine-card.css を読み込む
   *   When  `.routine-card__title` ルールセットを参照する
   *   Then  display: flex / align-items: center / font-size: var(--font-size-h2) の 3 宣言が維持
   *    かつ `.routine-card--form .routine-card__title` のような起票専用 override が追加されていない
   */
  describe("AC-6: .routine-card__title ルールセットの 3 宣言 が無改修", () => {
    it(".routine-card__title ルールに display: flex を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__title");
      expect(body, ".routine-card__title ルールが無い (AC-6 / D-003 違反)").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".routine-card__title ルールに align-items: center を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__title");
      expect(body, ".routine-card__title ルールが無い").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*center/);
    });

    it(".routine-card__title ルールに font-size: var(--font-size-h2) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__title");
      expect(body, ".routine-card__title ルールが無い").not.toBeNull();
      expect(
        body ?? "",
        ".routine-card__title に font-size: var(--font-size-h2) が無い (AC-6 / D-003 違反)",
      ).toMatch(/font-size\s*:\s*var\(--font-size-h2\)/);
    });

    it(".routine-card--form .routine-card__title 専用 override は追加されていない (共用維持)", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card--form .routine-card__title");
      expect(
        body,
        ".routine-card--form .routine-card__title 専用 override が存在する (AC-6 / D-003 共用方針違反)",
      ).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-7: `.routine-card__header` の justify-content が flex-end に変更
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given routine-card.css を読み込む
   *   When  `.routine-card__header` ルールセットを参照する
   *   Then  justify-content: flex-end が宣言されている (= 旧 space-between から本 BL で変更)
   *    かつ display: flex / align-items: center / gap: var(--space-sm) / font-size: var(--font-size-h2) の他 4 宣言は維持
   */
  describe("AC-7: .routine-card__header の justify-content が flex-end (D-001)", () => {
    it(".routine-card__header ルールに justify-content: flex-end を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body, ".routine-card__header ルールが無い (AC-7 / D-001 違反)").not.toBeNull();
      expect(
        body ?? "",
        ".routine-card__header に justify-content: flex-end が無い (AC-7 / D-001 違反 / 旧 space-between から変更されているはず)",
      ).toMatch(/justify-content\s*:\s*flex-end/);
    });

    it(".routine-card__header ルールに justify-content: space-between が含まれない (= 撤去済)", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body, ".routine-card__header ルールが無い").not.toBeNull();
      expect(
        body ?? "",
        ".routine-card__header に justify-content: space-between が残存 (AC-7 / D-001 違反 / flex-end に変更するはず)",
      ).not.toMatch(/justify-content\s*:\s*space-between/);
    });

    it(".routine-card__header の他 4 宣言 (display: flex / align-items: center / gap / font-size) は維持", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body, ".routine-card__header ルールが無い").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText, "display: flex が無い").toMatch(/display\s*:\s*flex/);
      expect(bodyText, "align-items: center が無い").toMatch(/align-items\s*:\s*center/);
      expect(bodyText, "gap: var(--space-sm) が無い").toMatch(/gap\s*:\s*var\(--space-sm\)/);
      expect(bodyText, "font-size: var(--font-size-h2) が無い").toMatch(
        /font-size\s*:\s*var\(--font-size-h2\)/,
      );
    });
  });

  // ----------------------------------------------------------
  // AC-8: `.routine-card--form .routine-card__header` override が完全撤去 (D-001 (a))
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8 (D-001 (a) 採用時):
   *   Given routine-card.css を読み込む
   *   When  `.routine-card--form .routine-card__header` の宣言ブロックを参照する
   *   Then  ルールセットが存在しない (= 完全撤去)
   */
  describe("AC-8: .routine-card--form .routine-card__header override が完全撤去 (D-001 (a))", () => {
    it(".routine-card--form .routine-card__header ルールが routine-card.css に存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card--form .routine-card__header");
      expect(
        body,
        ".routine-card--form .routine-card__header override が残存 (AC-8 / D-001 (a) 違反)",
      ).toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-9: `.routine-card` 基底 (4 段 layout) が無改修
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given routine-card.css を読み込む
   *   When  `.routine-card` ルールセットを参照する
   *   Then  現状確定した 7 宣言 (display: flex / flex-direction: column / gap: var(--space-md) +
   *         visual 4 宣言: background / border / border-radius: var(--radius-lg) / padding: var(--space-md))
   *         がそのまま維持されている
   */
  describe("AC-9: .routine-card 基底の 7 宣言 が無改修", () => {
    it(".routine-card ルールに display: flex / flex-direction: column / gap: var(--space-md) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが無い (AC-9 違反)").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText, "display: flex が無い").toMatch(/display\s*:\s*flex/);
      expect(bodyText, "flex-direction: column が無い").toMatch(/flex-direction\s*:\s*column/);
      expect(bodyText, "gap: var(--space-md) が無い").toMatch(/gap\s*:\s*var\(--space-md\)/);
    });

    it(".routine-card ルールに visual 4 宣言 (background / border / border-radius / padding) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが無い").not.toBeNull();
      const bodyText = body ?? "";
      expect(bodyText).toMatch(/background(?:-color)?\s*:\s*var\(--color-bg\)/);
      const hasShorthandBorder = /border\s*:\s*1px\s+solid\s+var\(--color-border\)/.test(bodyText);
      const hasDecomposedBorder =
        /border-width\s*:\s*1px/.test(bodyText) &&
        /border-style\s*:\s*solid/.test(bodyText) &&
        /border-color\s*:\s*var\(--color-border\)/.test(bodyText);
      expect(
        hasShorthandBorder || hasDecomposedBorder,
        ".routine-card に border: 1px solid var(--color-border) 等価宣言が無い",
      ).toBe(true);
      expect(bodyText).toMatch(/border-radius\s*:\s*var\(--radius-lg\)/);
      expect(bodyText).toMatch(/(?:^|;|\n)\s*padding\s*:\s*var\(--space-md\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-10: `.routine-card--form` セレクタ (起票専用) が無改修
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given routine-card.css を読み込む
   *   When  `.routine-card--form` / `.routine-card--form .routine-card__actions` ルールセットを参照する
   *   Then  現状確定した `flex-direction: column; align-items: stretch` および
   *         `.routine-card--form .routine-card__actions { justify-content: flex-end }` が残存
   */
  describe("AC-10: .routine-card--form 系セレクタ (起票専用) が無改修で維持", () => {
    it(".routine-card--form ルールに flex-direction: column / align-items: stretch を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card--form");
      expect(body, ".routine-card--form ルールが無い (AC-10 違反)").not.toBeNull();
      expect(body ?? "").toMatch(/flex-direction\s*:\s*column/);
      expect(body ?? "").toMatch(/align-items\s*:\s*stretch/);
    });
  });

  // ============================================================
  // 計算スタイル (AC-11)
  // ============================================================

  // ----------------------------------------------------------
  // AC-11: 表示カード name input の computed font-size が --font-size-h2 と一致
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given <RoutineCard ...> を render する (vitest.config.ts css: true)
   *   When  name input の getComputedStyle().fontSize を取得する
   *   Then  '20px' (= var(--font-size-h2) 解決値) または 'var(--font-size-h2)' (jsdom 未解決) のいずれか
   */
  describe("AC-11: 表示カード name input の computed font-size が --font-size-h2 (= 20px) と一致", () => {
    it("input#routine-name-{id} の getComputedStyle().fontSize が '20px' または 'var(--font-size-h2)'", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r-1" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const input = container.querySelector("input#routine-name-r-1") as HTMLInputElement | null;
      expect(input, "input#routine-name-r-1 が無い").not.toBeNull();
      if (!input) return;
      const fontSize = getComputedStyle(input).fontSize;
      expect(
        fontSize === "20px" || fontSize === "var(--font-size-h2)" || /20px/.test(fontSize),
        `表示 input の font-size が '20px' でも 'var(--font-size-h2)' でもない (実際: "${fontSize}") (AC-11 / R-1 違反)`,
      ).toBe(true);
    });
  });

  // ============================================================
  // 既存挙動の回帰防止 (AC-12 〜 AC-18)
  // ============================================================

  // ----------------------------------------------------------
  // AC-12: name input blur で onNameBlur が呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12:
   *   Given <RoutineCard routine={{ name: "朝のヨガ" }} onNameBlur={spy}> を render
   *   When  name input に "夜の体操" を入力して blur する
   *   Then  spy が ("夜の体操") で 1 回呼ばれる
   */
  describe("AC-12: name input blur で onNameBlur が呼ばれる", () => {
    it("name input に '夜の体操' を入力して blur すると onNameBlur('夜の体操') が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r-1", name: "朝のヨガ" });
      const onNameBlur = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={onNameBlur}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const input = container.querySelector("input#routine-name-r-1") as HTMLInputElement | null;
      expect(input, "input#routine-name-r-1 が無い").not.toBeNull();
      if (!input) return;
      fireEvent.change(input, { target: { value: "夜の体操" } });
      fireEvent.blur(input);
      expect(onNameBlur).toHaveBeenCalledTimes(1);
      expect(onNameBlur).toHaveBeenCalledWith("夜の体操");
    });
  });

  // ----------------------------------------------------------
  // AC-13: 空文字 blur で DOM 値が元値に復元 + onNameBlur("")
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13 維持):
   *   Given <RoutineCard routine={{ name: "朝のヨガ" }} onNameBlur={spy}> を render
   *   When  name input の値を "" にして blur する
   *   Then  input の DOM value が "朝のヨガ" に書き戻される
   *    かつ spy が ("") で 1 回呼ばれる (= 親 view が短絡判断する経路を維持)
   */
  describe("AC-13: 空文字 blur で input DOM 値が routine.name に復元され onNameBlur('') が呼ばれる", () => {
    it("空文字 blur で input.value が '朝のヨガ' に書き戻され onNameBlur('') が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r-1", name: "朝のヨガ" });
      const onNameBlur = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={onNameBlur}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const input = container.querySelector("input#routine-name-r-1") as HTMLInputElement | null;
      expect(input, "input#routine-name-r-1 が無い").not.toBeNull();
      if (!input) return;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      expect(
        input.value,
        `空文字 blur で input.value が '朝のヨガ' に書き戻されていない (実際: "${input.value}")`,
      ).toBe("朝のヨガ");
      expect(onNameBlur).toHaveBeenCalledTimes(1);
      expect(onNameBlur).toHaveBeenCalledWith("");
    });
  });

  // ----------------------------------------------------------
  // AC-14: 同値 blur でも onNameBlur が呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14:
   *   Given <RoutineCard routine={{ name: "朝のヨガ" }} onNameBlur={spy}> を render
   *   When  name input の値を変えずに blur する (defaultValue="朝のヨガ" / 編集なし)
   *   Then  spy が ("朝のヨガ") で 1 回呼ばれる (= カードは常に blur 値を流す)
   */
  describe("AC-14: 同値 blur でも onNameBlur が呼ばれる (短絡判断は親 view)", () => {
    it("値を変えずに blur すると onNameBlur('朝のヨガ') が 1 回呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r-1", name: "朝のヨガ" });
      const onNameBlur = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={onNameBlur}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const input = container.querySelector("input#routine-name-r-1") as HTMLInputElement | null;
      expect(input, "input#routine-name-r-1 が無い").not.toBeNull();
      if (!input) return;
      fireEvent.blur(input);
      expect(onNameBlur).toHaveBeenCalledTimes(1);
      expect(onNameBlur).toHaveBeenCalledWith("朝のヨガ");
    });
  });

  // ----------------------------------------------------------
  // AC-15: 曜日 checkbox click で onDaysOfWeekChange が呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-15:
   *   Given <RoutineCard routine={{ daysOfWeek: [1] }} onDaysOfWeekChange={spy}> を render
   *   When  「水」 (day=3) の checkbox を click する
   *   Then  spy が ([1, 3]) で呼ばれる (sort 済み配列)
   */
  describe("AC-15: 曜日 checkbox click で onDaysOfWeekChange が呼ばれる", () => {
    it("水 (day=3) の checkbox click で onDaysOfWeekChange([1, 3]) が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1] });
      const onDaysOfWeekChange = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={onDaysOfWeekChange}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const group = container.querySelector("div[role='group'][aria-label='曜日']");
      expect(group, "曜日 group が無い").not.toBeNull();
      const checkboxes = Array.from(
        group?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      expect(checkboxes.length, "曜日 checkbox が 7 個ではない").toBe(7);
      checkboxes[3]?.click();
      expect(onDaysOfWeekChange).toHaveBeenCalledTimes(1);
      expect(onDaysOfWeekChange).toHaveBeenCalledWith([1, 3]);
    });
  });

  // ----------------------------------------------------------
  // AC-16: PriorityStars click で onDefaultPriorityChange が呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-16:
   *   Given <RoutineCard routine={{ defaultPriority: "normal" }} onDefaultPriorityChange={spy}> を render
   *   When  PriorityStars の "highest" 相当 (3 つ目の星) を click する
   *   Then  spy が ("highest") で呼ばれる
   *   注: 現状 / spec AC-16 は "high" と書かれているが実装上 PriorityStars の 3 つ目は "highest".
   *       / 現状同等 AC も "highest" で機械検証している.
   */
  describe("AC-16: PriorityStars click で onDefaultPriorityChange が呼ばれる", () => {
    it("3 つ目の星 click で onDefaultPriorityChange('highest') が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ defaultPriority: "normal" });
      const onDefaultPriorityChange = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={onDefaultPriorityChange}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(radiogroup, "PriorityStars (radiogroup) が無い").not.toBeNull();
      const stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLButtonElement[];
      expect(stars.length, "PriorityStars の星 button が 3 個ではない").toBe(3);
      stars[2]?.click();
      expect(onDefaultPriorityChange).toHaveBeenCalledTimes(1);
      expect(onDefaultPriorityChange).toHaveBeenCalledWith("highest");
    });
  });

  // ----------------------------------------------------------
  // AC-17: 「削除」 button click で onDelete が呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-17:
   *   Given <RoutineCard onDelete={spy}> を render
   *   When  `.routine-card__actions__delete` button を click する
   *   Then  spy が 1 回呼ばれる
   */
  describe("AC-17: 「削除」 button click で onDelete が呼ばれる", () => {
    it(".routine-card__actions__delete click で onDelete が 1 回呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const onDelete = vi.fn();
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={onDelete}
        />,
      );
      const deleteButton = container.querySelector(
        ".routine-card__actions__delete",
      ) as HTMLButtonElement | null;
      expect(deleteButton, ".routine-card__actions__delete が無い").not.toBeNull();
      deleteButton?.click();
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // AC-18: routine.name 変更時に input DOM value が同期 (key 再マウント)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-18:
   *   Given <RoutineCard routine={{ name: "朝のヨガ" }}> を render
   *   When  routine.name を "夜の体操" に変えて再 render する
   *   Then  input の DOM value が "夜の体操" になる (= サーバ正本値変化時の同期 / )
   */
  describe("AC-18: routine.name 変更時に input DOM value が同期する (key 再マウント / )", () => {
    it("routine.name を変更すると input の value が同期する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine1 = makeRoutine({ id: "r-1", name: "朝のヨガ" });
      const { container, rerender } = render(
        <RoutineCard
          routine={routine1}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const before = container.querySelector("input#routine-name-r-1") as HTMLInputElement | null;
      expect(before?.value).toBe("朝のヨガ");
      const routine2 = makeRoutine({ id: "r-1", name: "夜の体操" });
      rerender(
        <RoutineCard
          routine={routine2}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const after = container.querySelector("input#routine-name-r-1") as HTMLInputElement | null;
      expect(
        after?.value,
        `routine.name 変更後の input.value が同期されていない (実際: "${after?.value}")`,
      ).toBe("夜の体操");
    });
  });

  // ============================================================
  // 起票カード <RoutineFormCard> の不変性 (AC-19 / AC-20)
  // ============================================================

  // ----------------------------------------------------------
  // AC-19: 起票カードの DOM 構造 が無改修
  // ----------------------------------------------------------
  /**
   * シナリオ AC-19:
   *   Given <RoutineFormCard ...> を render
   *   When  DOM をクエリする
   *   Then  form 直下に __header (PriorityStars 単独) / __title (label + name input) /
   *         __day-checkboxes / __actions (「追加」 button) の 4 要素のみが並ぶ
   */
  describe("AC-19: 起票カード <RoutineFormCard> の DOM 構造 が無改修", () => {
    it("form 直下が __header / __title / __day-checkboxes / __actions の 4 段順に並ぶ", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const form = container.querySelector("form.routine-card.routine-card--form");
      expect(form, "form.routine-card.routine-card--form が無い").not.toBeNull();
      if (!form) return;
      expect(
        form.children.length,
        `form 直下の子が 4 個ではない (実際: ${form.children.length})`,
      ).toBe(4);
      const childClasses = Array.from(form.children).map((el) => el.className);
      expect(childClasses[0]?.includes("routine-card__header")).toBe(true);
      expect(childClasses[1]?.includes("routine-card__title")).toBe(true);
      expect(childClasses[2]?.includes("routine-card__day-checkboxes")).toBe(true);
      expect(childClasses[3]?.includes("routine-card__actions")).toBe(true);
    });

    it("header 直下に PriorityStars のみ / title に label + input / actions に「追加」 button", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const header = container.querySelector(".routine-card__header") as HTMLElement | null;
      expect(header).not.toBeNull();
      expect(header?.children.length).toBe(1);
      expect(header?.children[0]?.getAttribute("role")).toBe("radiogroup");

      const title = container.querySelector(".routine-card__title") as HTMLElement | null;
      expect(title).not.toBeNull();
      const titleLabel = title?.querySelector("label[for='routine-name'].visually-hidden");
      const titleInput = title?.querySelector("input#routine-name[type='text']");
      expect(titleLabel, "title 段に visually-hidden label が無い").not.toBeNull();
      expect(titleInput, "title 段に name input が無い").not.toBeNull();

      const actions = container.querySelector(".routine-card__actions") as HTMLElement | null;
      expect(actions).not.toBeNull();
      const submit = Array.from(actions?.children ?? []).find(
        (el) =>
          el.tagName.toLowerCase() === "button" &&
          el.getAttribute("type") === "submit" &&
          (el.textContent ?? "").trim() === "追加",
      );
      expect(submit, "actions 段に「追加」 submit button が無い").toBeDefined();
    });
  });

  // ----------------------------------------------------------
  // AC-20: 起票 name input の computed font-size が --font-size-h2 と一致 (= 20px / 現状)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-20:
   *   Given <RoutineFormCard ...> を render
   *   When  name input の getComputedStyle().fontSize を取得する
   *   Then  '20px' または 'var(--font-size-h2)'
   */
  describe("AC-20: 起票カード name input の computed font-size が --font-size-h2 (= 20px / 現状)", () => {
    it("input#routine-name の computed fontSize が '20px' または 'var(--font-size-h2)'", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const input = container.querySelector("input#routine-name") as HTMLInputElement | null;
      expect(input, "input#routine-name が無い").not.toBeNull();
      if (!input) return;
      const fontSize = getComputedStyle(input).fontSize;
      expect(
        fontSize === "20px" || fontSize === "var(--font-size-h2)" || /20px/.test(fontSize),
        `起票 input の font-size が '20px' でも 'var(--font-size-h2)' でもない (実際: "${fontSize}") (AC-20 / R-1 違反)`,
      ).toBe(true);
    });
  });

  // ============================================================
  // a11y (AC-21 / AC-22 / AC-23 / AC-24)
  // ============================================================

  // ----------------------------------------------------------
  // AC-21: visually-hidden label が name input と紐づく (entity id suffix)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-21:
   *   Given <RoutineCard routine={{ id: "r-1", name: "朝のヨガ" }}> を render
   *   When  DOM をクエリする
   *   Then  <label for="routine-name-r-1" class="visually-hidden">ルーティン名</label> と
   *         <input id="routine-name-r-1"> の両方が存在する
   */
  describe("AC-21: 表示カードの visually-hidden label が name input と紐づく (entity id suffix)", () => {
    it("label[for='routine-name-r-1'].visually-hidden と input#routine-name-r-1 が両立", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r-1", name: "朝のヨガ" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const label = container.querySelector(
        "label[for='routine-name-r-1']",
      ) as HTMLLabelElement | null;
      const input = container.querySelector("input#routine-name-r-1") as HTMLInputElement | null;
      expect(label, "label[for='routine-name-r-1'] が無い").not.toBeNull();
      expect(input, "input#routine-name-r-1 が無い").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("ルーティン名");
    });
  });

  // ----------------------------------------------------------
  // AC-22: 表示カード PriorityStars の groupLabel / idPrefix が entity 依存で確定
  // ----------------------------------------------------------
  /**
   * シナリオ AC-22:
   *   Given <RoutineCard routine={{ id: "r-1", name: "朝のヨガ", defaultPriority: "normal" }}> を render
   *   When  PriorityStars の root role="radiogroup" を取得する
   *   Then  accessibleName は "朝のヨガ の優先度" を含む
   *    かつ 子 radio の id は "routine-r-1" prefix で始まる
   */
  describe("AC-22: 表示カード PriorityStars の groupLabel / idPrefix が entity 依存で確定", () => {
    it("radiogroup の aria-label に '朝のヨガ の優先度' が含まれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r-1", name: "朝のヨガ", defaultPriority: "normal" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(radiogroup, "PriorityStars (radiogroup) が無い").not.toBeNull();
      const ariaLabel = radiogroup?.getAttribute("aria-label") ?? "";
      expect(
        ariaLabel,
        `radiogroup の aria-label に '朝のヨガ の優先度' が含まれない (実際: "${ariaLabel}")`,
      ).toContain("朝のヨガ の優先度");
    });

    it("radio button の id prefix が 'routine-r-1' で始まる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r-1", name: "朝のヨガ" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(radiogroup, "PriorityStars (radiogroup) が無い").not.toBeNull();
      const radios = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLButtonElement[];
      expect(radios.length, "radio button が 3 個ではない").toBe(3);
      for (const radio of radios) {
        const id = radio.getAttribute("id") ?? "";
        expect(
          id.startsWith("routine-r-1"),
          `radio の id prefix が 'routine-r-1' で始まらない (実際: "${id}")`,
        ).toBe(true);
      }
    });
  });

  // ----------------------------------------------------------
  // AC-23: 表示 + 起票同時レンダで input id 衝突なし
  // ----------------------------------------------------------
  /**
   * シナリオ AC-23:
   *   Given <RoutineCard routine={{ id: "r-1" }}> と <RoutineFormCard ...> を同時に render
   *   When  document 全体で input id を取得する
   *   Then  "routine-name-r-1" (表示) と "routine-name" (起票) の両方が存在し重複は無い
   */
  describe("AC-23: 表示 + 起票同時レンダで input id 衝突なし", () => {
    it("input#routine-name-r-1 (表示) と input#routine-name (起票) が両立し重複しない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const { RoutineFormCard } = await importRoutineFormCard();
      const routine = makeRoutine({ id: "r-1" });
      const { container } = render(
        <div>
          <RoutineCard
            routine={routine}
            onNameBlur={() => {}}
            onDaysOfWeekChange={() => {}}
            onDefaultPriorityChange={() => {}}
            onDelete={() => {}}
          />
          <RoutineFormCard
            name=""
            onNameChange={() => {}}
            daysOfWeek={[1]}
            onToggleDay={() => {}}
            defaultPriority="normal"
            onDefaultPriorityChange={() => {}}
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
            }}
          />
        </div>,
      );
      const displayInputs = container.querySelectorAll("input[id='routine-name-r-1']");
      const createInputs = container.querySelectorAll("input[id='routine-name']");
      expect(
        displayInputs.length,
        `input[id='routine-name-r-1'] が 1 個ではない (実際: ${displayInputs.length}) (AC-23 違反)`,
      ).toBe(1);
      expect(
        createInputs.length,
        `input[id='routine-name'] が 1 個ではない (実際: ${createInputs.length}) (AC-23 違反)`,
      ).toBe(1);
    });
  });

  // ----------------------------------------------------------
  // AC-24: 表示 + 起票同時レンダで PriorityStars radio id prefix 衝突なし
  // ----------------------------------------------------------
  /**
   * シナリオ AC-24:
   *   Given <RoutineCard routine={{ id: "r-1" }}> と <RoutineFormCard ...> を同時に render
   *   When  document 全体で radio button の id を取得する
   *   Then  "routine-r-1" prefix (表示) と "routine-create" prefix (起票) で重複が無い
   */
  describe("AC-24: 表示 + 起票同時レンダで PriorityStars radio id 衝突なし", () => {
    it("'routine-r-1' prefix と 'routine-create' prefix の radio が両立し重複しない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const { RoutineFormCard } = await importRoutineFormCard();
      const routine = makeRoutine({ id: "r-1" });
      const { container } = render(
        <div>
          <RoutineCard
            routine={routine}
            onNameBlur={() => {}}
            onDaysOfWeekChange={() => {}}
            onDefaultPriorityChange={() => {}}
            onDelete={() => {}}
          />
          <RoutineFormCard
            name=""
            onNameChange={() => {}}
            daysOfWeek={[1]}
            onToggleDay={() => {}}
            defaultPriority="normal"
            onDefaultPriorityChange={() => {}}
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
            }}
          />
        </div>,
      );
      const radios = Array.from(
        container.querySelectorAll("button[role='radio']"),
      ) as HTMLButtonElement[];
      const displayRadios = radios.filter((r) =>
        (r.getAttribute("id") ?? "").startsWith("routine-r-1"),
      );
      const createRadios = radios.filter((r) =>
        (r.getAttribute("id") ?? "").startsWith("routine-create"),
      );
      expect(
        displayRadios.length,
        `表示カードの 'routine-r-1' prefix radio が 3 個ではない (実際: ${displayRadios.length})`,
      ).toBe(3);
      expect(
        createRadios.length,
        `起票カードの 'routine-create' prefix radio が 3 個ではない (実際: ${createRadios.length})`,
      ).toBe(3);
      // id の全体集合に重複が無いことを確認.
      const allIds = radios.map((r) => r.getAttribute("id") ?? "");
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size, `radio id に重複がある (id 群: ${JSON.stringify(allIds)})`).toBe(
        allIds.length,
      );
    });
  });

  // ============================================================
  // 起票カード CSS の整合性 (D-001 (a) 採用時) (AC-25)
  // ============================================================

  // ----------------------------------------------------------
  // AC-25: 起票 `.routine-card__header` の computed justify-content = flex-end
  // ----------------------------------------------------------
  /**
   * シナリオ AC-25 (plan D-001 (a) 採用):
   *   Given <RoutineFormCard ...> を render
   *   When  `.routine-card__header` の computed style を取得する
   *   Then  justify-content が 'flex-end' で PriorityStars が右端に並ぶ視覚配置を維持
   *
   * 補足: jsdom の getComputedStyle は CSS variable / inherit と同様に
   * 一部の値で未解決状態になりうる. 'flex-end' と一致しない場合は CSS 直読み (AC-7 / AC-8) で
   * 整合性を担保しているため, ここでは「flex-end であるか, または jsdom が空文字 / 未解決値を
   * 返した場合は許容」する.
   */
  describe("AC-25: 起票カード .routine-card__header の computed justify-content = flex-end (D-001 (a) / 視覚不変)", () => {
    it("起票 .routine-card__header の computed justify-content が 'flex-end' (または jsdom 未解決)", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const header = container.querySelector(".routine-card__header") as HTMLElement | null;
      expect(header, "起票カードの .routine-card__header が無い").not.toBeNull();
      if (!header) return;
      const justify = getComputedStyle(header).justifyContent;
      // jsdom + vitest css: true で justify-content が解決される想定だが,
      // 環境差で空文字や未解決値が返るケースを許容. CSS 直読み (AC-7 / AC-8) で整合性を担保.
      expect(
        justify === "flex-end" || justify === "" || justify === "normal",
        `起票 header の computed justify-content が 'flex-end' でない (実際: "${justify}") (AC-25 / D-001 違反)`,
      ).toBe(true);
    });
  });
});
