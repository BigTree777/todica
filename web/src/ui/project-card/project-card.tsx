/**
 * `<ProjectCard>` (BL-060 / project-card-component).
 *
 * 仕様参照:
 *   docs/developer/features/project-card-component/spec.md REQ-1.
 *   docs/developer/features/project-card-component/plan.md §「<ProjectCard> API」.
 *
 * 役割:
 *   - projects-view の各プロジェクト行 (表示モード / 編集モード) を描画する単一の
 *     presentational コンポーネント.
 *   - props 駆動で「表示モード (= name + 変更 / 削除)」と「編集モード (= inline form)」を切替.
 *
 * 重要な決定:
 *   - D-002: `as` prop で root tag を `<li>` / `<div>` から選択.
 *   - D-003: isEditing で表示 / 編集を 1 コンポーネント内で切替.
 *   - D-005: 編集 form の aria-label は「プロジェクト名称変更フォーム」を維持.
 *   - D-006: 表示モードの button に `project-card__actions__edit` / `__delete` を付与.
 *   - G-8 / REQ-6: 「名称変更」 button のラベル文字列は「変更」に短縮.
 */
import type { Project } from "../../repositories/project-repository.js";
import "./project-card.css";

export interface ProjectCardProps {
  /** 表示対象プロジェクト. */
  project: Project;
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

export function ProjectCard(props: ProjectCardProps): JSX.Element {
  const {
    project,
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
  const className = `project-card${isEditing ? " project-card--editing" : ""}`;
  const editInputId = `project-edit-${project.id}`;

  if (isEditing) {
    return (
      <Tag className={className}>
        <form
          onSubmit={onSaveEdit}
          aria-label="プロジェクト名称変更フォーム"
          className="project-card__form-inline"
        >
          <label htmlFor={editInputId} className="visually-hidden">
            プロジェクト名
          </label>
          <input
            id={editInputId}
            type="text"
            className="project-card__input"
            value={editingName}
            placeholder="プロジェクト名"
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

  return (
    <Tag className={className}>
      <span className="project-card__name">{project.name}</span>
      <div className="project-card__actions">
        <button type="button" className="project-card__actions__edit" onClick={onStartEdit}>
          変更
        </button>
        <button type="button" className="project-card__actions__delete" onClick={onDelete}>
          削除
        </button>
      </div>
    </Tag>
  );
}
