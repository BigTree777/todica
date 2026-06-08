/**
 * ルーティン管理ビュー (BL-017 / routine).
 *
 * 仕様参照:
 *   - docs/developer/features/routine/spec.md §「Web クライアント - RoutinesView」
 *   - docs/developer/features/routine/plan.md §D-008
 *
 * 機能:
 *   - マウント時に repository.list() でルーティン一覧を取得して表示.
 *   - 作成フォーム: 名称 + daysOfWeek（チェックボックス）+ defaultPriority（セレクト）+ 追加ボタン.
 *   - 各行: ルーティン名 + daysOfWeek の表示 + 編集ボタン（インライン編集）+ 削除ボタン.
 *   - 名称変更: 行の「名称変更」ボタンで編集モード, 保存で repository.update() → 一覧再取得.
 *   - 削除: 削除ボタンで repository.delete() → 一覧再取得.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  WebRoutine,
  WebRoutineRepository,
} from "../../repositories/routine-repository.js";

/** UUID v4 風の文字列を生成する. crypto.randomUUID が無い jsdom 環境向けのフォールバック. */
function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const random = (n: number) => Math.floor(Math.random() * n);
  const hex = (n: number) =>
    Array.from({ length: n }, () => random(16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface RoutinesViewProps {
  repository: WebRoutineRepository;
}

export function RoutinesView(props: RoutinesViewProps): JSX.Element {
  const { repository } = props;
  const [routines, setRoutines] = useState<WebRoutine[]>([]);
  const [newName, setNewName] = useState("");
  const [newDaysOfWeek, setNewDaysOfWeek] = useState<number[]>([1]); // デフォルト: 月曜
  const [newDefaultPriority, setNewDefaultPriority] = useState<string>("normal");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const fetchList = useCallback(async (): Promise<void> => {
    const result = await repository.list();
    setRoutines(result);
  }, [repository]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await repository.list();
      if (!cancelled) {
        setRoutines(result);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName) return;
      if (newDaysOfWeek.length === 0) return;
      const id = generateId();
      await repository.create({
        id,
        name: newName,
        daysOfWeek: newDaysOfWeek,
        defaultPriority: newDefaultPriority,
      });
      setNewName("");
      setNewDaysOfWeek([1]);
      setNewDefaultPriority("normal");
      await fetchList();
    },
    [newName, newDaysOfWeek, newDefaultPriority, repository, fetchList],
  );

  const toggleDay = useCallback((day: number) => {
    setNewDaysOfWeek((prev) => {
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  }, []);

  const openEdit = useCallback((routine: WebRoutine) => {
    setEditingId(routine.id);
    setEditingName(routine.name);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName("");
  }, []);

  const handleSaveEdit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingId) return;
      const routine = routines.find((r) => r.id === editingId);
      if (!routine) return;
      await repository.update({ id: editingId, ifMatch: routine.version, name: editingName });
      cancelEdit();
      await fetchList();
    },
    [editingId, editingName, routines, repository, cancelEdit, fetchList],
  );

  const handleDelete = useCallback(
    async (routine: WebRoutine) => {
      await repository.delete({ id: routine.id, ifMatch: routine.version });
      await fetchList();
    },
    [repository, fetchList],
  );

  return (
    <main>
      <h1>ルーティン</h1>

      <form onSubmit={handleCreate} aria-label="ルーティン作成フォーム">
        <div>
          <label htmlFor="routine-name">名前</label>
          <input
            id="routine-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
        </div>
        <div>
          {DAY_LABELS.map((label, day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={newDaysOfWeek.includes(day)}
                onChange={() => toggleDay(day)}
              />
              {label}
            </label>
          ))}
        </div>
        <div>
          <label htmlFor="routine-priority">優先度</label>
          <select
            id="routine-priority"
            value={newDefaultPriority}
            onChange={(e) => setNewDefaultPriority(e.target.value)}
          >
            <option value="highest">最優先</option>
            <option value="normal">普通</option>
            <option value="later">後回し</option>
          </select>
        </div>
        <button type="submit">追加</button>
      </form>

      <ul>
        {routines.map((routine) => (
          <li key={routine.id}>
            {editingId === routine.id ? (
              <form onSubmit={handleSaveEdit} aria-label="ルーティン名称変更フォーム">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  required
                />
                <button type="submit">保存</button>
                <button type="button" onClick={cancelEdit}>
                  キャンセル
                </button>
              </form>
            ) : (
              <>
                <span>{routine.name}</span>
                <span>
                  {routine.daysOfWeek.map((d) => DAY_LABELS[d]).join("・")}
                </span>
                <button type="button" onClick={() => openEdit(routine)}>
                  名称変更
                </button>
                <button type="button" onClick={() => handleDelete(routine)}>
                  削除
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
