CREATE TABLE `auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`type` text NOT NULL,
	`email_masked` text NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`user_agent` text,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_events_company_created` ON `auth_events` (`company_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `providers` ADD `joined_at` integer;