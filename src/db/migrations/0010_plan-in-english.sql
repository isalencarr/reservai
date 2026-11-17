-- O plano era gravado em português ('mensal', 'anual'). A tradução vai no
-- proprio INSERT da tabela nova: valor desconhecido cai no padrao mensal.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`plan` text DEFAULT 'monthly' NOT NULL,
	`price_cents` integer,
	`paid_until` integer,
	`note` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_subscriptions`("id", "company_id", "plan", "price_cents", "paid_until", "note", "updated_at") SELECT "id", "company_id", CASE "plan" WHEN 'anual' THEN 'yearly' ELSE 'monthly' END, "price_cents", "paid_until", "note", "updated_at" FROM `subscriptions`;--> statement-breakpoint
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_company_id_unique` ON `subscriptions` (`company_id`);