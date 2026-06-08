/**
 * フェーズ D: 書込キュー (offline-queue) の単体テスト
 *
 * 受け入れ基準の出典: docs/developer/features/pwa-offline-queue/spec.md
 * §「フェーズ D: 書込キュー + Background Sync」と対応する。
 *
 * 要件:
 *   WQ-001: idb ライブラリを導入し、書込キュー用 IndexedDB ストアを定義する。
 *   WQ-002: 書込操作をキューに永続化する。
 *   WQ-003: オンライン時はキューへの記録後、即座にリクエストを送信し、成功したらキューから削除する。
 *   WQ-004: オフライン時はキューに記録するだけでリクエスト送信を試みない。
 *   WQ-007: 再送時は保存した Idempotency-Key をそのまま使用する。
 *   NFR-SW-02: キューに積まれた書込は最大 7 日間保持し、7 日経過後は自動で破棄する。
 *   NFR-SW-03: 同一 Idempotency-Key の再送は最大 5 回まで。5 回失敗時はキューから除外。
 *   CR-001: 再送時に 412 Precondition Failed が返った場合、ConflictError を throw する。
 *
 * シナリオ（spec.md §フェーズ D）:
 *   「キューに保存されたリクエストがサーバに送信される」
 *   「送信成功後、該当エントリがキューから削除される」
 *
 * NOTE: `offline-queue.ts` および `fake-indexeddb` はまだ存在しない。
 *       このテストは意図的に失敗する (red)。
 *       implementer が実装・インストールすることで green 化する。
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enqueue,
  dequeue,
  getAll,
  flush,
  ConflictError,
} from "./offline-queue.js";
import type { QueueEntry } from "./offline-queue.js";

// fetch をグローバルモックとして使う
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** テスト用のキューエントリを作るファクトリ */
function makeEntry(
  overrides: Partial<Omit<QueueEntry, "id" | "enqueuedAt" | "retryCount">> = {},
): Omit<QueueEntry, "id" | "enqueuedAt" | "retryCount"> {
  return {
    url: "/api/v1/tasks",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "テストタスク" }),
    idempotencyKey: "ikey-test-001",
    ...overrides,
  };
}

