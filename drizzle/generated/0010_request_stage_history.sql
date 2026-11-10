ALTER TABLE "request_timeline" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "request_quotes" ADD COLUMN "attachment_ids" uuid[] DEFAULT '{}' NOT NULL;