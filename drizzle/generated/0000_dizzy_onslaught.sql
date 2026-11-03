CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"receipt_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"public_id" text NOT NULL,
	"resource_type" varchar(10) NOT NULL,
	"format" varchar(10) NOT NULL,
	"name" varchar(200) NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid NOT NULL,
	"actor_id" uuid,
	"project_id" uuid,
	"action" smallint NOT NULL,
	"entity" smallint NOT NULL,
	"entity_id" varchar(80),
	"ip" varchar(64) NOT NULL,
	"user_agent" varchar(500) NOT NULL,
	"diff" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_created_at_id_pk" PRIMARY KEY("created_at","id")
) PARTITION BY RANGE (created_at);
--> statement-breakpoint
CREATE TABLE "boq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"level" smallint NOT NULL,
	"code" varchar(60) NOT NULL,
	"name" varchar(250) NOT NULL,
	"description" text,
	"unit_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" smallint NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"remember" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boq_item_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_policy" (
	"type" smallint PRIMARY KEY NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"forced" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"type" smallint NOT NULL,
	"in_app" boolean NOT NULL,
	"email" boolean NOT NULL,
	CONSTRAINT "notification_preferences_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"type" smallint NOT NULL,
	"request_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" smallint NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"label" varchar(150) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_users" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "project_users_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"location" varchar(200) DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"request_line_id" uuid NOT NULL,
	"accepted" numeric(18, 3) NOT NULL,
	"damaged" numeric(18, 3) NOT NULL,
	"rejected" numeric(18, 3) NOT NULL,
	"returned" numeric(18, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"notes" varchar(1000) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"price" numeric(18, 2),
	"notes" varchar(1000) DEFAULT '' NOT NULL,
	"overage_approved_by" uuid,
	"overage_approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" bigserial NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"supplier_id" uuid,
	"expected_at" varchar(10),
	"submitted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"system" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"previous_token_hash" varchar(64),
	"previous_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"remember" boolean DEFAULT false NOT NULL,
	"ip" varchar(64) NOT NULL,
	"user_agent" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"otp_required" boolean DEFAULT false NOT NULL,
	"default_theme" smallint DEFAULT 0 NOT NULL,
	"digits" smallint DEFAULT 0 NOT NULL,
	"read_notification_days" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"from_status" smallint,
	"to_status" smallint NOT NULL,
	"note" varchar(1000) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"email" varchar(254) NOT NULL,
	"username" varchar(80) NOT NULL,
	"job_title" varchar(150) NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" uuid NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"locked_until" timestamp with time zone,
	"failed_attempts" smallint DEFAULT 0 NOT NULL,
	"otp_enabled" boolean DEFAULT false NOT NULL,
	"otp_exempt" boolean DEFAULT false NOT NULL,
	"force_password_change" boolean DEFAULT true NOT NULL,
	"theme" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_boq_item_id_boq_items_id_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_request_line_id_request_lines_id_fk" FOREIGN KEY ("request_line_id") REFERENCES "public"."request_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_overage_approved_by_users_id_fk" FOREIGN KEY ("overage_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_timeline" ADD CONSTRAINT "request_timeline_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_timeline" ADD CONSTRAINT "request_timeline_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_request" ON "attachments" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "attachments_receipt" ON "attachments" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "audit_actor_time" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_project_time" ON "audit_log" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "boq_project_code" ON "boq_items" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "boq_parent" ON "boq_items" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "boq_unit" ON "boq_items" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "challenges_user" ON "auth_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_token" ON "auth_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "challenges_expiry" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_item_name" ON "materials" USING btree ("boq_item_id","name");--> statement-breakpoint
CREATE INDEX "notifications_user_cursor" ON "notifications" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedup" ON "notifications" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "outbox_ready" ON "outbox" USING btree ("available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_key" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "project_users_user" ON "project_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code" ON "projects" USING btree ("code");--> statement-breakpoint
CREATE INDEX "rate_limit_expiry" ON "rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "receipt_lines_request" ON "receipt_lines" USING btree ("request_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_lines_unique" ON "receipt_lines" USING btree ("receipt_id","request_line_id");--> statement-breakpoint
CREATE INDEX "receipts_request" ON "receipts" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_key" ON "receipts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "request_material" ON "request_lines" USING btree ("request_id","material_id");--> statement-breakpoint
CREATE INDEX "lines_material" ON "request_lines" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_number" ON "purchase_requests" USING btree ("number");--> statement-breakpoint
CREATE INDEX "requests_project_cursor" ON "purchase_requests" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "requests_creator_cursor" ON "purchase_requests" USING btree ("created_by","created_at","id");--> statement-breakpoint
CREATE INDEX "requests_status_delivery" ON "purchase_requests" USING btree ("status","expected_at");--> statement-breakpoint
CREATE INDEX "requests_supplier" ON "purchase_requests" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_hash" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_previous_hash" ON "sessions" USING btree ("previous_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "timeline_request_cursor" ON "request_timeline" USING btree ("request_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_name" ON "units" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_role" ON "users" USING btree ("role_id");
