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
