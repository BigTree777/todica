/**
 * offline-queue.ts (フェーズ D: 書込キュー)
 *
 * IndexedDB (idb ライブラリ) を使って書込操作をキューに永続化し、
 * オンライン復帰時に再送する機能を提供する。
 *
 * 仕様:
 *   WQ-001: idb を使って IndexedDB ストアを定義する。
 *   WQ-002: 書込操作をキューに永続化する。
 *   WQ-003: オンライン時はキューへの記録後、即座にリクエストを送信し成功したら削除する。
 *   WQ-004: オフライン時はキューに記録するだけ。
 *   WQ-007: 再送時は保存した Idempotency-Key をそのまま使用する。
 *   NFR-SW-02: 7 日経過したエントリは自動破棄する。
 *   NFR-SW-03: retryCount が 5 以上のエントリはキューから除外する。
 *   CR-001: 412 Precondition Failed 時は ConflictError を throw する。
 */

import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import { authedFetch } from "./auth/authed-fetch.js";

const DB_NAME = "todica-offline-queue";
const DB_VERSION = 1;
const STORE_NAME = "write-queue";

/** キューエントリの型 */
export interface QueueEntry {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  idempotencyKey: string;
  enqueuedAt: string;
  retryCount: number;
}

/** 412 衝突時にスローするエラー (CR-001) */
export class ConflictError extends Error {
  entry: QueueEntry;
  serverValue: unknown;

  constructor(entry: QueueEntry, serverValue: unknown) {
    super("Precondition Failed: conflict detected");
    this.name = "ConflictError";
    this.entry = entry;
    this.serverValue = serverValue;
  }
}

/** IndexedDB のオープン（シングルトン的に使い回す） */
let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * テスト間でDBのキャッシュをリセットするユーティリティ
 * (fake-indexeddb の自動リセット対策)
 */
export function _resetDbCache(): void {
  dbPromise = null;
}

/**
 * キューにエントリを追加する。
 *
 * @param entry - キューに追加するエントリ（id / enqueuedAt / retryCount を除く）
 * @param options - テスト用オーバーライドオプション
 */
export async function enqueue(
  entry: Omit<QueueEntry, "id" | "enqueuedAt" | "retryCount">,
  options?: { _enqueuedAt?: string; _retryCount?: number },
): Promise<void> {
  const db = await getDB();
  const record: Omit<QueueEntry, "id"> = {
    ...entry,
    enqueuedAt: options?._enqueuedAt ?? new Date().toISOString(),
    retryCount: options?._retryCount ?? 0,
  };
  await db.add(STORE_NAME, record);
}

/**
 * キューからエントリを削除する。
 */
export async function dequeue(id: number): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

/**
 * キュー内の全エントリを enqueuedAt 昇順で取得する。
 */
export async function getAll(): Promise<QueueEntry[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return (all as QueueEntry[]).sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
}

/**
 * idempotencyKey から QueueEntry を引く (BL-031).
 *
 * online で先に repository.fetch が走り 412 になった場合, ConflictDialog を出す
 * ためには対応する QueueEntry (URL / body / 元 If-Match version) が必要になる.
 * Mutation 側で safeEnqueue した直後の key で本関数を呼ぶことで, その entry を
 * 取得して `new ConflictError(entry, serverValue)` に橋渡しできる.
 */
export async function findEntryByKey(idempotencyKey: string): Promise<QueueEntry | undefined> {
  const entries = await getAll();
  return entries.find((e) => e.idempotencyKey === idempotencyKey);
}

/**
 * Repository が 412 で投げる独自エラー型 (OptimisticLockError / RestoreConflictError
 * 等) を ConflictError に変換するラッパー (BL-031 / BL-033).
 *
 * `extractServer` は repo 固有のエラー判定 + サーバ値抽出を行う callback.
 * undefined を返した場合は元の error をそのまま再 throw する.
 *
 * 使い方:
 *   const result = await mapConflict(
 *     idempotencyKey,
 *     () => repository.update(cmd),
 *     (err) => err instanceof OptimisticLockError ? err.currentTask : undefined,
 *   );
 *
 * `offline-queue.ts` から具体的な repository エラー型 (OptimisticLockError 等) への
 * 依存を作らないため, extractor を呼び出し側に渡してもらう設計とする.
 */
export async function mapConflict<T>(
  idempotencyKey: string,
  fn: () => Promise<T>,
  extractServer: (err: unknown) => unknown,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const serverValue = extractServer(err);
    if (serverValue !== undefined) {
      const entry = await findEntryByKey(idempotencyKey);
      if (entry) throw new ConflictError(entry, serverValue);
    }
    throw err;
  }
}

/**
 * キューを順番に再送する。
 *
 * - enqueuedAt から 7 日経過したエントリは削除してスキップ (NFR-SW-02)
 * - retryCount >= 5 のエントリは削除してスキップ (NFR-SW-03)
 * - 送信成功: キューから削除
 * - 412 応答: ConflictError を throw (CR-001)
 * - その他エラー: retryCount を +1 してキューに残す
 *   ただし retryCount が 5 に達した場合はキューから除去 (NFR-SW-03)
 */
export async function flush(): Promise<void> {
  const entries = await getAll();
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_RETRY = 5;

  for (const entry of entries) {
    const enqueuedAt = new Date(entry.enqueuedAt).getTime();

    // NFR-SW-02: 7 日経過エントリを削除
    if (now - enqueuedAt > SEVEN_DAYS_MS) {
      await dequeue(entry.id!);
      continue;
    }

    // NFR-SW-03: retryCount >= MAX_RETRY のエントリを削除
    if (entry.retryCount >= MAX_RETRY) {
      console.error(
        `[offline-queue] retryCount が上限 (${MAX_RETRY}) に達したため除去します:`,
        entry.idempotencyKey,
      );
      await dequeue(entry.id!);
      continue;
    }

    // リクエスト送信. Authorization は authedFetch が auth-storage から都度フレッシュな
    // token を付与するため, entry.headers に Authorization を残さないことを enqueue 側で
    // 保証している (BL-097).
    try {
      const response = await authedFetch(entry.url, {
        method: entry.method,
        headers: entry.headers as HeadersInit,
        body: entry.body ?? undefined,
      });

      if (response.status === 412) {
        // CR-001: 衝突エラー
        let serverValue: unknown;
        try {
          serverValue = await response.json();
        } catch {
          serverValue = null;
        }
        throw new ConflictError(entry, serverValue);
      }

      if (response.ok) {
        // 成功: キューから削除
        await dequeue(entry.id!);
      } else {
        // その他エラー: retryCount++ して書き戻す
        await updateRetryCount(entry);
      }
    } catch (err) {
      if (err instanceof ConflictError) {
        throw err;
      }
      // ネットワークエラー等: retryCount++
      await updateRetryCount(entry);
    }
  }
}

/**
 * エントリの retryCount を +1 して書き戻す。
 * retryCount が MAX_RETRY (5) に達した場合はキューから除去する (NFR-SW-03)。
 */
async function updateRetryCount(entry: QueueEntry): Promise<void> {
  const MAX_RETRY = 5;
  const newRetryCount = entry.retryCount + 1;

  if (newRetryCount >= MAX_RETRY) {
    console.error(
      `[offline-queue] retryCount が上限 (${MAX_RETRY}) に達したため除去します:`,
      entry.idempotencyKey,
    );
    await dequeue(entry.id!);
    return;
  }

  const db = await getDB();
  const updated: QueueEntry = { ...entry, retryCount: newRetryCount };
  await db.put(STORE_NAME, updated);
}
