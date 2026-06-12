/**
 * `<RoutineCard>` (BL-061 / routine-card-component).
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-component/spec.md REQ-1.
 *   docs/developer/features/routine-card-component/plan.md §「<RoutineCard> API」.
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
import type { WebRoutine } from "../../repositories/routine-repository.js";
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
