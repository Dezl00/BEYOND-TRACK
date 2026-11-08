ALTER TABLE users ADD CONSTRAINT users_whatsapp_country CHECK (whatsapp_country_code IN ('+20','+966'));
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_whatsapp_number CHECK (
  whatsapp_number IS NULL OR
  (whatsapp_country_code='+20' AND whatsapp_number ~ '^1[0125][0-9]{8}$') OR
  (whatsapp_country_code='+966' AND whatsapp_number ~ '^5[0-9]{8}$')
);
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT users_whatsapp_enabled_number CHECK (NOT whatsapp_enabled OR whatsapp_number IS NOT NULL);
