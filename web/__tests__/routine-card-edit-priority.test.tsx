// @vitest-environment jsdom

/**
 * ルーティン編集モードでの優先度変更
 * (BL-069 / routine-card-edit-priority) 受け入れ基準テスト.
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-edit-priority/spec.md
 *   docs/developer/features/routine-card-edit-priority/plan.md
 *   docs/developer/features/routine-card-edit-priority/tasks.md
 *
 * 本ファイルが検証する受け入れ基準:
 *   AC-1 : <RoutineCard isEditing=true> の編集 form に <PriorityStars /> が render される (DOM レンダ).
 *   AC-2 : 編集モードの初期表示で routine.defaultPriority が PriorityStars に選択状態で反映される
 *          (結合 / DOM レンダ).
 *   AC-3 : PriorityStars の操作で onEditingDefaultPriorityChange が Priority 型で呼ばれる (DOM レンダ).
 *   AC-4 : 編集 → 優先度変更 → 保存で defaultPriority が updateMutation 経由で送信される (結合レンダ).
 *   AC-5 : cancelEdit で editingDefaultPriority がリセットされる (結合レンダ).
 *   AC-6 : 編集モードの DOM 順は input → 曜日 → 優先度 → 保存 → キャンセル である (D-001 / DOM レンダ).
 *   AC-7 : 名前のみ変更 → 保存でも defaultPriority は変更前の値で送信される (結合レンダ).
 *   AC-8 : 編集モードで曜日 0 件のときは「保存」を押しても mutation は呼ばれない (BL-068 維持 / 結合).
 *   AC-9 : openEdit で editingDefaultPriority が routine.defaultPriority で初期化される (結合レンダ).
 *   AC-10: RoutineCardProps に editingDefaultPriority / onEditingDefaultPriorityChange が追加 (型 grep).
 *   AC-11: routine-card.tsx 編集モードの <PriorityStars /> 呼び出しに groupLabel / idPrefix が
 *          指定されている (型 grep).
 *   AC-12: routines-view.tsx が editingDefaultPriority state を持ち <RoutineCard> に渡す (型 grep).
 *   AC-13: updateMutation の mutationFn 引数型と body に defaultPriority が含まれる (型 grep).
 *   AC-14: routine-card.css に新規セレクタが追加されていない (CSS 直読み / 不変性).
 *   AC-15: tokens.css を変更していない (CSS 直読み / 不変性).
 *   AC-16: WebRoutineRepository / Repository API / RoutineConflictError は無改修 (型 grep / 不変性).
 *   AC-17: BL-068 / BL-061 / BL-040 既存テスト全件 green (本ファイルでは個別 assert せず
 *          ルートの npm test で担保).
 *   AC-18: 既存 E2E 全件 green (本ファイルでは個別 assert せず npx playwright test で担保).
 *   AC-19: BL-068 spec の D-011 を本 BL で逆転した記録が残っている (ドキュメント直読み).
 *   AC-20: アクセシビリティ違反 0 件を維持する (本ファイルでは個別 assert せず e2e/a11y.spec.ts).
 *   AC-21: 編集モードと起票モードの PriorityStars が同時に DOM に出現しても id が衝突しない
 *          (結合レンダ).
 *   AC-22: BL-068 確定の name 変更 / 曜日変更経路が引き続き維持されている (結合レンダ).
 *   AC-23: BL-068 AC-25 の NFR-FORM-ARIA-LABEL-PRESERVE / NFR-DAY-LABEL-PRESERVE /
 *          NFR-NAME-INPUT-PRESERVE が引き続き満たされる (結合レンダ).
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - 実装前 (= routine-card.tsx / routines-view.tsx に editingDefaultPriority が未追加) では,
 *     DOM レンダ系 (AC-1 / AC-2 / AC-3 / AC-6), 結合レンダ系 (AC-4 / AC-5 / AC-7 / AC-9 / AC-21 /
 *     AC-22), 型 grep 系 (AC-10 / AC-11 / AC-12 / AC-13), ドキュメント系 (AC-19) が red になる想定.
 *   - 既存ファイル不変性系 (AC-14 / AC-15 / AC-16), AC-8 / AC-23 は実装前から green の可能性
 *     (= 既存挙動と整合的なため).
 *   - implementer が REQ-1 〜 REQ-8 を実装することで red 群が green 化する.
 *
 * 検証スタイル:
 *   - DOM レンダ: BL-068 と同形の動的 import + render パターン.
 *   - 結合レンダ: BL-068 と同形の MockRepository + QueryClientProvider.
 *   - 型 grep: readFileSync + 文字列 contains / 正規表現.
 *   - 不変性 assert: readFileSync + extractRuleBody + 新規セレクタ非存在の grep.
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

const routineCardCssPath = resolve(webSrcRoot, "ui/routine-card/routine-card.css");
const routineCardTsxPath = resolve(webSrcRoot, "ui/routine-card/routine-card.tsx");
const routineFormCardTsxPath = resolve(webSrcRoot, "ui/routine-card/routine-form-card.tsx");
const routinesViewTsxPath = resolve(webSrcRoot, "ui/routines-view/routines-view.tsx");
const tokensCssPath = resolve(webSrcRoot, "styles/tokens.css");
const routineRepositoryTsPath = resolve(webSrcRoot, "repositories/routine-repository.ts");
const priorityStarsTsxPath = resolve(webSrcRoot, "ui/priority-stars/priority-stars.tsx");
const priorityStarsCssPath = resolve(webSrcRoot, "ui/priority-stars/priority-stars.css");
const routineCardEditFieldsSpecPath = resolve(
  repoRoot,
  "docs/developer/features/routine-card-edit-fields/spec.md",
);

const NOW = "2026-06-12T09:00:00.000Z";
const ROUTINE_ID_1 = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";

// ============================================================
// CSS ルール本文の抽出ヘルパ (BL-068 と同形)
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

async function importRoutineCard(): Promise<RoutineCardModule> {
  const path = "../src/ui/routine-card/routine-card.js";
  return (await import(/* @vite-ignore */ path)) as RoutineCardModule;
}

