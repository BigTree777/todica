CREATE TABLE `counter` (
	`id` text PRIMARY KEY NOT NULL,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`last_reset_executed_at` text,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `counter` (`id`, `completed_count`, `last_reset_executed_at`, `updated_at`, `version`) VALUES ('singleton', 0, NULL, CURRENT_TIMESTAMP, 1);
