ALTER TABLE inquiry_status_masters
ADD COLUMN IF NOT EXISTS popup_fields JSONB;
