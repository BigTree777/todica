/**
 * Web クライアント側 TaskRepository インターフェース + HTTP 実装.
 *
 * UI 層は本インターフェースだけを見て, HTTP 実装の詳細を知らない.
 * テストではモック実装を渡して呼び出し回数や引数を検証する.
 *
 * 仕様参照:
 *   - docs/developer/features/task-crud/plan.md §処理フロー (Web → HTTP)
 *   - ADR-0010 (Idempotency-Key, If-Match の必須化)
 *
 * BL-074 差し戻し (Problem 1) で AC-4 production 経路を成立させるため,
 * 本ファイルは生 `fetch` を廃止し `authedFetch` 経由に切り替えた.
 * `authedFetch` が 401 を捕捉した時点で `auth-storage.clearToken()` と
 * `todica:auth-expired` イベント dispatch を行う (plan D-13). これにより
 * 期限切れ token を持つユーザは API 呼び出しから自動で LoginView に戻れる.
 *
 * 残る 4 本 (settings / project / routine / trash) の同等切り替えは別 BL に切り出す.
 */
import type { DueDate, Priority, Task } from "@todica/domain/task";
import { authedFetch } from "../auth/authed-fetch.js";

export interface CreateTaskCommand {
  id: string;
  name: string;
  projectId?: string | null;
  dueDate?: DueDate;
  /**
   * BL-002 / FR-003: 起票時の優先度. 省略時はサーバ側で "normal" が補完される.
   * 本フィールドの型は test-designer が追加した「型のみのスタブ」.
   * 実際に HttpTaskRepository / UI が priority を送る実装は implementer が green 化する.
   */
  priority?: Priority;
}

export interface UpdateTaskCommand {
  id: string;
  /** 楽観ロックに渡す現行 version. HTTP では If-Match ヘッダに乗る. */
  ifMatch: number;
  patch: {
    name?: string;
    dueDate?: DueDate;
    projectId?: string | null;
    /**
     * BL-002 / FR-004: 編集時の優先度. PATCH /api/v1/tasks/{id} で受理される.
     * 本フィールドの型は test-designer が追加した「型のみのスタブ」.
     * server PATCH の priority 受理 / UI からの送信は implementer が green 化する.
     */
    priority?: Priority;
  };
}

export interface DeleteTaskCommand {
  id: string;
  ifMatch: number;
}

/**
 * BL-003 / FR-006: タスクを完了させるコマンド.
 * 本フィールドの型は test-designer が追加した「型のみのスタブ」.
 * HttpTaskRepository.complete / UI からの呼び出しは implementer が green 化する.
 */
export interface CompleteTaskCommand {
  id: string;
  ifMatch: number;
}

/**
 * BL-005 / FR-010 / FR-011: 今日ビュー API のレスポンス形状.
 *
 * - `tasks`: dueDate = "today" かつ trashedAt = null のタスクを
 *   priority (highest→normal→later) → createdAt 昇順 → id 昇順 で並べた一覧.
 * - `nextTaskId`: 並びの先頭タスクの id. tasks が空のとき null (= 「次の 1 つ」が存在しない).
 * - `currentTaskId`: BL-006 / FR-012 で追加された FocusSelection.currentTaskId のミラー.
 *   サーバ側で FocusSelection.currentTaskId と等しい値を返す (明示未選択時は null).
 *   暗黙フォールバックは UI 側で `currentTaskId ?? nextTaskId` の式で表現する.
 *   BL-006 では型レベルで optional とし, 実装側 (implementer) が必ず返す形に詰める.
 *
 * 本型は test-designer が追加した「型のみのスタブ」.
 * HttpTaskRepository.today / UI からの呼び出しは implementer が green 化する.
 */
export interface TodayViewResponse {
  tasks: Task[];
  nextTaskId: string | null;
  /**
   * BL-006 / FR-012 で追加. サーバの FocusSelection.currentTaskId と等価.
   * 過渡的に optional (旧 BL-005 実装との互換のため). implementer が必須化して良い.
   */
  currentTaskId?: string | null;
  /**
   * BL-008 / FR-040 で追加. サーバの Counter.completedCount と等価
   * (= 「今日の完了タスク数」). 過渡的に optional とし, implementer が必須化して良い.
   * 本フィールドは test-designer が追加した「型のみのスタブ」.
   * サーバ側の同梱 / UI 側の表示は implementer が green 化する.
   */
  completionCount: number;
}

