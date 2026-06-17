/**
 * ProjectRepository インターフェース (BL-001 / BL-016).
 *
 * BL-001: 起票時の projectId 参照整合性チェックのため exists を使う.
 * BL-016: Project の CRUD を追加.
 */

export interface Project {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** ゴミ箱化された時刻 (ISO8601). 通常状態は null. */
  trashedAt: string | null;
}

export interface ProjectRepository {
  exists(id: string): Promise<boolean>;
  insert(project: Project): Promise<void>;
  findById(id: string): Promise<Project | null>;
  /** 通常状態 (trashedAt IS NULL) のプロジェクトを name 昇順で一覧する. */
  list(): Promise<Project[]>;
  /** ゴミ箱状態 (trashedAt IS NOT NULL) のプロジェクトを一覧する. */
  listTrashed(): Promise<Project[]>;
  update(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
  /** ゴミ箱状態のプロジェクトを全件物理削除する. */
  deleteAllTrashed(): Promise<void>;
}
