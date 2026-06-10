import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
/**
 * 単体テスト: `<PriorityStars />` (BL-040 / priority-star-ui).
 *
 * 仕様参照:
 *   docs/developer/features/priority-star-ui/spec.md
 *     REQ-1 (起票フォームの優先度入力 = 星 3 つ),
 *     REQ-2 (星の点灯数とドメイン値のマッピング),
 *     REQ-4 (アクセシビリティ),
 *     AC-6  (同値クリック時は no-op).
 *   docs/developer/features/priority-star-ui/plan.md
 *     D-001 (共通コンポーネント化, props は value / onChange / groupLabel / idPrefix),
 *     D-002 (radiogroup + 単一 aria-checked),
 *     D-003 (同値クリックは onChange を呼ばない).
 *   docs/developer/features/priority-star-ui/tasks.md T-001.
 *
 * 本ファイルは TDD の "red" を作るためのテスト.
 *   - `<PriorityStars />` 本体はまだ存在しない. import がまず失敗する (red).
 *   - implementer (T-005) が `web/src/ui/priority-stars/priority-stars.tsx` を作って green 化する.
 *
 * 設計メモ:
 *   - 「点灯」の判定は plan D-002 に従い CSS 用の `data-lit` 属性で観察する.
 *     aria-checked は「現在値に対応する 1 つだけ true」になるため,
 *     「点灯数」を直接観察する手段としては不適 (= 3 つ目を選んでいる時, 1 / 2 つ目は aria-checked=false).
 *   - クリック判定は role="radio" の 3 要素を順に取得して click する.
 *   - キーボード操作は今回テスト対象外 (REQ-4 最低要件は <button> + Tab + Enter/Space で自然に満たす).
 */
import { describe, expect, it, vi } from "vitest";

import type { Priority } from "@todica/domain/task";
// PriorityStars 本体はまだ存在しない. implementer が web/src/ui/priority-stars/priority-stars.tsx を
// 作るまでこの import で red になる.
import { PriorityStars } from "./priority-stars.js";

/** plan D-002: data-lit="true" の星を「点灯」として観察する. */
function litCount(): number {
  return document.querySelectorAll('[data-lit="true"]').length;
}

describe("<PriorityStars /> (BL-040 単体)", () => {
  it('シナリオ: value="normal" のとき 3 つの星 (role=radio) が並び, 2 つが点灯状態である (REQ-1 / REQ-2)', () => {
    // AC-1 / REQ-2: 星 2 つ点灯 = normal.
    render(<PriorityStars value="normal" onChange={() => {}} groupLabel="優先度" />);

    // role="radio" の星が 3 つ並ぶ (plan D-002 採用案).
    const stars = screen.getAllByRole("radio");
    expect(stars).toHaveLength(3);

    // 2 つ目までが「点灯」(= data-lit="true").
    expect(litCount()).toBe(2);
  });

  it('シナリオ: value="highest" のとき星 3 つが点灯する (REQ-2)', () => {
    render(<PriorityStars value="highest" onChange={() => {}} groupLabel="優先度" />);

    expect(litCount()).toBe(3);
  });

  it('シナリオ: value="later" のとき星 1 つが点灯する (REQ-2)', () => {
    render(<PriorityStars value="later" onChange={() => {}} groupLabel="優先度" />);

    expect(litCount()).toBe(1);
  });

  it('シナリオ: 1 番目の星をクリックすると onChange("later") が呼ばれる (REQ-2)', async () => {
    const onChange = vi.fn<(next: Priority) => void>();
    const user = userEvent.setup();

    render(<PriorityStars value="normal" onChange={onChange} groupLabel="優先度" />);

    const stars = screen.getAllByRole("radio");
    await user.click(stars[0]!);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("later");
  });

  it('シナリオ: 2 番目の星をクリックすると onChange("normal") が呼ばれる (REQ-2)', async () => {
    const onChange = vi.fn<(next: Priority) => void>();
    const user = userEvent.setup();

    render(<PriorityStars value="later" onChange={onChange} groupLabel="優先度" />);

    const stars = screen.getAllByRole("radio");
    await user.click(stars[1]!);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("normal");
  });

  it('シナリオ: 3 番目の星をクリックすると onChange("highest") が呼ばれる (REQ-2)', async () => {
    const onChange = vi.fn<(next: Priority) => void>();
    const user = userEvent.setup();

    render(<PriorityStars value="normal" onChange={onChange} groupLabel="優先度" />);

    const stars = screen.getAllByRole("radio");
    await user.click(stars[2]!);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("highest");
  });

  it("シナリオ: 現在値と同じ星をクリックしても onChange は呼ばれない (AC-6 / D-003 no-op)", async () => {
    // spec.md AC-6: タスクカード上で現在値と同じ星をクリックしても PATCH は送られない.
    // plan.md D-003: <PriorityStars> 内部で同値クリックを判定し onChange を呼ばない.
    const onChange = vi.fn<(next: Priority) => void>();
    const user = userEvent.setup();

    render(<PriorityStars value="normal" onChange={onChange} groupLabel="優先度" />);

    // value="normal" のとき 2 番目の星 (= normal) をクリック.
    const stars = screen.getAllByRole("radio");
    await user.click(stars[1]!);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('シナリオ: ボタン群が role="radiogroup" を持ち aria-label に現在値が表現されている (REQ-4)', () => {
    // REQ-4: 「現在の優先度: 普通」相当が screen reader で読める仕組みを持つ.
    // plan D-002: radiogroup + aria-label で現在の優先度を伝える.
    render(<PriorityStars value="normal" onChange={() => {}} groupLabel="優先度" />);

    // role="radiogroup" の要素が 1 つ存在し, aria-label に「普通」を含む.
    const group = screen.getByRole("radiogroup");
    expect(group).toBeInTheDocument();
    const ariaLabel = group.getAttribute("aria-label") ?? "";
    expect(ariaLabel).toMatch(/優先度/);
    expect(ariaLabel).toMatch(/普通/);
  });

  it('シナリオ: value="highest" のとき radiogroup の aria-label に「最優先」が含まれる (REQ-4)', () => {
    render(<PriorityStars value="highest" onChange={() => {}} groupLabel="優先度" />);

    const group = screen.getByRole("radiogroup");
    const ariaLabel = group.getAttribute("aria-label") ?? "";
    expect(ariaLabel).toMatch(/最優先/);
  });

  it('シナリオ: value="later" のとき radiogroup の aria-label に「後回し」が含まれる (REQ-4)', () => {
    render(<PriorityStars value="later" onChange={() => {}} groupLabel="優先度" />);

    const group = screen.getByRole("radiogroup");
    const ariaLabel = group.getAttribute("aria-label") ?? "";
    expect(ariaLabel).toMatch(/後回し/);
  });
});