/**
 * BL-006 / FR-012: FocusSelection エンティティ (Web 側ミラー).
 *
 * 仕様: docs/developer/features/focus-task/spec.md.
 * 本型は test-designer が追加した「型のみのスタブ」.
 * HttpTaskRepository.getFocus / setFocus / UI 連携は implementer が green 化する.
 */
export interface FocusSelection {
  id: string;
  currentTaskId: string | null;
  version: number;
  updatedAt: string;
}

/**
 * BL-008 / FR-040: Counter エンティティ (Web 側ミラー).
 *
 * 仕様: docs/developer/features/completion-counter/spec.md.
 * 単一レコード前提 (id = "singleton"). サーバ Counter と同形.
 * 本型は test-designer が追加した「型のみのスタブ」.
 * HttpTaskRepository.getCounter / UI 連携は implementer が green 化する.
 */
export interface Counter {
  id: string;
  completedCount: number;
  lastResetExecutedAt: string | null;
  version: number;
  updatedAt: string;
}

/**
 * BL-006 / FR-012: 現在のタスクを設定 / 解除するコマンド.
 *
 * - taskId === null は「現在のタスク解除」を意味する.
 * - ifMatch は現行 FocusSelection.version. HTTP では If-Match ヘッダに乗る.
 */
export interface SetFocusCommand {
  taskId: string | null;
  ifMatch: number;
}

/**
 * BL-038 / tomorrow-view: `list()` に渡せる filter.
 *
 * - `dueDate` を渡すとサーバ側 (`GET /api/v1/tasks?dueDate=...`) で絞り込む.
 * - 未指定なら既存挙動 (絞り込みなし) を維持する (D-011).
 *
 * 仕様参照: docs/developer/features/tomorrow-view/plan.md §「TaskRepository クライアント側の拡張」.
 */
export interface ListTasksFilter {
  dueDate?: DueDate;
}

export interface TaskRepository {
  list(filter?: ListTasksFilter): Promise<Task[]>;
  create(cmd: CreateTaskCommand): Promise<Task>;
  update(cmd: UpdateTaskCommand): Promise<Task>;
  delete(cmd: DeleteTaskCommand): Promise<void>;
  /**
   * BL-003 / FR-006: タスクを完了状態 (trashedReason = "completed") に遷移させる.
   * 成功時は更新後 Task を返す. 412 衝突時は OptimisticLockError を投げる.
   * 本メソッドは test-designer が追加したインターフェース上のスタブ.
   * HttpTaskRepository の本実装は implementer が green 化する.
   */
  complete(cmd: CompleteTaskCommand): Promise<Task>;
  /**
   * BL-005 / FR-010 / FR-011: 今日ビューの取得.
   *
   * GET /api/v1/today を叩き, `{ tasks, nextTaskId, currentTaskId? }` を返す.
   * `tasks` はサーバ側で priority → createdAt → id の順に並べ替えられており,
   * クライアントは再ソートせずそのまま表示する (plan.md D-004).
   * BL-006 で `currentTaskId` が追加された (FocusSelection のミラー).
   * 本メソッドは test-designer が追加したインターフェース上のスタブ.
   * HttpTaskRepository.today の本実装 / UI からの呼び出しは implementer が green 化する.
   */
  today(): Promise<TodayViewResponse>;
  /**
   * BL-006 / FR-012: 現在のタスク (FocusSelection) を取得する.
   * GET /api/v1/focus に対応. 単一レコード前提.
   * 本メソッドは test-designer が追加したインターフェース上のスタブ.
   * HttpTaskRepository.getFocus の本実装 / UI からの呼び出しは implementer が green 化する.
   */
  getFocus(): Promise<FocusSelection>;
  /**
   * BL-006 / FR-012: 現在のタスクを設定 / 解除する.
   * PUT /api/v1/focus に対応. 412 衝突時は OptimisticLockError を throw する.
   * 本メソッドは test-designer が追加したインターフェース上のスタブ.
   * HttpTaskRepository.setFocus の本実装 / UI からの呼び出しは implementer が green 化する.
   */
  setFocus(cmd: SetFocusCommand): Promise<FocusSelection>;
  /**
   * BL-008 / FR-040: 今日の完了タスク数 (Counter) を取得する.
   * GET /api/v1/counter に対応. 単一レコード前提.
   * 本メソッドは test-designer が追加したインターフェース上のスタブ.
   * HttpTaskRepository.getCounter の本実装 / UI からの呼び出しは implementer が green 化する.
   */
  getCounter(): Promise<Counter>;
}

