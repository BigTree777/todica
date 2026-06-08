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
}

export interface ProjectRepository {
  exists(id: string): Promise<boolean>;
  insert(project: Project): Promise<void>;
  findById(id: string): Promise<Project | null>;
  list(): Promise<Project[]>;
  update(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
}
