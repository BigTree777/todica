CREATE TABLE IF NOT EXISTS `app_password` (
	`id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`updated_at` integer NOT NULL
);
