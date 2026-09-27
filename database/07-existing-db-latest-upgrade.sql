-- Nexus Dashboard consolidated upgrade for an EXISTING database.
-- Idempotent where possible. Review/back up before production use.

-- Adds per-user permission overrides without deleting or resetting existing data.
-- Safe to run once on an existing Nexus PostgreSQL database.

CREATE TABLE IF NOT EXISTS user_permissions (
    user_id UUID NOT NULL,
    permission_id UUID NOT NULL,
    is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT user_permissions_pkey PRIMARY KEY (user_id, permission_id),
    CONSTRAINT user_permissions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT user_permissions_permission_id_fkey
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_permissions_permission_id_idx
    ON user_permissions(permission_id);

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

-- Customer list/contact-department update.
-- Safe for an existing nexus_dashboard database. No existing customer rows are deleted.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS city VARCHAR(120);

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS created_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_created_by_fkey'
      AND conrelid = 'customers'::regclass
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS customers_created_by_idx
  ON customers(created_by);

-- Best-effort backfill for old rows using their original CUSTOMER CREATE audit entry.
-- Rows without a matching audit entry remain NULL and display "—" in the UI.
UPDATE customers c
SET created_by = (
  SELECT a.user_id
  FROM audit_logs a
  WHERE a.module = 'CUSTOMERS'
    AND a.action = 'CREATE'
    AND a.record_id = c.id
    AND a.user_id IS NOT NULL
  ORDER BY a.created_at ASC
  LIMIT 1
)
WHERE c.created_by IS NULL
  AND EXISTS (
    SELECT 1
    FROM audit_logs a
    WHERE a.module = 'CUSTOMERS'
      AND a.action = 'CREATE'
      AND a.record_id = c.id
      AND a.user_id IS NOT NULL
  );
