// @vitest-environment jsdom

/**
 * ルーティンの優先度 UI 統一 + 編集モードでの曜日変更
 * (BL-068 / routine-card-edit-fields) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-edit-fields/spec.md
 *   docs/developer/features/routine-card-edit-fields/plan.md
 *   docs/developer/features/routine-card-edit-fields/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 : <RoutineFormCard> が <PriorityStars /> を render し <select> は不在 (DOM レンダ).
 *   AC-2 : RoutineFormCardProps.defaultPriority の型が Priority である (型 grep).
 *   AC-3 : PriorityStars の操作で onDefaultPriorityChange が Priority 型で呼ばれる (DOM レンダ).
 *   AC-4 : <RoutineCard isEditing=true> に曜日選択 UI (7 個の checkbox) が表示される (DOM レンダ).
 *   AC-5 : 曜日 checkbox の操作で onEditingDaysOfWeekChange が次の配列で呼ばれる (DOM レンダ).
 *   AC-6 : 編集 → 保存で daysOfWeek が updateMutation 経由で送信される (結合レンダ).
 *   AC-7 : BL-061 確定の name 変更経路が維持されている (結合レンダ).
 *   AC-8 : 編集モードで曜日 0 件のとき「保存」を押しても mutation は呼ばれない (結合レンダ).
 *   AC-9 : openEdit() で editingDaysOfWeek が routine.daysOfWeek で初期化される (結合レンダ).
 *   AC-10: cancelEdit() で曜日 state がリセットされる (結合レンダ).
 *   AC-11: <RoutineCard isEditing=true> の DOM 順が input → 曜日 → 保存 → キャンセル (DOM レンダ).
 *   AC-12: routine-card.css から .routine-card__priority-row / .routine-card__select が撤去 (CSS 直読み).
 *   AC-13: routine-card.css の維持セレクタが引き続き存在 (CSS 直読み).
 *   AC-14: RoutineCardProps に editingDaysOfWeek / onEditingDaysOfWeekChange が追加 (型 grep).
 *   AC-15: routines-view.tsx が editingDaysOfWeek state を持ち <RoutineCard> に渡す (型 grep).
 *   AC-16: routines-view.tsx の newDefaultPriority state が Priority 型である (型 grep).
 *   AC-17: updateMutation の mutationFn 引数型に daysOfWeek が含まれる (型 grep).
 *   AC-18: tokens.css を変更していない / 既存トークン定義の存続確認 (CSS 直読み代替).
 *   AC-19: RoutineRepository / PriorityStars 本体が無改修 (型 grep).
 *   AC-20: 既存単体テスト全件 green (本ファイルでは個別 assert せずルートの npm test で担保).
 *   AC-21: 既存 E2E 全件 green (本ファイルでは個別 assert せず npx playwright test で担保).
 *   AC-22: アクセシビリティ違反 0 件を維持 (本ファイルでは個別 assert せず e2e/a11y.spec.ts で担保).
 *   AC-23: BL-061 spec の D-008-2 を逆転した記録が残っている (ドキュメント直読み).
 *   AC-24: <RoutineFormCard> の <PriorityStars /> 呼び出しに groupLabel / idPrefix が含まれる (型 grep).
 *   AC-25: 既存 BL-061 spec の NFR が引き続き満たされる (DOM レンダ).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前は CSS 直読み系 (AC-12), DOM レンダ系 (AC-1 / AC-3 / AC-4 / AC-5 / AC-11),
 *     型 grep 系 (AC-2 / AC-14 / AC-15 / AC-16 / AC-17 / AC-23 / AC-24),
 *     結合レンダ系 (AC-6 / AC-8 / AC-9) が red になる想定.
 *   - 既存ファイル不変性系 (AC-13 / AC-18 / AC-19 / AC-25), 一部の互換系 (AC-7 / AC-10)
 *     は実装前から green である可能性がある (= 既存挙動と整合的なため).
 *   - implementer が REQ-1 〜 REQ-8 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - CSS 直読み: BL-052 / BL-054 / BL-057 / BL-058 / BL-059 / BL-060 / BL-061 と同じ
 *     readFileSync + extractRuleBody (P-005).
 *   - DOM レンダ: BL-061 と同形の動的 import + render パターン.
 *   - 結合レンダ: routines-view.test.tsx と同形の MockRepository + QueryClientProvider.
 *
 * vitest-environment:
 *   DOM レンダ AC は jsdom 必須のため 1 ファイル全体を jsdom で動かす.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WebRoutine, WebRoutineRepository } from "../src/repositories/routine-repository.js";

// ============================================================
// 共通定数 / パス解決
// ============================================================

const repoRoot = resolve(__dirname, "../..");
const webSrcRoot = resolve(repoRoot, "web/src");

// 本 BL の対象ファイル群.
const routineCardCssPath = resolve(webSrcRoot, "ui/routine-card/routine-card.css");
const routineCardTsxPath = resolve(webSrcRoot, "ui/routine-card/routine-card.tsx");
const routineFormCardTsxPath = resolve(webSrcRoot, "ui/routine-card/routine-form-card.tsx");
const routinesViewTsxPath = resolve(webSrcRoot, "ui/routines-view/routines-view.tsx");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const routineRepositoryTsPath = resolve(webSrcRoot, "repositories/routine-repository.ts");
const priorityStarsTsxPath = resolve(webSrcRoot, "ui/priority-stars/priority-stars.tsx");
const priorityStarsCssPath = resolve(webSrcRoot, "ui/priority-stars/priority-stars.css");
const routineCardComponentSpecPath = resolve(
  repoRoot,
  "docs/developer/features/routine-card-component/spec.md",
);

const NOW = "2026-06-12T09:00:00.000Z";
const ROUTINE_ID_1 = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";

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
    id: ROUTINE_ID_1,
    name: "朝の運動",
    daysOfWeek: [1], // 月のみ.
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
// 結合レンダ用 MockRepository + QueryClient ラッパ
// ============================================================

function makeMockRepository(initial: WebRoutine[] = []): WebRoutineRepository & {
  listMock: ReturnType<typeof vi.fn>;
  createMock: ReturnType<typeof vi.fn>;
  updateMock: ReturnType<typeof vi.fn>;
  deleteMock: ReturnType<typeof vi.fn>;
} {
  let state = [...initial];

  const listMock = vi.fn(async (): Promise<WebRoutine[]> => [...state]);
  const createMock = vi.fn(
    async (cmd: {
      id: string;
      name: string;
      daysOfWeek: number[];
      defaultPriority: string;
    }): Promise<WebRoutine> => {
      const routine = makeRoutine({
        id: cmd.id,
        name: cmd.name,
        daysOfWeek: cmd.daysOfWeek,
        defaultPriority: cmd.defaultPriority as "highest" | "normal" | "later",
        version: 1,
      });
      state.push(routine);
      return routine;
    },
  );
  const updateMock = vi.fn(
    async (cmd: {
      id: string;
      ifMatch: number;
      name?: string;
      daysOfWeek?: number[];
      defaultPriority?: "highest" | "normal" | "later";
    }): Promise<WebRoutine> => {
      const idx = state.findIndex((r) => r.id === cmd.id);
      if (idx < 0) throw new Error("routine not found");
      const updated: WebRoutine = {
        ...state[idx]!,
        ...(cmd.name !== undefined ? { name: cmd.name } : {}),
        ...(cmd.daysOfWeek !== undefined ? { daysOfWeek: cmd.daysOfWeek } : {}),
        ...(cmd.defaultPriority !== undefined ? { defaultPriority: cmd.defaultPriority } : {}),
        version: state[idx]!.version + 1,
        updatedAt: NOW,
      };
      state[idx] = updated;
      return updated;
    },
  );
  const deleteMock = vi.fn(async (cmd: { id: string; ifMatch: number }): Promise<void> => {
    state = state.filter((r) => r.id !== cmd.id);
  });

  return {
    list: listMock,
    create: createMock,
    update: updateMock,
    delete: deleteMock,
    listMock,
    createMock,
    updateMock,
    deleteMock,
  };
}

function renderWithQueryClient(ui: ReactNode): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, networkMode: "offlineFirst" },
      mutations: { retry: false, networkMode: "offlineFirst" },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ============================================================
// describe ブロック
// ============================================================

describe("ルーティンの優先度 UI 統一 + 編集モードでの曜日変更 (BL-068 / routine-card-edit-fields)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // (b) <RoutineFormCard> jsdom レンダ系 (AC-1 / AC-3 / AC-24)
  // ============================================================

  /**
   * シナリオ AC-1: <RoutineFormCard> が <PriorityStars /> を render し <select> は不在.
   *   Given <RoutineFormCard defaultPriority="normal" ... /> を render する
   *   When  出力 DOM を観察する
   *   Then  div[role="radiogroup"] (PriorityStars) が存在する
   *    かつ select#routine-priority が存在しない
   *    かつ <label htmlFor="routine-priority">優先度</label> が存在しない
   */
  describe("AC-1: <RoutineFormCard> が <PriorityStars /> を render し <select> は不在", () => {
    it("div[role='radiogroup'] (PriorityStars) が <RoutineFormCard> 内に存在する", async () => {
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
      expect(
        radiogroup,
        "<RoutineFormCard> 内に div[role='radiogroup'] (PriorityStars) が無い (REQ-1 違反)",
      ).not.toBeNull();
    });

    it("select#routine-priority が <RoutineFormCard> 内に存在しない", async () => {
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
      const select = container.querySelector("select#routine-priority");
      expect(
        select,
        "<RoutineFormCard> に select#routine-priority が残っている (REQ-1 違反)",
      ).toBeNull();
    });

    it("<label htmlFor='routine-priority'>優先度</label> が <RoutineFormCard> 内に存在しない", async () => {
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
      const label = container.querySelector("label[for='routine-priority']");
      expect(
        label,
        "<RoutineFormCard> に <label htmlFor='routine-priority'> が残っている (REQ-6 / D-003 違反)",
      ).toBeNull();
    });

    it(".routine-card__priority-row ラッパ要素が <RoutineFormCard> 内に存在しない", async () => {
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
      const wrapper = container.querySelector(".routine-card__priority-row");
      expect(
        wrapper,
        "<RoutineFormCard> に .routine-card__priority-row ラッパが残っている (REQ-1 違反)",
      ).toBeNull();
    });
  });

  /**
   * シナリオ AC-3: PriorityStars の操作で onDefaultPriorityChange が Priority 型で呼ばれる.
   *   Given <RoutineFormCard defaultPriority="normal" onDefaultPriorityChange={mock} ... /> を render する
   *   When  ☆3 つ目 (highest) の button を click する
   *   Then  mock が "highest" 文字列で 1 回呼ばれる
   */
  describe("AC-3: PriorityStars の操作で onDefaultPriorityChange が Priority 型で呼ばれる", () => {
    it("☆3 つ目 (highest) の button を click すると onDefaultPriorityChange('highest') が 1 回呼ばれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onDefaultPriorityChange = vi.fn();
      const user = userEvent.setup();
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
      expect(radiogroup, "PriorityStars radiogroup が無い").not.toBeNull();
      const stars = Array.from(radiogroup?.querySelectorAll("button[role='radio']") ?? []);
      expect(stars.length, "PriorityStars の星 button が 3 個ではない").toBe(3);
      await user.click(stars[2] as HTMLElement);
      expect(onDefaultPriorityChange).toHaveBeenCalledTimes(1);
      expect(onDefaultPriorityChange).toHaveBeenCalledWith("highest");
    });

    it("☆1 つ目 (later) の button を click すると onDefaultPriorityChange('later') が 1 回呼ばれる", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onDefaultPriorityChange = vi.fn();
      const user = userEvent.setup();
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
      const stars = Array.from(radiogroup?.querySelectorAll("button[role='radio']") ?? []);
      await user.click(stars[0] as HTMLElement);
      expect(onDefaultPriorityChange).toHaveBeenCalledTimes(1);
      expect(onDefaultPriorityChange).toHaveBeenCalledWith("later");
    });

    it("同値 (normal) の星 click は no-op (D-003 / BL-040)", async () => {
      const { RoutineFormCard } = await importRoutineFormCard();
      const onDefaultPriorityChange = vi.fn();
      const user = userEvent.setup();
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
      const stars = Array.from(radiogroup?.querySelectorAll("button[role='radio']") ?? []);
      // 現在値 normal = 2 個目の星.
      await user.click(stars[1] as HTMLElement);
      expect(onDefaultPriorityChange).not.toHaveBeenCalled();
    });
  });

  /**
   * シナリオ AC-24: <RoutineFormCard> の <PriorityStars /> 呼び出しに groupLabel / idPrefix が含まれる.
   *   Given web/src/ui/routine-card/routine-form-card.tsx を開いた
   *   When  <PriorityStars ... /> の呼び出しを観察する
   *   Then  value={defaultPriority} を含む
   *    かつ onChange={onDefaultPriorityChange} を含む
   *    かつ groupLabel="優先度" を含む
   *    かつ idPrefix="routine-create" を含む
   */
  describe("AC-24: <RoutineFormCard> の <PriorityStars /> 呼び出しに groupLabel / idPrefix が含まれる", () => {
    it("routine-form-card.tsx に <PriorityStars ... value={defaultPriority} ... /> の呼び出しを含む", () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(src, "<PriorityStars が呼び出されていない").toMatch(/<PriorityStars\b/);
      expect(src, "<PriorityStars に value={defaultPriority} が無い").toMatch(
        /value\s*=\s*\{\s*defaultPriority\s*\}/,
      );
    });

    it("routine-form-card.tsx に onChange={onDefaultPriorityChange} の bind を含む", () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(src, "onChange={onDefaultPriorityChange} の bind が無い").toMatch(
        /onChange\s*=\s*\{\s*onDefaultPriorityChange\s*\}/,
      );
    });

    it('routine-form-card.tsx に groupLabel="優先度" を含む', () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(src, 'groupLabel="優先度" が無い').toMatch(/groupLabel\s*=\s*["']優先度["']/);
    });

    it('routine-form-card.tsx に idPrefix="routine-create" を含む', () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(src, 'idPrefix="routine-create" が無い').toMatch(
        /idPrefix\s*=\s*["']routine-create["']/,
      );
    });
  });

  // ============================================================
  // (c) <RoutineCard isEditing> jsdom レンダ系 (AC-4 / AC-5 / AC-11)
  // ============================================================

  /**
   * シナリオ AC-4: <RoutineCard isEditing=true> に曜日選択 UI (7 個の checkbox) が表示される.
   *   Given <RoutineCard isEditing={true} editingDaysOfWeek={[1]} onEditingDaysOfWeekChange={mock} ... /> を render する
   *   When  編集 form 内を観察する
   *   Then  div.routine-card__day-checkboxes 要素が存在する
   *    かつ role="group" aria-label="曜日" が付与されている
   *    かつ checkbox <input> が 7 個存在する
   *    かつ 各 label のテキスト「日」「月」「火」「水」「木」「金」「土」が順番に存在する
   *    かつ 月曜 (index 1) の checkbox が checked である
   *    かつ それ以外 6 個の checkbox が unchecked である
   */
  describe("AC-4: <RoutineCard isEditing=true> に曜日選択 UI (7 個の checkbox) が表示される", () => {
    it("編集 form 内に div.routine-card__day-checkboxes が存在し role='group' aria-label='曜日' を持つ", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1] });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      expect(
        dayCheckboxes,
        "編集モードの form 内に .routine-card__day-checkboxes が無い (REQ-2 違反)",
      ).not.toBeNull();
      expect(dayCheckboxes?.getAttribute("role")).toBe("group");
      expect(dayCheckboxes?.getAttribute("aria-label")).toBe("曜日");
    });

    it("編集 form 内に 7 個の checkbox <input> が存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1] });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      );
      expect(checkboxes.length, "編集モードの曜日 checkbox が 7 個ではない").toBe(7);
    });

    it("各 label のテキスト「日」「月」「火」「水」「木」「金」「土」が順番に存在する", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1] });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      const labelTexts = Array.from(dayCheckboxes?.querySelectorAll("label") ?? []).map(
        (l) => l.textContent?.trim() ?? "",
      );
      const expected = ["日", "月", "火", "水", "木", "金", "土"];
      for (let i = 0; i < expected.length; i++) {
        const want = expected[i]!;
        expect(
          labelTexts[i]?.includes(want),
          `編集モードの曜日 label[${i}] = "${labelTexts[i]}" に「${want}」が含まれない (順番違反 / NFR-DAY-LABEL-PRESERVE 違反)`,
        ).toBe(true);
      }
    });

    it("editingDaysOfWeek={[1]} のとき月曜 (index 1) の checkbox のみ checked である", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1] });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      const checkedStates = checkboxes.map((c) => c.checked);
      // index 0=日, 1=月, 2=火, ..., 6=土.
      expect(checkedStates).toEqual([false, true, false, false, false, false, false]);
    });
  });

  /**
   * シナリオ AC-5: 曜日 checkbox の操作で onEditingDaysOfWeekChange が次の配列で呼ばれる.
   *   Given <RoutineCard isEditing={true} editingDaysOfWeek={[1]} onEditingDaysOfWeekChange={mock} ... />
   *   When  火曜 (index 2) の checkbox を click する
   *   Then  mock が [1, 2] の配列で 1 回呼ばれる
   *   When  月曜 (index 1) の checkbox を click する
   *   Then  mock が [] の配列で次に呼ばれる
   */
  describe("AC-5: 曜日 checkbox の操作で onEditingDaysOfWeekChange が次の配列で呼ばれる", () => {
    it("editingDaysOfWeek={[1]} で火曜を click すると [1, 2] で 1 回呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1] });
      const onEditingDaysOfWeekChange = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={onEditingDaysOfWeekChange}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      // index 2 = 火曜.
      await user.click(checkboxes[2]!);
      expect(onEditingDaysOfWeekChange).toHaveBeenCalledTimes(1);
      expect(onEditingDaysOfWeekChange).toHaveBeenCalledWith([1, 2]);
    });

    it("editingDaysOfWeek={[1]} で月曜を click すると [] で 1 回呼ばれる (unchecked 化)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1] });
      const onEditingDaysOfWeekChange = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={onEditingDaysOfWeekChange}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      // index 1 = 月曜.
      await user.click(checkboxes[1]!);
      expect(onEditingDaysOfWeekChange).toHaveBeenCalledTimes(1);
      expect(onEditingDaysOfWeekChange).toHaveBeenCalledWith([]);
    });

    it("editingDaysOfWeek={[2]} で日曜を click すると [0, 2] (sort 済) で呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [2] });
      const onEditingDaysOfWeekChange = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[2]}
          onEditingDaysOfWeekChange={onEditingDaysOfWeekChange}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const dayCheckboxes = container.querySelector(".routine-card__day-checkboxes");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      // index 0 = 日曜.
      await user.click(checkboxes[0]!);
      expect(onEditingDaysOfWeekChange).toHaveBeenCalledTimes(1);
      expect(onEditingDaysOfWeekChange).toHaveBeenCalledWith([0, 2]);
    });
  });

  /**
   * シナリオ AC-11: <RoutineCard> の DOM 順は input → 曜日 → 優先度 → 保存 → キャンセル である.
   *   Given <RoutineCard isEditing={true} editingDaysOfWeek={[1]} editingDefaultPriority="normal"
   *     ... /> を render する
   *   When  編集 form 内の direct children を DOM 順に観察する
   *   Then  最初の child は label.visually-hidden (htmlFor=input) である
   *    かつ 2 番目の child は input である
   *    かつ 3 番目の child は div.routine-card__day-checkboxes である
   *    かつ 4 番目の child は div[role="radiogroup"] (PriorityStars) である (BL-069 D-001)
   *    かつ 5 番目の child は button[type="submit"] (保存) である
   *    かつ 6 番目の child は button[type="button"] (キャンセル) である
   *
   *   BL-069 (routine-card-edit-priority) 追従: 旧 BL-068 D-005 の DOM 順
   *   `label → input → div.day-checkboxes → 保存 → キャンセル` に
   *   「優先度 (PriorityStars / div[role='radiogroup'])」を曜日の直後 / 保存の直前に挿入する
   *   形へ拡張する (BL-069 D-001).
   */
  describe("AC-11: <RoutineCard> の DOM 順は input → 曜日 → 優先度 → 保存 → キャンセル である (BL-069 D-001)", () => {
    it("編集 form 内の direct children が [label, input, div.day-checkboxes, div.radiogroup, button-submit, button-cancel] の順", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ daysOfWeek: [1] });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const form = container.querySelector("form");
      expect(form, "編集モードの form が見つからない").not.toBeNull();
      const children = Array.from(form?.children ?? []) as HTMLElement[];
      // 順: label (visually-hidden) → input → div.routine-card__day-checkboxes →
      //     div[role='radiogroup'] (PriorityStars) → button[type=submit] → button[type=button]
      expect(
        children.length,
        "form の direct children が 6 個ではない (BL-069 D-001 違反)",
      ).toBeGreaterThanOrEqual(6);

      const c0 = children[0]!;
      const c1 = children[1]!;
      const c2 = children[2]!;
      const c3 = children[3]!;
      const c4 = children[4]!;
      const c5 = children[5]!;

      expect(c0.tagName.toLowerCase(), "1 番目の child が label ではない").toBe("label");
      expect(c0.classList.contains("visually-hidden")).toBe(true);
      expect(c1.tagName.toLowerCase(), "2 番目の child が input ではない").toBe("input");
      expect(c2.tagName.toLowerCase(), "3 番目の child が div ではない").toBe("div");
      expect(
        c2.classList.contains("routine-card__day-checkboxes"),
        "3 番目の child の class に routine-card__day-checkboxes が無い",
      ).toBe(true);
      // BL-069 D-001: 4 番目に PriorityStars (= div[role='radiogroup']) が挿入される.
      expect(c3.tagName.toLowerCase(), "4 番目の child が div ではない").toBe("div");
      expect(
        c3.getAttribute("role"),
        "4 番目の child の role が radiogroup ではない (BL-069 D-001 違反)",
      ).toBe("radiogroup");
      expect(c4.tagName.toLowerCase(), "5 番目の child が button ではない").toBe("button");
      expect(c4.getAttribute("type")).toBe("submit");
      expect(c5.tagName.toLowerCase(), "6 番目の child が button ではない").toBe("button");
      expect(c5.getAttribute("type")).toBe("button");
    });
  });

  // ============================================================
  // (a) CSS 直読み系 (AC-12 / AC-13)
  // ============================================================

  /**
   * シナリオ AC-12: routine-card.css から .routine-card__priority-row / .routine-card__select が撤去.
   *   Given web/src/ui/routine-card/routine-card.css を開いた
   *   When  ファイル本文を観察する
   *   Then  .routine-card__priority-row セレクタが定義されていない
   *    かつ .routine-card__select セレクタが定義されていない
   */
  describe("AC-12: routine-card.css から .routine-card__priority-row / .routine-card__select が撤去 (REQ-7)", () => {
    it(".routine-card__priority-row セレクタが routine-card.css に存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__priority-row");
      expect(body, ".routine-card__priority-row ルールが残存 (REQ-7 違反)").toBeNull();
    });

    it(".routine-card__select セレクタが routine-card.css に存在しない", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__select");
      expect(body, ".routine-card__select ルールが残存 (REQ-7 違反)").toBeNull();
    });
  });

  /**
   * シナリオ AC-13: routine-card.css の維持セレクタが引き続き存在 (REQ-7).
   *   Given web/src/ui/routine-card/routine-card.css を開いた
   *   When  ファイル本文を観察する
   *   Then  .routine-card / .routine-card--form / .routine-card--editing /
   *         __main / __name / __days-label / __actions / __actions__edit / __actions__delete /
   *         __form-inline / __form-row / __day-checkboxes /
   *         __input / __input::placeholder / __submit / .visually-hidden が定義されている
   */
  describe("AC-13: routine-card.css の維持セレクタが引き続き存在 (REQ-7)", () => {
    const maintainedSelectors = [
      ".routine-card",
      ".routine-card--form",
      ".routine-card--editing",
      ".routine-card__main",
      ".routine-card__name",
      ".routine-card__days-label",
      ".routine-card__actions",
      ".routine-card__actions__edit",
      ".routine-card__actions__delete",
      ".routine-card__form-inline",
      ".routine-card__form-row",
      ".routine-card__day-checkboxes",
      ".routine-card__input",
      ".routine-card__input::placeholder",
      ".routine-card__submit",
      ".visually-hidden",
    ];

    for (const selector of maintainedSelectors) {
      it(`${selector} セレクタが routine-card.css に定義されている`, () => {
        const css = readFileSync(routineCardCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(body, `${selector} ルールが見つからない (REQ-7 違反)`).not.toBeNull();
      });
    }
  });

  // ============================================================
  // (d) 型 / interface / state grep 系 (AC-2 / AC-14 / AC-15 / AC-16 / AC-17 / AC-23)
  // ============================================================

  /**
   * シナリオ AC-2: RoutineFormCardProps.defaultPriority の型が Priority である.
   *   Given web/src/ui/routine-card/routine-form-card.tsx を開いた
   *   When  RoutineFormCardProps の型定義を観察する
   *   Then  defaultPriority: Priority の宣言を含む
   *    かつ onDefaultPriorityChange: (next: Priority) => void の宣言を含む
   *    かつ import type { Priority } from "@todica/domain/task" を含む
   */
  describe("AC-2: RoutineFormCardProps.defaultPriority の型が Priority である (G-2)", () => {
    it("routine-form-card.tsx に import type { Priority } from '@todica/domain/task' を含む", () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(src, "Priority 型の import が無い (G-2 違反)").toMatch(
        /import\s+type\s*\{\s*Priority\s*\}\s*from\s*["']@todica\/domain\/task["']/,
      );
    });

    it("routine-form-card.tsx に defaultPriority: Priority の宣言を含む", () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(src, "defaultPriority: Priority 宣言が無い (G-2 違反)").toMatch(
        /defaultPriority\s*:\s*Priority\b/,
      );
    });

    it("routine-form-card.tsx に onDefaultPriorityChange: (next: Priority) => void の宣言を含む", () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(
        src,
        "onDefaultPriorityChange: (next: Priority) => void 宣言が無い (G-2 違反)",
      ).toMatch(/onDefaultPriorityChange\s*:\s*\(\s*next\s*:\s*Priority\s*\)\s*=>\s*void/);
    });

    it("routine-form-card.tsx に priorityId? prop が残っていない (D-002)", () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(src, "priorityId? prop が残存 (D-002 違反)").not.toMatch(/priorityId\s*\?\s*:/);
    });
  });

  /**
   * シナリオ AC-14: RoutineCardProps に editingDaysOfWeek / onEditingDaysOfWeekChange が追加されている.
   *   Given web/src/ui/routine-card/routine-card.tsx を開いた
   *   When  RoutineCardProps の interface を観察する
   *   Then  editingDaysOfWeek: number[] の宣言を含む
   *    かつ onEditingDaysOfWeekChange: (next: number[]) => void の宣言を含む
   *    かつ 既存の routine / isEditing / editingName / onEditingNameChange /
   *         onStartEdit / onCancelEdit / onSaveEdit / onDelete / as は維持されている
   */
  describe("AC-14: RoutineCardProps に editingDaysOfWeek / onEditingDaysOfWeekChange が追加 (G-4)", () => {
    it("routine-card.tsx に editingDaysOfWeek: number[] の宣言を含む", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, "editingDaysOfWeek: number[] 宣言が無い (G-4 違反)").toMatch(
        /editingDaysOfWeek\s*:\s*number\[\]/,
      );
    });

    it("routine-card.tsx に onEditingDaysOfWeekChange: (next: number[]) => void の宣言を含む", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(
        src,
        "onEditingDaysOfWeekChange: (next: number[]) => void 宣言が無い (G-4 違反)",
      ).toMatch(/onEditingDaysOfWeekChange\s*:\s*\(\s*next\s*:\s*number\[\]\s*\)\s*=>\s*void/);
    });

    // BL-069 (routine-card-edit-priority) 追従: RoutineCardProps に
    // `editingDefaultPriority: Priority` / `onEditingDefaultPriorityChange: (next: Priority) => void`
    // が追加されたことを宣言 grep で確認する.
    it("routine-card.tsx に editingDefaultPriority: Priority の宣言を含む (BL-069 G-2)", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, "editingDefaultPriority: Priority 宣言が無い (BL-069 G-2 違反)").toMatch(
        /editingDefaultPriority\s*:\s*Priority\b/,
      );
    });

    it("routine-card.tsx に onEditingDefaultPriorityChange: (next: Priority) => void の宣言を含む (BL-069 G-2)", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(
        src,
        "onEditingDefaultPriorityChange: (next: Priority) => void 宣言が無い (BL-069 G-2 違反)",
      ).toMatch(/onEditingDefaultPriorityChange\s*:\s*\(\s*next\s*:\s*Priority\s*\)\s*=>\s*void/);
    });

    const existingProps = [
      "routine",
      "isEditing",
      "editingName",
      "onEditingNameChange",
      "onStartEdit",
      "onCancelEdit",
      "onSaveEdit",
      "onDelete",
    ];

    for (const prop of existingProps) {
      it(`既存 prop ${prop} の宣言が維持されている`, () => {
        const src = readFileSync(routineCardTsxPath, "utf-8");
        const re = new RegExp(`${prop}\\s*[\\?:]`);
        expect(src, `RoutineCardProps から ${prop} が消えている (NFR-COMPAT 違反)`).toMatch(re);
      });
    }
  });

  /**
   * シナリオ AC-15: routines-view.tsx が editingDaysOfWeek state を持ち <RoutineCard> に渡す.
   *   Given web/src/ui/routines-view/routines-view.tsx を開いた
   *   When  ファイル本文を観察する
   *   Then  useState<number[]>(...) の editingDaysOfWeek 宣言を含む
   *    かつ openEdit 内で setEditingDaysOfWeek(routine.daysOfWeek) を呼ぶ
   *    かつ cancelEdit 内で setEditingDaysOfWeek([]) (または等価) を呼ぶ
   *    かつ handleSaveEdit 内で editingDaysOfWeek.length === 0 の early return を含む
   *    かつ updateMutation.mutateAsync に { ..., daysOfWeek: editingDaysOfWeek } を渡す
   *    かつ <RoutineCard ... editingDaysOfWeek={editingDaysOfWeek}
   *         onEditingDaysOfWeekChange={setEditingDaysOfWeek} ... /> の使用を含む
   */
  describe("AC-15: routines-view.tsx が editingDaysOfWeek state を持ち <RoutineCard> に渡す (REQ-3)", () => {
    it("useState<number[]>(...) で editingDaysOfWeek 宣言を含む", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "editingDaysOfWeek の useState<number[]> 宣言が無い (REQ-3 違反)").toMatch(
        /useState<\s*number\[\]\s*>\([^)]*\)[\s\S]{0,200}editingDaysOfWeek|editingDaysOfWeek[\s\S]{0,200}useState<\s*number\[\]\s*>/,
      );
      // 念のためシンプルな grep でも確認.
      expect(src).toContain("editingDaysOfWeek");
      expect(src).toContain("setEditingDaysOfWeek");
    });

    it("openEdit 関数の本体で setEditingDaysOfWeek(routine.daysOfWeek) を呼ぶ", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "openEdit で setEditingDaysOfWeek(routine.daysOfWeek) を呼んでいない").toMatch(
        /setEditingDaysOfWeek\s*\(\s*routine\.daysOfWeek\s*\)/,
      );
    });

    it("cancelEdit 関数の本体で setEditingDaysOfWeek([]) (または等価) を呼ぶ", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      // [] / [1] / 等の初期化のいずれかを許容.
      expect(src, "cancelEdit で setEditingDaysOfWeek([]) を呼んでいない (REQ-3 違反)").toMatch(
        /setEditingDaysOfWeek\s*\(\s*\[\s*\]\s*\)/,
      );
    });

    it("handleSaveEdit 内で editingDaysOfWeek.length === 0 の early return を含む (REQ-3-2 / AC-8)", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "editingDaysOfWeek.length === 0 の early return が無い (REQ-3-2 違反)").toMatch(
        /editingDaysOfWeek\.length\s*===\s*0/,
      );
    });

    it("updateMutation.mutateAsync に { ..., daysOfWeek: editingDaysOfWeek } を渡す (REQ-4)", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        "updateMutation.mutateAsync の引数に daysOfWeek: editingDaysOfWeek が無い (REQ-4 違反)",
      ).toMatch(/daysOfWeek\s*:\s*editingDaysOfWeek/);
    });

    it("<RoutineCard> 呼び出しに editingDaysOfWeek / onEditingDaysOfWeekChange が渡される", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "<RoutineCard> に editingDaysOfWeek が渡されていない").toMatch(
        /editingDaysOfWeek\s*=\s*\{\s*editingDaysOfWeek\s*\}/,
      );
      expect(src, "<RoutineCard> に onEditingDaysOfWeekChange が渡されていない").toMatch(
        /onEditingDaysOfWeekChange\s*=\s*\{\s*setEditingDaysOfWeek\s*\}/,
      );
    });
  });

  /**
   * シナリオ AC-16: routines-view.tsx の newDefaultPriority state が Priority 型である.
   *   Given routines-view.tsx を開いた
   *   When  ファイル本文を観察する
   *   Then  useState<Priority>("normal") の宣言を含む
   *    かつ import type { Priority } from "@todica/domain/task" を含む
   */
  describe("AC-16: routines-view.tsx の newDefaultPriority state が Priority 型である (G-2 / D-012)", () => {
    it("routines-view.tsx に import type { Priority } from '@todica/domain/task' を含む", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "Priority 型の import が無い (G-2 違反)").toMatch(
        /import\s+type\s*\{\s*Priority\s*\}\s*from\s*["']@todica\/domain\/task["']/,
      );
    });

    it('routines-view.tsx に useState<Priority>("normal") の宣言を含む', () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        'newDefaultPriority の useState<Priority>("normal") 宣言が無い (G-2 違反)',
      ).toMatch(/useState<\s*Priority\s*>\(\s*["']normal["']\s*\)/);
    });
  });

  /**
   * シナリオ AC-17: updateMutation の mutationFn 引数型に daysOfWeek が含まれる.
   *   Given routines-view.tsx を開いた
   *   When  updateMutation の mutationFn 引数型を観察する
   *   Then  { id: string; ifMatch: number; name: string; daysOfWeek: number[] } の宣言を含む
   *    かつ body の JSON.stringify に daysOfWeek が含まれる
   */
  describe("AC-17: updateMutation の mutationFn 引数型に daysOfWeek が含まれる (REQ-4)", () => {
    it("mutationFn の引数型に daysOfWeek: number[] が含まれる", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      // updateMutation の周辺で daysOfWeek: number[] の型宣言が出現するか.
      // shape: `mutationFn: async (cmd: { id: string; ifMatch: number; name: string; daysOfWeek: number[] })`
      expect(
        src,
        "updateMutation の mutationFn 引数型に daysOfWeek: number[] の宣言が無い (REQ-4 違反)",
      ).toMatch(/daysOfWeek\s*:\s*number\[\]/);
    });

    it("PATCH body の JSON.stringify に daysOfWeek を含む", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "body の JSON.stringify に daysOfWeek が含まれない (REQ-4 / R-009 違反)").toMatch(
        /JSON\.stringify\([^)]*daysOfWeek/,
      );
    });
  });

  /**
   * シナリオ AC-23: BL-061 spec の D-008-2 を逆転した記録が残っている.
   *   Given docs/developer/features/routine-card-component/spec.md を開いた
   *   When  D-008-2 の節を観察する
   *   Then  「BL-068 で逆転」または「routine-card-edit-fields で逆転」の言及が追記されている
   *    かつ 本 BL (routine-card-edit-fields) の spec.md へのリンクが存在する
   */
  describe("AC-23: BL-061 spec の D-008-2 を逆転した記録が残っている (G-7 / REQ-6 / R-002)", () => {
    it("routine-card-component/spec.md の D-008-2 節に「BL-068」 または「routine-card-edit-fields」の言及がある", () => {
      const src = readFileSync(routineCardComponentSpecPath, "utf-8");
      // D-008-2 セクションを取り出して, BL-068 / routine-card-edit-fields のいずれかを含むか確認.
      const idx = src.indexOf("D-008-2");
      expect(idx, "D-008-2 セクションが BL-061 spec に存在しない").toBeGreaterThanOrEqual(0);
      // 次の見出しまでの本文を切り出す (おおまかに 2KB 上限).
      const section = src.slice(idx, idx + 2000);
      const hasReverseNote = /BL-068|routine-card-edit-fields/.test(section);
      expect(
        hasReverseNote,
        "D-008-2 節に「BL-068」または「routine-card-edit-fields」の逆転言及が無い (AC-23 違反)",
      ).toBe(true);
    });
  });

  // ============================================================
  // (e) 結合レンダ (<RoutinesView> + MockRepository) 系
  // (AC-6 / AC-7 / AC-8 / AC-9 / AC-10 / AC-25)
  // ============================================================

  /**
   * シナリオ AC-9: openEdit() で editingDaysOfWeek が routine.daysOfWeek で初期化される.
   *   Given /routines にルーティン (name="A", daysOfWeek=[1, 3, 5], version=1) が 1 件存在する
   *   When  「変更」 button を click し editing モードへ遷移する
   *   Then  月曜 (1) / 水曜 (3) / 金曜 (5) の checkbox が checked である
   *    かつ 日 (0) / 火 (2) / 木 (4) / 土 (6) の checkbox が unchecked である
   */
  describe("AC-9: openEdit() で editingDaysOfWeek が routine.daysOfWeek で初期化される (G-5)", () => {
    it("変更 click 直後の編集 form で routine.daysOfWeek=[1,3,5] の checkbox が checked になる", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({ name: "A", daysOfWeek: [1, 3, 5], version: 1 });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);

      // 一覧表示を待つ.
      await screen.findByText("A");
      // 「変更」 button.
      const editButton = await screen.findByRole("button", { name: "変更" });
      await user.click(editButton);

      // 編集モードに入った後, 編集 form 内の曜日 checkbox を取得.
      const form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      const dayCheckboxes = form.querySelector(".routine-card__day-checkboxes");
      expect(dayCheckboxes, "編集モードに曜日 checkboxes が無い (AC-4 違反)").not.toBeNull();
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      expect(checkboxes.length).toBe(7);
      // 月 (1) / 水 (3) / 金 (5) が checked. 他は unchecked.
      expect(checkboxes.map((c) => c.checked)).toEqual([
        false,
        true,
        false,
        true,
        false,
        true,
        false,
      ]);
    });
  });

  /**
   * シナリオ AC-6: 編集 → 保存で daysOfWeek が updateMutation 経由で送信される.
   *   Given /routines にルーティン (name="A", daysOfWeek=[1], version=1) が 1 件存在する
   *   When  「変更」 button を click し editing モードへ遷移する
   *    かつ 火曜 (index 2) の checkbox を click する
   *    かつ 「保存」 button を click する
   *   Then  updateMutation.mutateAsync が { id, ifMatch: 1, name: "A", daysOfWeek: [1, 2] } で 1 回呼ばれる
   */
  describe("AC-6: 編集 → 曜日変更 → 保存 で daysOfWeek が送信される (REQ-4)", () => {
    it("編集 → 火曜を追加 → 保存 で repository.update() に daysOfWeek=[1, 2] が渡る", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({ name: "A", daysOfWeek: [1], version: 1 });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      // 火曜 checkbox を click.
      const form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      const dayCheckboxes = form.querySelector(".routine-card__day-checkboxes");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      await user.click(checkboxes[2]!);

      // 保存.
      await user.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(repo.updateMock).toHaveBeenCalledTimes(1);
      });
      const arg = repo.updateMock.mock.calls[0]?.[0] as {
        id: string;
        ifMatch: number;
        name: string;
        daysOfWeek: number[];
        defaultPriority: "highest" | "normal" | "later";
      };
      expect(arg.id).toBe(routine.id);
      expect(arg.ifMatch).toBe(1);
      expect(arg.name).toBe("A");
      expect(arg.daysOfWeek).toEqual([1, 2]);
      // BL-069 追従: defaultPriority も PATCH に乗る (= openEdit で初期化された値).
      expect(arg.defaultPriority).toBe("normal");
    });
  });

  /**
   * シナリオ AC-7: BL-061 確定の name 変更経路が維持されている.
   *   Given /routines にルーティン (name="A", daysOfWeek=[1], version=1) が 1 件存在する
   *   When  「変更」 button を click し editing モードへ遷移する
   *    かつ name input を "B" に変更する
   *    かつ 「保存」 button を click する
   *   Then  updateMutation.mutateAsync が { id, ifMatch: 1, name: "B", daysOfWeek: [1] } で 1 回呼ばれる
   *    かつ name のみの変更でも daysOfWeek を「変更前の値」で送信する
   */
  describe("AC-7: 名前のみ変更 → 保存 で daysOfWeek は変更前の値で送信される (互換性)", () => {
    it("name のみ変更 → 保存 で daysOfWeek=[1] (変更前) が送信される", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({ name: "A", daysOfWeek: [1], version: 1 });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      const editInput = await screen.findByDisplayValue("A");
      await user.clear(editInput);
      await user.type(editInput, "B");
      await user.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(repo.updateMock).toHaveBeenCalledTimes(1);
      });
      const arg = repo.updateMock.mock.calls[0]?.[0] as {
        id: string;
        ifMatch: number;
        name: string;
        daysOfWeek: number[];
        defaultPriority: "highest" | "normal" | "later";
      };
      expect(arg.name).toBe("B");
      expect(arg.daysOfWeek).toEqual([1]);
      // BL-069 追従: defaultPriority も PATCH に乗る (= openEdit で初期化された値 normal).
      expect(arg.defaultPriority).toBe("normal");
    });
  });

  /**
   * シナリオ AC-8: 編集モードで曜日 0 件のとき「保存」を押しても mutation は呼ばれない.
   *   Given /routines にルーティン (name="A", daysOfWeek=[1], version=1) が 1 件存在する
   *   When  「変更」 button を click し editing モードへ遷移する
   *    かつ 月曜 (index 1) の checkbox を click して unchecked にする (editingDaysOfWeek=[])
   *    かつ 「保存」 button を click する
   *   Then  updateMutation.mutateAsync は呼ばれない
   *    かつ 編集モードのままである
   */
  describe("AC-8: 曜日 0 件で保存 → mutation は呼ばれず編集モードのまま (REQ-3-2)", () => {
    it("全曜日 uncheck → 保存 → repository.update() は呼ばれない", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({ name: "A", daysOfWeek: [1], version: 1 });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      const form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      const dayCheckboxes = form.querySelector(".routine-card__day-checkboxes");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      // 月曜を uncheck (= editingDaysOfWeek=[]).
      await user.click(checkboxes[1]!);

      await user.click(screen.getByRole("button", { name: "保存" }));

      // 短時間待っても呼ばれない.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(repo.updateMock).not.toHaveBeenCalled();
      // 編集モードのまま (= ルーティン名称変更フォームが存続).
      expect(
        screen.queryByRole("form", { name: "ルーティン名称変更フォーム" }),
        "曜日 0 件 silent return 後も編集モードのまま (AC-8)",
      ).not.toBeNull();
    });
  });

  /**
   * シナリオ AC-10: cancelEdit() で曜日 state がリセットされる.
   *   Given 編集モードで月曜と火曜を check した状態にある
   *   When  「キャンセル」 button を click する
   *   Then  編集モードを抜け表示モードに戻る
   *    かつ 表示モードの曜日表示 (.routine-card__days-label) は routine.daysOfWeek (= 変更前の値) を表示する
   */
  describe("AC-10: cancelEdit() で曜日 state がリセットされる (G-5)", () => {
    it("編集モードで火曜 check → キャンセル → 表示モードの days-label は変更前 (月曜のみ)", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({ name: "A", daysOfWeek: [1], version: 1 });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      const { container } = renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      const form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      const dayCheckboxes = form.querySelector(".routine-card__day-checkboxes");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      // 火曜を check (= editingDaysOfWeek=[1, 2]).
      await user.click(checkboxes[2]!);

      // キャンセル.
      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      // 編集 form が消える.
      await waitFor(() => {
        expect(screen.queryByRole("form", { name: "ルーティン名称変更フォーム" })).toBeNull();
      });

      // 表示モードの days-label は「月」のみ (変更前の値).
      const daysLabel = container.querySelector(".routine-card__days-label");
      expect(daysLabel?.textContent ?? "").toContain("月");
      expect(daysLabel?.textContent ?? "").not.toContain("火");
    });
  });

  /**
   * シナリオ AC-25: 既存 BL-061 spec の NFR-FORM-ARIA-LABEL-PRESERVE / NFR-DAY-LABEL-PRESERVE /
   *   NFR-NAME-INPUT-PRESERVE が引き続き満たされる.
   *   Given /routines を render する
   *   When  作成 form / 編集 form を観察する
   *   Then  作成 form の aria-label は「ルーティン作成フォーム」である
   *    かつ 編集 form の aria-label は「ルーティン名称変更フォーム」である
   *    かつ 曜日 7 個の label テキスト (日〜土) が維持されている
   *    かつ name input に placeholder="ルーティン名" と visually-hidden label「ルーティン名」が維持
   */
  describe("AC-25: BL-061 確定の NFR (form aria-label / 曜日 label / name input) が維持されている", () => {
    it("作成 form の aria-label は「ルーティン作成フォーム」である", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const repo = makeMockRepository([]);
      renderWithQueryClient(<RoutinesView repository={repo} />);
      const form = await screen.findByRole("form", { name: "ルーティン作成フォーム" });
      expect(form).toBeTruthy();
    });

    it("編集 form の aria-label は「ルーティン名称変更フォーム」である", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({ name: "A", daysOfWeek: [1], version: 1 });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);
      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));
      const editForm = await screen.findByRole("form", {
        name: "ルーティン名称変更フォーム",
      });
      expect(editForm).toBeTruthy();
    });

    it("name input に placeholder='ルーティン名' と visually-hidden label が存続する (NFR-NAME-INPUT-PRESERVE)", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const repo = makeMockRepository([]);
      const { container } = renderWithQueryClient(<RoutinesView repository={repo} />);
      const input = await screen.findByLabelText("ルーティン名");
      expect((input as HTMLInputElement).getAttribute("placeholder")).toBe("ルーティン名");
      const nameLabel = container.querySelector("label[for='routine-name']");
      expect(nameLabel?.classList.contains("visually-hidden")).toBe(true);
    });

    it("曜日 7 個の label テキスト (日〜土) が作成 form / 編集 form 両方で維持される (NFR-DAY-LABEL-PRESERVE)", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({ name: "A", daysOfWeek: [1], version: 1 });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);
      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      // 作成 form と編集 form の両方で 7 個ずつの曜日 label.
      const allDayCheckboxes = document.querySelectorAll(".routine-card__day-checkboxes");
      expect(
        allDayCheckboxes.length,
        "曜日 checkboxes セクションが 2 か所 (作成 + 編集) ではない",
      ).toBe(2);
      const expected = ["日", "月", "火", "水", "木", "金", "土"];
      for (const section of Array.from(allDayCheckboxes)) {
        const labels = Array.from(section.querySelectorAll("label")).map(
          (l) => l.textContent?.trim() ?? "",
        );
        expect(labels.length).toBe(7);
        for (let i = 0; i < expected.length; i++) {
          expect(labels[i]?.includes(expected[i]!)).toBe(true);
        }
      }
    });
  });

  // ============================================================
  // (f) 不変性 assert (AC-18 / AC-19)
  // ============================================================

  /**
   * シナリオ AC-18: tokens.css を変更していない (NFR-NO-NEW-TOKENS).
   *   Given 本 BL の実装がマージされた
   *   When  tokens.css を BL-061 完了時点と比較する
   *   Then  本 BL で参照するトークンが引き続き定義されており新規追加が無い
   *
   * 厳密な diff は CI / git diff で検出する. 本テストでは「本 BL で参照しうるトークンが
   * 引き続き定義されていること」を不変性 grep で代替する (BL-061 AC-18 と同方式).
   */
  describe("AC-18: tokens.css を変更していない (NFR-NO-NEW-TOKENS)", () => {
    const requiredTokens = [
      "--color-bg",
      "--color-border",
      "--radius-lg",
      "--space-md",
      "--space-sm",
      "--space-xs",
      "--color-fg-subtle",
      "--font-size-small",
    ] as const;

    for (const token of requiredTokens) {
      it(`tokens.css に ${token} が定義されている`, () => {
        const css = readFileSync(tokensCssPath, "utf-8");
        const escaped = token.replace(/[-]/g, "\\-");
        const re = new RegExp(`${escaped}\\s*:`);
        expect(css, `tokens.css に ${token} が定義されていない (NFR-NO-NEW-TOKENS 違反)`).toMatch(
          re,
        );
      });
    }
  });

  /**
   * シナリオ AC-19: RoutineRepository / Repository API / RoutineConflictError は無改修 (NFR-COMPAT).
   *   Given web/src/repositories/routine-repository.ts を開いた
   *   When  本 BL の前後で diff を取る
   *   Then  WebRoutineRepository / UpdateRoutineCommand / RoutineConflictError の export 型に差分が無い
   *    かつ ConflictDialog / useConflictDialog の呼び出しに差分が無い
   *    かつ <PriorityStars /> 本体 (priority-stars.tsx / priority-stars.css) に差分が無い
   */
  describe("AC-19: RoutineRepository / PriorityStars 本体が無改修 (NFR-COMPAT / NFR-PRIORITY-STARS-COMPAT)", () => {
    it("routine-repository.ts に主要 export (WebRoutineRepository / UpdateRoutineCommand / RoutineConflictError 等) が残っている", () => {
      const src = readFileSync(routineRepositoryTsPath, "utf-8");
      expect(src).toMatch(/export\s+interface\s+WebRoutineRepository/);
      expect(src).toMatch(/export\s+interface\s+WebRoutine\b/);
      expect(src).toMatch(/export\s+class\s+RoutineConflictError/);
      expect(src).toMatch(/export\s+interface\s+CreateRoutineCommand/);
      expect(src).toMatch(/export\s+interface\s+UpdateRoutineCommand/);
      expect(src).toMatch(/export\s+interface\s+DeleteRoutineCommand/);
    });

    it("UpdateRoutineCommand.daysOfWeek が optional のままで型に互換性がある (BL-017 完了済み)", () => {
      const src = readFileSync(routineRepositoryTsPath, "utf-8");
      // UpdateRoutineCommand interface 内に daysOfWeek?: number[] が含まれる.
      expect(src, "UpdateRoutineCommand.daysOfWeek? が見つからない (NFR-COMPAT 違反)").toMatch(
        /UpdateRoutineCommand[\s\S]{0,500}daysOfWeek\?\s*:\s*number\[\]/,
      );
    });

    it("priority-stars.tsx が存在し PriorityStars が export されている (NFR-PRIORITY-STARS-COMPAT)", () => {
      expect(existsSync(priorityStarsTsxPath)).toBe(true);
      const src = readFileSync(priorityStarsTsxPath, "utf-8");
      expect(src).toMatch(/export\s+function\s+PriorityStars/);
    });

    it("priority-stars.css が存在する (NFR-PRIORITY-STARS-COMPAT)", () => {
      expect(existsSync(priorityStarsCssPath)).toBe(true);
    });

    it("routines-view.tsx に ConflictDialog / useConflictDialog の呼び出しが残っている (NFR-COMPAT)", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "useConflictDialog が無い").toMatch(/useConflictDialog/);
      expect(src, "<ConflictDialog が無い").toMatch(/<ConflictDialog\b/);
    });
  });

  // ============================================================
  // 前提: 本 BL の対象ファイルが存在する (回帰検出)
  // ============================================================

  describe("前提: 本 BL の対象ファイルが存在する", () => {
    it("web/src/ui/routine-card/routine-card.tsx が存在する", () => {
      expect(existsSync(routineCardTsxPath)).toBe(true);
    });

    it("web/src/ui/routine-card/routine-form-card.tsx が存在する", () => {
      expect(existsSync(routineFormCardTsxPath)).toBe(true);
    });

    it("web/src/ui/routine-card/routine-card.css が存在する", () => {
      expect(existsSync(routineCardCssPath)).toBe(true);
    });

    it("web/src/ui/routines-view/routines-view.tsx が存在する", () => {
      expect(existsSync(routinesViewTsxPath)).toBe(true);
    });
  });
});
