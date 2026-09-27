BEGIN;

-- Hierarchical Document Type Master: e.g. BOM -> Technical / Commercial,
-- Drawing -> SLA / GA. Existing flat document types remain valid root types.
ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS parent_document_type_id UUID;

CREATE INDEX IF NOT EXISTS document_types_parent_document_type_id_idx
  ON public.document_types(parent_document_type_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'document_types_parent_document_type_id_fkey'
      AND conrelid = 'public.document_types'::regclass
  ) THEN
    ALTER TABLE public.document_types
      ADD CONSTRAINT document_types_parent_document_type_id_fkey
      FOREIGN KEY (parent_document_type_id)
      REFERENCES public.document_types(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- Normalized inquiry status history. Current status remains on inquiries.status.
-- Optional documents uploaded in the status popup are stored in documents and
-- inquiry_documents; document_id links the status event to that file too.
CREATE TABLE IF NOT EXISTS public.inquiry_status_history (
  id UUID PRIMARY KEY,
  inquiry_id UUID NOT NULL,
  from_status VARCHAR(60) NOT NULL,
  to_status VARCHAR(60) NOT NULL,
  note TEXT,
  document_id UUID,
  changed_by UUID,
  changed_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT inquiry_status_history_inquiry_id_fkey
    FOREIGN KEY (inquiry_id) REFERENCES public.inquiries(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT inquiry_status_history_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES public.documents(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT inquiry_status_history_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES public.users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS inquiry_status_history_inquiry_id_changed_at_idx
  ON public.inquiry_status_history(inquiry_id, changed_at);

COMMIT;
