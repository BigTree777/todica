/**
 * `<ProjectCard>` (BL-060 / project-card-component / BL-070 で編集モード概念撤去).
 *
 * 仕様参照:
 *   docs/developer/features/project-card-component/spec.md REQ-1.
 *   docs/developer/features/inline-edit-all-cards/spec.md REQ-2 / G-2.
 *
 * 役割:
 *   - projects-view の各プロジェクト行を描画する単一の presentational コンポーネント.
 *   - 表示モードのみ. 編集モード概念 (旧 `is`+`Editing` prop / 旧 `editing`+`Name` 系 prop) は
 *     BL-070 で撤去 (=「変更」「保存」「キャンセル」 button をすべて廃止).
 *   - 名前は常時表示の `<input>` で編集可能とし, blur で `onNameBlur(next)` を親に通知する.
 *
 * 重要な決定:
 *   - D-002 / D-012 : `as` prop で root tag を `<li>` / `<div>` から選択.
 *   - D-001: 同値 blur の抑制は親 view に置く (= 本コンポーネントは常に blur 値を流す).
 *   - D-002 / P-001 (iii): 空文字 blur の元値復元は blur ハンドラ内で
 *     `e.currentTarget.value = project.name` を同期的に書き戻して実現 (uncontrolled input).
 *     key (entity.id + entity.name) はサーバ正本値変化時の再マウント同期用.
 *   - D-009: input id は `project-name-{project.id}` で起票側 `project-name` と衝突回避.
 *     visually-hidden label を付与し getByLabelText("プロジェクト名") で a11y を維持.
 */
import type { Project } from "../../repositories/project-repository.js";
import "./project-card.css";

export interface ProjectCardProps {
  /** 表示対象プロジェクト. */
  project: Project;
  /** name input の blur ハンドラ. BL-070 REQ-2 で追加 (必須). */
  onNameBlur: (next: string) => void;
  /** 「削除」 button のクリックハンドラ. */
  onDelete: () => void;
  /** ラッパ要素のタグ (D-002). default: "li". */
  as?: "li" | "div";
}

export function ProjectCard(props: ProjectCardProps): JSX.Element {
  const { project, onNameBlur, onDelete, as = "li" } = props;

  // D-012: as prop に応じて root tag を切替. li / div は HTMLAttributes 互換.
  const Tag = as as "li";
  const inputId = `project-name-${project.id}`;

  return (
    <Tag className="project-card">
      <label htmlFor={inputId} className="visually-hidden">
        プロジェクト名
      </label>
      {/* REQ-2: 表示時に常時 input を描画. P-001 (iii): uncontrolled + key で
          サーバ正本値が変わったとき再マウントして表示を更新する.
          空文字 blur (D-002) は親が PATCH を短絡し state も key も変わらないため,
          カード側で DOM 値を正本値 (project.name) に書き戻して表示を復元する. */}
      <input
        key={`project-name-${project.id}-${project.name}`}
        id={inputId}
        type="text"
        className="project-card__input"
        defaultValue={project.name}
        placeholder="プロジェクト名"
        onBlur={(e) => {
          const next = e.currentTarget.value;
          if (next === "") {
            e.currentTarget.value = project.name;
          }
          onNameBlur(next); // D-001: カードは常に blur 値を流す (空文字も含む)
        }}
      />
      <div className="project-card__actions">
        <button
          type="button"
          className="button button--danger project-card__actions__delete"
          onClick={onDelete}
        >
          削除
        </button>
      </div>
    </Tag>
  );
}
