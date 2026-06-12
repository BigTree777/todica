/**
 * `<RoutineFormCard>` (BL-061 / routine-card-component).
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-component/spec.md REQ-2.
 *   docs/developer/features/routine-card-component/plan.md §「<RoutineFormCard> API」.
 *
 * 役割:
 *   - routines-view の作成フォームを置換する単一の起票カード.
 *   - root 要素は `<form className="routine-card routine-card--form">`.
 *   - 2 段構成 (V-1):
 *     - 1 段目: visually-hidden label + name input + 「追加」 submit button.
 *     - 2 段目: 曜日チェックボックス群 (7 個) + 優先度 select.
 *   - input には placeholder「ルーティン名」を `--color-fg-subtle` で薄く描画 (V-2).
 *
 * 重要な決定:
 *   - D-004: input id default = "routine-name", select id default = "routine-priority".
 *   - D-008: name label テキストは「ルーティン名」(NFR-NAME-LABEL-CHANGE).
 *   - D-008-2: 優先度 label は visually-hidden にせず可視のまま残す.
 *   - NFR-FORM-ARIA-LABEL-PRESERVE: aria-label default = "ルーティン作成フォーム".
 */
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
  /** 現在の優先度. */
  defaultPriority: string;
  /** 優先度 select の change ハンドラ. */
  onDefaultPriorityChange: (next: string) => void;
  /** form の submit ハンドラ. */
  onSubmit: (e: React.FormEvent) => void;
  /** name input id (D-004 / default: "routine-name"). */
  inputId?: string;
  /** 優先度 select id (D-004 / default: "routine-priority"). */
  priorityId?: string;
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
    priorityId = "routine-priority",
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
        <div className="routine-card__priority-row">
          <label htmlFor={priorityId}>優先度</label>
          <select
            id={priorityId}
            className="routine-card__select"
            value={defaultPriority}
            onChange={(e) => onDefaultPriorityChange(e.target.value)}
          >
            <option value="highest">最優先</option>
            <option value="normal">普通</option>
            <option value="later">後回し</option>
          </select>
        </div>
      </div>
    </form>
  );
}
