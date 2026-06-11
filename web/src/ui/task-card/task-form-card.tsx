/**
 * `<TaskFormCard>` (BL-059 / task-card-component).
 *
 * 仕様参照:
 *   docs/developer/features/task-card-component/spec.md REQ-2.
 *   docs/developer/features/task-card-component/plan.md §「<TaskFormCard> API」.
 *   docs/developer/features/project-toggle-removal/spec.md REQ-1 〜 REQ-5
 *     (BL-065: 起票カードのプロジェクト選択トグルを撤去し <select> に戻す).
 *
 * 役割:
 *   - today-view / tomorrow-view の起票フォームを置換する単一の起票カード.
 *   - `<TaskCard>` と同じ 3 段ゾーン構造 (header / title / actions) を共有する.
 *   - root 要素は `<form className="task-card task-card--form">`.
 *   - header 段: プロジェクト <select> (左) + PriorityStars (右) (BL-065 D-003 / V-3 同形).
 *   - title 段: タスク名 label + input. font-size は `--font-size-h2` (V-7).
 *   - actions 段: 「追加」 submit button のみ (V-2 で中央配置).
 *
 * 重要な決定:
 *   - V-6: 「↑タップで選択」span と「優先度」label span は含めない.
 *   - REQ-9 / NFR-LABEL-PRESERVE: タスク名 label/input の関連付けは `inputId` prop で保持.
 *   - P-010: PriorityStars の groupLabel は「優先度」を渡す.
 *   - BL-065 D-001 / D-002 / D-003: プロジェクト入力は visually-hidden な
 *     `<label htmlFor={`${idPrefix}-project`}>プロジェクト</label>` + `<select>` で表現.
 *     先頭 option は `value=""` (= 未分類) / textContent「プロジェクトなし」.
 */
import type { Priority } from "@todica/domain/task";
import type { Project } from "../../repositories/project-repository.js";
import { PriorityStars } from "../priority-stars/priority-stars.js";
import "./task-card.css";

export interface TaskFormCardProps {
  /** プロジェクト一覧. */
  projects: Project[];
  /** 現在選択中のプロジェクト id ("" = 未分類). */
  projectId: string;
  /** プロジェクト切替ハンドラ. `<select>` の value (string, "" を含む) を伝播する. */
  onProjectIdChange: (next: string) => void;
  /** 現在の優先度. */
  priority: Priority;
  /** 優先度切替ハンドラ. */
  onPriorityChange: (next: Priority) => void;
  /** 現在のタスク名 input 値. */
  name: string;
  /** タスク名入力ハンドラ. */
  onNameChange: (next: string) => void;
  /** form の submit ハンドラ. */
  onSubmit: (e: React.FormEvent) => void;
  /** PriorityStars / プロジェクト <select> に渡す id 衝突回避 prefix. */
  idPrefix: "create" | "tomorrow-create";
  /** タスク名 input の id (既存テスト互換のため固定値で受ける). */
  inputId: "task-name" | "tomorrow-task-name";
  /** form の aria-label. */
  formAriaLabel: "タスク起票フォーム" | "明日のタスク起票フォーム";
}

export function TaskFormCard(props: TaskFormCardProps): JSX.Element {
  const {
    projects,
    projectId,
    onProjectIdChange,
    priority,
    onPriorityChange,
    name,
    onNameChange,
    onSubmit,
    idPrefix,
    inputId,
    formAriaLabel,
  } = props;

  return (
    <form onSubmit={onSubmit} aria-label={formAriaLabel} className="task-card task-card--form">
      <div className="task-card__header">
        <label htmlFor={`${idPrefix}-project`} className="visually-hidden">
          プロジェクト
        </label>
        <select
          id={`${idPrefix}-project`}
          value={projectId}
          onChange={(e) => onProjectIdChange(e.target.value)}
        >
          <option value="">プロジェクトなし</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <PriorityStars
          value={priority}
          onChange={onPriorityChange}
          groupLabel="優先度"
          idPrefix={idPrefix}
        />
      </div>
      <div className="task-card__title">
        <label htmlFor={inputId} className="visually-hidden">
          タスク名
        </label>
        <input
          id={inputId}
          type="text"
          placeholder="タスク名"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          required
        />
      </div>
      <div className="task-card__actions">
        <button type="submit">追加</button>
      </div>
    </form>
  );
}
