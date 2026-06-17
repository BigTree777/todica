/**
 * プロジェクト追加モーダル .
 *
 * 仕様参照:
 *   docs/developer/features/inline-project-create/spec.md REQ-2〜REQ-8.
 *   docs/developer/features/inline-project-create/plan.md §「コンポーネント設計」.
 *
 * 設計サマリ:
 *   - ネイティブ `<dialog>` + `showModal()` (plan D-001). フォーカストラップ /
 *     Escape クローズ / 背面 inert / 閉鎖時のフォーカス復帰はブラウザネイティブに委ねる.
 *   - `open` prop と `<dialog>` の実 DOM 状態は useEffect + ref で同期する.
 *   - Escape は `cancel` イベント → `onClose()` で React state に同期する.
 *     backdrop クリックでは閉じない (クリックハンドラを置かない. plan D-007).
 *   - 名称入力はローカル state. 閉鎖時 (成功 / キャンセル / Escape) に破棄し,
 *     作成失敗時は保持する (spec REQ-5 / REQ-7).
 *   - 作成 mutation は ProjectsView の createMutation と同型 (safeEnqueue /
 *     offline 分岐 / safeDequeueByKey / notifyError. NFR-CONSISTENCY).
 *     create は If-Match を持たず 412 が発生しないため ConflictError ハンドリングは
 *     置かない (plan D-006).
 *   - 成功時: ["projects"] invalidate + 入力クリア + onClose(). オンライン成功時
 *     (result が Project) のみ onCreated(result) で親へ自動選択を伝える (plan D-003).
 */

import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, ProjectRepository } from "../../repositories/project-repository.js";
import { generateId } from "../../usecases/mutation-helpers.js";
import { useProjectMutations } from "../../usecases/project-usecases.js";
import "./project-create-dialog.css";

export interface ProjectCreateDialogProps {
  repository: ProjectRepository;
  open: boolean;
  /** キャンセル / Escape / 作成成功 のいずれでも呼ばれる (親が open=false にする). */
  onClose: () => void;
  /** オンライン成功時のみ, 作成された Project を渡す (自動選択用. spec REQ-4). */
  onCreated: (project: Project) => void;
}

export function ProjectCreateDialog(props: ProjectCreateDialogProps): JSX.Element {
  const { repository, open, onClose, onCreated } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");

  // open prop と <dialog> の実 DOM 状態を同期する (spec REQ-2).
  // 閉鎖時 (成功 / キャンセル / Escape) は入力 state を破棄する (spec REQ-5).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        dialog.showModal();
        // 開いた直後のフォーカスを名称入力に固定する (spec REQ-2).
        inputRef.current?.focus();
      }
    } else {
      if (dialog.open) dialog.close();
      setName("");
    }
  }, [open]);

  // BL-118: create mutation はアプリケーション層 (project-usecases) へ集約.
  //   - 標準 invalidate ["projects"] に加え, 成功時の入力クリア / 自動選択 / close を
  //     afterSuccess で行う (spec REQ-4 / REQ-7 / REQ-8). create は If-Match を持たず
  //     412 が発生しないため onConflict は注入しない.
  const { create: createMutation } = useProjectMutations(repository, {
    afterSuccess: (_queryClient, result) => {
      setName("");
      // オンライン成功時 (Project が返ったとき) のみ自動選択を親へ伝える (spec REQ-4 / REQ-8).
      if (result) onCreated(result as Project);
      onClose();
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // 空名称は required でブラウザが抑止するが, 二重ガードを置く (spec REQ-6).
      if (!name) return;
      createMutation.mutate({ id: generateId(), name });
    },
    [name, createMutation],
  );

  return (
    <dialog
      ref={dialogRef}
      className="project-create-dialog"
      aria-labelledby="project-create-title"
      onCancel={onClose}
    >
      <h2 id="project-create-title">プロジェクトの追加</h2>
      <form aria-label="プロジェクト追加フォーム" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="inline-project-name">プロジェクト名</label>
          <input
            id="inline-project-name"
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />
        </div>
        <div className="project-create-dialog__actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={createMutation.isPending}
          >
            追加
          </button>
          <button type="button" className="button button--ghost" onClick={onClose}>
            キャンセル
          </button>
        </div>
      </form>
    </dialog>
  );
}
