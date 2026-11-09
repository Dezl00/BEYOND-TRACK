UPDATE roles SET unit_supervisor=true WHERE system AND name='مشرف أعلى';
ALTER TABLE projects ADD CONSTRAINT project_dates CHECK(end_date >= start_date);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; req uuid; scope_id uuid;
BEGIN
  IF TG_OP<>'DELETE' OR TG_TABLE_NAME NOT IN ('projects','receipts','receipt_lines','request_timeline') THEN
    RAISE EXCEPTION 'Immutable record' USING ERRCODE='23514';
  END IF;
  SELECT c.project_id INTO scope_id FROM request_purge_challenges c
    JOIN users u ON u.id=c.user_id JOIN sessions s ON s.id=c.session_id AND s.user_id=u.id
    WHERE c.id::text=current_setting('siteflow.purge_challenge',true)
    AND c.verified_at IS NOT NULL AND c.expires_at>now() AND s.expires_at>now() AND u.is_owner AND u.deleted_at IS NULL;
  IF FOUND THEN
    IF TG_TABLE_NAME='projects' THEN target:=OLD.id;
    ELSIF scope_id IS NULL THEN RETURN OLD;
    ELSE
      IF TG_TABLE_NAME='receipt_lines' THEN SELECT request_id INTO req FROM receipts WHERE id=OLD.receipt_id;
      ELSE req:=OLD.request_id; END IF;
      SELECT project_id INTO target FROM purchase_requests WHERE id=req;
    END IF;
    IF scope_id=target THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION 'OTP confirmation required' USING ERRCODE='23514';
END $$;
CREATE TRIGGER project_delete_otp BEFORE DELETE ON projects FOR EACH ROW EXECUTE FUNCTION immutable_row();
