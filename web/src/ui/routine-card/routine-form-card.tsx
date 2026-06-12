/**
 * `<RoutineFormCard>` (BL-061 / routine-card-component).
 *
 * BL-068 (routine-card-edit-fields) 更新:
 *   - 優先度 UI を `<select>` から `<PriorityStars />` (BL-040) に置換 (REQ-1 / D-003).
 *   - `defaultPriority` prop 型を `string` → `Priority` に変更 (G-2).
 *   - `priorityId?` prop を撤去 (D-002).
 *   - `.routine-card__priority-row` ラッパおよび「優先度」label を完全撤去.
 *     a11y は `<PriorityStars groupLabel="優先度">` の radiogroup aria-label で担保 (REQ-6 / D-003).
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-component/spec.md REQ-2.
 *   docs/developer/features/routine-card-component/plan.md §「<RoutineFormCard> API」.
 *   docs/developer/features/routine-card-edit-fields/spec.md REQ-1 / REQ-6 / D-002 / D-003.
 *
 * 役割:
 *   - routines-view の作成フォームを置換する単一の起票カード.
 *   - root 要素は `<form className="routine-card routine-card--form">`.
 *   - 2 段構成 (V-1):
 *     - 1 段目: visually-hidden label + name input + 「追加」 submit button.
 *     - 2 段目: 曜日チェックボックス群 (7 個) + 優先度 PriorityStars.
 *   - input には placeholder「ルーティン名」を `--color-fg-subtle` で薄く描画 (V-2).
 */
import type { Priority } from "@todica/domain/task";
import { PriorityStars } from "../priority-stars/priority-stars.js";
import "./routine-card.css";

/** 曜日 0 (日) 〜 6 (土) の表示ラベル. */
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface RoutineFormCardProps {
  /** 現在の名前入力値. */
  name: string;
  /** 名前入力 change ハンドラ. */
  onNameChange: (next: string) => void;
  /** 選択中の曜日配列 (0 = 日 〜 6 = 土). */
  daysOfWeek: number[];
  /** 曜日 checkbox の toggle ハンドラ. */
  onToggleDay: (day: number) => void;
  /** 現在の優先度 (BL-068 G-2). */
  defaultPriority: Priority;
  /** 優先度変更ハンドラ (BL-068 G-2). */
  onDefaultPriorityChange: (next: Priority) => void;
  /** form の submit ハンドラ. */
  onSubmit: (e: React.FormEvent) => void;
  /** name input id (D-004 / default: "routine-name"). */
  inputId?: string;
  /** form の aria-label (default: "ルーティン作成フォーム"). */
  formAriaLabel?: string;
}

export function RoutineFormCard(props: RoutineFormCardProps): JSX.Element {
  const {
    name,
    onNameChange,
    daysOfWeek,
    onToggleDay,
    defaultPriority,
    onDefaultPriorityChange,
    onSubmit,
    inputId = "routine-name",
    formAriaLabel = "ルーティン作成フォーム",
  } = props;

  return (
    <form
      onSubmit={onSubmit}
      aria-label={formAriaLabel}
      className="routine-card routine-card--form"
    >
      <div className="routine-card__form-row routine-card__form-row--name">
        <label htmlFor={inputId} className="visually-hidden">
          ルーティン名
        </label>
        <input
          id={inputId}
          type="text"
          className="routine-card__input"
          value={name}
          placeholder="ルーティン名"
          onChange={(e) => onNameChange(e.target.value)}
          required
        />
        <button type="submit" className="routine-card__submit">
          追加
        </button>
      </div>
      <div className="routine-card__form-row routine-card__form-row--options">
        <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
          {DAY_LABELS.map((label, day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={daysOfWeek.includes(day)}
                onChange={() => onToggleDay(day)}
              />
              {label}
            </label>
          ))}
        </div>
        <PriorityStars
          value={defaultPriority}
          onChange={onDefaultPriorityChange}
          groupLabel="優先度"
          idPrefix="routine-create"
        />
      </div>
    </form>
  );
}
