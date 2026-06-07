/**
 * ProjectRepository インターフェース.
 *
 * 本機能 (BL-001) では Project の CRUD は対象外.
 * 起票時の `projectId` 参照整合性チェックのため exists のみを使う.
 */
export interface ProjectRepository {
  exists(id: string): Promise<boolean>;
}
