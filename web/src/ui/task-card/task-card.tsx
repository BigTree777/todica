/**
 * `<TaskCard>` .
 *
 * 仕様参照:
 *   docs/developer/features/task-card-component/spec.md REQ-1.
 *   docs/developer/features/task-card-component/plan.md §「<TaskCard> API」.
 *
 * 役割:
 *   - today-view (focusedTask + otherTasks), tomorrow-view, focus-view の
 *     計 4 用途で再利用される単一のタスクカード presentational コンポーネント.
 *   - 3 段ゾーン (header / title / actions) を持ち, props 駆動で
 *     variant / actionSet / showPriority / showSetFocus / dueDateMode を切替.
 *
 * 重要な決定:
 *   - D-002: variant prop で強調を制御 (`default` / `focus`).
 *   - D-003: actionSet / showPriority / showSetFocus で 4 ビューの差分を吸収.
 *   - D-004: `as` prop で root tag (`li` / `section` / `div`) を切替.
 *   - D-010: `task.origin === "routine"` のとき期限切替 button を出さない.
 *   - P-010: PriorityStars の groupLabel に「${task.name} の優先度」を渡す.
 */

import type { Priority, Task } from "@todica/domain/task";
import { Check, Pin, SkipBack, SkipForward, Trash2 } from "lucide-react";
import type { JSX } from "react";
import type { Project } from "../../repositories/project-repository.js";
import { PriorityStars } from "../priority-stars/priority-stars.js";
import "./task-card.css";

export interface TaskCardProps {
  /** 表示対象タスク. */
  task: Task;
  /**
   * 紐づくプロジェクト. BL-108 で表示側 chip は撤去されたため
   * 直接の表示用途は無いが, API 互換と将来の強調表示拡張のために維持する (D-006).
   */
  project: Project | null;
  /**
   * BL-108 (task-card-project-change) REQ-9 / D-004:
   * `<select>` の option 列挙用. 先頭に「プロジェクトなし」を加えた上で
   * このリストの順序通りに `<option>` を並べる. 親が並び順 / フィルタを管理する.
   */
  projects: Project[];
  /**
   * BL-108 REQ-5 / D-003: `<select>` の選択値変更ハンドラ.
   * 「プロジェクトなし」 (value="") を選んだ場合は `null` に変換して呼ぶ.
   */
  onChangeProject: (next: string | null) => void;
  /** 強調 variant 切替 (D-002). default の default 値は "default". */
  variant?: "default" | "focus";
  /** PriorityStars を出すか (default: true). tomorrow-view では false (D-003). */
  showPriority?: boolean;
  /** 「現在のタスクにする」button を出すか (default: false). today otherTasks のみ true (D-003). */
  showSetFocus?: boolean;
  /** actions の構成 (D-003). full: 4 ボタン / minimal: 削除 / 完了 のみ. */
  actionSet?: "full" | "minimal";
  /** 期限切替 button のラベル切替 (D-003). actionSet="full" のとき必須. */
  dueDateMode?: "today" | "tomorrow";
  /** 優先度変更ハンドラ (showPriority=true のとき必要). */
  onSetPriority?: (next: Priority) => void;
  /** 「現在のタスクにする」 button のハンドラ (showSetFocus=true のとき必要). */
  onSetFocus?: () => void;
  /** 「削除」 button のハンドラ. */
  onDelete: () => void;
  /** 期限切替 button のハンドラ (actionSet="full" のとき必要). */
  onToggleDueDate?: () => void;
  /** 「完了」 button のハンドラ. */
  onComplete: () => void;
  /** BL-070 (inline-edit-all-cards) REQ-1: タスク名 input の blur ハンドラ. 必須. */
  onNameBlur: (next: string) => void;
  /** ラッパ要素のタグ (D-004). default: "li". */
  as?: "li" | "section" | "div";
  /** section variant 用の aria-label. */
  "aria-label"?: string;
}

