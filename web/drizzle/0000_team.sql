CREATE TABLE `team_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`principal_id` text NOT NULL,
	`person_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_workspace` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`data` text NOT NULL
);
