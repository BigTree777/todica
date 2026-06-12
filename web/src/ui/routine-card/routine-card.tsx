/**
 * `<RoutineCard>` (BL-061 / routine-card-component).
 *
 * BL-068 (routine-card-edit-fields) 更新:
 *   - 編集モード DOM に曜日選択 UI (7 個の checkbox) を追加 (REQ-2 / G-3 / G-4).
 *   - props に `editingDaysOfWeek: number[]` / `onEditingDaysOfWeekChange: (next: number[]) => void` を追加.
 *   - DOM 順は `label → input → div.routine-card__day-checkboxes → 保存 → キャンセル` (D-005).
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-component/spec.md REQ-1.
 *   docs/developer/features/routine-card-component/plan.md §「<RoutineCard> API」.
 *   docs/developer/features/routine-card-edit-fields/spec.md REQ-2 / REQ-5 / D-005 / D-006.
 *
 * 役割:
 *   - routines-view の各ルーティン行 (表示モード / 編集モード) を描画する単一の
 *     presentational コンポーネント.
 *   - props 駆動で「表示モード (= name + 曜日表示 + 変更 / 削除)」と
 *     「編集モード (= inline form)」を切替.
 *
 * 重要な決定:
 *   - D-002: `as` prop で root tag を `<li>` / `<div>` から選択.
 *   - D-003: isEditing で表示 / 編集を 1 コンポーネント内で切替.
 *   - D-005: 編集 form の aria-label は「ルーティン名称変更フォーム」を維持.
 *   - D-006: 表示モードの button に `routine-card__actions__edit` / `__delete` を付与.
 *   - D-009: 左ブロックは名前 + 曜日の縦並び (`.routine-card__main`).
 *   - G-8 / REQ-6: 「名称変更」 button のラベル文字列は「変更」に短縮.
 */
import type { Priority } from "@todica/domain/task";
import type { WebRoutine } from "../../repositories/routine-repository.js";
import { PriorityStars } from "../priority-stars/priority-stars.js";
import "./routine-card.css";

/** 曜日 0 (日) 〜 6 (土) の表示ラベル. */
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface RoutineCardProps {
  /** 表示対象ルーティン. */
  routine: WebRoutine;
  /** 編集モードか. true なら inline 編集 form を描画する. */
  isEditing: boolean;
  /** isEditing=true のときの input value (親が state を持つ). */
  editingName: string;
  /** 編集モードの input change ハンドラ. */
  onEditingNameChange: (next: string) => void;
  /** 編集モードの daysOfWeek (親が state を持つ) (BL-068 G-4). */
  editingDaysOfWeek: number[];
  /** 編集モードの曜日 toggle ハンドラ (次の配列を受け取る / BL-068 D-006). */
  onEditingDaysOfWeekChange: (next: number[]) => void;
  /** 編集モードの defaultPriority (親が state を持つ) (BL-069 G-2). */
  editingDefaultPriority: Priority;
  /** 編集モードの優先度変更ハンドラ (BL-069 G-2 / D-006). */
  onEditingDefaultPriorityChange: (next: Priority) => void;
  /** 「変更」 button のクリックハンドラ. */
  onStartEdit: () => void;
  /** 「キャンセル」 button のクリックハンドラ. */
  onCancelEdit: () => void;
  /** 編集 form の submit ハンドラ. */
  onSaveEdit: (e: React.FormEvent) => void;
  /** 「削除」 button のクリックハンドラ. */
  onDelete: () => void;
  /** ラッパ要素のタグ (D-002). default: "li". */
  as?: "li" | "div";
}

export function RoutineCard(props: RoutineCardProps): JSX.Element {
  const {
    routine,
    isEditing,
    editingName,
    onEditingNameChange,
    editingDaysOfWeek,
    onEditingDaysOfWeekChange,
    editingDefaultPriority,
    onEditingDefaultPriorityChange,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
    as = "li",
  } = props;

  // D-012: as prop に応じて root tag を切替. li / div は HTMLAttributes 互換.
  const Tag = as as "li";
  const className = `routine-card${isEditing ? " routine-card--editing" : ""}`;
  const editInputId = `routine-edit-${routine.id}`;

  if (isEditing) {
    return (
      <Tag className={className}>
        <form
          onSubmit={onSaveEdit}
          aria-label="ルーティン名称変更フォーム"
          className="routine-card__form-inline"
        >
          <label htmlFor={editInputId} className="visually-hidden">
            ルーティン名
          </label>
          <input
            id={editInputId}
            type="text"
            className="routine-card__input"
            value={editingName}
            placeholder="ルーティン名"
            onChange={(e) => onEditingNameChange(e.target.value)}
            required
          />
          <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
            {DAY_LABELS.map((label, day) => (
              <label key={day}>
                <input
                  type="checkbox"
                  checked={editingDaysOfWeek.includes(day)}
                  onChange={() => {
                    const next = editingDaysOfWeek.includes(day)
                      ? editingDaysOfWeek.filter((d) => d !== day)
                      : [...editingDaysOfWeek, day].sort((a, b) => a - b);
                    onEditingDaysOfWeekChange(next);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <PriorityStars
            value={editingDefaultPriority}
            onChange={onEditingDefaultPriorityChange}
            groupLabel="優先度"
            idPrefix="routine-edit"
          />
          <button type="submit">保存</button>
          <button type="button" onClick={onCancelEdit}>
            キャンセル
          </button>
        </form>
      </Tag>
    );
  }

  const daysLabel = routine.daysOfWeek.map((d) => DAY_LABELS[d]).join("・");

  return (
    <Tag className={className}>
      <div className="routine-card__main">
        <span className="routine-card__name">{routine.name}</span>
        <span className="routine-card__days-label">{daysLabel}</span>
      </div>
      <div className="routine-card__actions">
        <button type="button" className="routine-card__actions__edit" onClick={onStartEdit}>
          変更
        </button>
        <button type="button" className="routine-card__actions__delete" onClick={onDelete}>
          削除
        </button>
      </div>
    </Tag>
  );
}
