// @vitest-environment jsdom

/**
 * RoutineCard ヘッダレイアウト刷新 (TaskCard と同じ 3 段構造に揃える)
 * (BL-071 / routine-card-header-layout) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-header-layout/spec.md
 *   docs/developer/features/routine-card-header-layout/plan.md
 *   docs/developer/features/routine-card-header-layout/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 : name input と PriorityStars が同一の .routine-card__header 直下に並ぶ (DOM).
 *   AC-2 : .routine-card__main ラッパが撤去されている (DOM).
 *   AC-3 : .routine-card 直下に header / day-checkboxes / actions の 3 段のみが並ぶ (DOM).
 *   AC-4 : .routine-card は display: flex + flex-direction: column である (CSS 直読み).
 *   AC-5 : .routine-card__header は display: flex + align-items: center + justify-content: space-between (CSS).
 *   AC-6 : .routine-card__header の font-size は var(--font-size-h2) である (CSS 直読み).
 *   AC-7 : .routine-card__input は font: inherit と flex: 1 を持つ (CSS 直読み).
 *   AC-8 : .routine-card__main ルールセットが撤去されている (CSS 直読み).
 *   AC-9 : name input の computed font-size が --font-size-h2 (= 20px) と一致する (computed style).
 *   AC-10: .routine-card--form は flex-direction: column / align-items: stretch を維持 (CSS 直読み).
 *   AC-11: <RoutineFormCard> の DOM 構造が既存と変わらない (= 2 段構成 + 主要要素) (DOM).
 *   AC-12: 空文字 blur で input が routine.name に書き戻され onNameBlur が ("") で呼ばれる (DOM / BL-070 D-002 維持).
 *   AC-13: 同値 blur で input の value は維持されたまま onNameBlur が同値で呼ばれる (DOM).
 *   AC-14: 曜日 checkbox click で onDaysOfWeekChange が次の配列で呼ばれる (DOM / BL-068 維持).
 *   AC-15: PriorityStars click で onDefaultPriorityChange が呼ばれる (DOM / BL-069 維持).
 *   AC-16: 「削除」 button click で onDelete が 1 回呼ばれる (DOM).
 *   AC-17: visually-hidden label が name input と htmlFor / id で紐づく (DOM / a11y).
 *   AC-18: PriorityStars の accessibleName が "${routine.name} の優先度" / idPrefix が "routine-${routine.id}" (DOM / a11y).
 *   AC-19: header 内で visually-hidden label → input → PriorityStars の順で並ぶ (DOM / 順序).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= JSX が .routine-card__main 構造 / CSS が flex-direction: row 構造) では,
 *     AC-1 / AC-2 / AC-3 / AC-4 / AC-5 / AC-6 / AC-7 / AC-8 / AC-9 / AC-18 / AC-19 が red になる想定.
 *   - AC-10 / AC-11 / AC-12 / AC-13 / AC-14 / AC-15 / AC-16 / AC-17 は既存挙動の回帰防止のため
 *     実装前から green である可能性がある (= BL-061 / BL-068 / BL-069 / BL-070 で確立済み).
 *   - implementer が REQ-1 〜 REQ-8 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 / BL-059 / BL-061 等と同じ readFileSync + extractRuleBody.
 *   - DOM レンダ: BL-061 / BL-070 と同形の動的 import + render パターン.
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
const ROUTINE_ID_R1 = "r1r1r1r1-r1r1-4r1r-8r1r-r1r1r1r1r1r1";

// ============================================================
// CSS ルール本文の抽出ヘルパ (BL-061 と同形)
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

describe("RoutineCard ヘッダレイアウト刷新 (BL-071 / routine-card-header-layout)", () => {
  // ============================================================
  // DOM 構造系 (AC-1 / AC-2 / AC-3)
  // ============================================================

  // ----------------------------------------------------------
  // AC-1: name input と PriorityStars が同一の .routine-card__header 直下に並ぶ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-1:
   *   Given <RoutineCard routine={...} ... /> を表示モードで render する
   *   When  DOM をクエリする
   *   Then  .routine-card__header 要素が存在し,
   *         その直下の子に <input type="text"> と PriorityStars の root (role="radiogroup") の
   *         両方が含まれる
   *    かつ name input は曜日 checkbox 群 (.routine-card__day-checkboxes) と同じ親に属さない
   */
  describe("AC-1: name input と PriorityStars が同一の .routine-card__header 直下に並ぶ", () => {
    it(".routine-card__header 要素が存在する", async () => {
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
      const header = container.querySelector(".routine-card__header");
      expect(header, ".routine-card__header が見つからない (AC-1 違反)").not.toBeNull();
    });

    it(".routine-card__header の直下に input[type=text] と div[role=radiogroup] の両方が含まれる", async () => {
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
      expect(header, ".routine-card__header が見つからない (AC-1 違反)").not.toBeNull();
      if (!header) return;
      // 直下の子要素から input と radiogroup を見つける.
      const directChildren = Array.from(header.children);
      const input = directChildren.find(
        (el) => el.tagName.toLowerCase() === "input" && el.getAttribute("type") === "text",
      );
      const radiogroup = directChildren.find((el) => el.getAttribute("role") === "radiogroup");
      expect(
        input,
        ".routine-card__header の直下に <input type='text'> が無い (AC-1 違反)",
      ).toBeDefined();
      expect(
        radiogroup,
        ".routine-card__header の直下に <div role='radiogroup'> (PriorityStars) が無い (AC-1 違反)",
      ).toBeDefined();
    });

    it("name input は曜日 checkbox 群 (.routine-card__day-checkboxes) と同じ親には属さない", async () => {
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
      const input = container.querySelector(
        "input#routine-name-r1[type='text']",
      ) as HTMLElement | null;
      const dayCheckboxes = container.querySelector(
        ".routine-card__day-checkboxes",
      ) as HTMLElement | null;
      expect(input, "name input が見つからない").not.toBeNull();
      expect(dayCheckboxes, ".routine-card__day-checkboxes が見つからない").not.toBeNull();
      if (!input || !dayCheckboxes) return;
      expect(
        input.parentElement === dayCheckboxes.parentElement,
        "name input と .routine-card__day-checkboxes が同じ親に属している (AC-1 違反)",
      ).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // AC-2: .routine-card__main ラッパが撤去されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-2:
   *   Given <RoutineCard ... /> を表示モードで render する
   *   When  DOM をクエリする
   *   Then  .routine-card__main セレクタにマッチする要素は存在しない
   */
  describe("AC-2: .routine-card__main ラッパが DOM から撤去されている", () => {
    it(".routine-card__main 要素が DOM に存在しない", async () => {
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
      const main = container.querySelector(".routine-card__main");
      expect(main, ".routine-card__main 要素が残存 (AC-2 / REQ-3 違反)").toBeNull();
    });
  });

  // ----------------------------------------------------------
  // AC-3: .routine-card 直下に header / day-checkboxes / actions の 3 段のみが並ぶ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-3:
   *   Given <RoutineCard ... /> を表示モードで render する
   *   When  .routine-card の直下の子要素を取得する
   *   Then  順に .routine-card__header / .routine-card__day-checkboxes / .routine-card__actions の
   *         3 要素のみが存在する
   */
  describe("AC-3: .routine-card 直下に 3 段 (header / day-checkboxes / actions) のみが並ぶ", () => {
    it(".routine-card の直下の子要素が 3 個ある", async () => {
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
      expect(root, ".routine-card root が見つからない").not.toBeNull();
      if (!root) return;
      expect(
        root.children.length,
        `.routine-card の直下の子が 3 個ではない (実際: ${root.children.length})`,
      ).toBe(3);
    });

    it(".routine-card 直下の子は順に __header / __day-checkboxes / __actions である", async () => {
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
      expect(root, ".routine-card root が見つからない").not.toBeNull();
      if (!root) return;
      const childClasses = Array.from(root.children).map((el) => el.className);
      expect(
        childClasses[0]?.includes("routine-card__header"),
        `1 番目の子が .routine-card__header ではない (実際: "${childClasses[0]}")`,
      ).toBe(true);
      expect(
        childClasses[1]?.includes("routine-card__day-checkboxes"),
        `2 番目の子が .routine-card__day-checkboxes ではない (実際: "${childClasses[1]}")`,
      ).toBe(true);
      expect(
        childClasses[2]?.includes("routine-card__actions"),
        `3 番目の子が .routine-card__actions ではない (実際: "${childClasses[2]}")`,
      ).toBe(true);
    });
  });

  // ============================================================
  // CSS 直読み系 (AC-4 / AC-5 / AC-6 / AC-7 / AC-8 / AC-10)
  // ============================================================

  // ----------------------------------------------------------
  // AC-4: .routine-card は display: flex + flex-direction: column である
  // ----------------------------------------------------------
  /**
   * シナリオ AC-4:
   *   Given routine-card.css を読み込む
   *   When  .routine-card ルールセットを参照する
   *   Then  display: flex と flex-direction: column が宣言されている
   */
  describe("AC-4: .routine-card は display: flex + flex-direction: column である", () => {
    it(".routine-card ルール本文に display: flex を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".routine-card ルール本文に flex-direction: column を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card");
      expect(body, ".routine-card ルールが見つからない").not.toBeNull();
      expect(
        body ?? "",
        ".routine-card に flex-direction: column が無い (AC-4 / REQ-3 違反)",
      ).toMatch(/flex-direction\s*:\s*column/);
    });
  });

  // ----------------------------------------------------------
  // AC-5: .routine-card__header は display: flex + align-items: center + justify-content: space-between
  // ----------------------------------------------------------
  /**
   * シナリオ AC-5:
   *   Given routine-card.css を読み込む
   *   When  .routine-card__header ルールセットを参照する
   *   Then  display: flex / align-items: center / justify-content: space-between が宣言されている
   */
  describe("AC-5: .routine-card__header は space-between で左右配置される", () => {
    it(".routine-card__header ルール本文に display: flex を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body, ".routine-card__header ルールが見つからない (AC-5 / REQ-4 違反)").not.toBeNull();
      expect(body ?? "").toMatch(/display\s*:\s*flex/);
    });

    it(".routine-card__header ルール本文に align-items: center を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body, ".routine-card__header ルールが見つからない (AC-5 / REQ-4 違反)").not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*center/);
    });

    it(".routine-card__header ルール本文に justify-content: space-between を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body, ".routine-card__header ルールが見つからない (AC-5 / REQ-4 違反)").not.toBeNull();
      expect(body ?? "").toMatch(/justify-content\s*:\s*space-between/);
    });
  });

  // ----------------------------------------------------------
  // AC-6: .routine-card__header の font-size は var(--font-size-h2) である
  // ----------------------------------------------------------
  /**
   * シナリオ AC-6:
   *   Given routine-card.css を読み込む
   *   When  .routine-card__header ルールセットを参照する
   *   Then  font-size: var(--font-size-h2) が宣言されている
   */
  describe("AC-6: .routine-card__header の font-size は var(--font-size-h2) である", () => {
    it(".routine-card__header ルール本文に font-size: var(--font-size-h2) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__header");
      expect(body, ".routine-card__header ルールが見つからない (AC-6 / REQ-6 違反)").not.toBeNull();
      expect(
        body ?? "",
        ".routine-card__header に font-size: var(--font-size-h2) が無い (AC-6 / REQ-6 違反)",
      ).toMatch(/font-size\s*:\s*var\(--font-size-h2\)/);
    });
  });

  // ----------------------------------------------------------
  // AC-7: .routine-card__input は font: inherit と flex: 1 を持つ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-7:
   *   Given routine-card.css を読み込む
   *   When  .routine-card__input ルールセットを参照する
   *   Then  font: inherit と flex: 1 の両方が宣言されている
   */
  describe("AC-7: .routine-card__input は font: inherit と flex: 1 を持つ", () => {
    it(".routine-card__input ルール本文に font: inherit を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__input");
      expect(body, ".routine-card__input ルールが見つからない").not.toBeNull();
      expect(
        body ?? "",
        ".routine-card__input に font: inherit が無い (AC-7 / REQ-6 / D-002 違反)",
      ).toMatch(/(?:^|;|\n|\s)font\s*:\s*inherit/);
    });

    it(".routine-card__input ルール本文に flex: 1 (または flex-grow: 1) を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__input");
      expect(body, ".routine-card__input ルールが見つからない").not.toBeNull();
      const bodyText = body ?? "";
      const hasShorthand = /(?:^|;|\n)\s*flex\s*:\s*1(?:\s|;|$)/.test(bodyText);
      const hasFlexGrow = /flex-grow\s*:\s*1/.test(bodyText);
      expect(
        hasShorthand || hasFlexGrow,
        ".routine-card__input に flex: 1 (または flex-grow: 1) が無い (AC-7 / REQ-5 違反)",
      ).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // AC-8: .routine-card__main ルールセットが撤去されている
  // ----------------------------------------------------------
  /**
   * シナリオ AC-8:
   *   Given routine-card.css を読み込む
   *   When  ファイル全文を走査する
   *   Then  .routine-card__main セレクタを定義する宣言ブロックは存在しない
   */
  describe("AC-8: .routine-card__main ルールセットが routine-card.css から撤去されている", () => {
    it(".routine-card__main セレクタが routine-card.css に存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__main");
      expect(body, ".routine-card__main ルールが残存 (AC-8 / D-006 / REQ-3 違反)").toBeNull();
    });
  });

  // ============================================================
  // 計算スタイル (AC-9)
  // ============================================================

  // ----------------------------------------------------------
  // AC-9: name input の computed font-size が --font-size-h2 (= 20px) と一致する
  // ----------------------------------------------------------
  /**
   * シナリオ AC-9:
   *   Given <RoutineCard ... /> を表示モードで render する (vitest.config.ts css: true)
   *   When  name input の getComputedStyle().fontSize を取得する
   *   Then  '20px' (= var(--font-size-h2) 解決値) または 'var(--font-size-h2)' (= jsdom 未解決) のいずれか
   *
   * plan R-1 に従い, jsdom の getComputedStyle が CSS variable + font: inherit を
   * 解決しないケースを許容する.
   */
  describe("AC-9: name input の computed font-size が --font-size-h2 と一致する", () => {
    it("input#routine-name-{id} の getComputedStyle().fontSize が '20px' または 'var(--font-size-h2)' に解決される", async () => {
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
      expect(input, "input#routine-name-r1 が見つからない").not.toBeNull();
      if (!input) return;
      const style = getComputedStyle(input);
      const fontSize = style.fontSize;
      // jsdom + vite css: true 環境では CSS 変数を解決するケースと未解決ケースがあるため,
      // どちらも許容する (plan R-1).
      expect(
        fontSize === "20px" || fontSize === "var(--font-size-h2)" || /20px/.test(fontSize),
        `name input の font-size が '20px' でも 'var(--font-size-h2)' でもない (実際: "${fontSize}")`,
      ).toBe(true);
    });
  });

  // ============================================================
  // 起票カードの不変性 (AC-10 / AC-11)
  // ============================================================

  // ----------------------------------------------------------
  // AC-10: .routine-card--form は flex-direction: column / align-items: stretch を維持
  // ----------------------------------------------------------
  /**
   * シナリオ AC-10:
   *   Given routine-card.css を読み込む
   *   When  .routine-card--form ルールセットを参照する
   *   Then  flex-direction: column および align-items: stretch が引き続き宣言されている
   */
  describe("AC-10: .routine-card--form は flex-direction: column / align-items: stretch を維持", () => {
    it(".routine-card--form ルール本文に flex-direction: column を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card--form");
      expect(
        body,
        ".routine-card--form ルールが見つからない (AC-10 / REQ-7 / D-005 違反)",
      ).not.toBeNull();
      expect(body ?? "").toMatch(/flex-direction\s*:\s*column/);
    });

    it(".routine-card--form ルール本文に align-items: stretch を含む", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card--form");
      expect(
        body,
        ".routine-card--form ルールが見つからない (AC-10 / REQ-7 / D-005 違反)",
      ).not.toBeNull();
      expect(body ?? "").toMatch(/align-items\s*:\s*stretch/);
    });
  });

  // ----------------------------------------------------------
  // AC-11: <RoutineFormCard> の DOM 構造が既存と変わらない
  // ----------------------------------------------------------
  /**
   * シナリオ AC-11:
   *   Given <RoutineFormCard ... /> を render する
   *   When  DOM をクエリする
   *   Then  root 要素は <form class="routine-card routine-card--form"> のまま
   *    かつ .routine-card__form-row--name と .routine-card__form-row--options の 2 段が存在する
   *    かつ name input + 「追加」 button + 曜日 7 checkbox + PriorityStars が全て描画される
   *
   * 補足: 既存実装の row class 名が "routine-card__form-row--name" / "routine-card__form-row--options"
   *   ではなく単に "routine-card__form-row" の場合は緩めて, 「.routine-card__form-row が 2 個」で代替する.
   */
  describe("AC-11: <RoutineFormCard> の DOM 構造が既存と変わらない (= 起票カードの不変性)", () => {
    it("root は <form class='routine-card routine-card--form'> のまま", async () => {
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
      const root = container.firstElementChild as HTMLElement | null;
      expect(root, "RoutineFormCard の root が見つからない").not.toBeNull();
      expect(root?.tagName.toLowerCase()).toBe("form");
      expect(root?.classList.contains("routine-card")).toBe(true);
      expect(root?.classList.contains("routine-card--form")).toBe(true);
    });

    it(".routine-card__form-row 要素が 2 個 (2 段構成) 存在する", async () => {
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
        `.routine-card__form-row 要素が 2 個ではない (実際: ${rows.length}) (AC-11 違反)`,
      ).toBe(2);
    });

    it("name input + 「追加」 button + 曜日 7 checkbox + PriorityStars が全て描画される", async () => {
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
      // name input.
      const nameInput = container.querySelector(
        "input#routine-name[type='text']",
      ) as HTMLInputElement | null;
      expect(nameInput, "起票カードの name input が無い").not.toBeNull();
      // 追加 submit.
      const submit = Array.from(container.querySelectorAll("button[type='submit']")).find(
        (b) => (b.textContent ?? "").trim() === "追加",
      );
      expect(submit, "「追加」 submit button が無い").toBeDefined();
      // 曜日 checkbox 7 個.
      const checkboxes = container.querySelectorAll(
        ".routine-card__day-checkboxes input[type='checkbox']",
      );
      expect(checkboxes.length, "曜日 checkbox が 7 個ではない").toBe(7);
      // PriorityStars.
      const radiogroup = container.querySelector("div[role='radiogroup']");
      expect(radiogroup, "PriorityStars が無い").not.toBeNull();
    });
  });

  // ============================================================
  // 既存挙動の回帰防止 (AC-12 〜 AC-16)
  // ============================================================

  // ----------------------------------------------------------
  // AC-12: 空文字 blur で input が routine.name に書き戻され onNameBlur が ("") で呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-12 (BL-070 D-002 維持):
   *   Given <RoutineCard routine={{name: "朝の体操"}} ... /> を render する
   *   When  name input に空文字を入力して blur する
   *   Then  input の value が "朝の体操" に書き戻される
   *    かつ onNameBlur は ("") で呼ばれる
   */
  describe("AC-12: 空文字 blur で input が元の名前に書き戻される (BL-070 D-002 維持)", () => {
    it("空文字 blur で input.value が routine.name に書き戻され, onNameBlur('') が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1", name: "朝の体操" });
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
      const input = container.querySelector("input#routine-name-r1") as HTMLInputElement | null;
      expect(input, "input が見つからない").not.toBeNull();
      if (!input) return;
      // 空文字に変更して blur.
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.blur(input);
      // input の value が元の名前に書き戻される.
      expect(
        input.value,
        `空文字 blur で input.value が "朝の体操" に書き戻されていない (実際: "${input.value}")`,
      ).toBe("朝の体操");
      // onNameBlur は ("") で 1 回呼ばれる.
      expect(onNameBlur).toHaveBeenCalledTimes(1);
      expect(onNameBlur).toHaveBeenCalledWith("");
    });
  });

  // ----------------------------------------------------------
  // AC-13: 同値 blur で入力値が維持されたまま onNameBlur が呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-13:
   *   Given <RoutineCard routine={{name: "朝の体操"}} ... /> を render する
   *   When  name input に "朝の体操" を再入力して blur する
   *   Then  input の value は "朝の体操" のまま
   *    かつ onNameBlur は ("朝の体操") で呼ばれる
   */
  describe("AC-13: 同値 blur では入力値が維持されたまま onNameBlur が呼ばれる", () => {
    it("同値 blur で input.value が変わらず onNameBlur('朝の体操') が呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1", name: "朝の体操" });
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
      const input = container.querySelector("input#routine-name-r1") as HTMLInputElement | null;
      expect(input, "input が見つからない").not.toBeNull();
      if (!input) return;
      fireEvent.change(input, { target: { value: "朝の体操" } });
      fireEvent.blur(input);
      expect(input.value).toBe("朝の体操");
      expect(onNameBlur).toHaveBeenCalledTimes(1);
      expect(onNameBlur).toHaveBeenCalledWith("朝の体操");
    });
  });

  // ----------------------------------------------------------
  // AC-14: 曜日 checkbox click で onDaysOfWeekChange が呼ばれる (BL-068 維持)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-14 (BL-068 維持):
   *   Given <RoutineCard routine={{daysOfWeek: [1]}} ... /> を render する
   *   When  「水」(day=3) の checkbox を click する
   *   Then  onDaysOfWeekChange は ([1, 3]) で呼ばれる
   */
  describe("AC-14: 曜日 checkbox click で onDaysOfWeekChange が呼ばれる (BL-068 維持)", () => {
    it("水 (day 3) の checkbox click で onDaysOfWeekChange([1, 3]) が呼ばれる", async () => {
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
      expect(group, "div[role='group'][aria-label='曜日'] が見つからない").not.toBeNull();
      const checkboxes = Array.from(
        group?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      expect(checkboxes.length, "曜日 checkbox が 7 個ではない").toBe(7);
      // 水 = day 3 (= index 3).
      const wed = checkboxes[3];
      expect(wed, "曜日 3 (水) の checkbox が見つからない").toBeDefined();
      wed?.click();
      expect(onDaysOfWeekChange).toHaveBeenCalledTimes(1);
      expect(onDaysOfWeekChange).toHaveBeenCalledWith([1, 3]);
    });
  });

  // ----------------------------------------------------------
  // AC-15: PriorityStars click で onDefaultPriorityChange が呼ばれる (BL-069 維持)
  // ----------------------------------------------------------
  /**
   * シナリオ AC-15 (BL-069 維持):
   *   Given <RoutineCard routine={{defaultPriority: "normal"}} ... /> を render する
   *   When  PriorityStars の "highest" 相当の radio (3 つ目の星) を click する
   *   Then  onDefaultPriorityChange は ("highest") で呼ばれる
   */
  describe("AC-15: PriorityStars click で onDefaultPriorityChange が呼ばれる (BL-069 維持)", () => {
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
      expect(radiogroup, "PriorityStars (div[role='radiogroup']) が無い").not.toBeNull();
      const stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLButtonElement[];
      expect(stars.length, "PriorityStars の星 button が 3 個ではない").toBe(3);
      // 3 つ目の星 = highest.
      stars[2]?.click();
      expect(onDefaultPriorityChange).toHaveBeenCalledTimes(1);
      expect(onDefaultPriorityChange).toHaveBeenCalledWith("highest");
    });
  });

  // ----------------------------------------------------------
  // AC-16: 「削除」 button click で onDelete が 1 回呼ばれる
  // ----------------------------------------------------------
  /**
   * シナリオ AC-16:
   *   Given <RoutineCard ... onDelete={spy} /> を render する
   *   When  「削除」 button を click する
   *   Then  onDelete が 1 回呼ばれる
   */
  describe("AC-16: 「削除」 button click で onDelete が呼ばれる", () => {
    it("「削除」 button click で onDelete が 1 回呼ばれる", async () => {
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
      const deleteButton = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "削除",
      );
      expect(deleteButton, "「削除」 button が見つからない").toBeDefined();
      deleteButton?.click();
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // a11y (AC-17 / AC-18)
  // ============================================================

  // ----------------------------------------------------------
  // AC-17: visually-hidden label が name input と紐づく
  // ----------------------------------------------------------
  /**
   * シナリオ AC-17:
   *   Given <RoutineCard routine={{id: "r1"}} ... /> を render する
   *   When  DOM をクエリする
   *   Then  <label for="routine-name-r1" class="visually-hidden">ルーティン名</label> と
   *         <input id="routine-name-r1"> が両方存在する
   */
  describe("AC-17: visually-hidden label が name input と紐づく", () => {
    it("label[for='routine-name-{id}'].visually-hidden と input#routine-name-{id} が両方存在する", async () => {
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
      const label = container.querySelector(
        "label[for='routine-name-r1']",
      ) as HTMLLabelElement | null;
      const input = container.querySelector("input#routine-name-r1") as HTMLInputElement | null;
      expect(label, "label[for='routine-name-r1'] が無い").not.toBeNull();
      expect(input, "input#routine-name-r1 が無い").not.toBeNull();
      expect(label?.classList.contains("visually-hidden")).toBe(true);
      expect(label?.textContent ?? "").toContain("ルーティン名");
    });
  });

  // ----------------------------------------------------------
  // AC-18: PriorityStars の groupLabel と idPrefix が維持される
  // ----------------------------------------------------------
  /**
   * シナリオ AC-18:
   *   Given <RoutineCard routine={{name: "朝の体操", id: "r1"}} ... /> を render する
   *   When  PriorityStars の root role="radiogroup" を取得する
   *   Then  accessibleName は "朝の体操 の優先度" を含む
   *    かつ 子 radio の id prefix は "routine-r1" で始まる
   */
  describe("AC-18: PriorityStars の groupLabel / idPrefix が維持される", () => {
    it("radiogroup の aria-label に '朝の体操 の優先度' が含まれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1", name: "朝の体操" });
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
        `radiogroup の aria-label に '朝の体操 の優先度' が含まれない (実際: "${ariaLabel}")`,
      ).toContain("朝の体操 の優先度");
    });

    it("radiogroup 内の radio button の id が 'routine-r1' で始まる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ id: "r1", name: "朝の体操" });
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
          id.startsWith("routine-r1"),
          `radio の id prefix が 'routine-r1' で始まらない (実際: "${id}")`,
        ).toBe(true);
      }
    });
  });

  // ============================================================
  // 順序保証 (AC-19)
  // ============================================================

  // ----------------------------------------------------------
  // AC-19: header 内で visually-hidden label → input → PriorityStars の順で並ぶ
  // ----------------------------------------------------------
  /**
   * シナリオ AC-19:
   *   Given <RoutineCard ... /> を render する
   *   When  .routine-card__header の直下の子要素を順に取得する
   *   Then  visually-hidden label → input → PriorityStars の順で並ぶ
   */
  describe("AC-19: header 内で input が PriorityStars より前に並ぶ", () => {
    it(".routine-card__header の直下の子は label → input → radiogroup の順で並ぶ", async () => {
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
      const header = container.querySelector(".routine-card__header") as HTMLElement | null;
      expect(header, ".routine-card__header が見つからない (AC-19 / REQ-1 違反)").not.toBeNull();
      if (!header) return;
      const children = Array.from(header.children);
      // 1 番目は visually-hidden label.
      const first = children[0];
      expect(
        first?.tagName.toLowerCase() === "label" && first.classList.contains("visually-hidden"),
        `header の 1 番目の子が visually-hidden label ではない (実際: tag="${first?.tagName.toLowerCase()}", class="${first?.className}")`,
      ).toBe(true);
      // 2 番目は input[type=text].
      const second = children[1];
      expect(
        second?.tagName.toLowerCase() === "input" && second.getAttribute("type") === "text",
        `header の 2 番目の子が <input type='text'> ではない (実際: tag="${second?.tagName.toLowerCase()}")`,
      ).toBe(true);
      // 3 番目は radiogroup (PriorityStars).
      const third = children[2];
      expect(
        third?.getAttribute("role") === "radiogroup",
        `header の 3 番目の子が role='radiogroup' ではない (実際: tag="${third?.tagName.toLowerCase()}", role="${third?.getAttribute("role")}")`,
      ).toBe(true);
    });
  });
});
