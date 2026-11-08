ALTER TABLE "notification_policy" ADD COLUMN "whatsapp" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "whatsapp" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "whatsapp_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_country_code" varchar(4) DEFAULT '+966' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_number" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_enabled" boolean DEFAULT false NOT NULL;