/**
 * 楽観ロック衝突 (HTTP 412) を表す例外.
 *
 * サーバが 412 Precondition Failed を返したとき, HttpTaskRepository は本例外を throw する.
 * ボディに含まれる現行 task はキャッチ側で再フェッチ / 強制再送等の判断に使う.
 * 詳細は plan.md §処理フロー (PATCH / DELETE の 412 経路).
 */
export class OptimisticLockError extends Error {
  constructor(
    message: string,
    public readonly currentTask?: Task,
  ) {
    super(message);
    this.name = "OptimisticLockError";
  }
}

/**
 * UUID v4 を生成する.
 *
 * - ブラウザ / Node 19+ では `crypto.randomUUID()` を優先する.
 * - 利用不可な環境では `crypto.getRandomValues` ベースの fallback を使う.
 */
function uuidV4(): string {
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // RFC 4122 v4
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

/**
 * HTTP 実装. `authedFetch` を使ってサーバの /api/v1/tasks 系エンドポイントを叩く.
 *
 * BL-074 差し戻し (Problem 1):
 *   - 旧 API 互換のため `authToken` 引数は受けるが内部では使わない.
 *     token は `authedFetch` が `auth-storage` から都度読む.
 *   - 401 を受けた時点で `authedFetch` 側で `clearToken()` + `todica:auth-expired`
 *     dispatch が行われ, `AppWithAuth` の listener が LoginView に戻す.
 */
export class HttpTaskRepository implements TaskRepository {
  constructor(
    readonly baseUrl: string,
    /**
     * @deprecated BL-074: token は `auth-storage` から都度読むようになり本引数は使われない.
     *   既存呼出 (`main.tsx` の buildHttpRepos) との互換のため optional で残している.
     */
    readonly authToken?: string,
  ) {
    void authToken;
  }

  private jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async list(filter?: ListTasksFilter): Promise<Task[]> {
    // BL-038 / tomorrow-view: filter.dueDate が渡されたら URL に `?dueDate=...` を乗せる.
    // 既存呼び出し (引数なし) との互換のため optional.
    const qs = filter?.dueDate ? `?dueDate=${encodeURIComponent(filter.dueDate)}` : "";
    const res = await authedFetch(`${this.baseUrl}/api/v1/tasks${qs}`, {
      method: "GET",
      headers: this.jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to list tasks`);
    }
    const body = (await res.json()) as { tasks: Task[] };
    return body.tasks;
  }

  async create(cmd: CreateTaskCommand): Promise<Task> {
    const body: Record<string, unknown> = {
      id: cmd.id,
      name: cmd.name,
    };
    if (cmd.projectId !== undefined) body.projectId = cmd.projectId;
    if (cmd.dueDate !== undefined) body.dueDate = cmd.dueDate;
    if (cmd.priority !== undefined) body.priority = cmd.priority;

    // Idempotency-Key は UUID v4. クライアントが採番した task id をそのまま使う方針
    // (plan.md §処理フロー: 「id を Idempotency-Key として送る」).
    const idemKey = cmd.id;

    const res = await authedFetch(`${this.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: this.jsonHeaders({ "Idempotency-Key": idemKey }),
      body: JSON.stringify(body),
    });

    if (res.status === 412) {
      const errBody = (await res.json()) as { task?: Task };
      throw new OptimisticLockError("optimistic lock conflict on create", errBody.task);
    }
    if (!res.ok && res.status !== 201) {
      throw new Error(`HTTP ${res.status}: failed to create task`);
    }
    const ok = (await res.json()) as { task: Task };
    return ok.task;
  }

  async update(cmd: UpdateTaskCommand): Promise<Task> {
    const body: Record<string, unknown> = {};
    if (cmd.patch.name !== undefined) body.name = cmd.patch.name;
    if (cmd.patch.dueDate !== undefined) body.dueDate = cmd.patch.dueDate;
    if (cmd.patch.projectId !== undefined) body.projectId = cmd.patch.projectId;
    if (cmd.patch.priority !== undefined) body.priority = cmd.patch.priority;

    // PATCH の Idempotency-Key は task id とは独立に採番する (同じ id でも複数回 PATCH しうる).
    const idemKey = uuidV4();

    const res = await authedFetch(`${this.baseUrl}/api/v1/tasks/${cmd.id}`, {
      method: "PATCH",
      headers: this.jsonHeaders({
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      }),
      body: JSON.stringify(body),
    });

    if (res.status === 412) {
      const errBody = (await res.json()) as { task?: Task };
      throw new OptimisticLockError("optimistic lock conflict on update", errBody.task);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to update task`);
    }
    const ok = (await res.json()) as { task: Task };
    return ok.task;
  }

  async delete(cmd: DeleteTaskCommand): Promise<void> {
    const idemKey = uuidV4();

    const res = await authedFetch(`${this.baseUrl}/api/v1/tasks/${cmd.id}`, {
      method: "DELETE",
      headers: this.jsonHeaders({
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      }),
    });

    if (res.status === 204) return;

    if (res.status === 412) {
      const errBody = (await res.json()) as { task?: Task };
      throw new OptimisticLockError("optimistic lock conflict on delete", errBody.task);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to delete task`);
    }
  }

  /**
   * BL-005 / FR-010 / FR-011: 今日ビュー取得.
   *
   * GET /api/v1/today を叩き, `{ tasks, nextTaskId }` を返す.
   * tasks はサーバ側で priority → createdAt → id の順に並んでおり,
   * クライアントは再ソートせずそのまま表示する (plan.md D-004).
   */
  async today(): Promise<TodayViewResponse> {
    const res = await authedFetch(`${this.baseUrl}/api/v1/today`, {
      method: "GET",
      headers: this.jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to fetch today view`);
    }
    const body = (await res.json()) as TodayViewResponse;
    return body;
  }

  /**
   * BL-006 / FR-012: 現在のタスク (FocusSelection) を取得する.
   * GET /api/v1/focus に対応.
   */
  async getFocus(): Promise<FocusSelection> {
    const res = await authedFetch(`${this.baseUrl}/api/v1/focus`, {
      method: "GET",
      headers: this.jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to fetch focus`);
    }
    const body = (await res.json()) as { focus: FocusSelection };
    return body.focus;
  }

  /**
   * BL-006 / FR-012: 現在のタスクを設定 / 解除する.
   * PUT /api/v1/focus に対応. 412 衝突時は OptimisticLockError を throw する.
   */
  async setFocus(cmd: SetFocusCommand): Promise<FocusSelection> {
    const idemKey = uuidV4();
    const res = await authedFetch(`${this.baseUrl}/api/v1/focus`, {
      method: "PUT",
      headers: this.jsonHeaders({
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      }),
      body: JSON.stringify({ taskId: cmd.taskId }),
    });
    if (res.status === 412) {
      throw new OptimisticLockError("optimistic lock conflict on setFocus");
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to set focus`);
    }
    const body = (await res.json()) as { focus: FocusSelection };
    return body.focus;
  }

  /**
   * BL-008 / FR-040: 今日の完了タスク数 (Counter) を取得する.
   * GET /api/v1/counter に対応.
   * 本メソッドは test-designer 段階のスタブ. implementer が本実装で green 化する.
   */
  async getCounter(): Promise<Counter> {
    const res = await authedFetch(`${this.baseUrl}/api/v1/counter`, {
      method: "GET",
      headers: this.jsonHeaders(),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to fetch counter`);
    }
    const body = (await res.json()) as { counter: Counter };
    return body.counter;
  }

  /**
   * BL-003 / FR-006: タスク完了アクション.
   *
   * POST /api/v1/tasks/{id}/complete に対応. 成功時は 200 OK で `{ task }` が返るため
   * 更新後 Task を返す. 412 衝突時は OptimisticLockError を throw する.
   */
  async complete(cmd: CompleteTaskCommand): Promise<Task> {
    const idemKey = uuidV4();

    const res = await authedFetch(`${this.baseUrl}/api/v1/tasks/${cmd.id}/complete`, {
      method: "POST",
      headers: this.jsonHeaders({
        "Idempotency-Key": idemKey,
        "If-Match": String(cmd.ifMatch),
      }),
    });

    if (res.status === 412) {
      const errBody = (await res.json()) as { task?: Task };
      throw new OptimisticLockError("optimistic lock conflict on complete", errBody.task);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: failed to complete task`);
    }
    const ok = (await res.json()) as { task: Task };
    return ok.task;
  }
}
