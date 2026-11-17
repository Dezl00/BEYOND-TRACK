CREATE UNIQUE INDEX boq_manual_entry_level ON boq_items(project_id, level) WHERE manual_entry;

CREATE OR REPLACE FUNCTION validate_material() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE destination boq_items%ROWTYPE; source boq_items%ROWTYPE;
BEGIN
  SELECT * INTO destination FROM boq_items WHERE id=NEW.boq_item_id;
  IF destination.level IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Material requires leaf BOQ' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.boq_item_id<>NEW.boq_item_id
     AND EXISTS(SELECT 1 FROM request_lines WHERE material_id=OLD.id) THEN
    SELECT * INTO STRICT source FROM boq_items WHERE id=OLD.boq_item_id;
    IF NOT source.manual_entry OR source.project_id<>destination.project_id
       OR COALESCE(OLD.unit_id,source.unit_id) IS DISTINCT FROM COALESCE(NEW.unit_id,destination.unit_id) THEN
      RAISE EXCEPTION 'Invalid move of referenced material' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
