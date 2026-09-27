-- Nexus Dashboard patch: Planning Grid versioning + old-style Timesheet fields
CREATE TABLE IF NOT EXISTS planning_grid_versions (
  id uuid PRIMARY KEY,
  version_no integer NOT NULL UNIQUE,
  form_name varchar(160) NOT NULL DEFAULT 'Project Planning Grid',
  statuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  department_tasks jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE timesheet_tasks ADD COLUMN IF NOT EXISTS task_type varchar(50) NOT NULL DEFAULT 'Other';
ALTER TABLE inquiry_status_masters ADD COLUMN IF NOT EXISTS popup_fields jsonb;
