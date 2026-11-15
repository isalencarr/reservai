CREATE TABLE `access_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `access_codes_company_phone` ON `access_codes` (`company_id`,`phone`);