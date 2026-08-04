CREATE TABLE `portfolio_snapshots` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL
);
