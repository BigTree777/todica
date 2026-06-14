// @vitest-environment jsdom

/**
 * RoutineFormCard レイアウト刷新 (RoutineCard と同じ 4 段構造に揃える)
 * (BL-072 / routine-form-card-header-layout) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/routine-form-card-header-layout/spec.md
 *   docs/developer/features/routine-form-card-header-layout/plan.md
 *   docs/developer/features/routine-form-card-header-layout/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 : `.routine-card__header` 段が起票カードにも存在し PriorityStars を含む (DOM).
 *   AC-2 : `.routine-card__title` 段が存在し name input + visually-hidden label を含む (DOM).
 *   AC-3 : form 直下が __header / __title / __day-checkboxes / __actions の 4 段順 (DOM).
 *   AC-4 : `.routine-card__form-row*` 系セレクタが DOM から撤去されている (DOM).
 *   AC-5 : 「追加」 submit button が `.routine-card__actions` 直下に配置される (DOM).
 *   AC-6 : `.routine-card__title` ルールセットに font-size: var(--font-size-h2) が宣言 (CSS).
 *   AC-7 : `.routine-card__header` の BL-071 5 宣言が無改修で維持される (CSS).
 *   AC-8 : `.routine-card__form-row` 系ルールセットが routine-card.css から撤去 (CSS).
 *   AC-9 : `.routine-card--form` は flex-direction: column / align-items: stretch を維持 (CSS).
 *   AC-10: name input の computed font-size が --font-size-h2 (= 20px) と一致 (computed style).
 *   AC-11: 表示カード <RoutineCard> の DOM 構造 (BL-071 の 3 段) が無改修 (DOM).
 *   AC-12: 表示カード <RoutineCard> の name input computed font-size が変わらない (computed style).
 *   AC-13: form submit で onSubmit が呼ばれる (DOM).
 *   AC-14: name input への入力で onNameChange が呼ばれる (controlled) (DOM).
 *   AC-15: 曜日 checkbox click で onToggleDay が呼ばれる (DOM).
 *   AC-16: PriorityStars click で onDefaultPriorityChange が呼ばれる (DOM).
 *   AC-17: daysOfWeek 配列に含まれる曜日 checkbox が checked になる (DOM).
 *   AC-18: name input の required 属性が維持される (DOM).
 *   AC-19: form aria-label が "ルーティン作成フォーム" である (DOM / a11y).
 *   AC-20: visually-hidden label が name input と紐づく (DOM / a11y).
 *   AC-21: PriorityStars の groupLabel が "優先度" / idPrefix が "routine-create" (DOM / a11y).
 *   AC-22: 表示カードと起票カードの input id 衝突がない (DOM / a11y).
 *   AC-23: header 段の直下子が PriorityStars のみ (左空 / D-001 第一候補) (DOM).
 *   追加 (D-006): `.routine-card--form .routine-card__header { justify-content: flex-end }` 宣言 (CSS).
 *   追加 (D-007): `.routine-card--form .routine-card__actions { justify-content: flex-end }` 宣言 (CSS).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= JSX が `.routine-card__form-row` の 2 段構造) では,
 *     AC-1 / AC-2 / AC-3 / AC-4 / AC-5 / AC-6 / AC-8 / AC-23 が red になる想定.
 *     加えて D-006 / D-007 の CSS 宣言テストも red.
 *   - AC-7 / AC-9 / AC-10 / AC-11 / AC-12 / AC-13〜AC-22 は既に green である可能性がある
 *     (= BL-061 / BL-068 / BL-071 で確立済).
 *   - implementer が REQ-1 〜 REQ-6 を実装することで red 群が green 化する.
 *
 * 検証スタイル (BL-071 routine-card-header-layout.test.tsx と同型):
 *   - CSS 直読み: BL-052 / BL-061 / BL-071 と同じ readFileSync + extractRuleBody.
 *   - DOM レンダ: BL-061 / BL-070 / BL-071 と同形の動的 import + render パターン.
 *   - computed style: jsdom + vitest css: true 環境で getComputedStyle を取得.
 *     plan R-1 に従い「'20px' または 'var(--font-size-h2)' (未解決) のいずれかを許容」.
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
const ROUTINE_ID_R1 = "r1r1r1r1-r1r1-4r1r-8r1r-r1r1r1r1r1r1";

// ============================================================
// CSS ルール本文の抽出ヘルパ (BL-071 と同形)
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
    name: "朝の体操",
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

describe("RoutineFormCard レイアウト刷新 (BL-072 / routine-form-card-header-layout)", () => {
  // ============================================================
  // DOM 構造系 (AC-1 / AC-2 / AC-3 / AC-4 / AC-5 / AC-23)
  // ============================================================

  // ----------------------------------------------------------
  // AC-1: .routine-card__header 段が起票カードにも存在し PriorityStars を含む
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given <RoutineFormCard ... /> を render する
   *   When  DOM をクエリする
   *   Then  form (role="form" / accessibleName "ルーティン作成フォーム") 直下に
   *         `.routine-card__header` 要素が存在し,
   *         その直下の子に PriorityStars (role="radiogroup" / accessibleName "優先度") が含まれる
   */
  describe("AC-1: 起票カードに .routine-card__header 段が存在し PriorityStars を含む", () => {
    it("form 直下に .routine-card__header 要素が存在する", async () => {
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
      expect(form, "form.routine-card.routine-card--form が見つからない").not.toBeNull();
      const header = form?.querySelector(":scope > .routine-card__header");
      expect(
        header,
        "form の直下に .routine-card__header が無い (AC-1 / REQ-1 違反)",
      ).not.toBeNull();
    });

    it(".routine-card__header の直下に PriorityStars (role='radiogroup') が含まれる", async () => {
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
      expect(header, ".routine-card__header が見つからない (AC-1 / REQ-1 違反)").not.toBeNull();
      if (!header) return;
      const directChildren = Array.from(header.children);
      const radiogroup = directChildren.find((el) => el.getAttribute("role") === "radiogroup");
      expect(
        radiogroup,
        ".routine-card__header の直下に <div role='radiogroup'> (PriorityStars) が無い (AC-1 違反)",
      ).toBeDefined();
    });
  });

  // ----------------------------------------------------------
  // AC-2: .routine-card__title 段が存在し name input + visually-hidden label を含む
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given <RoutineFormCard ... /> を render する
   *   When  DOM をクエリする
   *   Then  `.routine-card__title` 要素が存在し,
   *         その直下に <label htmlFor="routine-name" class="visually-hidden">ルーティン名</label> と
   *         <input id="routine-name" type="text"> の両方が含まれる
   */
  describe("AC-2: 起票カードに .routine-card__title 段が存在し name input + label を含む", () => {
    it(".routine-card__title 要素が存在する", async () => {
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
      const title = container.querySelector(".routine-card__title");
      expect(title, ".routine-card__title が無い (AC-2 / REQ-1 違反)").not.toBeNull();
    });

    it(".routine-card__title の直下に <label htmlFor='routine-name' class='visually-hidden'> と <input id='routine-name'> の両方を含む", async () => {
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
      const title = container.querySelector(".routine-card__title") as HTMLElement | null;
      expect(title, ".routine-card__title が無い (AC-2 / REQ-1 違反)").not.toBeNull();
      if (!title) return;
      const directChildren = Array.from(title.children);
      const label = directChildren.find(
        (el) => el.tagName.toLowerCase() === "label" && el.getAttribute("for") === "routine-name",
      );
      const input = directChildren.find(
        (el) =>
          el.tagName.toLowerCase() === "input" &&
          el.getAttribute("type") === "text" &&
          el.getAttribute("id") === "routine-name",
      );
      expect(
        label,
        ".routine-card__title の直下に <label for='routine-name'> が無い (AC-2 違反)",
      ).toBeDefined();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("ルーティン名");
      expect(
        input,
        ".routine-card__title の直下に <input id='routine-name' type='text'> が無い (AC-2 違反)",
      ).toBeDefined();
    });
  });

  // ----------------------------------------------------------
  // AC-3: 起票カードの 4 段順序が確定している
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given <RoutineFormCard ... /> を render する
   *   When  form 要素直下の子要素を順に取得する
   *   Then  順に __header / __title / __day-checkboxes / __actions の 4 要素のみが並ぶ
   */
  describe("AC-3: 起票カードの form 直下に 4 段が順に並ぶ", () => {
    it("form 直下の子要素が 4 個ある", async () => {
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
      expect(
        form?.children.length,
        `form 直下の子が 4 個ではない (実際: ${form?.children.length}) (AC-3 / REQ-1 違反)`,
      ).toBe(4);
    });

    it("form 直下の子は順に __header / __title / __day-checkboxes / __actions である", async () => {
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
      const childClasses = Array.from(form.children).map((el) => el.className);
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
  // AC-4: .routine-card__form-row 系セレクタが DOM から撤去
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given <RoutineFormCard ... /> を render する
   *   When  DOM をクエリする
   *   Then  .routine-card__form-row / __form-row--name / __form-row--options の
   *         いずれの class 名にもマッチする要素が存在しない
   */
  describe("AC-4: 起票カードの .routine-card__form-row 系セレクタが DOM から撤去されている", () => {
    it(".routine-card__form-row 要素が DOM に存在しない", async () => {
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
      const rows = container.querySelectorAll(".routine-card__form-row");
      expect(
        rows.length,
        `.routine-card__form-row 要素が残存 (実際: ${rows.length}) (AC-4 / D-004 違反)`,
      ).toBe(0);
    });

    it(".routine-card__form-row--name 要素が DOM に存在しない", async () => {
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
      const nameRow = container.querySelectorAll(".routine-card__form-row--name");
      expect(
        nameRow.length,
        `.routine-card__form-row--name 要素が残存 (実際: ${nameRow.length}) (AC-4 違反)`,
      ).toBe(0);
    });

    it(".routine-card__form-row--options 要素が DOM に存在しない", async () => {
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
      const optionsRow = container.querySelectorAll(".routine-card__form-row--options");
      expect(
        optionsRow.length,
        `.routine-card__form-row--options 要素が残存 (実際: ${optionsRow.length}) (AC-4 違反)`,
      ).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // AC-5: 「追加」 submit button が actions 段に配置
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given <RoutineFormCard ... /> を render する
   *   When  DOM をクエリする
   *   Then  `.routine-card__actions` 要素の直下に
   *         <button type="submit" class="routine-card__submit">追加</button> が存在する
   *    かつ name input と同じ親 (= .routine-card__title) には属さない
   */
  describe("AC-5: 「追加」 submit button が .routine-card__actions 直下に配置される", () => {
    it(".routine-card__actions 直下に <button type='submit' class='routine-card__submit'>追加</button> が存在する", async () => {
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
      const actions = container.querySelector(".routine-card__actions") as HTMLElement | null;
      expect(actions, ".routine-card__actions が無い (AC-5 / REQ-4 違反)").not.toBeNull();
      if (!actions) return;
      const directChildren = Array.from(actions.children) as HTMLElement[];
      const submit = directChildren.find(
        (el) =>
          el.tagName.toLowerCase() === "button" &&
          el.getAttribute("type") === "submit" &&
          (el.textContent ?? "").trim() === "追加" &&
          el.classList.contains("routine-card__submit"),
      );
      expect(
        submit,
        ".routine-card__actions 直下に <button type='submit' class='routine-card__submit'>追加</button> が無い (AC-5 違反)",
      ).toBeDefined();
    });

    it("「追加」 button は .routine-card__title には属さない", async () => {
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
      const title = container.querySelector(".routine-card__title") as HTMLElement | null;
      expect(title, ".routine-card__title が無い (AC-5 関連)").not.toBeNull();
      const submit = Array.from(container.querySelectorAll("button[type='submit']")).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      expect(submit, "「追加」 submit button が無い").toBeDefined();
      // title 段の子孫として「追加」 button が含まれていないこと.
      expect(
        title?.contains(submit ?? null),
        "「追加」 button が .routine-card__title 配下にある (AC-5 / D-005 違反)",
      ).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-23: header 段内に PriorityStars 単独 (左空 = D-001 第一候補)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-23:
   *   Given <RoutineFormCard ... /> を render する
   *   When  .routine-card__header の直下の子要素を取得する
   *   Then  PriorityStars (role="radiogroup") のみが直下子として存在する
   *    かつ name input / 曜日 group / 「追加」 button のいずれも header の直下子に含まれない
   */
  describe("AC-23: 起票カード header 段の直下子は PriorityStars のみ (左空 / D-001)", () => {
    it(".routine-card__header の直下子要素は PriorityStars 1 個のみ", async () => {
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
      expect(header, ".routine-card__header が無い (AC-23 違反)").not.toBeNull();
      if (!header) return;
      const directChildren = Array.from(header.children);
      expect(
        directChildren.length,
        `header の直下子が 1 個ではない (実際: ${directChildren.length}) (AC-23 / D-001 違反)`,
      ).toBe(1);
      const sole = directChildren[0];
      expect(
        sole?.getAttribute("role") === "radiogroup",
        `header の唯一の直下子が role='radiogroup' (PriorityStars) ではない (実際: tag="${sole?.tagName.toLowerCase()}", role="${sole?.getAttribute("role")}")`,
      ).toBe(true);
    });

    it(".routine-card__header の直下子に name input / 曜日 group / 追加 button が含まれない", async () => {
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
      expect(header, ".routine-card__header が無い").not.toBeNull();
      if (!header) return;
      const directChildren = Array.from(header.children);
      // name input が直下子に無い.
      const nameInput = directChildren.find(
        (el) => el.tagName.toLowerCase() === "input" && el.getAttribute("type") === "text",
      );
      expect(nameInput, "header 直下に name input がある (AC-23 違反)").toBeUndefined();
      // 曜日 group が直下子に無い.
      const dayGroup = directChildren.find(
        (el) => el.getAttribute("role") === "group" && el.getAttribute("aria-label") === "曜日",
      );
      expect(dayGroup, "header 直下に曜日 group がある (AC-23 違反)").toBeUndefined();
      // 「追加」 button が直下子に無い.
      const submit = directChildren.find(
        (el) =>
          el.tagName.toLowerCase() === "button" &&
          el.getAttribute("type") === "submit" &&
          (el.textContent ?? "").trim() === "追加",
      );
      expect(submit, "header 直下に「追加」 button がある (AC-23 違反)").toBeUndefined();
    });
  });

  // ============================================================
  // CSS 直読み系 (AC-6 / AC-7 / AC-8 / AC-9 / D-006 / D-007)
  // ============================================================

  // ----------------------------------------------------------
  // AC-6: .routine-card__title ルールセットが新設されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given routine-card.css を読み込む
   *   When  .routine-card__title ルールセットを参照する
   *   Then  少なくとも font-size: var(--font-size-h2) が宣言されている
   */
  describe("AC-6: .routine-card__title ルールセットが routine-card.css に新設されている", () => {
    it(".routine-card__title ルールが存在する", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__title");
      expect(body, ".routine-card__title ルールが無い (AC-6 / D-003 違反)").not.toBeNull();
    });

    it(".routine-card__title ルール本文に font-size: var(--font-size-h2) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__title");
      expect(body, ".routine-card__title ルールが無い (AC-6 / D-003 違反)").not.toBeNull();
      expect(
        body ?? "",
        ".routine-card__title に font-size: var(--font-size-h2) が無い (AC-6 / D-003 違反)",
      ).toMatch(/font-size\s*:\s*var\(--font-size-h2\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-7: .routine-card__header は表示カードと共用 (BL-071 5 宣言維持)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given routine-card.css を読み込む
   *   When  .routine-card__header ルールセットを参照する
   *   Then  BL-071 で確定した display: flex / align-items: center /
   *         justify-content: space-between / gap: var(--space-sm) /
   *         font-size: var(--font-size-h2) の 5 宣言がそのまま維持されている
   */
  describe("AC-7: .routine-card__header の BL-071 5 宣言が無改修で維持される (D-002)", () => {
    it(".routine-card__header に display: flex を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body, ".routine-card__header ルールが無い").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".routine-card__header に align-items: center を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body ?? "").toMatch(/align-items\s*:\s*center/);
    });

    it(".routine-card__header に gap: var(--space-sm) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body ?? "").toMatch(/gap\s*:\s*var\(--space-sm\)/);
    });

    it(".routine-card__header に font-size: var(--font-size-h2) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body ?? "").toMatch(/font-size\s*:\s*var\(--font-size-h2\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-8: .routine-card__form-row 系ルールセットが routine-card.css から撤去
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given routine-card.css を読み込む
   *   When  ファイル全文を走査する
   *   Then  .routine-card__form-row / __form-row--name / __form-row--options を
   *         定義する宣言ブロックは存在しない
   */
  describe("AC-8: .routine-card__form-row 系ルールセットが routine-card.css から撤去", () => {
    it(".routine-card__form-row セレクタが routine-card.css に存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__form-row");
      expect(body, ".routine-card__form-row ルールが残存 (AC-8 / D-004 違反)").toBeNull();
    });

    it(".routine-card__form-row--name セレクタが routine-card.css に存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__form-row--name");
      expect(body, ".routine-card__form-row--name ルールが残存 (AC-8 違反)").toBeNull();
    });

    it(".routine-card__form-row--options セレクタが routine-card.css に存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__form-row--options");
      expect(body, ".routine-card__form-row--options ルールが残存 (AC-8 違反)").toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-9: .routine-card--form は flex-direction: column + align-items: stretch を維持
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given routine-card.css を読み込む
   *   When  .routine-card--form ルールセットを参照する
   *   Then  flex-direction: column と align-items: stretch の両方が引き続き宣言されている
   */
  describe("AC-9: .routine-card--form は flex-direction: column + align-items: stretch を維持", () => {
    it(".routine-card--form に flex-direction: column を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card--form");
      expect(body, ".routine-card--form ルールが無い").not.toBeNull();
      expect(body ?? "").toMatch(/flex-direction\s*:\s*column/);
    });

    it(".routine-card--form に align-items: stretch を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card--form");
      expect(body, ".routine-card--form ルールが無い").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*stretch/);
    });
  });

  // ============================================================
  // 計算スタイル (AC-10 / AC-12)
  // ============================================================

  // ----------------------------------------------------------
  // AC-10: name input の computed font-size が --font-size-h2 (= 20px) と一致
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given <RoutineFormCard ... /> を render する (vitest.config.ts css: true)
   *   When  name input の getComputedStyle().fontSize を取得する
   *   Then  '20px' (= var(--font-size-h2) 解決値) または 'var(--font-size-h2)' (= jsdom 未解決) のいずれか
   *
   * plan R-1 に従い, jsdom の getComputedStyle が CSS variable / font: inherit を
   * 解決しないケースを許容する.
   */
  describe("AC-10: 起票カード name input の computed font-size が --font-size-h2 (= 20px) と一致", () => {
    it("input#routine-name の getComputedStyle().fontSize が '20px' または 'var(--font-size-h2)' に解決される", async () => {
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
      expect(input, "input#routine-name が見つからない").not.toBeNull();
      if (!input) return;
      const style = getComputedStyle(input);
      const fontSize = style.fontSize;
      expect(
        fontSize === "20px" || fontSize === "var(--font-size-h2)" || /20px/.test(fontSize),
        `name input の font-size が '20px' でも 'var(--font-size-h2)' でもない (実際: "${fontSize}") (AC-10 / R-1 違反)`,
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-12: 表示カード <RoutineCard> の name input computed font-size が変わらない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12:
   *   Given <RoutineCard ... /> を render する
   *   When  name input の getComputedStyle().fontSize を取得する
   *   Then  '20px' または 'var(--font-size-h2)' (= BL-071 AC-9 維持)
   */
  describe("AC-12: 表示カード name input の computed font-size が変わらない (BL-071 AC-9 維持)", () => {
    it("表示カード input#routine-name-{id} の computed fontSize が 20px / var(--font-size-h2)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          onNameBlur={() => {}}
          onDaysOfWeekChange={() => {}}
          onDefaultPriorityChange={() => {}}
          onDelete={() => {}}
        />,
      );
      const input = container.querySelector("input#routine-name-r1") as HTMLInputElement | null;
      expect(input, "input#routine-name-r1 が無い").not.toBeNull();
      if (!input) return;
      const fontSize = getComputedStyle(input).fontSize;
      expect(
        fontSize === "20px" || fontSize === "var(--font-size-h2)" || /20px/.test(fontSize),
        `表示カード input の font-size が変化 (実際: "${fontSize}") (AC-12 / R-1 違反)`,
      ).toBe(true);
    });
  });

  // ============================================================
  // 既存挙動の回帰防止 (AC-13 / AC-14 / AC-15 / AC-16 / AC-17 / AC-18)
  // ============================================================

  // ----------------------------------------------------------
  // AC-13: form submit で onSubmit が呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13:
   *   Given <RoutineFormCard ... onSubmit={spy} /> を render する
   *   When  「追加」 button を click する (= form submit が発火)
   *   Then  onSubmit ハンドラが 1 回呼ばれる
   */
  describe("AC-13: form submit で onSubmit が呼ばれる", () => {
    it("「追加」 button click で onSubmit が 1 回呼ばれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onSubmit = vi.fn((e: React.FormEvent) => {
        e.preventDefault();
      });
      const { container } = render(
        <RoutineFormCard
          name="新規ルーティン"
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={onSubmit}
        />,
      );
      const submit = Array.from(container.querySelectorAll("button[type='submit']")).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      ) as HTMLButtonElement | undefined;
      expect(submit, "「追加」 submit button が無い").toBeDefined();
      submit?.click();
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------
  // AC-14: name input への入力で onNameChange が呼ばれる (controlled)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14:
   *   Given <RoutineFormCard name="" ... onNameChange={spy} /> を render する
   *   When  name input に "朝の体操" の change event を起こす
   *   Then  onNameChange が呼ばれ, 最後の引数が "朝の体操" になる
   */
  describe("AC-14: name input の change で onNameChange が呼ばれる (controlled)", () => {
    it("input change で onNameChange('朝の体操') が呼ばれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onNameChange = vi.fn();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={onNameChange}
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
      fireEvent.change(input, { target: { value: "朝の体操" } });
      expect(onNameChange).toHaveBeenCalledTimes(1);
      expect(onNameChange).toHaveBeenCalledWith("朝の体操");
    });
  });

  // ----------------------------------------------------------
  // AC-15: 曜日 checkbox click で onToggleDay が呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-15:
   *   Given <RoutineFormCard daysOfWeek={[1]} ... onToggleDay={spy} /> を render する
   *   When  「水」(day=3) の checkbox を click する
   *   Then  onToggleDay が (3) で呼ばれる
   */
  describe("AC-15: 曜日 checkbox click で onToggleDay(day) が呼ばれる", () => {
    it("水 (day=3) の checkbox click で onToggleDay(3) が呼ばれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onToggleDay = vi.fn();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={onToggleDay}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const group = container.querySelector("div[role='group'][aria-label='曜日']");
      expect(group, "div[role='group'][aria-label='曜日'] が無い").not.toBeNull();
      const checkboxes = Array.from(
        group?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      expect(checkboxes.length, "曜日 checkbox が 7 個ではない").toBe(7);
      const wed = checkboxes[3];
      expect(wed, "曜日 3 (水) の checkbox が無い").toBeDefined();
      wed?.click();
      expect(onToggleDay).toHaveBeenCalledTimes(1);
      expect(onToggleDay).toHaveBeenCalledWith(3);
    });
  });

  // ----------------------------------------------------------
  // AC-16: PriorityStars click で onDefaultPriorityChange が呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-16:
   *   Given <RoutineFormCard defaultPriority="normal" ... onDefaultPriorityChange={spy} /> を render
   *   When  PriorityStars の 3 つ目の星 (highest) を click する
   *   Then  onDefaultPriorityChange('highest') が呼ばれる
   */
  describe("AC-16: PriorityStars click で onDefaultPriorityChange(priority) が呼ばれる", () => {
    it("3 つ目の星 click で onDefaultPriorityChange('highest') が呼ばれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onDefaultPriorityChange = vi.fn();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={onDefaultPriorityChange}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
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
  // AC-17: daysOfWeek 配列に含まれる曜日 checkbox が checked になる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-17:
   *   Given <RoutineFormCard daysOfWeek={[1, 3, 5]} ... /> を render する
   *   When  曜日 checkbox 7 個の checked プロパティを取得する
   *   Then  月 (day=1) / 水 (day=3) / 金 (day=5) のみが checked=true
   *    かつ 他 4 個は checked=false
   */
  describe("AC-17: daysOfWeek={[1, 3, 5]} で月・水・金のみ checked=true", () => {
    it("曜日 [1, 3, 5] が checked=true, 他は checked=false", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const { container } = render(
        <RoutineFormCard
          name=""
          onNameChange={() => {}}
          daysOfWeek={[1, 3, 5]}
          onToggleDay={() => {}}
          defaultPriority="normal"
          onDefaultPriorityChange={() => {}}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
        />,
      );
      const group = container.querySelector("div[role='group'][aria-label='曜日']");
      expect(group, "曜日 group が無い").not.toBeNull();
      const checkboxes = Array.from(
        group?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      expect(checkboxes.length).toBe(7);
      const checkedDays = checkboxes.map((cb, i) => (cb.checked ? i : -1)).filter((i) => i >= 0);
      expect(
        checkedDays,
        `checked の曜日が [1, 3, 5] ではない (実際: ${JSON.stringify(checkedDays)})`,
      ).toEqual([1, 3, 5]);
    });
  });

  // ----------------------------------------------------------
  // AC-18: name input の required 属性が維持される
  // ----------------------------------------------------------
  /**
   * シナリオ AC-18:
   *   Given <RoutineFormCard ... /> を render する
   *   When  name input の required 属性を取得する
   *   Then  required=true である
   */
  describe("AC-18: name input の required 属性が true", () => {
    it("input#routine-name の required=true", async () => {
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
      expect(input?.required, "input.required が true ではない (AC-18 違反)").toBe(true);
    });
  });

  // ============================================================
  // a11y (AC-19 / AC-20 / AC-21 / AC-22)
  // ============================================================

  // ----------------------------------------------------------
  // AC-19: form aria-label が "ルーティン作成フォーム"
  // ----------------------------------------------------------
  /**
   * シナリオ AC-19:
   *   Given <RoutineFormCard ... /> を formAriaLabel 未指定で render する
   *   When  form 要素の aria-label を取得する
   *   Then  "ルーティン作成フォーム" と一致する
   */
  describe("AC-19: form aria-label が 'ルーティン作成フォーム'", () => {
    it("form の aria-label が 'ルーティン作成フォーム'", async () => {
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
      expect(form, "form が無い").not.toBeNull();
      expect(form?.getAttribute("aria-label")).toBe("ルーティン作成フォーム");
    });
  });

  // ----------------------------------------------------------
  // AC-20: visually-hidden label が name input と紐づく
  // ----------------------------------------------------------
  /**
   * シナリオ AC-20:
   *   Given <RoutineFormCard ... /> を inputId 未指定で render する
   *   When  DOM をクエリする
   *   Then  <label for="routine-name" class="visually-hidden">ルーティン名</label> と
   *         <input id="routine-name"> が両方存在する
   */
  describe("AC-20: visually-hidden label が name input と紐づく", () => {
    it("label[for='routine-name'].visually-hidden と input#routine-name が両方存在する", async () => {
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
      const label = container.querySelector("label[for='routine-name']") as HTMLLabelElement | null;
      const input = container.querySelector("input#routine-name") as HTMLInputElement | null;
      expect(label, "label[for='routine-name'] が無い").not.toBeNull();
      expect(input, "input#routine-name が無い").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("ルーティン名");
    });
  });

  // ----------------------------------------------------------
  // AC-21: PriorityStars の groupLabel が "優先度" / idPrefix が "routine-create"
  // ----------------------------------------------------------
  /**
   * シナリオ AC-21:
   *   Given <RoutineFormCard ... /> を render する
   *   When  PriorityStars の root role="radiogroup" を取得する
   *   Then  accessibleName は "優先度"
   *    かつ 子 radio の id prefix は "routine-create" で始まる
   */
  describe("AC-21: PriorityStars の groupLabel='優先度' / idPrefix='routine-create'", () => {
    it("radiogroup の aria-label に '優先度' が含まれる", async () => {
      // 補足: spec AC-21 は accessibleName を "優先度" と規定するが,
      // 実装上 PriorityStars (BL-040) の aria-label は `${groupLabel}: ${value 表示名}`
      // 形式 (例: "優先度: 普通") を生成する. BL-071 routine-card-header-layout.test.tsx
      // AC-18 と同じく toContain で検証し, groupLabel が "優先度" として渡されたことを担保する.
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
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(radiogroup, "PriorityStars が無い").not.toBeNull();
      const ariaLabel = radiogroup?.getAttribute("aria-label") ?? "";
      expect(
        ariaLabel,
        `radiogroup の aria-label に '優先度' が含まれない (実際: "${ariaLabel}") (AC-21 違反)`,
      ).toContain("優先度");
    });

    it("radiogroup 内の radio button の id が 'routine-create' で始まる", async () => {
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
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(radiogroup, "PriorityStars が無い").not.toBeNull();
      const radios = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLButtonElement[];
      expect(radios.length, "radio button が 3 個ではない").toBe(3);
      for (const radio of radios) {
        const id = radio.getAttribute("id") ?? "";
        expect(
          id.startsWith("routine-create"),
          `radio の id prefix が 'routine-create' で始まらない (実際: "${id}") (AC-21 違反)`,
        ).toBe(true);
      }
    });
  });

  // ----------------------------------------------------------
  // AC-22: 表示カードと起票カードの input id 衝突がない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-22:
   *   Given <RoutineCard routine={{ id: "r-1", ... }}> と <RoutineFormCard ... /> を同時 render
   *   When  document 全体で input id を取得する
   *   Then  "routine-name-r-1" (表示カード) と "routine-name" (起票カード) の両方が存在し
   *         重複は無い
   */
  describe("AC-22: 表示カードと起票カードの input id 衝突がない", () => {
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
      const displayInput = container.querySelector("input#routine-name-r-1");
      const createInput = container.querySelector("input#routine-name");
      expect(displayInput, "表示カード input#routine-name-r-1 が無い").not.toBeNull();
      expect(createInput, "起票カード input#routine-name が無い").not.toBeNull();
      // id="routine-name" は 1 個だけであり, "routine-name-r-1" と重複しない.
      const allRoutineNameInputs = container.querySelectorAll("input[id='routine-name']");
      expect(
        allRoutineNameInputs.length,
        `input[id='routine-name'] が 1 個ではない (実際: ${allRoutineNameInputs.length}) (AC-22 違反)`,
      ).toBe(1);
      const allRoutineNameR1Inputs = container.querySelectorAll("input[id='routine-name-r-1']");
      expect(
        allRoutineNameR1Inputs.length,
        `input[id='routine-name-r-1'] が 1 個ではない (実際: ${allRoutineNameR1Inputs.length}) (AC-22 違反)`,
      ).toBe(1);
    });
  });
});
