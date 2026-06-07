CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`response_status` integer NOT NULL,
	`response_body` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`trashed_at` text,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`project_id` text,
	`due_date` text NOT NULL,
	`priority` text NOT NULL,
	`origin` text DEFAULT 'manual' NOT NULL,
	`routine_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`trashed_at` text,
	`trashed_reason` text,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_due_date_priority_idx` ON `tasks` (`due_date`,`priority`);--> statement-breakpoint
CREATE INDEX `tasks_project_id_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `tasks_trashed_at_idx` ON `tasks` (`trashed_at`);