ALTER TABLE request_purge_challenges ADD CONSTRAINT purge_attempts CHECK(attempts BETWEEN 0 AND 5);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only the OTP-confirmed administrative transaction may remove receipt history.
  -- Audit rows and all ordinary updates remain immutable.
  IF TG_OP='DELETE' AND TG_TABLE_NAME IN('receipts','receipt_lines','request_timeline')
    AND EXISTS (
      SELECT 1 FROM request_purge_challenges c
      JOIN users u ON u.id=c.user_id
      JOIN sessions s ON s.id=c.session_id AND s.user_id=u.id
      WHERE c.id::text=current_setting('siteflow.purge_challenge',true)
        AND c.verified_at IS NOT NULL AND c.expires_at>now()
        AND s.expires_at>now() AND u.is_owner AND u.deleted_at IS NULL
    ) THEN RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Immutable record' USING ERRCODE='23514';
END $$;
