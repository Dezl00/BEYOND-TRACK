-- Delimit every hierarchy segment; parentheses are no longer necessary.
CREATE FUNCTION catalog_plain_code(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT string_agg(trim(both '()' from token[1]),'.' ORDER BY n)
 FROM regexp_matches(value,'\([0-9]+\)|[0-9]','g') WITH ORDINALITY AS parts(token,n)
$$;
UPDATE boq_items SET code=catalog_plain_code(code);
UPDATE materials SET code=catalog_plain_code(code);
DROP FUNCTION catalog_plain_code(text);
CREATE OR REPLACE FUNCTION next_catalog_code(parent_scope uuid, prefix text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 INSERT INTO catalog_counters(scope,last_number) VALUES(parent_scope,1)
 ON CONFLICT(scope) DO UPDATE SET last_number=catalog_counters.last_number+1 RETURNING last_number INTO n;
 RETURN CASE WHEN prefix='' THEN '' ELSE prefix||'.' END || n::text;
END $$;
