/**
 * `<ProjectFormCard>` .
 *
 * 仕様参照:
 *   docs/developer/features/project-card-component/spec.md REQ-2.
 *   docs/developer/features/project-card-component/plan.md §「<ProjectFormCard> API」.
 *
 * 役割:
 *   - projects-view の作成フォームを置換する単一の起票カード.
 *   - root 要素は `<form className="project-card project-card--form">`.
 *   - 1 段 flex 横並び layout: `[visually-hidden label] [<input>] [追加 submit]`.
 *   - label は visually-hidden で a11y 維持しつつ視覚的には隠す (D-008).
 *   - input には placeholder「プロジェクト名」を `--color-fg-subtle` で薄く描画 (V-2).
 *
 * 重要な決定:
 *   - D-004: input id default = "project-name" (既存テスト互換).
 *   - NFR-FORM-ARIA-LABEL-PRESERVE: aria-label default = "プロジェクト作成フォーム".
 */
import type { JSX } from "react";
import "./project-card.css";

export interface ProjectFormCardProps {
  /** 現在の入力値. */
  name: string;
  /** 入力 change ハンドラ. */
  onNameChange: (next: string) => void;
  /** form の submit ハンドラ. */
  onSubmit: (e: React.FormEvent) => void;
  /** input id (D-004 / default: "project-name"). */
  inputId?: string;
  /** form の aria-label (default: "プロジェクト作成フォーム"). */
  formAriaLabel?: string;
}

export function ProjectFormCard(props: ProjectFormCardProps): JSX.Element {
  const {
    name,
    onNameChange,
    onSubmit,
    inputId = "project-name",
    formAriaLabel = "プロジェクト作成フォーム",
  } = props;

  return (
    <form
      onSubmit={onSubmit}
      aria-label={formAriaLabel}
      className="project-card project-card--form"
    >
      <label htmlFor={inputId} className="visually-hidden">
        プロジェクト名
      </label>
      <input
        id={inputId}
        type="text"
        className="project-card__input"
        value={name}
        placeholder="プロジェクト名"
        onChange={(e) => onNameChange(e.target.value)}
        required
      />
      <button type="submit" className="button button--primary project-card__submit">
        追加
      </button>
    </form>
  );
}
