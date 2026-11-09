ALTER TABLE "materials" ADD COLUMN "code" varchar(60);--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;