describe("offline-queue: enqueue / dequeue / getAll の基本動作 (WQ-001/WQ-002)", () => {
  it("シナリオ: enqueue でキューにエントリが追加され、getAll で取得できる", async () => {
    // Given キューが空の状態
    const beforeAll = await getAll();
    const initialLength = beforeAll.length;

    // When エントリを enqueue する
    await enqueue(makeEntry({ idempotencyKey: "ikey-001" }));

    // Then getAll でエントリが 1 件増えている
    const all = await getAll();
    expect(all.length).toBe(initialLength + 1);
    const added = all.find((e) => e.idempotencyKey === "ikey-001");
    expect(added).toBeDefined();
    expect(added!.url).toBe("/api/v1/tasks");
    expect(added!.method).toBe("POST");
    expect(added!.retryCount).toBe(0);
    expect(added!.enqueuedAt).toBeDefined();
    // enqueuedAt は ISO 8601 形式の文字列であること
    expect(() => new Date(added!.enqueuedAt)).not.toThrow();
    expect(new Date(added!.enqueuedAt).toISOString()).toBe(added!.enqueuedAt);
  });

  it("シナリオ: dequeue でキューからエントリが削除される", async () => {
    // Given キューにエントリが 1 件ある
    await enqueue(makeEntry({ idempotencyKey: "ikey-dequeue-test" }));
    const before = await getAll();
    const entry = before.find((e) => e.idempotencyKey === "ikey-dequeue-test");
    expect(entry).toBeDefined();
    expect(entry!.id).toBeDefined();

    // When dequeue(entry.id) を呼ぶ
    await dequeue(entry!.id!);

    // Then getAll から該当エントリが消えている
    const after = await getAll();
    const removed = after.find((e) => e.idempotencyKey === "ikey-dequeue-test");
    expect(removed).toBeUndefined();
  });

  it("シナリオ: getAll は enqueuedAt の昇順でエントリを返す (WQ-002 処理順序保証)", async () => {
    // Given 複数のエントリを時刻をずらして enqueue する
    // fake-indexeddb は自動インクリメント id が順序を保証するが、
    // enqueuedAt ソートの確認のため時刻差があるエントリを追加する
    await enqueue(makeEntry({ idempotencyKey: "ikey-order-A", url: "/api/v1/tasks" }));
    await enqueue(makeEntry({ idempotencyKey: "ikey-order-B", url: "/api/v1/projects" }));

    // When getAll を呼ぶ
    const all = await getAll();

    // Then enqueuedAt の昇順になっている
    // (A を先に追加したため A が先に来る)
    const aIndex = all.findIndex((e) => e.idempotencyKey === "ikey-order-A");
    const bIndex = all.findIndex((e) => e.idempotencyKey === "ikey-order-B");
    expect(aIndex).toBeLessThan(bIndex);
  });

  it("シナリオ: enqueue したエントリには enqueuedAt と retryCount=0 が自動設定される", async () => {
    // Given 任意のエントリ
    const before = new Date();

    // When enqueue する
    await enqueue(makeEntry({ idempotencyKey: "ikey-meta-check" }));

    // Then enqueuedAt は現在時刻付近の ISO 8601 文字列、retryCount は 0
    const all = await getAll();
    const entry = all.find((e) => e.idempotencyKey === "ikey-meta-check");
    expect(entry).toBeDefined();
    expect(entry!.retryCount).toBe(0);
    const enqueuedDate = new Date(entry!.enqueuedAt);
    const after = new Date();
    expect(enqueuedDate.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(enqueuedDate.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });
});

describe("offline-queue: flush() 正常系 (WQ-003/WQ-007)", () => {
  it("シナリオ: flush() でキュー内の全エントリがサーバに送信され、成功後にキューから削除される", async () => {
    // Given キューに 2 件のエントリがある
    await enqueue(makeEntry({ idempotencyKey: "ikey-flush-A", url: "/api/v1/tasks", method: "POST" }));
    await enqueue(makeEntry({ idempotencyKey: "ikey-flush-B", url: "/api/v1/tasks/t1", method: "PATCH" }));

    // fetch が 200 を返すようにモック
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: "t1" }), { status: 200 }));

    // When flush() を呼ぶ
    await flush();

    // Then fetch が 2 回呼ばれている（各エントリ 1 回ずつ）
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Then キューが空になっている
    const remaining = await getAll();
    const flushEntries = remaining.filter(
      (e) => e.idempotencyKey === "ikey-flush-A" || e.idempotencyKey === "ikey-flush-B",
    );
    expect(flushEntries).toHaveLength(0);
  });

  it("シナリオ: flush() は Idempotency-Key を保存した値のまま使用する (WQ-007)", async () => {
    // Given キューに Idempotency-Key が保存されたエントリがある
    const idempotencyKey = "ikey-preserved-12345";
    await enqueue(
      makeEntry({
        idempotencyKey,
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      }),
    );

    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

    // When flush() を呼ぶ
    await flush();

    // Then fetch に渡されたリクエストに元の Idempotency-Key が含まれている
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [_url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Idempotency-Key")).toBe(idempotencyKey);
  });

  it("シナリオ: flush() はキューを enqueuedAt 昇順（追加順）に送信する", async () => {
    // Given キューに 2 件のエントリがある（A が先、B が後）
    const sentUrls: string[] = [];
    await enqueue(makeEntry({ idempotencyKey: "ikey-order-first", url: "/api/v1/tasks/first", method: "POST" }));
    await enqueue(makeEntry({ idempotencyKey: "ikey-order-second", url: "/api/v1/tasks/second", method: "POST" }));

    mockFetch.mockImplementation((url: string) => {
      sentUrls.push(url as string);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    // When flush() を呼ぶ
    await flush();

    // Then A が B より先に送信されている
    const firstIdx = sentUrls.indexOf("/api/v1/tasks/first");
    const secondIdx = sentUrls.indexOf("/api/v1/tasks/second");
    expect(firstIdx).toBeLessThan(secondIdx);
  });
});

describe("offline-queue: flush() 7 日経過エントリの自動破棄 (NFR-SW-02)", () => {
  it("シナリオ: enqueuedAt が 8 日前のエントリは flush() 時にキューから除外され送信されない", async () => {
    // Given enqueuedAt を 8 日前に設定したエントリをキューに積む
    // enqueue 後に直接 IDB を書き換えるのは難しいため、
    // 過去時刻のエントリを直接 enqueue する API があることを前提とする。
    // ここでは enqueue の第 2 引数として enqueuedAt を上書きできる設計を想定する。
    // 実装に合わせて調整可能だが、テストの意図は「7 日超は破棄」の検証。
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

    // enqueue した後に DB を直接操作するか、テスト専用 API を使う前提
    // ここでは enqueue の overrides に _enqueuedAt を許容する設計を想定する。
    await enqueue(
      makeEntry({ idempotencyKey: "ikey-expired" }),
      { _enqueuedAt: eightDaysAgo },
    );

    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

    // When flush() を呼ぶ
    await flush();

    // Then 期限切れエントリには fetch が呼ばれない
    const expiredFetchCalls = mockFetch.mock.calls.filter(([url]) =>
      String(url).includes("expired"),
    );
    expect(expiredFetchCalls).toHaveLength(0);

    // Then キューから期限切れエントリが削除されている
    const remaining = await getAll();
    const expiredEntry = remaining.find((e) => e.idempotencyKey === "ikey-expired");
    expect(expiredEntry).toBeUndefined();
  });

  it("シナリオ: enqueuedAt が 6 日前のエントリは 7 日以内なので削除されずに送信される", async () => {
    // Given enqueuedAt を 6 日前に設定したエントリ（まだ有効期限内）
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

    await enqueue(
      makeEntry({ idempotencyKey: "ikey-valid-6days", url: "/api/v1/tasks/valid" }),
      { _enqueuedAt: sixDaysAgo },
    );

    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

    // When flush() を呼ぶ
    await flush();

    // Then fetch が呼ばれている（有効期限内なので送信される）
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("offline-queue: flush() retryCount 上限 (NFR-SW-03)", () => {
  it("シナリオ: retryCount が 5 のエントリは flush() 時にキューから除外され送信されない", async () => {
    // Given retryCount === 5 のエントリがキューにある
    await enqueue(
      makeEntry({ idempotencyKey: "ikey-retry-maxed" }),
      { _retryCount: 5 },
    );

    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

    // When flush() を呼ぶ
    await flush();

    // Then fetch が呼ばれない（リトライ上限に達しているため）
    expect(mockFetch).not.toHaveBeenCalled();

    // Then キューからエントリが削除されている（エラーログ後に除去）
    const remaining = await getAll();
    const entry = remaining.find((e) => e.idempotencyKey === "ikey-retry-maxed");
    expect(entry).toBeUndefined();
  });

  it("シナリオ: fetch に失敗（ネットワークエラー）すると retryCount が +1 されてキューに残る", async () => {
    // Given キューにエントリが 1 件ある（retryCount = 0）
    await enqueue(makeEntry({ idempotencyKey: "ikey-network-error" }));

    // fetch がネットワークエラーを投げるようにモック
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    // When flush() を呼ぶ
    await flush();

    // Then キューにエントリが残っている
    const remaining = await getAll();
    const entry = remaining.find((e) => e.idempotencyKey === "ikey-network-error");
    expect(entry).toBeDefined();

    // Then retryCount が 1 に増えている
    expect(entry!.retryCount).toBe(1);
  });

  it("シナリオ: retryCount が 4 のエントリが再度失敗すると retryCount が 5 になりキューから除去される", async () => {
    // Given retryCount === 4 のエントリがキューにある
    await enqueue(
      makeEntry({ idempotencyKey: "ikey-retry-4" }),
      { _retryCount: 4 },
    );

    // fetch がネットワークエラーを投げるようにモック
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    // When flush() を呼ぶ
    await flush();

    // Then retryCount が 5 に達したのでキューから除去される（NFR-SW-03）
    const remaining = await getAll();
    const entry = remaining.find((e) => e.idempotencyKey === "ikey-retry-4");
    expect(entry).toBeUndefined();
  });
});

describe("offline-queue: flush() 412 Precondition Failed (CR-001)", () => {
  it("シナリオ: サーバが 412 を返した場合、ConflictError が throw される", async () => {
    // Given キューにエントリが 1 件ある
    await enqueue(makeEntry({ idempotencyKey: "ikey-conflict-test" }));

    // fetch が 412 を返すようにモック
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ message: "Precondition Failed", currentVersion: 5 }),
        { status: 412 },
      ),
    );

    // When flush() を呼ぶ
    // Then ConflictError が throw される
    await expect(flush()).rejects.toThrow(ConflictError);
  });

  it("シナリオ: ConflictError にはキューエントリとサーバのレスポンスが含まれる", async () => {
    // Given キューにエントリが 1 件ある
    await enqueue(
      makeEntry({
        idempotencyKey: "ikey-conflict-detail",
        url: "/api/v1/tasks/t1",
        method: "PATCH",
      }),
    );

    const serverResponse = { message: "Precondition Failed", id: "t1", version: 10 };
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(serverResponse), { status: 412 }),
    );

    // When flush() を呼ぶ
    let caughtError: unknown;
    try {
      await flush();
    } catch (e) {
      caughtError = e;
    }

    // Then ConflictError であることを確認
    expect(caughtError).toBeInstanceOf(ConflictError);
    const conflictError = caughtError as ConflictError;

    // Then エントリ情報がエラーに含まれている
    expect(conflictError.entry).toBeDefined();
    expect(conflictError.entry.idempotencyKey).toBe("ikey-conflict-detail");
    expect(conflictError.entry.url).toBe("/api/v1/tasks/t1");

    // Then サーバの応答値がエラーに含まれている
    expect(conflictError.serverValue).toBeDefined();
  });
});
