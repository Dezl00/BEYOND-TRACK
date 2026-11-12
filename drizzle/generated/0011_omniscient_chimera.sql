CREATE TABLE "project_request_counters" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"last_number" bigint NOT NULL
);
--> statement-breakpoint
DROP INDEX "requests_number";--> statement-breakpoint
ALTER TABLE "purchase_requests" ALTER COLUMN "number" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "purchase_requests" ALTER COLUMN "number" SET DATA TYPE varchar(60) USING "number"::varchar(60);--> statement-breakpoint
ALTER TABLE "request_purge_challenges" ADD COLUMN "delete_project" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_request_counters" ADD CONSTRAINT "project_request_counters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "requests_project_number" ON "purchase_requests" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "users_phone_login" ON "users" USING btree ("whatsapp_number");
