-- Older parent rows can retain their historical measurements. Only leaf items need them.
ALTER TABLE boq_items ADD CONSTRAINT boq_leaf_measurements
  CHECK (level <> 3 OR (unit_id IS NOT NULL AND quantity IS NOT NULL));
