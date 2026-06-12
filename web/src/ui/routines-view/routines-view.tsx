import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import "./routines-view.css";
import type { Priority } from "@todica/domain/task";
import { notifyError } from "../../error-notification.js";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import { ConflictError, dequeue, enqueue, getAll, mapConflict } from "../../offline-queue.js";
import type { WebRoutine, WebRoutineRepository } from "../../repositories/routine-repository.js";
import { RoutineConflictError } from "../../repositories/routine-repository.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import { RoutineCard } from "../routine-card/routine-card.js";
import { RoutineFormCard } from "../routine-card/routine-form-card.js";

/** UUID v4 風の文字列を生成する. crypto.randomUUID が無い jsdom 環境向けのフォールバック. */
function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const random = (n: number) => Math.floor(Math.random() * n);
  const hex = (n: number) => Array.from({ length: n }, () => random(16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

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
  const [newDefaultPriority, setNewDefaultPriority] = useState<Priority>("normal");

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
        return;
      }
      notifyError("通信に失敗しました");
    },
    networkMode: "offlineFirst",
  });

  const updateMutation = useMutation({
    mutationFn: async (cmd: {
      id: string;
      ifMatch: number;
      name: string;
      daysOfWeek: number[];
      defaultPriority: Priority;
    }) => {
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
        body: JSON.stringify({
          name: cmd.name,
          daysOfWeek: cmd.daysOfWeek,
          defaultPriority: cmd.defaultPriority,
        }),
        idempotencyKey,
      });
      if (!navigator.onLine) return undefined;
      const result = await mapConflict(
        idempotencyKey,
        () => repository.update(cmd),
        (err) => (err instanceof RoutineConflictError ? err.currentRoutine : undefined),
      );
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateRoutines,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
        return;
      }
      notifyError("通信に失敗しました");
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
      const result = await mapConflict(
        idempotencyKey,
        () => repository.delete(cmd),
        (err) => (err instanceof RoutineConflictError ? err.currentRoutine : undefined),
      );
      void safeDequeueByKey(idempotencyKey);
      return result;
    },
    onSuccess: invalidateRoutines,
    onError: (error) => {
      if (error instanceof ConflictError) {
        conflictDialog.openDialog(error.entry, error.serverValue);
        return;
      }
      notifyError("通信に失敗しました");
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

  // BL-070 REQ-9 / D-001 / D-002: name 編集は input blur 経由.
  //   - 空文字 / 同値で短絡, それ以外で updateMutation.
  // 失敗時の通知は onError で処理済み. mutateAsync の reject を try/catch で吸収して
  // unhandled rejection を防ぐ.
  const handleNameBlur = useCallback(
    async (routine: WebRoutine, next: string) => {
      if (next === "" || next === routine.name) return;
      try {
        await updateMutation.mutateAsync({
          id: routine.id,
          ifMatch: routine.version,
          name: next,
          daysOfWeek: routine.daysOfWeek,
          defaultPriority: routine.defaultPriority,
        });
      } catch {
        // onError で処理済み.
      }
    },
    [updateMutation],
  );

  // BL-070 REQ-4: 曜日 click で即時 PATCH. daysOfWeek が 0 件になる場合は silent return
  //   (BL-068 D-016 / spec の「曜日 0 件運用は維持」).
  const handleDaysOfWeekChange = useCallback(
    async (routine: WebRoutine, next: number[]) => {
      if (next.length === 0) return;
      try {
        await updateMutation.mutateAsync({
          id: routine.id,
          ifMatch: routine.version,
          name: routine.name,
          daysOfWeek: next,
          defaultPriority: routine.defaultPriority,
        });
      } catch {
        // onError で処理済み.
      }
    },
    [updateMutation],
  );

  // BL-070 REQ-4: PriorityStars click で即時 PATCH.
  const handleDefaultPriorityChange = useCallback(
    async (routine: WebRoutine, next: Priority) => {
      if (next === routine.defaultPriority) return;
      try {
        await updateMutation.mutateAsync({
          id: routine.id,
          ifMatch: routine.version,
          name: routine.name,
          daysOfWeek: routine.daysOfWeek,
          defaultPriority: next,
        });
      } catch {
        // onError で処理済み.
      }
    },
    [updateMutation],
  );

  const handleDelete = useCallback(
    async (routine: WebRoutine) => {
      await deleteMutation.mutateAsync({ id: routine.id, ifMatch: routine.version });
    },
    [deleteMutation],
  );

  return (
    <main className="routines-view">
      <h1>ルーティン</h1>

      <RoutineFormCard
        name={newName}
        onNameChange={setNewName}
        daysOfWeek={newDaysOfWeek}
        onToggleDay={toggleDay}
        defaultPriority={newDefaultPriority}
        onDefaultPriorityChange={setNewDefaultPriority}
        onSubmit={handleCreate}
      />

      <ul className="routines-view__list">
        {routines.map((routine) => (
          <RoutineCard
            key={routine.id}
            routine={routine}
            onNameBlur={(next) => handleNameBlur(routine, next)}
            onDaysOfWeekChange={(next) => handleDaysOfWeekChange(routine, next)}
            onDefaultPriorityChange={(next) => handleDefaultPriorityChange(routine, next)}
            onDelete={() => handleDelete(routine)}
          />
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
