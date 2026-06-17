import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
/**
 * ルーティン管理ビュー .
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
 * TanStack Query (useQuery / useMutation) でデータ取得・書込みを管理.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "./routines-view.css";
import type { Priority } from "@todica/domain/task";
import { useConflictDialog } from "../../hooks/use-conflict-dialog.js";
import type { WebRoutine, WebRoutineRepository } from "../../repositories/routine-repository.js";
import { generateId } from "../../usecases/mutation-helpers.js";
import { useRoutineMutations } from "../../usecases/routine-usecases.js";
import { ConflictDialog } from "../conflict-dialog/conflict-dialog.js";
import { RoutineCard } from "../routine-card/routine-card.js";
import { RoutineFormCard } from "../routine-card/routine-form-card.js";

export interface RoutinesViewProps {
  repository: WebRoutineRepository;
}

export function RoutinesView(props: RoutinesViewProps): JSX.Element {
  const { repository } = props;
  const conflictDialog = useConflictDialog();

  const { data: routinesData } = useQuery({
    queryKey: ["routines"],
    queryFn: () => repository.list(),
    networkMode: "offlineFirst",
  });
  const routines: WebRoutine[] = routinesData ?? [];

  const [newName, setNewName] = useState("");
  const [newDaysOfWeek, setNewDaysOfWeek] = useState<number[]>([1]); // デフォルト: 月曜
  const [newDefaultPriority, setNewDefaultPriority] = useState<Priority>("normal");

  // BL-104: 起票フォーム開閉は URL クエリ `?create=1` を単一情報源とする (D-001).
  const [searchParams, setSearchParams] = useSearchParams();
  const formOpen = searchParams.get("create") === "1";

  const closeForm = useCallback(() => {
    setSearchParams(
      (prev) => {
        prev.delete("create");
        return prev;
      },
      { replace: false },
    );
    setNewName("");
    setNewDaysOfWeek([1]);
    setNewDefaultPriority("normal");
  }, [setSearchParams]);

  const focusCreateButton = useCallback(() => {
    const el = document.querySelector<HTMLButtonElement>("button.app-shell__create");
    el?.focus();
  }, []);

  const handleCancel = useCallback(() => {
    closeForm();
    focusCreateButton();
  }, [closeForm, focusCreateButton]);

  useEffect(() => {
    if (!formOpen) return;
    const el = document.getElementById("routine-name") as HTMLInputElement | null;
    el?.focus();
  }, [formOpen]);

  useEffect(() => {
    if (!formOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeForm();
      focusCreateButton();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [formOpen, closeForm, focusCreateButton]);

  // BL-118: routine mutation 群はアプリケーション層 (routine-usecases) へ集約.
  //   - 標準 invalidate は ["routines"]. 衝突時は conflictDialog を起動する.
  const routineMutations = useRoutineMutations(repository, {
    onConflict: conflictDialog.openDialog,
  });
  const createMutation = routineMutations.create;
  const updateMutation = routineMutations.update;
  const deleteMutation = routineMutations.delete;

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newName) return;
      if (newDaysOfWeek.length === 0) return;
      const id = generateId();
      try {
        await createMutation.mutateAsync({
          id,
          name: newName,
          daysOfWeek: newDaysOfWeek,
          defaultPriority: newDefaultPriority,
        });
      } catch {
        // BL-104 / REQ-8: 失敗時はフォームを閉じない (入力値も保持).
        return;
      }
      // BL-104 / REQ-7 / D-004: 成功時のみ自動 close.
      closeForm();
    },
    [newName, newDaysOfWeek, newDefaultPriority, createMutation, closeForm],
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

  // REQ-4: 曜日 click で即時 PATCH. daysOfWeek が 0 件になる場合は silent return
  //   (D-016 / spec の「曜日 0 件運用は維持」).
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

  // REQ-4: PriorityStars click で即時 PATCH.
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

      {/* BL-104 / REQ-4: `?create=1` のときのみ条件付き描画 (D-001). */}
      {formOpen && (
        <RoutineFormCard
          name={newName}
          onNameChange={setNewName}
          daysOfWeek={newDaysOfWeek}
          onToggleDay={toggleDay}
          defaultPriority={newDefaultPriority}
          onDefaultPriorityChange={setNewDefaultPriority}
          onSubmit={handleCreate}
          onCancel={handleCancel}
        />
      )}

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
