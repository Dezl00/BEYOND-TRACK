ALTER TABLE "receipt_lines" ADD COLUMN "not_received" numeric(18, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "required_by" varchar(10);