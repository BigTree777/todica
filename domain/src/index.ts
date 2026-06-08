/**
 * Todica ドメイン共有層のエントリポイント.
 *
 * - Task / Project 等のエンティティ型と純粋ロジックを集約する.
 * - 本層は I/O を持たず, サーバ・クライアントの双方から共通参照される.
 */
export * from "./clock/index.js";
export * from "./task/index.js";
export * from "./project/index.js";
