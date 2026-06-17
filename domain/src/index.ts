/**
 * Todica ドメイン共有層のエントリポイント.
 *
 * - Task / Project 等のエンティティ型と純粋ロジックを集約する.
 * - 本層は I/O を持たず, サーバ・クライアントの双方から共通参照される.
 */
export * from "./clock/index.js";
export * from "./counter/index.js";
export * from "./focus-selection/index.js";
// project と task はともに isTrashed を export するためバレルの二重 export を避ける.
// project 側は isTrashed を named 除外して再 export する (project の isTrashed は
// project モジュールから直接 import する). バレルの isTrashed は task のものを指す.
export {
  createProject,
  type Project,
  restoreProject,
  trashProject,
  updateProject,
  validateProjectName,
} from "./project/index.js";
export * from "./routine/index.js";
export * from "./settings/index.js";
export * from "./task/index.js";
export * from "./trash/index.js";
