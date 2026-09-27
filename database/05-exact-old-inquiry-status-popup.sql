BEGIN;

ALTER TABLE inquiry_status_history
  ADD COLUMN IF NOT EXISTS reason varchar(80),
  ADD COLUMN IF NOT EXISTS additional_remark text,
  ADD COLUMN IF NOT EXISTS customer_comment text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS revision_number integer,
  ADD COLUMN IF NOT EXISTS version_label varchar(40),
  ADD COLUMN IF NOT EXISTS remarks text;

ALTER TABLE inquiry_documents
  ADD COLUMN IF NOT EXISTS status_history_id uuid,
  ADD COLUMN IF NOT EXISTS document_role varchar(20);

CREATE INDEX IF NOT EXISTS ix_inquiry_documents_status_history
  ON inquiry_documents(status_history_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inquiry_documents_status_history_id_fkey'
  ) THEN
    ALTER TABLE inquiry_documents
      ADD CONSTRAINT inquiry_documents_status_history_id_fkey
      FOREIGN KEY (status_history_id)
      REFERENCES inquiry_status_history(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_link varchar(500);

COMMIT;
