import type { Priority } from "@todica/domain/task";
import type { JSX } from "react";
/**
 * `<PriorityStars />` .
 *
 * 仕様参照:
 *   docs/developer/features/priority-star-ui/spec.md
 *     REQ-1 / REQ-2 / REQ-3 / REQ-4 / REQ-5,
 *     AC-1 / AC-2 / AC-3 / AC-4 / AC-5 / AC-6 / AC-7 / AC-10.
 *   docs/developer/features/priority-star-ui/plan.md
 *     D-001 (共通コンポーネント化 / props は value / onChange / groupLabel / idPrefix),
 *     D-002 (radiogroup + 単一 aria-checked / data-lit で視覚 lit を表現),
 *     D-003 (同値クリックは onChange を呼ばない),
 *     D-005 (CSS はコンポーネントローカルに置く),
 *     D-006 (キーボード矢印 / 数字キーは初版に含めない).
 *
 * 設計サマリ:
 *   - 3 つの `<button type="button" role="radio">` を `<div role="radiogroup">` でラップする.
 *   - 「星 1 = later / 星 2 = normal / 星 3 = highest」のマッピング.
 *   - 現在値より大きい星をクリックすると highest 側へ, 小さい星をクリックすると later 側へ
 *     onChange が呼ばれる. 現在値と同じ星のクリックは no-op (D-003).
 *   - 視覚的な点灯 (lit) は data-lit="true|false" で CSS 制御 (plan D-002).
 *     aria-checked は「現在値に対応する 1 つだけ true」とし, ARIA radiogroup の意味論を保つ.
 *   - radiogroup の aria-label に「優先度: ○○ (最優先 / 普通 / 後回し)」を埋め込み
 *     screen reader で現在値を読み上げ可能にする (REQ-4).
 *   - キーボード操作は `<button>` の標準挙動 (Tab + Enter / Space) のみで満たす (D-006).
 */
import { useId } from "react";
import "./priority-stars.css";

/** 星の点灯数とドメイン値の対応 (plan §マッピング). */
const VALUE_TO_COUNT: Record<Priority, 1 | 2 | 3> = {
  later: 1,
  normal: 2,
  highest: 3,
};

/** 星の点灯数からドメイン値に戻すマップ. */
const COUNT_TO_VALUE: Record<1 | 2 | 3, Priority> = {
  1: "later",
  2: "normal",
  3: "highest",
};

/** 現在値の日本語表記 (radiogroup の aria-label に埋め込む). */
const VALUE_LABEL: Record<Priority, string> = {
  highest: "最優先",
  normal: "普通",
  later: "後回し",
};

export interface PriorityStarsProps {
  /** 現在値. UI 上は星の点灯数に変換する (later=1 / normal=2 / highest=3). */
  value: Priority;
  /** 星クリック時のコールバック. 同値クリックは呼び出さない (D-003). */
  onChange: (next: Priority) => void;
  /**
   * 同一画面に複数インスタンスが並ぶときの id 衝突回避用. 例: `task-${id}`.
   * 省略時は React の `useId` で生成する.
   */
  idPrefix?: string;
  /**
   * 用途別ラベル (アクセシビリティのコンテキスト).
   * "起票フォームの優先度" / "タスクカードの優先度" 等を渡す. 省略時は "優先度".
   */
  groupLabel?: string;
}

export function PriorityStars(props: PriorityStarsProps): JSX.Element {
  const { value, onChange, idPrefix, groupLabel = "優先度" } = props;
  const generatedId = useId();
  const prefix = idPrefix ?? generatedId;

  const litCount = VALUE_TO_COUNT[value];
  // REQ-4 / D-002: radiogroup の aria-label に「優先度: ○○」を入れて
  // 現在値を screen reader に伝える.
  const groupAriaLabel = `${groupLabel}: ${VALUE_LABEL[value]}`;

  const handleClick = (starIndex: 1 | 2 | 3): void => {
    const next = COUNT_TO_VALUE[starIndex];
    // D-003: 同値クリックは no-op.
    if (next === value) return;
    onChange(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={groupAriaLabel}
      data-priority-stars
      className="priority-stars"
    >
      {([1, 2, 3] as const).map((starIndex) => {
        // 視覚 lit: 「現在値の点灯数 以下の星」を点灯させる (= 評価式 rating の見た目).
        const lit = starIndex <= litCount;
        // aria-checked: 「現在値に対応する 1 つだけ true」 (D-002 ARIA 意味論).
        const checked = starIndex === litCount;
        const starValue = COUNT_TO_VALUE[starIndex];
        return (
          <button
            key={starIndex}
            type="button"
            role="radio"
            id={`${prefix}-star-${starIndex}`}
            aria-checked={checked}
            aria-label={`星 ${starIndex} つ目 (${VALUE_LABEL[starValue]})`}
            data-lit={lit ? "true" : "false"}
            className="priority-stars__star"
            onClick={() => handleClick(starIndex)}
          >
            {lit ? "★" : "☆"}
          </button>
        );
      })}
    </div>
  );
}