export function TaskCard(props: TaskCardProps): JSX.Element {
  const {
    task,
    project: _project,
    projects,
    onChangeProject,
    variant = "default",
    showPriority = true,
    showSetFocus = false,
    actionSet = "full",
    dueDateMode,
    onSetPriority,
    onSetFocus,
    onDelete,
    onToggleDueDate,
    onComplete,
    onNameBlur,
    as = "li",
    "aria-label": ariaLabel,
  } = props;
  // _project: BL-108 (D-006) で表示用途を持たないが API 互換のため受け取り続ける. void で未使用警告を回避.
  void _project;

  const className = `task-card${variant === "focus" ? " task-card--focus" : ""}`;
  // D-010: routine 由来タスクは期限切替不可 (BL-017 / BL-042 仕様維持).
  const showDueDateBtn = actionSet === "full" && task.origin !== "routine";

  // P-002: as prop に応じて root tag を切替.
  const Tag = as as "li";

  // BL-108 REQ-10 / D-009: id は task id を含めて衝突回避.
  const projectSelectId = `task-project-${task.id}`;

  return (
    <Tag className={className} aria-label={ariaLabel}>
      <div className="task-card__header">
        {/* BL-108 REQ-1 / REQ-10: 旧 `<span class="project-chip">` を
            visually-hidden な `<label>` + `<select>` 構造に置換.
            REQ-2 / D-002: 先頭 option は「プロジェクトなし」 (value="").
            REQ-5 / D-003: 空文字を null に変換して親に渡す. */}
        <label htmlFor={projectSelectId} className="visually-hidden">
          プロジェクト
        </label>
        <select
          id={projectSelectId}
          value={task.projectId ?? ""}
          onChange={(e) => {
            const v = e.currentTarget.value;
            onChangeProject(v === "" ? null : v);
          }}
        >
          <option value="">プロジェクトなし</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {showPriority && onSetPriority && (
          <div className="task-card__header__priority">
            <PriorityStars
              value={task.priority}
              onChange={onSetPriority}
              groupLabel={`${task.name} の優先度`}
              idPrefix={`task-${task.id}`}
            />
          </div>
        )}
      </div>
      <div className="task-card__title">
        {/* REQ-1: <span>{task.name}</span> を input に置換し name の常時編集を可能にする.
            P-001 (iii): uncontrolled (defaultValue + key) で親 state は持たない.
            key に task.name を含めることで, サーバ正本値が変わったとき input を再マウントして表示を更新する.
            空文字 blur (D-002) は親が PATCH を短絡し state も key も変わらないため,
            カード側で DOM 値を正本値 (task.name) に書き戻して表示を復元する. */}
        <input
          key={`task-name-${task.id}-${task.name}`}
          type="text"
          defaultValue={task.name}
          onBlur={(e) => {
            const next = e.currentTarget.value;
            if (next === "") {
              e.currentTarget.value = task.name;
            }
            onNameBlur(next); // D-001: カードは常に blur 値を流す (空文字も含む)
          }}
          aria-label={`${task.name} の名前`}
        />
      </div>
      <div className="task-card__actions">
        <button
          type="button"
          className="button button--danger card-action-button task-card__actions__delete"
          aria-label="削除"
          onClick={onDelete}
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
        {showSetFocus && onSetFocus && (
          <button
            type="button"
            className="button button--primary card-action-button"
            aria-label="現在のタスクにする"
            onClick={onSetFocus}
          >
            <Pin size={18} aria-hidden="true" />
          </button>
        )}
        {showDueDateBtn && onToggleDueDate && (
          <button
            type="button"
            className="button button--primary card-action-button"
            aria-label={dueDateMode === "today" ? "明日にする" : "今日にする"}
            onClick={onToggleDueDate}
          >
            {dueDateMode === "today" ? (
              <SkipForward size={18} aria-hidden="true" />
            ) : (
              <SkipBack size={18} aria-hidden="true" />
            )}
          </button>
        )}
        <button
          type="button"
          className="button button--primary card-action-button task-card__actions__complete"
          aria-label="完了"
          onClick={onComplete}
        >
          <Check size={18} aria-hidden="true" />
        </button>
      </div>
    </Tag>
  );
}
