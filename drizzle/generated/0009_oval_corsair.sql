CREATE TABLE "request_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"paid_by" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "purpose" varchar(20) DEFAULT 'request' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "upload_key" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "pricing_revision" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "delivery_type" varchar(20) DEFAULT 'authenticated' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "cloudinary_url" text;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "review_status" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "review_note" varchar(1000) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "workflow_role" varchar(30);--> statement-breakpoint
ALTER TABLE "request_payments" ADD CONSTRAINT "request_payments_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_payments" ADD CONSTRAINT "request_payments_quote_id_request_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."request_quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_payments" ADD CONSTRAINT "request_payments_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_key" ON "request_payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_quote" ON "request_payments" USING btree ("quote_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_payment_id_request_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."request_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;