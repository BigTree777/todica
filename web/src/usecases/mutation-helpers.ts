/**
 * Web mutation アプリケーション層の共有ヘルパ (BL-118).
 *
 * view 層に重複していた次の横断ロジックを集約する.
 *   - `generateId`: jsdom フォールバック付き UUID 生成.
 *   - `safeEnqueue` / `safeDequeueByKey`: IDB 不可環境を握り潰す enqueue/dequeue ラッパー.
 *   - `MutationDeps`: view から注入するサイドエフェクト (衝突通知 / エラー通知 / 追加再フェッチ).
 *
 * `module-boundaries.md` §5.3 に従い, view 層は本ヘルパとユースケースフックだけを見て
 * offline-queue / Repository 例外型を直接参照しない.
 */

import type { QueryClient } from "@tanstack/react-query";
import { notifyError } from "../error-notification.js";
import type { QueueEntry } from "../offline-queue.js";
import { dequeue, enqueue, getAll } from "../offline-queue.js";

/** UUID v4 風の文字列を生成する. crypto.randomUUID が無い jsdom 環境向けのフォールバック. */
export function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const random = (n: number) => Math.floor(Math.random() * n);
  const hex = (n: number) => Array.from({ length: n }, () => random(16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

/** enqueue を安全に呼び出す. IDB が利用できない環境 (テスト等) ではエラーを無視する. */
export async function safeEnqueue(entry: Parameters<typeof enqueue>[0]): Promise<void> {
  try {
    await enqueue(entry);
  } catch {
    // IDB が利用できない環境ではキューへの保存をスキップ.
  }
}

/** idempotencyKey に対応するキューエントリを安全に削除する. IDB 不可環境ではスキップする. */
export async function safeDequeueByKey(idempotencyKey: string): Promise<void> {
  try {
    const all = await getAll();
    const match = all.find((e) => e.idempotencyKey === idempotencyKey);
    if (match?.id !== undefined) await dequeue(match.id);
  } catch {
    // IDB が利用できない環境ではスキップ.
  }
}

/**
 * view から注入するサイドエフェクト.
 *
 * - `onConflict`: 412 で衝突を検知したときに開く ConflictDialog 起動コールバック
 *   (= `useConflictDialog().openDialog`). UI 状態の所有は view に残る.
 * - `onError`: 通信エラー時の通知. 既定は `notifyError("通信に失敗しました")`.
 * - `afterSuccess`: 標準 invalidate に加えて view 独自の invalidate / fetchQuery を行う.
 *   tomorrow の「今日にする」連鎖など view 間差異を吸収する.
 */
export interface MutationDeps {
  onConflict?: (entry: QueueEntry, serverValue: unknown) => void;
  onError?: () => void;
  /**
   * 標準 invalidate キーを view ごとに上書きする (FR-6).
   * 未指定なら各ユースケースの既定キーを使う.
   */
  invalidateKeys?: readonly (readonly string[])[];
  afterSuccess?: (queryClient: QueryClient, result: unknown) => void;
}

/** mutation 失敗時の標準ハンドラ. ConflictError は onConflict へ, それ以外は onError へ振る. */
export function handleMutationError(
  error: unknown,
  deps: MutationDeps | undefined,
  isConflict: (error: unknown) => error is { entry: QueueEntry; serverValue: unknown },
): void {
  if (isConflict(error)) {
    deps?.onConflict?.(error.entry, error.serverValue);
    return;
  }
  if (deps?.onError) {
    deps.onError();
    return;
  }
  notifyError("通信に失敗しました");
}
