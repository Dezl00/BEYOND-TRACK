CREATE UNIQUE INDEX users_single_owner ON users ((is_owner)) WHERE is_owner=true;
ALTER TABLE users ADD CONSTRAINT users_theme_check CHECK(theme IN(0,1));
ALTER TABLE users ADD CONSTRAINT users_lowercase CHECK(email=lower(email) AND username=lower(username));
ALTER TABLE settings ADD CONSTRAINT singleton_settings CHECK(id=1);
ALTER TABLE settings ADD CONSTRAINT settings_values CHECK(default_theme IN(0,1) AND digits IN(0,1) AND read_notification_days BETWEEN 1 AND 365);
ALTER TABLE purchase_requests ADD CONSTRAINT status_range CHECK(status BETWEEN 0 AND 8);
ALTER TABLE boq_items ADD CONSTRAINT boq_parent_fk FOREIGN KEY(parent_id) REFERENCES boq_items(id);
ALTER TABLE boq_items ADD CONSTRAINT boq_values CHECK(level BETWEEN 1 AND 3 AND quantity>0 AND ((level=1 AND parent_id IS NULL) OR (level>1 AND parent_id IS NOT NULL)) AND ((level=3 AND description IS NOT NULL AND length(trim(description))>0) OR (level<3 AND description IS NULL)));
ALTER TABLE materials ADD CONSTRAINT material_quantity CHECK(quantity>0);
ALTER TABLE request_lines ADD CONSTRAINT line_quantity CHECK(quantity>0 AND (price IS NULL OR price>=0));
ALTER TABLE receipt_lines ADD CONSTRAINT receipt_quantities CHECK(accepted>=0 AND damaged>=0 AND rejected>=0 AND returned>=0);
ALTER TABLE attachments ADD CONSTRAINT attachment_values CHECK(bytes BETWEEN 1 AND 4194304 AND resource_type IN('image','raw') AND format IN('jpg','jpeg','png','webp','pdf'));
ALTER TABLE notification_policy ADD CONSTRAINT policy_types CHECK(type BETWEEN 0 AND 2);
ALTER TABLE notification_preferences ADD CONSTRAINT preference_type_fk FOREIGN KEY(type) REFERENCES notification_policy(type);
ALTER TABLE notifications ADD CONSTRAINT notification_type_fk FOREIGN KEY(type) REFERENCES notification_policy(type);
ALTER TABLE auth_challenges ADD CONSTRAINT challenge_values CHECK(kind IN(0,1) AND attempts BETWEEN 0 AND 5);
--> statement-breakpoint
CREATE FUNCTION validate_boq() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_project uuid; parent_level smallint;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT project_id,level INTO parent_project,parent_level FROM boq_items WHERE id=NEW.parent_id FOR KEY SHARE;
    IF parent_project IS DISTINCT FROM NEW.project_id OR parent_level IS DISTINCT FROM NEW.level-1 THEN RAISE EXCEPTION 'Invalid BOQ hierarchy' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND (OLD.unit_id<>NEW.unit_id OR OLD.project_id<>NEW.project_id OR OLD.level<>NEW.level OR OLD.parent_id IS DISTINCT FROM NEW.parent_id) THEN
    IF EXISTS(SELECT 1 FROM boq_items WHERE parent_id=OLD.id) OR EXISTS(SELECT 1 FROM materials WHERE boq_item_id=OLD.id) THEN RAISE EXCEPTION 'Referenced BOQ structure is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_boq_trigger BEFORE INSERT OR UPDATE ON boq_items FOR EACH ROW EXECUTE FUNCTION validate_boq();
CREATE FUNCTION validate_material() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM boq_items WHERE id=NEW.boq_item_id AND level=3) THEN RAISE EXCEPTION 'Material requires leaf BOQ' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND OLD.boq_item_id<>NEW.boq_item_id AND EXISTS(SELECT 1 FROM request_lines WHERE material_id=OLD.id) THEN RAISE EXCEPTION 'Referenced material is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_material_trigger BEFORE INSERT OR UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION validate_material();
CREATE FUNCTION validate_request_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM purchase_requests r JOIN materials m ON m.id=NEW.material_id JOIN boq_items b ON b.id=m.boq_item_id WHERE r.id=NEW.request_id AND r.project_id=b.project_id AND b.level=3) THEN RAISE EXCEPTION 'Cross-project material' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_line_trigger BEFORE INSERT OR UPDATE ON request_lines FOR EACH ROW EXECUTE FUNCTION validate_request_line();
CREATE FUNCTION validate_receipt_line() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM receipts r JOIN request_lines l ON l.request_id=r.request_id WHERE r.id=NEW.receipt_id AND l.id=NEW.request_line_id) THEN RAISE EXCEPTION 'Cross-request receipt' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_receipt_trigger BEFORE INSERT ON receipt_lines FOR EACH ROW EXECUTE FUNCTION validate_receipt_line();
--> statement-breakpoint
CREATE FUNCTION immutable_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable record' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER immutable_receipts BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER immutable_receipt_lines BEFORE UPDATE OR DELETE ON receipt_lines FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER immutable_timeline BEFORE UPDATE OR DELETE ON request_timeline FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE FUNCTION protect_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.is_owner THEN RAISE EXCEPTION 'Protected owner' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND ((OLD.is_owner AND (NOT NEW.is_owner OR NEW.locked)) OR (NOT OLD.is_owner AND NEW.is_owner)) THEN RAISE EXCEPTION 'Protected owner' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER owner_protection BEFORE UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION protect_owner();
--> statement-breakpoint
CREATE FUNCTION ensure_audit_partition(event_time timestamptz) RETURNS void LANGUAGE plpgsql AS $$
DECLARE month_start date; month_end date; partition_name text;
BEGIN
  month_start=date_trunc('month',event_time AT TIME ZONE 'UTC')::date;
  month_end=(month_start+interval '1 month')::date;
  partition_name='audit_log_'||to_char(month_start,'YYYY_MM');
  PERFORM pg_advisory_xact_lock(hashtext(partition_name));
  IF to_regclass(partition_name) IS NULL THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',partition_name,month_start,month_end);
  END IF;
END $$;
SELECT ensure_audit_partition(now());
SELECT ensure_audit_partition(now()+interval '1 month');
