-- Existing requests retain their UUIDs and related records, and receive a sequence per project.
WITH numbered AS (
  SELECT r.id,p.code,row_number() OVER(PARTITION BY r.project_id ORDER BY r.number::bigint,r.id) n
  FROM purchase_requests r JOIN projects p ON p.id=r.project_id
)
UPDATE purchase_requests r SET number=n.code||'-'||lpad(n.n::text,greatest(3,length(n.n::text)),'0')
FROM numbered n WHERE r.id=n.id;
INSERT INTO project_request_counters(project_id,last_number)
SELECT project_id,count(*) FROM purchase_requests GROUP BY project_id;
ALTER TABLE project_request_counters ADD CONSTRAINT request_counter_positive CHECK(last_number>0);
--> statement-breakpoint
CREATE FUNCTION assign_request_number() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prefix text; n bigint;
BEGIN
  SELECT code INTO STRICT prefix FROM projects WHERE id=NEW.project_id;
  INSERT INTO project_request_counters(project_id,last_number) VALUES(NEW.project_id,1)
  ON CONFLICT(project_id) DO UPDATE SET last_number=project_request_counters.last_number+1
  RETURNING last_number INTO n;
  NEW.number:=prefix||'-'||lpad(n::text,greatest(3,length(n::text)),'0');
  RETURN NEW;
END $$;
CREATE TRIGGER request_number_insert BEFORE INSERT ON purchase_requests FOR EACH ROW EXECUTE FUNCTION assign_request_number();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; req uuid; scope_id uuid; delete_project boolean;
BEGIN
  IF TG_OP<>'DELETE' OR TG_TABLE_NAME NOT IN ('projects','receipts','receipt_lines','request_timeline') THEN
    RAISE EXCEPTION 'Immutable record' USING ERRCODE='23514';
  END IF;
  SELECT c.project_id,c.delete_project INTO scope_id,delete_project FROM request_purge_challenges c
    JOIN users u ON u.id=c.user_id JOIN sessions s ON s.id=c.session_id AND s.user_id=u.id
    WHERE c.id::text=current_setting('siteflow.purge_challenge',true)
    AND c.verified_at IS NOT NULL AND c.expires_at>now() AND s.expires_at>now() AND u.is_owner AND u.deleted_at IS NULL;
  IF FOUND THEN
    IF TG_TABLE_NAME='projects' THEN
      IF NOT delete_project THEN RAISE EXCEPTION 'Project deletion confirmation required' USING ERRCODE='23514'; END IF;
      target:=OLD.id;
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
