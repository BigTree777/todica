CREATE TABLE `focus_selection` (
	`id` text PRIMARY KEY NOT NULL,
	`current_task_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `focus_selection` (`id`, `current_task_id`, `created_at`, `updated_at`, `version`) VALUES ('singleton', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1);
