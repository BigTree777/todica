/**
 * useConflictDialog フック (フェーズ E: 競合解決 UI)
 *
 * ConflictDialog の表示状態を管理するフック。
 * 412 Precondition Failed 発生時にダイアログを開き、
 * ユーザーの選択に応じてコールバックを呼び出す。
 *
 * 仕様:
 *   CR-001: 412 時に衝突解決ダイアログを表示する。
 *   CR-002: 2 択のボタンを提示する。
 *   CR-003: 「クライアントの値で再送」選択時のコールバック。
 *   CR-004: 「サーバの値を採用」選択時のコールバック。
 */
import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { dequeue } from "../offline-queue.js";
import type { QueueEntry } from "../offline-queue.js";

export interface ConflictDialogState {
  open: boolean;
  entry: QueueEntry | null;
  serverValue: Record<string, unknown>;
  localValue: Record<string, unknown>;
}

export interface UseConflictDialogReturn {
  dialogState: ConflictDialogState;
  openDialog: (entry: QueueEntry, serverValue: unknown) => void;
  closeDialog: () => void;
  onAcceptServer: () => void | Promise<void>;
  onRetryWithServer: () => void | Promise<void>;
}

const INITIAL_STATE: ConflictDialogState = {
  open: false,
  entry: null,
  serverValue: {},
  localValue: {},
};

export function useConflictDialog(): UseConflictDialogReturn {
  const queryClient = useQueryClient();
  const [dialogState, setDialogState] = useState<ConflictDialogState>(INITIAL_STATE);

  const openDialog = useCallback((entry: QueueEntry, serverValue: unknown) => {
    // localValue はエントリのリクエストボディから取得する
    let localValue: Record<string, unknown> = {};
    try {
      if (entry.body) {
        localValue = JSON.parse(entry.body) as Record<string, unknown>;
      }
    } catch {
      localValue = {};
    }

    const safeServerValue =
      serverValue !== null &&
      typeof serverValue === "object" &&
      !Array.isArray(serverValue)
        ? (serverValue as Record<string, unknown>)
        : {};

    setDialogState({
      open: true,
      entry,
      serverValue: safeServerValue,
      localValue,
    });
  }, []);

  const closeDialog = useCallback(() => {
    setDialogState(INITIAL_STATE);
  }, []);

  // CR-004: キューから削除 + UI を最新データで更新
  const onAcceptServer = useCallback(async () => {
    if (dialogState.entry?.id !== undefined) {
      await dequeue(dialogState.entry.id);
    }
    queryClient.invalidateQueries({ queryKey: ["today"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["routines"] });
    queryClient.invalidateQueries({ queryKey: ["trash"] });
    closeDialog();
  }, [dialogState.entry, queryClient, closeDialog]);

  // CR-003: サーバ値の version を If-Match に設定して再送
  const onRetryWithServer = useCallback(async () => {
    if (!dialogState.entry) return;
    const serverVersion = (dialogState.serverValue as { version?: unknown }).version;
    if (serverVersion === undefined) return;
    try {
      const headers = {
        ...dialogState.entry.headers,
        "If-Match": String(serverVersion),
      };
      const resp = await fetch(dialogState.entry.url, {
        method: dialogState.entry.method,
        headers,
        body: dialogState.entry.body ?? undefined,
      });
      if (resp.ok) {
        if (dialogState.entry.id !== undefined) {
          await dequeue(dialogState.entry.id);
        }
        queryClient.invalidateQueries({ queryKey: ["today"] });
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        queryClient.invalidateQueries({ queryKey: ["routines"] });
        queryClient.invalidateQueries({ queryKey: ["trash"] });
        closeDialog();
      }
    } catch {
      // 再送失敗時はダイアログを維持
    }
  }, [dialogState, queryClient, closeDialog]);

  return {
    dialogState,
    openDialog,
    closeDialog,
    onAcceptServer,
    onRetryWithServer,
  };
}
