/**
 * Web クライアント側 TaskRepository インターフェース.
 *
 * UI 層は本インターフェースだけを見て, HTTP 実装の詳細を知らない.
 * テストではモック実装を渡して呼び出し回数や引数を検証する.
 */
import type { Task, DueDate } from "@todica/domain/task";

export interface CreateTaskCommand {
  id: string;
  name: string;
  projectId?: string | null;
  dueDate?: DueDate;
}

export interface UpdateTaskCommand {
  id: string;
  /** 楽観ロックに渡す現行 version. HTTP では If-Match ヘッダに乗る. */
  ifMatch: number;
  patch: {
    name?: string;
    dueDate?: DueDate;
    projectId?: string | null;
  };
}

export interface DeleteTaskCommand {
  id: string;
  ifMatch: number;
}

export interface TaskRepository {
  list(): Promise<Task[]>;
  create(cmd: CreateTaskCommand): Promise<Task>;
  update(cmd: UpdateTaskCommand): Promise<Task>;
  delete(cmd: DeleteTaskCommand): Promise<void>;
}

/**
 * 楽観ロック衝突 (HTTP 412) を表す例外.
 *
 * サーバが 412 Precondition Failed を返したとき, HttpTaskRepository は本例外を throw する.
 * ボディに含まれる現行 task はキャッチ側で再フェッチ / 強制再送等の判断に使う.
 * 詳細は plan.md §処理フロー (PATCH / DELETE の 412 経路).
 *
 * test-designer 段階ではクラスシグネチャのみ. 本実装は implementer が担当.
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
 * スタブ実装. implementer が HTTP 呼び出しを実装する.
 */
export class HttpTaskRepository implements TaskRepository {
  constructor(
    private readonly _baseUrl: string,
    private readonly _authToken: string,
  ) {}

  async list(): Promise<Task[]> {
    throw new Error("not implemented: HttpTaskRepository.list");
  }
  async create(_cmd: CreateTaskCommand): Promise<Task> {
    throw new Error("not implemented: HttpTaskRepository.create");
  }
  async update(_cmd: UpdateTaskCommand): Promise<Task> {
    throw new Error("not implemented: HttpTaskRepository.update");
  }
  async delete(_cmd: DeleteTaskCommand): Promise<void> {
    throw new Error("not implemented: HttpTaskRepository.delete");
  }
}
