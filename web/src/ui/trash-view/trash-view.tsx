/**
 * ゴミ箱ビュー (BL-014 / web-client-foundation).
 *
 * 仕様参照:
 *   - docs/developer/features/web-client-foundation/spec.md §「TrashView」
 *   - docs/developer/features/web-client-foundation/plan.md §D-004 §D-005
 *
 * 機能:
 *   - マウント時に repository.list() でゴミ箱のタスク一覧を取得して表示.
 *   - タスクが 0 件のとき「ゴミ箱は空です」を表示.
 *   - 各タスク行に「復元」ボタン → repository.restore() → 一覧再取得.
 *   - 「ゴミ箱を空にする」ボタン → repository.empty() → 一覧再取得.
 */
import { useCallback, useEffect, useState } from "react";
import type { TrashRepository, TrashedTask } from "../../repositories/trash-repository.js";

export interface TrashViewProps {
  repository: TrashRepository;
}

export function TrashView(props: TrashViewProps): JSX.Element {
  const { repository } = props;
  const [tasks, setTasks] = useState<TrashedTask[]>([]);

  const fetchList = useCallback(async (): Promise<void> => {
    const result = await repository.list();
    setTasks(result);
  }, [repository]);

  // マウント時にゴミ箱一覧を取得する (cancel フラグ付き cleanup).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await repository.list();
      if (!cancelled) {
        setTasks(result);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const handleRestore = useCallback(
    async (task: TrashedTask) => {
      await repository.restore({ id: task.id, ifMatch: task.version });
      await fetchList();
    },
    [repository, fetchList],
  );

  const handleEmpty = useCallback(async () => {
    await repository.empty();
    await fetchList();
  }, [repository, fetchList]);

  return (
    <main>
      <h1>ゴミ箱</h1>

      <button type="button" onClick={handleEmpty}>
        ゴミ箱を空にする
      </button>

      {tasks.length === 0 ? (
        <p>ゴミ箱は空です</p>
      ) : (
        <ul aria-label="ゴミ箱のタスク一覧">
          {tasks.map((task) => (
            <li key={task.id}>
              <span>{task.name}</span>
              <button type="button" onClick={() => handleRestore(task)}>
                復元
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