// ============================================================
// 結合レンダ用 MockRepository + QueryClient ラッパ
// ============================================================

type UpdateCmd = {
  id: string;
  ifMatch: number;
  name?: string;
  daysOfWeek?: number[];
  defaultPriority?: "highest" | "normal" | "later";
};

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
  const updateMock = vi.fn(async (cmd: UpdateCmd): Promise<WebRoutine> => {
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
  });
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

describe("ルーティン編集モードでの優先度変更 (BL-069 / routine-card-edit-priority)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // (a) <RoutineCard isEditing> jsdom レンダ系 (AC-1 / AC-2 / AC-3 / AC-6)
  // ============================================================

  /**
   * シナリオ AC-1: <RoutineCard isEditing=true> の編集 form に <PriorityStars /> が render される.
   *   Given <RoutineCard isEditing={true} editingDefaultPriority="normal" ... /> を render する
   *   When  編集 form 内を観察する
   *   Then  div[role="radiogroup"] (PriorityStars) が編集 form 内に存在する
   *    かつ その radiogroup の aria-label に「優先度」を含む
   *    かつ 編集 form 内に <select> 系の優先度入力は存在しない
   */
  describe("AC-1: <RoutineCard isEditing=true> の編集 form に <PriorityStars /> が render される", () => {
    it("編集 form 内に div[role='radiogroup'] (PriorityStars) が存在する", async () => {
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
      const radiogroup = form?.querySelector("div[role='radiogroup']");
      expect(
        radiogroup,
        "編集モード form 内に div[role='radiogroup'] (PriorityStars) が無い (REQ-1 / G-1 違反)",
      ).not.toBeNull();
    });

    it("編集 form 内の radiogroup の aria-label に「優先度」を含む", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
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
      const radiogroup = container.querySelector("form div[role='radiogroup']");
      expect(radiogroup, "編集 form 内の radiogroup が無い").not.toBeNull();
      const ariaLabel = radiogroup?.getAttribute("aria-label") ?? "";
      expect(
        ariaLabel,
        "radiogroup の aria-label に「優先度」が含まれない (REQ-1 / G-6 違反)",
      ).toContain("優先度");
    });

    it("編集 form 内に <select> 系の優先度入力は存在しない", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
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
      const select = form?.querySelector("select");
      expect(select, "編集 form 内に <select> が残存 (REQ-1 / D-002 違反)").toBeNull();
    });
  });

  /**
   * シナリオ AC-2: 編集モードの初期表示で routine.defaultPriority が PriorityStars に
   *   選択状態で反映される.
   *   Given <RoutineCard isEditing={true} editingDefaultPriority="highest" ... /> を render する
   *   When  編集 form 内の PriorityStars を観察する
   *   Then  radiogroup の aria-label が「優先度: 最優先」を含む (BL-040 REQ-4)
   *    かつ "highest" に対応する radio (= 星 3 つ目) が aria-checked="true" になる
   */
  describe("AC-2: 編集モードの初期表示で routine.defaultPriority が PriorityStars に反映される", () => {
    it("editingDefaultPriority='highest' で radiogroup aria-label が「優先度: 最優先」を含む", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ defaultPriority: "highest" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="highest"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("form div[role='radiogroup']");
      const ariaLabel = radiogroup?.getAttribute("aria-label") ?? "";
      expect(ariaLabel).toContain("優先度");
      expect(ariaLabel).toContain("最優先");
    });

    it("editingDefaultPriority='highest' で星 3 つ目 (radio) が aria-checked='true' である", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ defaultPriority: "highest" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="highest"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("form div[role='radiogroup']");
      const radios = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      expect(radios.length, "PriorityStars の星 button が 3 個ではない").toBe(3);
      const checked = radios.map((r) => r.getAttribute("aria-checked"));
      // 星 3 つ目 (highest) が "true". 他は "false".
      expect(checked).toEqual(["false", "false", "true"]);
    });

    it("editingDefaultPriority='later' で星 1 つ目 (radio) が aria-checked='true' である", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine({ defaultPriority: "later" });
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="later"
          onEditingDefaultPriorityChange={() => {}}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("form div[role='radiogroup']");
      const radios = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      const checked = radios.map((r) => r.getAttribute("aria-checked"));
      // 星 1 つ目 (later) が "true".
      expect(checked).toEqual(["true", "false", "false"]);
    });
  });

  /**
   * シナリオ AC-3: PriorityStars の操作で onEditingDefaultPriorityChange が Priority 型で呼ばれる.
   *   Given <RoutineCard isEditing={true} editingDefaultPriority="normal"
   *     onEditingDefaultPriorityChange={mock} ... /> を render する
   *   When  「最優先」 (highest) に対応する radio (= 星 3 つ目) を click する
   *   Then  mock が "highest" (Priority 型) で 1 回呼ばれる
   *   When  「後回し」 (later) に対応する radio を click する
   *   Then  mock が "later" で次に呼ばれる
   */
  describe("AC-3: PriorityStars の操作で onEditingDefaultPriorityChange が Priority 型で呼ばれる", () => {
    it("星 3 つ目 (highest) click で onEditingDefaultPriorityChange('highest') が 1 回呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const onEditingDefaultPriorityChange = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={onEditingDefaultPriorityChange}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("form div[role='radiogroup']");
      expect(radiogroup, "編集 form 内の radiogroup が無い").not.toBeNull();
      const stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      expect(stars.length, "PriorityStars の星 button が 3 個ではない").toBe(3);
      await user.click(stars[2]!);
      expect(onEditingDefaultPriorityChange).toHaveBeenCalledTimes(1);
      expect(onEditingDefaultPriorityChange).toHaveBeenCalledWith("highest");
    });

    it("星 1 つ目 (later) click で onEditingDefaultPriorityChange('later') が 1 回呼ばれる", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const onEditingDefaultPriorityChange = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={onEditingDefaultPriorityChange}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("form div[role='radiogroup']");
      const stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      await user.click(stars[0]!);
      expect(onEditingDefaultPriorityChange).toHaveBeenCalledTimes(1);
      expect(onEditingDefaultPriorityChange).toHaveBeenCalledWith("later");
    });

    it("同値 (normal) の星 click は no-op (BL-040 D-003 維持)", async () => {
      const { RoutineCard } = await importRoutineCard();
      const routine = makeRoutine();
      const onEditingDefaultPriorityChange = vi.fn();
      const user = userEvent.setup();
      const { container } = render(
        <RoutineCard
          routine={routine}
          isEditing={true}
          editingName="朝の運動"
          onEditingNameChange={() => {}}
          editingDaysOfWeek={[1]}
          onEditingDaysOfWeekChange={() => {}}
          editingDefaultPriority="normal"
          onEditingDefaultPriorityChange={onEditingDefaultPriorityChange}
          onStartEdit={() => {}}
          onCancelEdit={() => {}}
          onSaveEdit={(e: React.FormEvent) => {
            e.preventDefault();
          }}
          onDelete={() => {}}
        />,
      );
      const radiogroup = container.querySelector("form div[role='radiogroup']");
      const stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      // 現在値 normal = 2 個目の星.
      await user.click(stars[1]!);
      expect(onEditingDefaultPriorityChange).not.toHaveBeenCalled();
    });
  });

  /**
   * シナリオ AC-6: 編集モードの DOM 順は input → 曜日 → 優先度 → 保存 → キャンセル である (D-001).
   *   Given <RoutineCard isEditing={true} editingDaysOfWeek={[1]} editingDefaultPriority="normal"
   *     ... /> を render する
   *   When  編集 form 内の direct children を DOM 順に観察する
   *   Then  1 番目の child は label.visually-hidden (htmlFor=input) である
   *    かつ 2 番目の child は input (type=text / name input) である
   *    かつ 3 番目の child は div.routine-card__day-checkboxes である
   *    かつ 4 番目の child は div[role="radiogroup"] (PriorityStars) である
   *    かつ 5 番目の child は button[type="submit"] (保存) である
   *    かつ 6 番目の child は button[type="button"] (キャンセル) である
   */
  describe("AC-6: 編集モードの DOM 順は input → 曜日 → 優先度 → 保存 → キャンセル である (D-001)", () => {
    it("編集 form の direct children が [label, input, div.day-checkboxes, div.radiogroup, button-submit, button-cancel] の順", async () => {
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
      expect(
        children.length,
        "form の direct children が 6 個ではない (D-001 違反)",
      ).toBeGreaterThanOrEqual(6);

      const c0 = children[0]!;
      const c1 = children[1]!;
      const c2 = children[2]!;
      const c3 = children[3]!;
      const c4 = children[4]!;
      const c5 = children[5]!;

      expect(c0.tagName.toLowerCase(), "1 番目の child が label ではない").toBe("label");
      expect(
        c0.classList.contains("visually-hidden"),
        "1 番目の label が visually-hidden ではない",
      ).toBe(true);
      expect(c1.tagName.toLowerCase(), "2 番目の child が input ではない").toBe("input");
      expect(c2.tagName.toLowerCase(), "3 番目の child が div ではない").toBe("div");
      expect(
        c2.classList.contains("routine-card__day-checkboxes"),
        "3 番目の child の class に routine-card__day-checkboxes が無い",
      ).toBe(true);
      expect(c3.tagName.toLowerCase(), "4 番目の child が div ではない").toBe("div");
      expect(
        c3.getAttribute("role"),
        "4 番目の child の role が radiogroup ではない (D-001 違反)",
      ).toBe("radiogroup");
      expect(c4.tagName.toLowerCase(), "5 番目の child が button ではない").toBe("button");
      expect(c4.getAttribute("type"), "5 番目の child の type が submit ではない").toBe("submit");
      expect(c5.tagName.toLowerCase(), "6 番目の child が button ではない").toBe("button");
      expect(c5.getAttribute("type"), "6 番目の child の type が button ではない").toBe("button");
    });
  });

  // ============================================================
  // (b) 結合 (<RoutinesView> + MockRepository) 系
  // (AC-4 / AC-5 / AC-7 / AC-8 / AC-9 / AC-21 / AC-22 / AC-23)
  // ============================================================

  /**
   * シナリオ AC-9: openEdit で editingDefaultPriority が routine.defaultPriority で初期化される.
   *   Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="later", version=1)
   *     が 1 件存在する
   *   When  「変更」 button を click し editing モードへ遷移する
   *   Then  routines-view.tsx 内の editingDefaultPriority state が "later" で初期化される
   *    かつ PriorityStars 上で "later" に対応する radio が aria-checked="true" になる
   */
  describe("AC-9: openEdit で editingDefaultPriority が routine.defaultPriority で初期化される (G-3)", () => {
    it("変更 click 直後の編集 form の PriorityStars が routine.defaultPriority='later' を反映する", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({
        name: "A",
        daysOfWeek: [1],
        defaultPriority: "later",
        version: 1,
      });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      const form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      const radiogroup = form.querySelector("div[role='radiogroup']");
      expect(radiogroup, "編集 form 内の radiogroup が無い").not.toBeNull();
      const radios = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      expect(radios.length).toBe(3);
      // 星 1 つ目 (later) が aria-checked="true".
      expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    });
  });

  /**
   * シナリオ AC-4: 編集 → 優先度変更 → 保存 で defaultPriority が updateMutation 経由で送信される.
   *   Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="normal", version=1)
   *     が 1 件存在する
   *    かつ updateMutation を spy する
   *   When  「変更」 button を click し editing モードへ遷移する
   *    かつ 優先度を「最優先」 (highest) に変更する
   *    かつ 「保存」 button を click する
   *   Then  updateMutation.mutateAsync が
   *     { id, ifMatch: 1, name: "A", daysOfWeek: [1], defaultPriority: "highest" } で 1 回呼ばれる
   */
  describe("AC-4: 編集 → 優先度変更 → 保存 で defaultPriority が送信される (REQ-3 / REQ-4)", () => {
    it("編集 → 星 3 つ目 click → 保存 で repository.update() に defaultPriority='highest' が渡る", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({
        name: "A",
        daysOfWeek: [1],
        defaultPriority: "normal",
        version: 1,
      });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      // 編集 form 内の PriorityStars の星 3 つ目を click.
      const form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      const radiogroup = form.querySelector("div[role='radiogroup']");
      const stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      expect(stars.length).toBe(3);
      await user.click(stars[2]!);

      // 保存.
      await user.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(repo.updateMock).toHaveBeenCalledTimes(1);
      });
      const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateCmd;
      expect(arg.id).toBe(routine.id);
      expect(arg.ifMatch).toBe(1);
      expect(arg.name).toBe("A");
      expect(arg.daysOfWeek).toEqual([1]);
      expect(arg.defaultPriority).toBe("highest");
    });
  });

  /**
   * シナリオ AC-5: cancelEdit で editingDefaultPriority がリセットされる.
   *   Given 編集モードで優先度を "later" に変更した状態にある
   *   When  「キャンセル」 button を click する
   *   Then  編集モードを抜け表示モードに戻る
   *    かつ routines-view.tsx 内の editingDefaultPriority state が "normal" にリセットされる (D-005)
   *    かつ 表示モードの該当ルーティンの defaultPriority は変更前の値のまま (= 通信が走らなかったため)
   */
  describe("AC-5: cancelEdit で editingDefaultPriority がリセットされる (D-005)", () => {
    it("編集モードで星 1 click → キャンセル → 編集モードを抜ける + updateMutation は呼ばれない", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({
        name: "A",
        daysOfWeek: [1],
        defaultPriority: "highest",
        version: 1,
      });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      const form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      const radiogroup = form.querySelector("div[role='radiogroup']");
      const stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      // 星 1 つ目 (later) を click.
      await user.click(stars[0]!);

      // キャンセル.
      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      // 編集 form が消える.
      await waitFor(() => {
        expect(screen.queryByRole("form", { name: "ルーティン名称変更フォーム" })).toBeNull();
      });

      // updateMutation は呼ばれない.
      expect(repo.updateMock).not.toHaveBeenCalled();
    });

    it("キャンセル後に再度「変更」 button を click すると editingDefaultPriority は routine.defaultPriority='highest' で初期化される (D-005 + openEdit)", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({
        name: "A",
        daysOfWeek: [1],
        defaultPriority: "highest",
        version: 1,
      });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      // 編集モードで星 1 (later) に変更してキャンセル.
      let form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      let radiogroup = form.querySelector("div[role='radiogroup']");
      let stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      await user.click(stars[0]!);
      await user.click(screen.getByRole("button", { name: "キャンセル" }));

      // 表示モードに戻ったら再度「変更」.
      await waitFor(() => {
        expect(screen.queryByRole("form", { name: "ルーティン名称変更フォーム" })).toBeNull();
      });
      await user.click(await screen.findByRole("button", { name: "変更" }));

      // 再度の編集 form の PriorityStars は routine.defaultPriority='highest' で初期化される.
      form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      radiogroup = form.querySelector("div[role='radiogroup']");
      stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      expect(stars.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    });
  });

  /**
   * シナリオ AC-7: 編集 → 名前のみ変更 → 保存 でも defaultPriority は変更前の値で送信される.
   *   Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="highest", version=1)
   *     が 1 件存在する
   *   When  「変更」 button を click し editing モードへ遷移する
   *    かつ 名前を "B" に変更する (優先度は触らない)
   *    かつ 「保存」 button を click する
   *   Then  updateMutation.mutateAsync が
   *     { id, ifMatch: 1, name: "B", daysOfWeek: [1], defaultPriority: "highest" } で 1 回呼ばれる
   *    かつ defaultPriority も「変更前の値 highest」で送信される (= openEdit で初期化された値)
   */
  describe("AC-7: 名前のみ変更 → 保存 でも defaultPriority は変更前の値で送信される (REQ-3)", () => {
    it("name のみ変更 → 保存 で defaultPriority='highest' (= 変更前) が送信される", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({
        name: "A",
        daysOfWeek: [1],
        defaultPriority: "highest",
        version: 1,
      });
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
      const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateCmd;
      expect(arg.name).toBe("B");
      expect(arg.daysOfWeek).toEqual([1]);
      expect(arg.defaultPriority).toBe("highest");
    });
  });

  /**
   * シナリオ AC-8: 編集モードで曜日 0 件のときは「保存」を押しても mutation は呼ばれない
   *   (BL-068 AC-8 維持).
   *   Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="normal", version=1)
   *     が 1 件存在する
   *   When  「変更」 button を click し editing モードへ遷移する
   *    かつ 月曜の checkbox を uncheck する (editingDaysOfWeek=[])
   *    かつ 優先度を "later" に変更する
   *    かつ 「保存」 button を click する
   *   Then  updateMutation.mutateAsync は呼ばれない (= BL-068 REQ-3-2 silent return 維持)
   *    かつ 編集モードのままである
   */
  describe("AC-8: 曜日 0 件で保存 → mutation は呼ばれず編集モードのまま (BL-068 維持)", () => {
    it("全曜日 uncheck + 優先度 later 変更 → 保存 → repository.update() は呼ばれない", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({
        name: "A",
        daysOfWeek: [1],
        defaultPriority: "normal",
        version: 1,
      });
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
      // 月曜 (index 1) を uncheck (= editingDaysOfWeek=[]).
      await user.click(checkboxes[1]!);

      // 優先度を later に変更.
      const radiogroup = form.querySelector("div[role='radiogroup']");
      const stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      await user.click(stars[0]!);

      await user.click(screen.getByRole("button", { name: "保存" }));

      // 短時間待っても呼ばれない.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(repo.updateMock).not.toHaveBeenCalled();
      // 編集モードのまま.
      expect(
        screen.queryByRole("form", { name: "ルーティン名称変更フォーム" }),
        "曜日 0 件 silent return 後も編集モードのまま (BL-068 AC-8 維持)",
      ).not.toBeNull();
    });
  });

  /**
   * シナリオ AC-21: 編集モードと起票モードの PriorityStars が同時に DOM に出現しても id が衝突しない.
   *   Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="normal", version=1)
   *     が 1 件存在する
   *   When  「変更」 button を click し editing モードへ遷移する
   *   Then  起票カード側 PriorityStars の radio button id は "routine-create-..." prefix で始まる
   *    かつ 編集カード側 PriorityStars の radio button id は "routine-edit-..." prefix で始まる
   *    かつ 同一 id を持つ radio button は存在しない (id 重複 0 件)
   */
  describe("AC-21: 編集 + 起票の PriorityStars id が衝突しない (NFR-IDPREFIX-DISJOINT)", () => {
    it("編集モード遷移時に routine-create / routine-edit prefix の radio が共存し id 重複 0 件", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({
        name: "A",
        daysOfWeek: [1],
        defaultPriority: "normal",
        version: 1,
      });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      const { container } = renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });

      // 全 radio button の id を収集.
      const radios = Array.from(
        container.querySelectorAll("button[role='radio']"),
      ) as HTMLElement[];
      const ids = radios.map((r) => r.getAttribute("id") ?? "");

      // 起票側 (routine-create-...) と 編集側 (routine-edit-...) の両方が存在する.
      const createPrefixIds = ids.filter((id) => id.startsWith("routine-create-"));
      const editPrefixIds = ids.filter((id) => id.startsWith("routine-edit-"));
      expect(
        createPrefixIds.length,
        "起票側 PriorityStars (routine-create-...) の radio が無い",
      ).toBeGreaterThan(0);
      expect(
        editPrefixIds.length,
        "編集側 PriorityStars (routine-edit-...) の radio が無い (D-002 違反)",
      ).toBeGreaterThan(0);

      // id 重複 0 件.
      const idSet = new Set(ids);
      expect(
        idSet.size,
        "同一 id を持つ radio button が存在する (NFR-IDPREFIX-DISJOINT 違反)",
      ).toBe(ids.length);
    });
  });

  /**
   * シナリオ AC-22: BL-068 確定の name 変更 / 曜日変更経路が引き続き維持されている.
   *   Given /routines にルーティン (name="A", daysOfWeek=[1], defaultPriority="normal", version=1)
   *     が 1 件存在する
   *   When  「変更」 button を click し editing モードへ遷移する
   *    かつ name を "B" / 曜日を [1, 2] / 優先度を "highest" に変更する
   *    かつ 「保存」 button を click する
   *   Then  updateMutation.mutateAsync が
   *     { id, ifMatch: 1, name: "B", daysOfWeek: [1, 2], defaultPriority: "highest" } で 1 回呼ばれる
   *    かつ name / daysOfWeek / defaultPriority の 3 フィールドすべてが PATCH に乗る
   */
  describe("AC-22: name / 曜日 / 優先度 の 3 フィールドすべてが PATCH に乗る", () => {
    it("name='B' + 曜日 [1,2] + 優先度 highest → 保存 → 3 フィールドすべてが update に渡る", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({
        name: "A",
        daysOfWeek: [1],
        defaultPriority: "normal",
        version: 1,
      });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);

      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      const form = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });

      // name を "B" に変更.
      const editInput = await screen.findByDisplayValue("A");
      await user.clear(editInput);
      await user.type(editInput, "B");

      // 火曜 (index 2) を check.
      const dayCheckboxes = form.querySelector(".routine-card__day-checkboxes");
      const checkboxes = Array.from(
        dayCheckboxes?.querySelectorAll("input[type='checkbox']") ?? [],
      ) as HTMLInputElement[];
      await user.click(checkboxes[2]!);

      // 優先度を highest に変更 (星 3 つ目).
      const radiogroup = form.querySelector("div[role='radiogroup']");
      const stars = Array.from(
        radiogroup?.querySelectorAll("button[role='radio']") ?? [],
      ) as HTMLElement[];
      await user.click(stars[2]!);

      // 保存.
      await user.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => {
        expect(repo.updateMock).toHaveBeenCalledTimes(1);
      });
      const arg = repo.updateMock.mock.calls[0]?.[0] as UpdateCmd;
      expect(arg.id).toBe(routine.id);
      expect(arg.ifMatch).toBe(1);
      expect(arg.name).toBe("B");
      expect(arg.daysOfWeek).toEqual([1, 2]);
      expect(arg.defaultPriority).toBe("highest");
    });
  });

  /**
   * シナリオ AC-23: BL-068 AC-25 の NFR-FORM-ARIA-LABEL-PRESERVE / NFR-DAY-LABEL-PRESERVE /
   *   NFR-NAME-INPUT-PRESERVE が引き続き満たされる.
   *   Given /routines を render する
   *   When  作成 form / 編集 form を観察する
   *   Then  作成 form の aria-label は「ルーティン作成フォーム」である
   *    かつ 編集 form の aria-label は「ルーティン名称変更フォーム」である
   *    かつ 編集 form 内の曜日 7 個の label テキスト (日〜土) が維持されている
   *    かつ 編集 form 内の name input に placeholder="ルーティン名" と
   *         visually-hidden label「ルーティン名」が維持されている
   */
  describe("AC-23: BL-068 の NFR (form aria-label / 曜日 label / name input) が維持されている", () => {
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
      const editForm = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      expect(editForm).toBeTruthy();
    });

    it("編集 form の name input に placeholder='ルーティン名' と visually-hidden label が存続する", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({ name: "A", daysOfWeek: [1], version: 1 });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);
      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      const editForm = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      const input = editForm.querySelector("input[type='text']") as HTMLInputElement | null;
      expect(input).not.toBeNull();
      expect(input?.getAttribute("placeholder")).toBe("ルーティン名");
      const label = editForm.querySelector("label.visually-hidden");
      expect(label, "編集 form の visually-hidden label が無い").not.toBeNull();
      expect(label?.textContent ?? "").toContain("ルーティン名");
    });

    it("編集 form の曜日 7 個の label テキスト (日〜土) が維持されている", async () => {
      const { RoutinesView } = await import("../src/ui/routines-view/routines-view.js");
      const routine = makeRoutine({ name: "A", daysOfWeek: [1], version: 1 });
      const repo = makeMockRepository([routine]);
      const user = userEvent.setup();
      renderWithQueryClient(<RoutinesView repository={repo} />);
      await screen.findByText("A");
      await user.click(await screen.findByRole("button", { name: "変更" }));

      const editForm = await screen.findByRole("form", { name: "ルーティン名称変更フォーム" });
      const dayCheckboxes = editForm.querySelector(".routine-card__day-checkboxes");
      const labels = Array.from(dayCheckboxes?.querySelectorAll("label") ?? []).map(
        (l) => l.textContent?.trim() ?? "",
      );
      const expected = ["日", "月", "火", "水", "木", "金", "土"];
      for (let i = 0; i < expected.length; i++) {
        expect(
          labels[i]?.includes(expected[i]!),
          `編集 form の曜日 label[${i}] = "${labels[i]}" に「${expected[i]}」が含まれない`,
        ).toBe(true);
      }
    });
  });

  // ============================================================
  // (c) 型 / interface / state grep 系 (AC-10 / AC-11 / AC-12 / AC-13 / AC-19)
  // ============================================================

  /**
   * シナリオ AC-10: RoutineCardProps に editingDefaultPriority / onEditingDefaultPriorityChange が
   *   追加されている.
   *   Given web/src/ui/routine-card/routine-card.tsx を開いた
   *   When  RoutineCardProps の interface を観察する
   *   Then  editingDefaultPriority: Priority の宣言を含む
   *    かつ onEditingDefaultPriorityChange: (next: Priority) => void の宣言を含む
   *    かつ 既存の routine / isEditing / editingName / onEditingNameChange / editingDaysOfWeek /
   *         onEditingDaysOfWeekChange / onStartEdit / onCancelEdit / onSaveEdit / onDelete / as
   *         は維持されている
   *    かつ import type { Priority } from "@todica/domain/task" を含む
   */
  describe("AC-10: RoutineCardProps に editingDefaultPriority / onEditingDefaultPriorityChange が追加 (G-2)", () => {
    it("routine-card.tsx に import type { Priority } from '@todica/domain/task' を含む", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, "Priority 型の import が無い (G-2 違反)").toMatch(
        /import\s+type\s*\{\s*Priority\s*\}\s*from\s*["']@todica\/domain\/task["']/,
      );
    });

    it("routine-card.tsx に editingDefaultPriority: Priority の宣言を含む", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, "editingDefaultPriority: Priority 宣言が無い (G-2 違反)").toMatch(
        /editingDefaultPriority\s*:\s*Priority\b/,
      );
    });

    it("routine-card.tsx に onEditingDefaultPriorityChange: (next: Priority) => void の宣言を含む", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(
        src,
        "onEditingDefaultPriorityChange: (next: Priority) => void 宣言が無い (G-2 違反)",
      ).toMatch(/onEditingDefaultPriorityChange\s*:\s*\(\s*next\s*:\s*Priority\s*\)\s*=>\s*void/);
    });

    const existingProps = [
      "routine",
      "isEditing",
      "editingName",
      "onEditingNameChange",
      "editingDaysOfWeek",
      "onEditingDaysOfWeekChange",
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
   * シナリオ AC-11: routine-card.tsx 編集モードの <PriorityStars /> 呼び出しに
   *   groupLabel / idPrefix が指定されている (REQ-1 / G-6).
   *   Given web/src/ui/routine-card/routine-card.tsx を開いた
   *   When  isEditing=true ブランチ内の <PriorityStars ... /> 呼び出しを観察する
   *   Then  value={editingDefaultPriority} を含む
   *    かつ onChange={onEditingDefaultPriorityChange} を含む
   *    かつ groupLabel="優先度" を含む
   *    かつ idPrefix="routine-edit" を含む (起票側 "routine-create" と区別)
   */
  describe("AC-11: routine-card.tsx 編集モードの <PriorityStars /> 呼び出しに groupLabel / idPrefix が指定 (G-6)", () => {
    it("routine-card.tsx に <PriorityStars ... value={editingDefaultPriority} ... /> の呼び出しを含む", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, "<PriorityStars が呼び出されていない (REQ-1 違反)").toMatch(/<PriorityStars\b/);
      expect(src, "<PriorityStars に value={editingDefaultPriority} が無い").toMatch(
        /value\s*=\s*\{\s*editingDefaultPriority\s*\}/,
      );
    });

    it("routine-card.tsx に onChange={onEditingDefaultPriorityChange} の bind を含む", () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, "onChange={onEditingDefaultPriorityChange} の bind が無い").toMatch(
        /onChange\s*=\s*\{\s*onEditingDefaultPriorityChange\s*\}/,
      );
    });

    it('routine-card.tsx 編集モードの <PriorityStars /> に groupLabel="優先度" を含む', () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, 'groupLabel="優先度" が無い').toMatch(/groupLabel\s*=\s*["']優先度["']/);
    });

    it('routine-card.tsx 編集モードの <PriorityStars /> に idPrefix="routine-edit" を含む (起票側と区別)', () => {
      const src = readFileSync(routineCardTsxPath, "utf-8");
      expect(src, 'idPrefix="routine-edit" が無い (NFR-IDPREFIX-DISJOINT 違反)').toMatch(
        /idPrefix\s*=\s*["']routine-edit["']/,
      );
    });
  });

  /**
   * シナリオ AC-12: routines-view.tsx が editingDefaultPriority state を持ち <RoutineCard> に
   *   渡す (REQ-3).
   *   Given web/src/ui/routines-view/routines-view.tsx を開いた
   *   When  ファイル本文を観察する
   *   Then  useState<Priority>("normal") の editingDefaultPriority 宣言を含む (D-004)
   *    かつ openEdit 内で setEditingDefaultPriority(routine.defaultPriority) を呼ぶ
   *    かつ cancelEdit 内で setEditingDefaultPriority("normal") を呼ぶ (D-005)
   *    かつ handleSaveEdit 内で updateMutation.mutateAsync の引数に
   *         defaultPriority: editingDefaultPriority を含む
   *    かつ <RoutineCard ... editingDefaultPriority={editingDefaultPriority}
   *         onEditingDefaultPriorityChange={setEditingDefaultPriority} ... /> の使用を含む
   */
  describe("AC-12: routines-view.tsx の editingDefaultPriority state と <RoutineCard> への伝播 (REQ-3)", () => {
    it("routines-view.tsx に editingDefaultPriority / setEditingDefaultPriority の useState 宣言を含む", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src).toContain("editingDefaultPriority");
      expect(src).toContain("setEditingDefaultPriority");
      // useState<Priority>("normal") もしくは等価.
      expect(src, "useState<Priority>('normal') 宣言が無い (D-004 違反)").toMatch(
        /useState<\s*Priority\s*>\(\s*["']normal["']\s*\)/,
      );
    });

    it("openEdit 関数の本体で setEditingDefaultPriority(routine.defaultPriority) を呼ぶ", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        "openEdit で setEditingDefaultPriority(routine.defaultPriority) を呼んでいない (REQ-3 違反)",
      ).toMatch(/setEditingDefaultPriority\s*\(\s*routine\.defaultPriority\s*\)/);
    });

    it("cancelEdit 関数の本体で setEditingDefaultPriority('normal') を呼ぶ (D-005)", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        "cancelEdit で setEditingDefaultPriority('normal') を呼んでいない (D-005 違反)",
      ).toMatch(/setEditingDefaultPriority\s*\(\s*["']normal["']\s*\)/);
    });

    it("updateMutation.mutateAsync に defaultPriority: editingDefaultPriority を渡す (REQ-3)", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        "updateMutation.mutateAsync の引数に defaultPriority: editingDefaultPriority が無い (REQ-3 違反)",
      ).toMatch(/defaultPriority\s*:\s*editingDefaultPriority/);
    });

    it("<RoutineCard> 呼び出しに editingDefaultPriority / onEditingDefaultPriorityChange が渡される", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "<RoutineCard> に editingDefaultPriority が渡されていない").toMatch(
        /editingDefaultPriority\s*=\s*\{\s*editingDefaultPriority\s*\}/,
      );
      expect(
        src,
        "<RoutineCard> に onEditingDefaultPriorityChange={setEditingDefaultPriority} が渡されていない",
      ).toMatch(/onEditingDefaultPriorityChange\s*=\s*\{\s*setEditingDefaultPriority\s*\}/);
    });
  });

  /**
   * シナリオ AC-13: updateMutation の mutationFn 引数型と body に defaultPriority が含まれる (REQ-4).
   *   Given routines-view.tsx を開いた
   *   When  updateMutation の mutationFn 引数型と body を観察する
   *   Then  { id; ifMatch; name; daysOfWeek; defaultPriority: Priority } の宣言を含む
   *    かつ body の JSON.stringify に defaultPriority が含まれる
   *    かつ repository.update(cmd) の呼び出しは無改修 (UpdateRoutineCommand に互換)
   */
  describe("AC-13: updateMutation の mutationFn 引数型と body に defaultPriority が含まれる (REQ-4)", () => {
    it("mutationFn の引数型に defaultPriority: Priority が含まれる", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(
        src,
        "updateMutation の mutationFn 引数型に defaultPriority: Priority の宣言が無い (REQ-4 違反)",
      ).toMatch(/defaultPriority\s*:\s*Priority\b/);
    });

    it("PATCH body の JSON.stringify に defaultPriority が含まれる (REQ-4 / R-008)", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      // JSON.stringify({ name: cmd.name, daysOfWeek: cmd.daysOfWeek, defaultPriority: cmd.defaultPriority })
      // のような body 内に defaultPriority が含まれること.
      expect(
        src,
        "body の JSON.stringify に defaultPriority が含まれない (REQ-4 / R-008 違反)",
      ).toMatch(/JSON\.stringify\([^)]*defaultPriority/);
    });

    it("repository.update(cmd) の呼び出しは維持されている (NFR-COMPAT)", () => {
      const src = readFileSync(routinesViewTsxPath, "utf-8");
      expect(src, "repository.update(cmd) の呼び出しが見つからない").toMatch(
        /repository\.update\s*\(\s*cmd\s*\)/,
      );
    });
  });

  /**
   * シナリオ AC-19: BL-068 spec の D-011 を本 BL で逆転した記録が残っている.
   *   Given docs/developer/features/routine-card-edit-fields/spec.md を開いた
   *   When  D-011 節を観察する
   *   Then  「BL-069 で逆転」または「routine-card-edit-priority で逆転」の言及が追記されている
   *    かつ 本 BL (routine-card-edit-priority) の spec.md へのリンクが存在する
   */
  describe("AC-19: BL-068 spec の D-011 を本 BL で逆転した記録が残っている (G-7 / REQ-5)", () => {
    it("routine-card-edit-fields/spec.md の D-011 節に「BL-069」または「routine-card-edit-priority」の言及がある", () => {
      const src = readFileSync(routineCardEditFieldsSpecPath, "utf-8");
      const idx = src.indexOf("D-011");
      expect(idx, "D-011 セクションが BL-068 spec に存在しない").toBeGreaterThanOrEqual(0);
      // 次の見出しまでの本文を切り出す.
      const section = src.slice(idx, idx + 2000);
      const hasReverseNote = /BL-069|routine-card-edit-priority/.test(section);
      expect(
        hasReverseNote,
        "D-011 節に「BL-069」または「routine-card-edit-priority」の逆転言及が無い (AC-19 違反)",
      ).toBe(true);
    });
  });

  // ============================================================
  // (d) 不変性 assert (AC-14 / AC-15 / AC-16)
  // ============================================================

  /**
   * シナリオ AC-14: routine-card.css に新規セレクタが追加されていない (REQ-6 / NFR-NO-NEW-CSS-RULES).
   *   Given web/src/ui/routine-card/routine-card.css を本 BL の前後で diff を取る
   *   When  差分を観察する
   *   Then  新規セレクタの追加が 0 件である
   *    かつ 既存セレクタの宣言修正が 0 件である
   *
   * 厳密な diff は CI / git diff で検出. 本テストでは「既存セレクタが引き続き存在し,
   * 本 BL に固有の新規セレクタ (= .routine-card__priority-row 等) が依然 0 件」を
   * 不変性 grep で代替する.
   */
  describe("AC-14: routine-card.css に新規セレクタが追加されていない (REQ-6)", () => {
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
      ".visually-hidden",
    ];

    for (const selector of maintainedSelectors) {
      it(`${selector} セレクタが routine-card.css に定義されている (不変性)`, () => {
        const css = readFileSync(routineCardCssPath, "utf-8");
        const body = extractRuleBody(css, selector);
        expect(body, `${selector} ルールが見つからない (REQ-6 違反)`).not.toBeNull();
      });
    }

    it(".routine-card__priority-row セレクタは routine-card.css に存在しない (BL-068 で撤去 / 本 BL でも復活させない)", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__priority-row");
      expect(body, ".routine-card__priority-row が復活している (BL-068 撤去違反)").toBeNull();
    });

    it(".routine-card__select セレクタは routine-card.css に存在しない (BL-068 で撤去 / 本 BL でも復活させない)", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      const body = extractRuleBody(css, ".routine-card__select");
      expect(body, ".routine-card__select が復活している (BL-068 撤去違反)").toBeNull();
    });

    it("routine-card.css 全体に box-shadow / transition / animation / :hover が存在しない (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION)", () => {
      const css = readFileSync(routineCardCssPath, "utf-8");
      expect(css, "routine-card.css に box-shadow が含まれている").not.toMatch(/box-shadow\s*:/);
      expect(css, "routine-card.css に transition が含まれている").not.toMatch(
        /(?:^|;|\n|\s)transition\s*:/,
      );
      expect(css, "routine-card.css に animation が含まれている").not.toMatch(
        /(?:^|;|\n|\s)animation\s*:/,
      );
      expect(css, "routine-card.css に :hover セレクタが含まれている").not.toMatch(/:hover\b/);
    });
  });

  /**
   * シナリオ AC-15: tokens.css を変更していない (NFR-NO-NEW-TOKENS).
   *   Given web/src/styles/tokens.css を本 BL の前後で diff を取る
   *   When  差分を観察する
   *   Then  差分が無い (= 本 BL で参照する既存トークンが引き続き定義されている)
   */
  describe("AC-15: tokens.css を変更していない (NFR-NO-NEW-TOKENS)", () => {
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
      it(`tokens.css に ${token} が定義されている (不変性)`, () => {
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
   * シナリオ AC-16: WebRoutineRepository / Repository API / RoutineConflictError は無改修
   *   (NFR-COMPAT).
   *   Given web/src/repositories/routine-repository.ts を本 BL の前後で diff を取る
   *   When  差分を観察する
   *   Then  WebRoutineRepository / UpdateRoutineCommand / RoutineConflictError の export 型に
   *         差分が無い
   *    かつ <PriorityStars /> 本体 (priority-stars.tsx / priority-stars.css) に差分が無い
   */
  describe("AC-16: WebRoutineRepository / PriorityStars 本体が無改修 (NFR-COMPAT / NFR-PRIORITY-STARS-COMPAT)", () => {
    it("routine-repository.ts に主要 export (WebRoutineRepository / UpdateRoutineCommand / RoutineConflictError 等) が残っている", () => {
      const src = readFileSync(routineRepositoryTsPath, "utf-8");
      expect(src).toMatch(/export\s+interface\s+WebRoutineRepository/);
      expect(src).toMatch(/export\s+interface\s+WebRoutine\b/);
      expect(src).toMatch(/export\s+class\s+RoutineConflictError/);
      expect(src).toMatch(/export\s+interface\s+CreateRoutineCommand/);
      expect(src).toMatch(/export\s+interface\s+UpdateRoutineCommand/);
      expect(src).toMatch(/export\s+interface\s+DeleteRoutineCommand/);
    });

    it("UpdateRoutineCommand.defaultPriority? が optional で型に互換性がある (BL-017 完了済み)", () => {
      const src = readFileSync(routineRepositoryTsPath, "utf-8");
      expect(src, "UpdateRoutineCommand.defaultPriority? が見つからない (NFR-COMPAT 違反)").toMatch(
        /UpdateRoutineCommand[\s\S]{0,500}defaultPriority\?\s*:\s*string/,
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

    it("起票側 <RoutineFormCard> の <PriorityStars idPrefix='routine-create'> は維持されている (REQ-8 / NFR-IDPREFIX-DISJOINT)", () => {
      const src = readFileSync(routineFormCardTsxPath, "utf-8");
      expect(src, "起票側の idPrefix='routine-create' が消えている (REQ-8 違反)").toMatch(
        /idPrefix\s*=\s*["']routine-create["']/,
      );
    });
  });

  // ============================================================
  // 前提: 本 BL の対象ファイルが存在する (回帰検出)
  // ============================================================

  describe("前提: 本 BL の対象ファイルが存在する", () => {
    it("web/src/ui/routine-card/routine-card.tsx が存在する", () => {
      expect(existsSync(routineCardTsxPath)).toBe(true);
    });

    it("web/src/ui/routines-view/routines-view.tsx が存在する", () => {
      expect(existsSync(routinesViewTsxPath)).toBe(true);
    });

    it("web/src/ui/routine-card/routine-card.css が存在する", () => {
      expect(existsSync(routineCardCssPath)).toBe(true);
    });

    it("web/src/ui/priority-stars/priority-stars.tsx が存在する", () => {
      expect(existsSync(priorityStarsTsxPath)).toBe(true);
    });
  });
});
