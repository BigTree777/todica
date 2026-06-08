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
 *
 * BL-018: TanStack Query (useQuery / useMutation) でデータ取得・書込みを管理.
 */
import { useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  WebRoutine,
  WebRoutineRepository,
} from "../../repositories/routine-repository.js";
import { enqueue, dequeue, getAll, ConflictError } from "../../offline-queue.js";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";

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

/** repository の baseUrl/authToken を安全に取り出す型 */
interface HasBaseUrlAndToken {
  baseUrl?: string;
  authToken?: string;
}

export function RoutinesView(props: RoutinesViewProps): JSX.Element {
  const { repository } = props;
  const queryClient = useQueryClient();
  const conflictDialog = useConflictDialog();
  const repo = repository as unknown as HasBaseUrlAndToken;
  const baseUrl = repo.baseUrl ?? "";
  const authToken = repo.authToken ?? "";

  const { data: routinesData } = useQuery({
    queryKey: ["routines"],
    queryFn: () => repository.list(),
    networkMode: "offlineFirst",
  });
  const routines: WebRoutine[] = routinesData ?? [];

  const [newName, setNewName] = useState("");
  const [newDaysOfWeek, setNewDaysOfWeek] = useState<number[]>([1]); // デフォルト: 月曜
  const [newDefaultPriority, setNewDefaultPriority] = useState<string>("normal");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const invalidateRoutines = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["routines"] });
  }, [queryClient]);

  /** enqueue を安全に呼び出す。IDB が利用できない環境ではエラーを無視する。 */
  const safeEnqueue = async (entry: Parameters<typeof enqueue>[0]) => {
    try {
      await enqueue(entry);
    } catch {
      // IDB が利用できない環境ではキューへの保存をスキップ
    }
  };

  /** dequeue を安全に呼び出す。IDB が利用できない環境ではエラーを無視する。 */
  const safeDequeueByKey = async (idempotencyKey: string) => {
    try {
      const all = await getAll();
      const match = all.find((e) => e.idempotencyKey === idempotencyKey);
      if (match?.id !== undefined) await dequeue(match.id);
    } catch {
      // IDB が利用できない環境ではスキップ
    }
  };

  const createMutation = useMutation({
    mutationFn: async (cmd: {
      id: string;
      name: string;
      daysOfWeek: number[];
      defaultPriority: string;
    }) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/routines`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ ...cmd }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await repository.create(cmd);
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateRoutines,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
      }
    },
    networkMode: "offlineFirst",
  });

  const updateMutation = useMutation({
    mutationFn: async (cmd: { id: string; ifMatch: number; name: string }) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/routines/${cmd.id}`,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: JSON.stringify({ name: cmd.name }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await repository.update(cmd);
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateRoutines,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
      }
    },
    networkMode: "offlineFirst",
  });

  const deleteMutation = useMutation({
    mutationFn: async (cmd: { id: string; ifMatch: number }) => {
      const idempotencyKey = generateId();
      void safeEnqueue({
        url: `${baseUrl}/api/v1/routines/${cmd.id}`,
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(cmd.ifMatch),
        },
        body: null,
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await repository.delete(cmd);
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateRoutines,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
      }
    },
    networkMode: "offlineFirst",
  });

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName) return;
      if (newDaysOfWeek.length === 0) return;
      const id = generateId();
      await createMutation.mutateAsync({
        id,
        name: newName,
        daysOfWeek: newDaysOfWeek,
        defaultPriority: newDefaultPriority,
      });
      setNewName("");
      setNewDaysOfWeek([1]);
      setNewDefaultPriority("normal");
    },
    [newName, newDaysOfWeek, newDefaultPriority, createMutation],
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
      await updateMutation.mutateAsync({
        id: editingId,
        ifMatch: routine.version,
        name: editingName,
      });
      cancelEdit();
    },
    [editingId, editingName, routines, updateMutation, cancelEdit],
  );

  const handleDelete = useCallback(
    async (routine: WebRoutine) => {
      await deleteMutation.mutateAsync({ id: routine.id, ifMatch: routine.version });
    },
    [deleteMutation],
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

      <ConflictDialog
        open={conflictDialog.dialogState.open}
        localValue={conflictDialog.dialogState.localValue}
        serverValue={conflictDialog.dialogState.serverValue}
        onAcceptServer={conflictDialog.onAcceptServer}
        onRetryWithServer={conflictDialog.onRetryWithServer}
      />
    </main>
  );
}
