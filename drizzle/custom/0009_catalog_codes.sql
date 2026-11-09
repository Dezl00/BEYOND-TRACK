ALTER TABLE boq_items DROP CONSTRAINT boq_values, DROP CONSTRAINT boq_leaf_measurements;
ALTER TABLE boq_items ADD CONSTRAINT boq_values CHECK (
  level BETWEEN 1 AND 3 AND quantity >= 0 AND
  ((level=1 AND parent_id IS NULL) OR (level>1 AND parent_id IS NOT NULL)) AND
  ((level=3 AND quantity IS NOT NULL AND description IS NOT NULL AND length(trim(description))>0)
    OR (level<3 AND description IS NULL)));
ALTER TABLE materials DROP CONSTRAINT material_quantity;
ALTER TABLE materials ADD CONSTRAINT material_quantity CHECK(quantity>=0);
CREATE SEQUENCE project_auto_code_seq;
CREATE FUNCTION next_project_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE result text;
BEGIN
  LOOP
    result := 'P-' || nextval('project_auto_code_seq');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM projects WHERE code=result);
  END LOOP;
  RETURN result;
END $$;
ALTER TABLE projects ALTER COLUMN code SET DEFAULT next_project_code();
CREATE TABLE catalog_counters(scope uuid PRIMARY KEY, last_number integer NOT NULL);
CREATE FUNCTION next_catalog_code(parent_scope uuid, prefix text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  INSERT INTO catalog_counters(scope,last_number) VALUES(parent_scope,1)
  ON CONFLICT(scope) DO UPDATE SET last_number=catalog_counters.last_number+1 RETURNING last_number INTO n;
  RETURN prefix || CASE WHEN n<10 THEN n::text ELSE '(' || n || ')' END;
END $$;
--> statement-breakpoint
CREATE FUNCTION assign_catalog_code() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_id uuid; prefix text;
BEGIN
  IF TG_TABLE_NAME='materials' THEN
    scope_id := NEW.boq_item_id;
    SELECT code INTO STRICT prefix FROM boq_items WHERE id=scope_id;
  ELSE
    scope_id := COALESCE(NEW.parent_id,NEW.project_id);
    IF NEW.parent_id IS NULL THEN prefix:='';
    ELSE SELECT code INTO STRICT prefix FROM boq_items WHERE id=NEW.parent_id; END IF;
  END IF;
  NEW.code := next_catalog_code(scope_id,prefix);
  RETURN NEW;
END $$;
CREATE TRIGGER catalog_boq_insert BEFORE INSERT ON boq_items FOR EACH ROW EXECUTE FUNCTION assign_catalog_code();
CREATE TRIGGER catalog_boq_move BEFORE UPDATE ON boq_items FOR EACH ROW WHEN
  (OLD.parent_id IS DISTINCT FROM NEW.parent_id OR OLD.project_id IS DISTINCT FROM NEW.project_id OR NEW.code='') EXECUTE FUNCTION assign_catalog_code();
CREATE TRIGGER catalog_material_insert BEFORE INSERT ON materials FOR EACH ROW EXECUTE FUNCTION assign_catalog_code();
CREATE TRIGGER catalog_material_move BEFORE UPDATE ON materials FOR EACH ROW WHEN
  (OLD.boq_item_id IS DISTINCT FROM NEW.boq_item_id OR NEW.code='') EXECUTE FUNCTION assign_catalog_code();
DROP INDEX boq_project_code;
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN SELECT id FROM boq_items ORDER BY level,created_at,code,id LOOP
    UPDATE boq_items SET code='' WHERE id=rec.id;
  END LOOP;
  FOR rec IN SELECT m.id,b.unit_id FROM materials m JOIN boq_items b ON b.id=m.boq_item_id ORDER BY m.boq_item_id,m.name,m.id LOOP
    UPDATE materials SET code='',unit_id=rec.unit_id WHERE id=rec.id;
  END LOOP;
END $$;
CREATE UNIQUE INDEX boq_project_code ON boq_items(project_id,code);
ALTER TABLE materials ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX materials_parent_code ON materials(boq_item_id,code);
