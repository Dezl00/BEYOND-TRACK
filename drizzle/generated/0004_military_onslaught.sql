CREATE TABLE "request_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"supplier_id" uuid NOT NULL,
	"expected_at" varchar(10) NOT NULL,
	"prices" jsonb NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "receipt_key" uuid;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN "pricing_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_quotes" ADD CONSTRAINT "request_quotes_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_quotes" ADD CONSTRAINT "request_quotes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_quotes" ADD CONSTRAINT "request_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_quotes" ADD CONSTRAINT "request_quotes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_supplier_revision" ON "request_quotes" USING btree ("request_id","revision","supplier_id");