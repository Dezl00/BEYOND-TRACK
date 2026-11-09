ALTER TABLE "projects" ADD COLUMN "client" varchar(200);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "details" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "request_purge_challenges" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "unit_supervisor" boolean DEFAULT false NOT NULL;