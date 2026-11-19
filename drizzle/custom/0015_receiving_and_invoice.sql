ALTER TABLE purchase_requests DROP CONSTRAINT status_range;
ALTER TABLE purchase_requests ADD CONSTRAINT status_range CHECK(status BETWEEN 0 AND 16);
ALTER TABLE attachments DROP CONSTRAINT attachment_purpose;
ALTER TABLE attachments ADD CONSTRAINT attachment_purpose CHECK(purpose IN('request','receipt','quotation','alternative','payment','invoice'));
ALTER TABLE receipt_lines ADD CONSTRAINT not_received_nonnegative CHECK(not_received >= 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_receipt_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE requested numeric; previous_net numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM receipts r JOIN request_lines l ON l.request_id=r.request_id WHERE r.id=NEW.receipt_id AND l.id=NEW.request_line_id) THEN RAISE EXCEPTION 'Cross-request receipt' USING ERRCODE='23514'; END IF;
 SELECT quantity INTO requested FROM request_lines WHERE id=NEW.request_line_id FOR UPDATE;
 SELECT COALESCE(SUM(accepted-returned),0) INTO previous_net FROM receipt_lines WHERE request_line_id=NEW.request_line_id;
 IF NEW.returned>previous_net THEN RAISE EXCEPTION 'Return exceeds previous accepted quantity' USING ERRCODE='23514'; END IF;
 IF NEW.accepted+NEW.damaged+NEW.rejected+NEW.not_received>GREATEST(0,requested-previous_net+NEW.returned) THEN RAISE EXCEPTION 'Receipt exceeds remaining quantity' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
