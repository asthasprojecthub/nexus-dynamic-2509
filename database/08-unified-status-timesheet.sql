-- Nexus Dashboard unified upgrade: dynamic Inquiry Status Master + Timesheet.
-- Intended for an EXISTING database after database/07-existing-db-latest-upgrade.sql.
-- Idempotent where practical. Back up production data before applying any DB change.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.inquiry_status_masters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status_code VARCHAR(60) NOT NULL UNIQUE,
  status_name VARCHAR(100) NOT NULL UNIQUE,
  behavior VARCHAR(40) NOT NULL DEFAULT 'STANDARD',
  display_order INTEGER NOT NULL DEFAULT 0,
  requires_popup BOOLEAN NOT NULL DEFAULT FALSE,
  reason_options JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.inquiry_status_masters
  (status_code,status_name,behavior,display_order,requires_popup,reason_options)
VALUES
  ('NEW','New','STANDARD',1,FALSE,'[]'::jsonb),
  ('TECH_EVAL','Technical Evaluation','STANDARD',2,FALSE,'[]'::jsonb),
  ('TECH_BOM','Technical BoM Submitted','STANDARD',3,TRUE,'[]'::jsonb),
  ('BOM_APPROVAL','BoM Approval Pending','STANDARD',4,TRUE,'[]'::jsonb),
  ('REVISION','Revision','STANDARD',5,TRUE,'[]'::jsonb),
  ('COMM_BOM','Commercial BOM Submission','STANDARD',6,TRUE,'[]'::jsonb),
  ('ORDER_WON','Order Won','STANDARD',7,TRUE,'[]'::jsonb),
  ('ORDER_LOST','Order Lost','REASON',8,TRUE,'["Price","Commercial","Priority","Timing","Trust Issue","Certification"]'::jsonb),
  ('INQUIRY_HOLD','Inquiry Hold','REASON',9,TRUE,'["Due to Customer","Specification","Technical","Commercial"]'::jsonb)
ON CONFLICT (status_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.timesheet_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(220) NOT NULL,
  description TEXT,
  task_source VARCHAR(30) NOT NULL DEFAULT 'USER',
  source_task_key VARCHAR(180),
  project_id UUID,
  department_id UUID,
  assigned_user_id UUID NOT NULL,
  created_by_id UUID,
  start_date DATE,
  due_date DATE,
  actual_end_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  priority VARCHAR(30) NOT NULL DEFAULT 'Medium',
  estimated_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  actual_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  start_time VARCHAR(10),
  end_time VARCHAR(10),
  remarks TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT timesheet_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT timesheet_tasks_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL,
  CONSTRAINT timesheet_tasks_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT timesheet_tasks_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS timesheet_tasks_project_id_source_task_key_key
  ON public.timesheet_tasks(project_id,source_task_key);
CREATE INDEX IF NOT EXISTS timesheet_tasks_assigned_user_id_start_date_idx
  ON public.timesheet_tasks(assigned_user_id,start_date);
CREATE INDEX IF NOT EXISTS timesheet_tasks_department_id_due_date_idx
  ON public.timesheet_tasks(department_id,due_date);
CREATE INDEX IF NOT EXISTS timesheet_tasks_project_id_idx
  ON public.timesheet_tasks(project_id);

-- Add the new permission catalog rows without touching existing permissions.
INSERT INTO public.permissions (id,permission_key,module,action,is_active,created_at)
SELECT gen_random_uuid(), v.permission_key, v.module, v.action, TRUE, CURRENT_TIMESTAMP
FROM (VALUES
  ('PROJECT_TASKS.VIEW','PROJECT_TASKS','VIEW'),
  ('PROJECT_TASKS.CREATE','PROJECT_TASKS','CREATE'),
  ('PROJECT_TASKS.UPDATE','PROJECT_TASKS','UPDATE'),
  ('PROJECT_TASKS.ASSIGN','PROJECT_TASKS','ASSIGN'),
  ('TIMESHEET.VIEW','TIMESHEET','VIEW'),
  ('TIMESHEET.CREATE','TIMESHEET','CREATE'),
  ('TIMESHEET.UPDATE','TIMESHEET','UPDATE'),
  ('TIMESHEET.ASSIGN','TIMESHEET','ASSIGN'),
  ('TIMESHEET.TEAM_VIEW','TIMESHEET','TEAM_VIEW'),
  ('TIMESHEET_MASTER.VIEW','TIMESHEET_MASTER','VIEW'),
  ('TIMESHEET_MASTER.CREATE','TIMESHEET_MASTER','CREATE'),
  ('TIMESHEET_MASTER.UPDATE','TIMESHEET_MASTER','UPDATE'),
  ('TIMESHEET_MASTER.ASSIGN','TIMESHEET_MASTER','ASSIGN'),
  ('TIMESHEET_MASTER.DELETE','TIMESHEET_MASTER','DELETE')
) AS v(permission_key,module,action)
WHERE NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.permission_key=v.permission_key);

-- Default access for non-admin roles. Admin is treated as organization-wide by the API.
INSERT INTO public.role_permissions (role_id,permission_id)
SELECT r.id,p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_key IN (
  'PROJECT_TASKS.VIEW','PROJECT_TASKS.CREATE','PROJECT_TASKS.UPDATE','PROJECT_TASKS.ASSIGN',
  'TIMESHEET.VIEW','TIMESHEET.CREATE','TIMESHEET.UPDATE','TIMESHEET.ASSIGN','TIMESHEET.TEAM_VIEW',
  'TIMESHEET_MASTER.VIEW','TIMESHEET_MASTER.CREATE','TIMESHEET_MASTER.UPDATE','TIMESHEET_MASTER.ASSIGN'
)
WHERE r.role_code='HOD'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id,permission_id)
SELECT r.id,p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_key IN (
  'PROJECT_TASKS.VIEW','PROJECT_TASKS.UPDATE','PROJECT_TASKS.ASSIGN',
  'TIMESHEET.VIEW','TIMESHEET.CREATE','TIMESHEET.UPDATE','TIMESHEET.ASSIGN','TIMESHEET.TEAM_VIEW'
)
WHERE r.role_code='TL'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id,permission_id)
SELECT r.id,p.id
FROM public.roles r
JOIN public.permissions p ON p.permission_key IN (
  'PROJECT_TASKS.VIEW','TIMESHEET.VIEW','TIMESHEET.CREATE','TIMESHEET.UPDATE','TIMESHEET.TEAM_VIEW'
)
WHERE r.role_code='EMPLOYEE'
ON CONFLICT DO NOTHING;
