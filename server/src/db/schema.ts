/**
 * Drizzle スキーマ定義.
 *
 * 論理スキーマ: docs/developer/architecture/database/schema.md
 * 物理スキーマ: docs/developer/architecture/database/overview.md §9
 *
 * - サーバ側 (better-sqlite3) と Android ローカル側 (@capacitor-community/sqlite の生 SQL) で共通.
 * - カラム名は snake_case で統一. ドメイン Task (camelCase) ↔ DB カラム (snake_case) の
 *   変換は repository 層で行う.
 * - 列挙型は `text({ enum: [...] })` で型安全に表現する.
 */
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * tasks テーブル.
 *
 * docs/developer/architecture/database/schema.md §Task と一致.
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey().notNull(),
    name: text("name").notNull(),
    projectId: text("project_id"),
    dueDate: text("due_date", { enum: ["today", "tomorrow"] }).notNull(),
    priority: text("priority", {
      enum: ["highest", "normal", "later"],
    }).notNull(),
    origin: text("origin", { enum: ["manual", "routine"] })
      .notNull()
      .default("manual"),
    routineId: text("routine_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    trashedAt: text("trashed_at"),
    trashedReason: text("trashed_reason", {
      enum: ["completed", "deleted"],
    }),
    version: integer("version").notNull().default(1),
  },
  (table) => ({
    dueDatePriorityIdx: index("tasks_due_date_priority_idx").on(table.dueDate, table.priority),
    projectIdIdx: index("tasks_project_id_idx").on(table.projectId),
    trashedAtIdx: index("tasks_trashed_at_idx").on(table.trashedAt),
  }),
);

/**
 * projects テーブル.
 *
 * docs/developer/architecture/database/schema.md §Project と一致.
 * tasks.project_id の参照先でもある (カスケード NULL は repository / usecase 層で担保).
 */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  trashedAt: text("trashed_at"),
  version: integer("version").notNull().default(1),
});

/**
 * idempotency_keys テーブル.
 *
 * docs/developer/features/task-crud/plan.md D-010 / R-003 に従い,
 * 直近の Idempotency-Key 応答 (HTTP status + body JSON) をキャッシュする.
 */
export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey().notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  responseStatus: integer("response_status").notNull(),
  responseBody: text("response_body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * focus_selection テーブル (BL-006 / focus-task).
 *
 * docs/developer/features/focus-task/plan.md §「データモデル」.
 * - 単一レコード前提 (id = "singleton" 固定).
 * - currentTaskId は tasks.id への弱参照 (FK 制約は張らない. D-006).
 * - 整合性 (現在のタスクが今日ビューに居ない id を指し続けない) はアプリケーション層で担保する.
 */
export const focusSelection = sqliteTable("focus_selection", {
  id: text("id").primaryKey().notNull(),
  currentTaskId: text("current_task_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});

/**
 * counter テーブル (completion-counter).
 *
 * docs/developer/features/completion-counter/plan.md §「データモデル」.
 * - 単一レコード前提 (id = "singleton" 固定).
 * - completedCount は通常状態のタスクが完了に遷移した回数を表す (FR-040).
 * - lastResetExecutedAt は日次リセット (daily-reset) が最後に実行した境界時刻を保持する.
 */
export const counter = sqliteTable("counter", {
  id: text("id").primaryKey().notNull(),
  completedCount: integer("completed_count").notNull().default(0),
  lastResetExecutedAt: text("last_reset_executed_at"),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});

/**
 * settings テーブル (BL-009 / settings-day-boundary).
 *
 * docs/developer/features/settings-day-boundary/plan.md §「データモデル」.
 * - 単一レコード前提 (id = "singleton" 固定).
 * - dayBoundaryTime は "HH:MM" 形式. デフォルト "04:00" (FR-042).
 */
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().notNull(),
  dayBoundaryTime: text("day_boundary_time").notNull().default("04:00"),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});

/**
 * routines テーブル (BL-017 / routine).
 *
 * - daysOfWeek は JSON 配列文字列として保存する（例: "[1,2,3]"）.
 * - defaultPriority は "highest" | "normal" | "later" の文字列.
 */
export const routines = sqliteTable("routines", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  daysOfWeek: text("days_of_week").notNull(),
  defaultPriority: text("default_priority").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  trashedAt: text("trashed_at"),
});

/**
 * sessions テーブル.
 *
 * docs/developer/features/app-login/plan.md §「データモデル」/ D-1.
 * - token は `crypto.randomBytes(32).toString("hex")` の 64 文字 16 進文字列.
 * - expires_at / created_at は Unix epoch ms (INTEGER) で保持する.
 * - 期限境界は `expires_at > now` の strict > 判定 (D-6).
 */
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey().notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const appPassword = sqliteTable("app_password", {
  id: text("id").primaryKey().notNull(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** schema 全体を Drizzle に渡すためのオブジェクト. */
export const schema = {
  tasks,
  projects,
  idempotencyKeys,
  focusSelection,
  counter,
  settings,
  routines,
  sessions,
  appPassword,
};
