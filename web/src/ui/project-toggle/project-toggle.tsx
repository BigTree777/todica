/**
 * `<ProjectToggle />` (BL-041 / project-toggle-ui).
 *
 * 仕様参照:
 *   docs/developer/features/project-toggle-ui/spec.md
 *     REQ-1 (起票フォームのプロジェクト入力 = トグルボタン 1 個),
 *     REQ-2 (巡回順序: null → projects[0] → ... → projects[last] → null),
 *     REQ-3 (表示文言: 未分類 / project.name),
 *     REQ-4 (アクセシビリティ: <button> / aria-label に現在値 / Tab + Enter/Space で巡回),
 *     REQ-5 (WCAG 2.1 AA contrast),
 *     AC-1 / AC-2 / AC-6 / AC-7.
 *   docs/developer/features/project-toggle-ui/plan.md
 *     D-001 (共通コンポーネント化 / props は value / onChange / projects / idPrefix / groupLabel),
 *     D-002 (単一 <button> で巡回 UI),
 *     D-003 (null も巡回ポジションの 1 つ),
 *     D-004 ("" ↔ null 境界変換は親側で行う. 当 component は null を受ける),
 *     D-005 (削除済 id は次クリックで null に矯正),
 *     D-007 (CSS はコンポーネントローカル, BL-046 でトークン化合流予定),
 *     D-008 (順方向巡回のみ. 逆巡回は別 BL).
 *
 * 設計サマリ:
 *   - 単一の `<button type="button">` で実装する (`<select>` 不使用).
 *   - 巡回順: null → projects[0] → projects[1] → ... → projects[last] → null.
 *   - クリック / Enter / Space で 1 つ進む.
 *   - `aria-label` に「プロジェクト: 現在 ＜name＞ (タップで次へ)」を埋め込み, screen reader で現在値を読み上げる.
 *   - 隠し `<span aria-live="polite">` で値変化を polite に通知する (REQ-4 / リスク R-2 緩和).
 *   - `projects` が空のときはクリックしても onChange を呼ばない (no-op / AC-6).
 *   - `value` が `projects` 上に存在しない id (= 削除済) のとき, 次クリックで `null` に矯正 (D-005).
 *   - キーボード操作は <button> 標準挙動 (Tab + Enter / Space) で自然に満たす (D-008).
 */
import { useId } from "react";
import type { Project } from "../../repositories/project-repository.js";
import "./project-toggle.css";

export interface ProjectToggleProps {
  /** 現在値 (null = 未分類). */
  value: string | null;
  /** トグル巡回時のコールバック. 次の値 (null | string) を渡す. */
  onChange: (next: string | null) => void;
  /** プロジェクト一覧. ProjectRepository.list() の結果をそのまま渡す. */
  projects: Project[];
  /**
   * 同一画面に複数インスタンスが並ぶときの id 衝突回避.
   * 例: `create` / `tomorrow-create`. 省略時は React の useId を使う.
   */
  idPrefix?: string;
  /**
   * 用途別ラベル (アクセシビリティのコンテキスト).
   * 省略時は "プロジェクト".
   */
  groupLabel?: string;
}

/** 表示用「未分類」リテラル. spec REQ-3 / AC-1 で要求される文字. */
const UNCATEGORIZED_LABEL = "（未分類）";

/**
 * 次の値を計算する (D-005 / REQ-2).
 *   - projects が空 → null のまま (no-op 側で吸収する).
 *   - current === null → projects[0].
 *   - current が projects 上にない (= 削除済) → null に矯正.
 *   - current が末尾 → null.
 *   - それ以外 → 次の project.
 */
function nextValue(
  current: string | null,
  projects: Project[],
): string | null {
  if (projects.length === 0) return null;
  if (current === null) {
    return projects[0]?.id ?? null;
  }
  const idx = projects.findIndex((p) => p.id === current);
  if (idx === -1) return null; // D-005: 削除済 id は null に矯正.
  if (idx === projects.length - 1) return null; // 末尾 → 未分類に戻る.
  return projects[idx + 1]?.id ?? null;
}

/** 表示名を解決する (REQ-3). value=null または 削除済 id → 「（未分類）」. */
function getCurrentName(value: string | null, projects: Project[]): string {
  if (value === null) return UNCATEGORIZED_LABEL;
  const project = projects.find((p) => p.id === value);
  return project ? project.name : UNCATEGORIZED_LABEL;
}

export function ProjectToggle(props: ProjectToggleProps): JSX.Element {
  const { value, onChange, projects, idPrefix, groupLabel = "プロジェクト" } =
    props;
  const generatedId = useId();
  const prefix = idPrefix ?? generatedId;

  const currentName = getCurrentName(value, projects);

  // REQ-4: aria-label に「プロジェクト: 現在 ＜name＞ (タップで次へ)」を埋め込む.
  const ariaLabel = `${groupLabel}: 現在 ${currentName} (タップで次へ)`;

  const handleClick = (): void => {
    // AC-6: projects が空のとき, クリックしても onChange を呼ばない (no-op).
    if (projects.length === 0) return;
    const next = nextValue(value, projects);
    if (next === value) return; // 余計な onChange を抑止.
    onChange(next);
  };

  const liveId = `${prefix}-project-toggle-live`;

  return (
    <div data-project-toggle className="project-toggle">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={liveId}
        data-current-id={value ?? ""}
        className="project-toggle__button"
        onClick={handleClick}
      >
        <span data-project-toggle-name className="project-toggle__name">
          {currentName}
        </span>
      </button>
      {/*
        REQ-4 / リスク R-2: 隠し領域に aria-live="polite" を持ち, 値変化時に
        screen reader へ「現在の選択: ＜name＞」を通知する. 隠しは
        visually-hidden パターン (CSS 側) で実装し, focus / tab 動線に乗らないようにする.
      */}
      <span
        id={liveId}
        aria-live="polite"
        data-visually-hidden
        className="project-toggle__live"
      >
        {`現在の選択: ${currentName}`}
      </span>
    </div>
  );
}
