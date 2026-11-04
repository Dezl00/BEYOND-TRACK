CREATE OR REPLACE FUNCTION protect_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.is_owner THEN RAISE EXCEPTION 'Protected owner' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND ((OLD.is_owner AND (NOT NEW.is_owner OR NEW.locked OR NEW.deleted_at IS NOT NULL)) OR (NOT OLD.is_owner AND NEW.is_owner)) THEN RAISE EXCEPTION 'Protected owner' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE FUNCTION protect_owner_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW.active AND EXISTS(SELECT 1 FROM users WHERE is_owner=true AND role_id=NEW.id) THEN RAISE EXCEPTION 'Protected owner role' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER owner_role_protection BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION protect_owner_role();
