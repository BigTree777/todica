CREATE TABLE `settings` (
  `id` text PRIMARY KEY NOT NULL,
  `day_boundary_time` text NOT NULL DEFAULT '04:00',
  `updated_at` text NOT NULL,
  `version` integer NOT NULL DEFAULT 1
);
