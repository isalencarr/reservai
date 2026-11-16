CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`plan` text DEFAULT 'mensal' NOT NULL,
	`price_cents` integer,
	`paid_until` integer,
	`note` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_company_id_unique` ON `subscriptions` (`company_id`);--> statement-breakpoint
ALTER TABLE `companies` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `suspended_at` integer;