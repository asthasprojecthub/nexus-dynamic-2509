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
